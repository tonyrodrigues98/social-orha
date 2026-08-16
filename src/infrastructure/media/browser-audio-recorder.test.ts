import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BrowserAudioRecorder,
  createRecordedAudioUrl,
  revokeAllRecordedAudioUrls,
} from "./browser-audio-recorder";

class FakeMediaRecorder extends EventTarget {
  static isTypeSupported(type: string) {
    return type === "audio/mp4";
  }

  readonly stream: MediaStream;
  readonly mimeType: string;
  state: RecordingState = "inactive";

  constructor(stream: MediaStream, options?: MediaRecorderOptions) {
    super();
    this.stream = stream;
    this.mimeType = options?.mimeType ?? "audio/webm";
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    queueMicrotask(() => {
      const dataEvent = new Event("dataavailable");
      Object.defineProperty(dataEvent, "data", { value: new Blob(["audio"]) });
      this.dispatchEvent(dataEvent);
      this.dispatchEvent(new Event("stop"));
    });
  }
}

function createStream() {
  const stop = vi.fn();
  return {
    stream: { getTracks: () => [{ stop }] } as unknown as MediaStream,
    stop,
  };
}

describe("BrowserAudioRecorder", () => {
  beforeEach(() => {
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  });

  afterEach(() => {
    revokeAllRecordedAudioUrls();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("records once, chooses a supported MIME type, and releases the microphone", async () => {
    const { stream, stop } = createStream();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    const recorder = new BrowserAudioRecorder();

    await recorder.start();
    const blob = await recorder.stop();

    expect(blob.type).toBe("audio/mp4");
    expect(blob.size).toBeGreaterThan(0);
    expect(stop).toHaveBeenCalled();
  });

  it("cancels safely while microphone permission is still pending", async () => {
    const { stream, stop } = createStream();
    let resolveStream!: (stream: MediaStream) => void;
    const pendingStream = new Promise<MediaStream>((resolve) => { resolveStream = resolve; });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn(() => pendingStream) } });
    const recorder = new BrowserAudioRecorder();

    const starting = recorder.start();
    recorder.cancel();
    resolveStream(stream);

    await expect(starting).rejects.toMatchObject({ name: "AbortError" });
    expect(stop).toHaveBeenCalledOnce();
  });

  it("does not let a cancelled permission request overwrite a newer recording", async () => {
    const first = createStream();
    const second = createStream();
    let resolveFirst!: (stream: MediaStream) => void;
    const firstPermission = new Promise<MediaStream>((resolve) => { resolveFirst = resolve; });
    const getUserMedia = vi.fn()
      .mockImplementationOnce(() => firstPermission)
      .mockResolvedValueOnce(second.stream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const recorder = new BrowserAudioRecorder();

    const staleStart = recorder.start();
    recorder.cancel();
    await recorder.start();
    resolveFirst(first.stream);

    await expect(staleStart).rejects.toMatchObject({ name: "AbortError" });
    await expect(recorder.stop()).resolves.toBeInstanceOf(Blob);
    expect(first.stop).toHaveBeenCalledOnce();
    expect(second.stop).toHaveBeenCalled();
  });

  it("revokes recorded object URLs at the authenticated-session boundary", () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const url = createRecordedAudioUrl(new Blob(["audio"]));

    revokeAllRecordedAudioUrls();

    expect(revoke).toHaveBeenCalledWith(url);
  });
});
