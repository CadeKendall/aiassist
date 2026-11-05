import { useEffect, useId, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Chart, Diagram, Part, Scene } from '../shared/types';
import './scene.css';

type Props = { scene: Scene; selectedId?: string; onSelect: (id: string) => void; playing: boolean; resetKey?: number };
type MeshPart = { part: Part; object: THREE.Group; materials: THREE.MeshStandardMaterial[]; label?: HTMLButtonElement };

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReduced(query.matches);
    query.addEventListener('change', changed);
    return () => query.removeEventListener('change', changed);
  }, []);
  return reduced;
}

function dimensions(part: Part) {
  return (part.dimensions || [1, 1, 1]).map(n => Math.max(0.001, Math.abs(n))) as [number, number, number];
}

function makePart(part: Part): MeshPart {
  const [x, y, z] = dimensions(part);
  const group = new THREE.Group();
  group.userData.partId = part.id;
  const material = new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.48, metalness: 0.18,
    transparent: (part.opacity ?? 1) < 1, opacity: part.opacity ?? 1, depthWrite: (part.opacity ?? 1) >= 0.5,
    side: THREE.DoubleSide });
  const add = (geometry: THREE.BufferGeometry, offset = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = offset; mesh.userData.partId = part.id;
    group.add(mesh);
  };
  switch (part.shape) {
    case 'box': add(new THREE.BoxGeometry(x, y, z)); break;
    case 'sphere': add(new THREE.SphereGeometry(x, 40, 24)); break;
    case 'cylinder': add(new THREE.CylinderGeometry(x, x, y, 48)); break;
    case 'cone': add(new THREE.ConeGeometry(x, y, 48)); break;
    case 'torus': add(new THREE.TorusGeometry(x, y, 20, 64)); break;
    case 'arrow': {
      const head = x * 0.28, shaft = x - head, radius = x * 0.035;
      add(new THREE.CylinderGeometry(radius, radius, shaft, 16), -head / 2);
      add(new THREE.ConeGeometry(radius * 2.8, head, 24), shaft / 2);
      break;
    }
  }
  group.position.fromArray(part.position);
  if (part.rotation) group.rotation.set(...part.rotation);
  if (part.scale) group.scale.fromArray(part.scale);
  return { part, object: group, materials: [material] };
}

function PartPicker({ parts, selectedId, onSelect }: Pick<Props, 'selectedId' | 'onSelect'> & { parts: Part[] }) {
  return <div className="scene-part-picker" aria-label="Model parts">
    {parts.map(part => <button key={part.id} type="button" aria-pressed={selectedId === part.id}
      className={selectedId === part.id ? 'is-selected' : ''} onClick={() => onSelect(part.id)}
      title={part.description || part.label}>
      <span className="scene-swatch" style={{ backgroundColor: part.color }} />{part.label}
    </button>)}
  </div>;
}

