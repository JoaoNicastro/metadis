// Generic single/double-tap detector.
//
// Each tap() arms a timer. If a second tap arrives before the window expires,
// it cancels the pending single and fires the double instead. Otherwise the
// single fires after the window.
//
// Usage:
//   const m = createMultitap({ windowMs: 400, onSingle, onDouble });
//   m.tap();   // call on each event
//
// Why a module instead of inline state: main.js had two near-identical
// instances of this logic (`lastEnter`/`lastBack`) — replacing them with a
// shared abstraction makes the multitap semantics explicit and testable.

export function createMultitap({ windowMs = 400, onSingle, onDouble } = {}) {
  let pending = null; // pending single's timer id

  function clearPending() {
    if (pending != null) {
      clearTimeout(pending);
      pending = null;
    }
  }

  return {
    tap() {
      if (pending != null) {
        // Second tap inside the window → fire double, cancel pending single.
        clearPending();
        if (typeof onDouble === 'function') onDouble();
        return;
      }
      pending = setTimeout(() => {
        pending = null;
        if (typeof onSingle === 'function') onSingle();
      }, windowMs);
    },
    cancel() {
      clearPending();
    },
    isPending() {
      return pending != null;
    },
  };
}
