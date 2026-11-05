import type { Scene } from './types';

export const emptyScene: Scene = {
  version: 1, kind: '3d', title: 'Make an idea visible',
  description: 'Ask a question, open an example, or bring something you want to understand.',
  parts: [], notes: [],
};

export const pistonScene: Scene = {
  version: 1, kind: '3d', title: 'Inside a piston',
  description: 'A piston slides inside a cylinder. The rod moves with it, carrying that motion out of the cylinder. Select a part to explore its role.',
  parts: [
    { id: 'cylinder', label: 'Cylinder', description: 'The cylindrical bore guides the piston. Shown transparent so you can see the moving parts.', shape: 'cylinder', position: [0, 0, 0], rotation: [0, 0, -Math.PI / 2], dimensions: [1.05, 3.6, 1], color: '#8da7af', opacity: 0.16 },
    { id: 'piston', label: 'Piston', description: 'The piston moves back and forth along the cylinder axis. In an engine, gas pressure can push on its face.', shape: 'cylinder', position: [0, 0, 0], rotation: [0, 0, -Math.PI / 2], dimensions: [0.94, 0.58, 1], color: '#d98256', animation: { type: 'oscillate', axis: 'x', speed: 1.35, amplitude: 0.95 } },
    { id: 'rod', label: 'Piston rod', description: 'This straight rod moves with the piston. It illustrates reciprocating motion; a car engine uses an articulated connecting rod and crankshaft instead.', shape: 'cylinder', position: [2, 0, 0], rotation: [0, 0, -Math.PI / 2], dimensions: [0.19, 3.5, 1], color: '#a8b0ad', animation: { type: 'oscillate', axis: 'x', speed: 1.35, amplitude: 0.95 } },
    { id: 'head', label: 'Cylinder head', description: 'The head closes one end of the cylinder. This simple model omits ports and valves.', shape: 'cylinder', position: [-1.91, 0, 0], rotation: [0, 0, -Math.PI / 2], dimensions: [1.13, 0.2, 1], color: '#344e55' },
    { id: 'base', label: 'Support', description: 'A stationary support holds the cylinder in place in this teaching model.', shape: 'box', position: [-0.15, -1.23, 0], dimensions: [4.45, 0.22, 2.4], color: '#d5cfbf' },
  ],
  notes: ['Hand-authored teaching example. Motion is a sine wave, not a physics simulation.', 'This is a simplified piston-and-rod assembly. Crank linkage, pressure, friction, seals and valves are omitted; proportions are illustrative.'],
};

export const chartScene: Scene = {
  version: 1, kind: 'chart', title: 'When a faster start changes the story',
  description: 'Compare two fictional learning sessions. Both finish at the same score, but their paths are different. Select a line to focus on its values.',
  parts: [],
  chart: {
    type: 'line', xLabel: 'Practice time (minutes)', yLabel: 'Quiz score (%)',
    source: 'Illustrative sample data authored for this example. These are not study results.',
    series: [
      { id: 'visual', label: 'Session A', color: '#c66b42', points: [{ x: 0, y: 20 }, { x: 10, y: 48 }, { x: 20, y: 67 }, { x: 30, y: 79 }, { x: 40, y: 88 }] },
      { id: 'reading', label: 'Session B', color: '#426f7b', points: [{ x: 0, y: 20 }, { x: 10, y: 31 }, { x: 20, y: 49 }, { x: 30, y: 72 }, { x: 40, y: 88 }] },
    ],
  },
  notes: ['The lines connect measured sample points; values between points are not additional observations.', 'No claim about the effectiveness of visual learning is implied by this fictional dataset.'],
};

export const diagramScene: Scene = {
  version: 1, kind: 'diagram', title: 'How a question becomes a picture',
  description: 'Follow the flow from your question to an interactive visual. Select any step and ask what happens there.',
  parts: [],
  diagram: {
    nodes: [
      { id: 'question', label: 'Your question', x: 0, y: 0, color: '#c66b42', description: 'Your words and any explicitly attached screenshot provide context.' },
      { id: 'model', label: 'Reasoning model', x: 240, y: 0, color: '#426f7b', description: 'The model proposes a structured scene: parts, values, labels and relationships.' },
      { id: 'validation', label: 'Scene validation', x: 480, y: 0, color: '#648166', description: 'The application checks the scene against a limited schema. It never executes model-generated JavaScript.' },
      { id: 'visual', label: 'Interactive visual', x: 480, y: 180, color: '#c66b42', description: 'Local rendering turns the accepted scene into a 3D model, a chart, or a diagram.' },
      { id: 'followup', label: 'Point + ask again', x: 240, y: 180, color: '#426f7b', description: 'Selecting a part supplies its identity with your next question, so you can explore one detail.' },
    ],
    edges: [{ from: 'question', to: 'model' }, { from: 'model', to: 'validation' }, { from: 'validation', to: 'visual' }, { from: 'visual', to: 'followup' }, { from: 'followup', to: 'model', label: 'Follow-up' }],
  },
  notes: ['This diagram describes this local application. It is not a reconstruction of another product.'],
};

export const examples: Scene[] = [pistonScene, chartScene, diagramScene];
export const exampleChoices = [
  { id: 'piston', label: 'Explore a piston', scene: pistonScene },
  { id: 'chart', label: 'Read a chart', scene: chartScene },
  { id: 'diagram', label: 'Follow a process', scene: diagramScene },
];
