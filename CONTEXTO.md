# PROJETO: FUTEBOL TOP-DOWN v5.0 (Phaser 4 / Vanilla JS)

## 1 — Visão Geral
Jogo de futebol top-down 2D single-player em **Phaser 4.2.1** (carregado via CDN) + **JavaScript puro (ES6 classes, SEM bundler, SEM modules)**. Tudo carregado por tags `<script>` em ordem estrita no `index.html`.

**Stack:**
- HTML5 + CSS (tema pixel-art retro-moderno, verde noturno + dourado + azul elétrico)
- Phaser 4 Arcade Physics (gravidade 0, movimento 2D manual)
- Sprites com atlas/animações 8-direções
- DOM Elements (`this.add.dom()`) para todas as telas de menu e HUD overlay
- Persistência via `localStorage` (key: `phaser_football_career`)
- Controles: Teclado WASD + Shift + Espaço, Mouse (clique esq=chute, dir=passe), Gamepad XInput
- Multiplayer LAN e ONLINE: servidor Node sem dependência (`server/`), WebSocket na mão.
  Frontend estático (Netlify) + servidor de salas (Render), ou tudo no mesmo processo em LAN

**Canvas 1000×600**, mundo maior 1400×2000 (campo 1000×1600 + arquibancadas). Câmera segue jogador com lerp.

---

## 2 — Estrutura de Pastas

```
JOGO_FINAL/
├── index.html                    ← PONTO DE ENTRADA, scripts carregados na ORDEM abaixo
├── css/
│   └── ui.css                    ← Tema pixel-art completo (botões, painéis, toasts, modal)
├── assets/
│   ├── Jogador-novo/             ← ARTE BASE do palette swap (110 PNGs soltos)
│   │   └── Idle/{rotations, animations/Running (8 frames), animations/shooting}
│   │      ATENÇÃO: export com QUATRO tamanhos (68/84/88/96). Célula do atlas
│   │      é 76 e cada PNG entra centrado + clip (ver secao 10).
│   ├── Personagem-padro-linhas-verticais/  ← arte ANTIGA (legado, não usada)
│   ├── teams/                    ← atlas antigos por time (legado, ver secao 10)
│   └── ball_spritesheet.png, goalkeeper_atlas.*
└── js/
    ├── main.js                   ← Config Phaser 4 + registro das 11 cenas + boot.
    │                                 Também liga o filtro CRT em TODA cena e
    │                                 alterna a classe `crt-menu-mode` do DOM.
    ├── constants.js              ← (+/- 250 linhas) Todas constantes globais (campo, física, IA, goleiro, input, passes, UI, career)
    ├── data/
    │   ├── RealRosters.js        ← 72 elencos / 504 jogadores + getPlayerAppearance() (hash do id)
    │   └── LeaguesDB.js          ← 6 ligas nacionais + pool CONMEBOL + copas continentais
    │
    ├── systems/                  ← SISTEMAS TRANSVERSAIS (instanciados em window ou direto na cena)
    │   ├── UIHelper.js           ← Classe utilitária ESTÁTICA para DOM: createDOMButton/createDOMPanel/createDOMModal/createDOMNotification etc.
    │   ├── Som.js               ← Dono ÚNICO do áudio. Sintetiza tudo no WebAudio
    │   │                            (zero arquivo), contexto criado no 1º gesto. Ver seção 17.
    │   ├── EfeitosVisuais.js     ← Dono ÚNICO dos efeitos (CRT, grão, riscos, curvatura da UI, tremor).
    │   │                            Estado + aplicação + persistência em localStorage. O CATALOGO gera os
    │   │                            interruptores das DUAS telas de config (menu e pausa).
    │   ├── CareerMode.js         ← (1931 linhas) Sistema MODO CARREIRA: progressão, stats, skills, notícias, tabela, liga, dilemas, transferências, save/load localStorage
    │   ├── TacticManager.js      ← (116 linhas) Posicionamento tático: arquétipos (FIXO/WING_L/R/PIVOT) + formações (3-1 / 2-2 / 4-0), getTargetPosition()
    │   ├── AIBrain.js            ← FSM ÚNICA da IA de linha (5 estados). Player e Enemy só delegam.
    │   ├── SeasonManager.js      ← Sorteio das copas + tabela viva + PRNG com worldSeed (ver secao 12)
    │   ├── MatchSimulator.js     ← Placar dos jogos de fundo (Poisson sobre rating, ver secao 12)
    │   ├── CalendarManager.js    ← Calendário global do ano, sem colisão de clube (ver secao 12)
    │   ├── CrtVhsFilter.js       ← Filtro de câmera do Phaser 4 (controller + render node):
    │   │                            curvatura, bloom com limiar, grão, ranhuras,
    │   │                            faixa de rastreamento, contraste. Carregar ANTES do main.js.
    │   └── LobbyClient.js        ← Ponta cliente da sala LAN. Só transporte; regra nenhuma (ver secao 15).
    │
    ├── entities/                 ← ENTIDADES DO JOGO (extends Phaser.Physics.Arcade.Sprite)
    │   ├── Ball.js               ← Física customizada: EIXO Z FALSO (z/vz/gravity/bounce) + curveX/curveY para efeito. Sombra separada do sprite visual.
    │   ├── Player.js             ← (746 linhas) Controlado por humano. TEM IA também: updateEnemyAI() de ~395 linhas (duplicação com Enemy).
    │   ├── Enemy.js              ← (1263 linhas) Controlado por IA. Utility score baseado: distância ao gol, linha de passe livre, valida 7 alvos de chute por frame.
    │   └── Goalkeeper.js         ← (655 linhas) Goleiro com shouldParry() (score baseado em velocidade/distância/alcance), reposição inteligente, pulo, mergulho.
    │
    ├── scenes/                   ← 11 CENAS DO PHASER, fluxo abaixo:
        ├── MenuScene.js            ← Menu principal (DOM HTML): Exibição / Multiplayer / Nova Carreira /
        │                              Continuar + modal EFEITOS VISUAIS
        ├── CharacterCreationScene.js ← Criação do personagem: nome, time, atributos
        ├── PreGameScene.js         ← (1117 linhas) Escalação, tática, habilidades, tela "VS"
        ├── ExhibitionMatchScene.js ← Wrapper para partida rápida sem carreira
        ├── TrainingScene.js        ← Mini-jogo de treino para upar XP
        ├── PenaltyShootoutScene.js ← Decisão de pênaltis
        ├── GameScene.js            ← (~3770 linhas, GOD OBJECT) — CENA PRINCIPAL DO JOGO. Quase tudo acontece aqui.
        ├── GameScene.render.js     ← Mixin de prototype: drawPitch/drawGrandstands/createGoals/createPost/createNet/createMinimap/updateMinimap. Carregar SEMPRE depois de GameScene.js.
        ├── GameScene.input.js      ← Mixin de prototype: setupInput() (teclado+mouse, chamado no create), updateInputPolling() (TAB+gamepad, chamado no update), togglePauseMenu(). Carregar SEMPRE depois de GameScene.js. Testado por test_input.js.
        ├── GameScene.replay.js     ← Mixin de prototype: recordReplayFrame/startReplay/playNextReplayFrame/stopReplay. Buffer circular de 180 frames. Testado por test_replay.js.
        ├── GameScene.hud.js        ← Mixin de prototype: showFloatingText/spawnImpactDust/updateTimer + menu de pausa completo (_openPauseMenu/_closePauseMenu/_openSubstitutionMenu/_performSubstitution/_openPauseMenuAfterSub/_openConfigMenu/_quitToMenu). NÃO contém updateHUD() — essa é closure criada dentro de GameScene.create().
        ├── EndGameScene.js         ← Resultado final da partida, XP, match rating
        ├── PlayerProfileScene.js   ← Perfil do jogador: atributos, skills, stats, skillpoints
        ├── TransferMarketScene.js  ← Mercado de transferências (lista times e propostas)
        ├── GameScene.lan.js        ← Mixin: aplica a escalação da sala LAN nos bonecos já criados
        │                              (arquétipo, nick, lanId/lanChave, quem é o local).
        ├── GameScene.lansync.js    ← Mixin: rede da partida — envio 20Hz, interpolação,
        │                              chute/gol/apito como evento. Autoridade no anfitrião.
        └── MultiplayerScene.js     ← Multiplayer: modo → lan | online → sala (uma cena, quatro telas)

server/                            ← SERVIDOR DE SALAS (Node, ZERO dependência)
├── lobby.js                       ← Regra DENTRO da sala, sem rede. Estado puro, testável.
├── salas.js                       ← QUAIS salas existem e quem está em qual: pareamento (fila 1v1),
│                                    sala privada por código de 4 dígitos, faxina de sala vazia.
│                                    `sala.pareamento` separa fila (começa sozinha) de sala com
│                                    código/LAN (espera o capitão).
├── server.js                      ← http estático + /health + WebSocket na mão + repasse por SALA
├── package.json                   ← só para o Render (`npm start`); dependencies vazio
├── test_lobby.js                  ← 27 asserts: `node server/test_lobby.js`
└── test_salas.js                  ← 33 asserts: `node server/test_salas.js`

netlify.toml                       ← publish na raiz, sem build; /server/* 404; cache curto em js/css
.gitignore                         ← node_modules, logs, __pycache__, .claude/settings.local.json
```

---

## 3 — Fluxo de Cenas

```
MenuScene
  ├─ Partida Rápida ───────────► ExhibitionMatchScene ──► GameScene ──► EndGameScene ──► MenuScene
  │
  ├─ Multiplayer ──► MultiplayerScene ─┬─ LAN (por IP) ──────► sala ──► GameScene
  │                                    ├─ Online: partida rápida 1v1 (servidor pareia e inicia)
  │                                    └─ Online: criar/entrar por código ──► sala ──► GameScene
  │
  ├─ Efeitos Visuais (modal, não troca de cena)
  │
  └─ Nova Carreira ──► CharacterCreationScene ──► PreGameScene ──► GameScene ──► EndGameScene
                                                                      │
                                                                      └─ Se empate: PenaltyShootoutScene
                              │
                              ├─ PlayerProfileScene  (perfil/atributos/skills)
                              ├─ TrainingScene       (treina XP)
                              ├─ TransferMarketScene (mercado)
                              └─ PreGameScene ─────── (loop de temporada)
```

---

## 4 — Variáveis Globais Importantes
- `window.careerMode` = instância singleton da classe CareerMode (instanciada no continue carregado / CharacterCreationScene). Passa estado de carreira entre cenas.
- Todas as constantes são globais: `PITCH_WIDTH`, `WORLD_WIDTH`, `GameStates`, e os grupos `BALL_PHYSICS`, `PLAYER_ATTR`, `STAMINA`, `TACKLE`, `AI_BEHAVIOR`, `GOALKEEPER`, `INPUT_CONFIG`, `PASS_TYPES`, `UI_CONFIG`, `CAREER_BASE` — todos em `constants.js`.
- Grupos novos em `constants.js`: `KIT_KEYS`, `SWAP_TUNING`, `TEAMS_DB`, `SKIN_COLORS`, `HAIR_COLORS`, `BASE_SPRITE_PATH`/`BASE_DIRS`/`BASE_FRAME_SIZE`/`BASE_RUN_FRAMES`/`BASE_KICK_FRAMES`/`BASE_KICK_MISSING`, `KICK_ANIM_MS`, `SKID_MARK`, `CURVE_SKILL`, `CAMERA` (zoom contextual), `PACE_SCALE` (cadência global), `DEFAULT_STATS` + `normalizeStats()` + `statWeight()` (ficha do atleta).
- `EfeitosVisuais` é global (não é `window.x`): estado dos efeitos, lido pelo `main.js` e pelas duas telas de configuração.
- `LEAGUES_DB`, `SOUTH_AMERICAN_POOL`, `CONTINENTAL_CUPS`, `REAL_ROSTERS` são globais de `js/data/`.
- **O campo é HORIZONTAL** (gols esquerda/direita). `WORLD 2000x1400`, `PITCH 1600x1000`. `gkTop` = gol da ESQUERDA, `gkBottom` = da DIREITA (nomes legados da era vertical).
- `GameScene.create()` publica `this.PITCH_X/PITCH_Y/PITCH_WIDTH/PITCH_HEIGHT/GOAL_LINE_OFFSET` — as entidades leem daí.

---

## 5 — Funcionamento das Classes Principais

