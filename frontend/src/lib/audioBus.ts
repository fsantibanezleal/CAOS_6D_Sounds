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
