import { useTranslation } from "react-i18next";

import { useStore } from "../store/useStore";

/**
 * Top-right toast stack for user-visible errors.
 *
 * Two error channels live in the store:
 *  - libraryError: /api/library failed; nothing to show in the app. The
 *    user gets a "Retry" button that reloads the page (the cleanest way
 *    to re-bootstrap the i18n + zustand state without dragging a
 *    debounced retry through every consumer).
 *  - audioError: the <audio> element fired an error event, OR an
 *    embedding fetch failed. Dismissible because playback can recover
 *    on the next clip click.
 *
 * Both auto-clear on a successful re-attempt (onPlay -> setAudioError(null),
 * /api/library .then -> setLibraryError(null)).
 */
export function Toasts() {
  const { t } = useTranslation();
  const libraryError = useStore((s) => s.libraryError);
  const audioError = useStore((s) => s.audioError);
  const setLibraryError = useStore((s) => s.setLibraryError);
  const setAudioError = useStore((s) => s.setAudioError);

  if (!libraryError && !audioError) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 1000,
        maxWidth: 360
      }}
    >
      {libraryError && (
        <div
          style={{
            background: "#552a2a",
            color: "#fff",
            padding: "12px 14px",
            borderRadius: 6,
            border: "1px solid #803535",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            fontSize: "0.9em"
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {t("error.library_title")}
          </div>
          <div style={{ opacity: 0.85, marginBottom: 8 }}>{libraryError}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => window.location.reload()}
              style={{ flex: 1 }}
            >
              {t("error.retry")}
            </button>
            <button onClick={() => setLibraryError(null)}>
              {t("error.dismiss")}
            </button>
          </div>
        </div>
      )}
      {audioError && (
        <div
          style={{
            background: "#4a3a1f",
            color: "#fff",
            padding: "12px 14px",
            borderRadius: 6,
            border: "1px solid #6e5a30",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            fontSize: "0.9em"
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {t("error.audio_title")}
          </div>
          <div style={{ opacity: 0.85, marginBottom: 8 }}>{audioError}</div>
          <button onClick={() => setAudioError(null)} style={{ width: "100%" }}>
            {t("error.dismiss")}
          </button>
        </div>
      )}
    </div>
  );
}
