import clipperLib from "js-angusj-clipper";
import type { ClipperLibWrapper } from "js-angusj-clipper";

let instance: ClipperLibWrapper | null = null;
let loading: Promise<ClipperLibWrapper> | null = null;

export function initClipper(): Promise<ClipperLibWrapper> {
  if (instance) return Promise.resolve(instance);
  if (!loading) {
    loading = clipperLib
      .loadNativeClipperLibInstanceAsync(
        clipperLib.NativeClipperLibRequestedFormat.WasmWithAsmJsFallback,
      )
      .then((lib) => {
        instance = lib;
        return lib;
      });
  }
  return loading;
}

/** Only safe to call once `initClipper()` has resolved (gated at app startup). */
export function getClipper(): ClipperLibWrapper {
  if (!instance) {
    throw new Error("Clipper WASM instance not initialised yet");
  }
  return instance;
}

export { clipperLib };
