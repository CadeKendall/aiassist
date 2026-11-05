import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { AppEvent, Connection, Lesson, LessonSummary, Scene, ScreenSource } from '../shared/types';
import { exampleChoices, emptyScene } from '../shared/examples';
import { SceneView } from './SceneView';
import { isDesktop, studio } from './browserBridge';
import { createVoiceInput } from './voice';
import type { VoiceInput } from './voice';
import './app.css';

type IconName = 'plus' | 'arrow' | 'stop' | 'play' | 'pause' | 'reset' | 'library' | 'save' | 'import' | 'export' | 'close' | 'screen' | 'mic' | 'volume' | 'pin' | 'trash' | 'check';
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="m5 12 14 0m-6-6 6 6-6 6" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="1" />,
    play: <path d="m8 5 11 7-11 7z" />,
    pause: <path d="M8 5v14M16 5v14" />,
    reset: <><path d="M5 9a8 8 0 1 1-1 6M5 4v5h5" /></>,
    library: <><path d="M4 4h4v16H4zM11 4h3v16h-3zM17 5l3-1 4 15-3 1z" /></>,
    save: <><path d="M5 3h13l3 3v15H3V3zM7 3v6h10V3M7 21v-8h10v8" /></>,
    import: <><path d="M4 15v5h16v-5M12 3v12m-5-5 5 5 5-5" /></>,
    export: <><path d="M4 15v5h16v-5M12 15V3m-5 5 5-5 5 5" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    screen: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
    mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v3M8 21h8" /></>,
    volume: <><path d="m11 4-6 5H2v6h3l6 5zM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14" /></>,
    pin: <><path d="m8 3 8 0-1 6 4 4v2H5v-2l4-4zM12 15v7" /></>,
    trash: <><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const clone = <T,>(value: T): T => structuredClone(value);
const newLesson = (scene: Scene = emptyScene): Lesson => ({ id: crypto.randomUUID(), title: scene.title || 'Untitled lesson', updatedAt: new Date().toISOString(), scene: clone(scene), messages: [] });
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const hasContent = (lesson: Lesson) => Boolean(lesson.messages.length || lesson.scene.parts.length || lesson.scene.chart || lesson.scene.diagram?.nodes.length);

