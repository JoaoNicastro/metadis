# Metadis — Memory Handoff

> Cola isso num chat novo (sem contexto prévio) pra trazer o próximo assistente up to speed em 2 minutos. Atualizado em **2026-05-26 · v1.5**.

---

## O que é o projeto

**Metadis** = Web App pros [Meta Ray-Ban Display](https://www.ray-ban.com/usa/c/frequently-asked-questions-meta-ray-ban-display) que carrega um modelo 3D `.glb` de uma URL e permite girar/escalar via gestos da Neural Band. HTML/CSS/JS puro com Three.js. Sem framework, sem proprietário.

- **Live:** https://metadis.surge.sh
- **Repo:** https://github.com/JoaoNicastro/metadis
- **Versão atual:** 1.5
- **Owner:** João (jnjojonic@gmail.com)

---

## ⚠️ Realidade da plataforma (verificada empiricamente — NÃO confunda)

Estas verdades são **caras** — cada uma custou um round-trip de design+deploy+teste. Confirma antes de duvidar.

| Fato | Implicação |
| --- | --- |
| `DeviceOrientation` reflete a **cabeça** (IMU dos óculos), não o pulso | Não dá pra "seguir a mão" — se você mapear DeviceOrientation no cubo, o cubo segue o olhar do usuário. Empiricamente péssimo. |
| EMG e IMU da Neural Band **ficam on-device** | Web App **não** recebe XYZ, ângulo do pulso, nem sinal bruto. Só gestos discretos. |
| **Pinch polegar+médio é absorvido pelo sistema como 'back'** | Os docs falam que vira `Escape` keydown — **não vira.** Nada montado em `Escape` funciona no device. |
| **Pinch + manter fechado + girar pulso = volume do sistema** | Qualquer gesto que peça "agarrar e mover" esbarra nisso. Pinçadas têm que ser rápidas (toca-solta). |
| **Long press de pinch indicador = mesmo Enter keydown** | Não há keyup confiável. Não dá pra detectar "soltar". "Long press" é cosmético. |
| `navigator.xr` **não está disponível** no Display | Código WebXR (ARButton, hit-test) existe pra Quest browser/Vision Pro mas é no-op aqui. |
| Viewport: 600×600 monocular **aditivo** | Preto = transparente nos óculos. Use materiais claros + fundo `#000`. |

**Caminho pra escapar dessas limitações:** [Wearables Device Access Toolkit](https://developers.meta.com/blog/build-for-display-glasses/) (Swift iOS / Kotlin Android). Não é Web App, é rewrite.

---

## Vocabulário de controles (v1.5)

| Gesto Neural Band | Tecla emitida | Ação |
| --- | --- | --- |
| Swipe ← | `ArrowLeft` | rotate: yaw + impulse · scale: reset zoom |
| Swipe → | `ArrowRight` | rotate: yaw − impulse · scale: reset zoom |
| Swipe ↑ | `ArrowUp` | rotate: pitch + impulse · scale: zoom + |
| Swipe ↓ | `ArrowDown` | rotate: pitch − impulse · scale: zoom − |
| Pinch polegar+indicador (1 toca-solta rápido) | `Enter` | Reset total (rotação + zoom + spin) — após 280ms |
| Pinch polegar+indicador (2 dentro de 280ms) | `Enter` × 2 | Cicla modo `rotate` ⇄ `scale` — instantâneo |
| URL param `?physics=frozen` | — | Override: release não carrega momentum |
| URL param `?model=<url>` | — | Carrega `.glb` arbitrário de URL HTTPS |
| URL param `?imu=off` | — | (legado, IMU já não é usado em v1.5) |

**Gestos que NÃO funcionam (não tente):**
- Pinch polegar+médio (qualquer variação)
- Pinch + girar pulso
- Cabeça → cubo (não é controle, é só observação de mundo se você adicionar modo intencional)

---

## Arquitetura (módulos)

```
metadis/
├── src/
│   ├── viewer.js    — Three.js scene, camera, lights, GLTFLoader. SEM mudança desde v1.0.
│   ├── physics.js   — angular velocity + damping + reset + toggleContinuous. PURO, testado.
│   ├── input.js     — keydown → callback dispatch. Mapeia 4 setas + Enter + Escape.
│   ├── imu.js       — DeviceOrientation com EMA smoothing + dead zone. PRESENTE mas
│   │                  NÃO USADO em v1.5 (head, não pulso). Comentário explica por quê.
│   ├── multitap.js  — detector genérico de single/double tap. Pure JS, timer-based.
│   └── main.js      — bootstrap, mode state, HUD, render loop, glue de tudo.
├── tests/           — vitest + jsdom. 39 testes.
├── public/
│   ├── fallback.glb — Khronos Box (~1.6KB), usado se nenhum ?model= passado
│   ├── CNAME        — domínio do Surge.sh (preserva em re-deploys)
│   └── spike/       — página de teste isolada pra spike de gestos no device
├── docs/superpowers/specs/
│   ├── 2026-05-25-meta-display-3d-viewer-design.md      — spec original v1.0/1.2
│   ├── 2026-05-26-iron-man-grab-control-design.md       — v1.3 grab attempt (SUPERSEDED)
│   └── 2026-05-26-v1.4-platform-correction.md           — postmortem + v1.5 update
├── .github/workflows/
│   └── deploy-surge.yml — auto-deploy on push to main
├── index.html       — viewport, anti-cache meta, version label
├── style.css
├── package.json     — three only as runtime dep; vite + vitest + jsdom devDeps
└── README.md
```

**Princípios:** módulos puros (`physics.js`, `multitap.js`, `imu.js` não tocam DOM/Three direto), `main.js` é a única cola, testes em vitest+jsdom pros módulos puros.

---

## Dev workflow

```bash
npm install
npm run dev        # http://localhost:5173/
npm test           # vitest run
npm run build      # → dist/
```

**Smoke local:** o dev server serve `localhost:5173`. Setas simulam swipes. Enter simula pinch indicador. Escape simula pinch médio (não vai funcionar no device mas funciona local — útil pra dev).

**Smoke browser preview:** o repo tem `.claude/launch.json` configurado pra `metadis-dev` (npm run dev na porta 5173). Em ambiente Claude Code dá pra abrir via skill `preview_start`.

---

## Deploy

### Auto (recomendado)

Toda push em `main` dispara `.github/workflows/deploy-surge.yml`:
1. `npm install --no-audit --no-fund`
2. `npm test` (gate — falha aborta deploy)
3. `npm run build`
4. `npx surge dist/ metadis.surge.sh` com `SURGE_LOGIN` + `SURGE_TOKEN` dos repo secrets

Acompanha em https://github.com/JoaoNicastro/metadis/actions.

### Manual (se CI estiver fora)

```bash
export $(cat /tmp/surge-creds.txt | xargs)   # ou cole inline
npm run build
npx surge dist/ metadis.surge.sh
```

Credenciais em `/tmp/surge-creds.txt` no laptop do João.

### Cache busting

O device do Meta Display **segura HTML cacheado de forma agressiva**, mesmo com `Cache-Control: no-store` em `index.html`. Workflow correto pra publicar update:

1. Bump `METADIS_VERSION` em `src/main.js`
2. Bump `<meta name="metadis-version">`, `<title>`, e `<div id="version">` em `index.html`
3. Commit + push → CI deploya
4. Nos óculos: reabre o web app no menu
5. **Se ainda mostrar versão antiga:** Meta AI app no celular pareado → Developer Mode → remove "Metadis Viewer" → re-add com `https://metadis.surge.sh`. Força o device a esquecer o HTML.

---

## Device install

1. Meta AI app no celular pareado → Settings → Developer Mode → enable
2. Add a Web App → cole `https://metadis.surge.sh`
3. Nos óculos: menu Web Apps → Metadis Viewer
4. HUD em cima à esquerda confirma a versão (ex: `Versão 1.5`)

**Versões mínimas:** glasses `v125+`, Meta AI app `v272+`.

---

## Histórico de versões (importante pra contexto)

- **v1.0–1.2:** swipes discretos + IMU bias da cabeça misturado como "drift" rotacional (na época achava que era pulso — não era). Anchor mode tinha 3DoF fake via rotação de câmera.
- **v1.3 (revertido):** tentou grab contínuo (single pinch = agarra, pulso vira input 1:1). Falhou no device porque (a) IMU é cabeça, (b) pinch+rotação = volume. PR #2.
- **v1.4:** revert do grab. Modos `rotate` e `scale` discretos. Pinch médio (Escape) ainda era usado pra cycle/toggle. PR #5.
- **v1.5 (atual):** descobriu que pinch médio não chega como `Escape` no Web App (sistema absorve). Tudo migrou pra pinch indicador (single = reset, double = cycle). Toggle de física virou URL param. PR #6.

---

## User preferences (João)

- **Idioma:** Português brasileiro casual. Responde em PT.
- **Velocidade:** "Auto PR + merge" — não para pra confirmar quando vai abrir PR ou mergear; faz tudo em fluxo.
- **Iteração:** testa no device aggressivamente. Volta com feedback empírico que invalida assumptions — leva sério.
- **Verbosidade:** prefere respostas curtas + tabelas + bullets. Specs longos só quando vale a pena.
- **Commits:** atômicos, mensagem com `feat/`/`fix/`/`chore/`/`ci/`/`docs/` prefix, co-authored-by Claude.
- **Brand:** sem emoji em código/arquivos a menos que peça.

---

## Skill stack disponível (Claude Code)

Quando trabalhar nesse repo, as skills relevantes são:

- **superpowers:brainstorming** — antes de qualquer feature criativa, explora intent. **Mas pula seções de aprovação se o João disser "faça tudo"** (ele faz).
- **superpowers:test-driven-development** — testes em vitest + jsdom, pattern já estabelecido.
- **superpowers:verification-before-completion** — após Edit/Write em código que afeta a UI, considera `preview_start` + `preview_eval` pra smoke test antes de claim "feito". Tests + build limpo é o mínimo.
- **gsd-** (planning system) — não usado nesse projeto.

---

## Pitfalls confirmados — não repita

1. **Não wire `DeviceOrientation` no modelo como bias passivo.** O cubo seguir o olhar é horrível.
2. **Não monte ações em `Escape`/`onBack`.** Nunca vai chegar.
3. **Não desenhe "grab contínuo com pulso".** Não tem como ler pulso contínuo via Web App.
4. **Não use double-pinch médio.** Mesma razão.
5. **Não assuma keyup pra pinças.** Não vem. Toggle-by-pinch só via multitap detector, não hold-detection.
6. **Não esqueça de bumpar version + cache bust em index.html.** Device cacheia agressivamente; só version bump força refetch confiável.
7. **Não confie em comentário de código pra fato de plataforma.** O `imu.js` claimava wrist sem evidência — comentário tava errado por meses. Confirma com spike no device antes de cimentar design.

---

## Próximos passos plausíveis (não comprometido)

- **Modo `explode`:** separar partes do `.glb` em camadas (slot já reservado em `MODE_CYCLE`). Requer modelos com hierarquia significativa.
- **Wrist Writing** (Meta announced 2026): se Meta expor letras traçadas como `KeyboardEvent`, dá pra mapear comandos (ex: traçar "i" → invert). API status incerto.
- **Modo "look-to-aim" intencional:** usar head IMU como controle deliberado em um modo isolado (não bias). Cubo "world-locked" enquanto você anda em volta dele.
- **Native build via Wearables Device Access Toolkit (Swift/Kotlin):** única forma de ter wrist contínuo. Rewrite grande — decisão estratégica do João.

---

## Arquivos pra abrir primeiro num chat novo

Em ordem de prioridade:

1. `MEMORY.md` (este arquivo)
2. `src/main.js` — entender o estado atual de modos/HUD/glue
3. `docs/superpowers/specs/2026-05-26-v1.4-platform-correction.md` — postmortem com vocabulário final
4. `README.md` — instalação + comandos
5. `package.json` — deps mínimas (three, vite, vitest, jsdom)
