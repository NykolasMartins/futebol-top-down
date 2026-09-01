class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
    this.gamepadPrevA = false;
    this.gamepadPrevB = false;
    this.gamepadPrevX = false;
    this.gamepadPrevY = false;
    this.gamepadPrevStart = false;
    this.gamepadPrevSwitch = false;
    this.gamepadRightStickX = 0;
    this.gamepadRightStickY = 0;
    this.controlMode = "single"; // Default to single player
    this.currentPlayerIndex = 0; // Track index of current player in [playerTeam array!
    this.queuedPass = null; // For one-touch pass
  }

  init(data) {
    this.isExhibition = !!(data && data.isExhibition);
    this.controlMode = (data && data.controlMode) || "single"; // Get control mode from data

    this.opponent =
      data && data.opponent
        ? data.opponent
        : {
            name: this.isExhibition ? data.awayTeam : "Time Desconhecido",
            rating: 70,
          };

    this.matchType = data && data.matchType ? data.matchType : "brasileirao";
    this.lineupStatus =
      data && data.lineupStatus ? data.lineupStatus : "starter";
    this.initialScorePlayer =
      data && data.initialScorePlayer !== undefined
        ? data.initialScorePlayer
        : 0;
    this.initialScoreOpponent =
      data && data.initialScoreOpponent !== undefined
        ? data.initialScoreOpponent
        : 0;
    this.startSecondHalfFlag = !!(data && data.startSecondHalf);
    this.isSpectator = !!(data && data.isSpectator); // Modo assistir
    // Pacote da sala LAN. Só existe em partida de rede; carreira e exibição
    // seguem sem tocar em nada disso (ver GameScene.lan.js).
    this.lan = (data && data.lan) || null;

    // Exhibition mode specific settings
    if (this.isExhibition) {
      this.playerTeamName = data.homeTeam || "Flamengo";
      this.opponent.name = data.awayTeam || "Palmeiras";
      // Duração de UM tempo. O amistoso deixa escolher o total (3/5/10 min),
      // que vira dois tempos iguais; sem escolha, vale a constante.
      this.halfDuration = data.duration
        ? (data.duration * 60) / 2
        : UI_CONFIG.HALF_DURATION_SEC;
      this.weather = data.weather || "clear";
    } else {
      this.halfDuration = UI_CONFIG.HALF_DURATION_SEC;
      this.weather = "clear";
      // Fora da exibição o time do usuário costuma vir do `careerMode`, mas a
      // DATA FIFA manda a seleção por aqui: é o que troca elenco e uniforme.
      if (data && data.homeTeam) this.playerTeamName = data.homeTeam;
    }

    const parseColor = (c) => {
      if (!c) return null;
      if (typeof c === "number") return c;
      return parseInt(c.replace("#", "0x"));
    };

    this.playerTeamColor =
      parseColor(data?.playerTeamColor) ||
      parseColor(data?.playerTeam?.color) ||
      0x3388ff;
    this.playerTeamColor2 =
      parseColor(data?.playerTeamColor2) ||
      parseColor(data?.playerTeam?.secondaryColor);

    this.opponentTeamColor =
      parseColor(data?.opponentTeamColor) ||
      parseColor(this.opponent?.color) ||
      parseColor(this.opponent?.teamColor) ||
      parseColor(this.opponent?.primaryColor) ||
      0xff3333;

    this.opponentTeamColor2 =
      parseColor(data?.opponentTeamColor2) ||
      parseColor(this.opponent?.secondaryColor);

    this.playerSkinColor = this.isExhibition
      ? 0xffdbac
      : window.careerMode?.skinColor || 0xffdbac;
  }

  createPlayerTexture(key, color1, color2, isPlayer = false) {
    let g = this.make.graphics({ x: 0, y: 0, add: false });

    g.fillStyle(color1, 1);
    g.fillCircle(16, 16, 16);

    if (color2 !== null && color2 !== undefined) {
      g.fillStyle(color2, 1);
      g.fillRect(8, 2, 6, 28);
      g.fillRect(18, 2, 6, 28);
    }

    const skinColor = isPlayer ? this.playerSkinColor : 0xffdbac;
    g.fillStyle(skinColor, 1);
    g.fillCircle(16, 8, 6);

    g.fillStyle(0x000000, 1);
    g.fillRect(18, 6, 3, 3);
    g.fillRect(18, 10, 3, 3);

    g.generateTexture(key, 32, 32);
  }

  preload() {
    const teams = [
      "Flamengo",
      "Palmeiras",
      "Sao_Paulo",
      "Corinthians",
      "Galo",
      "Cruzeiro",
      "Gremio",
      "Inter",
      "Fluminense",
      "Botafogo",
      "Santos",
      "Vasco",
      "Bahia",
      "Fortaleza",
      "Mirassol",
      "Remo",
      "Real_Madrid",
      "Valencia",
      "Arsenal",
      "Chelsea",
    ];

    teams.forEach((team) => {
      this.load.atlas(
        `${team}_atlas`,
        `assets/teams/${team}_atlas.png`,
        `assets/teams/${team}_atlas.json`,
      );
    });

    this.load.atlas(
      "goalkeeper_atlas",
      "assets/goalkeeper_atlas.png",
      "assets/goalkeeper_atlas.json",
    );

    // === ARTE BASE PARA PALETTE SWAP ===
    // PNGs soltos da IA (sem spritesheet nem atlas JSON); o buildKitAtlas
    // empacota em canvas. Mesmo loader usado pela criação de personagem.
    this.loadBaseSprites();

    this.createPlayerTexture(
      "player_kit",
      this.playerTeamColor,
      this.playerTeamColor2,
      true,
    );
    this.createPlayerTexture(
      "opponent_kit",
      this.opponentTeamColor,
      this.opponentTeamColor2,
      false,
    );

    let g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(16, 16, 16);
    g.generateTexture("playerTexture", 32, 32);
    g.generateTexture("enemyTexture", 32, 32);

    const gkGraphics = this.make.graphics({ x: 0, y: 0, add: false });
    gkGraphics.fillStyle(0xffd700);
    gkGraphics.fillRect(0, 12, 32, 32);
    gkGraphics.fillStyle(0xdca300);
    gkGraphics.fillRect(10, 0, 12, 12);
    gkGraphics.fillRect(10, 44, 12, 12);
    gkGraphics.fillStyle(0xffffff);
    gkGraphics.fillRect(24, 24, 8, 8);
    gkGraphics.generateTexture("goalkeeperTexture", 32, 56);

    this.load.spritesheet("ball_spritesheet", "assets/ball_spritesheet.png", {
      frameWidth: 128,
      frameHeight: 128,
    });
  }

  create() {
    this.GameStates = GameStates; // Disponibilizar para as entidades
    this.gameState = GameStates.PLAYING;
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Expõe as dimensões do campo na cena: entidades leem scene.PITCH_* e sem
    // isso caíam em fallbacks hardcoded do layout vertical antigo.
    this.PITCH_X = PITCH_X;
    this.PITCH_Y = PITCH_Y;
    this.PITCH_WIDTH = PITCH_WIDTH;
    this.PITCH_HEIGHT = PITCH_HEIGHT;
    this.GOAL_LINE_OFFSET = GOAL_LINE_OFFSET;

    this.cameras.main.setBackgroundColor("#1a4d2e"); // Cor de fora do campo (mais escura)
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    // Câmera inclinada desde o primeiro frame: o zoom dinâmico só roda no
    // `update`, e antes dele a cena apareceria um instante em top-down puro.
    Perspectiva.zoom(this.cameras.main, 1);

    // O olho de peixe não é aplicado aqui: o `main.js` liga a pipeline na
    // câmera de TODA cena, no evento `create`.

    this.drawPitch(PITCH_WIDTH, PITCH_HEIGHT);
    this.drawGrandstands(); // Nova função para desenhar arquibancadas

    this.anims.create({
      key: "ball_rotate",
      frames: this.anims.generateFrameNumbers("ball_spritesheet", {
        start: 0,
        end: 63,
      }),
      frameRate: 30,
      repeat: -1,
    });

    const goalkeeperDirections = [
      "north",
      "north-east",
      "east",
      "south-east",
      "south",
      "south-west",
      "west",
      "north-west",
    ];
    goalkeeperDirections.forEach((dir) => {
      this.anims.create({
        key: `goalkeeper_atlas_idle_${dir}`,
        frames: this.anims.generateFrameNames("goalkeeper_atlas", {
          prefix: `idle_${dir}_`,
          start: 0,
          end: 4,
        }),
        frameRate: 5,
        repeat: -1,
      });

      this.anims.create({
        key: `goalkeeper_atlas_walk_${dir}`,
        frames: this.anims.generateFrameNames("goalkeeper_atlas", {
          prefix: `walk_${dir}_`,
          start: 0,
          end: 5,
        }),
        frameRate: 10,
        repeat: -1,
      });

      this.anims.create({
        key: `goalkeeper_atlas_jumping_${dir}`,
        frames: this.anims.generateFrameNames("goalkeeper_atlas", {
          prefix: `jumping_${dir}_`,
          start: 0,
          end: 6,
        }),
        frameRate: 14,
        repeat: -1,
      });
    });

    const teams = [
      "Flamengo",
      "Palmeiras",
      "Sao_Paulo",
      "Corinthians",
      "Galo",
      "Cruzeiro",
      "Gremio",
      "Inter",
      "Fluminense",
      "Botafogo",
      "Santos",
      "Vasco",
      "Bahia",
      "Fortaleza",
      "Mirassol",
      "Remo",
      "Real_Madrid",
      "Valencia",
      "Arsenal",
      "Chelsea",
    ];
    const directions = [
      "north",
      "north-east",
      "east",
      "south-east",
      "south",
      "south-west",
      "west",
      "north-west",
    ];

    teams.forEach((team) => {
      const atlasKey = `${team}_atlas`;

      if (!this.textures.exists(atlasKey)) {
        console.warn(
          `Aviso: Textura ${atlasKey} não encontrada. Pulando animações.`,
        );
        return;
      }

      directions.forEach((dir) => {
        this.anims.create({
          key: `${atlasKey}_idle_${dir}`,
          frames: [{ key: atlasKey, frame: `idle_${dir}` }],
          frameRate: 1,
        });

        const runFrameKey = `run_${dir}_0`;
        if (this.textures.get(atlasKey).has(runFrameKey)) {
          this.anims.create({
            key: `${atlasKey}_run_${dir}`,
            frames: [
              { key: atlasKey, frame: `run_${dir}_0` },
              { key: atlasKey, frame: `run_${dir}_1` },
              { key: atlasKey, frame: `run_${dir}_2` },
              { key: atlasKey, frame: `run_${dir}_3` },
            ],
            frameRate: 10,
            repeat: -1,
          });
        } else {
          this.anims.create({
            key: `${atlasKey}_run_${dir}`,
            frames: [{ key: atlasKey, frame: `idle_${dir}` }],
            frameRate: 1,
          });
        }
      });
    });

    this.tacticManager = new TacticManager(this);

    // Tática de cada lado. Ponto único: é daqui que sai o `tactic` de todos os
    // bonecos, e é isto que o menu de pausa troca no meio do jogo. Na carreira
    // ela vem do save (o menu de pausa grava de volta).
    this.playerTactic =
      (window.careerMode && window.careerMode.tactic) || TACTICS.T3_1;
    this.enemyTactic = TACTICS.T3_1;

    // Expulsos por time, para as tiras vermelhas do placar.
    this.expulsos = { PLAYER: 0, OPPONENT: 0 };

    // === ATRIBUTOS DO CAREER MODE ===
    const career = window.careerMode;
    let playerSpeed = career ? career.speed : 75;
    let playerKickPower = career ? career.kickPower : 75;
    let playerStamina = career ? career.stamina : 75;

    if (career && career.skills) {
      playerSpeed += (career.skills.sprintMaster || 0) * 2;
      playerKickPower += (career.skills.powerShot || 0) * 2;
      playerStamina += (career.skills.tireless || 0) * 5;
    }

    if (career && career.condition < 70) {
      const penalty = (70 - career.condition) / 100;
      playerSpeed *= 1 - penalty;
      playerStamina *= 1 - penalty;
    }

    // --- Time A (Player Team) ---
    // `this.playerTeamName` vem do `init` quando a partida é de exibição ou de
    // LAN (o time escolhido na tela anterior). Sem ele na frente, TODA partida
    // fora da carreira vestia Flamengo, mesmo com outro time escolhido — o
    // lobby LAN escancarou isso ao pôr dois times iguais em campo.
    const playerTeamName =
      this.playerTeamName || (career ? career.currentTeam.name : "Flamengo");

    // Aparência determinística. Os NPCs seguem a MESMA ordem de elenco que o
    // assignRealPlayerNames usa (allies[i] -> playerLine[i]), então o rosto
    // bate com o nome que aparece em cima do jogador.
    const allyRoster = window.getLinePlayers?.(playerTeamName) || [];
    const lookAliado = (i) => getPlayerAppearance(allyRoster[i]);
    // O avatar do usuário vem do save, não do elenco.
    const lookJogador = {
      skin: career?.skinColor ?? SKIN_COLORS[0],
      hair:
        career?.hairColor ??
        getPlayerAppearance({ id: career?.playerName || "user_player" }).hair,
    };

    if (this.isSpectator) {
      // No modo espectador, o "player" é controlado pela IA (Enemy)
      this.player = new Enemy(
        this,
        PITCH_X + PITCH_WIDTH / 2 + 100,
        PITCH_Y + PITCH_HEIGHT / 2,
        playerSpeed,
        playerKickPower,
        playerStamina,
        playerTeamName,
        lookJogador,
      );
    } else {
      this.player = new Player(
        this,
        PITCH_X + PITCH_WIDTH / 2 + 100,
        PITCH_Y + PITCH_HEIGHT / 2,
        playerSpeed,
        playerKickPower,
        playerStamina,
        playerTeamName,
        lookJogador,
      );
    }
    this.player.archetype = ARCHETYPES.PIVOT;
    this.player.tactic = this.playerTactic;
    this.player.isPlayerTeam = true;

    this.allies = [];
    const allyBaseAttr = Math.round(
      (playerSpeed + playerKickPower + playerStamina) / 3,
    );
    const allyBase = Phaser.Math.Clamp(allyBaseAttr, 50, 85);

    const allyFixo = new Enemy(
      this,
      PITCH_X + PITCH_WIDTH / 2 + 300,
      PITCH_Y + PITCH_HEIGHT / 2,
      allyBase - 2,
      allyBase,
      allyBase + 3,
      playerTeamName,
      lookAliado(0),
    );
    allyFixo.archetype = ARCHETYPES.FIXO;
    allyFixo.tactic = this.playerTactic;
    allyFixo.isPlayerTeam = true;
    this.allies.push(allyFixo);

    const allyWingL = new Enemy(
      this,
      PITCH_X + PITCH_WIDTH / 2 + 150,
      PITCH_Y + PITCH_HEIGHT / 2 - 250,
      allyBase + 2,
      allyBase - 2,
      allyBase,
      playerTeamName,
      lookAliado(1),
    );
    allyWingL.archetype = ARCHETYPES.WING_L;
    allyWingL.tactic = this.playerTactic;
    allyWingL.isPlayerTeam = true;
    this.allies.push(allyWingL);

    const allyWingR = new Enemy(
      this,
      PITCH_X + PITCH_WIDTH / 2 + 150,
      PITCH_Y + PITCH_HEIGHT / 2 + 250,
      allyBase + 3,
      allyBase - 1,
      allyBase - 1,
      playerTeamName,
      lookAliado(2),
    );
    allyWingR.archetype = ARCHETYPES.WING_R;
    allyWingR.tactic = this.playerTactic;
    allyWingR.isPlayerTeam = true;
    this.allies.push(allyWingR);

    this.playerTeam = [this.player, ...this.allies]; // Fixed array of player team members!
    this.currentPlayerIndex = 0; // Initial player is index 0!

    // --- Time B (Enemy Team) ---
    this.enemies = [];
    const oppRating = this.opponent ? this.opponent.rating || 75 : 75;
    const oppName = this.opponent ? this.opponent.name : "Palmeiras";
    // A dificuldade entra como FATOR na ficha do rival — nunca como `if`.
    // Multiplicar o rating antes do clamp é o ponto certo: tudo que a entidade
    // deriva (velocidade, sprint, chute, fôlego) acompanha de uma vez.
    const fDif = typeof Dificuldade !== "undefined" ? Dificuldade.fator("adversario") : 1;
    const oppSpeed = Phaser.Math.Clamp(oppRating * fDif, 48, 90);
    const oppKick = Phaser.Math.Clamp((oppRating + 2) * fDif, 48, 90);
    const oppStam = Phaser.Math.Clamp((oppRating - 2) * fDif, 48, 90);

    // Mesma ordem de elenco que o assignRealPlayerNames (enemies[i] -> line[i]).
    const oppRoster = window.getLinePlayers?.(oppName) || [];
    const lookRival = (i) => getPlayerAppearance(oppRoster[i]);

    this.enemy = new Enemy(
      this,
      PITCH_X + PITCH_WIDTH / 2 - 100,
      PITCH_Y + PITCH_HEIGHT / 2,
      oppSpeed,
      oppKick,
      oppStam,
      oppName,
      lookRival(0),
    );
    this.enemy.archetype = ARCHETYPES.PIVOT;
    this.enemy.tactic = this.enemyTactic;
    this.enemy.isPlayerTeam = false;
    this.enemies.push(this.enemy);

    const enemyFixo = new Enemy(
      this,
      PITCH_X + PITCH_WIDTH / 2 - 300,
      PITCH_Y + PITCH_HEIGHT / 2,
      oppSpeed - 2,
      oppKick - 2,
      oppStam + 2,
      oppName,
      lookRival(1),
    );
    enemyFixo.archetype = ARCHETYPES.FIXO;
    enemyFixo.tactic = this.enemyTactic;
    enemyFixo.isPlayerTeam = false;
    this.enemies.push(enemyFixo);

    const enemyWingL = new Enemy(
      this,
      PITCH_X + PITCH_WIDTH / 2 - 150,
      PITCH_Y + PITCH_HEIGHT / 2 - 250,
      oppSpeed + 2,
      oppKick - 1,
      oppStam - 1,
      oppName,
      lookRival(2),
    );
    enemyWingL.archetype = ARCHETYPES.WING_L;
    enemyWingL.tactic = this.enemyTactic;
    enemyWingL.isPlayerTeam = false;
    this.enemies.push(enemyWingL);

    const enemyWingR = new Enemy(
      this,
      PITCH_X + PITCH_WIDTH / 2 - 150,
      PITCH_Y + PITCH_HEIGHT / 2 + 250,
      oppSpeed + 3,
      oppKick - 2,
      oppStam,
      oppName,
      lookRival(3),
    );
    enemyWingR.archetype = ARCHETYPES.WING_R;
    enemyWingR.tactic = this.enemyTactic;
    enemyWingR.isPlayerTeam = false;
    this.enemies.push(enemyWingR);

    this.allPlayers = [this.player, ...this.allies, ...this.enemies];
    this.playerTeamName = playerTeamName;
    this.opponentTeamName = oppName; // Garantir armazenamento
    this.assignRealPlayerNames(playerTeamName, oppName);

    // === GOLEIROS (Criar antes da lógica de 2º tempo) ===
    // gkTop = gol da ESQUERDA. Área: profundidade em X, boca em Y.
    const topGkMinX_init = PITCH_X;
    const topGkMaxX_init = PITCH_X + GK_AREA_HEIGHT;
    const topGkMinY_init = PITCH_Y + PITCH_HEIGHT / 2 - GK_AREA_WIDTH / 2;
    const topGkMaxY_init = PITCH_Y + PITCH_HEIGHT / 2 + GK_AREA_WIDTH / 2;

    this.gkTop = new Goalkeeper(
      this,
      PITCH_X + GOAL_LINE_OFFSET,
      PITCH_Y + PITCH_HEIGHT / 2,
      topGkMinX_init,
      topGkMaxX_init,
      topGkMinY_init,
      topGkMaxY_init,
      true,
      false, // Oponente defende o topo no 1º tempo
    );

    // gkBottom = gol da DIREITA.
    const botGkMinX_init = PITCH_X + PITCH_WIDTH - GK_AREA_HEIGHT;
    const botGkMaxX_init = PITCH_X + PITCH_WIDTH;
    const botGkMinY_init = PITCH_Y + PITCH_HEIGHT / 2 - GK_AREA_WIDTH / 2;
    const botGkMaxY_init = PITCH_Y + PITCH_HEIGHT / 2 + GK_AREA_WIDTH / 2;

    this.gkBottom = new Goalkeeper(
      this,
      PITCH_X + PITCH_WIDTH - GOAL_LINE_OFFSET,
      PITCH_Y + PITCH_HEIGHT / 2,
      botGkMinX_init,
      botGkMaxX_init,
      botGkMinY_init,
      botGkMaxY_init,
      false,
      true, // Jogador defende o fundo no 1º tempo
    );
    this.assignGoalkeeperNames(playerTeamName, oppName);

    this.ball = new Ball(
      this,
      PITCH_X + PITCH_WIDTH / 2,
      PITCH_Y + PITCH_HEIGHT / 2,
    );
    this.ball.setDepth(10);

    // Escalação da sala LAN por cima do 5v5 padrão: arquétipo de cada boneco,
    // nome do humano que o ocupa e quem é o jogador local. Sem `this.lan` é
    // no-op, então carreira e exibição não mudam.
    // Fica DEPOIS da bola de propósito: o `TacticManager` posiciona em relação
    // a ela, e antes disto `scene.ball` ainda é undefined.
    this.applyLanLineup();

    // Indicador visual sobre o jogador
    this.playerIndicator = this.add.triangle(
      0,
      0,
      -8,
      -6,
      8,
      -6,
      0,
      6,
      0xffff00,
    );
    this.playerIndicator.setDepth(20);

    this.playerSelectionRing = this.make.graphics({ x: 0, y: 0, add: true });
    this.playerSelectionRing.setDepth(5); // Abaixo do jogador (que costuma ser depth 20+)

    // === SISTEMA DE PARTÍCULAS (CHUTE ESPECIAL) ===
    this.specialShotParticles = this.add.graphics().setDepth(15);
    this.ballFireParticles = this.add.graphics().setDepth(25);
    this.isSpecialPowerActive = false;

    // === STAMINA CIRCLE ===
    this.staminaCircleGraphics = this.make.graphics({ x: 0, y: 0, add: true });
    this.staminaCircleGraphics.setDepth(15);
    this.staminaCircleRadius = 20;

    // Modo de câmera da partida. Z alterna (ver `alternarCamera`).
    this.cameraAlvo = "jogador";
    this.seguirCamera();

    this.scorePlayer = this.initialScorePlayer || 0;
    this.scoreOpponent = this.initialScoreOpponent || 0;
    this.isSecondHalf = this.startSecondHalfFlag;
    this.timeLeft = this.halfDuration;
    this.isGameOver = false;

    // --- ESTADO DO MENU DE PAUSA ---
    this._pauseMenuActive = false;
    this._pauseMenuDOM = null;
    this._gameSettings = {
      soundEnabled: true,
      showMinimap: true,
    };
    this._substitutionUsed = false;

    // --- CONTROLES --- (teclado/mouse/gamepad → js/scenes/GameScene.input.js)
    this.setupInput();

    // === SISTEMA DE MATCH RATING ===
    this.playerMatchRating = 6.0;
    this.lastPlayerActionTime = 0;
    this.playerActionCount = 0;

    // === RASTREAMENTO DE GOLS E ASSISTÊNCIAS ===
    this.lastTouch = null;
    this.penultimateTouch = null;
    this.lastTouchTeam = null; // 'PLAYER' ou 'OPPONENT'

    this.matchStats = {
      goals: 0,
      assists: 0,
      passes: 0,
      shots: 0,
    };

    // === HUD RETRO-MODERNO COM DOM/CSS ===
    // Criar o HUD com HTML/CSS
    const hudHTML = `
      <div class="game-hud" style="
        position:absolute;
        top:0;
        left:0;
        width:100%;
        height:100%;
        pointer-events:none;
        font-family:'Press Start 2P',monospace;
        z-index:500;
      ">
        <!-- Placar de transmissão: tempo / times / competição (GameScene.hud.js) -->
        ${this.buildScoreboardHTML()}

        <!-- Status do jogador (esquerda) -->
        <div style="
          position:absolute;
          top:20px;
          left:20px;
          background:rgba(6,14,6,0.95);
          border:2px solid #2a7a2a;
          padding:12px 15px;
          border-radius:8px;
          box-shadow:4px 4px 0 #000;
        ">
          <div id="rating-display" style="
            color:#ffd700;
            font-size:12px;
            margin-bottom:10px;
          ">NOTA: ${this.playerMatchRating.toFixed(1)}</div>
          <div style="
            display:flex;
            flex-direction:column;
            gap:4px;
          ">
            <div style="
              display:flex;
              justify-content:space-between;
              color:#ffd700;
              font-size:8px;
            ">
              <span>ESTAMINA</span>
              <span id="stamina-value">${this.player.currentStamina}/${this.player.maxStamina}</span>
            </div>
            <div style="
              width:180px;
              height:10px;
              background:#0a140a;
              border:2px solid #2a7a2a;
              overflow:hidden;
            ">
              <div id="stamina-bar" style="
                height:100%;
                width:100%;
                background:#00ff88;
                transition:width 0.2s ease;
              "></div>
            </div>
          </div>
        </div>

        <!-- Dicas de controles (inferior) -->
        <div style="
          position:absolute;
          bottom:20px;
          left:50%;
          transform:translateX(-50%);
          color:#557755;
          font-size:8px;
          text-align:center;
          letter-spacing:1px;
        ">
          WASD: MOVER &nbsp; | &nbsp; CLIQUE ESQUERDO: PASSE/CHUTE &nbsp; | &nbsp; ESPAÇO: BOTE &nbsp; | &nbsp; SHIFT+ESPAÇO: CARRINHO &nbsp; | &nbsp; Z: CÂMERA
        </div>
      </div>
    `;

    // Adicionar o HUD diretamente ao container do jogo usando JS padrão
    const gameContainer = document.getElementById("game-container");
    this.hudElement = document.createElement("div");
    this.hudElement.innerHTML = hudHTML;
    gameContainer.appendChild(this.hudElement);

    // === UPDATE HUD FUNCTIONS ===
    this.updateHUD = () => {
      // Relógio e gols do placar de transmissão.
      this.refreshScoreboard();

      // Atualizar nota
      const ratingEl = document.getElementById("rating-display");
      if (ratingEl) {
        ratingEl.textContent = `NOTA: ${this.playerMatchRating.toFixed(1)}`;
      }

      // Atualizar estamina
      const staminaValueEl = document.getElementById("stamina-value");
      const staminaBarEl = document.getElementById("stamina-bar");
      const staminaPct =
        (this.player.currentStamina / this.player.maxStamina) * 100;
      if (staminaValueEl) {
        staminaValueEl.textContent = `${Math.floor(this.player.currentStamina)}/${this.player.maxStamina}`;
      }
      if (staminaBarEl) {
        staminaBarEl.style.width = `${staminaPct}%`;
        if (staminaPct < 20) {
          staminaBarEl.style.background = "#ff4455";
        } else if (staminaPct < 50) {
          staminaBarEl.style.background = "#ffd700";
        } else {
          staminaBarEl.style.background = "#00ff88";
        }
      }
    };

    // Populate the HUD immediately with initial values
    this.updateHUD();

    // Minimapa (Mantido com melhor estilo)
    this.createMinimap();
    // Pregados na tela: a câmera inclinada os arrastaria para baixo e os
    // espremeria junto com o campo (ver Perspectiva.tela).
    if (this.minimapBg) Perspectiva.tela(this.minimapBg.setScrollFactor(0));
    if (this.minimapDots) Perspectiva.tela(this.minimapDots.setScrollFactor(0));

    if (this.startSecondHalfFlag) {
      this.isSecondHalf = true;
      this.timeLeft = this.halfDuration;

      // Corrigir Goleiros para o 2º tempo
      const topGkMinY = PITCH_Y + PITCH_HEIGHT / 2 - GK_AREA_WIDTH / 2;
      const topGkMaxY = PITCH_Y + PITCH_HEIGHT / 2 + GK_AREA_WIDTH / 2;
      const botGkMinY = topGkMinY;
      const botGkMaxY = topGkMaxY;

      const topGkMinX = PITCH_X;
      const topGkMaxX = PITCH_X + GK_AREA_HEIGHT;
      const botGkMinX = PITCH_X + PITCH_WIDTH - GK_AREA_HEIGHT;
      const botGkMaxX = PITCH_X + PITCH_WIDTH;

      // Inverter: o que era top agora é bottom e vice-versa (conforme a lógica de inversão do 2º tempo)
      // No 2º tempo, o time do jogador (que estava no bottom) ataca para baixo e defende o topo.
      if (this.gkTop)
        this.gkTop.reconfigureSide(
          botGkMinX,
          botGkMaxX,
          botGkMinY,
          botGkMaxY,
          false,
          true, // Jogador defende o fundo no 2º tempo (invertido)
        );
      if (this.gkBottom)
        this.gkBottom.reconfigureSide(
          topGkMinX,
          topGkMaxX,
          topGkMinY,
          topGkMaxY,
          true,
          false, // Oponente defende o topo no 2º tempo
        );

      // Reposicionar todos os jogadores para o lado correto do 2º tempo
      this.resetMatch();
    }

    this._gameTimer = this.time.addEvent({
      delay: 1000,
      // Relógio: no convidado ele NÃO corre. Fim de tempo, intervalo e fim de
      // jogo são decisões de partida, e duas máquinas contando em paralelo
      // divergem — o convidado recebe o estado pelo pacote do anfitrião.
      callback: () => {
        if (this.lan && !this.souHostLan) return;
        this.updateTimer();
      },
      callbackScope: this,
      loop: true,
    });

    // === COLISÕES ===
    this.physics.add.collider(this.allPlayers, this.allPlayers, (p1, p2) => {
      // Pequena repulsão para evitar que fiquem "grudados" empurrando
      const angle = Phaser.Math.Angle.Between(p1.x, p1.y, p2.x, p2.y);
      const repulsion = 0.4;
      p1.body.velocity.x -= Math.cos(angle) * repulsion * 60;
      p1.body.velocity.y -= Math.sin(angle) * repulsion * 60;
      p2.body.velocity.x += Math.cos(angle) * repulsion * 60;
      p2.body.velocity.y += Math.sin(angle) * repulsion * 60;
    });
    this.physics.add.collider(this.allPlayers, this.gkTop);
    this.physics.add.collider(this.allPlayers, this.gkBottom);

    // === COLISÃO BOLA-JOGADORES: RICOCHETE REALISTA ===
    this.physics.add.collider(this.ball, this.allPlayers, (ball, player) => {
      // Não ricochetear se a bola tem dono ou está em cooldown de roubo
      if (ball.owner || ball.stealCooldown > 0) return;

      // Calcular o ângulo da colisão
      const collisionAngle = Phaser.Math.Angle.Between(
        player.x,
        player.y,
        ball.x,
        ball.y,
      );

      // Velocidade atual da bola
      const currentSpeed = Math.sqrt(
        ball.body.velocity.x ** 2 + ball.body.velocity.y ** 2,
      );

      // Ricochete: reduzir a velocidade e refletir
      const bounceFactor = 0.6;
      const newSpeed = currentSpeed * bounceFactor;

      // Aplicar a nova velocidade na direção do ricochete
      ball.body.velocity.x = Math.cos(collisionAngle) * newSpeed;
      ball.body.velocity.y = Math.sin(collisionAngle) * newSpeed;

      // Efeito visual: poeira na medida do tranco que a bola levou.
      if (this.spawnImpactDust)
        this.spawnImpactDust(ball.x, ball.y - ball.z, 0xcccccc, {
          forca: Phaser.Math.Clamp(
            currentSpeed / BALL_PHYSICS.PASS_SPEED_MAX,
            0.12,
            0.9,
          ),
        });
    });

    this.isResetting = false;

    // === NOVOS GOLS RECUADOS (ESTILO HÓQUEI) ===
    this.createGoals();

    this.playerEnemyCollider = this.physics.add.overlap(
      this.player,
      this.enemy,
    );

    this.ball.owner = null;
    this.ball.stealCooldown = 0;

    // Input de mouse (pointerdown/pointerup) → js/scenes/GameScene.input.js

    // === KICK CHARGING BAR ===
    this.kickChargeBarGraphics = this.make.graphics({ x: 0, y: 0, add: true });
    this.kickChargeBarGraphics.setDepth(130);
    this.kickChargeBarWidth = 96;
    this.kickChargeBarHeight = 10;

    // === FLASH DE GOL (overlay de tela inteira) ===
    this.goalFlash = this.add
      .rectangle(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2,
        this.cameras.main.width,
        this.cameras.main.height,
        0xffffff,
        0,
      )
      .setDepth(200);

    // === TEXTO DE GOL ===
    this.goalText = this.add
      .text(this.cameras.main.width / 2, this.cameras.main.height / 2, "", {
        fontSize: "72px",
        fill: "#ffffff",
        fontStyle: "bold",
        fontFamily: "Arial, sans-serif",
        stroke: "#000000",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(201)
      .setAlpha(0);
    Perspectiva.tela(this.goalText);

    // Placar e menus são DOM fora do Phaser: sem este hook eles sobrevivem à
    // troca de cena. Ver GameScene.hud.js.
    this.registerDOMTeardown();

    // Estádio ligado e apito inicial. Se o jogador ainda não tocou em nada, o
    // contexto não existe e as duas chamadas são silenciosas de graça — mas
    // para chegar aqui ele clicou no menu, então na prática já destravou.
    Som.iniciarTorcida();
    Som.tocar("apito");

    // === SISTEMA DE REPLAY ===
    this.replayBuffer = [];
    this.replayMaxFrames = 180; // 3 segundos a 60fps
    this.isReplaying = false;
    this.replayFrameIndex = 0;

    // Overlay de Replay
    this.replayUI = this.add
      .container(0, 0)
      .setScrollFactor(0)
      .setDepth(300)
      .setAlpha(0);
    const replayBg = this.add.graphics();
    replayBg.fillStyle(0xff0000, 0.4);
    replayBg.fillRect(20, 80, 100, 30);
    this.replayUI.add(replayBg);
    this.replayUI.add(
      this.add.text(30, 85, "● REPLAY", {
        fontSize: "16px",
        fill: "#ffffff",
        fontStyle: "bold",
        fontFamily: "Arial",
      }),
    );
    // No CONTAINER, uma vez só: compensar os filhos também dobraria a conta.
    Perspectiva.tela(this.replayUI);
  }

  /**
   * Toca um efeito sonoro com verificações de segurança.
   */
  playSfx(key, volume = 1) {
    if (!this.sound || !this.sound.get(key)) {
      return;
    }
    this.sound.play(key, { volume });
  }

  update(time, delta) {
    if (this.isGameOver) return;

    // Update player indicator position to follow current player
    if (this.playerIndicator && this.player) {
      this.playerIndicator.setPosition(this.player.x, this.player.y - 40);
    }

    // TAB + gamepad → js/scenes/GameScene.input.js
    this.updateInputPolling();

    if (this._pauseMenuActive) return; // Bloquear update durante menu de pausa

    // Atualizar HUD a cada frame
    if (this.updateHUD) this.updateHUD();

    // Zoom contextual: abre na transição, fecha no perigo. Durante o replay o
    // zoom é do replay, então fica de fora.
    if (!this.isReplaying) this.updateCameraZoom();

    if (this.isReplaying) {
      this.playNextReplayFrame();
      // Não damos return aqui para permitir atualizações visuais
    } else {
      // Gravar frame para o replay
      this.recordReplayFrame();

      // Safety Reset: Se ficar travado em bola parada por muito tempo, força retorno
      if (this.isSettingUpSetPiece) {
        if (!this.setPieceStartTime) this.setPieceStartTime = time;
        if (time - this.setPieceStartTime > 8000) {
          // 8 segundos de timeout
          this.isSettingUpSetPiece = false;
          this.setPieceStartTime = 0;
        }
      } else {
        this.setPieceStartTime = 0;
      }

      // Se não estiver jogando, a bola deve ficar parada se estiver solta
      const isPausedState = this.gameState !== GameStates.PLAYING;

      if (this.allPlayers) {
        this.allPlayers.forEach((p) => {
          // LAN: quem é comandado pela REDE não roda IA nem física local.
          // - boneco de outro humano: sempre da rede, nos dois clientes;
          // - bots: só o anfitrião os simula; no convidado eles são cópia.
          // Sem esta guarda, a IA local briga com o pacote que chega e o
          // boneco treme entre as duas posições.
          if (this.lan && p.isRemotePlayer) return;
          if (this.lan && !this.souHostLan && p !== this.player) return;
          // Agora todos os jogadores podem se mover mesmo em bola parada (regras reais)
          p.update(time, delta);
        });
      }

      if (isPausedState && this.ball && !this.ball.owner) {
        this.ball.body.setVelocity(0, 0);
        this.ball.vz = 0;
        this.ball.z = 0;
      }

      // Goleiros e bola: no convidado, quem manda é o pacote do anfitrião.
      const redeManda = this.lan && !this.souHostLan;
      if (this.gkTop && !redeManda) this.gkTop.update(time, delta);
      if (this.gkBottom && !redeManda) this.gkBottom.update(time, delta);
      if (this.ball && !redeManda) this.ball.update(time, delta);

      // Suavização da rede: persegue os alvos que chegaram a 20Hz. Fica ANTES
      // das colisões para que elas vejam a posição já deslizada deste frame.
      // Durante o REPLAY não: quem manda nas posições é o buffer gravado, e
      // deslizar rumo ao pacote ao vivo embaralharia a jogada repetida.
      if (this.lan && !this.isReplaying) this.lanInterpolar(delta);

      this.checkCollisions();
      // Regras que REPOSICIONAM a bola (lateral, escanteio, tiro de meta) são
      // do anfitrião. No convidado elas disputavam a bola com o pacote da rede
      // e a devolviam para o meio a cada frame.
      if (!redeManda) this.checkOutOfBounds();

      // Cooldown global para botes do goleiro
      if (!this.gkStealCooldowns) this.gkStealCooldowns = { top: 0, bottom: 0 };
      if (this.gkStealCooldowns.top > 0) this.gkStealCooldowns.top -= delta;
      if (this.gkStealCooldowns.bottom > 0)
        this.gkStealCooldowns.bottom -= delta;

      if (this.allPlayers && this.ball) {
        // Lógica de Posse
        if (!this.ball.owner && this.ball.stealCooldown <= 0) {
          let closestDist = 9999;
          let closestPlayer = null;
          let finalReach = 40;

          // Limite de altura para jogadores de linha pegarem a bola
          const MAX_CATCH_HEIGHT = 28;
          const career = window.careerMode;

          this.allPlayers.forEach((p) => {
            if (p.stunTimer > 0) return;

            let reach = 40;
            if (p === this.player && career && career.skills.interceptor > 0) {
              reach += career.skills.interceptor * 5;
            }

            const dist = Phaser.Math.Distance.Between(
              p.x,
              p.y,
              this.ball.x,
              this.ball.y,
            );
            if (dist < closestDist) {
              closestDist = dist;
              closestPlayer = p;
              finalReach = reach;
            }
          });

          // Só pega a bola se ela estiver baixa o suficiente para um jogador de linha
          if (
            closestDist < finalReach &&
            closestPlayer &&
            this.ball.z < MAX_CATCH_HEIGHT &&
            // Dono da bola é decisão do anfitrião: no convidado ele chega pelo
            // pacote (`dono`). Decidir localmente fazia o convidado grudar a
            // bola no primeiro jogador perto dela e ignorar a rede.
            !(this.lan && !this.souHostLan)
          ) {
            this.ball.owner = closestPlayer;
            this.ball.stealCooldown = 500;
            this.ball.body.setVelocity(0, 0);

            // Jogada de primeira: o pedido guardado vale por
            // `GAME_FEEL.INPUT_BUFFER_MS`. Dentro da janela ele sai no instante
            // em que a bola chega — é isso que faz o jogo responder ao que o
            // jogador quis, e não ao frame exato em que apertou.
            if (closestPlayer === this.player && this.queuedPass) {
              const q = this.queuedPass;
              this.queuedPass = null;
              if (this.time.now - q.em <= GAME_FEEL.INPUT_BUFFER_MS) {
                if (q.chute)
                  this.kickBallFrom(this.player, q.pointer.worldX, q.pointer.worldY, q.forca);
                else this.executPass(q.pointer, q.passType);
              }
            }

            // Auto switch control to the player who just got the ball (only in full control mode)!
            if (
              this.controlMode === "full" &&
              closestPlayer.isPlayerTeam &&
              closestPlayer !== this.player
            ) {
              this.switchPlayer(closestPlayer);
            }

            // Check if this was a pass for first-time pass flag!
            if (this.ball.lastKickType === "pass") {
              closestPlayer.receivedPassFlag = true;
              // Set a timer to reset the flag if not used!
              this.time.delayedCall(500, () => {
                if (closestPlayer) {
                  closestPlayer.receivedPassFlag = false;
                }
              });
            }

            // Atualiza Last Touch
            this.lastTouchTeam = closestPlayer.isPlayerTeam
              ? "PLAYER"
              : "OPPONENT";
            this.lastTouch = closestPlayer;

            // Novo: Dar invulnerabilidade de 1.5s ao pegar a bola
            closestPlayer.invulnerableTimer = 1500;
          }
        }

        // Lógica de Botes: hitbox da bola separada da hitbox do jogador
        if (this.allPlayers) {
          this.allPlayers.forEach((tackler) => {
            if (!tackler.isDashing || !this.ball.owner) return;
            if (this.ball.owner.isPlayerTeam === tackler.isPlayerTeam) return;
            if (this.ball.owner.isGoalkeeper) return;

            const victim = this.ball.owner;
            if (victim.invulnerableTimer > 0) return;

            const distToBall = Phaser.Math.Distance.Between(
              tackler.x,
              tackler.y,
              this.ball.x,
              this.ball.y,
            );
            const facing =
              tackler.rotation || Phaser.Math.DegToRad(tackler.moveAngle || 90);
            const angleToBall = Phaser.Math.Angle.Between(
              tackler.x,
              tackler.y,
              this.ball.x,
              this.ball.y,
            );
            const angleDiff = Math.abs(
              Phaser.Math.Angle.Wrap(facing - angleToBall),
            );
            // O alcance do desarme sai de TACKLE, não de um número solto aqui,
            // e cresce com `defending`: bom zagueiro cobre mais espaço.
            const carrinho = !!tackler.isSliding;
            const ballHitRange =
              (carrinho ? TACKLE.SLIDE_BALL_HIT_RANGE : TACKLE.BALL_HIT_RANGE) *
              statWeight(
                (tackler.stats || DEFAULT_STATS).defending,
                AI_BEHAVIOR.STAT_DEFENDING_REACH_AMPLITUDE,
              );

            if (distToBall <= ballHitRange && angleDiff < Math.PI * 0.58) {
              tackler.tackleHit = true;
              tackler.isDashing = false;
              tackler.dashTimer = 0;

              const impactAngle = angleToBall;
              const impulse = tackler === this.player ? 18 : 15;

              this.ball.owner = null;
              this.ball.body.enable = true;
              this.ball.body.reset(this.ball.x, this.ball.y);
              this.ball.stealCooldown = 420;
              this.ball.customVx = Math.cos(impactAngle) * impulse;
              this.ball.customVy = Math.sin(impactAngle) * impulse;
              this.ball.lastKicker = tackler;
              this.ball.lastKickType = "tackle";
              this.lastTouchTeam = tackler.isPlayerTeam ? "PLAYER" : "OPPONENT";
              this.lastTouch = tackler;

              victim.invulnerableTimer = 250;
              victim.customVel?.scale(0.35);

              EfeitosVisuais.tremer(this, 90, 0.004);
              // Hit Stop: o mesmo do roubo por contato, agora congelando também
              // os dois jogadores — antes só a bola parava.
              this.applyHitStop(tackler, victim);

              if (tackler === this.player) {
                this.showFloatingText(
                  tackler.x,
                  tackler.y - 40,
                  "+ XP (Bote limpo)",
                  "#00ff99",
                );
                this.updateMatchRating(0.45, "Bote Limpo");
                // MELHORIA: Feedback visual de roubo de bola - indicador pisca verde
                this.playerIndicator.fillColor = 0x00ff00;
                this.time.delayedCall(200, () => {
                  this.playerIndicator.fillColor = 0xffff00;
                });
              }
            } else {
              // Tackle failed: apply slowdown penalty
              tackler.isDashing = false;
              tackler.dashTimer = 0;
              tackler.tackleSlowTimer = 400;
              tackler.customVel.set(0, 0);

              // FALTA: errou a bola e pegou o HOMEM. O bote limpo (acima) nunca
              // chega aqui. Autoridade do anfitrião, como toda regra que
              // reposiciona a bola.
              const distToVictim = Phaser.Math.Distance.Between(
                tackler.x,
                tackler.y,
                victim.x,
                victim.y,
              );
              if (
                distToVictim <= ballHitRange + FOUL.CONTACT_BAND &&
                Math.random() <
                  (carrinho ? FOUL.SLIDE_CHANCE : FOUL.CHANCE) &&
                !(this.lan && !this.souHostLan)
              ) {
                this.chamarFalta(tackler, victim, carrinho);
              }
            }
          });
        }

        // Roubada por CONTATO: encostar na bola do adversário andando já toma a
        // posse, sem depender do botão de bote. Só andando — quem chega no
        // sprint atropela e a bola segue com o dono. Autoridade é do anfitrião,
        // como em toda regra de posse.
        if (
          this.ball.owner &&
          !this.ball.owner.isGoalkeeper &&
          this.ball.stealCooldown <= 0 &&
          this.ball.owner.invulnerableTimer <= 0 &&
          !(this.lan && !this.souHostLan)
        ) {
          const dono = this.ball.owner;
          const ladrao = this.allPlayers.find((p) => {
            if (p === dono || p.isPlayerTeam === dono.isPlayerTeam) return false;
            if (p.stunTimer > 0 || p.isDashing) return false;
            // Zagueiro bom rouba em movimento; quem não defende precisa estar
            // quase parado para o contato valer.
            const v = p.body ? p.body.velocity.length() / 60 : 0;
            const teto =
              p.baseSpeed *
              AI_BEHAVIOR.CONTACT_STEAL_SPEED_MULT *
              statWeight(
                (p.stats || DEFAULT_STATS).defending,
                AI_BEHAVIOR.STAT_DEFENDING_STEAL_AMPLITUDE,
              );
            if (v > teto) return false;
            return (
              Phaser.Math.Distance.Between(p.x, p.y, this.ball.x, this.ball.y) <
              BALL_PHYSICS.PLAYER_REACH_BASE
            );
          });

          if (ladrao) {
            this.ball.owner = ladrao;
            this.ball.stealCooldown = TACKLE.BALL_STEAL_COOLDOWN_MS;
            ladrao.invulnerableTimer = TACKLE.INVULN_AFTER_PICKUP_MS;
            dono.invulnerableTimer = 250;
            this.lastTouchTeam = ladrao.isPlayerTeam ? "PLAYER" : "OPPONENT";
            this.lastTouch = ladrao;
            this.applyHitStop(ladrao, dono);
            if (
              this.controlMode === "full" &&
              ladrao.isPlayerTeam &&
              ladrao !== this.player
            )
              this.switchPlayer(ladrao);
          }
        }

        // Posicionamento da bola no portador. No convidado, NÃO: a posição da
        // bola vem inteira da rede, e este Lerp para o pé do portador
        // sobrescrevia o pacote logo depois de ele ser aplicado — era isto que
        // prendia a bola no lugar na tela do convidado.
        if (this.ball.owner && !(this.lan && !this.souHostLan)) {
          const owner = this.ball.owner;

          if (this.lastTouch !== owner) {
            this.penultimateTouch = this.lastTouch;
            this.lastTouch = owner;
          }

          this.ball.body.enable = false;

          let angleToUse = owner.rotation;
          if (owner.moveAngle !== undefined) {
            angleToUse = Phaser.Math.DegToRad(owner.moveAngle);
          }

          const radius = owner.isGoalkeeper ? 25 : 28;
          const targetBallX = owner.x + Math.cos(angleToUse) * radius;
          const targetBallY = owner.y + Math.sin(angleToUse) * radius;

          this.ball.x = Phaser.Math.Linear(this.ball.x, targetBallX, 0.4);
          this.ball.y = Phaser.Math.Linear(this.ball.y, targetBallY, 0.4);
        } else {
          this.ball.body.enable = true;
        }
      }
    }

    // === ATUALIZAÇÕES VISUAIS (SEMPRE EXECUTADAS, INCLUSIVE NO REPLAY) ===

    if (this.playerIndicator && this.player) {
      this.playerIndicator.x = this.player.x;
      this.playerIndicator.y = this.player.y - 25;
    }

    if (this.playerSelectionRing && this.player) {
      this.playerSelectionRing.clear();
      this.playerSelectionRing.lineStyle(3, 0x00e5ff, 0.9);
      this.playerSelectionRing.strokeEllipse(
        this.player.x,
        this.player.y + 11,
        42,
        16,
      );
      this.playerSelectionRing.lineStyle(1, 0xffffff, 0.65);
      this.playerSelectionRing.strokeEllipse(
        this.player.x,
        this.player.y + 11,
        52,
        22,
      );
    }

    this.atualizarPoeiraDosPes(time);

    // === EFEITOS VISUAIS DO CHUTE ESPECIAL ===
    if (this.specialShotParticles) {
      this.specialShotParticles.clear();
      if (this.isSpecialPowerActive && this.player) {
        // Aura no jogador
        const t = time * 0.005;
        for (let i = 0; i < 8; i++) {
          const angle = t + (i * Math.PI) / 4;
          const dist = 35 + Math.sin(t * 2 + i) * 5;
          const px = this.player.x + Math.cos(angle) * dist;
          const py = this.player.y + Math.sin(angle) * dist;
          this.specialShotParticles.fillStyle(0xffa500, 0.6);
          this.specialShotParticles.fillCircle(px, py, 4);
        }
      }
    }

    if (this.ballFireParticles && this.ball) {
      this.ballFireParticles.clear();
      if (this.isSpecialPowerActive) {
        // Fogo na bola
        for (let i = 0; i < 12; i++) {
          const offX = (Math.random() - 0.5) * 20;
          const offY = (Math.random() - 0.5) * 20 - this.ball.z;
          const size = Math.random() * 8 + 4;
          this.ballFireParticles.fillStyle(0xff4500, 0.8);
          this.ballFireParticles.fillCircle(
            this.ball.x + offX,
            this.ball.y + offY,
            size,
          );
          this.ballFireParticles.fillStyle(0xffff00, 0.5);
          this.ballFireParticles.fillCircle(
            this.ball.x + offX * 0.5,
            this.ball.y + offY * 0.5,
            size * 0.6,
          );
        }
      }
    }

    // === ATUALIZAR HUD MODERNO ===
    if (this.staminaBar && this.player) {
      const fill = this.staminaBar.list[3];
      const valText = this.staminaBar.list[1];
      const curStam =
        this.player.currentStamina !== undefined
          ? this.player.currentStamina
          : this.player.stamina;
      const staminaPct = curStam / this.player.maxStamina;
      const barWidth = 150;

      fill.clear();
      let color = UIHelper.COLORS.SECONDARY;
      if (staminaPct < 0.5) color = UIHelper.COLORS.WARNING;
      if (staminaPct < 0.2) color = UIHelper.COLORS.DANGER;

      fill.fillStyle(color, 1);
      fill.fillRoundedRect(0, 0, barWidth * staminaPct, 6, 3);

      valText.setText(`${Math.floor(curStam)}/${this.player.maxStamina}`);
    }

    if (this.isSpectator) {
      const camW = this.cameras.main.width;
      if (!this.spectatorText) {
        this.spectatorText = this.add
          .text(camW - 20, 80, "MODO ASSISTIR", {
            fontSize: "12px",
            fill: "#00e5ff",
            fontStyle: "bold",
            fontFamily: "Impact",
          })
          .setOrigin(1, 0.5)
          .setScrollFactor(0)
          .setDepth(102);
        Perspectiva.tela(this.spectatorText);
      }
    }

    // === DRAW STAMINA CIRCLE ===
    if (this.staminaCircleGraphics) {
      this.staminaCircleGraphics.clear();

      const entitiesToDraw = [...this.allPlayers];
      if (this.gkTop) entitiesToDraw.push(this.gkTop);
      if (this.gkBottom) entitiesToDraw.push(this.gkBottom);

      entitiesToDraw.forEach((entity) => {
        const currentStam =
          entity.currentStamina !== undefined
            ? entity.currentStamina
            : entity.stamina;
        const maxStam = entity.maxStamina || 100;

        if (currentStam < maxStam) {
          const staminaPercent = currentStam / maxStam;
          const startAngle = -Math.PI / 2;
          const endAngle = startAngle + staminaPercent * Math.PI * 2;

          this.staminaCircleGraphics.lineStyle(4, 0x000000, 0.3);
          this.staminaCircleGraphics.beginPath();
          this.staminaCircleGraphics.arc(
            entity.x,
            entity.y,
            this.staminaCircleRadius,
            0,
            Math.PI * 2,
            false,
          );
          this.staminaCircleGraphics.strokePath();

          let color = 0x00ff00;
          if (staminaPercent < 0.5) color = 0xffff00;
          if (staminaPercent < 0.2) color = 0xff0000;

          this.staminaCircleGraphics.lineStyle(4, color, 1);
          this.staminaCircleGraphics.beginPath();
          this.staminaCircleGraphics.arc(
            entity.x,
            entity.y,
            this.staminaCircleRadius,
            startAngle,
            endAngle,
            false,
          );
          this.staminaCircleGraphics.strokePath();
        }
      });
    }

    // === DRAW KICK CHARGE BAR ===
    // O humano e os bots usam a MESMA barra: o wind-up da IA existia só na
    // matemática e o chute parecia sair do nada. Bot desenha menor e acima da
    // cabeça, para não competir com a barra de quem está jogando.
    if (this.kickChargeBarGraphics) {
      this.kickChargeBarGraphics.clear();

      if (
        this.player &&
        this.player.isChargingKick &&
        this.player.kickChargeTime >= this.minHoldForVisibleCharge
      ) {
        this.drawChargeBar(
          this.player,
          Math.min(this.player.kickChargeTime / this.player.maxKickChargeTime, 1),
          { y: this.player.y + 42, escala: 1 },
        );
      }

      (this.allPlayers || []).forEach((p) => {
        if (p === this.player || !p.isChargingKick) return;
        // Bot: o cheio é o wind-up dele (`targetChargeTime`), não o do humano.
        if (!p.targetChargeTime) return;
        this.drawChargeBar(
          p,
          Math.min(p.kickChargeTime / p.targetChargeTime, 1),
          { y: p.y - 52, escala: 0.62 },
        );
      });
    }

    // === UPDATE KICK CHARGE TIME ===
    if (this.player && this.player.isChargingKick) {
      this.player.kickChargeTime += delta;
    }

    this.updateAthleteNameLabels();
    this.updateMinimap();

    // === DETECÇÃO DE IMPACTO DO CHUTE ESPECIAL ===
    if (this.ball && this.ball.isSpecialPowerBall && this.allPlayers) {
      this.allPlayers.forEach((p) => {
        if (p === this.player) return; // Jogador que chutou não sofre impacto

        const dist = Phaser.Math.Distance.Between(
          this.ball.x,
          this.ball.y,
          p.x,
          p.y,
        );
        if (dist < 35 && p.stunTimer <= 0) {
          // Impacto!
          p.stunTimer = 1500; // 1.5s atordoado
          const angle = Phaser.Math.Angle.Between(
            this.ball.x,
            this.ball.y,
            p.x,
            p.y,
          );
          p.body.setVelocity(Math.cos(angle) * 300, Math.sin(angle) * 300);

          this.showFloatingText(p.x, p.y - 40, "💥 IMPACTO! 💥", "#ff4444");
          this.spawnImpactDust(p.x, p.y, 0xffaa00);
        }
      });

      // Impacto nos Goleiros
      const gks = [this.gkTop, this.gkBottom];
      gks.forEach((gk) => {
        if (gk) {
          const dist = Phaser.Math.Distance.Between(
            this.ball.x,
            this.ball.y,
            gk.x,
            gk.y,
          );
          if (dist < 45 && !gk.isStunned) {
            // Goleiro fica atordoado
            gk.stunTimer = 800;

            // Chance de 1/2 (50%) do goleiro ser arremessado e a bola passar
            if (Math.random() < 0.5) {
              this.showFloatingText(
                gk.x,
                gk.y - 40,
                "😱 ARREMESSO TOTAL! 😱",
                "#ff0000",
              );
              const impactAngle = Phaser.Math.Angle.Between(
                this.ball.x,
                this.ball.y,
                gk.x,
                gk.y,
              );

              // Arremessa o goleiro para longe
              gk.body.setVelocity(
                Math.cos(impactAngle) * 500,
                Math.sin(impactAngle) * 500,
              );

              // A bola perde pouca força e continua em frente (atravessa o goleiro)
              this.ball.customVx *= 0.85;
              this.ball.customVy *= 0.85;

              EfeitosVisuais.tremer(this, 300, 0.01);
            } else {
              this.showFloatingText(
                gk.x,
                gk.y - 40,
                "🧤 MÃO DE ALFACE! 🧤",
                "#ff8800",
              );
              EfeitosVisuais.tremer(this, 200, 0.005);
            }
          }
        }
      });
    }

    // === ATUALIZAR HABILIDADES ATIVAS ===
    if (this.player && this.player.specialties) {
      // Injetar especialidades da carreira se necessário
      const career = window.careerMode;
      if (career && career.specialties) {
        this.player.specialties.powerShot = career.specialties.powerShotSpecial;
      }

      // Input para Habilidade Especial (Tecla Q)
      if (Phaser.Input.Keyboard.JustDown(this.keys.q)) {
        if (
          this.player.specialties.powerShot &&
          this.player.activeSkillCooldowns.powerShot <= 0 &&
          this.player.currentStamina >= this.player.powerShotStaminaCost
        ) {
          // Ativar!
          this.player.activeSkillCooldowns.powerShot =
            this.player.powerShotCooldownMax;
          this.player.currentStamina -= this.player.powerShotStaminaCost;
          this.player.timeSinceLastStaminaUsed = 0;
          this.isSpecialPowerActive = true; // Ativar efeito visual

          this.showFloatingText(
            this.player.x,
            this.player.y - 60,
            "CARREGANDO CHUTE POTENTE!",
            UIHelper.STR_COLORS.GOLD,
          );
          this.cameras.main.flash(200, 255, 200, 0, 0.3);
        } else if (this.player.activeSkillCooldowns.powerShot > 0) {
          const cd = Math.ceil(
            this.player.activeSkillCooldowns.powerShot / 1000,
          );
          this.showFloatingText(
            this.player.x,
            this.player.y - 40,
            `RECUPERANDO (${cd}s)`,
            "#aaaaaa",
          );
        } else if (
          this.player.currentStamina < this.player.powerShotStaminaCost
        ) {
          this.showFloatingText(
            this.player.x,
            this.player.y - 40,
            "ESTAMINA INSUFICIENTE",
            UIHelper.STR_COLORS.DANGER,
          );
        }
      }
    }
  }

  // recordReplayFrame() / startReplay() / playNextReplayFrame() / stopReplay()
  // → js/scenes/GameScene.replay.js

  checkCollisions() {
    if (!this.ball || this.ball.owner) return;

    // Altura que o goleiro alcança. Vem de `GOALKEEPER` — os números viviam
    // cravados aqui (48/90) enquanto a constante existia sem ninguém ler.
    //
    // A dificuldade multiplica o alcance do goleiro ADVERSÁRIO. O do usuário
    // fica intocado: no fácil, um goleiro pior do lado dele seria punição.
    const alcanceDe = (gk) => {
      const base = gk.isJumping
        ? GOALKEEPER.REACH_JUMPING
        : GOALKEEPER.REACH_STANDING;
      const fator =
        typeof Dificuldade !== "undefined" && !gk.isPlayerTeam
          ? Dificuldade.fator("goleiro")
          : 1;
      return base * fator;
    };

    [this.gkTop, this.gkBottom].forEach((gk) => {
      if (!gk || gk.isHoldingBall) return;
      const dist = Phaser.Math.Distance.Between(
        this.ball.x,
        this.ball.y,
        gk.x,
        gk.y,
      );
      if (dist < GOALKEEPER.CATCH_DISTANCE && this.ball.z < alcanceDe(gk))
        gk.catchBall(this.ball);
    });
  }

  kickBall(pointer, forca = 22) {
    if (this.isGameOver) return;
    if (!this.ball) return;

    if (this.ball.owner === this.player) {
      this.kickBallFrom(this.player, pointer.worldX, pointer.worldY, forca);
      return;
    }
    // Sem a bola, o chute ESPERA por ela — mesma janela do passe. Antes o
    // comando simplesmente sumia, e chute de primeira era impossível: o
    // jogador tinha de acertar o frame exato em que a bola encostava no pé.
    this.queuedPass = {
      pointer: { worldX: pointer.worldX, worldY: pointer.worldY },
      chute: true,
      forca,
      em: this.time.now,
    };
  }

  /**
   * Força de um PASSE a partir da distância que ele precisa cobrir.
   *
   * O atrito é geométrico, então a bola percorre no máximo `v0/k` — e todo
   * passe do jogo saía abaixo disso: um toque de 200px partia a 246px/s e
   * morria aos 96px. Aqui a velocidade de saída é DERIVADA do atrito e do
   * tempo de viagem alvo, com piso alto (passe curto sai seco) e teto.
   *
   * `speedMult` é o multiplicador que o tipo de passe aplica depois; entra
   * dividindo para o resultado final cair no px/s pedido.
   */
  passForceFor(dist, speedMult = 1) {
    const k = -60 * Math.log(BALL_PHYSICS.FRICTION_GROUND);
    // A bola desacelera exponencialmente, então percorrer `d` custa exatamente
    // `(v0 - vChegada) / k`. Invertendo: a velocidade de saída que entrega a
    // bola AINDA ROLANDO no pé do companheiro.
    const paraChegarForte = dist * k + BALL_PHYSICS.PASS_ARRIVAL_SPEED_MIN;
    // E a que entrega dentro do tempo alvo, que ESCALA com a distância: o
    // toque curto é seco, o passe longo pode demorar. Tempo fixo pedia
    // impulsos absurdos no médio e a bola virava pedrada incontrolável.
    const paraChegarNoTempo =
      (dist * k) / (1 - Math.exp(-k * this.passTravelTimeTarget(dist)));
    const v = Phaser.Math.Clamp(
      Math.max(paraChegarForte, paraChegarNoTempo),
      BALL_PHYSICS.PASS_SPEED_MIN,
      BALL_PHYSICS.PASS_SPEED_MAX,
    );
    const paceScale = 0.9 * 0.95 * BALL_PHYSICS.KICK_SPEED_SCALE;
    return v / 60 / (speedMult * paceScale);
  }

  /**
   * Zoom da câmera pelo contexto do lance. Um alvo por frame, alcançado por
   * LERP: o corte seco de zoom é o que embrulha o estômago, não o zoom em si.
   */
  updateCameraZoom() {
    const cam = this.cameras.main;
    if (!cam || !this.ball) return;

    const vBola = this.ball.body
      ? this.ball.body.velocity.length()
      : Math.hypot((this.ball.customVx || 0) * 60, (this.ball.customVy || 0) * 60);

    // Terço final de QUALQUER um dos dois gols: perigo é perigo dos dois lados.
    const faixa = PITCH_WIDTH * CAMERA.DANGER_ZONE_PCT;
    const noPerigo =
      this.ball.x < PITCH_X + faixa || this.ball.x > PITCH_X + PITCH_WIDTH - faixa;

    let alvo = CAMERA.ZOOM_DEFAULT;
    if (vBola > CAMERA.FAST_BALL_SPEED) alvo = CAMERA.ZOOM_WIDE;
    else if (noPerigo) alvo = CAMERA.ZOOM_TIGHT;

    // `cam.zoom` aqui seria a média dos dois eixos, não o nível atual: ver
    // `Perspectiva.nivel`.
    Perspectiva.zoom(
      cam,
      Phaser.Math.Linear(Perspectiva.nivel(cam), alvo, CAMERA.LERP),
    );
  }

  /** Tempo de viagem que o passe PERSEGUE, proporcional à distância. */
  passTravelTimeTarget(dist) {
    return Phaser.Math.Clamp(
      dist * BALL_PHYSICS.PASS_TRAVEL_TIME_PER_PX,
      BALL_PHYSICS.PASS_TRAVEL_TIME_MIN_S,
      BALL_PHYSICS.PASS_TRAVEL_TIME_MAX_S,
    );
  }

  /**
   * Quanto a bola REALMENTE demora para cobrir `dist` — com o teto de
   * velocidade, nem sempre é o tempo alvo. É isso que o passe em profundidade
   * usa para prever onde o recebedor vai estar.
   */
  passTravelTime(dist) {
    const k = -60 * Math.log(BALL_PHYSICS.FRICTION_GROUND);
    const v0 = this.passForceFor(dist) * (0.9 * 0.95 * BALL_PHYSICS.KICK_SPEED_SCALE) * 60;
    const chegada = v0 - dist * k;
    if (chegada <= 1) return BALL_PHYSICS.PASS_TRAVEL_TIME_MAX_S;
    return Math.log(v0 / chegada) / k;
  }

  /** Barra de carga de chute. Mesma arte para humano e bot, só muda a escala. */
  drawChargeBar(entity, percent, { y, escala = 1 } = {}) {
    const g = this.kickChargeBarGraphics;
    if (!g) return;
    const w = this.kickChargeBarWidth * escala;
    const h = this.kickChargeBarHeight * escala;
    const barX = entity.x - w / 2;
    const barY = y !== undefined ? y : entity.y + 42;
    const m = 4 * escala;
    const r = 7 * escala;

    g.fillStyle(0x071018, 0.88);
    g.fillRoundedRect(barX - m, barY - m, w + m * 2, h + m * 2, r);
    g.fillStyle(0x26343f, 1);
    g.fillRoundedRect(barX, barY, w, h, 5 * escala);

    let cor = 0x00c853;
    if (percent > 0.45) cor = 0xfdd835;
    if (percent > 0.75) cor = 0xff8f00;
    if (percent >= 1.0) cor = 0xff1744;

    g.fillStyle(cor, 1);
    g.fillRoundedRect(barX, barY, w * percent, h, 5 * escala);

    g.lineStyle(2 * escala, 0xffffff, 0.85);
    g.strokeRoundedRect(barX - m, barY - m, w + m * 2, h + m * 2, r);
  }

  kickBallFrom(entity, targetX, targetY, kickForceOrCharge = 22, options = {}) {
    if (this.isGameOver) return;

    if (this.ball && this.ball.owner === entity) {
      // Garantir retorno para PLAYING em qualquer chute, especialmente se for reposição
      if (this.gameState !== GameStates.PLAYING) {
        this.gameState = GameStates.PLAYING;
        this.isSettingUpSetPiece = false; // Liberar detecção de saída novamente

        // Transição suave de câmera da bola de volta para o jogador
        this.cameras.main.stopFollow();

        // Pequeno delay para o jogador ver o início do chute (0.4s)
        this.time.delayedCall(400, () => {
          // Panorâmica suave até o jogador (duração de 1.2s para ser bem cinematográfico)
          this.cameras.main.pan(
            this.player.x,
            this.player.y,
            1200,
            "Cubic.easeInOut",
            false,
            (camera, progress) => {
              if (progress === 1) {
                // Ao terminar o pan, volta a seguir o jogador com lerp suave
                this.seguirCamera();
              }
            },
          );
        });
      }

      this.ball.owner = null;
      this.ball.stealCooldown = options.isPass ? 450 : 550;

      // Som do pé na bola. Ponto único, como o `kickAnimUntil`: passe,
      // cruzamento, chute a gol e bola parada passam todos por aqui.
      // A força que chega aqui é a mesma escala do `maxKickForce` das
      // entidades (PLAYER_ATTR.*_MAX_KICK_FORCE_COEF, ~13 a 22): normalizar por
      // ela é o que faz um toque soar diferente de uma bomba.
      Som.tocar(options.isPass ? "passe" : "chute", {
        forca: Phaser.Math.Clamp(kickForceOrCharge / 22, 0.25, 1),
      });

      let angle = Phaser.Math.Angle.Between(
        entity.x,
        entity.y,
        targetX,
        targetY,
      );

      if (
        entity === this.player &&
        entity.moveAngle !== undefined &&
        !options.usePointerDirection
      ) {
        angle = Phaser.Math.DegToRad(entity.moveAngle);
      }

      // --- NEW PASS TYPES HANDLING ---
      let finalTargetX = targetX;
      let finalTargetY = targetY;
      let vz = 0;
      // curveAmount vem do arrasto do mouse (drag-to-curve) e ainda pode ser
      // somado pelo cruzamento e pela skill curveBall.
      let curveAmount = options.curveAmount || 0;
      let finalForce = kickForceOrCharge;
      let ballSpeedMult = 1.0;

      const passType = options.passType || "normal";
      const isAttackingTop = !this.isSecondHalf;
      const isAttackingBottom = this.isSecondHalf;

      // Through Pass (Q): Ahead of receiver, more force
      if (passType === "through") {
        const dist = Phaser.Math.Distance.Between(
          entity.x,
          entity.y,
          targetX,
          targetY,
        );
        const throughOffset = 100; // Space ahead
        if (isAttackingTop) {
          finalTargetX = targetX - throughOffset;
        } else {
          finalTargetX = targetX + throughOffset;
        }
        ballSpeedMult = 1.2;
        finalForce = this.passForceFor(dist + throughOffset, ballSpeedMult);
      }
      // Cross (E): High arc towards goal area
      else if (passType === "cross") {
        const centerY = PITCH_Y + PITCH_HEIGHT / 2;
        const goalX = isAttackingTop
          ? PITCH_X + 100
          : PITCH_X + PITCH_WIDTH - 100;
        finalTargetX = goalX;
        finalTargetY = centerY + (Math.random() * 100 - 50); // Randomize a bit
        angle = Phaser.Math.Angle.Between(
          entity.x,
          entity.y,
          finalTargetX,
          finalTargetY,
        );
        const dist = Phaser.Math.Distance.Between(
          entity.x,
          entity.y,
          finalTargetX,
          finalTargetY,
        );
        ballSpeedMult = 1.1;
        finalForce = this.passForceFor(dist, ballSpeedMult);
        vz = 6 + finalForce * 0.2; // Lower cross height!
        // Add curve to cross
        curveAmount += 1.2;
      }
      // Short Pass / First Time (X): Low force
      else if (passType === "short") {
        const dist = Phaser.Math.Distance.Between(
          entity.x,
          entity.y,
          targetX,
          targetY,
        );
        ballSpeedMult = 1.0;
        finalForce = this.passForceFor(dist, ballSpeedMult);
        vz = 0;
      }
      // Normal Pass / Shot
      else {
        const dist = Phaser.Math.Distance.Between(
          entity.x,
          entity.y,
          targetX,
          targetY,
        );
        if (options.isPass || options.rawForce) {
          finalForce = this.passForceFor(dist, options.isPass ? 1.0 : 1.18);
        } else if (options.chargePercent !== undefined && entity.maxKickForce) {
          const chargePercent = Phaser.Math.Clamp(options.chargePercent, 0, 1);
          const minForce = entity.maxKickForce * 0.58;
          const maxForce = entity.maxKickForce * 1.14;
          finalForce = minForce + chargePercent * (maxForce - minForce);
        } else if (
          kickForceOrCharge > 50 &&
          entity.maxKickChargeTime &&
          entity.maxKickForce
        ) {
          const chargePercent = Math.min(
            kickForceOrCharge / entity.maxKickChargeTime,
            1.0,
          );
          const minForce = entity.maxKickForce * 0.55;
          const maxForce = entity.maxKickForce * 1.12;
          finalForce = minForce + chargePercent * (maxForce - minForce);
        } else if (entity.maxKickForce) {
          finalForce = Phaser.Math.Clamp(
            kickForceOrCharge,
            6,
            entity.maxKickForce * 1.15,
          );
        }
        ballSpeedMult = options.isPass ? 1.0 : 1.18;
      }

      // --- CALCULAR VELOCIDADE BASE ANTES DE MODIFICAR POR TIPO DE CHUTE ---
      const paceScale = 0.9 * 0.95 * BALL_PHYSICS.KICK_SPEED_SCALE;
      let vx = Math.cos(angle) * finalForce * ballSpeedMult * paceScale;
      let vy = Math.sin(angle) * finalForce * ballSpeedMult * paceScale;

      // Now handle kickType modifications (only if not a pass)
      if (!options.isPass && !options.passType) {
        const kickType = options.kickType || "normal";

        if (kickType === "low") {
          vx *= 1.25;
          vy *= 1.25;
          vz = 0;
        } else if (kickType === "chip") {
          vx *= 0.7;
          vy *= 0.7;
          vz = 6 + finalForce * 0.2;
        } else {
          const charge = options.chargePercent || 0.6;
          vz = 1.0 + finalForce * 0.12 + charge * 2.2;
        }
      }

      const pushOut = options.isPass ? 36 : 45;
      this.ball.x = entity.x + Math.cos(angle) * pushOut;
      this.ball.y = entity.y + Math.sin(angle) * pushOut;

      this.ball.body.enable = true;
      this.ball.body.reset(this.ball.x, this.ball.y);

      // --- APLICAÇÃO DE SKILLS (MODIFICADORES) ---
      const career = window.careerMode;

      if (entity === this.player && career) {
        // Clinical Finisher: Bônus se perto do gol
        const goalXSkill = isAttackingTop ? PITCH_X : PITCH_X + PITCH_WIDTH;
        const distToGoal = Phaser.Math.Distance.Between(
          entity.x,
          entity.y,
          goalXSkill,
          PITCH_Y + PITCH_HEIGHT / 2,
        );

        if (
          distToGoal < 400 &&
          career.skills.clinicalFinisher > 0 &&
          !options.isPass
        ) {
          finalForce *= 1 + career.skills.clinicalFinisher * 0.05;
          if (this.showFloatingText)
            this.showFloatingText(
              entity.x,
              entity.y - 20,
              "FINALIZADOR!",
              UIHelper.STR_COLORS.GOLD,
            );
        }

        // Chute Potente Especial (Habilidade Ativa)
        if (
          entity.activeSkillCooldowns &&
          entity.activeSkillCooldowns.powerShot > 0 &&
          !options.isPass
        ) {
          finalForce *= 1.5; // 50% mais força
          if (this.showFloatingText)
            this.showFloatingText(
              entity.x,
              entity.y - 40,
              "🔥 CHUTE POTENTE! 🔥",
              UIHelper.STR_COLORS.GOLD,
            );

          // Efeito visual extra (flash na bola)
          EfeitosVisuais.tremer(this, 100, 0.01);
        }

        // Bola Curva não soma curva fixa: o efeito é decidido pelo arrasto do
        // jogador, e a skill só destrava o teto (ver maxCurveForPlayer). Somar
        // aqui faria um chute mirado sem arrasto sair torto sozinho.
      }

      // Bola Curva: bônus de força SÓ quando o chute sai com efeito.
      // Escala vx/vy, não finalForce — finalForce já foi consumido no cálculo
      // da velocidade acima e a partir daqui só alimenta lastKickForce.
      if (entity === this.player && curveAmount !== 0) {
        const boost =
          1 + this.curveSkillLevel() * CURVE_SKILL.SPEED_BONUS_PER_LEVEL;
        vx *= boost;
        vy *= boost;
      }

      // Se a bola tiver o método applyImpulse (Z Falso), usamos ele
      if (this.ball.applyImpulse) {
        this.ball.applyImpulse(vx, vy, vz, curveAmount);
      } else {
        this.ball.customVx = vx;
        this.ball.customVy = vy;
      }

      // Pose de chute. Único ponto: passe, cruzamento, chute a gol e cobrança
      // de bola parada — de jogador ou de IA — passam todos por aqui.
      // Timestamp em vez de contador: sobrevive aos early-returns do update().
      entity.kickAnimUntil = this.time.now + KICK_ANIM_MS;

      this.ball.lastKicker = entity;
      this.ball.lastKickForce = finalForce * ballSpeedMult;

      // Pó do pé CONTRA a direção da bola, na medida da pancada. `22` é a
      // mesma escala que o som usa (PLAYER_ATTR.*_MAX_KICK_FORCE_COEF): um
      // toque de 3 e uma bomba de 22 deixam de ter o mesmo desenho.
      const potencia = Phaser.Math.Clamp(this.ball.lastKickForce / 22, 0.1, 1);
      this.spawnImpactDust(entity.x, entity.y + 8, 0xe6dfc4, {
        forca: potencia,
        angulo: Math.atan2(vy, vx) + Math.PI,
        abertura: 1.1,
        depth: 12,
      });
      if (!options.isPass && potencia >= FEEDBACK.CHUTE_TREMOR_MIN)
        EfeitosVisuais.tremer(this, 70, 0.002 + 0.003 * potencia);
      this.ball.lastKickAt = this.time.now;
      this.ball.lastKickType = options.isPass ? "pass" : "shot";
      this.lastTouchTeam = entity.isPlayerTeam ? "PLAYER" : "OPPONENT";
      this.lastTouch = entity;

      // Slow motion for shots
      if (!options.isPass && !options.passType) {
        this.time.timeScale = 0.4;
        this.time.delayedCall(500, () => {
          this.time.timeScale = 1.0;
        });
      }

      // Resetar poder especial após o chute
      if (entity === this.player && this.isSpecialPowerActive) {
        this.isSpecialPowerActive = false;
        this.ball.isSpecialPowerBall = true; // Marcar a bola para impacto

        // Timer para limpar o estado especial da bola se não bater em ninguém
        this.time.delayedCall(1500, () => {
          if (this.ball) this.ball.isSpecialPowerBall = false;
        });
      }
    }
  }

  // === SISTEMA DE CHUTE ===

  executPass(pointer, passType = "normal") {
    if (this.isGameOver) return;
    if (!this.ball) return;
    this.cancelKickCharge();
    this.gamepadCharging = false;

    if (this.ball.owner !== this.player) {
      // BUFFER DE INPUT: guarda o pedido com HORA. Sem o carimbo, um comando
      // dado dez segundos antes disparava quando a bola enfim chegasse, e o
      // boneco fazia algo que ninguém mais estava pedindo.
      this.queuedPass = {
        pointer: { worldX: pointer.worldX, worldY: pointer.worldY },
        passType: passType,
        em: this.time.now,
      };
      return;
    }

    if (this.player.currentStamina < this.player.passStaminaCost) {
      this.showFloatingText(
        this.player.x,
        this.player.y - 40,
        "Sem stamina",
        "#ffcc00",
      );
      return;
    }

    this.player.currentStamina -= this.player.passStaminaCost;
    this.player.timeSinceLastStaminaUsed = 0;

    const best = this.findBestPlayerPassTarget(
      pointer.worldX,
      pointer.worldY,
      passType,
    );
    let passTargetX = pointer.worldX;
    let passTargetY = pointer.worldY;
    let passReceiver = null;

    if (best) {
      passReceiver = best.ally;
      passTargetX = best.x;
      passTargetY = best.y;
    }

    const dist = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      passTargetX,
      passTargetY,
    );

    // Força baseada no tipo de passe
    let passForce;
    if (passType === "through") {
      passForce = Phaser.Math.Clamp(dist * 0.035, 12, 20);
    } else if (passType === "cross") {
      passForce = Phaser.Math.Clamp(dist * 0.03, 10, 18);
    } else if (passType === "short") {
      passForce = Phaser.Math.Clamp(dist * 0.025, 6, 12);
    } else {
      passForce = Phaser.Math.Clamp(dist * 0.03, 8.5, 14.5);
    }

    this.kickBallFrom(this.player, passTargetX, passTargetY, passForce, {
      isPass: true,
      rawForce: true,
      usePointerDirection: true,
      passType: passType,
    });

    this.matchStats.passes += 1;
    this.updateMatchRating(0.1, "Tentativa de Passe");

    if (passReceiver) {
      this.showFloatingText(
        this.player.x,
        this.player.y - 40,
        "Passe Direcionado",
        "#00e676",
      );
    } else {
      this.showFloatingText(
        this.player.x,
        this.player.y - 40,
        "Passe Manual",
        "#b3e5fc",
      );
    }
  }

  findBestPlayerPassTarget(cursorX, cursorY, passType = "normal") {
    if (!this.allies || this.allies.length === 0) return null;

    let best = null;
    let bestScore = -99999;
    const attackDir = this.isSecondHalf ? 1 : -1;

    // Fator de previsão: maior para passes em profundidade
    const predictionFactor =
      passType === "through" ? 20 : passType === "cross" ? 12 : 10;

    this.allies.forEach((ally) => {
      const distFromPlayer = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        ally.x,
        ally.y,
      );
      if (distFromPlayer < 70 || distFromPlayer > 620) return;

      const cursorDist = Phaser.Math.Distance.Between(
        ally.x,
        ally.y,
        cursorX,
        cursorY,
      );
      const predictedX = Phaser.Math.Clamp(
        ally.x + (ally.body.velocity.x / 60) * predictionFactor,
        PITCH_X + 45,
        PITCH_X + PITCH_WIDTH - 45,
      );
      let predictedY = Phaser.Math.Clamp(
        ally.y + (ally.body.velocity.y / 60) * predictionFactor,
        PITCH_Y + 45,
        PITCH_Y + PITCH_HEIGHT - 45,
      );

      // Para passes em profundidade: adicionar um offset extra na direção do ataque
      if (passType === "through") {
        predictedY += attackDir * 60;
      }
      const passLine = new Phaser.Geom.Line(
        this.player.x,
        this.player.y,
        predictedX,
        predictedY,
      );
      let blocked = false;

      this.enemies.forEach((enemy) => {
        const blockRect = new Phaser.Geom.Rectangle(
          enemy.x - 24,
          enemy.y - 24,
          48,
          48,
        );
        if (Phaser.Geom.Intersects.LineToRectangle(passLine, blockRect))
          blocked = true;
      });

      let score = 500 - cursorDist;
      score += Phaser.Math.Clamp(distFromPlayer, 0, 400) * 0.45;
      const isAhead =
        attackDir === -1
          ? predictedY < this.player.y
          : predictedY > this.player.y;
      if (isAhead) score += 130;
      if (blocked) score -= 900;

      if (score > bestScore && (cursorDist < 180 || score > 180)) {
        bestScore = score;
        best = { ally, x: predictedX, y: predictedY };
      }
    });

    return best;
  }

  /**
   * PORTA ÚNICA da câmera de jogo. Sem ela, "seguir o jogador" estava cravado
   * em seis lugares (troca de jogador, expulsão, fim do pan do chute, fim do
   * replay, volta da rede) e qualquer modo novo de câmera duraria até a
   * próxima troca de jogador.
   *
   * Sem argumento, REAPLICA o modo atual — é assim que os pontos de "volta a
   * seguir" respeitam a escolha do jogador em vez de forçarem o boneco.
   */
  seguirCamera(modo) {
    if (modo) this.cameraAlvo = modo;
    const alvo = this.cameraAlvo === "bola" ? this.ball : this.player;
    if (!alvo || !this.cameras || !this.cameras.main) return;
    const lerp = this.cameraAlvo === "bola" ? CAMERA.LERP_BOLA : CAMERA.LERP_JOGADOR;
    this.cameras.main.startFollow(alvo, true, lerp, lerp);
  }

  /** Z: alterna entre seguir o boneco e seguir a bola. */
  alternarCamera() {
    if (this.isGameOver) return;
    this.seguirCamera(this.cameraAlvo === "bola" ? "jogador" : "bola");
    const alvo = this.cameraAlvo === "bola" ? this.ball : this.player;
    this.showFloatingText(
      alvo.x,
      alvo.y - 60,
      this.cameraAlvo === "bola" ? "CÂMERA: BOLA" : "CÂMERA: JOGADOR",
      "#7fd4ff",
    );
  }

  switchPlayer(targetPlayer = null) {
    // Only allow switching if controlMode is full
    if (this.controlMode !== "full") return;
    // PREVENT SWITCHING WHILE IN POSSESSION OF THE BALL
    if (this.ball.owner === this.player) return;

    let newPlayer = targetPlayer;

    if (!newPlayer) {
      // Cycle to next player in this.playerTeam!
      this.currentPlayerIndex =
        (this.currentPlayerIndex + 1) % this.playerTeam.length;
      newPlayer = this.playerTeam[this.currentPlayerIndex];
      // If it's the same player (only one player?), then return
      if (newPlayer === this.player) return;
    }

    // Now, find the index of newPlayer in this.playerTeam to keep track!
    this.currentPlayerIndex = this.playerTeam.indexOf(newPlayer);
    if (this.currentPlayerIndex === -1) this.currentPlayerIndex = 0;

    // Now swap isUserControlled flags!
    this.player.isUserControlled = false;
    newPlayer.isUserControlled = true;
    // Now, swap the reference!
    this.player = newPlayer;
    // Câmera pela porta única: se o jogador escolheu seguir a BOLA, trocar de
    // boneco não pode arrastá-la de volta para o boneco.
    this.seguirCamera();
    // Update indicator!
    this.playerIndicator.setPosition(this.player.x, this.player.y - 40);
    // Cancel any ongoing kick charge!
    this.cancelKickCharge();
  }

  startKickCharging(pointer) {
    if (this.isGameOver) return;
    if (!this.ball || this.ball.owner !== this.player) return;

    this.player.isChargingKick = true;
    this.player.kickChargeTime = 0;
    // Removido o setVelocity(0,0) imediato para permitir o clique de passe sem travar o jogador
  }

  cancelKickCharge() {
    if (!this.player) return;
    this.player.isChargingKick = false;
    this.player.kickChargeTime = 0;
    if (this.kickChargeBarGraphics) this.kickChargeBarGraphics.clear();
    if (this.dragCurveGraphics) this.dragCurveGraphics.clear();
  }

  executeChargedKick(pointer, curveAmount = 0) {
    if (this.isGameOver) return;
    if (!this.player.isChargingKick) return;
    if (!this.ball) return;
    // Soltou o chute com a bola CHEGANDO: o comando espera por ela (mesma
    // janela do passe). Antes ele era descartado em silêncio e chute de
    // primeira dependia de acertar o frame exato do domínio.
    if (this.ball.owner !== this.player) {
      this.queuedPass = {
        pointer: { worldX: pointer.worldX, worldY: pointer.worldY },
        chute: true,
        forca: 22,
        em: this.time.now,
      };
      this.cancelKickCharge();
      return;
    }

    if (this.player.currentStamina < this.player.kickStaminaCost) {
      this.cancelKickCharge();
      this.showFloatingText(
        this.player.x,
        this.player.y - 40,
        "Sem stamina",
        "#ffcc00",
      );
      return;
    }

    this.player.currentStamina -= this.player.kickStaminaCost;
    this.player.timeSinceLastStaminaUsed = 0;

    // Piso de carga: clique curto no esquerdo é CHUTE fraco, não um toque
    // morto. Sem isto o release rápido saía com força ~0 e parecia um passe
    // falhado — que é justamente o que o botão esquerdo deixou de fazer.
    const chargePercent = Phaser.Math.Clamp(
      this.player.kickChargeTime / this.player.maxKickChargeTime,
      INPUT_CONFIG.MIN_KICK_CHARGE_PCT ?? 0.25,
      1.0,
    );

    // Detectar modificadores de teclas para tipos de chute
    const isLowKick = this.player.keys.space.isDown;
    const isChipShot = this.player.keys.c.isDown;

    let kickType = "normal";
    if (isLowKick) kickType = "low";
    else if (isChipShot) kickType = "chip";

    // Chute direcionado para onde o mouse foi solto (conforme diretriz)
    this.kickBallFrom(this.player, pointer.worldX, pointer.worldY, 0, {
      chargePercent,
      usePointerDirection: true,
      kickType: kickType,
      curveAmount,
    });

    this.matchStats.shots += 1;

    let label = "Chute";
    let color = "#ffaa00";
    if (kickType === "low") {
      label = "Rasteiro";
      color = "#ffffff";
    } else if (kickType === "chip") {
      label = "Cavadinha";
      color = "#00ffff";
    }

    this.showFloatingText(
      this.player.x,
      this.player.y - 40,
      `${label} ${(chargePercent * 100).toFixed(0)}%`,
      color,
    );
    this.updateMatchRating(0.2, "Chute Realizado");

    this.cancelKickCharge();
  }

  handleGoal(goalSide) {
    if (this.isResetting || this.isGameOver) return;
    this.isResetting = true;

    // No 1º tempo: Jogador ataca TOP (goalSide === "top")
    // No 2º tempo: Jogador ataca BOTTOM (goalSide === "bottom")
    const isPlayerTeamScored =
      (!this.isSecondHalf && goalSide === "top") ||
      (this.isSecondHalf && goalSide === "bottom");

    // Rede primeiro, estádio depois: é a ordem em que se ouve na arquibancada.
    Som.tocar("rede");
    Som.explodirTorcida(isPlayerTeamScored);

    // O gol precisa PESAR. Congelar por um instante quem está em campo é o que
    // o replay sozinho não entrega: ele mostra de novo, mas não marca o
    // momento. Mesmo hitstop do roubo de bola, um pouco mais longo.
    // Congela só o AUTOR, nunca pela porta do `applyHitStop`: ela guarda e
    // devolve a velocidade da BOLA 110ms depois, e nesse meio tempo o gol já
    // repôs a bola no meio — a devolução mandaria a bola parada disparar
    // sozinha. Aqui o congelamento é do boneco e mais nada.
    const autor = this.lastTouch;
    if (autor) {
      autor.hitStopTimer = GAME_FEEL.GOAL_HITSTOP_MS;
      autor.setTint(0xffffff);
    }
    EfeitosVisuais.tremer(this, GAME_FEEL.GOAL_SHAKE_MS, GAME_FEEL.GOAL_SHAKE_INTENSITY);

    if (isPlayerTeamScored) {
      this.scorePlayer += 1;

      if (this.lastTouch === this.player) {
        this.matchStats.goals += 1;
        this.showFloatingText(
          this.player.x,
          this.player.y - 60,
          "+ XP (Golo!)",
          "#ffd700",
        );
        this.updateMatchRating(1.0, "Golo Marcado");
      } else {
        if (
          this.penultimateTouch === this.player &&
          this.lastTouch &&
          this.lastTouch.isPlayerTeam
        ) {
          this.matchStats.assists += 1;
          this.showFloatingText(
            this.player.x,
            this.player.y - 60,
            "+ XP (Assistência!)",
            "#00ffff",
          );
          this.updateMatchRating(0.7, "Assistência");
        }
      }

      // MELHORIA: Flash de tela e texto de GOL para o time do jogador
      this.showGoalCelebration("GOOOL!", 0x00aa00);
    } else {
      this.scoreOpponent += 1;
      // Flash vermelho para gol sofrido
      this.showGoalCelebration("GOL SOFRIDO", 0xaa0000);
    }

    this.updateHUD(); // Use the DOM update function to refresh the score

    this.lastTouch = null;
    this.penultimateTouch = null;

    // Acionar Replay após a celebração inicial
    this.time.delayedCall(1200, () => {
      this.startReplay();
    });
  }

  // === NOVO: Celebração visual de gol ===
  showGoalCelebration(message, flashColor) {
    if (!this.goalFlash || !this.goalText) return;

    // Flash de tela
    this.goalFlash.setFillStyle(flashColor, 0.6);
    this.tweens.add({
      targets: this.goalFlash,
      alpha: { from: 0.6, to: 0 },
      duration: 800,
      ease: "Quad.easeOut",
    });

    // Texto de gol
    this.goalText.setText(message);
    this.goalText.setAlpha(1);
    this.tweens.add({
      targets: this.goalText,
      y: {
        from: this.cameras.main.height / 2,
        to: this.cameras.main.height / 2 - 60,
      },
      alpha: { from: 1, to: 0 },
      duration: 1400,
      ease: "Quad.easeOut",
    });
  }

  /**
   * Posto de recomeço número `i`, em offset do meio de campo (o eixo do ataque
   * é X). Volta ao começo da lista se pedirem mais gente do que há posto — dois
   * juntos é feio, `undefined` derruba o frame.
   */
  postoRecomeco(i) {
    const postos = [
      { dx: 100, dy: 0 },
      { dx: 300, dy: 0 },
      { dx: 150, dy: -250 },
      { dx: 150, dy: 250 },
    ];
    return postos[i % postos.length];
  }

  resetMatch() {
    if (this.isGameOver) return;

    // Campo deitado: a profundidade das formações corre em X (gols na esquerda
    // e na direita); as alas se separam em Y.
    const cx = PITCH_X + PITCH_WIDTH / 2;
    const cy = PITCH_Y + PITCH_HEIGHT / 2;
    // 1º tempo o jogador defende a DIREITA e ataca a ESQUERDA; no 2º tempo inverte.
    const playerDir = this.isSecondHalf ? -1 : 1;
    const enemyDir = -playerDir;

    // Quem recomeça é QUEM ESTÁ EM CAMPO. Nada de `allies[2]`/`enemies[3]`
    // fixo: uma expulsão encurta a lista e o índice vira
    // `undefined.setPosition` — o jogo caía no gol seguinte. A fonte é
    // `allPlayers`, a MESMA lista que o `update()` percorre.
    const recolocar = (lista, dir) =>
      lista.forEach((p, i) => {
        const posto = this.postoRecomeco(i);
        p.setPosition(cx + dir * posto.dx, cy + posto.dy);
      });

    const meuTime = this.allPlayers.filter((p) => p.isPlayerTeam);
    // O boneco controlado abre a fila do time dele: é ele que sai jogando.
    recolocar(
      meuTime.includes(this.player)
        ? [this.player, ...meuTime.filter((p) => p !== this.player)]
        : meuTime,
      playerDir,
    );
    recolocar(
      this.allPlayers.filter((p) => !p.isPlayerTeam),
      enemyDir,
    );

    if (this.allPlayers) {
      this.allPlayers.forEach((p) => {
        if (p.customVel) p.customVel.set(0, 0);
        p.setVelocity(0, 0);
        // Resetar estados de chute/dash ao reposicionar
        if (p.isChargingKick !== undefined) p.isChargingKick = false;
        if (p.kickChargeTime !== undefined) p.kickChargeTime = 0;
        if (p.isDashing !== undefined) p.isDashing = false;
        if (p.dashTimer !== undefined) p.dashTimer = 0;
        if (p.stunTimer !== undefined) p.stunTimer = 0;
      });
    }

    if (this.gkTop) this.gkTop.resetGK();
    if (this.gkBottom) this.gkBottom.resetGK();

    this.ball.body.enable = true;
    this.ball.setPosition(
      PITCH_X + PITCH_WIDTH / 2,
      PITCH_Y + PITCH_HEIGHT / 2,
    );
    this.ball.body.setVelocity(0, 0);
    this.ball.customVx = 0;
    this.ball.customVy = 0;
    this.ball.z = 0; // Garantir que a bola comece no chão
    this.ball.vz = 0;

    this.ball.owner = null;
    this.ball.stealCooldown = 0;

    this.lastTouch = null;
    this.penultimateTouch = null;
    this.lastTouchTeam = null;

    this.isResetting = false;
    this.isSettingUpSetPiece = false;
    this.gameState = GameStates.PLAYING;
  }

  // === FEEDBACK VISUAL ===

  // createMinimap() / updateMinimap() → js/scenes/GameScene.render.js

  assignRealPlayerNames(playerTeamName, opponentTeamName) {
    const career = window.careerMode;
    const playerLine = window.getLinePlayers
      ? window.getLinePlayers(playerTeamName)
      : [];
    const opponentLine = window.getLinePlayers
      ? window.getLinePlayers(opponentTeamName)
      : [];

    this.player.athleteName = career ? career.playerName : "Jogador";
    this.player.realPlayerData = {
      name: this.player.athleteName,
      position: career?.position || "Meia",
      isUser: true,
    };

    this.allies.forEach((ally, index) => {
      const data = playerLine[index] || {
        name: `Companheiro ${index + 1}`,
        position: "MID",
      };
      ally.athleteName = data.name;
      ally.realPlayerData = data;
    });

    this.enemies.forEach((enemy, index) => {
      const data = opponentLine[index] || {
        name: `Rival ${index + 1}`,
        position: "FWD",
      };
      enemy.athleteName = data.name;
      enemy.realPlayerData = data;
    });

    this.createAthleteNameLabels();
  }

  assignGoalkeeperNames(playerTeamName, opponentTeamName) {
    const playerGk = window.getGoalkeeper
      ? window.getGoalkeeper(playerTeamName)
      : null;
    const opponentGk = window.getGoalkeeper
      ? window.getGoalkeeper(opponentTeamName)
      : null;
    if (this.gkBottom) {
      this.gkBottom.athleteName = playerGk?.name || "Goleiro";
      this.gkBottom.realPlayerData = playerGk;
      // No 1º tempo o gkBottom é do time do jogador. No 2º tempo, eles trocam.
      // Mas o objeto gkBottom SEMPRE representa quem está fisicamente no fundo.
      // Por isso, precisamos atrelar a propriedade isPlayerTeam corretamente.
      this.gkBottom.isPlayerTeam = !this.isSecondHalf;
    }
    if (this.gkTop) {
      this.gkTop.athleteName = opponentGk?.name || "Goleiro Rival";
      this.gkTop.realPlayerData = opponentGk;
      this.gkTop.isPlayerTeam = this.isSecondHalf;
    }
    this.createAthleteNameLabels();
  }

  createAthleteNameLabels() {
    if (!this.add) return;
    if (this.athleteNameLabels) {
      this.athleteNameLabels.forEach((label) => label.destroy());
    }
    const entities = [...(this.allPlayers || [])];
    if (this.gkTop) entities.push(this.gkTop);
    if (this.gkBottom) entities.push(this.gkBottom);
    this.athleteNameLabels = entities.map((entity) => {
      const fill =
        entity.isPlayerTeam || entity === this.gkBottom ? "#9fffd0" : "#ffd0d0";
      const label = this.add
        .text(entity.x, entity.y - 34, entity.athleteName || "Jogador", {
          fontSize: "12px",
          fill,
          fontFamily: "Inter, Arial, sans-serif",
          stroke: "#000000",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(35);
      Perspectiva.reta(label);
      label.targetEntity = entity;

      return label;
    });
  }

  updateAthleteNameLabels() {
    if (!this.athleteNameLabels) return;
    this.athleteNameLabels.forEach((label) => {
      const entity = label.targetEntity;
      if (!entity || !entity.active) return;
      label.setPosition(entity.x, entity.y - 34);

      // As tiras de cartão andam junto, centradas acima do nome.
      const marcas = entity.cardMarks;
      if (!marcas || marcas.length === 0) return;
      const passo = CARD_HUD.W + CARD_HUD.GAP;
      marcas.forEach((m, i) =>
        m.setPosition(
          entity.x + (i - (marcas.length - 1) / 2) * passo,
          entity.y - CARD_HUD.Y_OFFSET,
        ),
      );
    });
  }

  // showFloatingText() / spawnImpactDust() → js/scenes/GameScene.hud.js

  updateMatchRating(delta, reason = "") {
    this.playerMatchRating = Math.max(
      1.0,
      Math.min(10.0, this.playerMatchRating + delta),
    );
    this.updateHUD(); // Use the DOM update function

    if (reason) {
      console.log(
        `[Match Rating] ${reason}: ${delta > 0 ? "+" : ""}${delta} → ${this.playerMatchRating.toFixed(1)}`,
      );
    }
  }

  // updateTimer() → js/scenes/GameScene.hud.js

  startSecondHalf() {
    this.isSecondHalf = true;
    this.timeLeft = this.halfDuration;
    this.updateHUD(); // Use the DOM update function

    // MELHORIA: aviso visual de início do segundo tempo
    this.showGoalCelebration("2º TEMPO", 0x0055aa);

    this.time.delayedCall(800, () => {
      this.resetMatch();
    });
  }

  endGame() {
    this.isGameOver = true;
    // A súmula viaja DENTRO de `matchStats` de propósito: ele já é repassado
    // inteiro por `PenaltyShootoutScene` e `EndGameScene`, e um campo novo solto
    // no `data` seria mais um a esquecer de repassar (já aconteceu aqui).
    this.matchStats.cartoesAmarelos = this._cartoesAmarelos || 0;
    this.matchStats.cartaoVermelho = !!this._cartaoVermelho;
    this.matchStats.faltasSofridas = this._faltasSofridas || 0;
    this.ball.body.setVelocity(0, 0);
    if (this.player.customVel) this.player.customVel.set(0, 0);
    // Tira o HUD na hora; o mesmo teardown roda de novo no shutdown da cena.
    this._teardownDOM();

    // Verificar se é empate em mata-mata (copa, mundial, libertadores, etc)
    const isKnockoutMatch =
      this.matchType === "copa" ||
      this.matchType === "mundial" ||
      this.matchType === "libertadores";
    const isDraw = this.scorePlayer === this.scoreOpponent;

    this.time.delayedCall(GAME_FEEL.ENDGAME_DELAY_MS, () => {
      if (isKnockoutMatch && isDraw && !this.isExhibition) {
        // Disputa de pênaltis (apenas em carreira)
        this.scene.start("PenaltyShootoutScene", {
          playerScore: this.scorePlayer,
          opponentScore: this.scoreOpponent,
          opponent: this.opponent,
          matchStats: this.matchStats,
          matchRating: this.playerMatchRating,
          matchType: this.matchType,
          lineupStatus: this.lineupStatus,
        });
      } else {
        // Fim de jogo normal
        this.scene.start("EndGameScene", {
          playerScore: this.scorePlayer,
          opponentScore: this.scoreOpponent,
          opponent: this.opponent,
          matchStats: this.matchStats,
          matchRating: this.playerMatchRating,
          matchType: this.matchType || "brasileirao",
          lineupStatus: this.lineupStatus || "starter",
          isExhibition: this.isExhibition,
          // Partida de LAN: o cliente de rede segue vivo para a revanche.
          lan: this.lan || null,
        });
      }
    });
  }

  // drawPitch() / drawGrandstands() / createGoals() / createPost() / createNet()
  // → js/scenes/GameScene.render.js

  checkOutOfBounds() {
    if (
      this.gameState !== GameStates.PLAYING ||
      this.isResetting ||
      this.isSettingUpSetPiece
    )
      return;

    const b = this.ball;
    // Removida restrição de altura: agora detecta saída mesmo se a bola estiver voando alto

    // --- REGRA 1: LATERAL (THROW-IN) — campo deitado: as laterais são em Y ---
    if (b.y < PITCH_Y || b.y > PITCH_Y + PITCH_HEIGHT) {
      this.isSettingUpSetPiece = true; // Trava para evitar múltiplas detecções
      const possessionTeam =
        this.lastTouchTeam === "PLAYER" ? "OPPONENT" : "PLAYER";
      this.setupSetPiece(
        GameStates.THROW_IN,
        b.y < PITCH_Y ? "upper" : "lower",
        possessionTeam,
      );
      return;
    }

    // --- REGRAS DE LINHA DE FUNDO (agora em X: gols na esquerda/direita) ---
    if (b.x < PITCH_X || b.x > PITCH_X + PITCH_WIDTH) {
      const isTopEnd = b.x < PITCH_X; // "top" = gol da esquerda
      const centerY = PITCH_Y + PITCH_HEIGHT / 2;
      const CROSSBAR_HEIGHT = 45; // Altura do travessão

      // SE ESTIVER NA DIREÇÃO DO GOL
      if (b.y > centerY - GOAL_WIDTH / 2 && b.y < centerY + GOAL_WIDTH / 2) {
        // Se a bola passar ACIMA do travessão, é Tiro de Meta ou Escanteio (não é gol)
        if (b.z > CROSSBAR_HEIGHT) {
          // Continua para processar como saída de fundo normal abaixo
        } else {
          // Deixa o sensor de gol resolver se estiver abaixo do travessão
          return;
        }
      }

      this.isSettingUpSetPiece = true; // Trava para evitar múltiplas detecções

      // Determinar qual time defende este lado do campo
      // No 1º tempo: Jogador defende BOTTOM, Oponente defende TOP.
      // No 2º tempo: Jogador defende TOP, Oponente defende BOTTOM.
      let defendingTeam;
      if (isTopEnd) {
        defendingTeam = this.isSecondHalf ? "PLAYER" : "OPPONENT";
      } else {
        defendingTeam = this.isSecondHalf ? "OPPONENT" : "PLAYER";
      }

      const lastTouchTeam = this.lastTouchTeam || "PLAYER"; // Fallback seguro

      if (lastTouchTeam === defendingTeam) {
        // --- REGRA 3: ESCANTEIO (CORNER KICK) ---
        // A bola cruza a linha de fundo e o lastTouchTeam foi o time DEFENSOR.
        // A posse vai para o time ATACANTE (oposto ao defensor).
        const attackingTeam =
          defendingTeam === "PLAYER" ? "OPPONENT" : "PLAYER";
        this.setupSetPiece(
          GameStates.CORNER_KICK,
          isTopEnd ? "top" : "bottom",
          attackingTeam,
        );
      } else {
        // --- REGRA 2: TIRO DE META (GOAL KICK) ---
        // A bola cruza a linha de fundo e o lastTouchTeam foi o time ATACANTE.
        // A posse vai para o time DEFENSOR.
        this.setupSetPiece(
          GameStates.GOAL_KICK,
          isTopEnd ? "top" : "bottom",
          defendingTeam,
        );
      }
    }
  }

  /**
   * Apita a falta: bola parada no ponto do contato, posse de quem sofreu.
   * O ponto vai em `_faltaPonto` porque o `setupSetPiece` só reposiciona
   * depois de 400ms de fade — até lá a bola ainda está colada no pé da vítima
   * e teria andado o campo inteiro.
   */
  chamarFalta(infrator, vitima, carrinho = false) {
    if (this.gameState !== GameStates.PLAYING || this.isSettingUpSetPiece)
      return;
    this.isSettingUpSetPiece = true;
    this._faltaPonto = { x: vitima.x, y: vitima.y };

    // Pênalti: falta do DEFENSOR dentro da própria área. Quem defende a
    // esquerda troca no intervalo — a conta é a mesma do `checkOutOfBounds`.
    const defendeEsquerda = infrator.isPlayerTeam
      ? this.isSecondHalf
      : !this.isSecondHalf;
    const penalti = this.dentroDaArea(vitima.x, vitima.y, defendeEsquerda);

    Som.tocar("apito");
    // Súmula do USUÁRIO: o que ele sofreu vira risco de lesão na carreira, e o
    // que ele cometeu vira cartão acumulado. "Usuário" é o boneco que está no
    // comando na hora — é o que ele fez com a bola no pé dele.
    if (vitima === this.player)
      this._faltasSofridas = (this._faltasSofridas || 0) + (carrinho ? 2 : 1);
    this.cartaoPor(infrator, carrinho);
    if (infrator === this.player)
      this.updateMatchRating(penalti ? -0.6 : -0.3, "Falta");
    this.showFloatingText(
      vitima.x,
      vitima.y - 40,
      penalti ? "PÊNALTI!" : "FALTA!",
      "#ff5555",
    );
    EfeitosVisuais.tremer(this, penalti ? 180 : 120, 0.005);
    this.setupSetPiece(
      penalti ? GameStates.PENALTY : GameStates.FREE_KICK,
      defendeEsquerda ? "top" : "bottom",
      vitima.isPlayerTeam ? "PLAYER" : "OPPONENT",
    );
  }

  /** A grande área de um dos lados — o MESMO retângulo desenhado no campo. */
  dentroDaArea(x, y, esquerda) {
    const cY = PITCH_Y + PITCH_HEIGHT / 2;
    if (Math.abs(y - cY) > GK_AREA_WIDTH / 2) return false;
    return esquerda
      ? x <= PITCH_X + GK_AREA_HEIGHT
      : x >= PITCH_X + PITCH_WIDTH - GK_AREA_HEIGHT;
  }

  /** Marca do pênalti, a mesma que o `drawPitch` pinta. */
  marcaPenalti(esquerda) {
    return {
      x: esquerda
        ? PITCH_X + GK_AREA_HEIGHT - 60
        : PITCH_X + PITCH_WIDTH - GK_AREA_HEIGHT + 60,
      y: PITCH_Y + PITCH_HEIGHT / 2,
    };
  }

  /**
   * Cartão por REINCIDÊNCIA (ver `FOUL.CARD_EVERY`) ou por ENTRADA DURA: falta
   * de carrinho é amarelo na hora, porque ali não houve disputa de bola. 2º
   * amarelo = vermelho. Falta comum, sozinha, não dá cartão — com um amarelo
   * por falta a partida vira chuva de cartão, que foi o que aconteceu.
   */
  cartaoPor(infrator, carrinho = false) {
    infrator.faltas = (infrator.faltas || 0) + 1;
    if (!carrinho && infrator.faltas % FOUL.CARD_EVERY !== 0) return;

    infrator.amarelos = (infrator.amarelos || 0) + 1;
    this.desenharCartoes(infrator);
    const vermelho = infrator.amarelos >= 2;
    Som.tocar("cartao", { vermelho });
    if (infrator === this.player) {
      if (vermelho) this._cartaoVermelho = true;
      else this._cartoesAmarelos = (this._cartoesAmarelos || 0) + 1;
    }
    this.showFloatingText(
      infrator.x,
      infrator.y - 58,
      vermelho ? "VERMELHO" : "AMARELO",
      vermelho ? "#ff2222" : "#ffd400",
    );
    if (!vermelho) return;
    // Em LAN o convidado endereça boneco por `lado_POSICAO` e não recebe evento
    // de expulsão: tirar um da lista só do lado do anfitrião deixaria um
    // fantasma parado no campo do outro. Fica no cartão até isso viajar no
    // pacote.
    if (!this.lan) this.expulsar(infrator);
  }

  /**
   * Tira o jogador de campo. NÃO destrói o sprite: referência solta (lastTouch,
   * dono de quadro do replay, colisor do create) continua por aí, e chamar
   * método em sprite destruído derruba o frame inteiro. Fora das listas, o
   * `update()` deixa de vê-lo.
   */
  /**
   * Uma tira amarela em pé por cartão, acima do nome. Recria a fileira inteira
   * a cada cartão em vez de acrescentar uma: são no máximo dois retângulos, e
   * assim a centralização sai de graça.
   */
  desenharCartoes(entity) {
    (entity.cardMarks || []).forEach((m) => m.destroy());
    entity.cardMarks = [];
    for (let i = 0; i < (entity.amarelos || 0); i++) {
      entity.cardMarks.push(
        // O cartão está DE PÉ acima do boneco, não deitado no gramado.
        Perspectiva.reta(
          this.add
            .rectangle(entity.x, entity.y, CARD_HUD.W, CARD_HUD.H, CARD_HUD.YELLOW)
            .setStrokeStyle(1, 0x000000)
            .setDepth(36),
        ),
      );
    }
    this.updateAthleteNameLabels();
  }

  expulsar(entity) {
    entity.expulso = true;
    const fora = (lista) => (lista || []).filter((p) => p !== entity);
    this.allPlayers = fora(this.allPlayers);
    this.allies = fora(this.allies);
    this.enemies = fora(this.enemies);
    this.playerTeam = fora(this.playerTeam);

    // Expulso o boneco controlado, o controle passa para quem sobrou — sem
    // `switchPlayer`, que recusa a troca em posse de bola e fora do modo full.
    if (entity === this.player && this.playerTeam.length > 0) {
      entity.isUserControlled = false;
      this.player = this.playerTeam[0];
      this.player.isUserControlled = true;
      this.currentPlayerIndex = 0;
      this.seguirCamera();
      this.cancelKickCharge();
    }

    if (this.ball.owner === entity) this.ball.owner = null;
    if (this.lastTouch === entity) this.lastTouch = null;

    // O que estava DESENHADO em cima dele sai junto: o rótulo de nome e as
    // tiras de cartão são objetos soltos da cena, e o loop que os move ignora
    // entidade inativa — ficariam parados no campo como fantasma.
    (entity.cardMarks || []).forEach((m) => m.destroy());
    entity.cardMarks = [];
    if (this.athleteNameLabels) {
      this.athleteNameLabels = this.athleteNameLabels.filter((label) => {
        if (label.targetEntity !== entity) return true;
        label.destroy();
        return false;
      });
    }

    // Vermelhos no placar, do lado certo.
    this.expulsos = this.expulsos || { PLAYER: 0, OPPONENT: 0 };
    this.expulsos[entity.isPlayerTeam ? "PLAYER" : "OPPONENT"] += 1;
    if (this.updateHUD) this.updateHUD();

    entity.setActive(false).setVisible(false);
    if (entity.body) entity.body.enable = false;
    entity.setPosition(-9999, -9999);
  }

  setupSetPiece(type, side, possessionTeam) {
    // 1. Iniciar Fade Out para esconder o teletransporte e reposicionamento
    this.cameras.main.fadeOut(GAME_FEEL.SETPIECE_FADE_OUT_MS, 0, 0, 0);

    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.gameState = type;
      this.isSettingUpSetPiece = true;

      this.ball.body.setVelocity(0, 0);
      this.ball.vz = 0;
      this.ball.z = 0;

      const centerX = PITCH_X + PITCH_WIDTH / 2;
      const centerY = PITCH_Y + PITCH_HEIGHT / 2;

      let spawnX = this.ball.x;
      let spawnY = this.ball.y;

      // Definir coordenadas de spawn (campo deitado)
      if (type === GameStates.THROW_IN) {
        spawnY = side === "upper" ? PITCH_Y : PITCH_Y + PITCH_HEIGHT;
      } else if (type === GameStates.CORNER_KICK) {
        spawnY =
          this.ball.y < PITCH_Y + PITCH_HEIGHT / 2
            ? PITCH_Y
            : PITCH_Y + PITCH_HEIGHT;
        spawnX = side === "top" ? PITCH_X : PITCH_X + PITCH_WIDTH;
      } else if (type === GameStates.GOAL_KICK) {
        spawnY = PITCH_Y + PITCH_HEIGHT / 2;
        spawnX = side === "top" ? PITCH_X + 40 : PITCH_X + PITCH_WIDTH - 40;
      } else if (type === GameStates.PENALTY) {
        const marca = this.marcaPenalti(side === "top");
        spawnX = marca.x;
        spawnY = marca.y;
        this._faltaPonto = null;
      } else if (type === GameStates.FREE_KICK) {
        const ponto = this._faltaPonto || { x: this.ball.x, y: this.ball.y };
        // ponytail: falta dentro da área vira tiro livre na LINHA da área, não
        // pênalti. Sem pênalti implementado, cobrar a 80px do gol com barreira
        // a 180px é gol certo. Se um dia entrar pênalti, é aqui que ele desvia.
        spawnX = Phaser.Math.Clamp(
          ponto.x,
          PITCH_X + GK_AREA_HEIGHT,
          PITCH_X + PITCH_WIDTH - GK_AREA_HEIGHT,
        );
        spawnY = Phaser.Math.Clamp(
          ponto.y,
          PITCH_Y + 60,
          PITCH_Y + PITCH_HEIGHT - 60,
        );
        this._faltaPonto = null;
      }

      this.ball.setPosition(spawnX, spawnY);
      this.ball.owner = null;
      this.ball.stealCooldown = 1500;

      // --- LÓGICA DE POSSE E TELETRANSPORTE DO BATEDOR ---
      const isPlayerTeamPossession = possessionTeam === "PLAYER";
      let candidates = isPlayerTeamPossession
        ? [this.player, ...this.allies]
        : [...this.enemies];

      // Incluir goleiros em tiros de meta
      if (type === GameStates.GOAL_KICK) {
        const gk = spawnX < WORLD_WIDTH / 2 ? this.gkTop : this.gkBottom;
        if (gk.isPlayerTeam === isPlayerTeamPossession) candidates.push(gk);
      }

      let closest = null;
      let minDist = 99999;
      candidates.forEach((c) => {
        const d = Phaser.Math.Distance.Between(c.x, c.y, spawnX, spawnY);
        if (d < minDist) {
          minDist = d;
          closest = c;
        }
      });

      if (closest) {
        const offsetX = spawnX > WORLD_WIDTH / 2 ? -45 : 45;
        const offsetY = spawnY > WORLD_HEIGHT / 2 ? -45 : 45;
        closest.setPosition(
          spawnX + (type !== GameStates.THROW_IN ? offsetX : 0),
          spawnY + (type === GameStates.THROW_IN ? offsetY : 0),
        );
        closest.setVelocity(0, 0);
        if (closest.customVel) closest.customVel.set(0, 0);

        this.ball.owner = closest;
        this.ball.stealCooldown = 3000;

        // Auto switch to set-piece taker if it's a player team player
        if (closest.isPlayerTeam && closest !== this.player) {
          this.switchPlayer(closest);
        }

        // Se o batedor for um goleiro, garantir que ele entre no estado de posse
        if (closest.isGoalkeeper) {
          closest.isHoldingBall = true;
          if (closest.repoTimer) {
            closest.repoTimer.remove();
            closest.repoTimer = null;
          }
        }
      }

      // --- POSICIONAMENTO TÁTICO ESPECÍFICO ---
      this.repositionPlayersForSetPiece(
        type,
        spawnX,
        spawnY,
        isPlayerTeamPossession,
      );

      // 2. Mover câmera instantaneamente para a bola (está em fade out)
      this.cameras.main.stopFollow();
      this.cameras.main.centerOn(spawnX, spawnY);
      this.cameras.main.startFollow(this.ball, true, 0.05, 0.05);

      // 3. Fade In para revelar o novo cenário
      this.cameras.main.fadeIn(GAME_FEEL.SETPIECE_FADE_IN_MS, 0, 0, 0);

      let label = "BOLA PARADA";
      if (type === GameStates.THROW_IN) label = "LATERAL";
      else if (type === GameStates.CORNER_KICK) label = "ESCANTEIO";
      else if (type === GameStates.GOAL_KICK) label = "TIRO DE META";
      else if (type === GameStates.FREE_KICK) label = "FALTA";
      else if (type === GameStates.PENALTY) label = "PÊNALTI";
      this.showFloatingText(spawnX, spawnY, label, "#ffffff");

      // IA cobrando após o fade in (Inimigos OU Aliados se o jogador não for o dono)
      if (closest && closest !== this.player) {
        this.time.delayedCall(GAME_FEEL.SETPIECE_AI_DELAY_MS, () => {
          if (
            this.gameState !== GameStates.PLAYING &&
            this.ball.owner === closest
          ) {
            // Se for aliado, chuta para frente
            // Se for inimigo, chuta para o centro/ataque
            let targetX = centerX;
            let targetY = centerY;
            // Pênalti não é reposição: a marca já está de frente para o gol
            // daquele lado, e cobrar para o meio de campo seria absurdo.
            if (type === GameStates.PENALTY) {
              targetX = spawnX < centerX ? PITCH_X : PITCH_X + PITCH_WIDTH;
              targetY = centerY + (Math.random() * 220 - 110);
            }

            this.kickBallFrom(closest, targetX, targetY, 18);
          }
        });
      }
    });
  }

  repositionPlayersForSetPiece(type, ballX, ballY, isPlayerTeamPossession) {
    const centerX = PITCH_X + PITCH_WIDTH / 2;
    const centerY = PITCH_Y + PITCH_HEIGHT / 2;

    this.allPlayers.forEach((p) => {
      if (this.ball.owner === p) return; // Não move o batedor

      let tx = p.x;
      let ty = p.y;

      const isAlly = p.isPlayerTeam;

      if (type === GameStates.CORNER_KICK) {
        // ESCANTEIO: Mais jogadores na área (gol atacado fica na esquerda ou direita)
        const attackingSide = ballX < centerX ? "left" : "right";
        const isAttacker =
          (isAlly && isPlayerTeamPossession) ||
          (!isAlly && !isPlayerTeamPossession);

        if (isAttacker) {
          // Atacantes: 3 na área, 1 na entrada, 1 atrás
          const rand = Math.random();
          if (rand < 0.6) {
            // 60% na área
            ty = centerY + (Math.random() * 250 - 125);
            tx =
              (attackingSide === "left"
                ? PITCH_X + 120
                : PITCH_X + PITCH_WIDTH - 120) +
              (Math.random() * 100 - 50);
          } else if (rand < 0.8) {
            // 20% entrada da área
            ty = centerY + (Math.random() * 400 - 200);
            tx =
              (attackingSide === "left"
                ? PITCH_X + 300
                : PITCH_X + PITCH_WIDTH - 300) +
              (Math.random() * 80 - 40);
          } else {
            // 20% segurança atrás
            ty = centerY + (Math.random() * 200 - 100);
            tx = centerX + (attackingSide === "left" ? 200 : -200);
          }
        } else {
          // Defensores: quase todos na área
          const rand = Math.random();
          if (rand < 0.8) {
            // 80% protegendo o gol
            ty = centerY + (Math.random() * 200 - 100);
            tx =
              (attackingSide === "left"
                ? PITCH_X + 80
                : PITCH_X + PITCH_WIDTH - 80) +
              (Math.random() * 80 - 40);
          } else {
            // 20% para contra-ataque
            ty = centerY + (Math.random() * 300 - 150);
            tx = centerX;
          }
        }
      } else if (type === GameStates.PENALTY) {
        // PÊNALTI: todo mundo fora da área e atrás da bola. Batedor e goleiro
        // são os únicos que ficam — o goleiro nem passa por aqui (não está em
        // `allPlayers`).
        const paraOMeio = ballX < centerX ? 1 : -1;
        tx = ballX + paraOMeio * (220 + Math.random() * 260);
        ty = centerY + (Math.random() * 500 - 250);
      } else if (type === GameStates.GOAL_KICK) {
        // TIRO DE META: Espalhamento tático
        const kickingLeft = ballX < centerX;
        const isKickingTeam =
          (isAlly && isPlayerTeamPossession) ||
          (!isAlly && !isPlayerTeamPossession);

        if (isKickingTeam) {
          // Time que cobra: abre o campo
          const side = Math.random() < 0.5 ? -1 : 1;
          const depth = Math.random();
          ty = centerY + side * (150 + Math.random() * 250);
          tx = ballX + (kickingLeft ? 1 : -1) * (200 + depth * 600);
        } else {
          // Time que defende: pressiona a saída
          ty = centerY + (Math.random() * 400 - 200);
          tx = ballX + (kickingLeft ? 1 : -1) * (450 + Math.random() * 300);
        }
      } else {
        // LATERAL: Aproxima do batedor mas mantém ocupação
        ty =
          ballY + (ballY < centerY ? 180 : -180) + (Math.random() * 100 - 50);
        tx = ballX + (Math.random() * 400 - 200);
      }

      // Garantir que fiquem dentro do campo
      tx = Phaser.Math.Clamp(tx, PITCH_X + 60, PITCH_X + PITCH_WIDTH - 60);
      ty = Phaser.Math.Clamp(ty, PITCH_Y + 60, PITCH_Y + PITCH_HEIGHT - 60);

      // Barreira mínima
      const minDist = 180;
      const dist = Phaser.Math.Distance.Between(tx, ty, ballX, ballY);
      if (dist < minDist) {
        const angle = Phaser.Math.Angle.Between(ballX, ballY, tx, ty);
        tx = ballX + Math.cos(angle) * (minDist + 20);
        ty = ballY + Math.sin(angle) * (minDist + 20);
      }

      p.setPosition(tx, ty);
      p.setVelocity(0, 0);
      if (p.customVel) p.customVel.set(0, 0);
    });
  }

  // ===========================================================================
  // MENU DE PAUSA (ESC)
  // ===========================================================================

  // Menu de pausa completo → js/scenes/GameScene.hud.js
  // _openPauseMenu() / _closePauseMenu() / _openSubstitutionMenu() /
  // _performSubstitution() / _openPauseMenuAfterSub() / _openConfigMenu() /
  // _quitToMenu()

  // `shutdown()`/`destroy()` como MÉTODO não são chamados pelo Phaser — ele
  // emite os eventos de mesmo nome. Era por isso que o placar ficava na tela:
  // o código de limpeza existia e nunca rodava. Agora quem escuta é o
  // `registerDOMTeardown()` (GameScene.hud.js), ligado no fim do create().
}