### `constants.js` — [constants.js](JOGO_FINAL/js/constants.js)
+250 linhas, agrupados por domínio:
- **BALL_PHYSICS**: gravidade Z, atrito chão/ar/chuva, bounce, distância pegada bola
- **PLAYER_ATTR**: coeficientes velocidade base/sprint, estamina, força de chute
- **STAMINA**: taxas de recuperação, custos por ação, penalidades de exaustão
- **TACKLE**: duração/cooldown dash, mult velocidade, steal trigger distance
- **AI_BEHAVIOR**: distâncias para chute (420), passe (100-620), drible (85), pressão, suporte, separação agentes
- **GOALKEEPER**: alcance em pé/pulando, velocidade mergulho, cooldowns, hitboxes
- **INPUT_CONFIG**: carga chute 800ms, tap/pass 180ms, limiares
- **PASS_TYPES**: configs separadas para THROUGH / CROSS / SHORT / NORMAL
- **UI_CONFIG**: barra de carga, replay buffer 180 frames (=3s), camera lerp
- **CAREER_BASE**: valores iniciais atributos, data início temporada 2026-03-01, rating inicial 6.0

### `CareerMode.js` — [CareerMode.js](JOGO_FINAL/js/systems/CareerMode.js)
Classe **muito grande (1931 linhas)**. Persistência via JSON serializado.

Principais propriedades (`resetDefaults()`):
```js
this.playerName, this.club, this.position (ATACANTE/PIVOT/MEIA/WING/FIXO)
this.speed, this.kickPower, this.stamina, this.level, this.xp, this.nextLevelXP
this.skillPoints, this.coachReputation, this.condition (físico)
this.skills (powerShot/finesseShot/speedDemon/staminaKing/bicycleKick/ironLegs)
this.stats (gols, passes, tackles, minutos, títulos)
this.season, this.date = {year, month, day}  (data atual da carreira)
this.calendarMatches = []   // próximas partidas
this.tables = {Brasil: {...}}  // classificação da Série A
this.rivals = {}   // jogos contra cada time
this.leagues.Brasil = [...20 times]  // times reais
this.notifications = []  // pop-ups fila
this.newsHistory = []    // histórico persistente
this.pendingDilemma = null
this.dilemmas = [
  // 5 CONDICIONAIS (z-4_tabela, lider_tabela, artilheiro, seca_gols, mata_mata)
  // + 3 GENÉRICOS (reporter_polêmico, festa_vip, treino_extra)
]  // total 8 dilemas
```
Métodos chave: `startNewCareer()` → `advanceDay()`, `generateNextMatch()`, `resolveMatchAfterGame()`, `evaluateDilemma()`, `upgradeSkill()`, `saveToLocalStorage()`, `loadFromLocalStorage()`.

### `TacticManager.js` — [TacticManager.js](JOGO_FINAL/js/systems/TacticManager.js)
Constantes `ARCHETYPES` (4 posições) e `TACTICS` (3 formações). Método principal:
```js
getTargetPosition(archetype, tacticName, ballPos, ownGoalPos, opponentGoalPos, formationAngle)
```
Retorna ponto alvo 2D (x,y) do posicionamento tático baseado em interpolação entre ownGoal e opponentGoal. Também tem `separateAgents(players, minDist)` e `getOwnGoalkeeper(team)`.

### `Ball.js` — [Ball.js](JOGO_FINAL/js/entities/Ball.js)
Física única:
```
update():
  vz -= gravity   (0.45)
  z  += vz
  se z <= 0: z=0, vz = -vz * bounceZ (0.65)
  x,y -= curveX/Y * dt  (efeito)
  velocity *= frictionGround / frictionAir / frictionRain

applyImpulse(dx,dy,dz, powerCurveFactor, curveX,curveY):
  velocidade 2D += dx*dy ajustados
  vz += dz (altura do salto da bola)
  curveX/Y acumulados
```
Campo `owner` = player/enemy atualmente com a bola. Ao colidir com jogador aplica bounce 0.6.

### `Player.js` / `Enemy.js` — [Player.js](JOGO_FINAL/js/entities/Player.js) / [Enemy.js](JOGO_FINAL/js/entities/Enemy.js)
Classes quase idênticas (395 linhas de IA duplicadas em ambos).

**Stats de cada jogador:** `maxSpeed, sprintSpeed, maxStamina, stamina, lowStamina, maxKickForce, dashSpeed, team, archetype, position, handleRotation, nearestEnemy, dodgeTimer, dashActive, dashCooldown, missedTackleTimer, kickCooldown, kickCooldownShot, kickCooldownPass, tackleCooldown, attributes {...}`

**Player.applyAttributes()** calcula tudo a partir de `attributes = {speed, kickPower, stamina}`.

**Player.updateEnemyAI(delta, ball, allPlayers, ownGoal, opponentGoal, tactic, gkArea)**
Score-based decision:
1. Calcula alvo chute em 7 pontos da área (6 postes, 1 centro). Usa line-of-sight: `Phaser.Geom.Intersects.LineToLine` percorrendo 100 pontos por inimigo para bloqueio.
2. Escolhe melhor passe: encontra aliado com `findBestPassTarget()` que valida distância (100–620), caminho livre por raio, distância do alvo ao gol oposto.
3. Valida ações: pressionado ou não, stamina, distância da bola, z altura.
4. Drible automático: dodgeTimer com offset perpendicular.
5. Separação de agentes: push vetorial.
6. Suporte: `getSupportRunTarget()` cria corredor.
7. Contra-ataque: se bola recuperada e no backfield, avança rápido.

### `Goalkeeper.js` — [Goalkeeper.js](JOGO_FINAL/js/entities/Goalkeeper.js)
- `shouldParry()` retorna score (0–1) para cada direção de pulo com base em velocidade da bola, distância, lado, alcance max horizontal 180px.
- Posição padrão: no segmento entre gkArea e ball, pendulum radius.
- Sai da linha (rush): se bola perto e angulo favorável.
- Repõe: acha aliado mais avançado via `getTeammate()` score.
- Estados: STANDING / JUMPING / DIVING / HOLDING_BALL / THROWING

### `GameScene.js` — CENA PRINCIPAL — [GameScene.js](JOGO_FINAL/js/scenes/GameScene.js)
**3550 LINHAS — GOD OBJECT ABSOLUTO**. Tudo que roda durante a partida está aqui.

**Métodos importantes (linhas aproximadas):**
- `preload()` — carrega 20+ atlas de times, atlas bola + goleiro
- `create()` — inicia tudo: texturas procedurais uniformes, animações 8-way, campo gráfico, gols, times (5v5), goleiros, colisores, input teclado/mouse/gamepad, HUD (score, timer, stamina, carga chute), câmera, replay buffer, minimapa, menu pause
- `update()` (~linha 1107) — loop 60fps: timer, posse de bola, inputs, botes/tackle, swap jogador (ESQ/DIR), update dos players (chama updateEnemyAI), gols, checkOutOfBounds, replay, HUD
- `recordReplayFrame()` (1868) / `playNextReplayFrame()` (1931) — buffer circular 180 frames = 3s de replay após gol
- `switchPlayer(targetPlayer)` (2503) — swap manual ou automático p/ jogador mais perto
- `startKickCharging` (2537) / `cancelKickCharge` (2546) — barra de carga do chute 800ms
- `kickBallFrom(kicker, targetX, targetY, kickForce, kickType, dz, ballOwnerOffset, passTarget)` — **MÉTODO MAIS IMPORTANTE** (~linha 2053). Todo chute/passe/lançamento/canto/trave passa por aqui. Aplica curva, dz inicial, orientação do chute, atualiza cooldown, verifica skill bicycle kick.
- `resetMatch()` (2701) — volta times às posições, reinicia bola, meia-lua troca lado
- `createMinimap()` (2817) — mini-câmera render-texture 200×200
- `showFloatingText(x,y,msg,color)` (2982) / `spawnImpactDust()` (3006) — partículas VFX
- `updateTimer()` (3045) — relógio partida (default 5 minutos = 300s simulados)
- `drawPitch()` (3119) / `drawGrandstands()` (3182) / `createGoals()` (3213) — renderiza campo
- `checkOutOfBounds()` (3291) — determina THROW_IN / CORNER_KICK / GOAL_KICK, reposiciona bola
- `_openPauseMenu()` (3605) / `_closePauseMenu()` (3709) — overlay DOM do pause

**States (this.gameState):** `PLAYING / THROW_IN / CORNER_KICK / GOAL_KICK / FREE_KICK / CELEBRATION / PAUSED`. "É bola parada?" é `ehBolaParada(state)`, não uma lista copiada.

**Times:** 5 jogadores de linha + 1 goleiro por time. Escalação por formações: 3-1 / 2-2 / 4-0.

---

## 6 — Input & Controles

| Input | Ação |
|---|---|
| W A S D | Mover jogador |
| Shift (esq) | Sprint (custa estamina) |
| Espaço | Dash / Bote / Tackle |
| Shift + Espaço | **Carrinho**: alcança 62 (bote 36), corre 1.85x (bote 1.38), dura 340ms, custa 1.6x de fôlego, deixa 900ms no chão quando erra e a falta dele é amarelo na hora |
| Clique Esquerdo segurar | Carregar força de chute |
| Clique Esquerdo soltar | Chutar direção do mouse |
| Clique Direito curto | Passe inteligente → aliado mais apropriado |
| Z | **Câmera**: alterna entre seguir o jogador e seguir a bola |
| Setas ESQ/DIR | Trocar jogador (swap para mais próximo da bola) |
| ESC / P / Gamepad Start | Pausar |
| Gamepad A / B / X / Y | Bote / Passe / Chute / Trocar |

✅ **Resolvido**: o gamepad tinha lógica duplicada (eventos `on('down')` + polling no update), cada botão disparando duas vezes. Os eventos foram removidos; sobrou só o polling, agora em `GameScene.input.js` → `updateInputPolling()`. Regressão coberta por `test_input.js`.

⚠️ **Atenção**: a tecla **Q** tem dois usos — passe em profundidade (evento `keydown-Q` em `setupInput()`) e habilidade especial powerShot (polling em `GameScene.update()`). Isso é comportamento existente, não bug de duplicação.

---

## 7 — Pontos Problemáticos Conhecidos (issues para refatorar)

1. **MAJOR (era CRITICAL)** — [GameScene.js](JOGO_FINAL/js/scenes/GameScene.js) foi de 3944 para **2897 linhas**, divididas em 4 mixins de prototype (`render`, `input`, `replay`, `hud`). Ainda é grande e acoplado: `create()` e `update()` seguem gigantes e todos os mixins compartilham estado livre da cena. Próximo passo se incomodar: extrair set-pieces (`checkOutOfBounds`/`setupSetPiece`/`repositionPlayersForSetPiece`) e o núcleo de chute (`kickBallFrom`/`executPass`/`findBestPlayerPassTarget`).
2. ~~**MAJOR** — Loops aninhados O(n²) na IA por frame.~~ **RESOLVIDO** — `AIBrain` separou PENSAR (a cada `DECISION_INTERVAL_MS`) de MIRAR/ANDAR (todo frame). Medido: 5,3 decisões pesadas por bot por segundo contra ~59 antes.
3. ~~**MAJOR** — Código duplicado Player.js `updateEnemyAI()` ≈ Enemy.js `updateEnemyAI()`.~~ **RESOLVIDO** — os dois delegam a `js/systems/AIBrain.js`, uma FSM de 5 estados. `Player.js` 925→536, `Enemy.js` 1493→699. Coberto por assert de transição no boot.
4. ~~**MAJOR** — Gamepad input duplicado (event + polling) na GameScene.~~ **RESOLVIDO** — eventos removidos, só o polling em `GameScene.input.js`. Coberto por `test_input.js`.
5. **MAJOR** — Não usa ES6 Modules (só tags `<script>`). Ordem errada quebra tudo.
6. **MAJOR** — Variável global `window.careerMode` — anti-padrão.
7. **MINOR** — HUD GameScene usa `innerHTML` hardcoded ao invés de `UIHelper`.
8. **MINOR** — `Enemy.handleRotation` definido via fallback `||` dentro de update (linha ~356).
9. **MINOR** — `Ball.update()` chama `anims.exists("ball_rotate")` todo frame sem cache.

---

## 8 — PONTOS DE EXTENSÃO (onde adicionar features novas)

| O que mudar | Arquivo / Função |
|---|---|
| Balancear números (velocidade, chute, estamina, goleiro) | **constants.js** → grupos `PLAYER_ATTR` / `STAMINA` / `TACKLE` / `GOALKEEPER` / `AI_BEHAVIOR` |
| Adicionar atributo/skill/valor inicial carreira | **CareerMode.js resetDefaults()** linha 10+ |
| Adicionar notícia / dilema de carreira | **CareerMode.js** → `this.dilemmas.push({})` linha ~285 ou `addNews()` |
| Mudar cálculo de chute/passe/curva | **GameScene.kickBallFrom()** linha ~2053 |
| Mudar/criar IA de jogador ou enemy | **Enemy.js update()** linha base + `findBestPassTarget()` + `evaluateShotsOnGoal()` |
| Adicionar regra / evento jogo (cartão, falta, impedimento) | **GameScene.update()** início, **GameScene.resetMatch()**, adicionar novo `GameState` |
| Mudar visual campo / arquibancadas | **GameScene.drawPitch()** (3119), **drawGrandstands()** (3182), **createGoals()** (3213) |
| Efeitos visuais (partículas, fumaça, flash) | **GameScene.spawnImpactDust()** (3006) / **showFloatingText()** (2982) — seguir padrão |
| Tela nova / menu novo | Nova classe `extends Phaser.Scene` → registrar em **main.js** → DOM com `this.add.dom().createFromHTML()` → classes CSS de **ui.css** (`pui-btn pui-panel pui-modal pui-notification`) |
| Tático (formação nova ou arquétipo) | **TacticManager.js** → adicionar em `TACTICS` / `ARCHETYPES` + ajustar `getTargetPosition()` |
| Save / Load customizado | **CareerMode.js saveToLocalStorage()** / **loadFromLocalStorage()** + método toJSON / fromJSON |

