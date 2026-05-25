# Meta Display 3D Viewer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o Web App vanilla pros Meta Ray-Ban Display que carrega um `.glb` de uma URL, renderiza num canvas 600×600, e aplica física rotacional (impulso angular + damping) em resposta aos eventos de d-pad (setas + Enter/Escape) da Neural Band.

**Architecture:** Vite + Three.js + JS vanilla. Quatro módulos com responsabilidades isoladas: `viewer.js` (renderização), `physics.js` (modelo físico puro, testável), `input.js` (keyboard listeners), `main.js` (cola). Spike inicial valida WebGL e mapeamento de teclas no device antes de fechar escopo.

**Tech Stack:** Node 20+, Vite (≥5; instala como 8.x na prática), Three.js (≥0.160), Vitest pra unit tests, GLTFLoader pra `.glb`. Deploy estático no Vercel.

**Spec de origem:** [docs/superpowers/specs/2026-05-25-meta-display-3d-viewer-design.md](../specs/2026-05-25-meta-display-3d-viewer-design.md)

---

## Mapa de arquivos

```
metadis/
├── docs/superpowers/
│   ├── specs/2026-05-25-meta-display-3d-viewer-design.md
│   └── plans/2026-05-25-meta-display-3d-viewer.md   ← este plano
├── public/
│   └── fallback.glb               # sample model (DamagedHelmet do Khronos)
├── src/
│   ├── viewer.js                  # Three.js scene, camera, lights, GLTFLoader
│   ├── physics.js                 # angularVelocity + applyImpulse + step + damping
│   ├── input.js                   # keydown listeners + callbacks
│   └── main.js                    # bootstrap: lê query param, monta cena, conecta
├── tests/
│   ├── physics.test.js            # unit tests do módulo físico
│   └── input.test.js              # unit tests do mapeamento de input
├── spike/                          # spike inicial (descartável)
│   └── index.html                 # cubo girando + key logger pra device test
├── index.html                     # entry HTML real
├── style.css                      # full-screen black background
├── package.json
├── vite.config.js
├── vitest.config.js
├── .gitignore
└── README.md
```

**Justificativa da decomposição:** `physics.js` é puro JS, sem deps de Three nem DOM → 100% unit-testável. `viewer.js` encapsula Three.js, expõe interface mínima (loadModel, render, getObject). `input.js` é shim fino que vira keyboard em callbacks — também testável. `main.js` é a única peça que conhece todos os módulos. Esse split garante que um bug em renderização não derruba a física e vice-versa.

---

## Convenção de commits

Cada task termina com **um único commit atômico**. Mensagem: `<tipo>: <descrição curta>`, tipos: `feat`, `test`, `chore`, `docs`, `spike`. Co-Authored-By: Claude no rodapé.

---

## Task 1: Scaffold do projeto Vite + dependências

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `vitest.config.js`
- Create: `.gitignore`

- [ ] **Step 1.1: Inicializar package.json**

Rodar:
```bash
cd /Users/joaosmac/metadis
npm init -y
```

Editar `package.json` resultante pra ficar exatamente:
```json
{
  "name": "metadis",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 1.2: Instalar dependências**

```bash
npm install three
npm install -D vite vitest jsdom
```

Expected: `node_modules/` criado, `package-lock.json` criado, sem erros.

- [ ] **Step 1.3: Criar `vite.config.js`**

```js
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2020',
  },
});
```

- [ ] **Step 1.4: Criar `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

- [ ] **Step 1.5: Criar `.gitignore`**

```
node_modules
dist
.DS_Store
.env
.vercel
*.log
```

- [ ] **Step 1.6: Commit**