// =============================================================================
// Check: o passe TEM de chegar. Com atrito geométrico a bola percorre no máximo
// `v0/k`, e antes desta conta todo passe do jogo saía abaixo disso — um toque de
// 200px partia a 246px/s e morria aos 96px. Isso não aparece no console: aparece
// como "a IA passa para o adversário".
// =============================================================================
console.assert(
  (() => {
    if (typeof BALL_PHYSICS === "undefined" || typeof Phaser === "undefined")
      return true;
    // Ligado ao PRÓPRIO prototype: `passForceFor` chama métodos irmãos
    // (`passTravelTimeTarget`), e um `this` vazio explodia aqui no boot.
    const forca = GameScene.prototype.passForceFor.bind(GameScene.prototype);
    const k = -60 * Math.log(BALL_PHYSICS.FRICTION_GROUND);
    const pace = 0.9 * 0.95 * BALL_PHYSICS.KICK_SPEED_SCALE;
    // px/s que realmente saem do pé, já com o multiplicador do tipo de passe.
    const vDe = (d, mult = 1) => forca(d, mult) * mult * pace * 60;
    const alcance = (v) => v / k;

    // Velocidade e tempo COM QUE A BOLA CHEGA, para cada distância útil.
    const chegada = (d) => vDe(d) - d * k; // v0 - k*d, o resto da desaceleração
    const tempo = (d) => Math.log(vDe(d) / chegada(d)) / k;
    const uteis = [150, 300, AI_BEHAVIOR.PASS_RANGE_MAX];

    const curto = vDe(150);
    const medio = vDe(350);

    return (
      // Piso: passe curto sai seco, não empurrado.
      curto >= BALL_PHYSICS.PASS_SPEED_MIN - 0.001 &&
      // Mais longe = mais forte, até o TETO — que é rígido: acima dele a bola
      // é impossível de dominar, e aí é melhor demorar mais.
      medio > curto &&
      uteis.every((d) => vDe(d) <= BALL_PHYSICS.PASS_SPEED_MAX + 0.001) &&
      // O teto tem de caber o passe mais longo que a IA considera. É a relação
      // que quebra quando se aperta o teto ou o atrito sem mexer no alcance:
      // sem ela a IA mira em quem a bola nunca alcança e entrega a posse.
      alcance(BALL_PHYSICS.PASS_SPEED_MAX) > AI_BEHAVIOR.PASS_RANGE_MAX &&
      // Com isso valendo, todo passe útil CHEGA, ainda rolando.
      uteis.every((d) => chegada(d) > 0) &&
      // Tempo de viagem escalar: curto é seco, longo pode demorar — e nunca
      // passa do teto de tempo.
      tempo(150) < tempo(AI_BEHAVIOR.PASS_RANGE_MAX) &&
      uteis.every(
        (d) => tempo(d) <= BALL_PHYSICS.PASS_TRAVEL_TIME_MAX_S + 0.6,
      ) &&
      // O multiplicador do tipo de passe não muda a velocidade final.
      Math.abs(vDe(350, 1.2) - medio) < 0.001
    );
  })(),
  "GameScene: passe saindo fraco demais para cobrir a distância pedida",
);

