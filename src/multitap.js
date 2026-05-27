// Generic single/double/triple-tap detector.
//
// Two-tier mode (legacy, when no onTriple supplied):
//   Each tap() arms a timer. If a second tap arrives before the window expires,
//   it cancels the pending single and fires the double IMMEDIATELY. Otherwise
//   the single fires after the window. This preserves the snappy v1.5 feel for
//   the existing reset/cycle mapping.
//
// Three-tier mode (when onTriple supplied):
//   1st tap arms a windowMs timer (default 280ms).
//   2nd tap inside that window cancels the timer and arms a shorter
//     tripleWindowMs timer (default 180ms) — does NOT fire double yet.
//   3rd tap inside the triple window cancels the timer and fires onTriple
//     immediately.
//   If the triple window expires with exactly 2 taps, onDouble fires.
//   If the original window expires with exactly 1 tap, onSingle fires.
//   Trade-off: in triple mode, onDouble has up to tripleWindowMs of latency,
//   but onTriple gives us a 3rd reliable discrete gesture without needing
//   any platform feature beyond the pinch indicador we already use.
//
// Usage:
//   const m = createMultitap({ windowMs: 280, onSingle, onDouble });
//   const m3 = createMultitap({ onSingle, onDouble, onTriple });
//   m.tap();   // call on each event

export function createMultitap({
  windowMs = 400,
  tripleWindowMs = 180,
  onSingle,
  onDouble,
  onTriple,
} = {}) {
  let count = 0;
  let timer = null;
  const tripleEnabled = typeof onTriple === 'function';

  function clearTimer() {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function fireAndReset() {
    const c = count;
    count = 0;
    timer = null;
    if (c === 1 && typeof onSingle === 'function') onSingle();
    else if (c === 2 && typeof onDouble === 'function') onDouble();
    else if (c >= 3 && typeof onTriple === 'function') onTriple();
  }

  return {
    tap() {
      count += 1;
      clearTimer();

      // Three-tier path: hold every tap inside a timer to allow a 3rd to land.
      if (tripleEnabled) {
        if (count >= 3) {
          // 3rd tap inside window — fire immediately.
          if (typeof onTriple === 'function') onTriple();
          count = 0;
          return;
        }
        const ms = count === 1 ? windowMs : tripleWindowMs;
        timer = setTimeout(fireAndReset, ms);
        return;
      }

      // Two-tier legacy path: 2nd tap fires double immediately.
      if (count >= 2) {
        if (typeof onDouble === 'function') onDouble();
        count = 0;
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        const c = count;
        count = 0;
        if (c === 1 && typeof onSingle === 'function') onSingle();
      }, windowMs);
    },
    cancel() {
      clearTimer();
      count = 0;
    },
    isPending() {
      return timer != null;
    },
  };
}