function ModelView({ scene, selectedId, onSelect, playing, resetKey }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const state = useRef({ selectedId, onSelect, playing, reduced: false });
  const reduced = useReducedMotion();
  state.current = { selectedId, onSelect, playing, reduced };
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const refreshRef = useRef<(() => void) | null>(null);
  const retainedView = useRef<{ resetKey: number | undefined; ids: string[]; position: THREE.Vector3; target: THREE.Vector3; elapsed: number } | null>(null);
  useEffect(() => { refreshRef.current?.(); }, [selectedId, playing, reduced]);

  useEffect(() => {
    const host = hostRef.current, labels = labelsRef.current;
    if (!host || !labels || scene.parts.length === 0) return;
    setError('');
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' }); }
    catch { setError('The 3D display could not start. You can still select a part below and ask about it.'); return; }
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-label', `${scene.title}. Drag to rotate, scroll to zoom. Select named parts with the buttons below.`);
    canvas.setAttribute('role', 'img');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    host.appendChild(canvas);
    const world = new THREE.Scene();
    world.add(new THREE.HemisphereLight(0xffffff, 0x8b8275, 2.4));
    const keyLight = new THREE.DirectionalLight(0xfff7ed, 3.1); keyLight.position.set(5, 8, 6); world.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xd7e6f1, 1.8); rimLight.position.set(-5, 3, -5); world.add(rimLight);
    const objects = scene.parts.map(makePart);
    objects.forEach(item => world.add(item.object));
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 2000);
    const box = new THREE.Box3();
    objects.forEach(item => {
      item.object.updateMatrixWorld(true);
      const itemBounds = new THREE.Box3().setFromObject(item.object);
      box.union(itemBounds);
      if (item.part.animation?.type === 'oscillate') {
        const offset = new THREE.Vector3(); offset[item.part.animation.axis] = item.part.animation.amplitude ?? 0.4;
        box.union(itemBounds.clone().translate(offset)); box.union(itemBounds.clone().translate(offset.negate()));
      }
    });
    const center = box.getCenter(new THREE.Vector3());
    const extent = Math.max(box.getSize(new THREE.Vector3()).length(), 1);
    const cameraDirection = new THREE.Vector3(0.55, 0.38, 1).normalize();
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.dampingFactor = 0.1;
    controls.target.copy(center); controls.minDistance = extent * 0.16; controls.maxDistance = extent * 8;
    camera.near = Math.max(0.001, extent / 1000); camera.far = extent * 40;
    const savedView = retainedView.current?.resetKey === resetKey && scene.parts.some(part => retainedView.current?.ids.includes(part.id)) ? retainedView.current : null;
    let firstSize = true, width = 1, height = 1, raf = 0, disposed = false, elapsed = savedView?.elapsed ?? 0, previous = 0, settleFrames = 2;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const projected = new THREE.Vector3();
    const pickables = objects.flatMap(item => item.object.children);
    const labelObjects = objects.slice(0, 12);
    for (const item of labelObjects) {
      const label = document.createElement('button');
      label.type = 'button'; label.className = 'scene-model-label'; label.textContent = item.part.label;
      label.tabIndex = -1; label.setAttribute('aria-hidden', 'true');
      label.addEventListener('click', () => state.current.onSelect(item.part.id));
      labels.appendChild(label); item.label = label;
    }
    const paint = () => {
      for (const item of objects) {
        const selected = state.current.selectedId === item.part.id;
        item.materials.forEach(material => { material.emissive.set(selected ? item.part.color : '#000000'); material.emissiveIntensity = selected ? 0.17 : 0; });
        const animation = item.part.animation;
        if (animation) {
          const value = elapsed * animation.speed + (animation.phase || 0);
          if (animation.type === 'spin') item.object.rotation[animation.axis] = (item.part.rotation?.['xyz'.indexOf(animation.axis)] || 0) + value;
          else item.object.position[animation.axis] = item.part.position['xyz'.indexOf(animation.axis)] + Math.sin(value) * (animation.amplitude ?? 0.4);
        }
      }
      world.updateMatrixWorld(true);
      const occupied: { x: number; y: number; w: number; h: number }[] = [];
      const orderedLabels = [...labelObjects].sort((a, b) => Number(b.part.id === state.current.selectedId) - Number(a.part.id === state.current.selectedId));
      for (const item of orderedLabels) {
        if (!item.label) continue;
        item.object.getWorldPosition(projected); projected.project(camera);
        const visible = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1;
        item.label.hidden = !visible;
        item.label.classList.toggle('is-selected', state.current.selectedId === item.part.id);
        const anchorX = (projected.x * 0.5 + 0.5) * width, anchorY = (-projected.y * 0.5 + 0.5) * height;
        const labelW = item.label.offsetWidth || 90, labelH = item.label.offsetHeight || 25;
        let chosen = { x: anchorX, y: anchorY - 30, w: labelW, h: labelH };
        for (const [dx, dy] of [[0, -32], [0, -65], [0, 24], [0, 57], [-100, -32], [100, -32], [-100, 24], [100, 24]]) {
          const candidate = { x: Math.max(labelW / 2 + 6, Math.min(width - labelW / 2 - 6, anchorX + dx)), y: Math.max(labelH / 2 + 6, Math.min(height - labelH / 2 - 38, anchorY + dy)), w: labelW, h: labelH };
          if (!occupied.some(other => Math.abs(candidate.x - other.x) < (candidate.w + other.w) / 2 + 6 && Math.abs(candidate.y - other.y) < (candidate.h + other.h) / 2 + 5)) { chosen = candidate; break; }
        }
        if (visible) occupied.push(chosen);
        item.label.style.transform = `translate(${chosen.x}px, ${chosen.y}px) translate(-50%, -50%)`;
      }
      renderer.render(world, camera);
    };
    const tick = (now: number) => {
      raf = 0; if (disposed) return;
      const animate = state.current.playing && !state.current.reduced && objects.some(item => item.part.animation);
      if (animate && previous) elapsed += Math.min((now - previous) / 1000, 0.05);
      previous = now;
      const changed = controls.update();
      paint();
      if (animate || changed || settleFrames-- > 0) raf = requestAnimationFrame(tick);
      else previous = 0;
    };
    const refresh = () => { if (!disposed && !raf) { settleFrames = 3; raf = requestAnimationFrame(tick); } };
    refreshRef.current = refresh;
    const resize = () => {
      width = Math.max(1, host.clientWidth); height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false); camera.aspect = width / height;
      if (firstSize) {
        if (savedView) { camera.position.copy(savedView.position); controls.target.copy(savedView.target); }
        else {
          // Fit the projected box, rather than a bounding sphere that wastes space on wide mechanisms.
          const horizontal = new THREE.Vector3(0, 1, 0).cross(cameraDirection).normalize();
          const vertical = cameraDirection.clone().cross(horizontal).normalize();
          const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
          let distance = 0;
          for (const bx of [box.min.x, box.max.x]) for (const by of [box.min.y, box.max.y]) for (const bz of [box.min.z, box.max.z]) {
            const corner = new THREE.Vector3(bx, by, bz).sub(center), depth = corner.dot(cameraDirection);
            distance = Math.max(distance, Math.abs(corner.dot(horizontal)) / (tangent * camera.aspect) + depth, Math.abs(corner.dot(vertical)) / tangent + depth);
          }
          camera.position.copy(center).addScaledVector(cameraDirection, distance * 1.16);
        }
        firstSize = false;
      }
      camera.updateProjectionMatrix(); refresh();
    };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    controls.addEventListener('change', refresh);
    let down: [number, number] | null = null;
    const pointerDown = (event: PointerEvent) => { down = [event.clientX, event.clientY]; };
    const pointerUp = (event: PointerEvent) => {
      if (!down || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 5) { down = null; return; }
      down = null;
      const rect = canvas.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickables, false);
      // An almost-transparent housing should not prevent picking the mechanism inside it.
      const hit = hits.find(result => ((result.object as THREE.Mesh).material as THREE.Material).opacity >= 0.3) || hits[0];
      if (hit?.object.userData.partId) state.current.onSelect(hit.object.userData.partId);
    };
    const contextLost = (event: Event) => { event.preventDefault(); disposed = true; cancelAnimationFrame(raf); setError('The graphics connection was interrupted. Retry the 3D display, or use the part buttons below.'); };
    canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointerup', pointerUp); canvas.addEventListener('webglcontextlost', contextLost);
    return () => {
      retainedView.current = { resetKey, ids: scene.parts.map(part => part.id), position: camera.position.clone(), target: controls.target.clone(), elapsed };
      disposed = true; cancelAnimationFrame(raf); refreshRef.current = null; observer.disconnect(); controls.dispose();
      canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('webglcontextlost', contextLost);
      world.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => material.dispose()); } });
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); labels.replaceChildren();
    };
  }, [scene, resetKey, retry]);

  if (!scene.parts.length) return <div className="scene-empty">
    <svg viewBox="0 0 180 150" aria-hidden="true"><path d="M90 15 150 50 150 115 90 145 30 110 30 45Z M30 45 90 80 150 50 M90 80V145" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="90" cy="80" r="6" fill="currentColor" /></svg>
    <p>Your next question has a shape.</p><span>Start with an example, or describe what you want to understand.</span>
  </div>;

  return <div className="scene-view scene-model">
    <div className="scene-viewport" ref={hostRef}>
      <div className="scene-model-labels" ref={labelsRef} />
      {error ? <div className="scene-render-error" role="status"><strong>3D display unavailable</strong><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Retry display</button></div>
        : <span className="scene-gesture-hint">Drag to rotate · Scroll to zoom</span>}
      {reduced && !error && <span className="scene-motion-note">Motion reduced to match your settings</span>}
    </div>
    <PartPicker parts={scene.parts} selectedId={selectedId} onSelect={onSelect} />
  </div>;
}