// =============================================================================
// Check: arbitragem. Nada disso aparece no console quando quebra — aparece como
// "pênalti marcado no meio de campo" ou "ninguém é expulso nunca".
// =============================================================================
console.assert(
  (() => {
    if (typeof GK_AREA_HEIGHT === "undefined" || typeof FOUL === "undefined")
      return true;
    const dentro = GameScene.prototype.dentroDaArea;
    const marca = GameScene.prototype.marcaPenalti;
    const cY = PITCH_Y + PITCH_HEIGHT / 2;

    // Cartão: quatro faltas do MESMO jogador, com CARD_EVERY = 2.
    const gritos = [];
    const juiz = {
      lan: false,
      showFloatingText: (x, y, msg) => gritos.push(msg),
      expulsar: (e) => (e.expulso = true),
      desenharCartoes: () => {}, // o desenho é da cena viva, não do check
      cartaoPor: GameScene.prototype.cartaoPor,
    };
    const bot = { x: 0, y: 0 };
    for (let i = 0; i < 2 * FOUL.CARD_EVERY; i++) juiz.cartaoPor(bot);

    // Carrinho: amarelo na PRIMEIRA falta, sem esperar reincidência.
    const gritosCarrinho = [];
    const juizDoCarrinho = { ...juiz, showFloatingText: (x, y, m) => gritosCarrinho.push(m) };
    const entrador = { x: 0, y: 0 };
    juizDoCarrinho.cartaoPor(entrador, true);
    // E falta comum, sozinha, NÃO dá cartão — foi o que virou chuva de amarelo.
    const limpo = { x: 0, y: 0 };
    juizDoCarrinho.cartaoPor(limpo);

    return (
      // Área: dentro, fora pela profundidade, fora pela largura — e o lado
      // certo. A mesma conta erra silenciosamente se GK_AREA_WIDTH/HEIGHT
      // trocarem de papel (uma é o vão em Y, a outra a profundidade em X).
      dentro(PITCH_X + 100, cY, true) &&
      !dentro(PITCH_X + GK_AREA_HEIGHT + 10, cY, true) &&
      !dentro(PITCH_X + 100, cY + GK_AREA_WIDTH, true) &&
      dentro(PITCH_X + PITCH_WIDTH - 100, cY, false) &&
      !dentro(PITCH_X + PITCH_WIDTH - 100, cY, true) &&
      // A marca cai DENTRO da área que ela serve, e há uma de cada lado.
      dentro(marca(true).x, marca(true).y, true) &&
      dentro(marca(false).x, marca(false).y, false) &&
      marca(true).x < marca(false).x &&
      // Cartão: nada na 1ª falta, amarelo na 2ª, nada na 3ª, vermelho na 4ª.
      gritos.length === 2 &&
      gritos[0] === "AMARELO" &&
      gritos[1] === "VERMELHO" &&
      bot.faltas === 2 * FOUL.CARD_EVERY &&
      bot.expulso === true &&
      gritosCarrinho.join() === "AMARELO" &&
      entrador.amarelos === 1 &&
      !limpo.amarelos &&
      // Recomeço com time INCOMPLETO: expulsão encurta a lista e o índice fixo
      // (`enemies[3]`) virava `undefined.setPosition` no gol seguinte. Nenhum
      // índice pode faltar, e os quatro primeiros são postos distintos.
      (() => {
        const posto = GameScene.prototype.postoRecomeco;
        const oito = [0, 1, 2, 3, 4, 5, 6, 7].map(posto);
        const quatro = oito.slice(0, 4).map((p) => p.dx + "," + p.dy);
        return (
          oito.every((p) => p && Number.isFinite(p.dx) && Number.isFinite(p.dy)) &&
          new Set(quatro).size === 4
        );
      })()
    );
  })(),
  "GameScene: arbitragem fora do lugar (área do pênalti ou cartão)",
);

