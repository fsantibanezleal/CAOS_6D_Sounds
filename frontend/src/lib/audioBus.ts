/**
 * Shared bus for the singleton <audio> element + Web Audio analyser.
 *
 * The audio element is rendered once by <AudioPlayer/>; spectrogram and
 * waveform components read it from here. We also lazily create one
 * AudioContext + AnalyserNode so all live-feature panels share a single
 * node graph.
 */

let audio: HTMLAudioElement | null = null;
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let source: MediaElementAudioSourceNode | null = null;
let recordingDest: MediaStreamAudioDestinationNode | null = null;

export function setSharedAudio(el: HTMLAudioElement | null): void {
  audio = el;
}

export function getSharedAudio(): HTMLAudioElement | null {
  return audio;
}

/**
 * Create (lazily) a Web Audio analyser tied to the audio element.
 * Returns null until the audio element has been mounted.
 */
export function getAnalyser(fftSize = 1024): AnalyserNode | null {
  if (!audio) return null;
  if (ctx === null) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (source === null) {
    try {
      source = ctx.createMediaElementSource(audio);
    } catch {
      // Already connected for this element — silently ignore. The
      // existing analyser stays valid.
      return analyser;
    }
  }
  if (analyser === null) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    analyser.connect(ctx.destination);
  } else if (analyser.fftSize !== fftSize) {
    analyser.fftSize = fftSize;
  }
  return analyser;
}

/** Resume the shared AudioContext (must run inside a user gesture). */
export async function ensureRunning(): Promise<void> {
  if (ctx && ctx.state === "suspended") await ctx.resume();
}

/**
 * Return a MediaStream that mirrors the audio playing through the
 * shared element, suitable for handing to MediaRecorder alongside the
 * canvas video stream. Returns null until the audio element is mounted.
 *
 * The destination node is created lazily and reused, and the source
 * stays connected to it for the lifetime of the page. A Web Audio
 * source can drive multiple destinations in parallel, so feeding the
 * recording destination does NOT silence the speakers — the existing
 * source.connect(analyser).connect(ctx.destination) graph keeps
 * working untouched.
 */
export function getRecordingStream(): MediaStream | null {
  // Force-init the analyser graph so `source` exists. We pass the same
  // default fftSize the spectrogram uses; if the analyser already
  // exists this call is cheap and idempotent.
  getAnalyser();
  if (!ctx || !source) return null;
  if (recordingDest === null) {
    recordingDest = ctx.createMediaStreamDestination();
    source.connect(recordingDest);
  }
  return recordingDest.stream;
}
