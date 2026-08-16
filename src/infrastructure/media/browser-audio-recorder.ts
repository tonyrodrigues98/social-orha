export interface AudioRecorderPort {
  start(): Promise<void>;
  stop(): Promise<Blob>;
  cancel(): void;
}

type RecorderState = "idle" | "starting" | "recording" | "stopping";

const recordedAudioUrls = new Set<string>();

function abortError() {
  return new DOMException("Gravação cancelada.", "AbortError");
}

function preferredMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type));
}

/** Object URLs live for the authenticated session and are released on sign-out/unmount. */
export function createRecordedAudioUrl(blob: Blob) {
  const url = URL.createObjectURL(blob);
  recordedAudioUrls.add(url);
  return url;
}

export function revokeRecordedAudioUrl(url: string) {
  if (!recordedAudioUrls.delete(url)) return;
  URL.revokeObjectURL(url);
}

export function revokeAllRecordedAudioUrls() {
  recordedAudioUrls.forEach((url) => URL.revokeObjectURL(url));
  recordedAudioUrls.clear();
}

export class BrowserAudioRecorder implements AudioRecorderPort {
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private state: RecorderState = "idle";
  private generation = 0;
  private startPromise?: Promise<void>;
  private stopPromise?: Promise<Blob>;
  private rejectPendingStop?: (reason?: unknown) => void;

  async start() {
    if (!("MediaRecorder" in globalThis) || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("MediaRecorder não é suportado neste navegador.");
    }
    if (this.state !== "idle") throw new Error("Já existe uma gravação em andamento.");

    const generation = ++this.generation;
    this.state = "starting";
    this.chunks = [];

    const startPromise = (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (error) {
        if (this.generation === generation) this.state = "idle";
        throw error;
      }

      if (this.generation !== generation || this.state !== "starting") {
        stream.getTracks().forEach((track) => track.stop());
        throw abortError();
      }

      try {
        const mimeType = preferredMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        this.recorder = recorder;
        recorder.addEventListener("dataavailable", (event) => {
          if (this.generation === generation && event.data.size > 0) this.chunks.push(event.data);
        });
        recorder.start(250);
        this.state = "recording";
      } catch (error) {
        stream.getTracks().forEach((track) => track.stop());
        this.recorder = undefined;
        if (this.generation === generation) this.state = "idle";
        throw error;
      }
    })();

    this.startPromise = startPromise;
    try {
      await startPromise;
    } finally {
      if (this.startPromise === startPromise) this.startPromise = undefined;
    }
  }

  async stop() {
    if (this.state === "starting" && this.startPromise) await this.startPromise;
    if (this.state === "stopping" && this.stopPromise) return this.stopPromise;

    const recorder = this.recorder;
    if (this.state !== "recording" || !recorder || recorder.state === "inactive") {
      throw new Error("Não há gravação ativa.");
    }

    const generation = this.generation;
    this.state = "stopping";
    const stopPromise = new Promise<Blob>((resolve, reject) => {
      this.rejectPendingStop = reject;
      const release = () => {
        recorder.stream.getTracks().forEach((track) => track.stop());
        if (this.recorder === recorder) this.recorder = undefined;
        this.rejectPendingStop = undefined;
        this.stopPromise = undefined;
      };

      recorder.addEventListener("error", () => {
        release();
        if (this.generation === generation) this.state = "idle";
        reject(new Error("Não foi possível concluir a gravação."));
      }, { once: true });

      recorder.addEventListener("stop", () => {
        const wasCancelled = this.generation !== generation;
        const blob = new Blob(this.chunks, { type: recorder.mimeType || "audio/webm" });
        this.chunks = [];
        release();
        if (wasCancelled) {
          reject(abortError());
          return;
        }
        this.state = "idle";
        resolve(blob);
      }, { once: true });

      try {
        recorder.stop();
      } catch (error) {
        release();
        if (this.generation === generation) this.state = "idle";
        reject(error);
      }
    });
    this.stopPromise = stopPromise;
    return stopPromise;
  }

  cancel() {
    if (this.state === "idle") return;
    this.generation += 1;
    this.chunks = [];
    const recorder = this.recorder;
    this.recorder = undefined;
    this.state = "idle";
    this.rejectPendingStop?.(abortError());
    this.rejectPendingStop = undefined;
    if (!recorder) return;
    recorder.stream.getTracks().forEach((track) => track.stop());
    if (recorder.state !== "inactive") recorder.stop();
  }
}