---

## 9 — Como Executar
Como é Phaser via CDN + arquivos estáticos, **basta abrir via servidor HTTP local** (não `file://` direto por CORS do browser). Recomendações:
```
# Opção 1: Python (se tiver instalado)
cd JOGO_FINAL ; python -m http.server 8000

# Opção 2: Node (npx, vem com npm)
cd JOGO_FINAL ; npx serve .

# Depois abre no browser http://localhost:8000

# Opção 3: o PRÓPRIO servidor de salas (serve o jogo E hospeda a sala)
node server/server.js        → http://<seu-ip>:8080
```

**Multiplayer local:** quem cria roda `node server/server.js` e passa o IP que
aparece no terminal; os outros entram por ENTRAR POR IP.

---

## 9b — Deploy (Netlify + Render)

Repositório único, dois serviços lendo a mesma origem:

| | Netlify (frontend) | Render (servidor de salas) |
|---|---|---|
| Base / Root Directory | raiz | `server` |
| Build command | **vazio** (não há bundler) | vazio |
| Publish directory | `.` | — |
| Start command | — | `npm start` |

Depois do primeiro deploy do Render, cole o host em `LobbyClient.ONLINE_HOST`
(fim de `js/systems/LobbyClient.js`) e faça commit — **é esse commit que liga o
online**. Sem ele o botão tenta o host da própria página do Netlify, onde não
existe sala.

Três coisas que mordem:
- **`wss://`**: a página do Netlify é https e o navegador recusa `ws://` sem
  mensagem nenhuma. `LobbyClient.urlDe()` já resolve o esquema pela página.
- **Hibernação**: o plano free do Render dorme em ~15min. Aponte um monitor
  (UptimeRobot) para `https://SEU-APP.onrender.com/health` a cada 10min. A
  primeira partida depois de dormir leva ~50s para acordar.
- **Build Filters** no Render (`server/**` em Included Paths): sem isso todo
  push de frontend derruba a sala por ~1min.

---

## 10 — MOTOR GRÁFICO: Palette Swap HSL

Uma arte base repintada em runtime gera o uniforme de qualquer time e a
pele/cabelo de qualquer jogador. Substitui os 20 atlas por time em
`assets/teams/` (que ainda são carregados, mas viraram peso morto).

### Arte base
`assets/Jogador-novo/Idle/` — 110 PNGs **soltos**, em QUATRO tamanhos
(68, 84, 88 e 96). A célula do atlas é 76 (`BASE_FRAME_SIZE`) e cada PNG entra
CENTRADO e com `clip()` — sem o recorte, frame grande invade a célula vizinha e
o pé de um sprite aparece sobre a cabeça do outro. `body.setOffset` e
`setDisplaySize` das entidades derivam da célula; número fixo ali desalinha o
corpo e encolhe o boneco quando o tamanho do sprite muda.
(sem spritesheet, sem atlas JSON):
- `rotations/{dir}.png` — 8 direções, 1 frame idle cada
- `animations/Running/{dir}/frame_00N.png` — 8 frames
- `animations/shooting/{dir}/frame_00N.png` — 5 frames

`loadBaseSprites()` carrega tudo com chaves `base_idle_{dir}`,
`base_run_{dir}_{i}`, `base_kick_{dir}_{i}`.

### KIT_KEYS — cores reservadas na arte (constants.js)
| material | RGB | matiz |
|---|---|---|
| shirt1 (camisa/chuteira) | #1278ba azul | 203° |
| shirt2 (listras/meião) | #9b0c71 magenta | 317° |
| shorts (calção) | #abe925 lima | 78° |
| skin (pele) | #b1441c laranja | 16° |
| hair (cabelo) | #2f0669 violeta | 264° |

Valores MEDIDOS no PNG (mediana de luminância de cada rampa, sobre os 110
frames), não copiados de especificação: o sprite tem 42 tons anti-serrilhados e
nenhum hex da paleta nominal existe no arquivo. Não há material `logo`.

**O cabelo veio na mesma rampa magenta das listras** e foi girado na ARTE para
264°, 50° longe do magenta — o corte do `colorMaterial` é 45°. Separar por "1
dígito de hex" não funciona com classificação por matiz.

### O algoritmo (GameScene.render.js)
`rgbToHsl` / `hslToRgb` / `colorMaterial` / `buildKitAtlas` / `createKitAnims`.

**1. Classificação por MATIZ, não por distância RGB.** Os 80 frames têm **368
cores distintas** porque a iluminação muda o RGB conforme a direção. Sombra e
luz do mesmo tecido ficam longe em RGB (64–84 de distância) mas praticamente no
mesmo matiz. Casar por matiz é o que faz frente, lado e costas caírem no mesmo
material — sem isso a cor "piscava" ao virar de ângulo.

**2. Corte de saturação `SWAP_TUNING.SAT_MIN = 0.25`.** Pixel com saturação HSL
abaixo disso não tem matiz confiável: é contorno, meia ou olho, e é pulado.
O valor **não pode ser 0.20**: o contorno `(26,17,21)` tem saturação 0.21 e
matiz 333° (colado no magenta), e seus 4718px vazavam para a camisa
(shirt1 saltava de 2103px para 6827px). Em 0.30 já começa a comer tons
legítimos de cabelo.

**3. Teto `SWAP_TUNING.MAX_HUE_DIST = 45°`.** Acima disso mistura material:
shirt1 (322°) e hair (287°) ficam a apenas 35° um do outro. Distância é
circular — 350° e 10° distam 20, não 340.

**4. Aplicação: matiz e saturação do ALVO, relevo do PIXEL.**
```
L_saida = clamp( L_alvo + (L_pixel − L_chave), 0, 1 )
saida   = hslToRgb( H_alvo, S_alvo, L_saida )
```
Preserva-se o **desvio** de luminância, não o L absoluto. Guardar o L absoluto
quebraria uniforme preto e branco: um pixel de camisa em L=0.5 viraria cinza
médio tanto para o preto do Corinthians quanto para o branco do Real Madrid.
Medido no Corinthians: 31189px em L<0.2 (calção/listras pretas) e 6863px em
L>0.7 (camisa branca).

### Textura gerada
`buildKitAtlas(scene, teamName, {skin, hair})` → chave
`kit_{team}_{skin}_{hair}`, cacheada (dois jogadores iguais não pagam duas
vezes). Grade **10 colunas x 8 linhas** de 68px (680x544):
- coluna 0 = `idle_{dir}`
- colunas 1–4 = `run_{dir}_{0..3}`
- colunas 5–9 = `kick_{dir}_{0..4}`
- linhas = ordem de `BASE_DIRS`

Uma textura por variante com as três ações juntas (não duas texturas separadas):
as entidades indexam tudo por um único `this.atlasKey`, e separar obrigaria a
trocar `atlasKey` no meio da animação.

`createKitAnims` cria **24 anims por variante**:
`${atlasKey}_{idle|run|kick}_{dir}`.

### Animação de chute
`kickBallFrom()` marca `entity.kickAnimUntil = time.now + KICK_ANIM_MS` (320ms).
Ponto único: passe, cruzamento, chute a gol e bola parada, de jogador e de IA.
Timestamp em vez de contador porque sobrevive aos early-returns do `update()`.
`updateAnimation` prioriza `kick` sobre `run`/`idle`.

---

## 11 — BANCO DE DADOS E DETERMINISMO

### `js/data/LeaguesDB.js`
- **6 ligas nacionais** em `LEAGUES_DB`: `premier_league`, `la_liga`, `serie_a`,
  `bundesliga`, `ligue_1` (10 clubes cada) e `brasileirao` (16 clubes).
  Cada uma declara `championsSlots` / `europaSlots` / `relegationSlots`.
  O Brasileirão tem 0 vaga de UEFA — disputa CONMEBOL pelo pool.
  O Brasileirão dá `libertadoresSlots: 6` / `sudamericanaSlots: 6` — classifica
  pela TABELA, igual às europeias.
- **`SOUTH_AMERICAN_POOL`**: só os 6 clubes SEM liga jogável (River, Boca,
  Peñarol, Nacional, Colo-Colo, Olimpia), `libertadoresSlots: 4`,
  `sudamericanaSlots: 2`. Os brasileiros saíram daqui: estavam listados nos
  dois lugares, e era a duplicata que fazia parecer que o Brasileirão estava
  fora do continente.
- **`CONTINENTAL_CUPS`**: champions, europa, libertadores, sudamericana.
  Cada copa aponta para o campo de vaga por nome (`slotKey`) — **qualquer** liga
  ou o pool que declare esse campo entrega vaga. Não existe mais `source`.
- **`tier` da liga (1-5)** é PRESTÍGIO, não força de clube: PL e La Liga 5,
  Serie A e Bundesliga 4, Ligue 1 e Brasileirão 3. Decide quanto a liga paga no
  mercado (`leaguePayFactor`) e o rating mínimo para ela olhar um jogador de
  fora do país (`_leagueEntryRating`).
- **`DOMESTIC_CUPS`**: derivado do `cupName`/`cupShort` de cada liga
  (`copa_brasileirao` = Copa do Brasil, `copa_premier_league` = FA Cup…). Toda
  liga disputa a sua em paralelo aos pontos corridos, com o campeonato inteiro
  na chave. Sai 2 semanas defasada da continental no calendário.
- **`short`** em cada liga e copa (`PL`, `UCL`, `BRA`, `LIB`, `CDB`) +
  `competitionShort(id)`: é daí que sai a etiqueta do calendário. A UI não
  escreve sigla nenhuma.
- `buildCareerLeaguesFromDB()` converte para o formato que o `CareerMode` já
  usa (`{name, label, rating, tier, shirtColor, shirtColor2}`), chaveado por
  país. `name` guarda o **id** (chave de TEAMS_DB/REAL_ROSTERS), `label` o nome
  de exibição.

### `js/data/RealRosters.js`
- **72 elencos / 504 jogadores.** Os 56 clubes internacionais têm exatamente
  **1 GK + 2 DEF + 2 MID + 2 FWD** (1 goleiro + 6 de linha).
- Formato: `{ id: "time_nome", name: "Nome Real", position: "POS", rating: NN }`.
  O `id` é sem acento; o `name` mantém a grafia.

### `TEAMS_DB` (constants.js)
73 chaves: 72 clubes com **cores reais** (`shirt1`, `shirt2`, `shorts`, `logo`
em `0xRRGGBB`) + `__preview` (uniforme branco, manequim da criação).
Uniforme liso repete a cor em shirt1/shirt2; listrado ou bicolor divide.

### Aparência determinística — sem sorteio
`getPlayerAppearance(player)` em `RealRosters.js`:
- Hash **FNV-1a** do `player.id` → índice em `SKIN_COLORS` / `HAIR_COLORS`.
- `skin` e `hair` explícitos no objeto do jogador **ganham** do derivado.
- O mesmo NPC sai idêntico em toda partida e em todo save; elenco novo já nasce
  com aparência, sem curadoria.
- O avatar do usuário NÃO usa hash: vem de `careerMode.skinColor` e
  `careerMode.hairColor` (ambos persistidos no save).
- `Player`/`Enemy` recebem a aparência pelo **8º parâmetro** do construtor; o
  `GameScene` a resolve do elenco (`allies[i] → getLinePlayers(time)[i]`, mesma
  ordem que o `assignRealPlayerNames` usa, então rosto bate com nome).

---

## 12 — ECOSSISTEMA GLOBAL: temporada e calendário

O mundo roda sozinho; a carreira do usuário é um **recorte** dele.

### `js/systems/SeasonManager.js`
- **PRNG próprio (xorshift32)** semeado por `worldSeed`, que é salvo no save.
  A mesma seed reproduz a temporada inteira — essencial para depurar um bug de
  calendário vindo de um save. `Math.random` tornaria isso impossível.
- `seedInitialTournaments(previousTables)`: com as tabelas finais do ano
  anterior as vagas saem da classificação REAL; sem elas (temporada 1) fabrica
  uma classificação plausível por liga (força + ruído de ±8). O `CareerMode`
  guarda as tabelas em `_lastSeasonTables` na virada e o `initializeWorld`
  consome uma vez.