function niceDomain(values: number[], includeZero = false): [number, number] {
  let low = Math.min(...values), high = Math.max(...values);
  if (!values.length) return [0, 1];
  if (includeZero) { low = Math.min(0, low); high = Math.max(0, high); }
  if (low === high) { const padding = Math.abs(low) * 0.1 || 1; low -= padding; high += padding; }
  return [low, high];
}
function ticks(domain: [number, number]): number[] {
  const [low, high] = domain, raw = (high - low) / 5;
  const base = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].find(n => n * base >= raw)! * base;
  const output: number[] = [];
  for (let n = Math.ceil(low / step) * step; n <= high + step * 1e-8 && output.length < 20; n += step) output.push(Number(n.toPrecision(12)));
  return output;
}
const tickLabel = (n: number) => Number(n.toPrecision(6)).toLocaleString(undefined, { maximumSignificantDigits: 6 });
function activate(event: React.KeyboardEvent, action: () => void) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action(); } }

function ChartView({ chart, selectedId, onSelect }: { chart: Chart } & Pick<Props, 'selectedId' | 'onSelect'>) {
  const id = useId().replace(/:/g, '');
  const all = chart.series.flatMap(series => series.points);
  if (!all.length) return <div className="scene-empty"><p>No data points yet.</p><span>Ask for a dataset with x and y values.</span></div>;
  const W = 780, H = 450, left = 86, right = 40, top = 32, bottom = 76;
  const xDomain = niceDomain(all.map(point => point.x)), yDomain = niceDomain(all.map(point => point.y), chart.type === 'bar');
  const xPadding = chart.type === 'bar' ? (xDomain[1] - xDomain[0]) * 0.12 : (xDomain[1] - xDomain[0]) * 0.04;
  xDomain[0] -= xPadding; xDomain[1] += xPadding;
  const yPadding = (yDomain[1] - yDomain[0]) * 0.08;
  if (yDomain[0] !== 0 || chart.type !== 'bar') yDomain[0] -= yPadding;
  if (yDomain[1] !== 0 || chart.type !== 'bar') yDomain[1] += yPadding;
  const x = (value: number) => left + (value - xDomain[0]) / (xDomain[1] - xDomain[0]) * (W - left - right);
  const y = (value: number) => H - bottom - (value - yDomain[0]) / (yDomain[1] - yDomain[0]) * (H - top - bottom);
  const xs = [...new Set(all.map(point => point.x))].sort((a, b) => a - b);
  const xGap = xs.length > 1 ? Math.min(...xs.slice(1).map((value, index) => x(value) - x(xs[index]))) : 100;
  const barWidth = Math.max(1, Math.min(54, xGap * 0.72 / Math.max(1, chart.series.length)));
  const showValues = all.length <= 20;
  const hasSelectedSeries = chart.series.some(series => series.id === selectedId);
  return <div className="scene-view scene-chart">
    <div className="scene-chart-legend" aria-label="Chart series">{chart.series.map(series => <button type="button" key={series.id} aria-pressed={selectedId === series.id} onClick={() => onSelect(series.id)} className={selectedId === series.id ? 'is-selected' : ''}><span className="scene-swatch" style={{ backgroundColor: series.color }} />{series.label}</button>)}</div>
    <div className="scene-chart-plot">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${chart.type} chart. ${chart.xLabel} versus ${chart.yLabel}. Exact values are available in the data table.`}>
        <defs><clipPath id={`plot-${id}`}><rect x={left} y={top} width={W - left - right} height={H - top - bottom} /></clipPath></defs>
        {ticks(yDomain).map(value => <g key={value}><line className="scene-grid-line" x1={left} x2={W - right} y1={y(value)} y2={y(value)} /><text className="scene-axis-tick" x={left - 13} y={y(value) + 4} textAnchor="end">{tickLabel(value)}</text></g>)}
        {ticks(xDomain).map(value => <g key={value}><line className="scene-axis-line" x1={x(value)} x2={x(value)} y1={H - bottom} y2={H - bottom + 5} /><text className="scene-axis-tick" x={x(value)} y={H - bottom + 25} textAnchor="middle">{tickLabel(value)}</text></g>)}
        <path className="scene-axis-line" d={`M${left},${top}V${H - bottom}H${W - right}`} />
        {chart.type === 'bar' && <line className="scene-zero-line" x1={left} x2={W - right} y1={y(0)} y2={y(0)} />}
        <text className="scene-axis-title" x={(left + W - right) / 2} y={H - 17} textAnchor="middle">{chart.xLabel}</text>
        <text className="scene-axis-title" transform={`translate(22 ${(top + H - bottom) / 2}) rotate(-90)`} textAnchor="middle">{chart.yLabel}</text>
        <g clipPath={`url(#plot-${id})`}>{chart.series.map((series, seriesIndex) => <g key={series.id} className="scene-series" role="button" tabIndex={0} aria-label={`Select ${series.label}, ${series.points.length} points`} aria-pressed={selectedId === series.id} onClick={() => onSelect(series.id)} onKeyDown={event => activate(event, () => onSelect(series.id))} opacity={hasSelectedSeries && selectedId !== series.id ? 0.28 : 1}>
          {chart.type === 'line' && <path d={series.points.map((point, i) => `${i ? 'L' : 'M'}${x(point.x)} ${y(point.y)}`).join(' ')} fill="none" stroke={series.color} strokeWidth={selectedId === series.id ? 4 : 2.7} strokeLinejoin="round" />}
          {series.points.map((point, index) => {
            const px = x(point.x) + (chart.type === 'bar' ? (seriesIndex - (chart.series.length - 1) / 2) * barWidth : 0), py = y(point.y);
            const exact = `${series.label}${point.label ? ` · ${point.label}` : ''}: ${chart.xLabel} ${point.x}, ${chart.yLabel} ${point.y}`;
            return <g key={`${point.x}-${index}`}>
              <title>{exact}</title>
              {chart.type === 'bar' ? <rect x={px - barWidth / 2} y={Math.min(py, y(0))} width={barWidth - Math.min(2, barWidth * 0.1)} height={Math.max(Math.abs(y(0) - py), 1)} fill={series.color} rx={2} /> : <circle cx={px} cy={py} r={chart.type === 'scatter' ? 6 : 4.7} fill={series.color} stroke="#faf8f2" strokeWidth={2} />}
              {(showValues || selectedId === series.id) && <text className="scene-point-value" x={px} y={py + (point.y < 0 && chart.type === 'bar' ? 20 : -12 - (chart.type === 'line' ? seriesIndex * 12 : 0))} textAnchor="middle" fill={series.color}>{String(point.y)}</text>}
            </g>;
          })}
        </g>)}</g>
      </svg>
    </div>
    <p className="scene-data-source"><strong>Source</strong> {chart.source || 'No source supplied.'}</p>
    <details className="scene-data-details"><summary>View exact data · {all.length} points</summary><div className="scene-table-scroll"><table><caption>Values supplied to this chart, without interpolation</caption><thead><tr><th scope="col">Series</th><th scope="col">{chart.xLabel}</th><th scope="col">{chart.yLabel}</th><th scope="col">Label</th></tr></thead><tbody>{chart.series.flatMap(series => series.points.map((point, index) => <tr key={`${series.id}-${index}`} className={selectedId === series.id ? 'is-selected' : ''}><th scope="row">{series.label}</th><td>{String(point.x)}</td><td>{String(point.y)}</td><td>{point.label || '—'}</td></tr>))}</tbody></table></div></details>
  </div>;
}