// =============================================================================
// Check: o BUFFER de input. Ele existe para o jogo responder ao que o jogador
// quis, não ao frame em que apertou — e o prazo existe para o boneco não
// executar, dez segundos depois, um comando que ninguém mais está pedindo.
// =============================================================================
console.assert(
  (() => {
    if (typeof GAME_FEEL === "undefined") return true;
    const dentro = GAME_FEEL.INPUT_BUFFER_MS;

    // A regra é a comparação de idade do pedido, isolada aqui.
    const valido = (idade) => idade <= dentro;

    return (
      // Uma janela existe e é curta: buffer longo vira "o boneco tem vida
      // própria"; curto demais não ajuda ninguém.
      dentro >= 80 &&
      dentro <= 400 &&
      valido(0) &&
      valido(dentro) &&
      !valido(dentro + 1) &&
      !valido(10000) &&
      // As esperas de bola parada encurtaram, mas não a ponto de o jogador não
      // ver o que aconteceu.
      GAME_FEEL.SETPIECE_FADE_OUT_MS >= 120 &&
      GAME_FEEL.SETPIECE_AI_DELAY_MS >= 400 &&
      GAME_FEEL.SETPIECE_AI_DELAY_MS < 1800 &&
      GAME_FEEL.ENDGAME_DELAY_MS < 1500
    );
  })(),
  "GameScene: janela do buffer de input ou ritmo da bola parada fora do lugar",
);