```bash
git add package.json package-lock.json vite.config.js vitest.config.js .gitignore
git commit -m "$(cat <<'EOF'
chore: scaffold Vite + Vitest project

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Spike — validar WebGL e mapeamento de teclas no device

**Goal do spike:** confirmar (a) Three.js renderiza no Meta Display, (b) que tecla o gesto "back" da Neural Band gera. Página descartável que pode ser deletada depois.

**Files:**
- Create: `spike/index.html`

- [ ] **Step 2.1: Criar `spike/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=600, height=600, initial-scale=1" />
    <title>Spike — WebGL + key logger</title>
    <style>
      html, body { margin: 0; padding: 0; background: #000; color: #fff; font-family: monospace; overflow: hidden; }
      #app { width: 600px; height: 600px; position: relative; }
      canvas { display: block; }
      #log {
        position: absolute;
        top: 8px;
        left: 8px;
        font-size: 14px;
        line-height: 1.3;
        white-space: pre;
        pointer-events: none;
      }
    </style>
  </head>
  <body>
    <div id="app">
      <div id="log">spike: webgl + key logger</div>
    </div>
    <script type="module">
      import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

      const app = document.getElementById('app');
      const log = document.getElementById('log');

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      camera.position.z = 3;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setSize(600, 600);
      renderer.setClearColor(0x000000);
      app.appendChild(renderer.domElement);

      const geom = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.6 });
      const cube = new THREE.Mesh(geom, mat);
      scene.add(cube);

      scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      const dir = new THREE.DirectionalLight(0xffffff, 0.8);
      dir.position.set(2, 2, 3);
      scene.add(dir);

      const lines = ['spike: webgl + key logger', `webgl: ${!!renderer.getContext()}`];
      const pushLine = (s) => {
        lines.push(s);
        while (lines.length > 12) lines.shift();
        log.textContent = lines.join('\n');
      };

      window.addEventListener('keydown', (e) => {
        pushLine(`key=${e.key} code=${e.code}`);
      });

      window.addEventListener('pause', () => pushLine('event:pause'));
      window.addEventListener('resume', () => pushLine('event:resume'));
      window.addEventListener('stop', () => pushLine('event:stop'));

      let last = performance.now();
      let frames = 0;
      let fpsLastReport = last;

      function tick(now) {
        const dt = (now - last) / 1000;
        last = now;
        cube.rotation.x += 0.6 * dt;
        cube.rotation.y += 0.8 * dt;
        renderer.render(scene, camera);
        frames++;
        if (now - fpsLastReport > 1000) {
          pushLine(`fps≈${frames}`);
          frames = 0;
          fpsLastReport = now;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    </script>
  </body>
</html>
```

- [ ] **Step 2.2: Subir Vite servindo a pasta spike pra teste local**

Confirmar que o spike funciona em desktop antes do device:
```bash
npx vite spike --port 5174
```
Abrir `http://localhost:5174` no Chrome (DevTools → device emulation 600×600). Esperado: cubo girando, log mostrando fps e qualquer tecla pressionada.

Parar o servidor com Ctrl+C.

- [ ] **Step 2.3: Commit do spike**

```bash
git add spike/
git commit -m "$(cat <<'EOF'
spike: WebGL cube + key logger for device test

Standalone HTML page (CDN Three.js) to validate two assumptions on
Meta Ray-Ban Display before fleshing out the viewer:
1. WebGL renders legibly on the additive display.
2. Which keydown the Neural Band "back" gesture emits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2.4: Deploy do spike + teste no device (manual, requer usuário)**

Esta etapa precisa do usuário com os óculos em mãos:

1. Subir a pasta `spike/` num host HTTPS (pode usar `npx vercel --prod spike/` ou um quick deploy do Cloudflare Pages).
2. Pelo Meta AI app → Developer Mode → Add a Web App → colar URL.
3. Abrir nos óculos.
4. Anotar (registrar no plano ou num arquivo `spike/findings.md`):
   - WebGL renderizou? S/N
   - FPS aproximado (lido no log da própria página)
   - Cubo legível no display aditivo? S/N
   - Que tecla o swipe esquerda/direita/cima/baixo dispara?
   - Que tecla a pinça polegar+indicador (select) dispara?
   - Que tecla a pinça polegar+médio (back) dispara?

**Decisão de continuação:** se WebGL ok, seguir pra Task 3. Se WebGL falhar, replanejar pra Canvas2D/SVG (fora do escopo deste plano).

---

## Task 3: HTML shell + style

**Files:**
- Create: `index.html`
- Create: `style.css`

- [ ] **Step 3.1: Criar `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=600, height=600, initial-scale=1" />
    <title>Metadis Viewer</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <div id="app">
      <div id="status" class="hud">loading...</div>
    </div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 3.2: Criar `style.css`**

```css
html, body {
  margin: 0;
  padding: 0;
  background: #000;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, "SF Mono", monospace;
  overflow: hidden;
  height: 100vh;
}

#app {
  width: 600px;
  height: 600px;
  position: relative;
  margin: 0 auto;
}

#app canvas {
  display: block;
  width: 600px;
  height: 600px;
}

.hud {
  position: absolute;
  top: 8px;
  left: 8px;
  font-size: 14px;
  line-height: 1.3;
  white-space: pre;
  pointer-events: none;
  opacity: 0.85;
}
```

- [ ] **Step 3.3: Commit**

```bash
git add index.html style.css
git commit -m "$(cat <<'EOF'
feat: HTML shell and styles for 600x600 viewer

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Physics module (TDD)

Módulo puro, sem deps de Three.js nem DOM. 100% unit-testável.

**Files:**
- Create: `tests/physics.test.js`
- Create: `src/physics.js`

- [ ] **Step 4.1: Escrever o primeiro teste falhante**

`tests/physics.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { createPhysics } from '../src/physics.js';

describe('physics', () => {
  let physics;

  beforeEach(() => {
    physics = createPhysics();
  });

  it('starts with zero angular velocity', () => {
    expect(physics.getVelocity()).toEqual({ x: 0, y: 0, z: 0 });
  });
});
```

- [ ] **Step 4.2: Rodar o teste e ver falhar**

```bash
npx vitest run tests/physics.test.js
```
Expected: FAIL com erro "Cannot find module '../src/physics.js'".

- [ ] **Step 4.3: Implementação mínima de `src/physics.js`**

```js
export function createPhysics() {
  const velocity = { x: 0, y: 0, z: 0 };

  return {
    getVelocity() {
      return { ...velocity };
    },
  };
}
```

- [ ] **Step 4.4: Rodar o teste e ver passar**

```bash
npx vitest run tests/physics.test.js
```
Expected: PASS.

- [ ] **Step 4.5: Adicionar teste de `applyImpulse`**

Append em `tests/physics.test.js`:
```js
  it('applies impulse on the y axis', () => {
    physics.applyImpulse('y', 2.5);
    expect(physics.getVelocity()).toEqual({ x: 0, y: 2.5, z: 0 });
  });

  it('accumulates impulses on the same axis', () => {
    physics.applyImpulse('y', 1);
    physics.applyImpulse('y', 1);
    expect(physics.getVelocity().y).toBe(2);
  });

  it('clamps velocity to MAX_VELOCITY (15 rad/s)', () => {
    for (let i = 0; i < 20; i++) physics.applyImpulse('x', 5);
    expect(physics.getVelocity().x).toBe(15);
  });

  it('clamps negative velocity to -MAX_VELOCITY', () => {
    for (let i = 0; i < 20; i++) physics.applyImpulse('x', -5);
    expect(physics.getVelocity().x).toBe(-15);
  });
```

Rodar e ver falhar:
```bash
npx vitest run tests/physics.test.js
```
Expected: FAIL — `applyImpulse is not a function`.

- [ ] **Step 4.6: Implementar `applyImpulse` + constantes**

Editar `src/physics.js`:
```js
const MAX_VELOCITY = 15;

function clamp(v, min, max) {
  if (v > max) return max;
  if (v < min) return min;
  return v;
}

export function createPhysics() {
  const velocity = { x: 0, y: 0, z: 0 };

  return {
    getVelocity() {
      return { ...velocity };
    },
    applyImpulse(axis, magnitude) {
      velocity[axis] = clamp(velocity[axis] + magnitude, -MAX_VELOCITY, MAX_VELOCITY);
    },
  };
}
```

Rodar:
```bash
npx vitest run tests/physics.test.js
```
Expected: PASS (5 tests).

- [ ] **Step 4.7: Adicionar testes de `step` (rotação + damping)**

Append em `tests/physics.test.js`:
```js
  it('step rotates the object by velocity * dt', () => {
    physics.applyImpulse('y', 1); // velocity.y = 1
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    physics.step(0.5, obj); // dt = 0.5s
    expect(obj.rotation.y).toBeCloseTo(0.5, 5);
  });

  it('step applies damping (0.985 per frame) to velocity', () => {
    physics.applyImpulse('y', 1);
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    physics.step(0.016, obj);
    expect(physics.getVelocity().y).toBeCloseTo(0.985, 5);
  });

  it('step snaps tiny velocity to zero (< 0.001)', () => {
    physics.applyImpulse('y', 0.0009);
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    physics.step(0.016, obj);
    expect(physics.getVelocity().y).toBe(0);
  });

  it('continuous mode skips damping', () => {
    physics.applyImpulse('y', 1);
    physics.toggleContinuous();
    const obj = { rotation: { x: 0, y: 0, z: 0 } };
    physics.step(0.016, obj);
    expect(physics.getVelocity().y).toBe(1);
  });
```

Rodar e ver falhar:
```bash
npx vitest run tests/physics.test.js
```
Expected: FAIL — `step is not a function`.

- [ ] **Step 4.8: Implementar `step` + `toggleContinuous`**

Editar `src/physics.js`:
```js
const MAX_VELOCITY = 15;
const DAMPING = 0.985;
const VELOCITY_EPSILON = 0.001;

function clamp(v, min, max) {
  if (v > max) return max;
  if (v < min) return min;
  return v;
}

export function createPhysics() {
  const velocity = { x: 0, y: 0, z: 0 };
  let continuous = false;

  return {
    getVelocity() {
      return { ...velocity };
    },
    applyImpulse(axis, magnitude) {
      velocity[axis] = clamp(velocity[axis] + magnitude, -MAX_VELOCITY, MAX_VELOCITY);
    },
    step(dt, object3D) {
      object3D.rotation.x += velocity.x * dt;
      object3D.rotation.y += velocity.y * dt;
      object3D.rotation.z += velocity.z * dt;
      if (!continuous) {
        velocity.x *= DAMPING;
        velocity.y *= DAMPING;
        velocity.z *= DAMPING;
        if (Math.abs(velocity.x) < VELOCITY_EPSILON) velocity.x = 0;
        if (Math.abs(velocity.y) < VELOCITY_EPSILON) velocity.y = 0;
        if (Math.abs(velocity.z) < VELOCITY_EPSILON) velocity.z = 0;
      }
    },
    toggleContinuous() {
      continuous = !continuous;
      return continuous;
    },
    isContinuous() {
      return continuous;
    },
  };
}
```

Rodar:
```bash
npx vitest run tests/physics.test.js
```
Expected: PASS (9 tests).

- [ ] **Step 4.9: Adicionar teste de `reset`**

Append:
```js
  it('reset zeroes velocity and rotation', () => {
    physics.applyImpulse('x', 2);
    physics.applyImpulse('y', 3);
    const obj = { rotation: { x: 1, y: 2, z: 3 } };
    physics.reset(obj);
    expect(physics.getVelocity()).toEqual({ x: 0, y: 0, z: 0 });
    expect(obj.rotation).toEqual({ x: 0, y: 0, z: 0 });
  });
```

Rodar e ver falhar.

- [ ] **Step 4.10: Implementar `reset`**

Adicionar dentro do retorno de `createPhysics`:
```js
    reset(object3D) {
      velocity.x = 0;
      velocity.y = 0;
      velocity.z = 0;
      if (object3D) {
        object3D.rotation.x = 0;
        object3D.rotation.y = 0;
        object3D.rotation.z = 0;
      }
    },
```

Rodar:
```bash
npx vitest run tests/physics.test.js
```
Expected: PASS (10 tests).

- [ ] **Step 4.11: Commit**

```bash
git add src/physics.js tests/physics.test.js
git commit -m "$(cat <<'EOF'
feat: physics module with angular impulse and damping

createPhysics() returns a controller with applyImpulse, step, reset,
toggleContinuous. Pure module — no Three.js dependency. Fully covered
by Vitest unit tests (10 tests).

Constants: MAX_VELOCITY=15 rad/s, DAMPING=0.985 per frame,
VELOCITY_EPSILON=0.001 (snap-to-zero threshold).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Input module

Recebe `keydown` da window e dispara callbacks por gesto. Testável com `KeyboardEvent` injetado.

**Files:**
- Create: `tests/input.test.js`
- Create: `src/input.js`

- [ ] **Step 5.1: Escrever os testes falhantes**

`tests/input.test.js`:
```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInput } from '../src/input.js';

describe('input', () => {
  let input;
  let handlers;

  beforeEach(() => {
    handlers = {
      onLeft: vi.fn(),
      onRight: vi.fn(),
      onUp: vi.fn(),
      onDown: vi.fn(),
      onSelect: vi.fn(),
      onBack: vi.fn(),
    };
    input = createInput(handlers);
    input.attach();
  });

  afterEach(() => {
    input.detach();
  });

  function press(key) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  }

  it('fires onLeft for ArrowLeft', () => {
    press('ArrowLeft');
    expect(handlers.onLeft).toHaveBeenCalledOnce();
  });

  it('fires onRight for ArrowRight', () => {
    press('ArrowRight');
    expect(handlers.onRight).toHaveBeenCalledOnce();
  });

  it('fires onUp for ArrowUp', () => {
    press('ArrowUp');
    expect(handlers.onUp).toHaveBeenCalledOnce();
  });

  it('fires onDown for ArrowDown', () => {
    press('ArrowDown');
    expect(handlers.onDown).toHaveBeenCalledOnce();
  });

  it('fires onSelect for Enter', () => {
    press('Enter');
    expect(handlers.onSelect).toHaveBeenCalledOnce();
  });

  it('fires onBack for Escape', () => {
    press('Escape');
    expect(handlers.onBack).toHaveBeenCalledOnce();
  });

  it('ignores unknown keys', () => {
    press('a');
    press('Shift');
    expect(handlers.onLeft).not.toHaveBeenCalled();
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });

  it('detach() stops dispatching', () => {
    input.detach();
    press('ArrowLeft');
    expect(handlers.onLeft).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5.2: Rodar e ver falhar**

```bash
npx vitest run tests/input.test.js
```
Expected: FAIL — `Cannot find module '../src/input.js'`.

- [ ] **Step 5.3: Implementar `src/input.js`**

```js
export function createInput(handlers) {
  const map = {
    ArrowLeft: 'onLeft',
    ArrowRight: 'onRight',
    ArrowUp: 'onUp',
    ArrowDown: 'onDown',
    Enter: 'onSelect',
    Escape: 'onBack',
  };

  function onKeyDown(event) {
    const handlerName = map[event.key];
    if (!handlerName) return;
    const handler = handlers[handlerName];
    if (typeof handler === 'function') {
      handler(event);
    }
  }

  return {
    attach() {
      window.addEventListener('keydown', onKeyDown);
    },
    detach() {
      window.removeEventListener('keydown', onKeyDown);
    },
  };
}
```

- [ ] **Step 5.4: Rodar os testes**

```bash
npx vitest run tests/input.test.js
```
Expected: PASS (8 tests).

- [ ] **Step 5.5: Commit**

```bash
git add src/input.js tests/input.test.js
git commit -m "$(cat <<'EOF'
feat: input module mapping d-pad keys to callbacks

createInput({ onLeft, onRight, onUp, onDown, onSelect, onBack })
returns { attach, detach }. Listens to keydown on window and routes
to the matching handler. ArrowLeft/Right/Up/Down + Enter + Escape.

Covered by 8 Vitest tests with synthetic KeyboardEvents.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Viewer module (Three.js)

Encapsula Three.js. Smoke test apenas (renderização real só faz sentido testar no browser/device).

**Files:**
- Create: `src/viewer.js`

- [ ] **Step 6.1: Criar `src/viewer.js`**

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const VIEWPORT = 600;

export function createViewer(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 3);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(VIEWPORT, VIEWPORT);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const dir = new THREE.DirectionalLight(0xffffff, 0.85);
  dir.position.set(2, 2, 3);
  scene.add(dir);

  let currentModel = null;

  function fitObjectToView(object3D) {
    // Normalize to identity transform before measuring so the box reflects local geometry.
    object3D.position.set(0, 0, 0);
    object3D.scale.set(1, 1, 1);

    const box = new THREE.Box3().setFromObject(object3D);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const targetSize = 1.6;
    const scale = targetSize / maxDim;
    object3D.scale.setScalar(scale);

    // World centroid after scaling is scale * center_local. Translate by -scale*center to land on origin.
    object3D.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  }

  function setCurrentModel(object3D) {
    if (currentModel) {
      scene.remove(currentModel);
    }
    currentModel = object3D;
    fitObjectToView(currentModel);
    scene.add(currentModel);
  }

  function loadFallbackCube() {
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.1,
      roughness: 0.6,
    });
    const cube = new THREE.Mesh(geom, mat);
    setCurrentModel(cube);
    return cube;
  }

  async function loadModel(url) {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        url,
        (gltf) => {
          setCurrentModel(gltf.scene);
          resolve(gltf.scene);
        },
        undefined,
        (err) => reject(err),
      );
    });
  }

  function render() {
    renderer.render(scene, camera);
  }

  function getModel() {
    return currentModel;
  }

  return {
    loadModel,
    loadFallbackCube,
    render,
    getModel,
    scene,
    camera,
    renderer,
  };
}
```

- [ ] **Step 6.2: Confirmar que o build resolve a import do GLTFLoader**

Three publica os exemplos como subpath. Vite resolve nativamente, mas pra garantir, rodar:
```bash
node -e "import('three/examples/jsm/loaders/GLTFLoader.js').then(m => console.log('ok:', typeof m.GLTFLoader)).catch(e => { console.error('fail:', e.message); process.exit(1); })"
```
Expected: `ok: function`.

Se falhar, o fix é adicionar em `package.json`:
```json
"dependencies": { "three": "^0.160.0" }
```
e rodar `npm install` de novo. (Normalmente já está ok.)

- [ ] **Step 6.3: Commit**

```bash
git add src/viewer.js
git commit -m "$(cat <<'EOF'
feat: viewer module wrapping Three.js scene and GLTFLoader

