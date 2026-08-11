export interface AudioRecorderPort {
  start(): Promise<void>;
  stop(): Promise<Blob>;
  cancel(): void;
}

export class BrowserAudioRecorder implements AudioRecorderPort {
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];

  async start() {
    if (!("MediaRecorder" in globalThis) || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("MediaRecorder não é suportado neste navegador.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.recorder = new MediaRecorder(stream);
    this.recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    });
    this.recorder.start();
  }

  stop() {
    const recorder = this.recorder;
    if (!recorder || recorder.state === "inactive") {
      return Promise.reject(new Error("Não há gravação ativa."));
    }

    return new Promise<Blob>((resolve) => {
      recorder.addEventListener(
        "stop",
        () => {
          const blob = new Blob(this.chunks, { type: recorder.mimeType || "audio/webm" });
          recorder.stream.getTracks().forEach((track) => track.stop());
          this.recorder = undefined;
          resolve(blob);
        },
        { once: true },
      );
      recorder.stop();
    });
  }

  cancel() {
    if (!this.recorder) return;
    this.chunks = [];
    this.recorder.stream.getTracks().forEach((track) => track.stop());
    if (this.recorder.state !== "inactive") this.recorder.stop();
    this.recorder = undefined;
  }
}
