import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../lib/api";
import { setSharedAudio } from "../lib/audioBus";
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
  const comparisonClip = useStore((s) => s.comparisonClip);
  const setComparisonEmbedding = useStore((s) => s.setComparisonEmbedding);

  // Load embedding metadata whenever the clip changes.
  useEffect(() => {
    if (!selectedClip) return;
    let cancelled = false;
    void api.getClipEmbedding(selectedClip.id).then((e) => {
      if (!cancelled) setEmbedding(e);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedClip, setEmbedding]);

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

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !selectedClip) return;
    el.src = api.audioUrl(selectedClip.id);
    el.load();
    el.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);
  }, [selectedClip, setCurrentTime, setIsPlaying]);

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
        {isPlaying ? "Pause" : "Play"}
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
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        crossOrigin="anonymous"
      />
    </div>
  );
}