createViewer(container) sets up scene, camera, renderer, lights and
exposes loadModel(url), loadFallbackCube(), render(), getModel().
Auto-centers and scales loaded models to fit the 1.6-unit target size.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Fallback `.glb` embutido

Modelo livre, pequeno, com geometria interessante. Khronos `DamagedHelmet` é o de facto pra GLTF — mas tem ~3.7MB de texturas. Pra app menor, usar `BoomBox` (~1.5MB) ou um cubo simples convertido pra .glb. Vou pegar o `BoomBox` que é compacto e referência boa.

**Files:**
- Create: `public/fallback.glb`

- [ ] **Step 7.1: Baixar BoomBox.glb dos sample assets oficiais do Khronos**

```bash
mkdir -p public
curl -L -o public/fallback.glb \
  https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BoomBox/glTF-Binary/BoomBox.glb
```

Confirmar tamanho:
```bash
ls -lh public/fallback.glb
```
Expected: arquivo entre 1MB e 2MB.

- [ ] **Step 7.2: Commit**

```bash
git add public/fallback.glb
git commit -m "$(cat <<'EOF'
feat: bundle Khronos BoomBox.glb as fallback model

License: CC-BY 4.0 / public sample assets from KhronosGroup/glTF-Sample-Assets.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Main entry — bootstrap e cola dos módulos

**Files:**
- Create: `src/main.js`

- [ ] **Step 8.1: Criar `src/main.js`**

```js
import { createViewer } from './viewer.js';
import { createPhysics } from './physics.js';
import { createInput } from './input.js';

