# Iron Man Grab Control — Manipulação Contínua por Pulso

**Data:** 2026-05-26
**Status:** Design aprovado (Abordagem 2 — Grab com modos)
**Autor:** João (com assistência do Claude Code)
**Versão alvo:** v1.3
**Predecessor:** [v1.2 — WebXR + 3 modos discretos](./2026-05-25-meta-display-3d-viewer-design.md)

---

## 1. Objetivo

Trocar o sistema discreto de impulsos angulares (4 swipes → impulse) por um sistema de **grab contínuo**: o usuário faz uma pinça (polegar+indicador) pra "agarrar" o cubo, mexe o pulso, e o cubo segue 1:1. Solta com outra pinça e o cubo sai com a velocidade do flick (momentum + damping).

Inspiração: Tony Stark manipulando hologramas — pega, gira, escala, solta.

## 2. Restrições da plataforma (verificadas 2026-05-26)

Web App nos Meta Ray-Ban Display expõe:

- `DeviceOrientation` em tempo real — α/β/γ contínuos, ~60Hz, refletindo o **pulso** (Neural Band), não a cabeça.
- Gestos discretos via `KeyboardEvent`:
  - Pinça polegar+indicador (single) → `Enter`
  - Pinça polegar+médio (single) → `Escape`
  - Swipe polegar no indicador (4 direções) → `Arrow*`
- Eventos de sistema: `pause`, `resume`, `stop`.

**NÃO expõe** (verificado via Meta docs + busca web 2026-05):

- Posição da mão (X/Y/Z) — não há câmera/depth no caminho do Web App.
- Eventos de "soltar" pinça (keyup não é garantido pra gestos).
- Gesto pinch+twist — reservado pra volume do sistema / zoom da câmera.
- Wrist Writing pra Web Apps — anunciado pra 2026, status da API ainda incerto.

**Consequência de design:** "mover a mão pra direita" vira "rotar o pulso pra direita". Translação literal X/Y/Z fica fora. Grab é toggle (não hold), porque keyup não é confiável.

