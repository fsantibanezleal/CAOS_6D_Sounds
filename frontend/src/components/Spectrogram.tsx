import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { ensureRunning, getAnalyser } from "../lib/audioBus";
import { sampleColormap } from "../lib/colormaps";
import { useStore } from "../store/useStore";

const FFT_SIZE = 512;
const HISTORY_BARS = 240;

/**
 * Real-time mel-scale spectrogram fed by a Web Audio AnalyserNode.
 *
 * The canvas is drawn as a scrolling vertical strip — each new column is
 * appended on the right, the existing pixels shift left by one column.
 */
export function Spectrogram() {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPlaying = useStore((s) => s.isPlaying);
  const colormap = useStore((s) => s.viz.colormap);
  const reverseColormap = useStore((s) => s.viz.reverseColormap);

  useEffect(() => {
    if (!isPlaying) return;
    void ensureRunning();
    const analyser = getAnalyser(FFT_SIZE);
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bins = analyser.frequencyBinCount;
    const data = new Uint8Array(bins);

    let raf = 0;
    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      analyser.getByteFrequencyData(data);

      // Shift the existing image one column to the left.
      const shift = Math.max(1, Math.floor(w / HISTORY_BARS));
      if (w - shift > 0) {
        const img = ctx.getImageData(shift, 0, w - shift, h);
        ctx.putImageData(img, 0, 0);
      }
      ctx.clearRect(w - shift, 0, shift, h);

      // Draw the new column on the right edge.
      const x = w - shift;
      const colHeight = h;
      // Logarithmic frequency mapping — emphasize lower frequencies.
      for (let y = 0; y < colHeight; y++) {
        const tNorm = 1 - y / colHeight;
        const idx = Math.min(bins - 1, Math.floor(Math.pow(tNorm, 2) * bins));
        const v = data[idx] / 255;
        const cmT = reverseColormap ? 1 - v : v;
        const [r, g, b] = sampleColormap(colormap, cmT);
        ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
        ctx.fillRect(x, y, shift, 1);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, colormap, reverseColormap]);

  return (
    <div className="aux-card">
      <h3>{t("panels.spectrogram")}</h3>
      <canvas ref={canvasRef} style={{ width: "100%", height: 160 }} />
    </div>
  );
}