const IMPULSE_PER_TAP = 2.5;

function getModelUrl() {
  const params = new URLSearchParams(window.location.search);
  const url = params.get('model');
  return url || '/fallback.glb';
}

function setStatus(text) {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}

async function boot() {
  const container = document.getElementById('app');
  if (!container) {
    setStatus('error: #app not found');
    return;
  }

  const viewer = createViewer(container);
  const physics = createPhysics();

  setStatus('loading model...');
  const url = getModelUrl();
  try {
    await viewer.loadModel(url);
    setStatus(`model: ${url.split('/').pop()}`);
  } catch (err) {
    console.warn('failed to load model, showing fallback cube', err);
    viewer.loadFallbackCube();
    setStatus(`fallback (failed: ${url.split('/').pop()})`);
  }

  const input = createInput({
    onLeft: () => physics.applyImpulse('y', +IMPULSE_PER_TAP),
    onRight: () => physics.applyImpulse('y', -IMPULSE_PER_TAP),
    onUp: () => physics.applyImpulse('x', +IMPULSE_PER_TAP),
    onDown: () => physics.applyImpulse('x', -IMPULSE_PER_TAP),
    onSelect: () => physics.reset(viewer.getModel()),
    onBack: () => {
      const continuous = physics.toggleContinuous();
      setStatus(`spin: ${continuous ? 'continuous' : 'damped'}`);
    },
  });
  input.attach();

  let last = performance.now();
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const model = viewer.getModel();
    if (model) physics.step(dt, model);
    viewer.render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  window.addEventListener('pause', () => setStatus('paused'));
  window.addEventListener('resume', () => setStatus('resumed'));
}