export default function App() {
  const [lesson, setLesson] = useState<Lesson>(() => newLesson(exampleChoices[0]?.scene || emptyScene));
  const lessonRef = useRef(lesson);
  const [connection, setConnection] = useState<Connection>({ state: 'disconnected', message: isDesktop ? 'Connect to your AI Assist account to ask a question.' : 'Browser preview · examples and local lessons work offline.' });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [switching, setSwitching] = useState(false);
  const [prompt, setPrompt] = useState('');
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState(false);
  const dirtyRef = useRef(true);
  const [example, setExample] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string>();
  const [screens, setScreens] = useState<ScreenSource[]>([]);
  const [screenOpen, setScreenOpen] = useState(false);
  const [screenLoading, setScreenLoading] = useState(false);
  const [attachment, setAttachment] = useState<{ data: string; name: string }>();
  const [onTop, setOnTop] = useState(false);
  const [narrate, setNarrate] = useState(false);
  const narrateRef = useRef(false);
  const [speaking, setSpeaking] = useState<'idle' | 'speaking' | 'paused'>('idle');
  const [listening, setListening] = useState(false);
  const voiceRef = useRef<VoiceInput | null>(null);
  const activeReply = useRef<string | undefined>(undefined);
  const conversationEnd = useRef<HTMLDivElement>(null);
  const libraryDialog = useRef<HTMLDialogElement>(null);
  const screenDialog = useRef<HTMLDialogElement>(null);
  const locked = busy || switching;
  const scene = lesson.scene;
  const selected = scene.parts.find(part => part.id === selectedId) || scene.diagram?.nodes.find(node => node.id === selectedId) || scene.chart?.series.find(series => series.id === selectedId);
  const lastReply = [...lesson.messages].reverse().find(message => message.role === 'assistant' && message.text)?.text;

  function updateLesson(update: (current: Lesson) => Lesson) {
    const next = update(lessonRef.current);
    lessonRef.current = next;
    dirtyRef.current = true;
    setLesson(next);
    setSaved(false);
  }

  async function refreshLibrary() {
    setLibraryLoading(true);
    try { setLessons(await studio.listLessons()); }
    catch (problem) { setError(errorText(problem)); }
    finally { setLibraryLoading(false); }
  }

  async function persist(quiet = false) {
    const current = lessonRef.current;
    if (!hasContent(current)) return;
    const snapshot = { ...current, updatedAt: new Date().toISOString() };
    await studio.saveLesson(snapshot);
    if (lessonRef.current === current) {
      lessonRef.current = snapshot;
      setLesson(snapshot);
      dirtyRef.current = false;
      setSaved(true);
    }
    if (!quiet) setNotice('Lesson saved on this device.');
  }

  function stopSpeech() { window.speechSynthesis?.cancel(); setSpeaking('idle'); }
  function readAloud(text: string) {
    if (!('speechSynthesis' in window)) { setNotice('Speech playback is not available on this device.'); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.onend = () => setSpeaking('idle');
    utterance.onerror = () => setSpeaking('idle');
    setSpeaking('speaking');
    window.speechSynthesis.speak(utterance);
  }

  useEffect(() => {
    const off = studio.onEvent((event: AppEvent) => {
      if (event.type === 'connection') { setConnection(event.connection); if (event.connection.state === 'error') setError(event.connection.message); return; }
      if (event.type === 'focus') { promptRef.current?.focus(); return; }
      if (event.type === 'error') {
        setError(event.message);
        return;
      }
      if (!busyRef.current) return;
      if (event.type === 'thread') updateLesson(current => ({ ...current, threadId: event.threadId }));
      if (event.type === 'scene') {
        updateLesson(current => ({ ...current, scene: event.scene, title: event.scene.title }));
        setExample(false);
      }
      if (event.type === 'delta' && activeReply.current) {
        const id = activeReply.current;
        updateLesson(current => ({ ...current, messages: current.messages.map(message => message.id === id ? { ...message, text: message.text + event.text } : message) }));
      }
      if (event.type === 'done') {
        const reply = lessonRef.current.messages.find(message => message.id === activeReply.current)?.text;
        busyRef.current = false; setBusy(false); activeReply.current = undefined;
        if (/cancel|interrupt/i.test(event.status)) setNotice('Stopped. Your current visual and reply are kept.');
        else if (/fail|error/i.test(event.status)) setError(previous => previous || 'The reply did not finish. You can ask AI Assist to continue.');
        if (reply && narrateRef.current && !/cancel|interrupt|fail|error/i.test(event.status)) readAloud(reply);
        void persist(true).catch(problem => setError(`Could not save this lesson: ${errorText(problem)}`));
      }
    });
    return () => { off(); window.speechSynthesis?.cancel(); voiceRef.current?.abort(); };
  }, []);

  useEffect(() => { narrateRef.current = narrate; }, [narrate]);
  useEffect(() => { conversationEnd.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); }, [lesson.messages, busy]);
  useEffect(() => {
    if (selectedId && !selected) setSelectedId(undefined);
  }, [scene, selectedId, selected]);
  useEffect(() => {
    const dialog = libraryDialog.current;
    if (libraryOpen && dialog && !dialog.open) { dialog.showModal(); void refreshLibrary(); }
    else if (!libraryOpen && dialog?.open) dialog.close();
  }, [libraryOpen]);
  useEffect(() => {
    const dialog = screenDialog.current;
    if (screenOpen && dialog && !dialog.open) dialog.showModal();
    else if (!screenOpen && dialog?.open) dialog.close();
  }, [screenOpen]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!busyRef.current) void persist().catch(problem => setError(errorText(problem)));
      }
      if (event.key === 'Escape' && listening) voiceRef.current?.stop();
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [listening]);

  async function connect() {
    setError('');
    setConnection({ state: 'connecting', message: 'Connecting to AI Assist…' });
    try { const result = await studio.connect(); setConnection(result); if (result.state === 'error') setError(result.message); }
    catch (problem) { const message = errorText(problem); setConnection({ state: 'error', message }); setError(message); }
  }

  async function ask(event?: FormEvent) {
    event?.preventDefault();
    const text = prompt.trim();
    if (!text || busyRef.current || switching) return;
    if (connection.state !== 'ready') { setError(isDesktop ? 'Connect to AI Assist first, then send your question.' : 'Live AI Assist needs the desktop app. The examples here are interactive and work offline.'); return; }
    voiceRef.current?.stop(); stopSpeech(); setError(''); setNotice('');
    const current = lessonRef.current;
    const request = { text, scene: current.scene, selectedId, threadId: current.threadId, imageDataUrl: attachment?.data };
    const replyId = crypto.randomUUID();
    activeReply.current = replyId; busyRef.current = true; setBusy(true);
    updateLesson(previous => ({ ...previous, messages: [...previous.messages, { id: crypto.randomUUID(), role: 'user', text: text + (attachment ? `\n[Attached screen: ${attachment.name}]` : '') }, { id: replyId, role: 'assistant', text: '' }] }));
    setPrompt(''); setAttachment(undefined); setExample(false);
    try { await studio.ask(request); }
    catch (problem) {
      busyRef.current = false; setBusy(false); activeReply.current = undefined;
      setError(errorText(problem)); setPrompt(text);
    }
  }

  async function cancel() {
    try { await studio.cancel(); }
    catch (problem) { setError(errorText(problem)); }
  }

  async function switchLesson(getNext: () => Promise<Lesson> | Lesson, isExample = false) {
    if (busyRef.current || switching) return;
    setSwitching(true); setError(''); stopSpeech(); voiceRef.current?.abort();
    try {
      if (dirtyRef.current) await persist(true);
      const next = await getNext();
      lessonRef.current = next; setLesson(next);
      dirtyRef.current = isExample || !hasContent(next); setSaved(!dirtyRef.current);
      setSelectedId(undefined); setPrompt(''); setAttachment(undefined); setExample(isExample);
      setResetKey(value => value + 1); setLibraryOpen(false); setDeleteId(undefined); setNotice('');
      promptRef.current?.focus();
    } catch (problem) { setError(errorText(problem)); }
    finally { setSwitching(false); }
  }

  async function importLesson() {
    if (locked) return;
    setError('');
    try {
      const imported = await studio.importLesson();
      if (imported) await switchLesson(async () => {
        const next = { ...imported, id: crypto.randomUUID(), updatedAt: new Date().toISOString() };
        await studio.saveLesson(next);
        return next;
      });
    } catch (problem) { setError(errorText(problem)); }
  }

  async function removeLesson(id: string) {
    try {
      await studio.deleteLesson(id);
      setDeleteId(undefined);
      if (lessonRef.current.id === id) {
        const next = newLesson(); lessonRef.current = next; setLesson(next); setSaved(false); dirtyRef.current = false;
        setSelectedId(undefined); setExample(false); setPrompt(''); setAttachment(undefined);
      }
      await refreshLibrary();
    } catch (problem) { setError(errorText(problem)); }
  }

  async function showScreens() {
    setScreenOpen(true); setScreenLoading(true); setScreens([]); setError('');
    try { setScreens(await studio.listScreens()); }
    catch (problem) { setError(errorText(problem)); setScreenOpen(false); }
    finally { setScreenLoading(false); }
  }
  async function attachScreen(source: ScreenSource) {
    setScreenLoading(true);
    try { setAttachment({ data: await studio.captureScreen(source.id), name: source.name }); setScreenOpen(false); promptRef.current?.focus(); }
    catch (problem) { setError(errorText(problem)); }
    finally { setScreenLoading(false); }
  }
  async function toggleOnTop() {
    try { await studio.setAlwaysOnTop(!onTop); setOnTop(value => !value); }
    catch (problem) { setError(errorText(problem)); }
  }
  function toggleVoice() {
    if (listening) { voiceRef.current?.stop(); return; }
    const recognition = createVoiceInput();
    if (!recognition) { setNotice('Voice input is not supported here. Focus the question field and press Windows + H to dictate.'); promptRef.current?.focus(); return; }
    const before = prompt.trim();
    recognition.lang = navigator.language;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = event => {
      const words = Array.from(event.results).map(result => result[0].transcript).join(' ');
      setPrompt([before, words].filter(Boolean).join(' '));
    };
    recognition.onerror = event => { setListening(false); setNotice(`Voice input could not start (${event.error}). You can type, or use Windows + H in the question field.`); };
    recognition.onend = () => setListening(false);
    voiceRef.current = recognition;
    try { recognition.start(); setListening(true); setNotice('Listening. Review your words before sending.'); }
    catch { setNotice('Voice input is unavailable. Use Windows + H in the question field, or type.'); }
  }

  return <div className="studio-app">
    <header className="app-toolbar">
      <div className="brand" aria-label="AI Assist"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span><strong>AI Assist</strong></span></div>
      <div className="toolbar-actions">
        <button className="quiet-button" onClick={() => void switchLesson(() => newLesson())} disabled={locked}><Icon name="plus" /><span>New lesson</span></button>
        <button className="quiet-button" onClick={() => setLibraryOpen(true)} disabled={locked}><Icon name="library" /><span>Library</span></button>
        <span className="toolbar-rule" />
        <button className={`icon-button ${onTop ? 'is-active' : ''}`} aria-label="Keep window on top" title={isDesktop ? 'Keep window on top' : 'Keep on top requires the desktop app'} aria-pressed={onTop} disabled={!isDesktop} onClick={() => void toggleOnTop()}><Icon name="pin" /></button>
        <button className={`connection-button ${connection.state}`} onClick={() => void connect()} disabled={connection.state === 'connecting' || busy} title={connection.message}><span className="status-dot" /><span>{connection.state === 'ready' ? 'AI Assist connected' : connection.state === 'connecting' ? 'Connecting…' : connection.state === 'error' ? 'Reconnect AI Assist' : isDesktop ? 'Connect AI Assist' : 'Offline preview'}</span></button>
      </div>
    </header>

    {(error || notice) && <div className={`message-bar ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}><span>{error || notice}</span><button className="icon-button" aria-label="Dismiss message" onClick={() => { setError(''); setNotice(''); }}><Icon name="close" size={15} /></button></div>}

    <main className="workbench">
      <section className="visual-workspace" aria-label="Visual explanation">
        <div className="scene-heading">
          <div className="eyebrow"><span className="tiny-cross">+</span> THE EXPLORATION SPACE <span className="scene-type">{scene.kind === '3d' ? '3D MODEL' : scene.kind === 'chart' ? 'DATA VIEW' : 'DIAGRAM'}</span></div>
          <div className="scene-title-row"><h1>{scene.title || 'Make something make sense.'}</h1>{example && <span className="example-badge">Example</span>}</div>
          <p>{scene.description || 'Ask a question. Explore the answer.'}</p>
        </div>
        <div className="canvas-shell">
          <SceneView scene={scene} selectedId={selectedId} onSelect={setSelectedId} playing={playing} resetKey={resetKey} />
          {busy && <div className="canvas-working" role="status"><span className="working-dot" /> Building your explanation…</div>}
        </div>
        <div className="canvas-commandbar">
          <div className="view-controls">
            <button className="quiet-button" disabled={scene.kind !== '3d'} onClick={() => setPlaying(value => !value)} aria-pressed={playing}><Icon name={playing ? 'pause' : 'play'} size={15} /><span>{playing ? 'Pause' : 'Play'}</span></button>
            <button className="quiet-button" onClick={() => setResetKey(value => value + 1)}><Icon name="reset" size={15} /><span>Reset view</span></button>
          </div>
          <span className="canvas-hint">{scene.kind === '3d' ? 'Drag to orbit · scroll to zoom · click to explore' : 'Select an element to ask about it'}</span>
          <button className="quiet-button save-button" onClick={() => void persist().catch(problem => setError(errorText(problem)))} disabled={locked || !hasContent(lesson)} title="Save lesson (Ctrl+S)"><Icon name={saved ? 'check' : 'save'} size={15} /><span>{saved ? 'Saved' : 'Save'}</span></button>
        </div>
        {scene.notes.length > 0 && <details className="visual-notes"><summary>About this {scene.kind === '3d' ? 'model' : 'visual'} <span>{scene.notes.length} {scene.notes.length === 1 ? 'note' : 'notes'}</span></summary><ul>{scene.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></details>}
        <div className="example-strip"><span>TRY AN EXAMPLE</span>{exampleChoices.map(item => <button key={item.id} disabled={locked} onClick={() => void switchLesson(() => newLesson(item.scene), true)}>{item.label}<span aria-hidden="true">↗</span></button>)}</div>
      </section>

      <aside className="discussion" aria-label="Discussion and selected part">
        <div className="discussion-heading"><div><span className="eyebrow">LET’S UNDERSTAND IT</span><h2>Conversation</h2></div><span className="turn-count">{Math.ceil(lesson.messages.length / 2).toString().padStart(2, '0')}</span></div>
        <div className="conversation-scroll" role="log" aria-label="Conversation" aria-live="off">
          {lesson.messages.length === 0 ? <div className="conversation-intro"><div className="intro-mark" aria-hidden="true">↗</div><h3>A little curiosity.<br />A clearer picture.</h3><p>Ask about an idea, then explore it as a model, a chart, or a diagram.</p><p className="muted">Click a part to bring it into the conversation.</p><div className="starter-questions"><span>A PLACE TO START</span>{['Explain what I’m looking at.', 'What changes if we speed it up?', 'Show the same idea as a diagram.'].map(question => <button key={question} disabled={locked} onClick={() => { setPrompt(question); promptRef.current?.focus(); }}>{question}<Icon name="arrow" size={15} /></button>)}</div></div> : lesson.messages.map(message => <article className={`chat-message ${message.role}`} key={message.id}><div className="message-author">{message.role === 'user' ? 'YOU' : 'AI ASSIST'}{message.role === 'assistant' && activeReply.current === message.id && busy && <span className="reply-indicator">thinking</span>}</div><div className="message-text">{message.text || (busy && activeReply.current === message.id ? <span className="thinking">Making connections<span>…</span></span> : <span className="muted">No text reply was returned.</span>)}</div></article>)}
          <div ref={conversationEnd} />
        </div>
        {selected && <section className="selection-panel" aria-label="Selected element"><div className="selection-label"><span className="selection-dot" /> IN FOCUS<button className="icon-button" aria-label="Clear selection" onClick={() => setSelectedId(undefined)}><Icon name="close" size={14} /></button></div><h3>{selected.label}</h3>{'description' in selected && selected.description && <p>{selected.description}</p>}<button className="text-action" disabled={locked} onClick={() => { setPrompt(`Explain ${selected.label} and its role in this visual.`); promptRef.current?.focus(); }}>Ask about this <Icon name="arrow" size={14} /></button></section>}
        <div className="narration-bar"><label className="toggle-label"><input type="checkbox" checked={narrate} onChange={event => { setNarrate(event.target.checked); if (!event.target.checked) stopSpeech(); }} /><Icon name="volume" size={15} /><span>Read replies aloud</span></label>{speaking === 'idle' ? <button className="icon-button" aria-label="Read last reply aloud" title="Read last reply" disabled={!lastReply || busy} onClick={() => lastReply && readAloud(lastReply)}><Icon name="play" size={14} /></button> : <div className="speech-controls"><button className="icon-button" aria-label={speaking === 'paused' ? 'Resume narration' : 'Pause narration'} onClick={() => { if (speaking === 'paused') { window.speechSynthesis.resume(); setSpeaking('speaking'); } else { window.speechSynthesis.pause(); setSpeaking('paused'); } }}><Icon name={speaking === 'paused' ? 'play' : 'pause'} size={14} /></button><button className="icon-button" aria-label="Stop narration" onClick={stopSpeech}><Icon name="stop" size={14} /></button></div>}</div>
      </aside>
    </main>

    <footer className="composer-area">
      <form className={`composer ${busy ? 'is-busy' : ''}`} onSubmit={event => void ask(event)}>
        {attachment && <div className="attachment"><img src={attachment.data} alt={`Pending screenshot of ${attachment.name}`} /><div><strong>{attachment.name}</strong><span>Attached to your next question only</span></div><button type="button" className="icon-button" aria-label="Remove screenshot" onClick={() => setAttachment(undefined)}><Icon name="close" size={15} /></button></div>}
        <div className="prompt-row"><label className="sr-only" htmlFor="question">Ask AI Assist to explain something visually</label><textarea ref={promptRef} id="question" maxLength={20000} value={prompt} onChange={event => setPrompt(event.target.value)} disabled={switching} placeholder={selected ? `What would you like to know about ${selected.label}?` : 'What would you like to understand?'} rows={2} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(); } }} /><button className={busy ? 'send-button stop-button' : 'send-button'} type={busy ? 'button' : 'submit'} onClick={busy ? () => void cancel() : undefined} disabled={!busy && (!prompt.trim() || switching)}><span>{busy ? 'Stop' : 'Ask AI Assist'}</span><Icon name={busy ? 'stop' : 'arrow'} size={18} /></button></div>
        <div className="composer-tools"><div><button type="button" className="quiet-button" disabled={locked || !isDesktop} title={isDesktop ? 'Choose a screen to attach' : 'Screen capture requires the desktop app'} onClick={() => void showScreens()}><Icon name="screen" size={16} /><span>Attach screen</span></button><button type="button" className={`quiet-button ${listening ? 'is-listening' : ''}`} disabled={locked} aria-pressed={listening} onClick={toggleVoice}><Icon name="mic" size={16} /><span>{listening ? 'Stop listening' : 'Dictate'}</span></button>{selected && <span className="context-tag">About {selected.label}</span>}</div><span className="keyboard-hint">Enter to send <span>·</span> Shift + Enter for a new line</span></div>
      </form>
      <div className="footer-meta"><span>{isDesktop ? 'Rendering runs locally. Requests include your current visual.' : 'Offline browser preview. Live questions require the desktop app.'}</span><span>{connection.state === 'ready' && connection.model ? connection.model : 'Explore. Question. Understand.'}</span></div>
    </footer>

    <dialog ref={libraryDialog} className="library-dialog" onCancel={() => setLibraryOpen(false)} onClick={event => { if (event.target === event.currentTarget) setLibraryOpen(false); }} aria-labelledby="library-title"><div className="dialog-inner"><div className="dialog-heading"><div><span className="eyebrow">YOUR COLLECTION</span><h2 id="library-title">Saved lessons</h2></div><button className="icon-button" aria-label="Close library" onClick={() => setLibraryOpen(false)}><Icon name="close" /></button></div><p className="dialog-description">Pick up a thought where you left it. Lessons are stored on this device.</p><div className="library-tools"><button className="quiet-button" disabled={locked} onClick={() => void importLesson()}><Icon name="import" size={16} />Import JSON</button><button className="quiet-button" disabled={locked || !hasContent(lesson)} onClick={() => void studio.exportLesson(lessonRef.current).then(ok => { if (ok) setNotice('Lesson exported.'); }).catch(problem => setError(errorText(problem)))}><Icon name="export" size={16} />Export current</button></div>{error && <p className="dialog-error" role="alert">{error}</p>}<div className="lesson-list">{libraryLoading ? <p className="library-empty">Opening your library…</p> : lessons.length === 0 ? <div className="library-empty"><Icon name="library" size={30} /><h3>A home for your discoveries.</h3><p>Save a visual or ask your first question to start a collection.</p></div> : lessons.map(item => <div className="lesson-row" key={item.id}><button className="lesson-open" disabled={locked} onClick={() => void switchLesson(() => studio.loadLesson(item.id))}><strong>{item.title}</strong><span>{new Date(item.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}{item.id === lesson.id ? ' · Open now' : ''}</span></button>{deleteId === item.id ? <div className="delete-confirm"><span>Delete?</span><button className="danger-text" onClick={() => void removeLesson(item.id)}>Delete</button><button className="quiet-button" onClick={() => setDeleteId(undefined)}>Keep</button></div> : <button className="icon-button" aria-label={`Delete ${item.title}`} disabled={locked} onClick={() => setDeleteId(item.id)}><Icon name="trash" size={16} /></button>}</div>)}</div></div></dialog>

    <dialog ref={screenDialog} className="screen-dialog" onCancel={() => setScreenOpen(false)} onClick={event => { if (event.target === event.currentTarget) setScreenOpen(false); }} aria-labelledby="screen-title"><div className="dialog-inner"><div className="dialog-heading"><div><span className="eyebrow">ADD SOME CONTEXT</span><h2 id="screen-title">Choose a screen</h2></div><button className="icon-button" aria-label="Close screen picker" onClick={() => setScreenOpen(false)}><Icon name="close" /></button></div><p className="dialog-description">Choose a snapshot to preview. It is sent to AI Assist only when you ask your next question.</p>{screenLoading ? <p className="library-empty">Getting a snapshot…</p> : screens.length ? <div className="screen-grid">{screens.map(source => <button className="screen-choice" key={source.id} onClick={() => void attachScreen(source)}><img src={source.thumbnail} alt="" /><span>{source.name}</span></button>)}</div> : <p className="library-empty">No screens are available to capture.</p>}</div></dialog>
  </div>;
}
