/// <reference types="vite/client" />

// Vite's `?url` query suffix yields the asset URL as a string.
// We use it for AudioWorklet sources (audioContext.audioWorklet.addModule()).
declare module "*?url" {
  const url: string;
  export default url;
}
