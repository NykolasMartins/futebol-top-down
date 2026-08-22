// =============================================================================
// TrainingScene.js — v1.0
// Hub de 3 Mini-Games de Treino:
//   1. ShootingMiniGame  — Chute ao Alvo (30s)
//   2. DribbleMiniGame   — Domínio de Bola / Bobinho (60s)
//   3. SlalomMiniGame    — Circuito de Cones (tempo mínimo)
// =============================================================================

class TrainingScene extends Phaser.Scene {
  constructor() {
    super("TrainingScene");
  }

  init(data) {
    this.miniGame = data.miniGame || "ShootingMiniGame";
  }

  preload() {
    const playerAtlas = this._getTeamAtlasKey(window.careerMode?.currentTeam?.name);
    const markerAtlas = this._getTeamAtlasKey(this._getMarkerTeamName());

    [playerAtlas, markerAtlas].forEach(atlasKey => {
      if (!atlasKey) return;
      if (!this.textures.exists(atlasKey)) {
        const teamName = atlasKey.replace('_atlas', '');
        this.load.atlas(atlasKey, `assets/teams/${teamName}_atlas.png`, `assets/teams/${teamName}_atlas.json`);
      }
    });

    if (!this.textures.exists('ball_spritesheet')) {
      this.load.spritesheet('ball_spritesheet', 'assets/ball_spritesheet.png', { frameWidth: 128, frameHeight: 128 });
    }
  }

  _getTeamAtlasKey(teamName) {
    const safeTeamName = teamName || 'Flamengo';
    return `${safeTeamName}_atlas`;
  }

  _getMarkerTeamName() {
    const career = window.careerMode;
    const nextOpponent = career && career.getNextOpponent ? career.getNextOpponent() : null;
    const currentName = career?.currentTeam?.name || 'Flamengo';
    return nextOpponent && nextOpponent.name !== currentName ? nextOpponent.name : 'Flamengo';
  }

  _ensureTrainingAnimations(atlasKey) {
    if (!atlasKey || !this.textures.exists(atlasKey)) return;
    const directions = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    directions.forEach(dir => {
      const idleKey = `${atlasKey}_idle_${dir}`;
      const runKey = `${atlasKey}_run_${dir}`;
      const idleFrame = `idle_${dir}`;
      const runFrame0 = `run_${dir}_0`;

      if (!this.anims.exists(idleKey) && this.textures.get(atlasKey).has(idleFrame)) {
        this.anims.create({ key: idleKey, frames: [{ key: atlasKey, frame: idleFrame }], frameRate: 1 });
      }

      if (!this.anims.exists(runKey) && this.textures.get(atlasKey).has(runFrame0)) {
        const frames = [];
        for (let i = 0; i < 4; i++) {
          const frameName = `run_${dir}_${i}`;
          if (this.textures.get(atlasKey).has(frameName)) frames.push({ key: atlasKey, frame: frameName });
        }
        if (frames.length > 0) this.anims.create({ key: runKey, frames, frameRate: 10, repeat: -1 });
      }
    });
  }

  _ensureBallAnimation() {
    if (this.textures.exists('ball_spritesheet') && !this.anims.exists('training_ball_rotate')) {
      this.anims.create({
        key: 'training_ball_rotate',
        frames: this.anims.generateFrameNumbers('ball_spritesheet', { start: 0, end: 63 }),
        frameRate: 30,
        repeat: -1,
      });
    }
  }

  _createTrainingPlayer(x, y, teamName = null, scale = 1) {
    const atlasKey = this._getTeamAtlasKey(teamName || window.careerMode?.currentTeam?.name);
    this._ensureTrainingAnimations(atlasKey);
    const sprite = this.add.sprite(x, y, atlasKey, 'idle_south').setDepth(20);
    sprite.setDisplaySize(48 * scale, 48 * scale);
    sprite._trainingAtlasKey = atlasKey;
    sprite._trainingFacing = 'south';
    this._playTrainingAnimation(sprite, 'idle', 'south');
    return sprite;
  }

  _createTrainingBall(x, y, size = 20) {
    this._ensureBallAnimation();
    const ball = this.add.sprite(x, y, 'ball_spritesheet', 0).setDepth(25);
    ball.setDisplaySize(size, size);
    if (this.anims.exists('training_ball_rotate')) ball.play('training_ball_rotate');
    return ball;
  }

