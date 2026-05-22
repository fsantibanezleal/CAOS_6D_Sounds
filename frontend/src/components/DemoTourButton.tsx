import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type DemoTourHandle,
  parseDemoFromUrl,
  startTour,
  TOUR_STOPS
} from "../lib/demoTour";
import { useStore } from "../store/useStore";

/**
 * Right-panel button that toggles the demo tour.
 *
 * The tour cycles through TOUR_STOPS (see lib/demoTour.ts), setting
 * the selected clip + render mode + embedding track for each. Pair
 * with the Record button to produce a webm showcase video in one
 * pass, no manual clicking.
 *
 * Also auto-starts when the page is opened with `?demo=1` in the URL
 * so a one-click shareable preview link works.
 */
export function DemoTourButton() {
  const { t } = useTranslation();
  const library = useStore((s) => s.library);
  const setSelectedClip = useStore((s) => s.setSelectedClip);
  const setIsPlaying = useStore((s) => s.setIsPlaying);
  const setViz = useStore((s) => s.setViz);

  const handleRef = useRef<DemoTourHandle | null>(null);
  const [running, setRunning] = useState(false);
  const [stopIndex, setStopIndex] = useState(0);

  // Stop on unmount.
  useEffect(
    () => () => {
      handleRef.current?.stop();
      handleRef.current = null;
    },
    []
  );

  // Auto-start when the URL contains ?demo=1.
  useEffect(() => {
    if (!library) return;
    const { active, intervalSeconds } = parseDemoFromUrl();
    if (!active || handleRef.current?.isRunning()) return;
    handleRef.current = startTour(
      (clipId) => library.clips.find((c) => c.id === clipId),
      (stop, clip) => {
        setSelectedClip(clip);
        setViz({ renderMode: stop.renderMode, trackName: stop.trackName });
        // Try to start playback so the trail is moving while we record.
        // It's OK if the browser blocks the play call — the trail is
        // still meaningful at currentTime=0.
        setTimeout(() => {
          const audio = document.querySelector("audio");
          void audio?.play().catch(() => undefined);
          setIsPlaying(true);
        }, 250);
      },
      {
        intervalSeconds,
        loop: true,
        onAdvance: (_s, idx) => setStopIndex(idx)
      }
    );
    setRunning(true);
  }, [library, setSelectedClip, setIsPlaying, setViz]);

  function toggle(): void {
    if (running && handleRef.current) {
      handleRef.current.stop();
      handleRef.current = null;
      setRunning(false);
      return;
    }
    if (!library) return;
    handleRef.current = startTour(
      (clipId) => library.clips.find((c) => c.id === clipId),
      (stop, clip) => {
        setSelectedClip(clip);
        setViz({ renderMode: stop.renderMode, trackName: stop.trackName });
        setTimeout(() => {
          const audio = document.querySelector("audio");
          void audio?.play().catch(() => undefined);
          setIsPlaying(true);
        }, 250);
      },
      {
        intervalSeconds: 7,
        loop: true,
        onAdvance: (_s, idx) => setStopIndex(idx)
      }
    );
    setRunning(true);
  }

  return (
    <button
      onClick={toggle}
      style={{
        marginTop: 6,
        width: "100%",
        background: running ? "#9333ea" : undefined,
        color: running ? "#fff" : undefined
      }}
      title={t("viz.demo_tour_help")}
    >
      {running
        ? t("viz.demo_tour_stop", { i: stopIndex + 1, n: TOUR_STOPS.length })
        : t("viz.demo_tour_start")}
    </button>
  );
}
