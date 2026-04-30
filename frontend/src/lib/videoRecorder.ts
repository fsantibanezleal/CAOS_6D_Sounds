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

export interface CanvasRecording {
  stop(): Promise<{ blob: Blob; mimeType: string }>;
  cancel(): void;
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
  fps = 30
): CanvasRecording {
  const mimeType = pickMimeType();
  if (!mimeType) {
    throw new Error(
      "MediaRecorder is not available in this browser, or no supported video MIME type was found."
    );
  }
  const stream = canvas.captureStream(fps);
  const chunks: BlobPart[] = [];
  // Bias videoBitsPerSecond on the higher side so the recording captures the
  // colour gradients (additive blending) without smearing.
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000
  });
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };
  let finished: Promise<{ blob: Blob; mimeType: string }> | null = null;

  function makePromise(): Promise<{ blob: Blob; mimeType: string }> {
    return new Promise((resolve, reject) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        resolve({ blob, mimeType });
      };
      recorder.onerror = (e) => reject(e);
    });
  }

  recorder.start();

  return {
    stop(): Promise<{ blob: Blob; mimeType: string }> {
      if (!finished) {
        finished = makePromise();
        recorder.stop();
      }
      return finished;
    },
    cancel(): void {
      try {
        recorder.stop();
      } catch {
        // Ignore — MediaRecorder may already be inactive.
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