- **Uma regra de vagas só.** `_leagueQualifiers(slotKey)`: toda liga que declara
  o campo classifica pela tabela, e a copa "de baixo" pula as vagas da "de cima"
  pelo mapa `{europaSlots: championsSlots, sudamericanaSlots: libertadoresSlots}`.
  `_poolQualifiers(slotKey)` completa com quem não tem liga jogável.
- **`poolRanking` é fato da temporada.** Ordenar o pool a cada chamada fazia o
  corte "pula as 4 primeiras" pular as primeiras de OUTRA ordenação, e o mesmo
  clube caía na Libertadores e na Sul-Americana.
- Chaveamento gerado para **qualquer** quantidade de times: completa com BYE até
  a próxima potência de 2 (12 ou 19 participantes funcionam sem tabela à mão).

### `js/systems/CalendarManager.js`
Modelo de tempo igual ao do `CareerMode`: `dayOffset` inteiro a partir de uma
data inicial.

`CALENDAR_RULES`:
| regra | valor |
|---|---|
| `CUP_DAYS` | `[2,3]` — terça e quarta |
| `LEAGUE_DAYS` | `[6,0]` — sábado e domingo |
| `OVERFLOW_DAYS` | `[1]` — segunda, válvula de escape |
| `MIN_REST_DAYS` | `3` (72h) |
| `MAX_DEFER_DAYS` | `21` |

**Hierarquia:** copas continentais são marcadas PRIMEIRO e mandam no
calendário; as ligas se encaixam no que sobrou.

**Descanso:** `canPlay(clube, dia)` exige folga ≥ `MIN_REST_DAYS` contra
**todos** os jogos já marcados do clube. Quem jogou quarta não pode sexta
(folga 2); pode sábado (folga 3). Suba para 4 se quiser forçar o domingo.

**Resolução é por CONFRONTO, não por rodada:** só os clubes que jogaram copa
escorregam; o resto da rodada fica no fim de semana. Ordem de tentativa:
sábado → domingo → segunda → data reserva (varrendo para frente e evitando dia
de copa). Metade da rodada abre no sábado e metade no domingo — sem isso tudo
empilha no sábado e a regra de descanso nunca é exercitada.

**`cupWindows`:** mata-mata não sabe quem joga a 2ª fase antes da 1ª. As datas
das fases futuras ficam **reservadas** ali (`{competition, round, dayOffset,
resolved}`) e o confronto é marcado quando os vencedores existirem.

**Quem fecha esse ciclo:** `SeasonManager.advanceCupWinners()` promove os
vencedores no bracket e devolve os confrontos novos;
`CalendarManager.resolveCupWindows(season, minDay)` acha a janela reservada da
fase e vira o confronto em fixture. `CareerMode._simulateWorldDay()` chama isso
uma vez por dia simulado.
- Uma fase avança quando todo jogo dela está **decidido** — com vencedor **ou**
  faltando um dos lados. A Champions tem 19 classificados numa chave de 32, o
  que produz confrontos com os DOIS lados vazios; tratá-los como pendentes
  travava a copa inteira na 1ª fase.
- `minDay` (= dia atual + 1) impede marcar jogo no passado quando a fase
  anterior escorregou para cima da janela seguinte — fixture no passado nunca é
  simulado, e a copa trava.
- `recordCupResult()` grava o placar e define quem passou. Empate vira pênalti:
  moeda no PRNG, **sem** fator casa.

Temporada gerada (seed 12345): **714 jogos, 0 adiados**, folga mínima entre dois
jogos do mesmo clube exatamente 3 dias.

### `js/systems/MatchSimulator.js`
Placar de partida que ninguém joga. Não marca data, não sabe quem disputa o quê
e não grava tabela — quem chama grava.

- `starterRating(teamId)`: média de **5 titulares** — o goleiro do elenco + os
  **4 melhores de linha** por rating. Elenco inteiro seria injusto com banco ruim.
- `simulateMatch(homeId, awayId, rand)`: a diferença de rating (com
  `HOME_ADVANTAGE` somado ao mandante) vira **gol esperado** de cada lado, e o
  placar sai de um **Poisson** (Knuth). Retorna
  `{homeScore, awayScore, winnerId, isDraw}`. **Não existe** fórmula separada
  para vitória/empate/derrota: as três probabilidades são a distribuição do
  Poisson. `rand` deve ser o `_rand` do `SeasonManager` (semeado pela
  `worldSeed`) — o default `Math.random` é só conveniência de console.
- `applyResultToRows(casa, fora, placar, homeId)`: os 3 pontos da vitória em um
  lugar só, usado pela tabela do `SeasonManager` **e** pela `leagueTable` do
  `CareerMode`.

| constante (`MATCH_SIM`) | valor | efeito |
|---|---|---|
| `HOME_ADVANTAGE` | 2.5 | pontos de rating dados ao mandante |
| `BASE_GOALS` | 1.35 | gols esperados contra um igual |
| `RATING_WEIGHT` | 0.075 | quanto 1 ponto de rating vale em gol — subir mata a zebra |
| `MIN_XG` / `MAX_XG` | 0.25 / 4.0 | piso e teto da expectativa |

Medido: clássico equilibrado 47.8% / 24.7% / 27.5%; City x Torino 84.5% com
3.1% de derrota; 30 temporadas do Brasileirão dão 9 campeões diferentes.

### Jogos de fundo: `CareerMode._simulateWorldDay()`
Roda os confrontos do calendário **global** do dia que **não** envolvem o clube
do usuário, grava em `world.season.tables[liga]` e espelha na `leagueTable` que
a UI mostra. Chamado de `advanceDay()`, do loop de `simulateUntil()` e de
`recordMatch()`. Substituiu `simulateLeagueRound`/`simulateOtherMatches`, que
sorteavam **duplas ao acaso** e ignoravam o calendário.

- **Guarda `lastSimulatedDay`** — por DIA, não por confronto: o save só guarda a
  `worldSeed` e o calendário é regerado no load, então uma flag no fixture
  morreria no reload e o dia seria pago duas vezes.
- **`_worldTables` no save** — a seed regenera o calendário, não os placares.
  Consumido uma única vez dentro de `initializeWorld()`.
- `SeasonManager.tables` (tabela **viva**) é separado de `standings`
  (classificação **final** de onde saem as vagas continentais).
- Copa entra por `recordCupResult` (não tem tabela).
- **O jogo do usuário também é simulado se ele não jogou.** O critério é a marca
  `played` na entrada do schedule: jogou, o resultado real fica; pulou pelo
  calendário, o `MatchSimulator` resolve. Sem isso o clube dele terminava a
  temporada com menos jogos que o resto da liga. `generateSchedule()` preserva
  as marcas ao refiltrar.
- **`isSeasonComplete()` também exige o calendário do mundo vazio.** Olhando só
  o usuário, a temporada fechava com metade dos clubes com um jogo a menos — e é
  essa tabela que define campeão e vagas continentais.

### A copa do usuário na UI: `playerCupStatus()`
Ponto único. Acha em `world.season.tournaments` o torneio onde o clube dele
está e devolve `{id, name, phase, round, match, fixtures, champion, eliminated}`.
Toda tela de copa lê daí; `copa.phaseNames[copa.phase]` (4 fases de uma Copa do
Brasil de 8 times) não é mais consultado pela UI.

- `_cupPhaseName(idx, total)` conta **de trás para frente** — Final, Semifinal,
  Quartas, Oitavas, e "Fase de N" acima disso. Libertadores (12 clubes) e
  Champions (19) têm número de fases diferente; contar do começo erra as duas.
- `getCopaOpponent()` lê `playerCupStatus().match`, não `copa.playerMatch` — o
  legado só era reescrito no `generateSchedule` e anunciava o adversário da fase
  anterior.
- `_recordPlayerCupResultInWorld()` (no `recordCopaMatch`) põe o resultado real
  do usuário na chave do mundo. Sem isso o simulador sorteava o jogo que ele
  acabou de jogar. `recordCupResult` ignora jogo com vencedor, então a ordem
  entre os dois não importa.
- `showCopaBracket()` desenha só a **fase atual** (ponytail: 32 times não cabem
  legíveis num modal de 760px e as fases futuras nem têm adversário).
- `CareerMode.clubLabel(id)` — ID → nome de exibição. Os IDs são chave de
  `REAL_ROSTERS`/`TEAMS_DB` e vazavam até o placar da partida.
- `type` ("brasileirao"/"copa") segue literal estrutural e **nunca** vira texto:
  o nome sai de `competitionName` ou dos acessores.

**`initializeWorld()` é idempotente** (`if (this.world) return true`). O
`generateSchedule()` passou a ser chamado no meio do ano — quando
`resolveCupWindows` cria a fase seguinte, para o usuário ser convocado para ela
— e regerar o mundo ali apagaria tabelas e chaves. Quem quer mundo novo zera
`this.world` antes (só `startNewSeason`).

### A liga do usuário não é mais o Brasileirão fixo
`CareerMode.playerLeagueId()` (id no LeaguesDB, via `findClub` do clube dele),
`playerLeagueName()` (nome de exibição para a UI) e `playerLeagueClubs()`
(times no formato da carreira, por país).

- `initializeLeagueTable()` monta a tabela da liga DELE e **copia os números da
  tabela viva do mundo** quando ela existe — é o que faz uma transferência no
  meio do ano cair numa liga com meia temporada já jogada. Cada linha ganhou
  `label` (o `name` é o id: a UI mostrava "SAO_PAULO").
- `startNewSeason()` zera `this.world` ANTES de recriar a tabela, senão a
  temporada nova nasceria com os pontos da anterior.
- `loadFromLocalStorage()` NÃO força mais `currentLeague = "Brasil"`; save
  gravado errado se cura pelo clube.
- UI: `PreGameScene.showStandings()` e o resumo do `EndGameScene` perderam o
  `slice` fixo. `.pui-modal-body` já rola (`overflow-y:auto`) e `.pui-modal` tem
  `max-height: 520px` — 10, 16 ou 30 times cabem sem CSS novo.

### `CareerMode` consome o calendário global
`initializeWorld()` cria `this.world = { season, calendar }`, semeia e gera.

`generateSchedule()` **não gera mais nada**: filtra
`world.calendar.fixturesOfClub(meuClube)` e mapeia para o formato que o resto
do `CareerMode` já consumia:
```js
{ dayOffset, type, matchIndex, opponentId, isHome, competitionName, matchType }
```
- `type` é só `"brasileirao"` ou `"copa"` (literais comparados pelas cenas).
- `matchIndex` é **sequencial 1..N** por dia de jogo de liga, e é o que casa com
  `this.matchDay` em `isPlayerMatchPending()` e `simulateUntil()`.
- `totalMatches` passa a vir da contagem real de jogos, não da conta teórica.

**Apagado do CareerMode:** `_scheduleCopaBracket`, `_findNextFreeDay`,
`_hasScheduledEvent` e o round-robin local — todo o código que **escolhia
datas**, que era a duplicação real do CalendarManager. Depois foi embora também
todo o estado local de copa (`this.copa`, `initializeCopa`, `_linkCopaToWorld`,
`_simulateCopaBotMatches`, `_advanceCopaPhase`): as duas copas do clube são
torneios do mundo, e `playerCups()` é a única leitura.

Resultado: carreira brasileira = 30 Brasileirão + Libertadores + Copa do Brasil;
carreira alemã = 18 Bundesliga + Champions + DFB-Pokal. `simulateUntil()` roda a
temporada inteira.

---

## 13 — UI: Live Preview do personagem

`CharacterCreationScene` mostra o **sprite real** repintado ao vivo, no lugar do
SVG abstrato antigo.

**Não é um `Phaser.Sprite`.** A UI da cena é DOM (`add.dom`) e o container DOM
do Phaser fica **acima** do canvas — um sprite renderizaria atrás do painel
opaco e ficaria invisível. O manequim é uma `div#player-preview` com:
- `background-image` = `toDataURL()` da textura gerada
- `background-position` apontando para o frame (linha = direção `south`)
- `image-rendering: pixelated`, `transform: scale(2.6)`
- `animation: preview-run 0.55s steps(4) infinite` — keyframes injetados uma vez,
  varrendo as 4 colunas de corrida

**Motor compartilhado por mixin**, não duplicado. `GameScene.render.js` aplica
em `CharacterCreationScene.prototype`: `loadBaseSprites`, `rgbToHsl`,
`hslToRgb`, `colorMaterial`, `buildKitAtlas`, `createKitAnims`. O preview não é
aproximação: é literalmente o que entra em campo.

`updatePlayerPreview()` é chamado no fim de `renderStep()` — como o
`renderStep()` reconstrói o DOM a cada clique, um ponto só cobre pele e cabelo.

Detalhe do handler: `.pui-hair-btn` é testado ANTES de `.pui-skin-btn` porque o
botão de cabelo reusa a classe de estilo da pele e seria engolido.

Ligado a `TEAMS_DB.__preview` (uniforme branco) para pele e cabelo serem a única
coisa que muda.

