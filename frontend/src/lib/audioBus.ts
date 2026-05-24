/**
 * Shared bus for the singleton <audio> element + Web Audio analyser.
 *
 * The audio element is rendered once by <AudioPlayer/>; spectrogram and
 * waveform components read it from here. We also lazily create one
 * AudioContext + AnalyserNode so all live-feature panels share a single
 * node graph.
 *
 * Graph (lazy-built on first getAnalyser call, once `audio` is mounted):
 *
 *   <audio> --MediaElementSource--> [pitchShift?] --> analyser --> destination
 *                                            |                  \-> recordingDest (optional)
 *
 * `pitchShift` is an AudioWorkletNode loaded from
 * `audioWorklets/pitchShiftProcessor.js`. It defaults to 0 semitones
 * (perfect bit-for-bit passthrough — see the BYPASS_THRESHOLD inside
 * the worklet) so wiring it unconditionally is safe even when the user
 * never touches the pitch slider.
 */

import pitchShiftUrl from "./audioWorklets/pitchShiftProcessor.js?url";

let audio: HTMLAudioElement | null = null;
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let source: MediaElementAudioSourceNode | null = null;
let recordingDest: MediaStreamAudioDestinationNode | null = null;
let pitchShiftNode: AudioWorkletNode | null = null;
let pitchShiftPromise: Promise<void> | null = null;

export function setSharedAudio(el: HTMLAudioElement | null): void {
  audio = el;
}

export function getSharedAudio(): HTMLAudioElement | null {
  return audio;
}

/** Load the pitch-shift worklet module once per page. Cached promise so
 *  concurrent callers all await the same in-flight load. */
function ensurePitchShiftLoaded(context: AudioContext): Promise<void> {
  if (pitchShiftPromise) return pitchShiftPromise;
  pitchShiftPromise = context.audioWorklet
    .addModule(pitchShiftUrl)
    .catch((err) => {
      // Reset so a later call can retry; the audio graph still works
      // without pitch shift, the user just won't see it take effect.
      pitchShiftPromise = null;
      console.warn("[Auralis] pitch-shift worklet failed to load", err);
      throw err;
    });
  return pitchShiftPromise;
}

/**
 * Create (lazily) a Web Audio analyser tied to the audio element.
 * Returns null until the audio element has been mounted.
 *
 * The pitch-shift worklet is loaded asynchronously on first call. While
 * the load is in flight, the chain runs source → analyser → destination
 * directly; once the worklet resolves it's inserted between source and
 * analyser. This avoids blocking the first frame of audio behind the
 * worklet load.
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
    // Connect immediately so audio plays even before the worklet loads.
    source.connect(analyser);
    analyser.connect(ctx.destination);
    // Try to insert the pitch-shift worklet asynchronously.
    void ensurePitchShiftLoaded(ctx)
      .then(() => {
        if (!ctx || !source || !analyser) return;
        try {
          pitchShiftNode = new AudioWorkletNode(ctx, "pitch-shift-processor", {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2]
          });
        } catch (err) {
          console.warn("[Auralis] could not instantiate pitch-shift node", err);
          return;
        }
        // Re-route: source -> pitchShift -> analyser. The analyser was
        // already wired to destination, so the tail stays intact.
        try {
          source.disconnect(analyser);
        } catch {
          // ignore — depending on browser the disconnect may throw if
          // the connection state has changed under us.
        }
        source.connect(pitchShiftNode);
        pitchShiftNode.connect(analyser);
        // If a recording destination was already set up, redirect it
        // through the pitch shift too so recorded audio matches what
        // the user hears.
        if (recordingDest) {
          try {
            source.disconnect(recordingDest);
          } catch {
            // ignore
          }
          pitchShiftNode.connect(recordingDest);
        }
      })
      .catch(() => {
        // ensurePitchShiftLoaded already logs; nothing else to do.
      });
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
 * Set the pitch shift in semitones. Range [-12, +12]. No-op when the
 * worklet hasn't loaded yet (the value will not take effect until the
 * worklet is ready — by then `setPitchShift` will need to be called
 * again from the React effect, which it will because the store value
 * doesn't change just because the worklet became ready).
 *
 * Callers should call this every time the React state changes; we
 * silently drop the call when the node isn't ready rather than queueing.
 */
export function setPitchShift(semitones: number): void {
  if (!pitchShiftNode) return;
  const param = pitchShiftNode.parameters.get("semitones");
  if (!param) return;
  // Clamp defensively even though the worklet does it too — keeps the
  // automation buffer clean.
  const clamped = Math.max(-12, Math.min(12, semitones));
  param.setValueAtTime(clamped, ctx?.currentTime ?? 0);
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
 *
 * When the pitch-shift worklet is wired in, the recording destination
 * is fed from AFTER the worklet so recorded audio matches what the
 * user hears.
 */
export function getRecordingStream(): MediaStream | null {
  // Force-init the analyser graph so `source` exists. We pass the same
  // default fftSize the spectrogram uses; if the analyser already
  // exists this call is cheap and idempotent.
  getAnalyser();
  if (!ctx || !source) return null;
  if (recordingDest === null) {
    recordingDest = ctx.createMediaStreamDestination();
    // Connect from the pitch-shift output if available, otherwise from
    // the bare source. The getAnalyser side-effect will re-wire this
    // through pitchShiftNode once the worklet resolves.
    if (pitchShiftNode) {
      pitchShiftNode.connect(recordingDest);
    } else {
      source.connect(recordingDest);
    }
  }
  return recordingDest.stream;
}
