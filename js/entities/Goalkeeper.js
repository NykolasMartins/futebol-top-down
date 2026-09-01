class Goalkeeper extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, minX, maxX, minY, maxY, isTop, isPlayerTeam) {
    super(
      scene,
      x,
      y,
      "goalkeeper_atlas",
      isTop ? "idle_east_0" : "idle_west_0",
    );

    scene.add.existing(this);
    scene.physics.add.existing(this);

    Perspectiva.dePe(this, 48, 48);
    Perspectiva.corpo(this, 26, 32, 11, 12);
    this.body.setImmovable(true);
    this.setAngle(0);
    this.setDepth(31);

    this.minX = minX;
    this.maxX = maxX;
    this.minY = minY;
    this.maxY = maxY;
    this.isTop = isTop;
    this.isPlayerTeam = isPlayerTeam;

    this.isGoalkeeper = true;
    this.isHoldingBall = false;

    // Campo deitado: isTop = gol da ESQUERDA. A profundidade do gol corre em X
    // e a boca do gol corre em Y. baseX é a linha de gol, goalCenterY o meio dela.
    const lineOffset =
      scene.GOAL_LINE_OFFSET !== undefined ? scene.GOAL_LINE_OFFSET : 0;
    const pitchX = scene.PITCH_X !== undefined ? scene.PITCH_X : 200;
    const pitchW = scene.PITCH_WIDTH !== undefined ? scene.PITCH_WIDTH : 1600;

    this.baseX = isTop ? pitchX + lineOffset : pitchX + pitchW - lineOffset;
    this.goalCenterY =
      (scene.PITCH_Y !== undefined ? scene.PITCH_Y : 200) +
      (scene.PITCH_HEIGHT || 1000) / 2;

    this.customVel = new Phaser.Math.Vector2(0, 0);
    this.pendulumRadius = 40;

    this.diveTimer = 0;
    this.diveCooldown = 0;
    this.diveDirection = 0;
    this.targetDiveSpeed = 0;
    this.catchCooldown = 0; // Cooldown entre tentativas de pegar a bola

    this.atlasKey = "goalkeeper_atlas";
    this.currentFacing = isTop ? "east" : "west";
    this.lookAngle = Phaser.Math.DegToRad(isTop ? 0 : 180);
    this.isJumping = false;
    this.prevX = x;
    this.prevY = y;
    this.lastMoveY = 0;
    this.play(`${this.atlasKey}_idle_${this.currentFacing}`, true);
  }

  update(time, delta) {
    if (this.isSweeping === undefined) {
      this.isSweeping = false;
      this.sweepTimer = 0;
    }
    const dt = delta / 16.6666;
    const ball = this.scene.ball;
    const startX = this.x;
    const startY = this.y;

    if (this.catchCooldown > 0) this.catchCooldown -= delta;

    if (!ball || this.scene.isGameOver || this.scene.isResetting) {
      this.customVel.set(0, 0);
      this.setVelocity(0, 0);
      this.isJumping = false;
      this.updateAnimation();
      return;
    }

    if (this.isHoldingBall) {
      this.handleArmador(dt, ball);
      this.isJumping = false;
      this.updateFacingFromVelocityOrLook();
      this.updateHitbox();
      this.updateAnimation();
      return;
    }

    if (this.diveCooldown > 0) this.diveCooldown -= dt * 16.666;

    if (this.diveTimer > 0) {
      this.diveTimer -= dt * 16.666;
      this.isJumping = true;

      this.customVel.y = this.diveDirection * this.targetDiveSpeed;
      this.customVel.x = this.isTop ? 0.3 : -0.3;

      this.lookAngle = this.diveDirection > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.currentFacing = this.diveDirection > 0 ? "south" : "north";
      this.setAngle(0);

      this.setVelocity(this.customVel.x * 60, this.customVel.y * 60);
      this.clampBounds();
      this.updateHitbox();
      this.updateAnimation();
      return;
    }

    this.isJumping = false;

    // Goleiro-líbero: bola solta perto da área e ele chega antes. Sai da meta.
    if (this.updateSweeper(ball, delta)) {
      this.setAngle(0);
      this.setVelocity(this.customVel.x * 60, this.customVel.y * 60);
      this.updateHitbox();
      this.updateAnimation();
      return;
    }

    // Encontrar o jogador que está com a bola
    let attackingPlayer = ball.owner;
    if (!attackingPlayer) {
      // Se a bola não tem dono, procurar o jogador inimigo mais próximo da bola
      attackingPlayer = this.findNearestAttacker(ball);
    }

    // Gatilho do Pulo (Mergulho) - mantido
    let ballApproaching = false;
    if (this.isTop && ball.body.velocity.x < -200) ballApproaching = true;
    if (!this.isTop && ball.body.velocity.x > 200) ballApproaching = true;

    if (ballApproaching && this.diveCooldown <= 0) {
      const vx = Math.abs(ball.body.velocity.x);
      const timeToReachGoal = Math.abs((ball.x - this.baseX) / vx);
      const ballFutureY =
        ball.y + (ball.body.velocity.y / 60) * timeToReachGoal * 60;

      const goalMinY = this.goalCenterY - GOAL_WIDTH / 2 - 40;
      const goalMaxY = this.goalCenterY + GOAL_WIDTH / 2 + 40;

      if (ballFutureY > goalMinY && ballFutureY < goalMaxY) {
        const distLateral = Math.abs(ballFutureY - this.y);
        const maxWalkDist = timeToReachGoal * 240;

        if (distLateral > maxWalkDist && distLateral < 180) {
          const reqSpeedPps = distLateral / timeToReachGoal;
          const reqSpeedPpf = reqSpeedPps / 60;

          this.targetDiveSpeed = Phaser.Math.Clamp(
            reqSpeedPpf * GOALKEEPER.DIVE_SPEED_EFFICIENCY,
            GOALKEEPER.DIVE_SPEED_MIN,
            GOALKEEPER.DIVE_SPEED_MAX,
          );
          const timeSecs = distLateral / (this.targetDiveSpeed * 60);

          this.diveTimer = timeSecs * 1000;
          this.diveCooldown = 1800;
          this.diveDirection = ballFutureY > this.y ? 1 : -1;
          this.currentFacing = this.diveDirection > 0 ? "south" : "north";
          this.play(`${this.atlasKey}_jumping_${this.currentFacing}`, true);
        }
      }
    }

    // Novas regras de posicionamento do goleiro
    if (attackingPlayer) {
      const distToAttacker = Phaser.Math.Distance.Between(
        this.x,
        this.y,
        attackingPlayer.x,
        attackingPlayer.y
      );

      const attackDir = this.isTop ? 1 : -1;
      const attackerInBox = this.isAttackerInMyBox(attackingPlayer);
      const distToGoalFromAttacker = Phaser.Math.Distance.Between(
        attackingPlayer.x,
        attackingPlayer.y,
        this.baseX,
        this.goalCenterY
      );

      let targetX, targetY;
      let moveSpeed = GOALKEEPER.MOVE_SPEED; // pesado: ver GOALKEEPER em constants.js

      // Regra 1 e 2: Encurta o espaço / fecha o ângulo
      if (attackerInBox || distToGoalFromAttacker < 300) {
        // X1: Sair do gol para encurtar o ângulo
        const rushDistance = Math.min(distToGoalFromAttacker * 0.4, 140);
        const angleToAttacker = Phaser.Math.Angle.Between(
          this.baseX,
          this.goalCenterY,
          attackingPlayer.x,
          attackingPlayer.y
        );

        targetX = this.baseX + Math.cos(angleToAttacker) * (this.pendulumRadius * 0.8) + (this.isTop ? rushDistance : -rushDistance);
        targetY = this.goalCenterY + Math.sin(angleToAttacker) * (this.pendulumRadius * 0.8);

        // Priorizar o lado do atacante para fechar o ângulo
        const attackerSideOffset = (attackingPlayer.y - this.goalCenterY) * 0.5;
        targetY += attackerSideOffset;
      } else {
        // Posicionamento padrão: cobrir o canto do atacante
        const angleToAttacker = Phaser.Math.Angle.Between(
          this.baseX,
          this.goalCenterY,
          attackingPlayer.x,
          attackingPlayer.y
        );
        targetX = this.baseX + Math.cos(angleToAttacker) * (this.pendulumRadius * 0.8);
        targetY = this.goalCenterY + Math.sin(angleToAttacker) * (this.pendulumRadius * 1.2);
      }

      // Mover para o alvo com velocidade aumentada
      const angleToTarget = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
      const distToTarget = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);

      if (distToTarget > 5) {
        this.customVel.x = Math.cos(angleToTarget) * moveSpeed;
        this.customVel.y = Math.sin(angleToTarget) * moveSpeed;
      } else {
        this.customVel.set(0, 0);
      }

      this.lookAngle = Phaser.Math.Angle.RotateTo(
        this.lookAngle,
        Phaser.Math.Angle.Between(this.x, this.y, attackingPlayer.x, attackingPlayer.y),
        0.16 * dt
      );
      const movedX = this.customVel.x;
      const movedY = this.customVel.y;
      if (movedX * movedX + movedY * movedY > 0.01) {
        this.currentFacing = this.get8WayDirection(
          Phaser.Math.RadToDeg(Math.atan2(movedY, movedX))
        );
      } else {
        this.currentFacing = this.get8WayDirection(
          Phaser.Math.RadToDeg(Phaser.Math.Angle.Between(this.x, this.y, attackingPlayer.x, attackingPlayer.y))
        );
      }

    } else {
      // Se ninguém tem a bola, comportamento padrão
      this.customVel.set(0, 0);
      const angleGoalToBall = Phaser.Math.Angle.Between(
        this.baseX,
        this.goalCenterY,
        ball.x,
        ball.y
      );
      const targetX = this.baseX + Math.cos(angleGoalToBall) * this.pendulumRadius;
      const targetY = this.goalCenterY + Math.sin(angleGoalToBall) * this.pendulumRadius;
      const prevX = this.x;
      const prevY = this.y;
      this.x = Phaser.Math.Linear(this.x, targetX, 0.05 * dt);
      this.y = Phaser.Math.Linear(this.y, targetY, 0.05 * dt);
      this.lookAngle = Phaser.Math.Angle.RotateTo(
        this.lookAngle,
        angleGoalToBall,
        0.12 * dt
      );
      const movedX = this.x - prevX;
      const movedY = this.y - prevY;
      if (movedX * movedX + movedY * movedY > 0.01) {
        this.currentFacing = this.get8WayDirection(
          Phaser.Math.RadToDeg(Math.atan2(movedY, movedX))
        );
      } else {
        this.currentFacing = this.get8WayDirection(
          Phaser.Math.RadToDeg(angleGoalToBall)
        );
      }
    }

    this.setAngle(0);
    this.setVelocity(this.customVel.x * 60, this.customVel.y * 60);
    this.clampBounds();
    this.lastMoveY = this.y - startY;
    this.prevX = this.x;
    this.prevY = this.y;
    this.updateHitbox();
    this.updateAnimation();
  }

  /**
   * Goleiro-líbero. Devolve `true` quando assumiu o frame — o resto do `update`
   * (posicionamento pendular, clampBounds) não roda, senão a meta o puxaria de
   * volta no mesmo frame em que ele sai.
   *
   * A saída é decidida por TEMPO, não por distância: só vale se ele chega na
   * bola antes do atacante mais próximo, com margem. Empate técnico com o
   * atacante é gol feito, porque ele estaria fora do gol quando a bola voltar.
   */
  updateSweeper(ball, delta) {
    const naZona =
      !ball.owner &&
      Phaser.Math.Distance.Between(
        this.baseX,
        this.goalCenterY,
        ball.x,
        ball.y,
      ) <= GOALKEEPER.SWEEP_RADIUS;

    if (this.isSweeping) {
      // Já saiu: só volta quando a situação acaba ou o teto de tempo estoura.
      this.sweepTimer -= delta;
      if (!naZona || this.sweepTimer <= 0) {
        this.isSweeping = false;
        this.sweepTimer = 0;
        return false;
      }
    } else {
      if (!naZona || !this.chegoPrimeiro(ball)) return false;
      this.isSweeping = true;
      this.sweepTimer = GOALKEEPER.SWEEP_MAX_MS;
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, ball.x, ball.y);
    if (dist < GOALKEEPER.SWEEP_CLEAR_DIST) {
      this.clearBall(ball);
      this.isSweeping = false;
      this.sweepTimer = 0;
      this.customVel.set(0, 0);
      return true;
    }

    const rumo = Phaser.Math.Angle.Between(this.x, this.y, ball.x, ball.y);
    this.customVel.x = Math.cos(rumo) * GOALKEEPER.MOVE_SPEED;
    this.customVel.y = Math.sin(rumo) * GOALKEEPER.MOVE_SPEED;
    this.lookAngle = rumo;
    this.currentFacing = this.get8WayDirection(Phaser.Math.RadToDeg(rumo));
    return true;
  }

  /** Chego na bola antes do atacante mais próximo, com margem? */
  chegoPrimeiro(ball) {
    const meuTempo =
      Phaser.Math.Distance.Between(this.x, this.y, ball.x, ball.y) /
      (GOALKEEPER.MOVE_SPEED * 60);

    let tempoRival = Infinity;
    this.scene.allPlayers.forEach((p) => {
      if (p.isPlayerTeam === this.isPlayerTeam) return;
      const v = (p.sprintSpeed || 1) * 60;
      tempoRival = Math.min(
        tempoRival,
        Phaser.Math.Distance.Between(p.x, p.y, ball.x, ball.y) / v,
      );
    });

    return meuTempo + GOALKEEPER.SWEEP_TIME_MARGIN_S < tempoRival;
  }

  /** Chutão para longe do gol, para a lateral mais livre. */
  clearBall(ball) {
    const paraFora = this.isTop ? 1 : -1;
    // Afasta para o lado em que a bola já está, longe do meio da área.
    const lado = ball.y < this.goalCenterY ? -1 : 1;
    const vx = paraFora * GOALKEEPER.SWEEP_CLEAR_SPEED * 0.8;
    const vy = lado * GOALKEEPER.SWEEP_CLEAR_SPEED * 0.6;

    ball.owner = null;
    ball.body.enable = true;
    if (ball.applyImpulse) ball.applyImpulse(vx / 60, vy / 60, 3);
    else {
      ball.customVx = vx / 60;
      ball.customVy = vy / 60;
    }
    ball.body.setVelocity(vx, vy);
    ball.stealCooldown = 400;
    ball.lastKickType = "clearance";
    if (this.scene.lastTouchTeam !== undefined) {
      this.scene.lastTouchTeam = this.isPlayerTeam ? "PLAYER" : "OPPONENT";
      this.scene.lastTouch = this;
    }
    if (this.scene.spawnImpactDust)
      this.scene.spawnImpactDust(this.x, this.y, 0xd8c08a);
    this.catchCooldown = GOALKEEPER.CATCH_COOLDOWN_MS;
  }

  // Método para encontrar o atacante inimigo mais próximo da bola
  findNearestAttacker(ball) {
    let nearest = null;
    let minDist = 9999;
    this.scene.allPlayers.forEach(player => {
      if (player.isPlayerTeam !== this.isPlayerTeam) {
        const dist = Phaser.Math.Distance.Between(ball.x, ball.y, player.x, player.y);
        if (dist < minDist) {
          minDist = dist;
          nearest = player;
        }
      }
    });
    return (minDist < 200) ? nearest : null; // Só considera se estiver muito próximo da bola
  }

  // Método para verificar se o atacante está na minha área
  isAttackerInMyBox(attacker) {
    return (
      attacker.x >= this.minX &&
      attacker.x <= this.maxX &&
      attacker.y >= this.minY &&
      attacker.y <= this.maxY
    );
  }

  get8WayDirection(angle) {
    let normalized = angle;
    while (normalized < 0) normalized += 360;
    while (normalized >= 360) normalized -= 360;

    if (normalized >= 337.5 || normalized < 22.5) return "east";
    if (normalized >= 22.5 && normalized < 67.5) return "south-east";
    if (normalized >= 67.5 && normalized < 112.5) return "south";
    if (normalized >= 112.5 && normalized < 157.5) return "south-west";
    if (normalized >= 157.5 && normalized < 202.5) return "west";
    if (normalized >= 202.5 && normalized < 247.5) return "north-west";
    if (normalized >= 247.5 && normalized < 292.5) return "north";
    if (normalized >= 292.5 && normalized < 337.5) return "north-east";
    return "south";
  }

  updateFacingFromVelocityOrLook() {
    const speedSq = this.customVel.lengthSq();
    if (speedSq > 0.01) {
      this.currentFacing = this.get8WayDirection(
        Phaser.Math.RadToDeg(Math.atan2(this.customVel.y, this.customVel.x)),
      );
    } else {
      this.currentFacing = this.get8WayDirection(
        Phaser.Math.RadToDeg(this.lookAngle),
      );
    }
    this.setAngle(0);
  }

  updateAnimation() {
    const speedSq = this.customVel.lengthSq();
    const animType = this.isJumping
      ? "jumping"
      : speedSq > 0.02
        ? "walk"
        : "idle";
    const animKey = `${this.atlasKey}_${animType}_${this.currentFacing}`;

    if (this.anims.currentAnim?.key !== animKey) {
      this.play(animKey, true);
    }

    if (animType === "jumping") {
      this.anims.timeScale = 1.35;
    } else if (animType === "walk") {
      this.anims.timeScale = 1.0;
    } else {
      this.anims.timeScale = 0.9;
    }
  }

  updateHitbox() {
    if (!this.body) return;

    // A comparação é com a fonte (`sourceWidth`), não com `body.width`: a
    // largura vivida já vem multiplicada pela escala do sprite, então ela nunca
    // é igual a 44 e o hitbox era reescrito todo frame.
    if (this.isJumping) {
      if (this.body.sourceWidth !== 44) Perspectiva.corpo(this, 44, 26, 2, 14);
    } else {
      if (this.body.sourceWidth !== 26) Perspectiva.corpo(this, 26, 32, 11, 12);
    }
  }

  handleArmador(dt, ball) {
    const frontEdgeX = this.isTop ? this.maxX - 25 : this.minX + 25;
    const distToEdge = Math.abs(this.x - frontEdgeX);
    const distToCenter = Math.abs(this.y - this.goalCenterY);

    // Se estiver muito longe do ponto de reposição, caminha até lá
    if (distToEdge > 8 || distToCenter > 8) {
      const angleToEdge = Phaser.Math.Angle.Between(
        this.x,
        this.y,
        frontEdgeX,
        this.goalCenterY,
      );
      const walkSpeed = GOALKEEPER.WALK_SPEED_ARMADOR;

      this.customVel.x = Math.cos(angleToEdge) * walkSpeed;
      this.customVel.y = Math.sin(angleToEdge) * walkSpeed;

      // Olha para o centro do campo enquanto caminha
      const pX = this.scene.PITCH_X || 200;
      const pY = this.scene.PITCH_Y || 200;
      const pW = this.scene.PITCH_WIDTH || 1600;
      const pH = this.scene.PITCH_HEIGHT || 1000;
      const centerX = pX + pW / 2;
      const centerY = pY + pH / 2;

      const lookCenter = Phaser.Math.Angle.Between(
        this.x,
        this.y,
        centerX,
        centerY,
      );
      this.lookAngle = Phaser.Math.Angle.RotateTo(
        this.lookAngle,
        lookCenter,
        0.08 * dt,
      );
    } else {
      // Chegou no ponto ou perto dele
      this.customVel.set(0, 0);

      // Se o timer ainda existe, podemos esperar um pouco ou soltar logo
      // Mas se o timer acabou (repoTimer === null), a bola será solta pelo próprio callback do timer.
      // Aqui apenas olhamos para um companheiro.
      let teammate = this.getTeammate();
      if (teammate) {
        const targetAngle = Phaser.Math.Angle.Between(
          this.x,
          this.y,
          teammate.x,
          teammate.y,
        );
        this.lookAngle = Phaser.Math.Angle.RotateTo(
          this.lookAngle,
          targetAngle,
          0.12 * dt,
        );
      }
    }

    // Sincroniza rotação para que a bola (no GameScene) siga a direção que o goleiro olha
    this.rotation = this.lookAngle;

    this.setAngle(0);
    this.setVelocity(this.customVel.x * 60, this.customVel.y * 60);
    this.clampBounds();
  }

  clampBounds() {
    this.x = Phaser.Math.Clamp(this.x, this.minX + 28, this.maxX - 28);
    this.y = Phaser.Math.Clamp(this.y, this.minY + 16, this.maxY - 16);
  }

  catchBall(ball) {
    // Não capturar durante reset para evitar bola presa
    if (this.isHoldingBall || ball.owner === this) return;
    if (this.scene.isResetting || this.scene.isGameOver) return;
    if (this.catchCooldown > 0) return;

    const speed = ball.body.velocity.length();
    const decision = this.shouldParry(ball, speed);
    // Luva na bola: espalmar e segurar fazem o mesmo barulho, e é aqui que os
    // dois caminhos ainda estão juntos.
    Som.tocar("defesa");
    // Defesa pesa o quanto o chute pesava: bomba espalha, toque quase não.
    const impacto = Phaser.Math.Clamp(speed / BALL_PHYSICS.PASS_SPEED_MAX, 0.12, 1);
    if (this.scene.spawnImpactDust)
      this.scene.spawnImpactDust(ball.x, ball.y, 0xffffff, { forca: impacto });
    EfeitosVisuais.tremer(this.scene, 60 + 70 * impacto, 0.0015 + 0.005 * impacto);
    if (decision.parry) {
      this.parryBall(ball, decision);
      return;
    }

    this.isHoldingBall = true;
    ball.owner = this;
    ball.stealCooldown = 9999;
    this.catchCooldown = 450;

    // Atualiza Last Touch na cena
    if (this.scene.lastTouchTeam !== undefined) {
      this.scene.lastTouchTeam = this.isPlayerTeam ? "PLAYER" : "OPPONENT";
      this.scene.lastTouch = this;
    }

    ball.body.setVelocity(0, 0);
    ball.customVx = 0;
    ball.customVy = 0;

    this.customVel.set(0, 0);
    this.setVelocity(0, 0);
    this.isJumping = false;
    this.diveTimer = 0; // CORREÇÃO: Cancela qualquer pulo em andamento ao agarrar
    this.updateAnimation();

    // Timer de reposição (máximo 1.45s segurando a bola)
    this.repoTimer = this.scene.time.delayedCall(1450, () => {
      if (this.isHoldingBall) {
        this.repoTimer = null;
        this.repositionBall(ball);
      }
    });
  }

  shouldParry(ball, speed) {
    const scene = this.scene;
    const lastKicker = ball.lastKicker || scene.lastTouch;
    const distShooter = lastKicker
      ? Phaser.Math.Distance.Between(lastKicker.x, lastKicker.y, this.x, this.y)
      : 9999;
    const lateralVelocity = Math.abs(ball.body.velocity.y);
    const gkMovingDown = this.lastMoveY > 0.15;
    const ballGoingDown = ball.body.velocity.y > 0;
    const counterFooted =
      Math.abs(this.lastMoveY) > 0.15 &&
      gkMovingDown !== ballGoingDown &&
      lateralVelocity > 120;
    const closeRange = distShooter < 330;
    const veryCloseRange = distShooter < 210;
    const recentShot =
      ball.lastKickType === "shot" &&
      scene.time.now - (ball.lastKickAt || 0) < 1400;

    let parryScore = 0;
    if (speed > 510) parryScore += 2;
    if (speed > 660) parryScore += 2;
    if (closeRange && speed > 430) parryScore += 1;
    if (veryCloseRange && speed > 360) parryScore += 1;
    if (counterFooted) parryScore += 2;
    if (this.isJumping) parryScore += 1;
    if (recentShot) parryScore += 1;

    return {
      parry: parryScore >= 3,
      speed,
      distShooter,
      counterFooted,
      closeRange,
      veryCloseRange,
    };
  }

  // MELHORIA: getTeammate escolhe o aliado mais bem posicionado (mais avançado e livre)
  getTeammate() {
    const scene = this.scene;
    const isAttackingTop = scene.isSecondHalf ? !this.isTop : this.isTop;

    // Determinar qual time é "meu time"
    // O goleiro de cima (isTop=true) defende o time que ataca para baixo no primeiro tempo
    // No primeiro tempo: gkTop defende o time inimigo (enemy team), gkBottom defende o player team
    let myTeamIsPlayerTeam;
    if (!scene.isSecondHalf) {
      myTeamIsPlayerTeam = !this.isTop; // gkBottom = player team, gkTop = enemy team
    } else {
      myTeamIsPlayerTeam = this.isTop; // Lados trocam no segundo tempo
    }

    let bestTeammate = null;
    let bestScore = -9999;

    const lineOffset = scene.GOAL_LINE_OFFSET || 0;
    const targetGoalX = isAttackingTop
      ? (scene.PITCH_X || 200) + lineOffset
      : (scene.PITCH_X || 200) + (scene.PITCH_WIDTH || 1600) - lineOffset;
    const centerY = (scene.PITCH_Y || 200) + (scene.PITCH_HEIGHT || 1000) / 2;

    scene.allPlayers.forEach((p) => {
      if (p.isPlayerTeam === myTeamIsPlayerTeam) {
        const distToGoal = Phaser.Math.Distance.Between(
          p.x,
          p.y,
          targetGoalX,
          centerY,
        );
        // Preferir jogadores mais avançados e mais próximos do gol adversário
        let score = 2000 - distToGoal;

        // Penalizar se estiver muito perto do goleiro (passe curto demais)
        const distToGK = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y);
        if (distToGK < 100) score -= 800;

        // Verificar se a linha de passe está livre
        const passLine = new Phaser.Geom.Line(this.x, this.y, p.x, p.y);
        let blocked = false;
        scene.allPlayers.forEach((e) => {
          if (e.isPlayerTeam !== myTeamIsPlayerTeam) {
            if (
              Phaser.Geom.Intersects.LineToRectangle(
                passLine,
                new Phaser.Geom.Rectangle(e.x - 20, e.y - 20, 40, 40),
              )
            ) {
              blocked = true;
            }
          }
        });
        if (blocked) score -= 1000;

        if (score > bestScore) {
          bestScore = score;
          bestTeammate = p;
        }
      }
    });

    // Fallback para o comportamento original se não encontrar ninguém
    if (!bestTeammate) {
      if (!scene.isSecondHalf) {
        return this.isTop ? scene.enemy : scene.player;
      } else {
        return this.isTop ? scene.player : scene.enemy;
      }
    }

    return bestTeammate;
  }

  parryBall(ball, decision = {}) {
    this.scene.showFloatingText(
      this.x,
      this.y - 40,
      decision.counterFooted ? "Espalmou no contrapé!" : "Espalmou!",
      "#ffffff",
    );
    if (this.scene.spawnImpactDust)
      this.scene.spawnImpactDust(this.x, this.y, 0xffffff);
    EfeitosVisuais.tremer(this.scene, 80, 0.0035);

    const currentVel = ball.body.velocity.clone();
    const incomingSpeed = currentVel.length();
    const awayX = this.isTop ? 1 : -1;
    const sidePreference = ball.y < this.y ? -1 : 1;
    const randomSide = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
    const side = Math.abs(ball.y - this.y) > 12 ? sidePreference : randomSide;

    const lateralPower = Phaser.Math.Clamp(incomingSpeed * 0.36, 180, 380);
    const forwardPower = Phaser.Math.Clamp(
      incomingSpeed * (decision.veryCloseRange ? 0.28 : 0.22),
      120,
      280,
    );
    const contrapeBonus = decision.counterFooted ? 1.25 : 1.0;

    let reflectY = side * lateralPower * contrapeBonus + currentVel.y * 0.12;
    let reflectX = awayX * forwardPower;

    // Se o chute veio muito central e forte, rebate para frente; caso contrário, espalma para lado.
    if (Math.abs(ball.y - this.y) > 28) {
      reflectX *= 0.65;
    }

    ball.owner = null;
    ball.body.enable = true;
    ball.body.setVelocity(reflectX, reflectY);

    // Atualiza Last Touch na cena
    if (this.scene.lastTouchTeam !== undefined) {
      this.scene.lastTouchTeam = this.isPlayerTeam ? "PLAYER" : "OPPONENT";
      this.scene.lastTouch = this;
    }

    // Se a bola tiver o sistema de Eixo Z, aplica um pequeno impulso vertical na defesa
    if (ball.applyImpulse) {
      ball.applyImpulse(reflectX / 60, reflectY / 60, 2.5 + Math.random() * 2);
    } else {
      ball.customVx = reflectX / 60;
      ball.customVy = reflectY / 60;
    }

    ball.stealCooldown = 520;
    ball.lastKickType = "parry";

    this.catchCooldown = 700;
    this.diveCooldown = 520;
    this.isHoldingBall = false;
    this.play(`${this.atlasKey}_idle_${this.currentFacing}`, true);
  }

  reconfigureSide(minX, maxX, minY, maxY, isTop, isPlayerTeam) {
    this.minX = minX;
    this.maxX = maxX;
    this.minY = minY;
    this.maxY = maxY;
    this.isTop = isTop;
    this.isPlayerTeam = isPlayerTeam;

    const scene = this.scene;
    const lineOffset =
      scene.GOAL_LINE_OFFSET !== undefined ? scene.GOAL_LINE_OFFSET : 0;
    const pitchX = scene.PITCH_X !== undefined ? scene.PITCH_X : 200;
    const pitchW = scene.PITCH_WIDTH !== undefined ? scene.PITCH_WIDTH : 1600;
    this.baseX = isTop ? pitchX + lineOffset : pitchX + pitchW - lineOffset;

    this.currentFacing = isTop ? "east" : "west";
    this.lookAngle = Phaser.Math.DegToRad(isTop ? 0 : 180);
    this.play(`${this.atlasKey}_idle_${this.currentFacing}`, true);
    this.resetGK();
  }

  resetGK() {
    this.isHoldingBall = false;
    this.catchCooldown = 0;
    this.prevX = this.x;
    this.prevY = this.y;
    this.lastMoveY = 0;
    this.customVel.set(0, 0);
    this.diveTimer = 0;
    this.diveCooldown = 0;
    this.isJumping = false;
    this.setAngle(0);
    this.updateHitbox();
    this.updateAnimation();
    if (this.repoTimer) {
      this.repoTimer.remove();
      this.repoTimer = null;
    }
  }

  repositionBall(ball) {
    if (this.scene.isGameOver || this.scene.isResetting) return;

    if (ball.owner === this && this.isHoldingBall) {
      ball.owner = null;
      this.isHoldingBall = false;

      // Cooldown maior para não pegar a bola imediatamente de novo
      this.catchCooldown = 1200;
      ball.stealCooldown = 600;

      let teammate = this.getTeammate();

      let targetX =
        (this.scene.PITCH_X || 200) + (this.scene.PITCH_WIDTH || 1600) / 2;
      let targetY =
        (this.scene.PITCH_Y || 200) + (this.scene.PITCH_HEIGHT || 1000) / 2;
      let passForce = 16;

      if (teammate) {
        targetX = teammate.x;
        targetY = teammate.y;
        const distToTeammate = Phaser.Math.Distance.Between(
          this.x,
          this.y,
          targetX,
          targetY,
        );
        // Força proporcional à distância, mas com um mínimo e máximo saudáveis
        passForce = Phaser.Math.Clamp(distToTeammate * 0.045, 14, 28);
      }

      const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
      this.lookAngle = angle;
      this.rotation = angle;
      this.currentFacing = this.get8WayDirection(Phaser.Math.RadToDeg(angle));
      this.updateAnimation();

      // Posiciona a bola um pouco à frente do goleiro na direção do passe
      ball.x = this.x + Math.cos(angle) * 48;
      ball.y = this.y + Math.sin(angle) * 48;

      ball.body.enable = true;
      ball.body.reset(ball.x, ball.y);

      ball.customVx = Math.cos(angle) * passForce;
      ball.customVy = Math.sin(angle) * passForce;

      // Feedback visual
      if (this.scene.showFloatingText) {
        this.scene.showFloatingText(
          this.x,
          this.y - 40,
          "Reposição",
          "#ffffff",
        );
      }
    }
  }
}

