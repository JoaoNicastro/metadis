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
- `public/fallback.glb` — modelo default (Khronos Box, ~1.6KB)

## Spec e plano

- [Spec](docs/superpowers/specs/2026-05-25-meta-display-3d-viewer-design.md)
- [Plan](docs/superpowers/plans/2026-05-25-meta-display-3d-viewer.md)