boot();
```

- [ ] **Step 8.2: Testar localmente no Vite dev server**

```bash
npm run dev
```
Esperado: servidor sobe em `http://localhost:5173/`. Abrir no browser, ver:
- O BoomBox carregado, centralizado, parado.
- Setas do teclado giram o modelo (com inércia).
- Enter reseta o ângulo.
- Escape alterna spin contínuo / damping.

Se a página estiver branca, abrir DevTools console e debugar. Erros típicos:
- `Failed to fetch /fallback.glb`: confirmar que está em `public/` (Vite serve `public/` como root).
- `Module not found three/examples/...`: rodar `npm install three` de novo.

Parar com Ctrl+C.

- [ ] **Step 8.3: Confirmar via query param**

Re-rodar `npm run dev`, abrir `http://localhost:5173/?model=https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Avocado/glTF-Binary/Avocado.glb` — deve carregar um abacate em vez do BoomBox.

Parar com Ctrl+C.

- [ ] **Step 8.4: Commit**

```bash
git add src/main.js
git commit -m "$(cat <<'EOF'
feat: main entry wiring viewer, physics, and input

Reads ?model=<url> query param (falls back to /fallback.glb), loads
the model, and runs the requestAnimationFrame loop that calls
physics.step + viewer.render. Maps input to impulses on Y axis (yaw)
for left/right and X axis (pitch) for up/down. Enter resets; back
toggles continuous spin mode.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: README com instruções de dev, build, deploy e instalação no device

**Files:**
- Create: `README.md`

- [ ] **Step 9.1: Criar `README.md`**

```markdown
# metadis — Meta Ray-Ban Display 3D Viewer