---

## 14 — FÍSICA, CONTROLE E ESTADO PERSISTIDO

Quatro regras que custaram bug nesta rodada. Todas têm o "porquê" medido — não
mexa nelas sem refazer a medida.

### Movimento é Arcade, e `maxVelocity` é POR EIXO
`Player.handleMovement`, `Enemy.handleMovement` e `AIBrain.applyLocomotion`
usam `setAcceleration` + `setDrag` + `setMaxVelocity` (knobs em
`PLAYER_PHYSICS`). Substituíram um integrador manual de ~35 linhas cada.

**A pegadinha:** `setMaxVelocity` limita X e Y **separadamente**. Com teto 79 a
diagonal media **112** (79 × √2) — andar de lado era 41% mais rápido que andar
reto. Logo depois do passo de física vem o clamp pelo **módulo**:

```js
const tetoPx = maxSpeed * 60;
if (body.velocity.lengthSq() > tetoPx * tetoPx)
  body.velocity.normalize().scale(tetoPx);
```

E todo ponto que zera velocidade (bola parada, atordoado, fim de jogo) **zera a
aceleração junto** — senão o Arcade volta a empurrar no frame seguinte.

### Mouse: um botão, uma função
Esquerdo = chute, sempre (carrega no `pointerdown`, solta no `pointerup`).
Direito = passe direcionado, resolvido no `pointerdown`.
`INPUT_CONFIG.MIN_KICK_CHARGE_PCT` dá piso à carga para o clique curto sair como
chute fraco e não como toque morto. O gamepad tem mapeamento próprio (B curto =
passe) e não segue esta regra.

### BYE distribuído, não empilhado
`SeasonManager._buildKnockout` completa a chave até a potência de 2 colocando os
BYEs **um por confronto** (os primeiros `byes` confrontos são walkover). Antes
eles iam empilhados no fim da lista: com 19 clubes numa chave de 32, meia chave
nascia vazia e um clube chegava à semifinal **sem jogar** — na tela parecia
clonado em três fases. Medido depois do conserto: 0 confronto duplo-vazio e 0
slot preenchido nas quartas antes de a fase anterior ser jogada.

O invariante para conferir é por ORIGEM, não por contagem de colunas: todo slot
da fase N+1 tem de ser vencedor (ou BYE) do confronto correspondente da fase N.
Clube que venceu duas fases aparece em três colunas — isso é correto.

### Estado persistido envelhece: sanitiza no load
`transferOffers` vai para o `localStorage`. Save antigo trazia `team` como
OBJETO e a tela mostrava `[object Object]` com tier/força em "—". O conserto é
no `loadFromLocalStorage`, que **descarta o que não bate com o formato atual**;
o render assume só o formato validado. Defesa no render esconderia o lixo e o
manteria no save — o filtro no load some com ele, porque o dado se regenera.

O mesmo padrão vale para `this.copa` (apagado no load) e para `_worldTables`.


---

## 15 — MULTIPLAYER LAN e ONLINE (lobby, salas e rede)

```
server/
├── lobby.js        ← REGRA dentro da sala, sem rede. Testável com node.
├── salas.js        ← QUAIS salas existem (registro + pareamento + código). Também puro.
├── server.js       ← http estático + /health + WebSocket na mão (zero dependência)
├── test_lobby.js   ← 27 asserts: `node server/test_lobby.js`
└── test_salas.js   ← 33 asserts: `node server/test_salas.js`
js/systems/LobbyClient.js     ← transporte no browser, sem regra
js/scenes/MultiplayerScene.js ← 4 telas: modo -> lan | online -> sala
```

**Os quatro modos divergem só na PRIMEIRA mensagem** que o cliente manda no
`onopen`; daí em diante o protocolo é idêntico, inclusive a `GameScene` (que
não tem nenhum `if (isOnline)` — ela lê `data.lan` e pronto):

| modo | mensagem | quem inicia a partida |
|---|---|---|
| LAN | `entrar` (sala `PADRAO`) | capitão, no lobby |
| Online — fila 1v1 | `procurar` | o servidor, quando enche |
| Online — criar sala | `criar` → devolve código de 4 dígitos | capitão, no lobby |
| Online — entrar | `entrar_codigo` | capitão, no lobby |

`sala.pareamento` é o que separa fila de sala privada. Código inexistente
devolve `sala_nao_encontrada` em vez de criar sala vazia — quem digitou errado
precisa saber, senão espera para sempre num lugar onde ninguém chega.

**Todo broadcast é recortado por sala** (`S.colegas`). Sem isso duas partidas
online trocam posição de bola entre si, e o sintoma não parece de servidor.

**Como jogar:** o anfitrião roda `node server/server.js` e passa o IP que o
terminal imprime. Todos abrem `http://<ip>:8080`, entram em MULTIPLAYER → LAN.
Quem hospeda clica em CRIAR SALA (conecta no próprio servidor e vira dono da
sala); os outros usam ENTRAR POR IP.

**O navegador não sobe processo:** "Criar Sala" não inicia o Node. Ele conecta
no servidor que serviu a página — quem rodou o comando é o dono da sala.

**Regras (todas no servidor, `lobby.js`):**
- 4 posições de linha: FIXO, ALA_ESQ, ALA_DIR, PIVO. Escolhida = travada para o
  resto do time; o time adversário tem as suas.
- Goleiro dos DOIS lados é bot, sempre. `GK` não está em `POSICOES`.
- Máximo 4 de linha por equipe, mínimo 1 humano de cada lado para iniciar.
- Primeiro a entrar num time é capitão dele: escolhe uniforme e se as vagas
  viram bot ou ficam vazias. Quem criou a sala define as regras globais (tempo).
- INICIAR só destrava com TODOS prontos. Pronto exige lado e posição.

**Do lobby ao campo:** o servidor emite `{t:"partida"}` (escalações + uniformes
+ regras, com `voce` = id de quem recebe). A `MultiplayerScene` reusa o caminho
da partida de exibição e acrescenta o pacote `lan`; o mixin
`js/scenes/GameScene.lan.js` reetiqueta os bonecos já criados — arquétipo pela
posição escolhida, nome do humano, `lanId`, `isLocalPlayer`/`isRemotePlayer` —
e reposiciona pelo `TacticManager`. Cada cliente entra como mandante do próprio
lado, com o uniforme que o capitão escolheu.

**Rede na partida** (`js/scenes/GameScene.lansync.js`): autoridade no ANFITRIÃO.
O servidor só repassa `{t:"rede"}`. Cada cliente envia o próprio boneco a 20Hz;
o anfitrião envia bola (com dono), bots, goleiros e placar. No convidado, IA,
física de bots e bola não rodam — são cópia. Entidade é endereçada por
`lado_POSICAO` (`esq_ALA_ESQ`, `GK_dir`), nunca por índice de array.

No CONVIDADO estas três coisas são desligadas, porque disputavam a bola com a
rede: a cola "bola no pé" do portador, a decisão local de posse
(`ball.owner = closestPlayer`) e o `checkOutOfBounds()`. A bola dele é desenho:
`body.moves = false`. `dono` e `estado` do jogo viajam no pacote.

O CONVIDADO desenha a bola chamando `ball.updateVisual()` + `ball.updateRotation()`
(o sprite `Ball` é a SOMBRA; a bola é `ball.visualBall`). O chute dele viaja como
EVENTO `{chute:{id,tx,ty,f,o}}` — `kickBallFrom` é interceptado no mixin — e o
anfitrião só aceita de quem está com a bola na simulação dele.

**Juiz é o anfitrião:** gol (`handleGoal` interceptado), relógio (`updateTimer`
não roda no convidado), saída de bola e posse. O gol viaja como evento
`{gol:{lado,casa,fora,autor,marcouLado}}` e o convidado só comemora e obedece.
`casa/fora` é do ponto de vista de quem ENVIA — o pacote carrega `lado` e o
receptor inverte quando joga do outro lado.

**Suavização:** o convidado guarda `lanAlvo` e persegue por `lanInterpolar(delta)`
todo frame (fator 0.28 corrigido pelo delta); acima de 260px crava, para kickoff
não deslizar. **Fim de jogo** é ordem do anfitrião (`{fim:{...}}`); a
`EndGameScene` da LAN volta para a sala REUSANDO o socket.

**Lag e predição.** O convidado SEMPRE moveu o próprio boneco com input local
(`applyLanPacket` nunca aplica em `this.player`, e o `update()` dele roda) — não
há input lag no próprio corpo, e não há o que reconciliar. O que atrasava era
todo o resto: o alvo perseguido era a última posição RECEBIDA (50ms de tick +
viagem). `GameScene.lanPontoPrevisto()` projeta esse alvo com a velocidade que
já viaja no pacote, com teto de 150ms — dead reckoning, não simulação (sem
atrito, sem colisão). Passado o teto congela: pacote perdido não vira invenção.

**Ainda não feito:** posse e chute do convidado continuam custando um round-trip
(são decisão do anfitrião). Prever isso localmente é possível, mas é a
simulação paralela que já deixou a bola presa no meio de campo aqui.

**Convidado e replay:** ele toca o PRÓPRIO buffer no gol (`lanComemorarGol`),
com `applyLanPacket` ignorando posição durante o replay e `stopReplay`
desviando para `lanPararReplay` — que não chama `resetMatch`, porque quem repõe
a bola é o anfitrião.

---

## 16 — ESTADO ATUAL E PRÓXIMOS PASSOS

**Funciona:** carreira completa, exibição, treino, pênaltis, LAN, online (fila
1v1 e sala por código), efeitos configuráveis, deploy Netlify + Render.

**Pendências conhecidas:**
- **Saída de bola no convidado** — relatado, ainda não reproduzido. O
  `gameState` e as posições são sincronizados; falta o sintoma exato (bola
  some? jogadores não reposicionam? tela trava?).
- **Arte:** `shooting/north` só tem frames 000, 003 e 004. `BASE_KICK_MISSING`
  cobre o buraco com o frame 000 e evita o 404.
- **Check de paleta** vira aviso, não asserção — ele valida a arte de origem.
- **Áudio sem arquivo nenhum.** Ver seção 17. Zero `load.audio` continua
  valendo — o som é sintetizado, não carregado.
- **Sem locução, sem música.** Um narrador exigiria banco de voz (arquivo), que
  é justamente o que a síntese evita.
- **Sem impedimento — de propósito.** O jogo é 5v5 de quadra (fixo/ala/pivô) e
  futsal não tem impedimento. Não é pendência: é a regra do esporte.
- **Expulsão não vale em LAN.** O convidado endereça boneco por `lado_POSICAO`
  e não existe evento de expulsão no pacote: tirar um da lista só no anfitrião
  deixaria um fantasma parado no campo do outro. Em LAN o 2º amarelo sai como
  cartão e o jogador CONTINUA em campo (`cartaoPor` para em `if (!this.lan)`).
- **Cartão não sobrevive à partida.** `faltas`/`amarelos` moram na entidade;
  suspensão para o jogo seguinte não existe.

### Falta, cartão, pênalti e tática (resolvidos)

**Falta** — `FOUL` em `constants.js` (raio de contato + chance + `CARD_EVERY`) e
`GameScene.chamarFalta()`. O gatilho é o ramo de bote ERRADO no `update()`: se
o bote não pegou a bola e o infrator está dentro de `ballHitRange +
FOUL.CONTACT_BAND` do adversário, o árbitro apita. Bote limpo nunca chega lá.
A faixa é relativa ao ALCANCE de quem entrou, não um raio fixo: com 52 cravado o
carrinho (alcance 62) pegava a bola antes de qualquer contato e nunca cometia
falta. Cartão sai por CARRINHO (na hora) ou por reincidência — falta comum
sozinha não dá cartão, senão a partida vira chuva de amarelo.
O carrinho em si (`Player.iniciarBote`, SHIFT+ESPAÇO) é o bote com outros
números e `isSliding` ligado; bot não dá carrinho. `GameStates.FREE_KICK` é bola
parada como qualquer outra e reusa `setupSetPiece` — o ponto viaja em
`_faltaPonto` porque o reposicionamento só acontece 400ms depois, no fim do
fade, quando a bola já teria andado colada no pé da vítima. Falta é regra que
mexe a bola: **autoridade do anfitrião**, como gol e saída de bola.

`ehBolaParada(state)` (constants.js) responde "é bola parada?" num lugar só —
`Player`, `Enemy` e `AIBrain` tinham a mesma tripla copiada, e um estado novo
só valeria em quem lembrasse de editar os três.

**Pênalti** — falta do DEFENSOR dentro da própria área vira `GameStates.PENALTY`
e a bola vai para a marca que o `drawPitch` já pinta (`marcaPenalti`). Quem
defende qual lado troca no intervalo: a conta é a mesma do `checkOutOfBounds`
(`infrator.isPlayerTeam ? isSecondHalf : !isSecondHalf`). `dentroDaArea()` usa o
MESMO retângulo desenhado no campo — `GK_AREA_WIDTH` é o vão em Y,
`GK_AREA_HEIGHT` é a profundidade em X, e trocar os dois erra calado. Fora da
área o tiro livre continua recuado até a linha da área. O batedor da IA mira o
gol daquele lado, não o meio de campo.

