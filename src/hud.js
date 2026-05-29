// HUD overlay for the Meta Display's additive panel.
//
// Design constraints (from on-device research):
// - Black is transparent; only bright pixels show. So: white/bright text, no
//   dark backing chips (they'd be invisible anyway).
// - The periphery perceives MOTION and BRIGHTNESS, not color or small text.
//   So the big center mode glyph + a full-frame brightness pulse carry the
//   "something changed" signal; the small edge labels are foveal detail.
// - Input is frozen (4 swipes + pinch), so the 4 edge labels map 1:1 to the
//   4 real swipe directions and the bottom legend documents the pinch counts.
//
// Pure DOM/CSS — no Three, no canvas, testable in jsdom. createHud builds its
// own nodes under `mount` and returns a small imperative API.

const FLASH_MS = 250;     // full-frame border pulse duration
const GLYPH_FLASH_MS = 1600; // mode glyph stays bright after a change, then dims

export function createHud(mount, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) {
    // No DOM (shouldn't happen on device or in jsdom) — return inert API.
    const noop = () => {};
    return { setMode: noop, flash: noop, showOnboard: noop, hideOnboard: noop, isOnboardVisible: () => false, el: null };
  }

  const layer = doc.createElement('div');
  layer.className = 'hud-layer';

  const flash = doc.createElement('div');
  flash.className = 'hud-flash';

  const glyph = doc.createElement('div');
  glyph.className = 'hud-mode';

  const sub = doc.createElement('div');
  sub.className = 'hud-sub';

  const edges = {};
  for (const side of ['top', 'bottom', 'left', 'right']) {
    const e = doc.createElement('div');
    e.className = `hud-edge hud-edge-${side}`;
    edges[side] = e;
    layer.appendChild(e);
  }

  const legend = doc.createElement('div');
  legend.className = 'hud-legend';
  legend.textContent = '● reset   ●● mode   ●●● spin';

  const onboard = doc.createElement('div');
  onboard.className = 'hud-onboard';
  onboard.style.display = 'none';
  onboard.innerHTML = `
    <div class="ob-title">METADIS</div>
    <div class="ob-grid">
      <div class="ob-arrow ob-up">↑</div>
      <div class="ob-arrow ob-left">←</div>
      <div class="ob-pinch">●</div>
      <div class="ob-arrow ob-right">→</div>
      <div class="ob-arrow ob-down">↓</div>
    </div>
    <div class="ob-legend">
      swipe = move · ● pinch = reset · ●● = next mode · ●●● = spin
    </div>
    <div class="ob-start">swipe or pinch to start</div>
  `;

  layer.appendChild(flash);
  layer.appendChild(glyph);
  layer.appendChild(sub);
  layer.appendChild(legend);
  layer.appendChild(onboard);
  mount.appendChild(layer);

  let flashTimer = null;
  let glyphTimer = null;

  function setMode({ name, index, total, edges: edgeLabels = {}, extra = '' } = {}) {
    glyph.textContent = (name || '').toUpperCase();
    let s = '';
    if (typeof index === 'number' && typeof total === 'number') s = `${index + 1}/${total}`;
    if (extra) s = s ? `${s} · ${extra}` : extra;
    sub.textContent = s;
    edges.top.textContent = edgeLabels.up || '';
    edges.bottom.textContent = edgeLabels.down || '';
    edges.left.textContent = edgeLabels.left || '';
    edges.right.textContent = edgeLabels.right || '';
  }

  function doFlash() {
    flash.classList.remove('on');
    glyph.classList.add('bright');
    // Force reflow so re-adding the class restarts the CSS transition.
    void flash.offsetWidth;
    flash.classList.add('on');
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => flash.classList.remove('on'), FLASH_MS);
    if (glyphTimer) clearTimeout(glyphTimer);
    glyphTimer = setTimeout(() => glyph.classList.remove('bright'), GLYPH_FLASH_MS);
  }

  function showOnboard() { onboard.style.display = ''; }
  function hideOnboard() { onboard.style.display = 'none'; }
  function isOnboardVisible() { return onboard.style.display !== 'none'; }

  return {
    setMode,
    flash: doFlash,
    showOnboard,
    hideOnboard,
    isOnboardVisible,
    el: layer,
  };
}
