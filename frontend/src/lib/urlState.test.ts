/**
 * Unit tests for the shareable-URL codec.
 *
 * The whole point of encodeState/decodeState is that what you sent
 * round-trips to what the recipient sees, so the tests focus on:
 *  - round-trip fidelity for every supported field
 *  - input validation rejecting malformed shapes (the codec is the
 *    only thing standing between a malicious link and our zustand
 *    store, so it must be strict)
 *  - every RenderMode literal is whitelisted (catches the kind of
 *    drift where a new mode is added to the store but VALID_RENDER_MODES
 *    isn't updated — exact bug found writing this suite)
 */
import { describe, expect, it } from "vitest";

import type { RenderMode } from "../store/useStore";
import { decodeState, encodeState, type SharedState } from "./urlState";

describe("encodeState + decodeState round trip", () => {
  it("round-trips a full state object", () => {
    const state: SharedState = {
      clipId: "bird-house-sparrow",
      comparisonClipId: "music-bach-cello-prelude",
      renderMode: "comet",
      trackName: "yamnet",
      axes: { x: 0, y: 1, z: 2, color: 3, size: 4 }
    };
    const encoded = encodeState(state);
    const decoded = decodeState("#" + encoded);
    expect(decoded).toEqual(state);
  });

  it("round-trips clipId only (other fields stay undefined)", () => {
    const decoded = decodeState("#" + encodeState({ clipId: "foo" }));
    expect(decoded).toEqual({ clipId: "foo" });
  });

  it("preserves null comparisonClipId distinctly from undefined", () => {
    const decoded = decodeState(
      "#" + encodeState({ clipId: "foo", comparisonClipId: null })
    );
    expect(decoded?.clipId).toBe("foo");
    expect(decoded?.comparisonClipId).toBe(null);
  });

  it("preserves non-ASCII characters", () => {
    const decoded = decodeState(
      "#" + encodeState({ clipId: "ave-perdiz-niñera-😀" })
    );
    expect(decoded?.clipId).toBe("ave-perdiz-niñera-😀");
  });
});

describe("decodeState validation", () => {
  it("returns null on empty hash", () => {
    expect(decodeState("")).toBe(null);
    expect(decodeState("#")).toBe(null);
  });

  it("returns null on malformed base64", () => {
    expect(decodeState("#totally not base64 !@#$")).toBe(null);
  });

  it("returns null on non-JSON payload after decode", () => {
    // Valid base64 that decodes to plain text (not JSON)
    expect(decodeState("#" + btoa("hello world"))).toBe(null);
  });

  it("returns null on JSON that is not an object", () => {
    expect(decodeState("#" + btoa(JSON.stringify(["array"])))).toEqual({});
    // null payload returns null
    expect(decodeState("#" + btoa("null"))).toBe(null);
  });

  it("drops fields with wrong types instead of failing", () => {
    const decoded = decodeState(
      "#" +
        btoa(
          JSON.stringify({
            clipId: 12345, // wrong type — should drop
            renderMode: "valid-but-unknown-mode", // not in whitelist
            trackName: "pca" // valid
          })
        )
    );
    expect(decoded?.clipId).toBeUndefined();
    expect(decoded?.renderMode).toBeUndefined();
    expect(decoded?.trackName).toBe("pca");
  });

  it("rejects oversized clipId (>128 chars)", () => {
    const decoded = decodeState(
      "#" + btoa(JSON.stringify({ clipId: "x".repeat(129) }))
    );
    expect(decoded?.clipId).toBeUndefined();
  });

  it("rejects axes with non-integer values", () => {
    const decoded = decodeState(
      "#" +
        btoa(
          JSON.stringify({
            axes: { x: 0.5, y: 1, z: 2, color: 3, size: 4 }
          })
        )
    );
    expect(decoded?.axes).toBeUndefined();
  });

  it("rejects axes with out-of-range values", () => {
    const decoded = decodeState(
      "#" +
        btoa(
          JSON.stringify({
            axes: { x: 32, y: 1, z: 2, color: 3, size: 4 }
          })
        )
    );
    expect(decoded?.axes).toBeUndefined();
  });

  it("rejects axes missing required keys", () => {
    const decoded = decodeState(
      "#" +
        btoa(
          JSON.stringify({
            axes: { x: 0, y: 1 } // missing z, color, size
          })
        )
    );
    expect(decoded?.axes).toBeUndefined();
  });
});

describe("render-mode whitelist parity", () => {
  // This test is the canary: if a new RenderMode literal is added to
  // useStore.ts but not to VALID_RENDER_MODES in urlState.ts, shared
  // links that include the new mode silently drop it on decode.
  // Bug found writing this suite: 'lightpainting' was missing.
  const ALL_MODES: RenderMode[] = [
    "spheres",
    "smoke",
    "bursts",
    "constellation",
    "aurora",
    "comet",
    "tube",
    "galaxy",
    "flowfield",
    "lightpainting"
  ];

  it.each(ALL_MODES)("round-trips renderMode=%s", (mode) => {
    const decoded = decodeState("#" + encodeState({ renderMode: mode }));
    expect(decoded?.renderMode).toBe(mode);
  });
});