**Cartão** — `cartaoPor()`: a cada `FOUL.CARD_EVERY` faltas do MESMO jogador sai
um amarelo, e o segundo amarelo é vermelho. Sem sorteio, de propósito — cartão
que não dá para antecipar não muda como se joga. `expulsar()` tira o boneco das
listas (`allPlayers`/`allies`/`enemies`/`playerTeam`), desliga corpo e sprite e
**não destrói**: `lastTouch`, quadro do replay e o colisor criado no `create()`
ainda apontam para ele, e método em sprite destruído derruba o frame. Expulso o
boneco controlado, o controle passa direto para quem sobrou — sem
`switchPlayer`, que recusa troca em posse de bola e fora do modo `full`.

**Cartão na tela** — uma tira amarela em pé por cartão, acima do nome
(`desenharCartoes`, medidas e cor em `CARD_HUD`), movida pelo mesmo loop que já
move os rótulos de nome. No placar, uma tira vermelha por expulso do lado do
time que ficou com menos gente (`this.expulsos` + `.hud-red` no ui.css). Como o
segundo amarelo já expulsa, na prática cada jogador exibe no máximo UMA tira
amarela — a fileira é genérica porque a regra do cartão pode mudar sozinha em
`FOUL.CARD_EVERY`. Ao expulsar, tiras e rótulo de nome são destruídos: o loop
que os move ignora entidade inativa e eles ficariam parados no campo.

**Selo de versão** — `GAME_VERSION` (constants.js) escrito pelo `main.js` no
`#app-version`, que vive no `index.html` e portanto aparece em TODA cena,
inclusive no menu. É o detector de cache: canto com número velho = JS velho.

**Tática persistida** — `careerMode.tactic` entra no save, é sanitizada no load
(tática que não existe mais cai no 3-1) e o `GameScene.create()` a lê. O menu de
pausa grava de volta na hora da troca. Exibição e LAN não têm carreira: nascem
no 3-1 e a troca vale só para aquela partida.

**Tática** — `FORMATION.SHAPES` tem uma forma por tática (3-1 losango, 2-2
quadrado, 4-0 linha de quatro) e `TacticManager.shapeOf(bot, papel)` é quem
lê `bot.tactic`; tática ausente ou desconhecida cai no 3-1. `GameScene`
publica `playerTactic`/`enemyTactic` e é de lá que sai o `tactic` de todo
boneco. A troca fica no **menu de pausa** (botão TÁTICA, cicla as três) e vale
para quem está em campo naquele momento — a substituição troca gente do time.

---

## 17 — ÁUDIO: síntese em runtime, zero arquivo

`js/systems/Som.js` é o dono único: gera, toca, persiste a escolha e desenha os
interruptores das DUAS telas de configuração (mesmo papel do `EfeitosVisuais`,
mesmo formato de save sanitizado no load).

**Nenhum asset de áudio entra no projeto.** Cada som é montado com oscilador e
ruído no WebAudio, na hora. Não é preciosismo: é o que mantém a regra do
projeto (sem bundler, sem dependência, deploy estático) e o repositório leve.

**A arquitetura que importa: som é FUNÇÃO PURA de `(ctx, destino, t0, opções)`.**
A receita não sabe se está tocando na placa de som ou sendo renderizada num
`OfflineAudioContext` — e é por isso que o check do boot mede exatamente o que o
jogador ouve, em vez de medir uma maquete. Receita que leia `Som.ctx` por dentro
sai do alcance do check.

**O contexto nasce no PRIMEIRO GESTO.** Regra do navegador, não escolha nossa:
criar no boot é o que gerava "The AudioContext was not allowed to start". Os
listeners ficam no fim do `main.js`, FORA do `READY` (o gesto pode chegar antes
do jogo montar) e cobrem `pointerdown`/`mousedown`/`touchstart`/`keydown` —
nem toda origem de clique emite `pointerdown`. Antes disso, `Som.tocar()` é
silencioso e barato: quem chama nunca pergunta se já destravou.

**O Phaser continua com `audio: { noAudio: true }`.** Não há `load.audio` para
ele gerenciar; ligar `false` só criaria um segundo contexto, vazio.

### Receitas (`Som.RECEITAS`)
`chute` (peso pela força do chute), `passe`, `trave` (dois parciais desafinados,
metal), `rede`, `defesa` (luva), `raspagem` (bote e carrinho, o carrinho mais
longo e sujo), `apito` (`toques`: 1 falta, 2 intervalo, 3 fim — a "ervilha" é um
LFO de 28Hz sobre o ganho) e `cartao` (dois bipes; o vermelho desce em vez de
subir).

Disparadas dos pontos que já existiam, sem sistema novo: `kickBallFrom` (ponto
único de todo chute e passe, como o `kickAnimUntil`), o colisor da trave em
`createPost`, `Goalkeeper.catchBall`, `Player.iniciarBote`, `chamarFalta`,
`cartaoPor`, `handleGoal` e `updateTimer`.

### Torcida
Uma fonte de ruído em loop com passa-baixa: subir o nível abre o filtro E o
ganho, que é o que faz o estádio "acordar" em vez de só ficar mais alto.
`atualizarTorcida()` roda no relógio (1x por segundo — torcida reage a lance,
não a frame) e o nível sai da distância da bola ao gol mais o aperto do fim de
jogo. Gol chama `explodirTorcida(favoravel)`: sobe seco e volta devagar; gol
sofrido faz menos barulho, e é isso que diferencia o estádio de um lado do outro.

Duas armadilhas, ambas do fato de ser um LOOP e não um disparo:
- **Ninguém a recolhe.** Sem `pararTorcida()` no `registerDOMTeardown` ela toca
  por cima do menu depois do apito final — mesmo caso do placar em DOM.
- **`_emPartida`** separa "estou num jogo" de "estou no menu". Sem essa marca,
  religar o interruptor na tela de configuração do MENU acendia o estádio ali.

### Medido
Régua renderizada offline, picos já no volume mestre: apito 0.44, chute 0.35,
trave 0.31, rede 0.22, passe 0.16, cartão 0.15, defesa 0.14, raspagem 0.12.
Nenhuma muda, nenhuma passa de 1.0 (o teto do digital).

---

## 18 — CARREIRA LONGA: mundo que envelhece, contrato, seleção e história

### O mundo envelhece — `js/systems/Elenco.js`
`REAL_ROSTERS` virou ponto de PARTIDA, não a verdade do jogo. Sem isto os
mesmos 504 jogadores ficavam com o mesmo rating para sempre: a temporada 5 era
idêntica à 1 e o único que evoluía era o usuário.

**A porta é uma só: `getTeamRoster()`** (RealRosters.js) pergunta ao `Elenco`
antes de cair no banco. GameScene, CareerMode, mercado e `MatchSimulator`
continuam chamando o que já chamavam e passam a ver o mundo vivo — `starterRating`
foi o único que lia `REAL_ROSTERS` cru e por isso deixava a força dos clubes
congelada.

- **Idade é derivada do `id`** (FNV-1a, a mesma técnica da aparência) e
  enviesada pelo rating: quem tem 84+ nasce entre 25 e 32, porque craque de 88
  com 19 anos não existe. Da primeira virada em diante ela é ESTADO e vai para
  o save — deixa de ser derivação.
- **Curva por faixa etária** (`Elenco.CURVA`): garoto explode, veterano cai, o
  meio oscila. Artilheiro do ano (≥ 8 gols nas estatísticas globais) ganha
  `BONUS_ARTILHEIRO` — é o único acoplamento entre o que foi jogado e o que o
  mundo vira.
- **Aposentadoria** aos 39 sempre, e antes disso com chance que cresce a partir
  dos 34 (rating alto segura mais um ano). Quem sai é substituído por um garoto
  da base NA MESMA POSIÇÃO: o elenco não encolhe e o clube não perde o goleiro.
- **Nome da cria** sai da recombinação dos nomes que já existem no banco. Um
  dicionário de nomes por país seria dado novo para manter, e o resultado soa
  igual.
- **`_reequilibrar()` segura a deriva.** Medido sem ele: a média do mundo caía
  de 79.9 para 73.8 em dez temporadas — a curva é líquida negativa numa
  população madura e o garoto entra abaixo da média, então o usuário subia e a
  liga inteira derretia. Com ele: 79.8 → 78.8, e o Flamengo segue 82.6 → 82.8.
  Um ponto por temporada, no máximo, mirando a média ORIGINAL do clube: corrige
  o mundo sem apagar o envelhecimento de ninguém.

O mundo vivo vai inteiro para o save (`_elencoMundo`, ~50KB de um save de 85KB):
a `worldSeed` regenera calendário e chaveamento, mas não regenera idade e
rating já envelhecidos.

### Contrato — o relógio que faltava no mercado
`contractYears` desce uma vez por ano em `_virarContrato()`. No penúltimo ano
vira aviso; no fim do vínculo o mercado abre sozinho. É isso que transforma
"recebo proposta aleatória" em decisão. A duração viaja PLANA na proposta
(`contractYears` em `_buildOffer`, clube tier 4+ amarra por mais tempo) e
assinar zera o relógio — inclusive na renovação, que é o que o jogador está
comprando ao aceitar.

### Seleção nacional — convocação simulada
`_janelaDeSelecao()` no fim da temporada: nota (`overall()`) acima de
`CAREER_BASE.NATIONAL_CALL_RATING` convoca, e a janela rende jogos, gols
proporcionais ao ritmo no clube, e reputação.

**As partidas são SIMULADAS, e isso é escolha, não preguiça:** um terceiro tipo
de compromisso no calendário obrigaria a mexer no literal `type`
("brasileirao"/"copa"), que as cenas comparam — risco alto para retorno pequeno.
Quando houver apetite, o caminho é um `type` novo varrendo `PreGameScene`,
`EndGameScene` e `CareerMode`.

### Prêmios e história
`_premiosDaTemporada()` sai dos números que o mundo JÁ grava (`topScorers`,
`leagueTable`) — nada de placar paralelo. Artilheiro exige gol no ano (liderar
com 0 é tabela vazia, não artilharia), Craque exige título + top 3, Revelação é
uma vez na vida e só até os 21.

`history` guarda uma linha por temporada (clube, posição, jogos, gols,
assistências, nota, títulos DAQUELE ano e a janela de seleção) e aparece no
`PlayerProfileScene`, na coluna que já rolava — sem modal novo e sem handler
novo. O que faltava àquela tela era memória, não navegação.

**Ordem importa em `startNewSeason()`:** `_fecharTemporada()` é a PRIMEIRA
linha, porque prêmios, história, seleção e contrato leem as estatísticas da
temporada — e as linhas seguintes zeram exatamente esses números.
`_envelhecerMundo()` vem depois de `this.world = null` e antes de recriar tabela
e estatísticas, que leem rating de elenco.

---

## 19 — UX: avisos que não interrompem

**O problema medido:** cada notificação de carreira era um MODAL de tela cheia
com botão OK, mostrado um de cada vez e encadeado no fechamento do anterior.
Avançar um dia com três avisos custava três cliques e três esperas, com a tela
inutilizável no meio — e o terceiro aviso ninguém lia.

**Agora:** `UIHelper.toast(scene, msg, tipo)` e `UIHelper.toastFila(scene, itens)`.
Pilha no canto inferior direito, não bloqueante (o jogo segue clicável por
baixo), cada card sai sozinho e o clique só ACELERA a saída. O tempo é
proporcional ao texto (2,5s a 7s): aviso curto não ocupa a tela, aviso longo dá
tempo de ser lido. Teto de 4 cards — acima disso vira parede de texto e não se
lê nenhum, então o mais velho sai primeiro. A cor da borda esquerda é o tipo
(salário, troféu, transferência, notícia, erro), para reconhecer sem ler.

`PreGameScene._showPendingNotifications()` drena a fila INTEIRA de uma vez, com
260ms entre um card e outro — nascendo no mesmo frame viram um bloco só.

Três armadilhas da camada DOM, todas com o mesmo sintoma enganoso:
- **`pointer-events: none` precisa de `!important`.** `main.css` tem
  `#game-container > div * { pointer-events: auto }`, especificidade 1-0-1
  contra 0-1-0 da classe. Sem isso a camada — invisível e do tamanho do canvas —
  engolia todo clique enquanto houvesse aviso na tela, e parecia que o jogo
  travava até o toast sumir. Só o CARD volta a `auto`, que é o que o dispensa.
- **O Phaser escreve `display` inline** no elemento do `add.dom`, e inline ganha
  da folha de estilo: o `display:flex` da camada virava `block` e todo aviso
  ancorava no canto superior esquerdo. O layout foi para um FILHO
  (`.pui-toast-stack`), que o Phaser não toca.
