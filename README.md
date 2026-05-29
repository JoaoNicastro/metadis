# metadis — Meta Ray-Ban Display 3D Viewer

**Live:** https://metadis.surge.sh — instala via Meta AI app → Developer Mode → Add a Web App.

Web App vanilla pros Meta Ray-Ban Display que carrega um modelo `.glb` de uma URL e permite manipulá-lo com física rotacional (impulso angular + damping) a partir dos gestos da Neural Band, mais inclinação contínua via head IMU.

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

## Deploy (Surge.sh)

URL atual: **https://metadis.surge.sh** (HTTPS, CDN global, grátis).

```bash
npm run build
npx surge dist/ metadis.surge.sh
```

`public/CNAME` (commitado) preserva o domínio em re-deploys. Credenciais ficam em `/tmp/surge-creds.txt` no laptop do dono — pra outra máquina, faça `surge login` interativo.

Re-deploys são instantâneos (<10s). Pra automação CI, exporte `SURGE_LOGIN` e `SURGE_TOKEN` e o comando vira não-interativo.

### Alternativa: GitHub Pages

Workflow em `.github/workflows/deploy.yml` faz build com `GITHUB_PAGES=1` e publica em `joaonicastro.github.io/metadis/`. Vite ajusta `base: '/metadis/'` automaticamente quando a env var é setada.

## Instalar nos óculos

1. Abrir o Meta AI app no celular pareado.
2. Settings → Developer Mode → ativar.
3. Add a Web App → colar `https://metadis.surge.sh`.
4. Abrir nos óculos: menu de Web Apps → Metadis Viewer.

Versões mínimas: Meta Ray-Ban Display `v125+`, Meta AI app `v272+`.

## Controles (v1.7)

Só dois gestos chegam ao Web App: **4 swipes** (setas) e **pinça polegar+indicador** (`Enter`). Pinça polegar+médio é absorvida pelo sistema como "back" e nunca chega. O HUD mostra o modo atual no centro e o que cada seta faz nas bordas.

**6 modos** ciclados por **duplo pinch** (+`play` aparece só em modelos com animação):

| Modo        | ← / →                  | ↑ / ↓                          |
| ----------- | ---------------------- | ------------------------------ |
| `rotate`    | yaw ∓                  | pitch ±                        |
| `scale`     | reset zoom             | aumenta / diminui              |
| `display`   | estilo anterior/próximo | estilo próximo/anterior        |
| `translate` | move X ∓               | move Y ±                       |
| `roll`      | roll Z ±               | boost spin / brake             |
| `snap`      | −45° / +45° (eixo Y)   | +45° / −45° (eixo X)           |
| `play`*     | clip anterior/próximo  | velocidade ± (↓ a 0 = pause)   |

\* só quando o `.glb` tem clips de animação.

**Pinça polegar+indicador** (gera `Enter`):

| Contagem        | Ação                                              |
| --------------- | ------------------------------------------------- |
| 1 toque         | Reset total (rotação + zoom + translate + spin)   |
| 2 toques (<280ms) | Cicla modo                                       |
| 3 toques (<+180ms) | Liga/desliga spin contínuo (sem damping)       |

**Display modes** (`display`): `solid → wireframe → x-ray (fresnel glow) → normals`. Bright-on-black lê muito melhor no display aditivo. A escolha persiste em `localStorage`.

**Onboarding:** primeira vez mostra um card com as setas + pinça; o 1º gesto fecha (e é engolido). `?tutorial=1` mostra de novo.

**Não funciona** (limitação da plataforma): pinça polegar+médio, pinça+twist (vira volume), tracking de pulso, head IMU no modelo. Detalhes em [MEMORY.md](MEMORY.md).

### URL params

| Param              | Efeito                                                 |
| ------------------ | ------------------------------------------------------ |
| `?model=<url-glb>` | Carrega `.glb` de uma URL HTTPS (rigado → vê `play`)   |
| `?physics=frozen`  | Sem momentum (cada impulso para na hora)               |
| `?tutorial=1`      | Re-exibe o onboarding                                  |

## Arquivos

- `src/viewer.js` — Three.js scene, GLTFLoader, dispose-on-swap, AnimationMixer
- `src/physics.js` — angular velocity, applyImpulse, step, damping (módulo puro)
- `src/input.js` — keydown → callbacks
- `src/multitap.js` — detector single/double/triple tap (módulo puro)
- `src/materials.js` — display styles (wireframe / x-ray fresnel / normals) + dispose
- `src/hud.js` — overlay aditivo: mode glyph, edge hints, flash, onboarding
- `src/imu.js` — DeviceOrientation (head) — presente mas não usado no modelo (ver MEMORY.md)
- `src/main.js` — bootstrap, modos, e cola
- `public/fallback.glb` — modelo default (Khronos Box, ~1.6KB)
- `public/CNAME` — domínio do Surge.sh
- `public/spike/index.html` — página de teste de dispositivo

## Spec, pesquisa e contexto

- [MEMORY.md](MEMORY.md) — handoff completo de contexto (realidade da plataforma, gestos, pitfalls)
- [Spec inicial](docs/superpowers/specs/2026-05-25-meta-display-3d-viewer-design.md)
- [Postmortem v1.4](docs/superpowers/specs/2026-05-26-v1.4-platform-correction.md)
- [Pesquisa de melhorias (backlog rankeado)](docs/superpowers/research/2026-05-29-metadis-improvement-research.md)
