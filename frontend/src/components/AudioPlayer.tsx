import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../lib/api";
import {
  ensureRunning,
  getAnalyser,
  setPitchShift,
  setSharedAudio
} from "../lib/audioBus";
import { useStore } from "../store/useStore";

function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "00:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

export function AudioPlayer() {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const selectedClip = useStore((s) => s.selectedClip);
  const isPlaying = useStore((s) => s.isPlaying);
  const setIsPlaying = useStore((s) => s.setIsPlaying);
  const currentTime = useStore((s) => s.currentTime);
  const setCurrentTime = useStore((s) => s.setCurrentTime);
  const setEmbedding = useStore((s) => s.setEmbedding);
  const loopAudio = useStore((s) => s.loopAudio);
  const setLoopAudio = useStore((s) => s.setLoopAudio);
  const playbackRate = useStore((s) => s.playbackRate);
  const preservesPitch = useStore((s) => s.preservesPitch);
  const pitchShiftSemitones = useStore((s) => s.pitchShiftSemitones);
  const comparisonClip = useStore((s) => s.comparisonClip);
  const setComparisonEmbedding = useStore((s) => s.setComparisonEmbedding);
  const setAudioError = useStore((s) => s.setAudioError);

  // Load embedding metadata whenever the clip changes.
  useEffect(() => {
    if (!selectedClip) return;
    let cancelled = false;
    void api
      .getClipEmbedding(selectedClip.id)
      .then((e) => {
        if (!cancelled) setEmbedding(e);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load embedding", err);
          setAudioError(
            err instanceof Error
              ? t("error.embedding_load_failed", { msg: err.message })
              : t("error.embedding_load_unknown")
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedClip, setEmbedding, setAudioError]);

  // Load embedding metadata for the comparison clip too (silhouette only —
  // the comparison clip's audio is not played).
  useEffect(() => {
    if (!comparisonClip) {
      setComparisonEmbedding(null);
      return;
    }
    let cancelled = false;
    void api.getClipEmbedding(comparisonClip.id).then((e) => {
      if (!cancelled) setComparisonEmbedding(e);
    });
    return () => {
      cancelled = true;
    };
  }, [comparisonClip, setComparisonEmbedding]);

  // Drive currentTime via rAF so the visualization stays smooth (audio
  // element timeupdate fires only every ~250 ms).
  useEffect(() => {
    function tick() {
      const el = audioRef.current;
      if (el) setCurrentTime(el.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    }
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, setCurrentTime]);

  // When the selected clip changes:
  //  - load the new audio
  //  - reset the cursor
  //  - auto-play, EXCEPT when this is the very first clip load (the
  //    initial bird-house-sparrow auto-assignment in App.tsx isn't a
  //    user gesture, so browsers block play() with autoplay errors).
  const hasUserSelectedClipRef = useRef(false);
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !selectedClip) return;
    el.src = api.audioUrl(selectedClip.id);
    el.load();
    el.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);
    if (hasUserSelectedClipRef.current) {
      // The AudioContext may be suspended until a user gesture happens;
      // selecting a clip IS a user gesture so we can resume it here.
      void ensureRunning().then(() => {
        void el.play().catch((err) => {
          // Autoplay failures are non-fatal — the user can press Play
          // manually. Log for debugging but don't surface to the user.
          console.debug("[Auralis] autoplay blocked", err);
        });
      });
    } else {
      hasUserSelectedClipRef.current = true;
    }
  }, [selectedClip, setCurrentTime, setIsPlaying]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = playbackRate;
    (el as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch = preservesPitch;
  }, [playbackRate, preservesPitch, selectedClip]);

  // Apply pitch shift via the AudioWorklet. We also have to nudge the
  // audio graph (getAnalyser) the first time we send a non-zero value
  // — that's what triggers the worklet to be loaded + inserted. The
  // graph stays in place from then on.
  useEffect(() => {
    if (pitchShiftSemitones !== 0) {
      // Force-init the analyser chain so the worklet load kicks off.
      getAnalyser();
    }
    setPitchShift(pitchShiftSemitones);
  }, [pitchShiftSemitones]);

  function togglePlay() {
    const el = audioRef.current;
    if (!el || !selectedClip) return;
    if (el.paused) void el.play();
    else el.pause();
  }

  const dur = selectedClip?.duration_seconds ?? 0;

  return (
    <div className="player">
      <button
        className="primary"
        onClick={togglePlay}
        disabled={!selectedClip}
        aria-label={isPlaying ? t("library.pause") : t("library.play")}
      >
        {isPlaying ? t("library.pause") : t("library.play")}
      </button>
      <progress value={currentTime} max={dur || 1} />
      <span className="time">
        {formatTime(currentTime)} / {formatTime(dur)}
      </span>
      <label
        className="loop-toggle"
        title={t("library.loop")}
        aria-label={t("library.loop")}
      >
        <input
          type="checkbox"
          checked={loopAudio}
          onChange={(e) => setLoopAudio(e.target.checked)}
        />
        <span>{t("library.loop_short")}</span>
      </label>
      <audio
        ref={(el) => {
          audioRef.current = el;
          setSharedAudio(el);
        }}
        preload="metadata"
        loop={loopAudio}
        onPlay={() => {
          setIsPlaying(true);
          setAudioError(null);
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={(e) => {
          const err = (e.currentTarget as HTMLAudioElement).error;
          const code = err?.code;
          // MediaError codes: 1=ABORTED, 2=NETWORK, 3=DECODE, 4=SRC_NOT_SUPPORTED
          const reason =
            code === 2
              ? t("error.audio_network")
              : code === 3
                ? t("error.audio_decode")
                : code === 4
                  ? t("error.audio_unsupported")
                  : err?.message || t("error.unknown");
          console.error("[Auralis] audio element error:", err);
          setAudioError(t("error.playback_failed", { reason }));
          setIsPlaying(false);
        }}
        crossOrigin="anonymous"
      />
    </div>
  );
}