Sources:
- [Meta Wearables — Web Apps docs](https://wearables.developer.meta.com/docs/develop/webapps)
- [Meta Ray-Ban Display Developer Preview: SDK Paths and Platform Gaps](https://virtual.reality.news/news/meta-ray-ban-display-developer-preview-sdk-paths-and-platform-gaps/)
- [How to configure gestures on Meta Ray-Ban Display and Meta Neural Band](https://www.meta.com/help/ai-glasses/981971383959484/)
- [CES 2026: Neural Handwriting announcement](https://www.meta.com/blog/ces-2026-meta-ray-ban-display-teleprompter-emg-handwriting-garmin-unified-cabin-university-of-utah-tetraski/)

## 3. Escopo da v1.3

**Faz:**

- 2 modos ativos: `rotate` (default), `scale`. Slot `explode` reservado mas inativo.
- Single Escape → cicla modo (rotate → scale → rotate).
- Single Enter → toggle grab. Cada grab **auto-recalibra** o zero pra pose atual do pulso (sem precisar de gesto separado de recalibração).
- **Rotate + grabbed:** delta do pulso desde o grab vira rotação 1:1 do cubo em 3 eixos (α=yaw, β=pitch, γ=roll).
- **Scale + grabbed:** delta de β do pulso vira escala exponencial (90° palma pra cima = 2x, 90° palma pra baixo = 0.5x, mapeamento `scale = 2^(Δβ/90°)`).
- **Release com momentum** (rotate): angular velocity calculada dos últimos ~5 samples do pulso vira `physics.applyImpulse()`. Damping atual decelera (físico já implementado em [physics.js](../../../src/physics.js)).
- **Release sem momentum** (scale): escala trava no valor atual. Momentum em escala fica estranho.
- Double Escape → toggle `physicsMode` entre `damped` (default — desacelera após release) e `frozen` (release ignora velocidade, cubo trava instantâneo).
- Swipes continuam funcionando no modo **não-grabbed** como nudges discretos:
  - Em rotate: ←/→ = impulso yaw, ↑/↓ = impulso pitch (igual hoje).
  - Em scale: ↑/↓ = impulso escala, ←/→ = reset escala.
- HUD: `mode: {rotate|scale} · {GRABBED|idle} · physics:{damped|frozen} · {zoom}x` (zoom só em scale).

**Não faz (vai pra v1.4+):**

- Modo `explode` (D — separar partes do modelo). Slot reservado no enum de modos, mas sem implementação.
- Wrist Writing como atalho de comando (ex: traçar "i" → explode). Condicional na API.
- Hold-to-grab. Quando keyup vier confiável, podemos adicionar como variante.
- WebXR/AR placement integrado com grab. O código WebXR atual permanece, mas grab só é exercido fora de sessão XR.

## 4. Arquitetura

```
metadis/
├── src/
│   ├── viewer.js       # (sem mudança) Three.js scene + GLTFLoader
│   ├── physics.js      # (sem mudança) angular velocity + damping
│   ├── input.js        # (sem mudança) keydown → callback
│   ├── imu.js          # MUDANÇA — fast mode + ring buffer de velocidade angular
│   ├── grab.js         # NOVO — máquina de estado de grab (idle ↔ grabbing)
│   ├── multitap.js     # NOVO — detector genérico de single/double tap
│   └── main.js         # MUDANÇA — substitui rotate/zoom/anchor por rotate/scale, cola grab
├── tests/
│   ├── grab.test.js        # NOVO
│   ├── multitap.test.js    # NOVO
│   ├── imu.test.js         # estendido com testes de fast mode + velocity
│   └── (resto sem mudança)
└── docs/superpowers/specs/
    └── 2026-05-26-iron-man-grab-control-design.md   ← este arquivo
```

### Módulos

**`src/multitap.js` — Detector de tap múltiplo** (NOVO, ~50 linhas)

- API: `createMultitap({ windowMs: 400, onSingle, onDouble })`. Retorna `{ tap() }`.
- Cada `tap()` agenda um disparo `onSingle` pra dali a `windowMs`. Se outro `tap()` chegar antes do prazo, cancela o single e dispara `onDouble`.
- Substitui as duas variáveis `lastEnter`/`lastBack` ad-hoc em [main.js:256,276](../../../src/main.js#L256). Mais testável, sem duplicação.
- Não depende de DOM nem Three.js — JS puro, testável com `vi.useFakeTimers()`.

**`src/grab.js` — Máquina de estado de grab** (NOVO, ~80 linhas)

- API: `createGrab({ getOrientation })`. `getOrientation()` retorna `{ alpha, beta, gamma }` em graus ou `null`.
- Estados: `idle` | `grabbing`.
- Métodos:
  - `toggle()` — alterna estado. Se for pra `grabbing`, salva pose atual como zero. Se for pra `idle`, retorna pacote `{ released: true, deltaRotation: {x,y,z}, angularVelocity: {x,y,z} }` com a última rotação e velocidade angular calculada do ring buffer.
  - `getDeltaRotation()` — retorna `{x,y,z}` em radianos do delta desde o grab (ou `null` se idle). Eixos já mapeados pra convenção do Three (alpha→y, beta→x, gamma→z).
  - `tick()` — chamado a cada frame; alimenta o ring buffer de samples com (timestamp, orientation).
  - `isGrabbing()`, `reset()`.
- Ring buffer: array circular de 5 entries `{t, alpha, beta, gamma}`. Velocidade angular = diff entre o primeiro e último da janela / dt.
- Pure — recebe orientação via callback, não toca DOM, não toca Three.

**`src/imu.js` — IMU estendido** (MUDANÇA)

- Adicionar `setFastMode(bool)`. Quando `true`, EMA usa α=0.4 (mais responsivo, menos lag). Quando `false`, mantém α=0.15 (legado pra bias mode).
- Adicionar `getReading()` que retorna `{ alpha, beta, gamma }` smoothed atual (sem aplicar dead zone nem gain). É o que `grab.js` chama via `getOrientation`.
- Manter `step()`, `getDelta()`, `recalibrate()`, `enable/disable` como estão. Bias mode (step) só é usado pra anchor mode — em rotate-grabbed, ninguém chama `step`.

**`src/main.js` — Rewire** (MUDANÇA)

- Substituir `MODE_CYCLE = ['rotate', 'zoom', 'anchor']` por `MODE_CYCLE = ['rotate', 'scale']` (com slot pra `explode` futuro).
- `anchor` mode some — a feature de 3DoF world-lock fica reservada pra entrar de novo via WebXR (já existe parcialmente).
- `zoom` vira `scale` (rename + comportamento similar quando não-grabbed, novo comportamento de grab).
- Instanciar `multitap` pra `Enter` e `Escape`.
- Instanciar `grab` passando `() => imu.getReading()`.
- **Continuidade no grab:** no momento do toggle pra `grabbing`, `main.js` snapshota `baseRotation = model.rotation.clone()` e `baseZoom = zoomFactor`. Enquanto grabbing, `model.rotation = baseRotation + delta` (não overwrite — preserva o que tava antes). No release, model.rotation já tá na pose final; física continua adicionando velocity * dt em cima, seamless. Mesma lógica pra scale: `zoomFactor = baseZoom * 2^(Δβ/90)`.
- Render loop:
  - Se em rotate + grabbing: `model.rotation.set(baseRot.x + Δx, baseRot.y + Δy, baseRot.z + Δz)`.
  - Se em scale + grabbing: `zoomFactor = baseZoom * 2^(Δβ/90)`; `model.scale.setScalar(baseScale * zoomFactor)`.
  - Se idle: comportamento atual (impulse + damping). Em scale idle, swipes mexem `zoomVel` igual hoje.
- Bindings novos:
  - `multitap.tap('enter')` → on single: `grab.toggle()`. On release com momentum: aplica impulso em `physics` baseado na velocidade angular calculada.
  - `multitap.tap('escape')` → on single: cicla modo. On double: alterna `physicsMode`.

## 5. Fluxo de dados

```
Neural Band pinch index (single)
   ↓
Display runtime → keydown Enter
   ↓
input.js → onSelect callback
   ↓
multitap('enter').tap()
   ↓ (após windowMs sem segundo tap)
onSingle → grab.toggle()
   ↓
grab: idle → grabbing
        zero = imu.getReading()
main.js: baseRotation = model.rotation.clone()  // snapshot pra continuidade
   ↓ (próximos frames)
loop: orientation = imu.getReading()
       delta = orientation - zero
       grab.tick() alimenta ring buffer
       main.js: model.rotation.set(baseRot.x + Δx, baseRot.y + Δy, baseRot.z + Δz)
       viewer.render()

[pinch novamente]
   ↓
grab.toggle() → grabbing → idle
   retorna { angularVelocity from ring buffer }
   ↓
main.js: se physicsMode === 'damped':
            physics.applyImpulse('x', av.x); applyImpulse('y', av.y); applyImpulse('z', av.z)
         senão: ignora velocidade (frozen)
   ↓
loop: physics.step(dt, model) → damping decelera → cubo para
```

## 6. Tratamento de erros e edge cases

- **IMU sem permissão:** `imu.enable()` retorna false → grab não funciona, HUD mostra "imu:unavailable". Swipes continuam OK como fallback.
- **Pause/resume mid-grab:** `pause` event chama `grab.reset()` (volta pra idle sem release). Resume volta ao normal. Evita estado preso entre suspends.
- **Pinch acidental durante swipe:** tolerável — toggle de grab é reversível (outro pinch desfaz). Não há ação destrutiva.
- **Modelo não carregou:** grab funciona normalmente no fallback cube (já carregado em [main.js:151](../../../src/main.js#L151)).
- **IMU drift durante grab longo:** auto-recalibração só acontece no novo grab. Se drift incomodar em sessão longa, usuário solta + agarra de novo. Não vamos adicionar drift compensation na v1.3.
- **Sessão XR ativa:** grab é suprimido (XR runtime controla a câmera). Eventos de gesto ainda podem disparar mas o tick não aplica nada ao modelo. Comportamento WebXR existente preserva.

## 7. Estratégia de testes

**Unit (Vitest, jsdom):**

- `grab.test.js`: idle inicial; toggle entra/sai grabbing; delta de rotação correto com pose mockada; ring buffer calcula velocidade angular esperada; auto-recalibração no novo grab; pause `reset()`.
- `multitap.test.js`: single dispara após windowMs; double cancela single; janela respeitada; fakeTimer.
- `imu.test.js` estendido: `getReading()` retorna smoothed sem dead zone; `setFastMode(true)` muda EMA alpha; bias step continua funcionando como antes.

**Integration manual no Display:**

- Carregar fallback cube, pinch index → cubo deve "se prender" ao pulso (girar pulso = girar cubo).
- Pinch index de novo → cubo continua girando se você flicar (momentum).
- Single Escape → vai pra scale. Pinch + palma pra cima = aumenta. Pinch de novo trava.
- Double Escape → HUD muda `physics:damped` → `physics:frozen`. Em rotate: pinch + flicar + soltar = cubo para no lugar (não desacelera mais).
- HUD legível no display aditivo (texto branco sobre preto puro).

## 8. Bump de versão e deploy

- `METADIS_VERSION` em [main.js](../../../src/main.js) → `1.3`.
- `<title>`, `<meta name="metadis-version">`, `<div id="version">Versão 1.3</div>` em [index.html](../../../index.html) → `1.3`.
- Build + deploy via `npm run build && npx surge dist/ metadis.surge.sh`. Cache anti-cache meta tags em index.html garantem que device pegue HTML novo (memory `project_meta_display_cache.md`).

## 9. Decisões abertas (v1.4+)

- **Explode mode (D):** quando entra, como modelo é particionado em partes? Provavelmente via `traverse()` da scene Three pegando filhos do `gltf.scene` e separando-os por `Δposition` interpolado de uma origem comum. Requer GLBs com hierarquia significativa — muitos modelos vêm como single-mesh, aí precisa heurística (split por material? por bounding box subdivision?).
- **Wrist Writing:** se a Meta expor letras como `KeyboardEvent` simples (ex: keydown `i`), o `input.js` atual já recebe — só falta mapear comandos. Se exigir SDK específico, vira épico.
- **Drift compensation:** adicionar slow recalibração (ex: a cada 30s de grab, se velocidade angular ≈ 0, ajustar zero gradualmente). Valor incerto até testar em sessão real.
- **Hold-to-grab:** quando confirmar keyup confiável no Display, adicionar variante `hold` no `grab.js`.
- **Sensibilidade configurável:** gain por modo (atualmente 1:1 fixo) via URL param ou config local.

## 10. Resumo executivo

> Refator de controle pra v1.3: substitui swipe-discrete-impulse + 3 modos rotate/zoom/anchor por **grab contínuo com pulso + 2 modos rotate/scale** (slot explode reservado). Single pinch toggle agarra; pulso vira input direto; segundo pinch solta com momentum no rotate (damping carrega) ou trava no scale. Double Escape alterna física damped/frozen. Reaproveita 90% do código (physics, viewer, input intactos); adiciona 2 módulos pequenos (`grab.js`, `multitap.js`); estende `imu.js` com fast mode + ring buffer. Sem novas deps, sem mudança de tooling. Risco principal: lag percebido no grab em IMU smoothing — endereçado com EMA alpha 0.4 quando grabbing.
