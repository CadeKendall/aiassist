type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
export interface VoiceInput {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionWindow = Window & { SpeechRecognition?: new () => VoiceInput; webkitSpeechRecognition?: new () => VoiceInput };
export function createVoiceInput(): VoiceInput | null {
  const host = window as RecognitionWindow;
  const Constructor = host.SpeechRecognition || host.webkitSpeechRecognition;
  return Constructor ? new Constructor() : null;
}
