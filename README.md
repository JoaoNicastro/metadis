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

## Controles

| Gesto Neural Band                | Tecla equivalente            | Ação                                  |
| -------------------------------- | ---------------------------- | ------------------------------------- |
| Swipe esquerda                   | ArrowLeft                    | Impulso angular Y (+)                 |
| Swipe direita                    | ArrowRight                   | Impulso angular Y (−)                 |
| Swipe cima                       | ArrowUp                      | Impulso angular X (+)                 |
| Swipe baixo                      | ArrowDown                    | Impulso angular X (−)                 |
| Pinça polegar+indicador          | Enter                        | Reset (zera rotação e velocidade)     |
| **Duplo** pinça polegar+indicador| Enter Enter (<400ms)         | Recalibra zero do head IMU            |
| Pinça polegar+médio              | Escape                       | Alterna spin contínuo / damping       |
| **Duplo** pinça polegar+médio    | Escape Escape (<400ms)       | Liga/desliga head IMU                 |
| Inclinar cabeça (qualquer eixo)  | (DeviceOrientation contínuo) | Rotaciona modelo proporcional ao tilt |

**Twist (pinça + rotação do pulso) não está disponível pro Web App** — a Meta reserva esse gesto pro controle de volume do sistema. O equivalente contínuo é o head IMU.

Cada impulso de swipe adiciona `IMPULSE_PER_TAP = 2.5 rad/s` ao eixo. Velocidade angular decai por `DAMPING = 0.985` por frame (~85% retida) — objeto para perceptualmente em ~3-4s. Head IMU usa dead zone de 1.5° e gain 0.9, somando à física. Pra desabilitar IMU via URL: `?imu=off`.

## Arquivos

- `src/viewer.js` — Three.js scene, camera, lights, GLTFLoader
- `src/physics.js` — angular velocity, applyImpulse, step, damping (módulo puro)
- `src/input.js` — keydown → callbacks
- `src/imu.js` — DeviceOrientation → continuous head-tilt rotation bias
- `src/main.js` — bootstrap e cola
- `public/fallback.glb` — modelo default (Khronos Box, ~1.6KB)
- `public/CNAME` — domínio do Surge.sh
- `public/spike/index.html` — página de teste de dispositivo (WebGL + key + IMU logger)

## Spec e plano

- [Spec](docs/superpowers/specs/2026-05-25-meta-display-3d-viewer-design.md)
- [Plan](docs/superpowers/plans/2026-05-25-meta-display-3d-viewer.md)
