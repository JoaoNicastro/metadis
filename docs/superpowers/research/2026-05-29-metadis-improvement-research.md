# Metadis Improvement Research — Synthesis

**Project:** metadis — vanilla HTML/CSS/JS + Three.js viewer for the Meta Ray-Ban Display smart glasses. Loads a `.glb` and lets the user rotate/scale/translate/roll/snap it via Neural Band gestures. Live at https://metadis.surge.sh, currently v1.6.

**Synthesis date:** 2026-05-29
**Inputs:** 5 verified research bundles (platform, ecosystem, rendering, ux, viewer), each with findings + candidate ideas + an adversarial verifier's verdicts. All ideas below were cross-checked against the actual repo (`src/main.js`, `src/viewer.js`, `src/physics.js`, `src/input.js`, `src/multitap.js`, `index.html`, `style.css`).

---

## TL;DR

The input vocabulary is **frozen** — every bundle and the official Meta FAQ independently confirm metadis already consumes the entire sanctioned surface (4 swipes as Arrows + index-pinch as Enter, single/double/triple by timing; pinch-middle/Escape is swallowed by the OS; no keyup; no WebXR; head-only IMU). So the highest-leverage work is **NOT new input** — it is (a) **rendering modes that exploit the additive display** (bright outlines/rim-glow/normals on black) and (b) **discoverability/UX** (an on-screen mode map + first-run hint), since a tiny gesture set only feels rich when its state is visible and self-teaching.

The recommended next version pairs a **Display-mode toggle (wireframe → x-ray rim glow → normals)** with a **visible HUD mode map + first-run onboarding + bright motion/brightness feedback**, plus two cheap, high-value enablers that don't touch input at all: **GPU-dispose on model swap** (fixes a real VRAM leak) and **built-in glTF animation playback** (we already load `gltf` and throw the clips away).

---

## Big cross-cutting themes

1. **The input model is locked — stop wishing for new channels, exploit the discrete vocabulary.** The official Meta Wearables FAQ, the starter kit, and the project's own on-device postmortems all agree: 4 swipes + index-pinch is everything. Pinch-middle (Escape/"back") is intercepted by the OS *before* a KeyboardEvent is dispatched — the verifier flatly **refuted** the "test for a 5th Escape command" idea against metadis's own paid-for evidence (commit `cd05a5b`, `main.js` lines 191-198). Every shippable idea reuses the existing swipes + single/double/triple pinch + the 5-mode cycle.

