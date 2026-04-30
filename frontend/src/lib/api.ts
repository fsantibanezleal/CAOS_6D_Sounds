/**
 * Thin client for the Auralis HTTP API. The frontend is served by FastAPI
 * in production, so requests are same-origin; in development the Vite dev
 * server proxies /api and /audio to the backend on :8104.
 */

export interface Category {
  id: string;
  name_en: string;
  name_es: string;
  description_en: string;
  description_es: string;
  icon?: string | null;
}

export interface SoundClip {
  id: string;
  title_en: string;
  title_es: string;
  category: string;
  duration_seconds: number;
  sample_rate: number;
  audio_path: string;
  embedding_path: string;
  source: string;
  license: string;
  attribution: string;
  tags: string[];
}

export interface SoundLibrary {
  version: string;
  generated_at: string;
  feature_names: string[];
  embedding_methods: string[];
  categories: Category[];
  clips: SoundClip[];
}

export interface EmbeddingTrack {
  name: "features" | "pca" | "tsne" | "umap" | "yamnet";
  description_en: string;
  description_es: string;
  dim_labels: string[];
  values: number[][];
}

export interface ClipEmbedding {
  id: string;
  duration_seconds: number;
  sample_rate: number;
  hop_seconds: number;
  num_frames: number;
  tracks: EmbeddingTrack[];
  raw?: {
    rms: number[];
    spectral_centroid_hz: number[];
    dominant_pitch_hz: number[];
  } | null;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "omit" });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} on ${path}`);
  }
  return (await res.json()) as T;
}

export const api = {
  getLibrary: () => getJson<SoundLibrary>("/api/library"),
  getClipEmbedding: (clipId: string) =>
    getJson<ClipEmbedding>(`/api/clip/${encodeURIComponent(clipId)}/embedding`),
  audioUrl: (clipId: string) => `/audio/${encodeURIComponent(clipId)}`
};