Web App vanilla pros Meta Ray-Ban Display que carrega um modelo `.glb` de uma URL e permite manipulá-lo com física rotacional (impulso angular + damping) a partir dos gestos da Neural Band.

## Dev

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173/`. Setas do teclado simulam os swipes da Neural Band, Enter simula a pinça (select), Escape simula a pinça polegar+médio (back).

Pra trocar o modelo: `http://localhost:5173/?model=<url-do-.glb-em-HTTPS>`.

## Tests

```bash
npm test
```

## Build

```bash
npm run build
```

Saída em `dist/`.

## Deploy (Vercel)

```bash
npm install -g vercel   # se ainda não instalado
vercel login            # autenticação interativa
vercel --prod           # primeiro deploy
```

Próximos deploys: só `vercel --prod` na raiz do repo.

## Instalar nos óculos

1. Abrir o Meta AI app no celular pareado.
2. Settings → Developer Mode → ativar.
3. Add a Web App → colar a URL HTTPS do Vercel.
4. Abrir nos óculos: menu de Web Apps → Metadis Viewer.

Versões mínimas: Meta Ray-Ban Display `v125+`, Meta AI app `v272+`.

## Controles

| Gesto Neural Band              | Tecla equivalente | Ação                                  |
| ------------------------------ | ----------------- | ------------------------------------- |
| Swipe esquerda                 | ArrowLeft         | Impulso angular Y (+)                 |
| Swipe direita                  | ArrowRight        | Impulso angular Y (−)                 |
| Swipe cima                     | ArrowUp           | Impulso angular X (+)                 |
| Swipe baixo                    | ArrowDown         | Impulso angular X (−)                 |
| Pinça polegar+indicador        | Enter             | Reset (zera rotação e velocidade)     |
| Pinça polegar+médio            | Escape            | Alterna spin contínuo / damping       |

