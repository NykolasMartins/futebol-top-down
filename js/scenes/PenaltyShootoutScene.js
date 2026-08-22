class PenaltyShootoutScene extends Phaser.Scene {
  constructor() {
    super("PenaltyShootoutScene");
  }

  init(data) {
    // Guarda o pacote INTEIRO da GameScene. A cena só decide o desempate: tudo
    // o mais (stats reais, nota, escalação, placar do tempo normal) segue para o
    // EndGameScene como veio. Antes ela remontava um objeto pela metade e a tela
    // de pós-jogo recebia `undefined`.
    this.matchData = data || {};
    this.opponent = data.opponent || { name: "Rival", rating: 75 };
    this.matchType = data.matchType || "brasileirao"; // Recebe o tipo de partida
    this.playerScore = 0;
    this.opponentScore = 0;
    this.currentRound = 1;
    this.isPlayerTurn = true;
    this.playerAttempts = [];
    this.opponentAttempts = [];

    this.state = "WAITING_INPUT";
    this.targetPos = null;
    this.power = 0;
    this.powerDir = 1;
    this.timer = 0;
    this.playerDefenseSide = null;

    // Blueprint de Coordenadas Rigoroso (1000x600)
    this.blueprint = {
      width: 1000,
      height: 600,
      goal: { x: 500, y: 100, width: 410, height: 150 }, // Largura reduzida para 410px
      ball: { x: 500, y: 480 },
      powerBar: { x: 850, y: 350, w: 30, h: 200 },
    };
  }

  preload() {
    const path = "assets/goleiro_penalti/animations/";
    // Idle Frames
    for (let i = 0; i <= 8; i++) {
      const frameStr = i.toString().padStart(3, "0");
      this.load.image(
        `gk_idle_${i}`,
        `${path}Pixel_art_goalkeeper_idle_animation_4_frames_loop.-807ed29a/south/frame_${frameStr}.png`,
      );
    }
    // Dive Frames
    for (let i = 0; i <= 8; i++) {
      const frameStr = i.toString().padStart(3, "0");
      this.load.image(
        `gk_dive_${i}`,
        `${path}Pixel_art_goalkeeper_diving_save_animation_5_frame-0ffe2faf/south/frame_${frameStr}.png`,
      );
    }
  }

  create() {
    // 1. Fundo (Grama Fosca)
    const bg = this.add.graphics();
    bg.fillStyle(0x1e4d2b, 1);
    bg.fillRect(0, 0, 1000, 600);

    // Linha de fundo branca espessa
    bg.lineStyle(6, 0xffffff, 1);
    bg.lineBetween(
      100,
      this.blueprint.goal.y + this.blueprint.goal.height,
      900,
      this.blueprint.goal.y + this.blueprint.goal.height,
    );

    this.drawGoal();
    this.createScoreHUD();

    // Sombra da Bola (Para profundidade)
    this.ballShadow = this.add.ellipse(
      this.blueprint.ball.x,
      this.blueprint.ball.y + 15,
      40,
      15,
      0x000000,
      0.3,
    );

    // 2. A Bola (Maior e Visível)
    this.ball = this.add
      .sprite(
        this.blueprint.ball.x,
        this.blueprint.ball.y,
        "ball_spritesheet",
        0,
      )
      .setScale(0.85);
    this.physics.add.existing(this.ball);

    // Partículas de Grama
    this.grassParticles = this.add.graphics();
    this.grassEmitter = null; // Criaremos sob demanda para evitar overhead

    // 3. O Goleiro (Escala ajustada para o novo gol: ~25% da largura de 410px)
    this.gk = this.add
      .sprite(
        500,
        this.blueprint.goal.y + this.blueprint.goal.height - 30,
        "gk_idle_0",
      )
      .setOrigin(0.5, 0.5) // Alinhamento central rigoroso
      .setScale(2.2);
    this.physics.add.existing(this.gk);

    // CENTRALIZAÇÃO MATEMÁTICA AUTOMATIZADA DA HITBOX:
    // 1. Definimos o tamanho da hitbox baseada nos pixels REAIS do frame original
    const hitboxWidth = 40;
    const hitboxHeight = 60;
    this.gk.body.setSize(hitboxWidth, hitboxHeight);

    // 2. Fórmula para centralizar independentemente do Scale:
    const rawFrameWidth = this.gk.frame.realWidth;
    const rawFrameHeight = this.gk.frame.realHeight;
    const offsetX = (rawFrameWidth - hitboxWidth) / 2;
    const offsetY = (rawFrameHeight - hitboxHeight) / 2;

    this.gk.body.setOffset(offsetX, offsetY);
    this.gk.body.setAllowGravity(false);
    this.gk.body.setImmovable(true);

    this.createAnimations();
    this.gk.play("penalty_gk_idle");

    // Seta Indicadora de Defesa (Amarela)
    this.defenseArrow = this.add.graphics();
    this.defenseArrow.fillStyle(0xffff00, 1);
    this.defenseArrow.lineStyle(2, 0x000000, 1);
    // Desenha uma seta apontando para baixo
    const arrowPath = [
      -15, -40, 15, -40, 15, -20, 25, -20, 0, 0, -25, -20, -15, -20,
    ];

    const arrowPoints = [];
    for (let i = 0; i < arrowPath.length; i += 2) {
      arrowPoints.push({ x: arrowPath[i], y: arrowPath[i + 1] });
    }

    this.defenseArrow.fillPoints(arrowPoints, true);
    this.defenseArrow.strokePoints(arrowPoints, true);
    this.defenseArrow.setPosition(500, 150).setVisible(false);

    // Animação de flutuar da seta
    this.tweens.add({
      targets: this.defenseArrow,
      y: 140,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Mira
    this.crosshair = this.add.circle(0, 0, 12, 0xffff00, 0.6).setVisible(false);
    this.crosshair.setStrokeStyle(2, 0xffffff);

    // Barra de Força
    this.powerBarBG = this.add.graphics();
    this.powerBarFill = this.add.graphics();
    this.drawPowerBarBase();

    this.statusText = this.add
      .text(500, 320, "SUA VEZ DE CHUTAR!", {
        fontSize: "36px",
        fill: "#fff",
        fontStyle: "bold",
        fontFamily: "Impact",
      })
      .setOrigin(0.5);
    this.statusText.setShadow(3, 3, "#000", 4, true, true);

    this.input.on("pointerdown", (pointer) => this.handlePointerDown(pointer));
  }

  createAnimations() {
    if (!this.anims.exists("penalty_gk_idle")) {
      const idleFrames = [];
      for (let i = 0; i <= 8; i++) idleFrames.push({ key: `gk_idle_${i}` });
      this.anims.create({
        key: "penalty_gk_idle",
        frames: idleFrames,
        frameRate: 10,
        repeat: -1,
      });
    }
    if (!this.anims.exists("penalty_gk_dive")) {
      const diveFrames = [];
      for (let i = 0; i <= 8; i++) diveFrames.push({ key: `gk_dive_${i}` });
      this.anims.create({
        key: "penalty_gk_dive",
        frames: diveFrames,
        frameRate: 15,
        repeat: 0,
      });
    }
  }

  drawGoal() {
    const g = this.add.graphics();
    const { x, y, width, height } = this.blueprint.goal;

    // Rede (preenchimento cinza suave)
    g.fillStyle(0xcccccc, 0.15);
    g.fillRect(x - width / 2, y, width, height);

    // Traves Brancas Imponentes (Espessura realista)
    g.lineStyle(12, 0xffffff, 1);
    // Esquerda
    g.lineBetween(x - width / 2, y, x - width / 2, y + height);
    // Direita
    g.lineBetween(x + width / 2, y, x + width / 2, y + height);
    // Superior
    g.lineBetween(x - width / 2, y, x + width / 2, y);

    // Linhas da rede finas (Grelha mais densa)
    g.lineStyle(1, 0xffffff, 0.3);
    const cols = 15;
    const rows = 8;
    for (let i = 1; i < cols; i++) {
      const lx = x - width / 2 + (width / cols) * i;
      g.lineBetween(lx, y, lx, y + height);
    }
    for (let i = 1; i < rows; i++) {
      const ly = y + (height / rows) * i;
      g.lineBetween(x - width / 2, ly, x + width / 2, ly);
    }
  }

  createScoreHUD() {
    const drawRow = (y, label) => {
      this.add
        .text(350, y, label, {
          fontSize: "14px",
          fill: "#fff",
          fontStyle: "bold",
        })
        .setOrigin(1, 0.5);
      const dots = [];
      for (let i = 0; i < 5; i++) {
        const dot = this.add.circle(380 + i * 30, y, 8, 0x444444, 1);
        dot.setStrokeStyle(2, 0x888888);
        dots.push(dot);
      }
      return dots;
    };
    this.playerDots = drawRow(30, "VOCÊ");
    this.opponentDots = drawRow(55, this.opponent.name.toUpperCase());
  }

  drawPowerBarBase() {
    const { x, y, w, h } = this.blueprint.powerBar;
    this.powerBarBG.clear();
    this.powerBarBG.fillStyle(0x000000, 0.5);
    this.powerBarBG.fillRoundedRect(x, y - h / 2, w, h, 5);
    this.powerBarBG.lineStyle(2, 0x888888, 1);
    this.powerBarBG.strokeRoundedRect(x, y - h / 2, w, h, 5);
    this.powerBarBG.setVisible(false);
    this.powerBarFill.setVisible(false);
  }

  update(time, delta) {
    // Atualiza sombra para seguir a bola
    if (this.ball && this.ballShadow) {
      this.ballShadow.x = this.ball.x;
      // A sombra fica no "chão", então o Y da sombra não sobe tanto quanto a bola
      const groundY = this.blueprint.ball.y + 15;
      const distToGround = Math.max(0, groundY - this.ball.y);
      this.ballShadow.y = groundY - distToGround * 0.1;
      this.ballShadow.scale = Math.max(
        0.2,
        this.ball.scale * (1 - distToGround * 0.002),
      );
      this.ballShadow.alpha = Math.max(0.1, 0.3 - distToGround * 0.001);
    }

    if (this.state === "CHARGING") {
      this.power += this.powerDir * delta * 0.25;
      if (this.power >= 100) {
        this.power = 100;
        this.powerDir = -1;
      }
      if (this.power <= 0) {
        this.power = 0;
        this.powerDir = 1;
      }
      this.refreshPowerBar();
    }
  }

  refreshPowerBar() {
    const { x, y, w, h } = this.blueprint.powerBar;
    this.powerBarFill.clear();

    let color = 0x00ff00; // Verde (Centro)
    if (this.power < 30 || this.power > 85)
      color = 0xff0000; // Vermelho (Extremos)
    else if (this.power < 50 || this.power > 70) color = 0xffff00; // Amarelo

    const fillH = (this.power / 100) * h;
    this.powerBarFill.fillStyle(color, 1);
    this.powerBarFill.fillRoundedRect(
      x + 2,
      y + h / 2 - fillH,
      w - 4,
      fillH,
      2,
    );
  }

  handlePointerDown(pointer) {
    if (this.state === "WAITING_INPUT") {
      if (this.isPlayerTurn) {
        // Validar se clicou dentro ou levemente fora do retângulo do gol
        const { x, y, width, height } = this.blueprint.goal;
        const margin = 20; // Pequena margem para "fora da trave"
        if (
          pointer.x >= x - width / 2 - margin &&
          pointer.x <= x + width / 2 + margin &&
          pointer.y >= y - margin &&
          pointer.y <= y + height + margin
        ) {
          this.targetPos = { x: pointer.x, y: pointer.y };
          this.crosshair
            .setPosition(this.targetPos.x, this.targetPos.y)
            .setVisible(true);
          this.state = "CHARGING";
          this.powerBarBG.setVisible(true);
          this.powerBarFill.setVisible(true);
        }
      } else {
        // Defesa antecipada (opcional)
        this.selectDefenseSide(pointer.x);
      }
    } else if (this.state === "CHARGING") {
      this.executeShoot();
    } else if (this.state === "BALL_FLYING" && !this.isPlayerTurn) {
      // DEFESA REATIVA: Permite escolher o lado enquanto a bola viaja
      this.selectDefenseSide(pointer.x);
    }
  }

  selectDefenseSide(pointerX) {
    if (pointerX < 420) {
      this.playerDefenseSide = "west";
      if (this.defenseArrow) this.defenseArrow.setX(350);
    } else if (pointerX > 580) {
      this.playerDefenseSide = "east";
      if (this.defenseArrow) this.defenseArrow.setX(650);
    } else {
      this.playerDefenseSide = "center";
      if (this.defenseArrow) this.defenseArrow.setX(500);
    }

    // Se o goleiro já estiver parado e a bola estiver vindo, forçar o pulo imediato
    if (this.state === "BALL_FLYING" && !this.isPlayerTurn && !this.gkJumped) {
      this.triggerGkDefense(this.playerDefenseSide);
    }

    this.statusText.setText("REAGINDO!");
  }

  executeShoot() {
    this.state = "BALL_FLYING";
    this.gkJumped = false; // Reset da flag de pulo
    this.powerBarBG.setVisible(false);
    this.powerBarFill.setVisible(false);
    if (this.defenseArrow) this.defenseArrow.setVisible(false);

    // Efeito Visual: Partículas no momento do chute
    this.createKickEffect();

    const isOut = this.power > 90 && Math.random() > 0.3;

    // Decisão do Goleiro
    let jumpDir;
    if (this.isPlayerTurn) {
      jumpDir =
        Math.random() < 0.33 ? "west" : Math.random() > 0.5 ? "east" : "center";
      this.triggerGkDefense(jumpDir);
    } else {
      // Se for a vez da IA chutar, o goleiro só pula se o jogador já tiver escolhido
      if (this.playerDefenseSide) {
        this.triggerGkDefense(this.playerDefenseSide);
      }
    }

    // Trajetória da Bola
    const finalX = isOut
      ? this.targetPos.x > 500
        ? 800
        : 200
      : this.targetPos.x;
    const finalY = isOut ? 50 : this.targetPos.y;

    this.tweens.add({
      targets: this.ball,
      x: finalX,
      y: finalY,
      scale: 0.5, // Aumentado de 0.25 para 0.50 para melhor visibilidade e profundidade
      duration: 600,
      ease: "Quad.easeOut",
      onComplete: () => this.evaluateResult(isOut, jumpDir),
    });
  }

  triggerGkDefense(jumpDir) {
    if (this.gkJumped) return;
    this.gkJumped = true;

    // Cálculo da Altura do Pulo (Verticalidade)
    const idleY = this.blueprint.goal.y + this.blueprint.goal.height - 30;
    let finalGkY = idleY;

    if (this.targetPos.y < 180) {
      finalGkY = Math.max(this.blueprint.goal.y + 20, this.targetPos.y);
    }

    if (jumpDir === "west") {
      this.gk.setFlipX(true);
      this.gk.play("penalty_gk_dive", true);
      const hW = 80;
      const hH = 40;
      this.gk.body.setSize(hW, hH);
      this.gk.body.setOffset(
        (this.gk.frame.realWidth - hW) / 2,
        (this.gk.frame.realHeight - hH) / 2,
      );

      this.tweens.add({
        targets: this.gk,
        x: 500 - 150,
        y: finalGkY,
        duration: 250, // Pulo reativo ligeiramente mais rápido
        onUpdate: () => {
          if (this.gk.body) {
            this.gk.body.x = this.gk.x - this.gk.body.halfWidth;
            this.gk.body.y = this.gk.y - this.gk.body.halfHeight;
          }
        },
      });
    } else if (jumpDir === "east") {
      this.gk.setFlipX(false);
      this.gk.play("penalty_gk_dive", true);
      const hW = 80;
      const hH = 40;
      this.gk.body.setSize(hW, hH);
      this.gk.body.setOffset(
        (this.gk.frame.realWidth - hW) / 2,
        (this.gk.frame.realHeight - hH) / 2,
      );

      this.tweens.add({
        targets: this.gk,
        x: 500 + 150,
        y: finalGkY,
        duration: 250,
        onUpdate: () => {
          if (this.gk.body) {
            this.gk.body.x = this.gk.x - this.gk.body.halfWidth;
            this.gk.body.y = this.gk.y - this.gk.body.halfHeight;
          }
        },
      });
    } else if (jumpDir === "center" && finalGkY < idleY) {
      this.gk.play("penalty_gk_dive", true);
      const hW = 40;
      const hH = 80;
      this.gk.body.setSize(hW, hH);
      this.gk.body.setOffset(
        (this.gk.frame.realWidth - hW) / 2,
        (this.gk.frame.realHeight - hH) / 2,
      );

      this.tweens.add({
        targets: this.gk,
        y: finalGkY,
        duration: 250,
        onUpdate: () => {
          if (this.gk.body) {
            this.gk.body.x = this.gk.x - this.gk.body.halfWidth;
            this.gk.body.y = this.gk.y - this.gk.body.halfHeight;
          }
        },
      });
    }
  }

  evaluateResult(isOut, jumpDir) {
    // SINCRONIZAÇÃO FORÇADA: Garante que os corpos físicos acompanham os sprites após o Tween
    this.ball.body.updateFromGameObject();
    this.gk.body.updateFromGameObject();

    let isGoal = false;
    // O chute deve estar dentro do retângulo real do gol para ser gol
    const { x, y, width, height } = this.blueprint.goal;
    const isInsideGoal =
      this.targetPos.x >= x - width / 2 &&
      this.targetPos.x <= x + width / 2 &&
      this.targetPos.y >= y &&
      this.targetPos.y <= y + height;

    if (!isOut && isInsideGoal) {
      // PRECISÃO DE DEFESA: Verificação real de colisão por sobreposição de corpos físicos (.body)
      const ballBody = this.ball.body;
      const gkBody = this.gk.body;

      // Criamos retângulos baseados nas propriedades X, Y, WIDTH e HEIGHT dos corpos físicos
      const ballRect = new Phaser.Geom.Rectangle(
        ballBody.x,
        ballBody.y,
        ballBody.width,
        ballBody.height,
      );
      const gkRect = new Phaser.Geom.Rectangle(
        gkBody.x,
        gkBody.y,
        gkBody.width,
        gkBody.height,
      );

      const isDefense = Phaser.Geom.Intersects.RectangleToRectangle(
        ballRect,
        gkRect,
      );

      // Se NÃO houver interseção entre as caixas físicas, é GOL
      if (!isDefense) {
        isGoal = true;
        // Efeito visual de gol (Rede)
        this.cameras.main.shake(200, 0.005);
        this.flashGoalNet();
      } else {
        // EFEITO DE DEFESA: A bola bate e vai para fora
        this.cameras.main.shake(150, 0.008);
        this.executeBallRebound();
      }
    } else if (isOut) {
      this.statusText.setText("PARA FORA!");
    }

    const list = this.isPlayerTurn
      ? this.playerAttempts
      : this.opponentAttempts;
    const dots = this.isPlayerTurn ? this.playerDots : this.opponentDots;

    list.push(isGoal);
    const dot = dots[list.length - 1];
    if (dot) dot.setFillStyle(isGoal ? 0x00ff00 : 0xff0000);

    if (isGoal) {
      if (this.isPlayerTurn) this.playerScore++;
      else this.opponentScore++;
    }

    this.statusText.setText(isGoal ? "GOL!" : "ERROU!");
    this.time.delayedCall(1500, () => this.resetRound());
  }

  resetRound() {
    if (this.checkMatchOver()) return;

    this.isPlayerTurn = !this.isPlayerTurn;
    this.state = "WAITING_INPUT";
    this.playerDefenseSide = null;
    this.power = 0;

    // Reset Visual Rigoroso (Usando as novas proporções)
    const idleY = this.blueprint.goal.y + this.blueprint.goal.height - 30;
    this.ball
      .setPosition(this.blueprint.ball.x, this.blueprint.ball.y)
      .setScale(0.85)
      .setAngle(0);

    if (this.ballShadow) {
      this.ballShadow
        .setPosition(this.blueprint.ball.x, this.blueprint.ball.y + 15)
        .setScale(1)
        .setAlpha(0.3);
    }
    this.gk.setPosition(500, idleY).setFlipX(false);

    // Reset da hitbox com centralização matemática
    const hW = 40;
    const hH = 60;
    this.gk.body.setSize(hW, hH);
    this.gk.body.setOffset(
      (this.gk.frame.realWidth - hW) / 2,
      (this.gk.frame.realHeight - hH) / 2,
    );

    this.gk.play("penalty_gk_idle", true);
    this.crosshair.setVisible(false);

    this.statusText.setText(
      this.isPlayerTurn ? "SUA VEZ DE CHUTAR!" : "ESCOLHA O CANTO!",
    );

    // Controle da Seta de Defesa
    if (this.defenseArrow) {
      this.defenseArrow.setVisible(!this.isPlayerTurn);
      this.defenseArrow.setX(500); // Garante que volta ao centro
    }

    if (!this.isPlayerTurn) {
      this.timer = 3;
      this.startDefenseTimer();
    }
  }

  startDefenseTimer() {
    const tText = this.add
      .text(500, 200, "3", {
        fontSize: "64px",
        fill: "#ff0",
        fontFamily: "Impact",
      })
      .setOrigin(0.5);
    this.time.addEvent({
      delay: 1000,
      repeat: 2,
      callback: () => {
        this.timer--;
        tText.setText(this.timer);
        if (this.timer === 0) {
          tText.destroy();
          this.iaExecuteShoot();
        }
      },
    });
  }

  iaExecuteShoot() {
    const { x, y, width, height } = this.blueprint.goal;
    this.targetPos = {
      x: x - width / 2 + Math.random() * width,
      y: y + Math.random() * height,
    };
    this.executeShoot();
  }

  checkMatchOver() {
    const max = 5;
    const pLeft = max - this.playerAttempts.length;
    const oLeft = max - this.opponentAttempts.length;

    if (
      this.playerScore > this.opponentScore + oLeft ||
      this.opponentScore > this.playerScore + pLeft
    ) {
      this.finish(this.playerScore > this.opponentScore);
      return true;
    }
    if (
      this.playerAttempts.length >= max &&
      this.opponentAttempts.length >= max &&
      this.playerScore !== this.opponentScore
    ) {
      this.finish(this.playerScore > this.opponentScore);
      return true;
    }
    return false;
  }

  finish(win) {
    this.statusText.setText(win ? "VITÓRIA!" : "DERROTA!");

    // Quem passou, por ID de clube. `penaltyWin` (booleano) continua junto para
    // o texto da tela; quem decide o chaveamento é o ID.
    const meuClube =
      (window.careerMode &&
        window.careerMode.currentTeam &&
        window.careerMode.currentTeam.name) ||
      "PLAYER";
    const penaltyWinnerId = win ? meuClube : this.opponent.name;

    this.time.delayedCall(2500, () => {
      this.scene.start("EndGameScene", {
        // Repassa o pacote da GameScene inteiro; só o desempate é novo.
        ...this.matchData,
        penaltyWin: win,
        penaltyWinnerId,
        penaltyScore: { player: this.playerScore, opponent: this.opponentScore },
      });
    });
  }

  // --- NOVOS MÉTODOS VISUAIS E REALISTAS ---

  createKickEffect() {
    // Simula grama levantando
    for (let i = 0; i < 8; i++) {
      const p = this.add.circle(this.ball.x, this.ball.y, 2, 0x3d7a4b);
      this.tweens.add({
        targets: p,
        x: p.x + Phaser.Math.Between(-40, 40),
        y: p.y + Phaser.Math.Between(-40, -10),
        alpha: 0,
        scale: 0.1,
        duration: 400,
        onComplete: () => p.destroy(),
      });
    }
  }

  executeBallRebound() {
    // A bola bate no goleiro e sai para o lado
    const side = this.ball.x > 500 ? 1 : -1;
    this.tweens.add({
      targets: this.ball,
      x: this.ball.x + 200 * side,
      y: this.ball.y + 100,
      scale: 0.6,
      angle: 360,
      duration: 800,
      ease: "Quad.easeOut",
    });
  }

  flashGoalNet() {
    const netG = this.add.graphics();
    const { x, y, width, height } = this.blueprint.goal;
    netG.fillStyle(0xffffff, 0.4);
    netG.fillRect(x - width / 2, y, width, height);
    this.tweens.add({
      targets: netG,
      alpha: 0,
      duration: 500,
      onComplete: () => netG.destroy(),
    });
  }
}
