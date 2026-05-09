/**
 * Record the 6D viz canvas as a webm video via MediaRecorder.
 *
 * The HTMLCanvasElement.captureStream(fps) API hands the WebGL output
 * directly to MediaRecorder; no server round-trip, no extra deps.
 *
 * Usage:
 *   const rec = startCanvasRecording(canvas, fps);
 *   await rec.stop();   // returns a Blob (video/webm)
 *
 * Browser support: Chrome / Edge / Firefox handle webm; Safari needs
 * mp4 codec selection. We try several MIME types in order of
 * preference and fall back to whatever the browser accepts.
 */

const PREFERRED_MIME_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4"
];

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

export type AutoStopReason = "size_cap";

export interface CanvasRecording {
  stop(): Promise<{ blob: Blob; mimeType: string }>;
  cancel(): void;
}

export interface CanvasRecordingOptions {
  fps?: number;
  videoBitsPerSecond?: number;
  audioBitsPerSecond?: number;
  // Optional audio MediaStream to mux into the recording (e.g. one
  // produced by audioBus.getRecordingStream()). When omitted, the
  // recording is video-only — same behaviour as before this option
  // existed.
  audioStream?: MediaStream | null;
  // Hard cap on cumulative chunk bytes. When exceeded, the recorder
  // stops itself and onAutoStop fires with reason "size_cap". The
  // resolved Blob still contains everything captured up to that point.
  // Defaults to 500 MB.
  maxBytes?: number;
  onAutoStop?: (reason: AutoStopReason) => void;
}

export function isVideoRecordingSupported(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function" &&
    pickMimeType() !== ""
  );
}

export function startCanvasRecording(
  canvas: HTMLCanvasElement,
  optionsOrFps: CanvasRecordingOptions | number = {}
): CanvasRecording {
  const opts: CanvasRecordingOptions =
    typeof optionsOrFps === "number" ? { fps: optionsOrFps } : optionsOrFps;
  const fps = opts.fps ?? 30;
  const videoBitsPerSecond = opts.videoBitsPerSecond ?? 8_000_000;
  const audioBitsPerSecond = opts.audioBitsPerSecond ?? 128_000;
  const maxBytes = opts.maxBytes ?? 500 * 1024 * 1024;
  const onAutoStop = opts.onAutoStop;
  const audioStream = opts.audioStream ?? null;

  const mimeType = pickMimeType();
  if (!mimeType) {
    throw new Error(
      "MediaRecorder is not available in this browser, or no supported video MIME type was found."
    );
  }
  const videoStream = canvas.captureStream(fps);
  const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];
  if (audioStream) {
    for (const t of audioStream.getAudioTracks()) tracks.push(t);
  }
  const stream = new MediaStream(tracks);
  const chunks: BlobPart[] = [];
  let totalBytes = 0;
  let stopped = false;
  const recorderOptions: MediaRecorderOptions = {
    mimeType,
    videoBitsPerSecond
  };
  if (audioStream) recorderOptions.audioBitsPerSecond = audioBitsPerSecond;
  const recorder = new MediaRecorder(stream, recorderOptions);

  // Wire onstop/onerror up front so an early auto-stop (size_cap fires
  // from inside ondataavailable) cannot race past the listener.
  const finished = new Promise<{ blob: Blob; mimeType: string }>(
    (resolve, reject) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        resolve({ blob, mimeType });
      };
      recorder.onerror = (e) => reject(e);
    }
  );

  recorder.ondataavailable = (event) => {
    if (!event.data || event.data.size === 0) return;
    chunks.push(event.data);
    totalBytes += event.data.size;
    if (!stopped && totalBytes >= maxBytes) {
      stopped = true;
      try {
        recorder.stop();
      } catch {
        // Already inactive — fine.
      }
      if (onAutoStop) onAutoStop("size_cap");
    }
  };

  recorder.start();

  return {
    stop(): Promise<{ blob: Blob; mimeType: string }> {
      if (!stopped) {
        stopped = true;
        try {
          recorder.stop();
        } catch {
          // Already inactive (e.g. error path) — the promise still resolves.
        }
      }
      return finished;
    },
    cancel(): void {
      if (!stopped) {
        stopped = true;
        try {
          recorder.stop();
        } catch {
          // Ignore — MediaRecorder may already be inactive.
        }
      }
    }
  };
}

export function downloadBlob(blob: Blob, filenameStem: string, ext: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameStem}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function timestampSlug(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}