function DiagramView({ diagram, selectedId, onSelect }: { diagram: Diagram } & Pick<Props, 'selectedId' | 'onSelect'>) {
  const marker = `arrow-${useId().replace(/:/g, '')}`;
  const W = 800, H = 460, nodeW = 160, nodeH = 64;
  if (!diagram.nodes.length) return <div className="scene-empty"><p>No steps yet.</p><span>Describe the process you want to see.</span></div>;
  const xDomain = niceDomain(diagram.nodes.map(node => node.x)), yDomain = niceDomain(diagram.nodes.map(node => node.y));
  const positions = new Map(diagram.nodes.map(node => [node.id, { x: 112 + (node.x - xDomain[0]) / (xDomain[1] - xDomain[0]) * (W - 224), y: 80 + (node.y - yDomain[0]) / (yDomain[1] - yDomain[0]) * (H - 160) }]));
  return <div className="scene-view scene-diagram"><div className="scene-diagram-plot"><svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Interactive process diagram. Select a step to ask about it.">
    <defs><marker id={marker} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 8 4 0 8Z" fill="#8d948e" /></marker></defs>
    {diagram.edges.map((edge, index) => {
      const start = positions.get(edge.from), end = positions.get(edge.to); if (!start || !end) return null;
      const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
      if (length < 1) return null;
      const t = Math.min(nodeW / 2 / (Math.abs(dx) || 1e-6), nodeH / 2 / (Math.abs(dy) || 1e-6));
      const x1 = start.x + dx * t, y1 = start.y + dy * t, x2 = end.x - dx * t - dx / length * 5, y2 = end.y - dy * t - dy / length * 5;
      return <g key={`${edge.from}-${edge.to}-${index}`}><path className="scene-diagram-edge" d={`M${x1} ${y1}L${x2} ${y2}`} markerEnd={`url(#${marker})`} /><title>{diagram.nodes.find(node => node.id === edge.from)?.label} to {diagram.nodes.find(node => node.id === edge.to)?.label}{edge.label ? `: ${edge.label}` : ''}</title>{edge.label && <text className="scene-edge-label" x={(x1 + x2) / 2 + (Math.abs(dx) < 1 ? 14 : 0)} y={(y1 + y2) / 2 - 10} textAnchor={Math.abs(dx) < 1 ? 'start' : 'middle'}>{edge.label}</text>}</g>;
    })}
    {diagram.nodes.map((node, index) => {
      const p = positions.get(node.id)!;
      const words = node.label.split(/\s+/), lines: string[] = []; let line = '';
      for (const word of words) { if ((line + ' ' + word).trim().length > 20 && line) { lines.push(line); line = word; } else line = (line + ' ' + word).trim(); } if (line) lines.push(line);
      return <g className={`scene-diagram-node ${selectedId === node.id ? 'is-selected' : ''}`} key={node.id} transform={`translate(${p.x} ${p.y})`} role="button" tabIndex={0} aria-label={`${node.label}${node.description ? `. ${node.description}` : ''}`} aria-pressed={selectedId === node.id} onClick={() => onSelect(node.id)} onKeyDown={event => activate(event, () => onSelect(node.id))}>
        <title>{node.description || node.label}</title><rect x={-nodeW / 2} y={-nodeH / 2} width={nodeW} height={nodeH} rx="9" fill="#fffcf6" stroke={node.color} strokeWidth={selectedId === node.id ? 3 : 1.4} />
        <circle cx={-nodeW / 2 + 14} cy={-nodeH / 2 + 13} r="3" fill={node.color} />
        <text className="scene-node-number" x={nodeW / 2 - 12} y={-nodeH / 2 + 17} textAnchor="end">{String(index + 1).padStart(2, '0')}</text>
        <text className="scene-node-title" textAnchor="middle">{lines.slice(0, 2).map((text, i) => <tspan x="0" dy={i === 0 ? (lines.length > 1 ? 1 : 6) : 18} key={i}>{text.length > 22 ? text.slice(0, 21) + '…' : text}</tspan>)}</text>
      </g>;
    })}
  </svg></div><div className="scene-part-picker" aria-label="Diagram steps">{diagram.nodes.map(node => <button type="button" key={node.id} aria-pressed={selectedId === node.id} className={selectedId === node.id ? 'is-selected' : ''} onClick={() => onSelect(node.id)}><span className="scene-swatch" style={{ backgroundColor: node.color }} />{node.label}</button>)}</div></div>;
}

export function SceneView(props: Props) {
  if (props.scene.kind === 'chart' && props.scene.chart) return <ChartView chart={props.scene.chart} selectedId={props.selectedId} onSelect={props.onSelect} />;
  if (props.scene.kind === 'diagram' && props.scene.diagram) return <DiagramView diagram={props.scene.diagram} selectedId={props.selectedId} onSelect={props.onSelect} />;
  return <ModelView {...props} />;
}