2. **Additive optics reward bright outlines on black; the current PBR-fill look is the single biggest visual liability.** `viewer.js` renders everything with `MeshStandardMaterial` + ambient/directional light, which reads as a dim grey blob because black = transparent and dark/mid-tone fills fall below the visibility floor. Three independent sources converge on the fix (Google's "Glimmer" HUD guidance, OST-AR research, and the rendering bundle): **outlines not fills, maintain intensity over saturation, heavier strokes.** Wireframe edges, a Fresnel rim-glow, `MeshNormalMaterial`, and selective Bloom all map perfectly onto an additive panel and cost ~0KB (all in core three@0.184.0, already imported).

3. **State is invisible; discoverability is the UX bottleneck.** The only feedback today is a single 14px line at `opacity: 0.85` top-left (`style.css .hud`, `#status`). There is no onboarding, no mode map, no transient confirmation. NN/G + smart-glasses UX research are emphatic: a tiny mode-driven UI **must** show the active mode with ≥2 redundant salient signals, signal changes with motion/brightness transients (the periphery cannot read color or text), and onboard by *showing* gestures once (localStorage-gated), not describing them. This is pure DOM/CSS/canvas work that respects every constraint.

4. **A pile of "real 3D viewer" features port cleanly to discrete gestures — and nobody else on this platform ships them.** The native DAT SDK literally can't push pixels to the HUD or read the Neural Band yet, and the GitHub ecosystem is text/voice overlays. metadis doing real WebGL is differentiated. Screen-space / render-state features (display modes, camera/orientation presets, animation playback, explode, section/clipping) only need to be *triggered*, which swipes + a mode slot do cleanly. Continuous-drag, picking, WebXR/AR, and HDR/skybox features **don't** port (no keyup, no pointer, no `navigator.xr`, and bright washes ruin the see-through panel).

5. **Small, real hygiene wins are sitting in the code.** `setCurrentModel` only calls `scene.remove` and never disposes geometry/material/texture — a confirmed VRAM leak across model swaps that matters under the 128MB cap. The WebXR/ARButton path (`main.js` 64-149, 217-245) is verified dead on-device. `gltf.animations` is loaded and discarded. `localStorage` is available but used nowhere. These are cheap to fix and they unblock the bigger features.

---

## Ranked backlog (impact-to-effort, best first)

All `fitsConstraints = true` (ideas that failed verification, e.g. the Escape-command test, are dropped — see "Dropped / not pursued").

| # | Title | Impact | Effort | Files | Why it's cool |
|---|-------|--------|--------|-------|---------------|
| 1 | **Display-mode toggle (wireframe → x-ray rim glow → normals)** | high | M | `src/viewer.js`, `src/main.js`, new `src/materials.js`, `tests/materials.test.js` | Turns the dim grey blob into a bright "hologram" that actually reads on an additive panel — the device's killer aesthetic. |
| 2 | **Visible HUD mode map + bright transient feedback** | high | S | `index.html`, `style.css`, `src/main.js`, new `src/hud.js` | Makes the invisible 5-mode state machine self-explanatory with one glyph + 4 edge labels + a motion/brightness pulse on every change. |
| 3 | **First-run gesture onboarding (localStorage-gated, `?tutorial=1` replay)** | high | M | `index.html`, `style.css`, `src/main.js`, `src/hud.js`, new `tests/hud.test.js` | The single biggest discoverability gap — shows the 4 swipes + pinch once, dismisses on first real gesture, never nags again. |
| 4 | **GPU dispose-on-swap + pixelRatio cap 1.5 (perf hardening)** | medium | S | `src/viewer.js`, `tests/viewer.test.js` (new) | Fixes a real VRAM leak and cuts fragment cost ~40% on the fixed 600×600 HUD — makes room for every visual mode above. |
| 5 | **Built-in glTF animation playback ("play" mode)** | high | M | `src/viewer.js`, `src/main.js` | We already parse the `.glb` and *throw the clips away*; one `mixer.update(dt)` line turns metadis into an animation viewer for any rigged asset. |
| 6 | **Camera/orientation presets ("views" mode: Front/Right/Top/Iso)** | medium | S | `src/main.js`, `src/physics.js` | 4 swipes slerp the model to named, repeatable viewpoints — absolute views to complement the existing relative 45° snap. |
| 7 | **Explode mode (fill the reserved slot)** | medium | M | `src/main.js`, `src/viewer.js` | The canonical CAD-viewer move adapted to a scalar swipe; up/down pushes parts outward — shows off multi-part `.glb`s. Gate to a no-op on single-mesh. |
| 8 | **On-demand control cheat-sheet (summoned, foveal)** | medium | M | `src/main.js`, `src/hud.js`, `style.css` | Deep help on demand instead of permanent clutter — but it needs an input-budget decision (triple-pinch is taken by spin). |
| 9 | **Mode-ring picker on double-pinch (Secret-of-Mana rotation)** | medium | M | `src/main.js`, `src/hud.js`, `style.css` | Promotes the blind cycle into a visible self-teaching ring — highest UX polish, but it adds a modal state to the input machine. |
| 10 | **Selective Bloom glow (default-off toggle / `?bloom=1`)** | high | L | `src/viewer.js`, `src/main.js` | On additive optics, bloom on bright pixels reads as genuine holographic glow — the biggest "wow", gated behind an FPS check. |
| 11 | **Section / clipping-plane mode (bright cut edge)** | medium | M | `src/main.js`, `src/viewer.js` | Discrete swipe-stepped slicing reveals interior structure — useful inspection, but the cut cap needs care to read on additive. |
| 12 | **Snap-mode orientation tick ring** | low | M | `src/main.js`, `src/hud.js` | A bright 8-tick ring (360/45 = 8) makes the discrete snap mode visibly advance one tick per swipe. |
| 13 | **Delete dead WebXR/ARButton path** | low | S | `src/main.js`, `style.css`, `index.html` | Removes a confusing on-device no-op and the `#xr-slot` plumbing. Small byte win, real clarity win. |
| 14 | **One-tap deeplink/QR install flow (desktop/landing only)** | medium | S | `index.html`, `style.css`, new `src/install.js` | Officially-sanctioned distribution during Developer Preview; a phone scan installs to the glasses. **Validate the `fb-viewapp://` payload on a real phone before shipping.** |
| 15 | **Screenshot / capture-to-PNG action** | low | S | `src/viewer.js`, `src/main.js` | One-gesture frame capture (needs `preserveDrawingBuffer` or a synchronous render). Low on-device payoff — the headset has no share UI. |
| 16 | **Opt-in world-lock + head-flick commands (rotationRate spike)** | medium | M | new `src/headflick.js`, `src/main.js`, `src/imu.js` | Uses head angular *velocity* as a gesture (not gaze mapping), sidestepping "object follows gaze". **Spike first:** unverified whether a synthetic keydown satisfies the `requestPermission()` gesture gate. |
| 17 | **Geolocation-driven sun/key-light direction** | low | M | `src/viewer.js`, `src/main.js` | Phone GPS (auto-granted, no prompt) orients the directional light by local time/lat-long. Subtle payoff on a monocular additive HUD — a nice touch, not a feature. |
| 18 | **glTF material variants (`KHR_materials_variants`) cycle** | low | M | `src/viewer.js`, `src/main.js` | Swipe to cycle material configs — niche, only helps assets authored with variants; r184 access API needs a quick check. |
| 19 | **Predefined annotations / hotspot autopilot (URL/JSON)** | low | M | `src/viewer.js`, `src/main.js`, `src/hud.js` | Author-supplied numbered billboards stepped by swipe — respects "no picking", but requires the model author to ship annotation data. |

### Detailed entries (the load-bearing items)

**1. Display-mode toggle (wireframe → x-ray rim glow → normals)** — *high impact, M*
Add a `display` mode (or a dedicated render-style cycle) where the 4 swipes step Solid → Wireframe (`EdgesGeometry` ~25° threshold + bright `LineBasicMaterial`/`Line2`) → Fresnel x-ray (tiny custom `ShaderMaterial`, additive: camera-facing fragments → black/transparent, grazing edges → bright) → Normals (`MeshNormalMaterial`). Persist the choice in `localStorage`. **Constraint fit:** pure render-state swaps triggered by existing swipes + a mode slot; no new input/sensor/network. Bright-on-black is exactly what the additive panel shows. **Implementation notes:** the loaded model is a `Group` — traverse all child meshes and stash/restore original materials per-mesh; x-ray/normals override PBR so textured assets lose their look *in those modes* (acceptable for an inspection mode). For genuinely *bold* strokes use `three/examples/jsm/lines/Line2` (1px `LineBasicMaterial` is the riskiest legibility case — thin dim lines vanish). Touches `src/viewer.js`, `src/main.js`, new `src/materials.js`, `tests/materials.test.js`.

**2. Visible HUD mode map + bright transient feedback** — *high impact, S*
Replace the dim top-left text with (a) a large bright-white **mode glyph** top-center, (b) four **edge labels** (top/bottom/left/right) showing each swipe's current-mode action, and (c) a **~250ms full-frame bright border pulse** + ~2.5s transient glyph flash on every mode switch / spin toggle / reset. Hook into the existing `cycleMode` / `toggleSpin` / `resetAll` / `refreshStatus` path in `main.js`. **Constraint fit:** DOM/CSS + cheap canvas animation, zero new input; the 4 labels map 1:1 to the 4 real swipe directions. Motion + brightness transients are the *one* feedback type that works on a monocular additive periphery. **Caveat:** short text labels are only foveally legible — the *glyph* (not the labels) carries the redundant peripheral signal; do **not** add a "dark backing chip" (visionOS guidance for subtractive glass) — black is invisible on an additive panel. Touches `index.html`, `style.css`, `src/main.js`, new `src/hud.js`.

**3. First-run gesture onboarding** — *high impact, M*
On first launch (gated by a `localStorage` flag), show a high-contrast centered card: 4 large white arrow glyphs + a pinch glyph labeled with their current-mode (rotate) actions. Auto-dismiss on the user's first real swipe/pinch; never show again; `?tutorial=1` replays. **Constraint fit:** uses only existing input to dismiss; localStorage is a standard web API. **Caveat the verifier flagged:** the dismiss handler **must swallow the first gesture** so the user doesn't accidentally fire a rotate/reset on their first pinch. localStorage is unverified on-device — the `?tutorial=1` fallback de-risks it. Touches `index.html`, `style.css`, `src/main.js`, `src/hud.js`, new `tests/hud.test.js`.

**4. GPU dispose-on-swap + pixelRatio cap 1.5** — *medium impact, S*
In `setCurrentModel`, before `scene.remove`, traverse the old root and call `geometry.dispose()` / `material.dispose()` / `texture.dispose()`. Lower `setPixelRatio(Math.min(dpr, 2))` to `1.5` on the fixed-size panel. **Constraint fit:** pure within-budget optimization, no new input/dep. **Verified:** `viewer.js` lines 44-51 only `scene.remove` (real leak); line 16 caps at 2. Direction of the pixelRatio win is right (~40% fewer shaded pixels 2.0→1.5). Touches `src/viewer.js`, new `tests/viewer.test.js`.

**5. Built-in glTF animation playback** — *high impact, M*
Build a `THREE.AnimationMixer` from `gltf.animations` on load; add `mixer.update(dt)` to the existing `step()` (dt already computed/clamped). New `play` mode: pinch = play/pause, ←/→ = clip index, ↑/↓ = speed. Auto-skip the mode + HUD-hint when `gltf.animations.length === 0`. **Constraint fit:** entirely discrete-triggered (no hold/continuous); exploits the GLTFLoader we already ship. **Verified:** `viewer.js` `loadModel` resolves only `gltf.scene` and discards animations — it must be changed to surface `gltf.animations` to `main.js`; clip playback and spin physics must be allowed to coexist. Touches `src/viewer.js`, `src/main.js`.

**6. Camera/orientation presets ("views" mode)** — *medium impact, S*
Each of 4 swipes slerps `model.quaternion` toward a canonical orientation (Front/Right/Top/Iso); pinch returns to Front. **Constraint fit:** 4 discrete directions + a mode slot; orientation written to the model (not driven by gaze, so no head-IMU problem). Reuses the existing "cancel spin then set rotation" pattern from `applySnap()`. **Note:** physics integrates into `object.rotation` (Euler) additively — suppress integration (zero velocity) while lerping to the quaternion target. Touches `src/main.js`, `src/physics.js`.

**7. Explode mode** — *medium impact, M*
On load, cache each child mesh's base position + a normalized outward offset from the model centroid. In explode mode, ↑/↓ drive a 0..1 factor (lerp parts outward), ←/→ rotate, pinch collapses. **Constraint fit:** a scalar stepped by swipes, no continuous drag. **Factual correction (verifier):** `explode` is **NOT** in `MODE_CYCLE` (which is `['rotate','scale','translate','roll','snap']`) — it exists only as a comment at `main.js:189`, so this is net-new wiring, not "fill an empty branch". Children can be nested under intermediate transforms — compute offsets from each mesh's world centroid relative to the model centroid (or re-parent to root on load), and capture positions consistently with `fitObjectToView`'s re-centering. Gate to a no-op + HUD hint on single-mesh models. Touches `src/main.js`, `src/viewer.js`.

**8. On-demand control cheat-sheet** — *medium impact, M*
Triple-pinch toggles a full-screen high-contrast help card for the current mode; dismissed by any swipe. **Hard precondition:** triple-pinch is **already** `toggleSpin` (`main.js:352`). This can't ship without either sacrificing the hands-free spin toggle or overloading triple-pinch context-dependently (e.g. spin only in rotate/roll, help elsewhere). Full multi-line text is fine here because it's a summon-on-demand card the user looks *directly* at. Touches `src/main.js`, `src/hud.js`, `style.css`.

**10. Selective Bloom glow** — *high impact, L*
`EffectComposer` + `RenderPass` + `UnrealBloomPass` + `OutputPass` (all present in `examples/jsm`, ~9-10KB raw, trivial vs ~350KB gzip headroom). Put line/rim objects on a BLOOM layer, render low-res selective bloom, composite back. Default-off, toggle via gesture or `?bloom=1`. **Constraint fit:** additive-correct (bloom *adds* light; darkening effects like SSAO/DoF/vignette are useless on a see-through panel and are explicitly excluded). **The one real risk:** multiple full-screen passes + extra render targets at 600×600 threaten 60fps/128MB — that's why it's L and default-off, pending an on-device FPS check. Requires switching `step()`'s `viewer.render()` to `composer.render()`. Touches `src/viewer.js`, `src/main.js`.

**14. One-tap deeplink/QR install flow** — *medium impact, S*
On the **desktop/landing view only** (not the 600×600 HUD), render `fb-viewapp://web_app_deep_link?appName=metadis&appUrl=<encoded https://metadis.surge.sh>` as a QR + a copy-link button. **Constraint fit:** runs off-device, zero glasses runtime cost, no gesture/sensor, well under the 10-request budget. **Caveat:** the exact `fb-viewapp://` scheme string is an external claim the verifier rated `uncertain` and metadis has only ever pasted the raw https URL — **validate the payload on a real phone before shipping**, or an unverified scheme makes the QR a no-op. Touches `index.html`, `style.css`, new `src/install.js`.

**16. Opt-in world-lock + head-flick commands** — *medium impact, M, SPIKE FIRST*
Enter via a mode/triple-pinch, then use `DeviceMotionEvent.rotationRate` threshold-crossings to detect deliberate fast head flicks L/R/U/D as momentary discrete commands; object stays put, slow gaze does nothing. **Constraint fit:** angular *velocity* as a gesture detector ≠ angle mapping, so it sidesteps the empirically-confirmed "object follows gaze feels bad". **Two unresolved risks (verifier `uncertain`):** (1) metadis has never read `DeviceMotionEvent` on-device — unverified the Meta runtime populates `rotationRate`; (2) `requestPermission()` needs a genuine user-gesture, and metadis's only "gestures" are synthetic keydowns with no keyup — untested whether that satisfies the transient-activation gate. **Do an on-device permission + rotationRate spike before committing** (exactly the lesson the project's own postmortem teaches). Touches new `src/headflick.js`, `src/main.js`, `src/imu.js`.