  _getDirectionFromDelta(dx, dy, fallback = 'south') {
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return fallback;
    const horizontal = dx > 0.1 ? 'east' : dx < -0.1 ? 'west' : '';
    const vertical = dy > 0.1 ? 'south' : dy < -0.1 ? 'north' : '';
    if (vertical && horizontal) return `${vertical}-${horizontal}`;
    return vertical || horizontal || fallback;
  }

  _playTrainingAnimation(sprite, type, dir) {
    if (!sprite || !sprite._trainingAtlasKey) return;
    const key = `${sprite._trainingAtlasKey}_${type}_${dir}`;
    if (this.anims.exists(key)) sprite.play(key, true);
  }

  _updateTrainingSprite(sprite, x, y, dx = 0, dy = 0) {
    if (!sprite) return;
    sprite.setPosition(x, y);
    const moving = Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01;
    const dir = moving ? this._getDirectionFromDelta(dx, dy, sprite._trainingFacing || 'south') : (sprite._trainingFacing || 'south');
    sprite._trainingFacing = dir;
    this._playTrainingAnimation(sprite, moving ? 'run' : 'idle', dir);
  }

  create() {
    switch (this.miniGame) {
      case "ShootingMiniGame": this._createShooting(); break;
      case "DribbleMiniGame":  this._createDribble();  break;
      case "SlalomMiniGame":   this._createSlalom();   break;
      default: this.scene.start("PreGameScene");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MINI-GAME 1: CHUTE AO ALVO
  // ═══════════════════════════════════════════════════════════════════════════
  _createShooting() {
    this.cameras.main.setBackgroundColor("#0a1a0a");
    this._mgState = { hits: 0, misses: 0, timeLeft: 30, active: true, targets: [] };

    // Campo / Gol
    this._drawShootingField();

    // HUD
    this._shootHUD = {
      hits: this.add.text(20, 20, "Acertos: 0", { fontSize: "20px", fill: "#00ff88", fontStyle: "bold", fontFamily: "Arial, sans-serif" }),
      timer: this.add.text(500, 20, "⏱ 30s", { fontSize: "22px", fill: "#ffff00", fontStyle: "bold", fontFamily: "Arial, sans-serif" }).setOrigin(0.5),
      miss: this.add.text(980, 20, "Erros: 0", { fontSize: "20px", fill: "#ff4444", fontStyle: "bold", fontFamily: "Arial, sans-serif" }).setOrigin(1, 0),
      tip: this.add.text(500, 570, "Clique nos alvos antes que desapareçam!", { fontSize: "14px", fill: "#aaa", fontFamily: "Arial, sans-serif" }).setOrigin(0.5),
    };

    // Jogador com sprite real do time atual
    this._shooter = this._createTrainingPlayer(500, 474, null, 1.25);
    this._shooter._trainingFacing = 'north';
    this._playTrainingAnimation(this._shooter, 'idle', 'north');
    this._shootBall = this._createTrainingBall(530, 500, 22);

    // Spawn de alvos
    this._spawnShootingTarget();
    this._shootTimer = this.time.addEvent({
      delay: 1800, callback: this._spawnShootingTarget, callbackScope: this, loop: true,
    });

    // Countdown
    this._countdownTimer = this.time.addEvent({
      delay: 1000, callback: this._tickShootingTimer, callbackScope: this, loop: true,
    });
  }

  _drawShootingField() {
    const g = this.add.graphics();
    // Gramado
    g.fillStyle(0x1a4a1a, 1); g.fillRect(0, 0, 1000, 600);
    g.fillStyle(0x1e5a1e, 1); g.fillRect(0, 0, 1000, 300);
    // Gol
    g.lineStyle(4, 0xffffff, 1);
    g.strokeRect(300, 40, 400, 120);
    // Linhas do campo
    g.lineStyle(2, 0x2a6a2a, 0.5);
    g.lineBetween(0, 300, 1000, 300);
    g.strokeRect(200, 0, 600, 220);
    g.strokeCircle(500, 300, 80);
    // Marcação de pênalti
    g.fillStyle(0xffffff, 0.8); g.fillCircle(500, 240, 5);
    // Texto GOL
    this.add.text(500, 100, "GOL", { fontSize: "28px", fill: "#ffffff", fontStyle: "bold", fontFamily: "Arial, sans-serif", alpha: 0.3 }).setOrigin(0.5);
  }

  _spawnShootingTarget() {
    if (!this._mgState.active) return;

    // Posição aleatória dentro da área do gol (com margem)
    const gx = Phaser.Math.Between(330, 670);
    const gy = Phaser.Math.Between(60, 140);
    const radius = Phaser.Math.Between(22, 38);

    const target = this.add.graphics();
    const colors = [0xff4444, 0xffaa00, 0x00aaff, 0xaa00ff];
    const color = colors[Math.floor(Math.random() * colors.length)];
    target.fillStyle(color, 1);
    target.fillCircle(gx, gy, radius);
    target.fillStyle(0xffffff, 0.4);
    target.fillCircle(gx, gy, radius * 0.5);

    // Pontuação no alvo
    const pts = Math.ceil(40 / radius * 10); // Alvos menores = mais pontos
    const ptsText = this.add.text(gx, gy, `${pts}`, {
      fontSize: "14px", fill: "#fff", fontStyle: "bold", fontFamily: "Arial, sans-serif",
    }).setOrigin(0.5).setDepth(10);

    target.setInteractive(new Phaser.Geom.Circle(gx, gy, radius), Phaser.Geom.Circle.Contains);
    target.on('pointerdown', () => {
      if (!this._mgState.active) return;
      this._mgState.hits++;
      this._shootHUD.hits.setText(`Acertos: ${this._mgState.hits}`);
      // Efeito de acerto
      this.tweens.add({ targets: [target, ptsText], alpha: 0, scaleX: 1.5, scaleY: 1.5, duration: 200, onComplete: () => { target.destroy(); ptsText.destroy(); } });
      this._showFloatingText(gx, gy, `+${pts}`, "#00ff88");
    });

    this._mgState.targets.push({ target, ptsText });

    // Auto-destruir após 2.5s
    this.time.delayedCall(2500, () => {
      if (target.active) {
        this._mgState.misses++;
        this._shootHUD.miss.setText(`Erros: ${this._mgState.misses}`);
        target.destroy();
        ptsText.destroy();
      }
    });
  }

  _tickShootingTimer() {
    this._mgState.timeLeft--;
    this._shootHUD.timer.setText(`⏱ ${this._mgState.timeLeft}s`);
    if (this._mgState.timeLeft <= 0) {
      this._mgState.active = false;
      this._shootTimer.remove();
      this._countdownTimer.remove();
      this._finishShooting();
    }
  }

  _finishShooting() {
    const hits = this._mgState.hits;
    const xp = Math.min(80, 10 + hits * 5);
    this._showMiniGameResult("CHUTE AO ALVO", `Acertos: ${hits}`, xp, 80);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MINI-GAME 2: DOMÍNIO DE BOLA (BOBINHO)
  // ═══════════════════════════════════════════════════════════════════════════
  _createDribble() {
    this.cameras.main.setBackgroundColor("#0a0a1a");
    this._dribState = {
      timeAlive: 0, maxTime: 60, active: true,
      playerX: 500, playerY: 300,
      ballX: 500, ballY: 300,
      hasBall: true,
      markers: [],
      markerSpawnInterval: 10, // Novo marcador a cada 10s
      nextMarkerAt: 10,
      speed: 200,
      markerSpeed: 90,
    };

    // Campo
    this._drawDribbleField();

    // Jogador e bola com sprites reais
    this._dribPlayer = this._createTrainingPlayer(this._dribState.playerX, this._dribState.playerY, null, 1.0);
    this._dribBall = this._createTrainingBall(this._dribState.playerX + 20, this._dribState.playerY + 10, 18);
    this._drawDribPlayer();

    // HUD
    this._dribHUD = {
      timer: this.add.text(500, 20, "⏱ 0s / 60s", { fontSize: "22px", fill: "#ffff00", fontStyle: "bold", fontFamily: "Arial, sans-serif" }).setOrigin(0.5),
      status: this.add.text(500, 50, "✅ Com a bola!", { fontSize: "16px", fill: "#00ff88", fontFamily: "Arial, sans-serif" }).setOrigin(0.5),
      tip: this.add.text(500, 570, "Use WASD ou setas para mover. Não deixe os marcadores pegarem a bola!", { fontSize: "13px", fill: "#aaa", fontFamily: "Arial, sans-serif" }).setOrigin(0.5),
      markers: this.add.text(980, 20, "Marcadores: 0", { fontSize: "16px", fill: "#ff8800", fontFamily: "Arial, sans-serif" }).setOrigin(1, 0),
    };

    // Controles
    this._dribKeys = this.input.keyboard.createCursorKeys();
    this._dribWASD = this.input.keyboard.addKeys({ up: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.S, left: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.D });

    // Update loop
    this._dribUpdateEvent = this.time.addEvent({ delay: 16, callback: this._updateDribble, callbackScope: this, loop: true });
    this._dribSecondEvent = this.time.addEvent({ delay: 1000, callback: this._tickDribble, callbackScope: this, loop: true });
  }

  _drawDribbleField() {
    const g = this.add.graphics();
    g.fillStyle(0x1a3a1a, 1); g.fillRect(0, 0, 1000, 600);
    g.lineStyle(2, 0x2a5a2a, 0.6);
    g.strokeRect(50, 50, 900, 500);
    g.strokeCircle(500, 300, 120);
    g.lineBetween(50, 300, 950, 300);
  }

  _drawDribPlayer() {
    const s = this._dribState;
    this._updateTrainingSprite(this._dribPlayer, s.playerX, s.playerY, s.lastDx || 0, s.lastDy || 0);

    if (this._dribBall) {
      this._dribBall.setVisible(!!s.hasBall);
      if (s.hasBall) this._dribBall.setPosition(s.playerX + 20, s.playerY + 10);
    }
  }

  _updateDribble() {
    if (!this._dribState.active) return;
    const s = this._dribState;
    const dt = 0.016;
    let dx = 0, dy = 0;

    if (this._dribKeys.left.isDown || this._dribWASD.left.isDown) dx = -1;
    else if (this._dribKeys.right.isDown || this._dribWASD.right.isDown) dx = 1;
    if (this._dribKeys.up.isDown || this._dribWASD.up.isDown) dy = -1;
    else if (this._dribKeys.down.isDown || this._dribWASD.down.isDown) dy = 1;

    s.lastDx = dx;
    s.lastDy = dy;
    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      s.playerX = Phaser.Math.Clamp(s.playerX + (dx / len) * s.speed * dt, 60, 940);
      s.playerY = Phaser.Math.Clamp(s.playerY + (dy / len) * s.speed * dt, 60, 540);
    }

    // Mover marcadores em direção ao jogador
    s.markers.forEach(m => {
      const mdx = s.playerX - m.x;
      const mdy = s.playerY - m.y;
      const dist = Math.sqrt(mdx * mdx + mdy * mdy);
      if (dist > 1) {
        const moveX = (mdx / dist);
        const moveY = (mdy / dist);
        m.x += moveX * m.speed * dt;
        m.y += moveY * m.speed * dt;
        this._updateTrainingSprite(m.sprite, m.x, m.y, moveX, moveY);
        // Colisão com jogador
        if (dist < 30 && s.hasBall) {
          s.hasBall = false;
          if (this._dribBall) this._dribBall.setVisible(false);
          this._dribHUD.status.setText("❌ Perdeu a bola!").setFill("#ff4444");
          this._dribState.active = false;
          this._dribUpdateEvent.remove();
          this._dribSecondEvent.remove();
          this._finishDribble();
        }
      }
    });

    this._drawDribPlayer();
  }

  _tickDribble() {
    if (!this._dribState.active) return;
    const s = this._dribState;
    s.timeAlive++;
    this._dribHUD.timer.setText(`⏱ ${s.timeAlive}s / ${s.maxTime}s`);

    // Spawn de novo marcador
    if (s.timeAlive >= s.nextMarkerAt) {
      s.nextMarkerAt += s.markerSpawnInterval;
      const edge = Math.floor(Math.random() * 4);
      let mx, my;
      if (edge === 0) { mx = Phaser.Math.Between(60, 940); my = 60; }
      else if (edge === 1) { mx = Phaser.Math.Between(60, 940); my = 540; }
      else if (edge === 2) { mx = 60; my = Phaser.Math.Between(60, 540); }
      else { mx = 940; my = Phaser.Math.Between(60, 540); }

      const markerSprite = this._createTrainingPlayer(mx, my, this._getMarkerTeamName(), 0.95);
      const markerSpeed = 90 + s.markers.length * 15; // Fica mais rápido com mais marcadores
      s.markers.push({ x: mx, y: my, sprite: markerSprite, speed: markerSpeed });
      this._dribHUD.markers.setText(`Marcadores: ${s.markers.length}`);
      this._showFloatingText(mx, my, "NOVO MARCADOR!", "#ff8800");
    }

    if (s.timeAlive >= s.maxTime) {
      s.active = false;
      this._dribUpdateEvent.remove();
      this._dribSecondEvent.remove();
      this._finishDribble();
    }
  }

  _finishDribble() {
    const s = this._dribState;
    const survived = s.timeAlive;
    const xp = Math.min(90, Math.floor((survived / s.maxTime) * 90));
    this._showMiniGameResult("DOMÍNIO DE BOLA", `Sobreviveu: ${survived}s de ${s.maxTime}s`, xp, 90);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MINI-GAME 3: CIRCUITO DE CONES (SLALOM)
  // ═══════════════════════════════════════════════════════════════════════════
  _createSlalom() {
    this.cameras.main.setBackgroundColor("#0a0a2a");
    this._slState = {
      active: true,
      started: false,
      finished: false,
      startTime: 0,
      elapsedMs: 0,
      playerX: 100, playerY: 300,
      speed: 220,
      cones: [],
      nextCone: 0,    // Índice do próximo cone a passar
      ballLost: false,
    };

    // Gerar percurso de cones
    this._generateSlalomCourse();
    this._drawSlalomField();

    // Jogador e bola com sprites reais
    this._slPlayer = this._createTrainingPlayer(this._slState.playerX, this._slState.playerY, null, 1.0);
    this._slBall = this._createTrainingBall(this._slState.playerX + 18, this._slState.playerY + 8, 18);
    this._drawSlalomPlayer();

    // HUD
    this._slHUD = {
      timer: this.add.text(500, 20, "⏱ 0.0s", { fontSize: "24px", fill: "#ffff00", fontStyle: "bold", fontFamily: "Arial, sans-serif" }).setOrigin(0.5),
      cones: this.add.text(20, 20, "Cones: 0 / 0", { fontSize: "18px", fill: "#00aaff", fontFamily: "Arial, sans-serif" }),
      tip: this.add.text(500, 570, "Passe pelos cones em ordem (numerados). WASD ou setas para mover.", { fontSize: "13px", fill: "#aaa", fontFamily: "Arial, sans-serif" }).setOrigin(0.5),
      status: this.add.text(500, 50, "Chegue ao cone 1 para começar!", { fontSize: "15px", fill: "#fff", fontFamily: "Arial, sans-serif" }).setOrigin(0.5),
    };

    // Controles
    this._slKeys = this.input.keyboard.createCursorKeys();
    this._slWASD = this.input.keyboard.addKeys({ up: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.S, left: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.D });

    // Update loop
    this._slUpdateEvent = this.time.addEvent({ delay: 16, callback: this._updateSlalom, callbackScope: this, loop: true });
  }

  _generateSlalomCourse() {
    // Gera 8 cones em zigue-zague
    const s = this._slState;
    s.cones = [];
    const numCones = 8;
    for (let i = 0; i < numCones; i++) {
      const cx = 200 + i * 100;
      const cy = i % 2 === 0 ? 180 : 420;
      s.cones.push({ x: cx, y: cy, passed: false, index: i });
    }
    // Ponto de chegada
    s.cones.push({ x: 950, y: 300, passed: false, index: numCones, isFinish: true });
  }

  _drawSlalomField() {
    const g = this.add.graphics();
    g.fillStyle(0x1a1a3a, 1); g.fillRect(0, 0, 1000, 600);
    g.lineStyle(1, 0x2a2a5a, 0.5);
    for (let x = 0; x < 1000; x += 50) g.lineBetween(x, 0, x, 600);
    for (let y = 0; y < 600; y += 50) g.lineBetween(0, y, 1000, y);

    // Desenhar linha do percurso
    const s = this._slState;
    const lineG = this.add.graphics();
    lineG.lineStyle(2, 0x3333aa, 0.4);
    lineG.beginPath();
    lineG.moveTo(100, 300);
    s.cones.forEach(c => lineG.lineTo(c.x, c.y));
    lineG.strokePath();

    // Desenhar cones
    s.cones.forEach((c, i) => {
      const coneG = this.add.graphics();
      const color = c.isFinish ? 0x00ff88 : 0xff8800;
      coneG.fillStyle(color, 1);
      coneG.fillTriangle(c.x, c.y - 20, c.x - 12, c.y + 10, c.x + 12, c.y + 10);
      coneG.fillStyle(0xffffff, 0.5);
      coneG.fillRect(c.x - 14, c.y + 10, 28, 5);
      c.gfx = coneG;

      const label = c.isFinish ? "FIM" : `${i + 1}`;
      const labelColor = c.isFinish ? "#00ff88" : "#ffffff";
      c.label = this.add.text(c.x, c.y - 30, label, {
        fontSize: "13px", fill: labelColor, fontStyle: "bold", fontFamily: "Arial, sans-serif",
      }).setOrigin(0.5);
    });

    // Ponto de partida
    const startG = this.add.graphics();
    startG.fillStyle(0x3388ff, 0.4);
    startG.fillCircle(100, 300, 30);
    this.add.text(100, 300, "START", { fontSize: "11px", fill: "#fff", fontFamily: "Arial, sans-serif" }).setOrigin(0.5);
  }

  _drawSlalomPlayer() {
    const s = this._slState;
    this._updateTrainingSprite(this._slPlayer, s.playerX, s.playerY, s.lastDx || 0, s.lastDy || 0);
    if (this._slBall) this._slBall.setPosition(s.playerX + 18, s.playerY + 8);
  }

  _updateSlalom() {
    if (!this._slState.active) return;
    const s = this._slState;
    const dt = 0.016;
    let dx = 0, dy = 0;

    if (this._slKeys.left.isDown || this._slWASD.left.isDown) dx = -1;
    else if (this._slKeys.right.isDown || this._slWASD.right.isDown) dx = 1;
    if (this._slKeys.up.isDown || this._slWASD.up.isDown) dy = -1;
    else if (this._slKeys.down.isDown || this._slWASD.down.isDown) dy = 1;

    s.lastDx = dx;
    s.lastDy = dy;
    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      s.playerX = Phaser.Math.Clamp(s.playerX + (dx / len) * s.speed * dt, 20, 980);
      s.playerY = Phaser.Math.Clamp(s.playerY + (dy / len) * s.speed * dt, 20, 580);
    }

    // Verificar se passou pelo próximo cone
    if (s.nextCone < s.cones.length) {
      const cone = s.cones[s.nextCone];
      const dist = Phaser.Math.Distance.Between(s.playerX, s.playerY, cone.x, cone.y);
      if (dist < 35) {
        // Passou pelo cone!
        if (!s.started && s.nextCone === 0) {
          s.started = true;
          s.startTime = Date.now();
          this._slHUD.status.setText("🏃 CORRENDO!").setFill("#00ff88");
        }
        cone.passed = true;
        if (cone.gfx) {
          cone.gfx.clear();
          cone.gfx.fillStyle(0x00ff88, 0.5);
          cone.gfx.fillCircle(cone.x, cone.y, 20);
        }
        if (cone.label) cone.label.setFill("#00ff88");
        this._showFloatingText(cone.x, cone.y, "✓", "#00ff88");
        s.nextCone++;
        this._slHUD.cones.setText(`Cones: ${s.nextCone} / ${s.cones.length}`);

        if (cone.isFinish) {
          s.active = false;
          s.finished = true;
          s.elapsedMs = Date.now() - s.startTime;
          this._slUpdateEvent.remove();
          this._finishSlalom();
        }
      }
    }

    // Atualizar timer
    if (s.started && !s.finished) {
      s.elapsedMs = Date.now() - s.startTime;
      this._slHUD.timer.setText(`⏱ ${(s.elapsedMs / 1000).toFixed(1)}s`);
    }

    this._drawSlalomPlayer();
  }

  _finishSlalom() {
    const s = this._slState;
    const elapsed = s.elapsedMs / 1000;
    // XP baseado no tempo: < 15s = 100 XP, < 25s = 75 XP, < 40s = 50 XP, senão 30 XP
    let xp = 30;
    if (elapsed < 15) xp = 100;
    else if (elapsed < 25) xp = 75;
    else if (elapsed < 40) xp = 50;

    this._showMiniGameResult("CIRCUITO DE CONES", `Tempo: ${elapsed.toFixed(1)}s`, xp, 100);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITÁRIOS COMPARTILHADOS
  // ═══════════════════════════════════════════════════════════════════════════

  _showFloatingText(x, y, text, color) {
    const t = this.add.text(x, y, text, {
      fontSize: "18px", fill: color, fontStyle: "bold", fontFamily: "Arial, sans-serif",
    }).setOrigin(0.5).setDepth(100);
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  _showMiniGameResult(title, detail, xpEarned, xpMax) {
    const career = window.careerMode;
    const result = career ? career.trainWithBonus(xpEarned) : { success: true };

    // Overlay de resultado
    const overlay = this.add.container(0, 0).setDepth(9999);
    const bgG = this.add.graphics();
    bgG.fillStyle(0x000000, 0.95);
    bgG.fillRect(0, 0, 1000, 600);
    overlay.add(bgG);

    const panelG = this.add.graphics();
    const xpPct = xpEarned / xpMax;
    const panelColor = xpPct >= 0.8 ? 0x1a5a1a : xpPct >= 0.5 ? 0x5a5a1a : 0x3a1a1a;
    panelG.fillStyle(panelColor, 1);
    panelG.fillRoundedRect(200, 150, 600, 300, 20);
    panelG.lineStyle(2, 0xffffff, 0.3);
    panelG.strokeRoundedRect(200, 150, 600, 300, 20);
    overlay.add(panelG);

    overlay.add(this.add.text(500, 195, title.toUpperCase(), {
      fontSize: "26px", fill: "#ffffff", fontStyle: "bold", fontFamily: "Arial, sans-serif",
    }).setOrigin(0.5));

    overlay.add(this.add.text(500, 240, detail, {
      fontSize: "18px", fill: "#aaa", fontFamily: "Arial, sans-serif",
    }).setOrigin(0.5));

    // XP ganho
    const xpColor = xpPct >= 0.8 ? "#00ff88" : xpPct >= 0.5 ? "#ffff00" : "#ff8800";
    overlay.add(this.add.text(500, 285, `+${xpEarned} XP`, {
      fontSize: "42px", fill: xpColor, fontStyle: "bold", fontFamily: "Arial, sans-serif",
    }).setOrigin(0.5));

    // Barra de XP
    const barBg = this.add.graphics().fillStyle(0x333333, 1).fillRoundedRect(250, 340, 500, 16, 8);
    const barFill = this.add.graphics().fillStyle(parseInt(xpColor.replace('#', '0x')), 1).fillRoundedRect(250, 340, 500 * xpPct, 16, 8);
    overlay.add([barBg, barFill]);

    overlay.add(this.add.text(500, 370, `${xpEarned} / ${xpMax} XP máximo`, {
      fontSize: "13px", fill: "#888", fontFamily: "Arial, sans-serif",
    }).setOrigin(0.5));

    if (career) {
      overlay.add(this.add.text(500, 395, `Nível: ${career.level}  |  XP: ${career.xp}/100  |  Reputação: ${career.coachReputation}/100`, {
        fontSize: "14px", fill: "#aaa", fontFamily: "Arial, sans-serif",
      }).setOrigin(0.5));
    }

    const continueBtn = UIHelper.createButton(this, 375, 420, 250, 48, "CONTINUAR", 0x1a4a8a, () => {
      overlay.destroy();
      this.scene.start("PreGameScene");
    });
    overlay.add(continueBtn);
  }
}
