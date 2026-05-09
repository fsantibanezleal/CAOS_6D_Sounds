import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ensureRunning, getRecordingStream } from "../lib/audioBus";
import {
  downloadBlob,
  isVideoRecordingSupported,
  startCanvasRecording,
  timestampSlug,
  type CanvasRecording
} from "../lib/videoRecorder";
import { useStore } from "../store/useStore";

/**
 * Toggle button that records the 6D viz canvas as a webm video.
 *
 * State machine:
 *   idle  -> click -> recording (red dot, elapsed seconds)
 *   recording -> click -> finalising (showing "Saving...")
 *   finalising -> done (downloads the video file) -> idle
 *
 * If the browser doesn't support MediaRecorder + canvas.captureStream,
 * the button is hidden — the static PNG snapshot button is always
 * available as a fallback.
 */

const FPS = 30;
// Hard caps so a forgotten/abandoned recording can't exhaust the browser's
// memory. The user owns their machine, but 20 min @ 8 Mbps ≈ 1.2 GB of Blob
// in RAM is already aggressive — anything beyond that auto-stops cleanly.
const MAX_SECONDS = 20 * 60;
const MAX_BYTES = 500 * 1024 * 1024;

export function RecordButton() {
  const { t } = useTranslation();
  const recordWithAudio = useStore((s) => s.viz.recordWithAudio);
  const setViz = useStore((s) => s.setViz);
  const [supported] = useState(() => isVideoRecordingSupported());
  const [state, setState] = useState<"idle" | "recording" | "finalising">("idle");
  const [elapsed, setElapsed] = useState(0);
  const recordingRef = useRef<CanvasRecording | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  // Tick the elapsed seconds while recording.
  useEffect(() => {
    if (state !== "recording") return;
    const id = window.setInterval(() => {
      setElapsed(Math.round((performance.now() - startedAtRef.current) / 1000));
    }, 200);
    tickRef.current = id;
    return () => {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [state]);

  useEffect(() => {
    return () => {
      if (recordingRef.current) recordingRef.current.cancel();
      if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    };
  }, []);

  if (!supported) return null;

  async function startOrStop() {
    if (state === "idle") {
      const canvas = document.querySelector<HTMLCanvasElement>(".viz-canvas canvas");
      if (!canvas) return;
      try {
        let audioStream: MediaStream | null = null;
        if (recordWithAudio) {
          // The AudioContext must be in `running` state for the
          // MediaStreamDestination to actually carry samples — most
          // browsers create it `suspended` until a user gesture. The
          // record click counts, so we resume here.
          await ensureRunning();
          audioStream = getRecordingStream();
        }
        const rec = startCanvasRecording(canvas, {
          fps: FPS,
          maxBytes: MAX_BYTES,
          audioStream,
          onAutoStop: () => {
            void finishRecording();
          }
        });
        recordingRef.current = rec;
        startedAtRef.current = performance.now();
        setElapsed(0);
        setState("recording");
        // Safety cap: auto-stop after MAX_SECONDS so we never hang on
        // an infinite-record state. A second guardrail (maxBytes above)
        // covers the case of high-bitrate captures that hit a memory
        // limit before the time cap.
        stopTimerRef.current = window.setTimeout(() => {
          void finishRecording();
        }, MAX_SECONDS * 1000);
      } catch (err) {
        console.error("[Auralis] video recording failed:", err);
      }
    } else if (state === "recording") {
      void finishRecording();
    }
  }

  async function finishRecording() {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    setState("finalising");
    try {
      const rec = recordingRef.current;
      recordingRef.current = null;
      if (!rec) {
        setState("idle");
        return;
      }
      const { blob, mimeType } = await rec.stop();
      const ext = mimeType.includes("mp4") ? "mp4" : "webm";
      downloadBlob(blob, `auralis-${timestampSlug()}`, ext);
    } catch (err) {
      console.error("[Auralis] video finalisation failed:", err);
    } finally {
      setState("idle");
      setElapsed(0);
    }
  }

  const label =
    state === "recording"
      ? t("viz.record_stop", { n: elapsed })
      : state === "finalising"
        ? t("viz.record_saving")
        : t("viz.record_start");

  return (
    <>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginTop: 6,
          fontSize: "0.85em",
          opacity: state === "recording" ? 0.5 : 1,
          cursor: state === "recording" ? "not-allowed" : "pointer"
        }}
        title={t("viz.record_with_audio_help")}
      >
        <input
          type="checkbox"
          checked={recordWithAudio}
          disabled={state !== "idle"}
          onChange={(e) => setViz({ recordWithAudio: e.target.checked })}
        />
        {t("viz.record_with_audio")}
      </label>
      <button
        onClick={startOrStop}
        disabled={state === "finalising"}
        className={state === "recording" ? "primary recording" : ""}
        style={{ marginTop: 4, width: "100%" }}
        title={t("viz.record_help")}
      >
        {state === "recording" && <span className="rec-dot" />}
        {label}
      </button>
    </>
  );
}