---

## Recommended next-version set

Ship these together as **one release the user can immediately test on-device.** They're all S/M, high-impact, mutually coherent, and deliberately split across the two highest-leverage axes (a big additive-display visual upgrade + a discoverability/UX upgrade), plus two cheap enablers that don't touch input.

1. **Display-mode toggle (#1)** — the big visual upgrade. Wireframe / Fresnel x-ray / normals read *dramatically* better than the current PBR fill on an additive panel. This is the headline.
2. **Visible HUD mode map + bright transient feedback (#2)** — the discoverability upgrade. A bright mode glyph + 4 edge labels + a border-pulse on every change finally makes the frozen 5-mode vocabulary legible and self-teaching.
3. **First-run gesture onboarding (#3)** — completes the discoverability story: a new wearer learns the controls in one glance, then never sees the card again.
4. **GPU dispose-on-swap + pixelRatio 1.5 (#4)** — cheap perf hardening that *defends the budget* while the new render modes (and any future Bloom) are added; also fixes a genuine VRAM leak.
5. **Built-in glTF animation playback (#5)** — disproportionate value for the effort: we already parse the clips and discard them. Turns metadis from a static-object spinner into an animation viewer, and it's pure discrete triggering.

**Why this set and not the flashier ones:**
- **Bloom (#10)** is the single biggest "wow" but it's **L** and carries a real 60fps/128MB risk that needs an on-device profiling pass — hold it for the version *after* #4 lands the perf headroom, then ship it default-off behind `?bloom=1`.
- **Mode-ring picker (#9)** and **on-demand cheat-sheet (#8)** add genuine UX polish but each mutates the input state machine (modal state / reassigning triple-pinch from spin). The lighter mode map (#2) + onboarding (#3) deliver most of the discoverability win with none of that risk — do the ring/cheat-sheet only after the simple HUD proves out on-device.
- **Head-flick (#16)** and the **QR installer (#14)** both depend on **unverified** external facts (the `requestPermission` gesture gate; the `fb-viewapp://` scheme). They're promising but gated on a spike — don't put them in a release the user is meant to test blind.

This set has no input-vocabulary conflicts: the display-mode cycle lives inside its own mode (reached via the existing double-pinch cycle), animation playback is another mode, and the HUD/onboarding/perf items are orthogonal. It ships as a coherent "metadis reads great and explains itself" release.

---

## Platform updates (new / changed capabilities)

**Net result: nothing on the HARD CONSTRAINTS list has loosened.** All five constraints were re-confirmed by Meta's own Developer-Preview docs and by the project's on-device record. The genuinely *new/actionable* items are capability *details*, not loosenings:

| Update | Status | Source |
|--------|--------|--------|
| Official FAQ confirms the exact input model (4 swipes as arrows, Enter = index pinch, "back" = middle pinch) and **explicitly bans custom Neural Band gestures** | Confirmed; matches metadis verbatim | [Meta Wearables FAQ](https://developers.meta.com/wearables/faq/) |
| Official starter kit ships a **copyable additive-display design system** (cyan focus-glow `box-shadow 0 0 20px rgba(0,212,255,0.4)`, dp type scale H1 28 / Body 16 / Meta 12, 8dp safe-zone, `#1C1E21` panels + `#FFFFFF` text, `.focusable`+`tabindex` focus model) and **performance budgets identical to ours** (load <3s, JS <500KB gz, 60fps, <128MB, <10 requests) | Confirmed; adoptable verbatim for any HUD overlay | [meta-wearables-webapp AGENTS.md](https://raw.githubusercontent.com/facebookincubator/meta-wearables-webapp/main/AGENTS.md) |
| `DeviceMotionEvent.rotationRate` exposes head **angular velocity (deg/s)** — enables discrete "head flick" detection (gesture, not gaze-mapping) | **API documented; UNVERIFIED on this device** — metadis has never read DeviceMotionEvent; spike needed | [add-device-sensors SKILL.md](https://raw.githubusercontent.com/facebookincubator/meta-wearables-webapp/main/plugins/meta-wearables-webapp/skills/add-device-sensors/SKILL.md) |
| Geolocation is **auto-granted** (no permission prompt, phone GPS); motion/orientation require `requestPermission()` triggered by a **user gesture** | Confirmed sensor model; **gesture-satisfiability via synthetic keydown is the open risk** for IMU features | [add-device-sensors SKILL.md](https://raw.githubusercontent.com/facebookincubator/meta-wearables-webapp/main/plugins/meta-wearables-webapp/skills/add-device-sensors/SKILL.md) |
| A community **forward-vector head-tracking library** turns the head IMU into discrete poses (nod yes/no, look L/R/U/D, tilt) for these exact glasses | Encouraging prior art; **unverified** (single social post) | [Luke Hurd / Threads](https://www.threads.com/@lukehurd/post/DYVSVROoN9Z/with-the-announcement-of-the-meta-ray-ban-display-webapp-sdk-today-you-can) |
| Publishing / app store is **NOT open** — distribution is password-protected URL / deeplink sharing, **100-tester cap**; deeplink format `fb-viewapp://web_app_deep_link?appName=<app>&appUrl=<url-encoded>` | Confirmed (no store yet); **exact scheme string unverified** — validate on a real phone | [Build for Display Glasses blog](https://developers.meta.com/blog/build-for-display-glasses/) |
| **No WebXR** (`navigator.xr` absent), no web-app camera, no text/voice API, captouch not a distinct web event (funneled into d-pad keycodes) | Confirmed on-device (`main.js` `setupWebXR` always no-ops) | [Meta Wearables FAQ](https://developers.meta.com/wearables/faq/) |
| **REFUTED:** "Escape/'back' keydown may reach the app as a 5th command" | **False for metadis** — OS intercepts pinch-middle as system back *before* dispatching any KeyboardEvent (commit `cd05a5b`, `main.js` 191-198). The keydown-logger test is itself already done. | metadis on-device record / `main.js` |
| One review claims the display is **full-color** (vs the verified monocular-additive-greenish finding) | **Low confidence**, conflicts with on-device tests; design for worst case (high-contrast bright outlines on black work either way) | [TechNerdo review](https://www.technerdo.com/blog/meta-ray-ban-display-smart-glasses-review-2026) |

---

## Dropped / not pursued

- **"Test for a 5th Escape/back command"** — verifier `buildable=false`. Refuted by metadis's own on-device evidence (OS swallows pinch-middle before any KeyboardEvent; the logger test is already built in `spike/`). The premise (a usable command that empirically doesn't exist) is dead.
- **Any AR / WebXR / spatial-placement feature** — `navigator.xr` is absent on-device; the existing ARButton/hit-test code is a verified no-op. (Captured instead as #13: *delete* the dead path.)
- **HDR / IBL / skybox environments** — a non-black background becomes a glowing wash over the real world, and soft image-based lighting produces exactly the dim mid-tones that vanish. Only a narrow "hard high-contrast key-light direction" toggle survives (folded into #1/#17).
- **Darkening post-effects (SSAO, DoF, vignette, grain, chromatic aberration)** — on an additive panel, darkening = transparency = invisible (or actively erases the model). Only Bloom (which *adds* light) is worth it (#10).
- **Continuous-drag / pointer-picking features** (measurement, drag-to-place hotspots, slider-driven clipping) — no keyup, no pointer, no hover. Degraded discrete-step versions are what made the cut (#7, #11, #19).
- **"Adopt `.focusable`/tabindex focus model now"** — largely a no-op today: metadis is a single full-bleed canvas driven by global keydown, and the 600×600 viewport is *already* explicit (`index.html`, `style.css`, `viewer.js`). Worth it only once a real navigable menu exists (i.e. after #9).

---

## Appendix: key cited sources

**Official Meta platform**
- Meta Wearables FAQ (input model, sensor list, "no custom gestures", no publishing yet): https://developers.meta.com/wearables/faq/
- Build for Display Glasses launch blog (distribution = deeplink/URL, 100-tester cap, EMG-only input): https://developers.meta.com/blog/build-for-display-glasses/
- `meta-wearables-webapp` AGENTS.md (additive design system, budgets, deeplink format): https://raw.githubusercontent.com/facebookincubator/meta-wearables-webapp/main/AGENTS.md
- create-webapp SKILL.md (canonical keydown handler, Escape→back sample): https://raw.githubusercontent.com/facebookincubator/meta-wearables-webapp/main/plugins/meta-wearables-webapp/skills/create-webapp/SKILL.md
- add-device-sensors SKILL.md (DeviceOrientation/DeviceMotion = head IMU, `rotationRate`, Geolocation = phone, permission model): https://raw.githubusercontent.com/facebookincubator/meta-wearables-webapp/main/plugins/meta-wearables-webapp/skills/add-device-sensors/SKILL.md
- `facebookincubator/meta-wearables-webapp` repo (only ships a D-pad Snake example; no 3D/canvas): https://github.com/facebookincubator/meta-wearables-webapp

**Ecosystem / reviews**
- Ray-Ban Display OS update — GOAT / Hypertrail / Reels input vocabulary: https://www.uploadvr.com/meta-ray-ban-display-first-major-os-update-new-app-minigames-features/
- DAT SDK overview (no HUD imagery, no Neural Band gestures in native): https://dev.to/christophertdoc/meta-wearable-device-access-toolkit-overview-of-the-developer-preview-20e2
- `ray-ban-meta` GitHub topic (ecosystem is text/voice/AI overlays): https://github.com/topics/ray-ban-meta
- Tom's Guide review (gesture misfires, app-open latency): https://www.tomsguide.com/computing/smart-glasses/meta-ray-ban-display-review
- TechNerdo review (disputed full-color claim — low confidence): https://www.technerdo.com/blog/meta-ray-ban-display-smart-glasses-review-2026
- Luke Hurd forward-vector head-tracking lib (discrete poses): https://www.threads.com/@lukehurd/post/DYVSVROoN9Z/with-the-announcement-of-the-meta-ray-ban-display-webapp-sdk-today-you-can

**Rendering on additive displays**
- Google "Glimmer" HUD design language (outlines not fills, intensity over saturation, bold type): https://www.uploadvr.com/google-details-glimmer-its-ui-design-language-for-hud-ar-glasses/
- OST-AR research (additive optics cannot render black): https://arxiv.org/pdf/2101.02847
- Three.js edges rendering (EdgesGeometry/LineSegments, linewidth cap): https://discourse.threejs.org/t/how-to-render-geometry-edges/5745
- mattdesl/webgl-wireframes (barycentric thick wireframes): https://github.com/mattdesl/webgl-wireframes
- Fresnel/toon shader recipe: https://www.maya-ndljk.com/blog/threejs-basic-toon-shader
- MeshToonMaterial + OutlineEffect: https://sbcode.net/threejs/meshtoonmaterial/
- OutlineEffect vs OutlinePass: https://discourse.threejs.org/t/outlinepass-with-effectcomposer-or-outlineeffect/19790
- UnrealBloomPass docs (cost): https://threejs.org/docs/pages/UnrealBloomPass.html
- Three.js best-practices (dispose, draw calls, pixelRatio): https://www.utsubo.com/blog/threejs-best-practices-100-tips

**UX for minimal-input smart glasses**
- NN/G — Modes in User Interfaces (redundant salient mode indicators; spring-loaded modes need keyup we lack): https://www.nngroup.com/articles/modes/
- NN/G — Onboarding Tutorials (show, don't tell; just-in-time; fade after first use): https://www.nngroup.com/articles/onboarding-tutorials/
- Player Research — Perceiving without looking (periphery = motion + brightness, not color/text): https://www.playerresearch.com/learn/perceiving-without-looking-designing-huds-for-peripheral-vision/
- Android XR — AI-Glasses design principles (glanceable, transient, low density): https://developer.android.com/design/ui/ai-glasses/guides/foundations/design-principles
- History of radial menus (Secret of Mana rotation model for d-pad-limited selection): https://medium.com/design-bootcamp/the-history-of-radial-menus-in-video-games-e6968bb1bac6
- Apple visionOS HIG (white/heavier type on variable background; flat hierarchy — note: dark backing is a no-op on *additive*): https://developer.apple.com/design/human-interface-guidelines/designing-for-visionos
- Toast-duration best practices (~2-3s transient confirmation): https://www.magicbell.com/blog/what-is-a-toast-message-and-how-do-you-use-it

**Best-in-class 3D viewers (feature families)**
- Sketchfab interface/options (wireframe, MatCap, Shadeless): https://support.fab.com/s/article/Interface-and-Options
- Sketchfab Model Inspector (debug channels, annotations): https://help.sketchfab.com/hc/en-us/articles/115004862686-Model-Inspector
- model-viewer staging & camera control (auto-rotate, presets, environment): https://modelviewer.dev/examples/staging-and-camera-control.html
- discoverthreejs animation system (AnimationMixer): https://discoverthreejs.com/book/first-steps/animation-system/
- Khronos glTF Sample Viewer (download PNG, per-channel debug): https://github.khronos.org/glTF-Sample-Viewer-Release/
- KHR_materials_variants (Khronos Sample Viewer): https://github.com/KhronosGroup/glTF-Sample-Viewer
- ExplodeView (exploded assemblies): https://explodeview.com/
- NIST CAD-PMI section views (clipping planes): https://pages.nist.gov/CAD-PMI-Testing/section-views.html
- Apple Quick Look AR (the non-portable AR family): https://developer.apple.com/augmented-reality/quick-look/
- Sketchfab features (post-processing suite — Bloom is the additive-friendly one): https://sketchfab.com/features