Cada impulso adiciona `IMPULSE_PER_TAP = 2.5 rad/s` ao eixo correspondente. A velocidade angular decai por `DAMPING = 0.985` por frame (~85% retida) — objeto para em ~3-4s sem mais input.

## Arquivos

- `src/viewer.js` — Three.js scene, camera, lights, GLTFLoader
- `src/physics.js` — angular velocity, applyImpulse, step, damping (módulo puro)
- `src/input.js` — keydown → callbacks
- `src/main.js` — bootstrap e cola
- `public/fallback.glb` — modelo default (Khronos BoomBox)

## Spec e plano

- [Spec](docs/superpowers/specs/2026-05-25-meta-display-3d-viewer-design.md)
- [Plan](docs/superpowers/plans/2026-05-25-meta-display-3d-viewer.md)
```

- [ ] **Step 9.2: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: README with dev, test, build, deploy, and device install steps

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Build de produção + smoke test do bundle

**Files:** nenhum criado/modificado; só validação.

- [ ] **Step 10.1: Rodar `npm run build`**

```bash
npm run build
```
Expected: termina sem erro, gera `dist/index.html`, `dist/assets/*.js`, copia `dist/fallback.glb` etc.

- [ ] **Step 10.2: Rodar `npm run preview` e testar**

```bash
npm run preview
```
Esperado: serve `dist/` em `http://localhost:4173/`. Abrir, confirmar que o BoomBox carrega e setas funcionam. Esse é o build que vai pro Vercel — se funciona aqui, funciona no deploy.

Parar com Ctrl+C.

- [ ] **Step 10.3: Rodar suite completa de tests pra garantir verde**

```bash
npm test
```
Expected: PASS — 18 tests (10 physics + 8 input).

- [ ] **Step 10.4: Nada a commitar (já estamos no estado final do código v1)**

---

## Task 11: Deploy no Vercel (manual, exige login interativo do usuário)

Esta task precisa do usuário porque Vercel CLI pede login.

- [ ] **Step 11.1: Instalar Vercel CLI globalmente (se necessário)**

```bash
npm install -g vercel
```

- [ ] **Step 11.2: Login no Vercel**

```bash
vercel login
```
Interativo: escolher GitHub/Email, completar fluxo no browser. Volta com session salva.

- [ ] **Step 11.3: Primeiro deploy**

Na raiz do repo `/Users/joaosmac/metadis`:
```bash
vercel --prod
```
Vercel pergunta:
- "Set up and deploy …?" → `Y`
- "Which scope?" → conta pessoal
- "Link to existing project?" → `N`
- "What's your project's name?" → `metadis`
- "In which directory is your code located?" → `./`
- Detecta Vite automaticamente.

Esperado: termina com URL tipo `https://metadis-<hash>.vercel.app`. Anotar a URL.

- [ ] **Step 11.4: Confirmar deploy abrindo no browser desktop primeiro**

Abrir a URL no Chrome (DevTools → device mode 600×600). Confirmar que carrega normal.

- [ ] **Step 11.5: Instalar nos óculos**

1. Meta AI app no celular → Settings → Developer Mode (ativar se não estava).
2. Add a Web App → colar a URL.
3. Abrir nos óculos.
4. Testar: setas/pinças funcionam, modelo gira com inércia.

---

## Self-review (executado durante a escrita)

**1. Spec coverage:** verificado seção por seção do spec contra os tasks.
- Objetivo → coberto por Tasks 4, 6, 8 (física + viewer + cola).
- Premissas verificadas (input d-pad, 600×600, HTTPS) → respeitadas no HTML, viewer, input, deploy.
- Escopo v1 → todos os bullet points implementados (carrega `.glb` da query, fallback `/fallback.glb`, setas como impulsos, damping 0.985, Enter reseta, Escape alterna contínuo, fundo preto).
- Arquitetura (4 módulos) → 1:1 com o spec.
- Modelo físico → fórmulas idênticas, constantes idênticas.
- Tratamento de erros (modelo não carrega → fallback cube; sem rede → fallback embutido) → coberto no `main.js` boot try/catch.
- Testes → Vitest config + 18 unit tests pra physics e input. Viewer/main → teste manual (assumido no spec).
- Spike obrigatório → Task 2 dedicada, com critérios de continuação claros.
- Deploy → Task 9 (README) + Task 11 (passo a passo).

**2. Placeholders:** scan completo, nenhuma string TBD/TODO/"implement later"/"similar to". Todo step com código tem o código.

**3. Type consistency:** revisado nomes de métodos:
- `createPhysics()` retorna `{ getVelocity, applyImpulse, step, reset, toggleContinuous, isContinuous }` — usado em main.js como `physics.applyImpulse`, `physics.step`, `physics.reset`, `physics.toggleContinuous`. ✓
- `createInput(handlers)` espera `{ onLeft, onRight, onUp, onDown, onSelect, onBack }` — main.js passa exatamente esses nomes. ✓
- `createViewer(container)` retorna `{ loadModel, loadFallbackCube, render, getModel, scene, camera, renderer }` — main.js usa `loadModel`, `loadFallbackCube`, `render`, `getModel`. ✓

Nenhuma inconsistência.

**4. Riscos não cobertos pelo plano:**
- Se WebGL falhar no device (descoberto no spike), o plano precisa ser refeito. Task 2 já isola essa decisão.
- Se o gesto "back" não for `Escape`, ajustar `src/input.js` mapeando a tecla descoberta — fix de 1 linha.

Plano completo.
