# Meta Ray-Ban Display — Web App Viewer 3D com Física

**Data:** 2026-05-25
**Status:** Design aprovado, aguardando review do usuário antes do plano de implementação
**Autor:** João (com assistência do Claude Code)

---

## 1. Objetivo

Um Web App que roda nos Meta Ray-Ban Display, carrega um modelo 3D (`.glb`) a partir de uma URL, e permite manipular esse modelo com física rotacional — cada gesto da Neural Band aplica um impulso angular ao objeto, que continua girando e desacelera com atrito (damping). Sensação de "joga e ele segue, perdendo velocidade".

## 2. Contexto e premissas verificadas

A construção depende de premissas que foram confirmadas na documentação oficial da Meta (link abaixo). Resumo:

- **Web Apps** nos Meta Ray-Ban Display são HTML/CSS/JS puro hospedados em URL HTTPS pública. Instalação via Meta AI app → Developer Mode → Add a Web App. Versões mínimas: glasses `v125+`, Meta AI `v272+`.
- **Viewport:** 600×600.
- **Display:** monocular, aditivo (verde-mono). Apenas pixels claros aparecem; preto = transparente.
- **Input da Neural Band é d-pad, não gesto contínuo.** Eventos disponíveis:
  - Swipe horizontal/vertical → `ArrowLeft` / `ArrowRight` / `ArrowUp` / `ArrowDown` (keydown).
  - Pinça polegar+indicador (select) → `Enter`.
  - Pinça polegar+médio (back) → mapeamento exato a confirmar no spike: provavelmente `Escape` keydown ou um evento custom da plataforma. Documentação oficial não explicita.
  - Eventos de sistema: `pause`, `resume`, `stop`.
- **Sensores:** `DeviceOrientation` API (head IMU), `Geolocation` (GPS do celular pareado), `localStorage`.
- **Starter oficial:** `facebookincubator/meta-wearables-webapp` no GitHub. Define padrão `.focusable` para navegação d-pad, exemplo de jogo (Snake), templates. Sem exemplo 3D.