// =============================================================================
// Check: o goleiro-líbero. A decisão é por TEMPO, e o erro aqui é caro dos dois
// lados: sair sem chegar antes é gol feito com o gol vazio; não sair nunca é o
// lançamento nas costas da zaga que ninguém corta. Nada disso grita no console.
// =============================================================================
console.assert(
  (() => {
    if (typeof GOALKEEPER === "undefined") return true;
    const gk = Object.create(Goalkeeper.prototype);
    gk.x = 200;
    gk.y = 700;
    gk.isPlayerTeam = true;

    const cena = (atacantes) => ({ allPlayers: atacantes });
    const bola = (x, y) => ({ x, y });
    // Atacante de linha típico: sprint ~2.5 unidades = 150 px/s.
    const rival = (x, y) => ({ isPlayerTeam: false, x, y, sprintSpeed: 2.5 });

    // Bola solta a 100px dele e o rival a 400px: sai.
    gk.scene = cena([rival(700, 700)]);
    const saiTranquilo = gk.chegoPrimeiro(bola(300, 700));

    // Mesma bola, rival colado nela: NÃO sai (sairia para perder a disputa
    // fora do gol).
    gk.scene = cena([rival(330, 700)]);
    const naoSai = gk.chegoPrimeiro(bola(300, 700));

    // Companheiro perto não conta — só adversário disputa.
    gk.scene = cena([{ isPlayerTeam: true, x: 310, y: 700, sprintSpeed: 2.5 }]);
    const aliadoNaoConta = gk.chegoPrimeiro(bola(300, 700));

    // Ninguém em campo: chega primeiro por definição.
    gk.scene = cena([]);
    const semRival = gk.chegoPrimeiro(bola(300, 700));

    return (
      saiTranquilo === true &&
      naoSai === false &&
      aliadoNaoConta === true &&
      semRival === true &&
      // A margem existe e é a favor de ficar no gol.
      GOALKEEPER.SWEEP_TIME_MARGIN_S > 0 &&
      // E a saída tem teto: ele não persegue a bola pelo campo inteiro.
      GOALKEEPER.SWEEP_MAX_MS > 0
    );
  })(),
  "Goleiro: critério de saída do líbero errado (sai sem chegar antes, ou nunca sai)",
);
