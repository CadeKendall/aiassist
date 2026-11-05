export type Vec3 = [number, number, number];
export type Animation = { type: 'spin' | 'oscillate'; axis: 'x' | 'y' | 'z'; speed: number; amplitude?: number; phase?: number };
export type Part = { id: string; label: string; description?: string; shape: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'arrow'; position: Vec3; rotation?: Vec3; scale?: Vec3; color: string; opacity?: number; dimensions?: Vec3; animation?: Animation };
export type Chart = { type: 'line' | 'bar' | 'scatter'; xLabel: string; yLabel: string; series: { id: string; label: string; color: string; points: { x: number; y: number; label?: string }[] }[]; source: string };
export type Diagram = { nodes: { id: string; label: string; x: number; y: number; description?: string; color: string }[]; edges: { from: string; to: string; label?: string }[] };
export type Scene = { version: 1; title: string; description: string; kind: '3d' | 'chart' | 'diagram'; parts: Part[]; chart?: Chart; diagram?: Diagram; notes: string[] };
export type ScenePatch = { title?: string; description?: string; upsertParts?: Part[]; removePartIds?: string[]; chart?: Chart; diagram?: Diagram; notes?: string[] };
export type Message = { id: string; role: 'user' | 'assistant'; text: string };
export type Lesson = { id: string; title: string; updatedAt: string; threadId?: string; scene: Scene; messages: Message[] };
export type LessonSummary = Pick<Lesson, 'id' | 'title' | 'updatedAt'>;
export type Connection = { state: 'disconnected' | 'connecting' | 'ready' | 'error'; message: string; model?: string };
export type AppEvent = { type: 'connection'; connection: Connection } | { type: 'delta'; text: string } | { type: 'scene'; scene: Scene } | { type: 'thread'; threadId: string } | { type: 'done'; status: string } | { type: 'error'; message: string } | { type: 'focus' };
export type AskRequest = { text: string; scene: Scene; selectedId?: string; threadId?: string; imageDataUrl?: string };
export type ScreenSource = { id: string; name: string; thumbnail: string };
export interface StudioBridge {
 connect(): Promise<Connection>;
 ask(request: AskRequest): Promise<void>;
 cancel(): Promise<void>;
 onEvent(listener: (event: AppEvent) => void): () => void;
 listLessons(): Promise<LessonSummary[]>;
 saveLesson(lesson: Lesson): Promise<void>;
 loadLesson(id: string): Promise<Lesson>;
 deleteLesson(id: string): Promise<void>;
 exportLesson(lesson: Lesson): Promise<boolean>;
 importLesson(): Promise<Lesson | null>;
 setAlwaysOnTop(value: boolean): Promise<void>;
 listScreens(): Promise<ScreenSource[]>;
 captureScreen(id: string): Promise<string>;
}
declare global { interface Window { studio: StudioBridge } }