- **`setDepth` não ordena camada DOM.** `main.css` crava `z-index: 1000
  !important` em todas, então quem decide é a ordem no DOM — a pilha é reanexada
  ao fim a cada aviso, senão nasce ATRÁS do painel opaco (a fila é despejada
  antes de a UI da cena ser montada).

**Outras melhorias da mesma leva:**
- **ESC e clique fora fecham o modal**, nos nove modais do jogo de uma vez: o
  conserto é no `createDOMModal`, não em cada tela.
- **Botão tem estado de clique** (`:active` afunda o botão e encolhe a sombra).
  O hover já existia; o pressionado não, e no toque o botão parecia travado.
- **`createDOMNotification` foi APAGADO** junto com o último chamador, e o toast
  ad-hoc que a `PreGameScene` montava no `document.body` também: um lugar só
  para avisar o jogador.

---

## 20 — DISCIPLINA, LESÃO E SELEÇÃO JOGÁVEL

### O que acontece em campo cobra fora dele
Até aqui o cartão morria no apito final e dava para jogar todo jogo com o fôlego
no chão. Agora a partida devolve uma SÚMULA e ela pesa na temporada.

A súmula viaja dentro de `matchStats` de propósito: esse objeto já é repassado
inteiro por `PenaltyShootoutScene` e `EndGameScene`, e um campo novo solto no
`data` seria mais um a esquecer de repassar (já aconteceu neste projeto).
`GameScene.endGame()` preenche `cartoesAmarelos`, `cartaoVermelho` e
`faltasSofridas` — "usuário" é o boneco no comando na hora, que é o que ele fez
com a bola no pé dele.

- **Suspensão:** `DISCIPLINE.YELLOWS_PER_BAN` (3) amarelos custam um jogo, e o
  contador ZERA ao gerar a suspensão — senão o 4º amarelo suspenderia de novo e
  o 5º outra vez. Vermelho custa `RED_BAN_MATCHES` (2) na hora.
- **Lesão:** risco = pancada tomada + desgaste (`INJURY_PER_FOUL` por falta
  sofrida, carrinho conta dobrado, mais o quanto o fôlego caiu abaixo de
  `FIT_SAFE`), com teto de 35%. Medido: partida tranquila 0%, normal 6%, pesada
  25%, brutal 31%, com ~10 dias de recuperação.
- **A porta é `getLineupStatus()`.** Suspenso e lesionado devolvem
  `not_related` ANTES de qualquer conta de forma — a função que já decidia se o
  jogador entra passou a ter dois motivos a mais, em vez de uma checagem nova
  espalhada pelas telas.
- **A suspensão é cumprida pela partida PERDIDA**, em `_pesarPartidaNoCorpo()`,
  que roda no registro de TODA partida do usuário — inclusive a que ele não
  jogou. Quem não entrou não leva cartão nem se machuca.
- Lesionado **descansa mas não treina** (mesmo critério do fôlego no chão), e a
  recuperação anda no relógio, dentro do `advanceDay()`.

### Seleção nacional jogável
`type: "selecao"` é o TERCEIRO literal estrutural do schedule (havia
"brasileirao" e "copa") e as cenas o comparam: mexer nele exige varrer
`PreGameScene` e `EndGameScene` junto — foi o que esta entrega fez.

- **`NATIONAL_TEAMS`** (LeaguesDB.js): uma seleção por país com liga jogável. A
  chave (`selecao_brasil`) é a mesma no `TEAMS_DB` (uniforme) e no elenco vivo.
  **Sem entrada no TEAMS_DB os dois times entram de vermelho**, calados, pelo
  fallback do `buildKitAtlas`.
- **A seleção convoca por NACIONALIDADE, não por liga.** `Elenco.selecao(id)`
  varre o mundo inteiro e filtra pelo país do JOGADOR: o Arrascaeta joga no
  Flamengo e é uruguaio, o Haaland joga na Inglaterra e é norueguês. Ler a liga
  do país convocava o estrangeiro que joga lá e deixava de fora o brasileiro
  que joga na Europa — que é exatamente quem uma seleção chama. Pega o melhor
  goleiro e os 6 melhores de linha. Assim a
  seleção envelhece junto com o mundo, e quem subiu da base entra sozinho no
  ano seguinte. A convocação é cache: `virarTemporada` a descarta
  (`limparSelecoes`) e ela NÃO envelhece — é cópia de gente que já envelhece no
  clube, e envelhecer as duas somaria dois anos por temporada ao convocado.
  Por ser derivada, também não vai para o save.
- **De onde sai a nacionalidade** (`getPlayerNationality`, LeaguesDB.js): o
  campo explícito no jogador vence; depois a curadoria `PLAYER_NATIONALITY`
  (RealRosters.js, ~209 jogadores de rating 81+, que é a faixa que uma
  convocação alcança); e só então a derivação por hash do id, enviesada pelo
  país do clube (`NATIVE_SHARE` 70%). Ausência da curadoria NÃO é afirmação de
  que o jogador seja do país onde joga — é palpite estável, não dado.
- **`nationality` do USUÁRIO é congelada na primeira vez** e salva: derivar do
  clube toda vez faria o jogador trocar de seleção junto com a transferência.
- **`_fonteDeClubes()` separa "mundo existe" de "mundo tem clube".** A
  convocação fica em cache DENTRO de `Elenco.mundo`, então a primeira seleção
  montada criava o objeto e a segunda lia um mundo só de seleções — e voltava
  vazia. A primeira convocação do jogo funcionava; a segunda, não.
- **`_agendarSelecao()`** insere `CAREER_BASE.NATIONAL_WINDOWS` (4) datas FIFA
  em dias livres, sempre com folga dos dois lados — a seleção não empurra jogo
  de clube, que é o calendário de verdade do mundo. Medido: 4 datas, zero
  colisão.
- **A régua é `lastFixtureDay()`, não um número.** Com 320 chutado, a última
  data caía DEPOIS do fim da temporada (~214 dias): um compromisso que nunca
  chega deixava `hasRemainingMatches()` eternamente true, escondia o botão de
  simular o resto do ano e fazia a tela anunciar "próximo jogo" de um jogo
  inexistente. Data que ainda escorregue para fora do ano é descartada.
- **Data FIFA não jogada é marcada quando o dia passa** (`_simulateWorldDay`):
  ela não existe no calendário do MUNDO, então ninguém mais a resolveria. E
  faltar a ela NÃO cobra multa nem reputação — isso é do clube.
- No jogo, `homeTeam` aponta para a seleção: é o que troca elenco E uniforme no
  `GameScene` (fora da exibição ele vinha só do `careerMode`).
- **`recordSelecaoMatch()`** não toca tabela nem artilharia da liga: conta
  caps, gols e desgaste. E `_janelaDeSelecao()` (fim de ano) passou a somar
  apenas os amistosos NÃO jogados — sem esse desconto os caps contariam duas
  vezes.
- `clubLabel()` e `clubAcronym()` aprenderam as seleções, senão a tela mostraria
  "selecao_brasil" e o placar "SEL" nos dois lados.

---

## 21 — DIFICULDADE, COPA DO MUNDO E SLOTS DE SAVE

### Dificuldade (`js/systems/Dificuldade.js`)
Três perfis, e a regra é **fator, nunca `if`**: quem consome pergunta
`Dificuldade.fator(chave)` e multiplica um número que já existia. Perfil novo é
uma linha na tabela, não uma varredura pelo jogo.

| fator | onde entra | efeito |
|---|---|---|
| `adversario` | rating do rival, antes do clamp, no `create` | tudo que a entidade deriva acompanha de uma vez |
| `decisao` | `AIBrain.shouldThink` | intervalo entre decisões — MENOR é mais esperto |
| `goleiro` | `checkCollisions` | alcance do goleiro |

`decisao` e `goleiro` valem **só para o lado adversário**: no fácil, deixar o
time do usuário mais burro seria punir quem escolheu o fácil.

Medido numa partida real: rival com atributo 61.6 no fácil contra 75.6 no
difícil (base 0.952 → 1.048, sprint 1.957 → 2.214), com o aliado intocado.

De quebra, dois números cravados no `checkCollisions` (48/90 de alcance e 45 de
distância) voltaram a sair de `GOALKEEPER` — as constantes existiam ali sem
ninguém ler, que é o clássico deste projeto.

### Copa do Mundo
A cada `MUNDIAL.A_CADA` (4) temporadas, as datas FIFA deixam de ser amistoso e
viram mata-mata entre as seleções.

**O chaveamento mora no `CareerMode`, e isso é deliberado.** O invariante que
proíbe bracket local vale para copa de CLUBE — aquilo é `world.season`, onde as
seleções não existem, não têm tabela e não recebem vaga continental. Domínio
diferente, dono diferente.

- Semeadas por força de elenco, completadas com BYE até a potência de 2 — **um
  BYE por confronto**, nunca empilhados (empilhado, meia chave nasce vazia e
  alguém chega à final sem jogar).
- O adversário de cada fase só existe quando a anterior fecha: a entrada do
  schedule nasce com `opponentId: null` e `getSelecaoOpponent()` resolve no dia,
  pela chave.
- `recordSelecaoMatch` anda a chave: grava o jogo do usuário, simula os outros
  com o `MatchSimulator` e monta a fase seguinte. Eliminado, as datas restantes
  são marcadas como jogadas — senão o jogo pediria uma semifinal sem ele.
- `MatchSimulator` carrega DEPOIS do `CareerMode`: a simulação dos outros
  confrontos tem fallback para o instante do boot, senão o check do arquivo
  quebra num `ReferenceError`.

Medido: 6 seleções → 4 confrontos com 2 BYEs distribuídos, Quartas → Semifinal
→ Final, campeão com troféu e prêmio; perdendo, o usuário sai e a chave segue.

### Slots de save
Havia UMA chave no `localStorage`: começar carreira nova apagava a anterior sem
aviso e sem volta. Agora são três (`CareerMode.SLOTS`), e o **slot 1 continua na
chave antiga** — quem já tinha carreira não perde nada ao atualizar.

`chaveDoSlot()`, `resumoDosSlots()`, `usarSlot()` e `apagarSlot()` são estáticos
e o slot ativo vive no `localStorage`, para sobreviver ao recarregar. No menu,
CONTINUAR e NOVA CARREIRA abrem a mesma lista; sobrescrever um slot ocupado
pede um segundo clique no próprio botão, que passa a dizer o nome que vai
apagar.

---

## 22 — SIMULAR A TEMPORADA É JOGÁ-LA

Até aqui, "simular até o fim da temporada" tratava cada partida do usuário como
uma FALTA: multa, -20 de reputação e zero gol, zero assistência, zero XP. O ano
inteiro passava e o jogador não existia nele.

Agora o usuário entra em campo. `_resolverPartidaDoUsuario(entrada)`:

1. o placar sai do MESMO `simulateMatch` dos jogos de fundo;
2. a participação dele é sorteada **sobre esse placar** — para cada gol do time,
   ele marcou, assistiu, ou foi coisa de companheiro. É o que amarra o número à
   partida: com 1x0 não há como ele marcar três, defeito de qualquer fórmula que
   sorteie gols do nada;
3. o resultado entra pelo **mesmo caminho de uma partida jogada**
   (`recordMatch`/`recordCopaMatch`) — então stats, artilharia, XP, nível,
   condição, reputação, cartão e lesão saem de graça, sem nada reimplementado.

A fatia por posição é a única coisa que a posição decide (atacante 0.45, meia
0.28, fixo 0.12), corrigida pela nota do jogador; reserva entra no 2º tempo e
tem metade das chances. O sorteio usa o PRNG do mundo — a mesma `worldSeed`
reproduz a mesma temporada, artilharia inclusive.

**Três defeitos que só apareceram ao medir:**
- **Lesão não curava.** `injuryDays` só andava no `advanceDay`, e o
  `simulateUntil` tem laço próprio: quem se machucava no meio do ano ficava
  `not_related` até dezembro. Um atacante 85 terminava com 0 gol e reputação 0.
- **Sem descanso.** O jogador automático não clica em "descansar": com os mesmos
  +3 por dia ele terminava exausto e reserva. Dia livre em temporada simulada
  agora recupera `CAREER_BASE.SIM_REST_PER_DAY`.
- **Nota fixa em 6.0** punia todo mundo: metade das partidas caía abaixo de 6 e
  a reputação ia a zero. A base agora acompanha a qualidade do jogador.

Medido depois dos três (uma temporada cheia, ~35 jogos):

| jogador | gols | assistências | artilharia |
|---|---|---|---|
| ATACANTE 85 | 21 | 3 | 1º |
| MEIA 78 | 15 | 10 | 2º |
| ATACANTE 72 | 9 | 4 | 29º |
| FIXO 70 | 5 | 8 | 67º |