Fontes:
- [Web Apps for Meta Ray-Ban Display (docs oficial)](https://wearables.developer.meta.com/docs/develop/webapps)
- [meta-wearables-webapp starter (GitHub)](https://github.com/facebookincubator/meta-wearables-webapp)
- [Build for display glasses (blog Meta)](https://developers.meta.com/blog/build-for-display-glasses/)
- [FAQ — Meta for Developers](https://developers.meta.com/wearables/faq/)

**Consequência de design:** o modelo de física com impulso angular + damping encaixa naturalmente no input do Meta Display — cada swipe é um keydown discreto que vira um impulso; o decaimento de velocidade acontece no loop de render, independente do input.

## 3. Escopo da v1

**Deve fazer:**
- Renderizar um `.glb` numa cena Three.js, ocupando o viewport 600×600.
- Carregar o modelo de uma URL via query param: `?model=<url-do-glb>`.
- Se nenhuma URL for passada, exibir um cubo branco rotacionando + carregar um sample `.glb` embutido como fallback (validação do GLTFLoader).
- Aplicar impulso angular em resposta a setas:
  - `ArrowLeft` / `ArrowRight` → spin no eixo Y (yaw).
  - `ArrowUp` / `ArrowDown` → spin no eixo X (pitch).
- Damping a cada frame: `angularVelocity *= 0.985` (~85% retida a cada frame; ajustável).
- `Enter` → resetar rotação e velocidade (re-centrar o objeto).
- Gesto "back" (pinça polegar+médio, key/evento a confirmar no spike — provavelmente `Escape`) → alternar modo "spin contínuo" on/off (quando on, ignora damping).
- Render legível no display aditivo: fundo preto puro, materiais claros (branco/cinza claro), iluminação que destaque contornos.

**Não faz na v1 (entra em v2+):**
- Integração com head IMU (`DeviceOrientation`) — fica de v2.
- Pipeline de captura + reconstrução fotogramétrica (escopo separado).
- Múltiplos modelos / picker / menu de seleção.
- Anotações, comentários, compartilhamento.
- Modo AR espacial (Meta Display não suporta — é HUD plano).

## 4. Arquitetura

Single-page app, sem framework. Build com Vite. Deploy estático em Vercel (HTTPS grátis, CI automático via git push).

```
metadis/
├── docs/superpowers/specs/
│   └── 2026-05-25-meta-display-3d-viewer-design.md   ← este arquivo
├── src/
│   ├── viewer.js       # Three.js scene, camera, lights, GLTFLoader
│   ├── physics.js      # angularVelocity, applyImpulse, step(dt)
│   ├── input.js        # keydown → impulse; Enter/Escape → ações
│   └── main.js         # bootstrap: lê query param, monta cena, conecta módulos
├── public/
│   └── fallback.glb    # modelo sample embutido (capacete ou primitiva)
├── index.html
├── style.css
├── package.json
├── vite.config.js
└── README.md
```

### Componentes — responsabilidade / interface / dependências

**`viewer.js` — Renderização 3D**
- *Faz:* monta `THREE.Scene`, `PerspectiveCamera`, luz ambiente + direcional, `WebGLRenderer` em canvas 600×600. Expõe método `loadModel(url)` que retorna Promise com o `THREE.Object3D` carregado. Expõe `render()` para chamar no loop.
- *Depende de:* Three.js, GLTFLoader.
- *Não conhece:* input, física.

**`physics.js` — Modelo físico**
- *Faz:* mantém um `angularVelocity = {x, y, z}`. Métodos: `applyImpulse(axis, magnitude)`, `step(dt, object3D)` (atualiza rotação e aplica damping), `reset()`, `toggleContinuous()`.
- *Depende de:* nada. Recebe o `THREE.Object3D` no `step()`.
- *Constantes:* `IMPULSE_PER_TAP = 2.5` (rad/s), `DAMPING = 0.985`, `MAX_VELOCITY = 15` (rad/s).

**`input.js` — Mapa de input**
- *Faz:* registra listeners `keydown` na window. Para cada tecla, chama o callback registrado: `setLeft(cb)`, `setRight(cb)`, `setUp(cb)`, `setDown(cb)`, `setSelect(cb)`, `setBack(cb)`. Eventos `pause`/`resume`/`stop` também expostos.
- *Depende de:* nada.
- *Não conhece:* Three.js, física.

**`main.js` — Cola**
- Lê `URLSearchParams` pra pegar `?model=`. Se não tiver, usa `/fallback.glb`.
- Instancia `viewer`, chama `loadModel`.
- Conecta `input` → `physics`: setas chamam `applyImpulse` no eixo certo.
- Loop `requestAnimationFrame`: `physics.step(dt, model)`, `viewer.render()`.

## 5. Fluxo de dados

```
Neural Band swipe
     ↓
Meta Display runtime traduz pra keydown
     ↓
input.js captura ArrowLeft/Right/Up/Down/Enter/Escape
     ↓
main.js mapeia tecla → eixo + magnitude
     ↓
physics.applyImpulse(axis, magnitude)
     ↓ (próximo frame)
physics.step(dt, model) aplica rotação + damping
     ↓
viewer.render() desenha frame
     ↓
Display 600×600 dos óculos
```

## 6. Modelo físico (detalhe)

A cada frame (~60fps idealmente):

```js
// pseudocódigo
model.rotation.x += angularVelocity.x * dt;
model.rotation.y += angularVelocity.y * dt;
model.rotation.z += angularVelocity.z * dt;

if (!continuousMode) {
  angularVelocity.x *= DAMPING;
  angularVelocity.y *= DAMPING;
  angularVelocity.z *= DAMPING;

  // snap to zero quando muito pequeno (evita drift)
  if (Math.abs(angularVelocity.x) < 0.001) angularVelocity.x = 0;
  // ...idem y, z
}
```

Impulso por tap:
```js
applyImpulse(axis, magnitude) {
  angularVelocity[axis] = clamp(
    angularVelocity[axis] + magnitude,
    -MAX_VELOCITY, MAX_VELOCITY
  );
}
```

Mapeamento de teclas:
- `ArrowLeft` → `applyImpulse('y', +IMPULSE_PER_TAP)`
- `ArrowRight` → `applyImpulse('y', -IMPULSE_PER_TAP)`
- `ArrowUp` → `applyImpulse('x', +IMPULSE_PER_TAP)`
- `ArrowDown` → `applyImpulse('x', -IMPULSE_PER_TAP)`

Justificativa do damping `0.985`: a cada segundo (60 frames) → `0.985^60 ≈ 0.41`, ou seja a velocidade cai pra ~40% em 1s. Sensação "tem inércia, mas para em ~3-4s." Ajustável depois.

## 7. Tratamento de erros

- **Modelo não carrega** (URL inválida, CORS, formato errado): exibe texto "Failed to load model" + carrega o cubo branco como fallback visual.
- **WebGL não suportado**: mensagem "WebGL não disponível" e para. (Improvável no Meta Display, mas barato.)
- **Query param malformada**: silenciosamente usa fallback.
- **Sem rede após instalação**: o sample `.glb` está embutido em `/public/fallback.glb` então o app sempre tem algo pra mostrar.

## 8. Estratégia de testes

**Desktop primeiro (90% do dev):**
- `vite dev` no Chrome em viewport 600×600 (DevTools → device emulation).
- Setas do teclado simulam swipes da Neural Band.
- Enter/Escape simulam pinças.
- Chrome DevTools Sensors panel pra simular DeviceOrientation (preparação pra v2).

**No device:**
- Deploy no Vercel (preview branches dão URL HTTPS automática).
- Meta AI app → Developer Mode → Add Web App → cola URL.
- Validar:
  - WebGL renderiza? (spike inicial — risco principal)
  - Frame rate aceitável (>20fps)?
  - Materiais claros são legíveis no display aditivo?
  - Swipes geram impulsos como esperado?
  - Pinça reseta corretamente?

**Testes automatizados:** módulo `physics.js` é puro JS → unit tests com Vitest (impulse, step, damping, reset, continuous toggle). `viewer.js` e `input.js` são integração mais difícil — confiar em teste manual no device.

## 9. Spike obrigatório antes de fechar v1

**Risco principal:** WebGL pode não rodar bem (ou nada) no display aditivo do Meta Display. Documentação oficial não menciona WebGL explicitamente.

**Risco secundário:** evento exato do gesto "back" da Neural Band não está documentado. Pode ser `Escape`, pode ser outro.

**Spike (≤ 1h):**
1. Subir uma página HTML mínima com:
   - Um cubo Three.js girando + texto "OK".
   - Um listener `keydown` que escreve na tela cada tecla recebida (pra descobrir empiricamente qual tecla o gesto back gera).
2. Deploy no Vercel.
3. Instalar no device, abrir, observar:
   - Renderiza?
   - Cubo gira suave (estimar fps)?
   - Texto legível?
   - Que tecla o gesto back dispara?
4. Se WebGL ok → seguir o design.
5. Se WebGL falhar → plano B: renderizar em SVG ou Canvas2D com projeção 3D manual (factível pra modelos simples mas perde GLTFLoader).

## 10. Deploy + instalação no óculos

1. `npm run build` → `dist/` estático.
2. `vercel deploy --prod` → URL tipo `https://metadis-xxx.vercel.app`.
3. Garantir HTTPS válido (Vercel já dá).
4. No celular: Meta AI app → Settings → Developer Mode → Add a Web App → colar URL.
5. Nos óculos: abrir Web Apps → selecionar.

Pra teste rápido durante dev: Vercel preview deploys por branch (push → URL temporária).

## 11. Decisões abertas (pra v2+, não bloqueiam v1)

- **Head IMU como input contínuo:** usar pra rotação suave em paralelo aos impulsos discretos? Boa ergonomia mas precisa calibração.
- **UI overlay:** mostrar nome do modelo / FPS / instruções? Quanto mais UI, mais o usuário perde noção do mundo real.
- **Engine física completa (Rapier, cannon-es):** só se quiser colisão, gravidade, múltiplos objetos. Pra rotação + damping, custom é mais leve.
- **Variantes de input:** double-pinch como ação extra? Multi-tap? Meta Display ainda não documenta — esperar evolução do SDK.

## 12. Resumo executivo (pra mostrar pro engenheiro)

> Web App vanilla (Vite + Three.js) hospedado em HTTPS, carrega `.glb` via query param, renderiza num canvas 600×600. Neural Band manda eventos d-pad (setas + Enter/Escape) que viram impulsos angulares num modelo de física rotacional com damping. Custom physics (sem engine), 4 módulos (`viewer`, `physics`, `input`, `main`), deploy Vercel, instalação via Meta AI app em Developer Mode. Risco principal: confirmar que WebGL renderiza decente no display aditivo — spike de 1h antes de fechar escopo.
