/**
 * Capture the current 6D viz canvas as a PNG download.
 *
 * The canvas is created by react-three-fiber inside .viz-canvas. We grab
 * its bitmap via toBlob, then trigger a synthetic <a download> click. This
 * is intentionally minimal — anything fancier (e.g. trail-only export with
 * a transparent background) belongs in a dedicated export pipeline.
 *
 * Note: WebGL contexts created without `preserveDrawingBuffer:true` will
 * yield a blank PNG because the buffer is wiped after compositing. The
 * Visualization6D component requests `preserveDrawingBuffer` on its
 * <Canvas /> for exactly this reason.
 */

function timestampSlug(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export function snapshotCanvas(filenameStem = "auralis"): boolean {
  const canvas = document.querySelector<HTMLCanvasElement>(".viz-canvas canvas");
  if (!canvas) return false;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filenameStem}-${timestampSlug()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, "image/png");
  return true;
}