**Fica de fora, de propósito:** a multa por falta continua valendo para quem
PULA o dia no `advanceDay` tendo jogo — ali ele escolheu não jogar. Simular a
temporada é outra coisa.

---

## 23 — PROGRESSÃO: começar fraco, subir devagar

Três mudanças que só fazem sentido juntas.

**O jogador começa em ~56 de overall**, não em ~70. `CAREER_BASE.START_*` e as
bases por posição da `CharacterCreationScene` desceram na mesma proporção — a
forma de cada posição continua (o atacante chuta, o lateral corre), o que mudou
é o ponto de partida. Antes ele nascia a cinco pontos da convocação para a
Seleção e a carreira não tinha para onde subir.

> `resetDefaults` cravava `68/68/72` enquanto `CAREER_BASE.START_*` existia ao
> lado sem ninguém ler. Mesmo clássico da casa — a constante era decoração.

**Nível custa mais a cada nível:** `XP_BASE + (nível − 1) × XP_POR_NIVEL`
(100 e 45). Era 100 fixo, e uma temporada rendia ~29 níveis — mais pontos de
skill do que a árvore inteira. Agora uma temporada bem jogada rende ~10-15.
A porta é `xpParaSubir()`: as quatro barras de XP do jogo liam `/100` cravado e
continuariam mentindo.

**Skills em mais degraus, cada um menor:** `SKILL_ATTR` (constants.js) define
ganho e teto num lugar só — 12 níveis de +1/+1/+2 no lugar de 5 de +2/+2/+5.
O total continua parecido; o que muda é que a subida tem passos. O número
aparecia no texto do card E no clique que aplica: mudar um sem o outro fazia a
tela prometer uma coisa e entregar outra.

**Avançar o dia com jogo agora simula a partida COM o jogador** (`advanceDay`),
igual à simulação da temporada. Antes o dia passava, o mundo resolvia o jogo e
ele não pontuava — como se não estivesse no elenco.

Medido, temporada inteira pelo calendário, atacante começando em 59 de overall:

| rotina | gols | assist. | condição | reputação | nível |
|---|---|---|---|---|---|
| só avança o dia | 1 | 1 | 23 | 0 | 9 |
| descansa/treina nos dias livres | 18 | 12 | 64 | 100 | 15 |

Gerenciar a rotina passou a ser a diferença entre ser titular e apodrecer no
banco — e isso agora vale igual na partida jogada e na simulada.


---

## 24 — PERFIL DO ATLETA: o card que estourava e a coluna entulhada

Dois problemas, um de layout e um de arrumação.

**O botão MELHORAR saía do card.** Ele vinha com `width: 90px` cravado no HTML,
dentro de um `flex` — na coluna estreita do perfil o texto empurrava e o botão
escapava pela direita, por cima do painel vizinho. Agora `.pui-skill-card` é
GRID (`1fr auto`): o texto encolhe (`min-width: 0`) e o botão fica no lugar. O
tamanho do botão mora no CSS, não no HTML da cena.

As estrelas de nível também estouravam: com a árvore em 12 degraus elas não
cabiam numa linha. Ganharam `flex-wrap` e ficaram menores.

**A coluna de CONQUISTAS virou ABAS** — TÍTULOS / PRÊMIOS / HISTÓRICO. Antes
seleção, prêmios, títulos e a tabela de histórico empilhavam num scroll só, e
quanto mais longa a carreira, pior. Os três blocos são renderizados juntos e a
aba só troca `display`: nenhuma reconstrução de tela, nenhum handler novo além
de um `if` no clique que já existia.

Aba vazia tem texto próprio ("Nenhum prêmio individual ainda") em vez de um
espaço em branco.

**Detalhe que se revelou na captura:** a barra de XP escrevia o valor duas vezes
("XP: 2395/6985" no rótulo e "2395/6985" à direita), porque o `createDOMBar` já
imprime valor/máximo. O rótulo agora é só "XP — PRÓXIMO NÍVEL".

Medido: os quatro botões 20px DENTRO do card (antes estouravam), nenhum
elemento vazando da raiz, zero rolagem horizontal.

## 25 — GAME FEEL: o jogo responde ao que o jogador QUIS

Jogabilidade boa e timing amador são coisas diferentes. O que separava as duas
aqui não era física nem IA — era o jogo exigir do jogador precisão de FRAME e
depois cobrar dele a espera.

**Buffer de input (`GAME_FEEL.INPUT_BUFFER_MS`, 220ms).** Passe e chute
apertados com a bola ainda chegando eram descartados em silêncio: só valia o
comando dado no frame exato em que a bola encostava no pé. Jogada de primeira
era, na prática, sorte. Agora o pedido fica guardado em `this.queuedPass` com
carimbo de tempo (`em`) e sai no instante do domínio, se ainda estiver dentro da
janela. Passado o prazo ele MORRE — buffer sem validade vira boneco com vida
própria, executando dez segundos depois um comando que ninguém mais quer.

O buffer tem duas entradas, e as duas guardam a MESMA estrutura:
`{pointer: {worldX, worldY}, passType | chute + forca, em}`. O ponteiro é
COPIADO, não referenciado: o objeto do Phaser é reaproveitado entre eventos e
guardá-lo cru significa executar o passe na posição do mouse de agora, não na
de quando o jogador apertou.

**Peso no gol.** O replay mostra o gol de novo, mas não MARCA o momento. Agora o
autor congela por `GOAL_HITSTOP_MS` e a tela treme por `GOAL_SHAKE_MS`. O
congelamento é escrito direto no `hitStopTimer` do boneco, e não pela porta
`applyHitStop()`: aquela porta guarda a velocidade da BOLA e a devolve 110ms
depois — e nesse meio tempo o gol já repôs a bola no meio de campo, então a
devolução faria a bola parada disparar sozinha.

**A espera encurtou.** Fade da bola parada, atraso da cobrança da IA e a saída
para o pós-jogo eram literais espalhados; viraram
`SETPIECE_FADE_OUT_MS` / `SETPIECE_FADE_IN_MS` / `SETPIECE_AI_DELAY_MS` /
`ENDGAME_DELAY_MS`. Todo número de RITMO da partida mora em `GAME_FEEL`, num
bloco só, porque ajuste de timing se faz jogando: quem sente o jogo mexe em oito
constantes vizinhas, não caça `delayedCall(1500)` em três arquivos.

Check no fim do `GameScene.js`: a janela do buffer existe, é curta (80–400ms),
aceita o pedido na borda e recusa 1ms depois — e as esperas de bola parada não
podem encolher a ponto de o jogador não ver o que aconteceu.

## 26 — PERSPECTIVA: o campo inclinado sob bonecos de pé

Os sprites sempre foram "high top-down" — vistos bem de cima, mas ainda de pé.
O campo era top-down puro, e a mistura dava a impressão errada: chão de mapa
com gente em pé em cima dele.

A inclinação é **ortográfica**: câmera baixada, sem ponto de fuga. Isso é uma
multiplicação só — o CHÃO encolhe na vertical por `cos(θ)`, e quem faz é o zoom
assimétrico da câmera (`setZoom(z, z*k)`, `k = PERSPECTIVA.ACHATAMENTO_Y`,
hoje 0.8 ≈ 37°). Nenhuma coordenada de jogo muda: a física continua num campo
plano de 1600x1000 e a mira do mouse continua certa, porque `getWorldPoint`
inverte a matriz da câmera com o `zoomY` dentro.

Trapézio (perto maior que longe) seria ponto de fuga de verdade, e aí a posição
de tela deixaria de ser função linear da posição de mundo: clique, hitbox e
sombra teriam de ser remapeados um a um. Ortográfico dá o mesmo recado de graça.

O preço é o resto. A câmera achata TUDO, inclusive o que deveria continuar de
pé, e é isso que o `Perspectiva` organiza em quatro portas:

- **`zoom(cam, z)`** — a assimetria. Existe em um lugar só: com `setZoom` cru
  nos quatro pontos que mexem em zoom (câmera dinâmica, entrada e saída do
  replay, LAN), a inclinação sumia na primeira volta do replay.
- **`nivel(cam)`** — o zoom vivo. `cam.zoom` do Phaser 4 devolve a MÉDIA de
  zoomX e zoomY, e o zoom dinâmico realimenta o próprio valor todo frame:
  realimentar a média afunda a câmera sozinha. Medido antes do conserto: 1.0
  virou **0.169** em segundos, o jogador saiu da tela e o minimapa continuou
  perfeito — parece bug de render, é aritmética.
- **`dePe`/`reta`** — quem escapa do achatamento (boneco, bola no ar, nome,
  cartão, texto): desenhado 1/k mais alto para a câmera devolver ao tamanho.
- **`corpo`** — o hitbox de quem foi esticado. O corpo Arcade NÃO é
  independente da escala (`height = sourceHeight * scaleY`,
  `position.y = y + scaleY * (offset.y - displayOriginY)`): esticar o desenho,
  sozinho, esticaria o corpo junto e o boneco roubaria bola 25% mais longe sem
  nada no console. A fonte encolhe por k e o offset encolhe **em torno da
  origem** — não é `offset * k`, a origem não está no zero.

**O que está pregado na tela precisa de mais que escala.** A câmera achata em
torno do CENTRO dela, então HUD fixo não só espreme: DESCE. O aviso a 80px do
topo aparecia a 124px e o menu de pausa começava 60px abaixo e vazava por
baixo — parece desalinho de CSS. `Perspectiva.tela()` desfaz a conta da câmera
(`tela = c + (y - c) * k`) e devolve objeto ao pixel e à altura de origem;
vale para texto, `Graphics` do minimapa, container do replay e a camada DOM,
que também anda na matriz da câmera. Em container, compensa-se o CONTAINER, uma
vez só — compensar os filhos junto dobra a conta.

Sombra da bola, círculo de stamina e as linhas do gramado ficam achatados de
propósito: eles estão no chão, é o que a inclinação tem de fazer com eles.

Check no `Perspectiva.js`: o corpo compensado ocupa o mesmo retângulo de mundo
que ocupava sem inclinação; o objeto de tela volta ao mesmo pixel e à mesma
altura; e 600 frames do laço do zoom dinâmico convergem para o alvo em vez de
afundar (esse é o que pega a regressão do `cam.zoom`).

## 27 — FEEDBACK: o efeito é PROPORCIONAL, ou não diz nada

Um efeito de tamanho fixo informa "aconteceu algo" e para por aí. O jogo tinha
sete partículas para o toque de dois metros e as mesmas sete para a bomba de
fora da área — a diferença estava na física e no som, e não no que se vê.

Agora todo feedback de partida sai de um número que a jogada JÁ produziu:

| lance | de onde vem a força |
|---|---|
| chute e passe | `ball.lastKickForce / 22` (a escala do som, `*_MAX_KICK_FORCE_COEF`) |
| rastro da bola | velocidade contra `BALL_PHYSICS.PASS_SPEED_MAX` |
| defesa do goleiro | velocidade da bola no instante da luva |
| trave | velocidade no instante do choque |
| quique no gramado | `|vz|` na hora de tocar o chão |
| ricochete no corpo | velocidade que a bola tinha antes do tranco |
| carrinho e corrida | quem desliza, e quem passa de 85% da velocidade de sprint |

**Uma função para todo o pó: `spawnImpactDust(x, y, cor, {forca, angulo,
abertura, depth})`.** O que muda entre um chute e um quique é número, não
comportamento — `forca` (0..1) manda de uma vez na QUANTIDADE (3 a 18), no
tamanho, na distância e na duração. `angulo` + `abertura` fazem a nuvem sair
em cone para um lado: o pó do chute sai contra o pé, a grama do carrinho sai
atrás do boneco. Sem ângulo, espalha em roda como antes.

**O rastro da bola era só para chute com curva** — ou seja, a bomba reta, o
chute que mais precisa parecer forte, viajava com o mesmo desenho de um toque
lateral. Agora a força do rastro é a VELOCIDADE, e a curva virou piso
(`FEEDBACK.RASTRO_CURVA`): bola rodando risca o ar mesmo devagar.

**Poeira de pé é por ENTIDADE, não global** (`atualizarPoeiraDosPes`): com um
relógio só, dois carrinhos ao mesmo tempo dividiriam a mesma nuvem e o segundo
pareceria não ter acontecido. Carrinho arranca grama a cada 55ms, corrida
levanta pó a cada 150ms.

Tudo isso é um efeito do catálogo (`particulas`), então o interruptor já
aparece nas duas telas de configuração e o rastro, o pó e as faíscas somem
juntos para quem desligar. Números em `FEEDBACK` (constants.js).

Check no `GameScene.hud.js`: a nuvem é medida numa cena falsa — força 0 dá o
mínimo, força 1 dá o máximo, o meio fica no meio, o cone com abertura zero
manda TODA partícula para o mesmo lado, e com o interruptor desligado não nasce
nenhuma. Nuvem que parou de responder à força é o defeito difícil de notar
jogando: "saiu poeira" parece certo em qualquer caso.
