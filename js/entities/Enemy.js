class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(
    scene,
    x,
    y,
    speedAttr = 75,
    kickPowerAttr = 75,
    staminaAttr = 75,
    teamName = "Palmeiras",
    appearance = null,
    stats = null,
  ) {
    // Aparência vem de fora e é determinística (elenco ou save). O fallback
    // ancora no nome do time em vez de sortear: dois jogos seguidos com o mesmo
    // elenco produzem exatamente os mesmos rostos.
    const variant = appearance || getPlayerAppearance({ id: teamName });
    const atlasKey =
      scene.buildKitAtlas?.(scene, teamName, variant) || `${teamName}_atlas`;
    super(scene, x, y, atlasKey, "idle_south");
    this.atlasKey = atlasKey;
    this.variant = variant;
    this.kickAnimUntil = 0;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    // 48px era o tamanho de tela quando a célula do atlas tinha 68. A célula
    // cresceu para 76 (o export novo tem PNGs de até 96 e todos entram
    // centrados nela), e o personagem ocupa a mesma quantidade de pixels de
    // sempre — só ganhou margem transparente em volta. Escalar pelo tamanho da
    // CÉLULA mantém o boneco do mesmo tamanho em campo; deixar 48 fixo o
    // encolheria 10%.
    const _px = (48 * (typeof BASE_FRAME_SIZE !== "undefined" ? BASE_FRAME_SIZE : 68)) / 68;
    // Esticado na vertical de propósito: a câmera está inclinada e achata tudo
    // (ver Perspectiva). O boneco é das poucas coisas que precisa continuar de
    // pé, então ele é DESENHADO mais alto para voltar ao tamanho certo na tela.
    Perspectiva.dePe(this, _px, _px);
    // O offset acompanha a CÉLULA do atlas: era 12/20 quando o frame tinha
    // 68px. Número fixo aqui desalinha o corpo do desenho toda vez que o
    // tamanho do sprite muda (foi o que aconteceu com o asset novo).
    const _celula = typeof BASE_FRAME_SIZE !== "undefined" ? BASE_FRAME_SIZE : 68;
    const _folga = (_celula - 68) / 2;
    // O corpo passa pela mesma porta: sem ela, esticar o desenho esticaria o
    // hitbox junto e o boneco roubaria bola mais longe sem nada no console.
    Perspectiva.corpo(this, 24, 24, 12 + _folga, 20 + _folga);
    this.body.setBounce(0);
    this.setAngle(0);
    this.setDepth(29);

    // Add keys just like Player for user control mode
    this.keys = scene.input.keyboard.addKeys({
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      c: Phaser.Input.Keyboard.KeyCodes.C,
      q: Phaser.Input.Keyboard.KeyCodes.Q,
      e: Phaser.Input.Keyboard.KeyCodes.E,
      x: Phaser.Input.Keyboard.KeyCodes.X,
    });

    this.previousR1State = false;

    this.isUserControlled = false;
    this.receivedPassFlag = false;

    // A ficha manda quando vem no payload; sem ela, os três atributos soltos
    // (chamadas antigas) viram ficha. `passing`/`defending` caem no padrão.
    this.stats = normalizeStats(
      stats || { speed: speedAttr, power: kickPowerAttr, stamina: staminaAttr },
    );
    this.speedAttr = this.stats.speed;
    this.kickPowerAttr = this.stats.power;
    this.staminaAttr = this.stats.stamina;

    this.applyAttributes();

    this.stamina = this.maxStamina;
    this.sprintStaminaCostPerSecond = STAMINA.SPRINT_PER_SEC;
    this.passStaminaCost = STAMINA.PASS_COST;
    this.kickStaminaCost = STAMINA.KICK_COST;

    this.isSprintingAI = false;
    this.sprintTimer = 0;

    this.isChargingKick = false;
    this.kickChargeTime = 0;
    this.maxKickChargeTime = 800;
    this.targetChargeTime = 0;
    this.kickType = null;
    this.chargeTargetX = 0;
    this.chargeTargetY = 0;

    this.passCooldown = 0;
    this.passMinCooldown = 1500;

    this.customVel = new Phaser.Math.Vector2(0, 0);
    this.customAcc = new Phaser.Math.Vector2(0, 0);
    this.stunTimer = 0;
    this.hitStopTimer = 0;
    this.oneTwoTimer = 0;
    this.shieldTimer = 0;
    this.shieldCooldown = 0;
    this.pendingFirstTimeShot = 0;
    this.invulnerableTimer = 0;
    this.tackleSlowTimer = 0;
    this.attackTargetY = 500;
    this.hasTargetCorner = false;
    // MELHORIA: timer para só atualizar o alvo do PIVOT periodicamente (evita jitter)
    this.targetUpdateTimer = 0;
    this.targetUpdateInterval = 800; // ms entre atualizações de posição aleatória

    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.isDashing = false;
    this.tackleHit = false;

    this.dodgeTimer = 0;
    this.dodgeAngleOffset = 0;

    this.currentFacing = "south";
    this.moveAngle = 90;
    this.isPlayerTeam = false;
    this.archetype = "PIVOT";
    this.tactic = TACTICS.T3_1;
    this.receivedPassFlag = false; // Flag para chute de primeira

    // Inicializar alvos dinâmicos
    const pY = scene.PITCH_Y || 200;
    const pH = scene.PITCH_HEIGHT || 1000;
    this.attackTargetY = pY + pH / 2;
  }

  applyAttributes() {
    // Lê PLAYER_ATTR: antes os números viviam hardcoded aqui e a constante era
    // decorativa — mexer em constants.js não mudava nada no jogo.
    this.baseSpeed =
      (PLAYER_ATTR.BASE_SPEED_COEF +
        (this.speedAttr - 50) * PLAYER_ATTR.BASE_SPEED_VAR) *
      PLAYER_ATTR.BASE_SPEED_SCALE;
    this.sprintSpeed =
      (PLAYER_ATTR.SPRINT_SPEED_COEF +
        (this.speedAttr - 50) * PLAYER_ATTR.SPRINT_SPEED_VAR) *
      PLAYER_ATTR.SPRINT_SPEED_SCALE;
    // Piso: com atributo baixo a fórmula chega a zero, e maxStamina 0
    // estoura toda conta de percentual de fôlego.
    this.maxStamina = Math.max(
      PLAYER_ATTR.ENEMY_MAX_STAMINA_COEF +
        (this.staminaAttr - 50) * PLAYER_ATTR.ENEMY_MAX_STAMINA_VAR,
      STAMINA.MIN_CAPACITY,
    );
    this.stamina = this.maxStamina;
    this.maxKickForce =
      PLAYER_ATTR.ENEMY_MAX_KICK_FORCE_COEF +
      (this.kickPowerAttr - 50) * PLAYER_ATTR.ENEMY_MAX_KICK_FORCE_VAR;
    this.maxForce = 0.45; // Reduzido de 0.5
  }

  handleMovement(dt, delta) {
    // Impedir que o jogador saia andando com a bola durante estados de bola parada
    const isSetPiece = ehBolaParada(this.scene.gameState);

    if (isSetPiece) {
      this.customVel.set(0, 0);
      this.body.setAcceleration(0, 0);
      this.setVelocity(0, 0);
      return;
    }

    this.customAcc.set(0, 0);
    let mx = 0,
      my = 0;

    // Ler gamepad, se disponível
    const pad = this.scene.input.gamepad.pad1;
    if (pad && pad.connected) {
      // Analógico esquerdo (axes 0 = x, 1 = y)
      mx = pad.axes[0].getValue();
      my = pad.axes[1].getValue();

      // Se analógico estiver com pouco movimento, tenta D-Pad
      if (Math.abs(mx) < 0.1 && Math.abs(my) < 0.1) {
        if (pad.left) mx = -1;
        else if (pad.right) mx = 1;
        if (pad.up) my = -1;
        else if (pad.down) my = 1;
      }
    }

    // Ler teclado como fallback
    if (this.keys.a.isDown) mx = -1;
    else if (this.keys.d.isDown) mx = 1;
    if (this.keys.w.isDown) my = -1;
    else if (this.keys.s.isDown) my = 1;

    this.timeSinceLastStaminaUsed = this.timeSinceLastStaminaUsed || 0;
    this.isStaminaDepleted = this.isStaminaDepleted || false;
    this.currentStamina = this.currentStamina || this.stamina;
    this.timeSinceLastStaminaUsed += delta;
    if (this.isStaminaDepleted) {
      if (!this._exhaustedTintActive) {
        this.setTint(0xff8800);
        this._exhaustedTintActive = true;
      }
      if (
        this.timeSinceLastStaminaUsed >= (this.staminaRecoveryDelay || STAMINA.RECOVERY_DELAY_MS)
      ) {
        this.currentStamina +=
          ((this.staminaRecoveryRate || STAMINA.RECOVERY_RATE_PER_SEC) / 1000) * delta;
        if (this.currentStamina >= 5) {
          this.isStaminaDepleted = false;
          this.clearTint();
          this._exhaustedTintActive = false;
          this.applyAttributes();
        }
      }
    } else {
      if (
        this.timeSinceLastStaminaUsed >= (this.staminaRecoveryDelay || STAMINA.RECOVERY_DELAY_MS)
      ) {
        this.currentStamina +=
          ((this.staminaRecoveryRate || STAMINA.RECOVERY_RATE_PER_SEC) / 1000) * delta;
      }
    }
    this.currentStamina = Phaser.Math.Clamp(
      this.currentStamina,
      0,
      this.maxStamina,
    );
    this.stamina = this.currentStamina;

    if (this.isDashing) {
      let rad = Phaser.Math.DegToRad(this.moveAngle);
      mx = Math.cos(rad);
      my = Math.sin(rad);
      this.customVel.x = mx * this.sprintSpeed;
      this.customVel.y = my * this.sprintSpeed;
    } else {
      if (mx !== 0 || my !== 0) {
        // Vira o corpo girando até a direção do input em vez de teleportar o
        // ângulo. Só o facing/dash/chute usam moveAngle — o deslocamento segue
        // mx/my direto, então a resposta ao controle não fica devendo.
        this.moveAngle = Phaser.Math.RadToDeg(
          Phaser.Math.Angle.RotateTo(
            Phaser.Math.DegToRad(this.moveAngle),
            Math.atan2(my, mx),
            INPUT_CONFIG.TURN_RATE_RAD * dt,
          ),
        );
        this.currentFacing = this.get8WayDirection(this.moveAngle);
      }

      // Sprint (Shift ou botão de ombro esquerdo - LB)
      let isSprinting = this.keys.shift.isDown;
      if (pad && pad.connected) {
        isSprinting = isSprinting || pad.L1 || pad.LB; // L1 ou LB
      }

      if (
        isSprinting &&
        (mx !== 0 || my !== 0) &&
        !this.isStaminaDepleted &&
        this.currentStamina > 0 &&
        this.tackleSlowTimer <= 0
      ) {
        this.isRunning = true;
        this.currentStamina -= (this.sprintStaminaCostPerSecond / 1000) * delta;
        this.timeSinceLastStaminaUsed = 0;
        if (this.currentStamina <= 0) {
          this.currentStamina = 0;
          this.isStaminaDepleted = true;
          this.baseSpeed *= 0.7;
          this.timeSinceLastStaminaUsed = 0;
        }
      } else {
        this.isRunning = false;
      }

      if (this.dashCooldown > 0) this.dashCooldown -= delta;

      // Bote (Espaço ou botão R1/RB)
      let shouldTackle = Phaser.Input.Keyboard.JustDown(this.keys.space);
      let currentR1State = false;
      if (pad && pad.connected) {
        currentR1State = !!(pad.R1 || pad.RB); // true se R1 ou RB estiver pressionado
        shouldTackle =
          shouldTackle || (currentR1State && !this.previousR1State);
      }
      this.previousR1State = currentR1State;

      // Mesmo bote do `Player`: este ramo só roda quando um ALIADO virou o
      // boneco controlado (a troca de jogador põe um `Enemy` no comando), então
      // o carrinho tem de valer igual. Um lugar só — ver Player.iniciarBote.
      if (shouldTackle) Player.iniciarBote(this);
    }

    if (!this.isDashing) {
      let desired = new Phaser.Math.Vector2(mx, my);
      if (desired.lengthSq() > 0) desired.normalize();

      let currentMaxSpeed = this.isRunning ? this.sprintSpeed : this.baseSpeed;

      // MELHORIA: Chuva reduz tração
      if (this.scene.weather === "rain") {
        currentMaxSpeed *= 0.92;
      }

      // Aplicar penalidade de lentidão (bote errado)
      if (this.tackleSlowTimer > 0) {
        currentMaxSpeed *= 0.4;
      }

      // Arcade cuida da curva: acelera até `maxVelocity` e o drag desacelera
      // sozinho ao soltar o controle. Substituiu o integrador manual
      // (steer + damping) que fazia o mesmo em 25 linhas de conta na mão.
      this.body.setMaxVelocity(currentMaxSpeed * 60);
      this.body.setDrag(PLAYER_PHYSICS.DRAG, PLAYER_PHYSICS.DRAG);
      if (desired.lengthSq() > 0) {
        const vel = this.body.velocity;
        const vLen = vel.length();
        const virando =
          vLen > 10 && (desired.x * vel.x + desired.y * vel.y) / vLen < 0.2;
        const acc =
          PLAYER_PHYSICS.ACCELERATION * (virando ? PLAYER_PHYSICS.TURN_BOOST : 1);
        this.body.setAcceleration(desired.x * acc, desired.y * acc);
      } else {
        this.body.setAcceleration(0, 0); // só o drag age: desliza e para
      }
      // `maxVelocity` do Arcade é por EIXO: na diagonal o teto vira 1,41x.
      // Limita o MÓDULO para andar de lado não ser mais rápido que andar reto.
      const tetoPx = currentMaxSpeed * 60;
      if (this.body.velocity.lengthSq() > tetoPx * tetoPx)
        this.body.velocity.normalize().scale(tetoPx);
      // Espelha em `customVel`: bote e marcas de derrapagem leem daqui.
      this.customVel.set(this.body.velocity.x / 60, this.body.velocity.y / 60);
      return;
    }

    // Bote/dash: rajada direta, sem steering, com drag mais leve.
    this.body.setAcceleration(0, 0);
    this.body.setDrag(PLAYER_PHYSICS.DASH_DRAG, PLAYER_PHYSICS.DASH_DRAG);
    this.body.setMaxVelocity(this.sprintSpeed * 60 * 1.45);
    this.setVelocity(this.customVel.x * 60, this.customVel.y * 60);
  }

  update(time, delta) {
    const dt = delta / 16.6666;
    const scene = this.scene;
    const ball = scene.ball;

    // If user controlled, use Player movement logic, else AI!
    if (this.isUserControlled) {
      // Gerenciar Timers
      if (this.invulnerableTimer > 0) this.invulnerableTimer -= delta;
      if (this.tackleSlowTimer > 0) this.tackleSlowTimer -= delta;

      if (this.stunTimer > 0) {
        this.setTint(0x555555);
        this._exhaustedTintActive = false;
        this.stunTimer -= delta;
        this.customVel.set(0, 0);
        this.body.setAcceleration(0, 0);
        this.setVelocity(0, 0);
        this.updateAnimation(false);
        return;
      } else {
        // Limpar tint de stun apenas se não estiver exausto
        if (!this.isStaminaDepleted) {
          this.clearTint();
          this._exhaustedTintActive = false;
        }
        this.stunTimer = 0;
      }

      if (this.dashTimer <= 0) {
        if (this.isDashing && !this.tackleHit) {
          this.tackleSlowTimer = Math.max(this.tackleSlowTimer, 520);
          this.tackleSlowTimer = Math.max(
            this.tackleSlowTimer || 0,
            Player.lentidaoDoErro(this),
          );
          if (this.scene.showFloatingText)
            this.scene.showFloatingText(
              this.x,
              this.y - 36,
              "Bote errado",
              "#ff8a65",
            );
        }
        this.isDashing = false;
        this.tackleHit = false;
        this.dashTimer = 0;
      } else {
        this.dashTimer -= delta;
        if (this.scene.spawnImpactDust && Phaser.Math.Between(1, 4) === 1) {
          this.scene.spawnImpactDust(
            this.x - Math.cos(Phaser.Math.DegToRad(this.moveAngle)) * 10,
            this.y - Math.sin(Phaser.Math.DegToRad(this.moveAngle)) * 10,
            0xcbb88a,
          );
        }
      }

      this.handleMovement(dt, delta);
      this.handleRotation =
        this.handleRotation ||
        (() => {
          this.rotation = Phaser.Math.DegToRad(this.moveAngle);
          this.setAngle(0);
        });
      this.handleRotation();
      this.updateAnimation(true);
      this.updateSkidMarks(delta);
      return;
    }

    // IA: uma FSM só, compartilhada com o Player. Este bloco era ~800 linhas
    // duplicadas do `Player.updateEnemyAI()` mais o motor de chute/passe.
    AIBrain.update(this, time, delta);
  }

  /**
   * Derrapou? Compara o vetor de velocidade com o do frame anterior: freada
   * brusca (perda grande de módulo) ou curva fechada (giro grande de direção),
   * ambas só valendo acima de uma velocidade mínima.
   */
  updateSkidMarks(delta) {
    const vx = this.body.velocity.x;
    const vy = this.body.velocity.y;
    const speed = Math.hypot(vx, vy);

    if (!this._prevVel) this._prevVel = { x: vx, y: vy };
    const prev = this._prevVel;
    const prevSpeed = Math.hypot(prev.x, prev.y);

    this._skidCooldown = Math.max(0, (this._skidCooldown || 0) - delta);
    this._skidTimer = Math.max(0, (this._skidTimer || 0) - delta);

    // Gatilho: só a partir de velocidade alta, para caminhada nunca marcar.
    if (prevSpeed > SKID_MARK.MIN_SPEED) {
      const freando = prevSpeed - speed > SKID_MARK.BRAKE_DROP;
      const curvando =
        speed > SKID_MARK.MIN_SPEED &&
        Math.abs(
          Phaser.Math.Angle.Wrap(
            Math.atan2(vy, vx) - Math.atan2(prev.y, prev.x),
          ),
        ) > SKID_MARK.TURN_RAD;
      if (freando || curvando) this._skidTimer = SKID_MARK.STREAK_MS;
    }

    // Emissão: durante a janela, mesmo já desacelerado. Nos pés, não no centro.
    if (this._skidTimer > 0 && this._skidCooldown === 0 && speed > 20) {
      this.scene.spawnSkidMark?.(
        this.x,
        this.y + 14,
        Math.atan2(prev.y, prev.x),
      );
      this._skidCooldown = SKID_MARK.COOLDOWN_MS;
    }

    prev.x = vx;
    prev.y = vy;
  }

  get8WayDirection(angle) {
    let n = (angle + 360) % 360;
    if (n >= 337.5 || n < 22.5) return "east";
    if (n < 67.5) return "south-east";
    if (n < 112.5) return "south";
    if (n < 157.5) return "south-west";
    if (n < 202.5) return "west";
    if (n < 247.5) return "north-west";
    if (n < 292.5) return "north";
    return "north-east";
  }

  updateAnimation(canAnimate) {
    if (!this.anims) return; // Segurança

    if (!canAnimate) {
      const idleKey = `${this.atlasKey}_idle_${this.currentFacing}`;
      if (this.scene.anims.exists(idleKey)) {
        this.play(idleKey, true);
      }
      return;
    }
    // Velocidade real do corpo (px/s) — não o estado "isSprintingAI". Assim a
    // animação acompanha sprint, lentidão por bote e queda de stamina sozinha.
    const speed = Math.hypot(this.body.velocity.x, this.body.velocity.y);
    const isMoving = speed > 10;
    // Chute tem prioridade sobre correr/parar: é a pose mais informativa.
    const isKicking = this.scene.time.now < (this.kickAnimUntil || 0);
    const acao = isKicking ? "kick" : isMoving ? "run" : "idle";
    const animKey = `${this.atlasKey}_${acao}_${this.currentFacing}`;

    if (this.scene.anims.exists(animKey)) {
      if (this.anims.currentAnim?.key !== animKey) this.play(animKey, true);
      // baseSpeed*60 = passo de caminhada = ritmo 1.0. Clamp evita patinação
      // no arranque e frames borrados no pique máximo.
      this.anims.timeScale = isKicking
        ? 1 // a pose de chute tem ritmo próprio, não escala com a corrida
        : isMoving
          ? Phaser.Math.Clamp(speed / (this.baseSpeed * 60), 0.65, 2.2)
          : 0.9;
    }

    // MELHORIA: Feedback visual para baixa stamina
    if (this.stunTimer <= 0) {
      const staminaPercentage = this.stamina / this.maxStamina;
      if (staminaPercentage < STAMINA.LOW_STAMINA_PCT) {
        this.setAlpha(0.7);
      } else {
        this.setAlpha(1.0);
      }
    }

    // Feedback visual de tackle slow
    if (this.tackleSlowTimer > 0 && this.stunTimer <= 0) {
      this.setTint(0x8888ff);
    } else if (this.stunTimer <= 0 && !this._exhaustedTintActive) {
      this.clearTint();
    }
  }

  // === NOVOS MÉTODOS PARA IA MELHORADA ===
  isCounterAttackOpportunity(scene) {
    const pX = scene.PITCH_X || 200;
    const pY = scene.PITCH_Y || 200;
    const pW = scene.PITCH_WIDTH || 1600;
    const pH = scene.PITCH_HEIGHT || 1000;
    const isAttackingTop = scene.isSecondHalf
      ? !this.isPlayerTeam
      : this.isPlayerTeam;

    // 1. Estamos no nosso campo?
    const ourHalfX = isAttackingTop ? pX + pW / 2 : pX;
    if (
      (isAttackingTop && this.x > ourHalfX) ||
      (!isAttackingTop && this.x < ourHalfX)
    ) {
      // 2. Muitos inimigos no nosso campo?
      let enemiesInOurHalf = 0;
      let totalEnemies = 0;
      scene.allPlayers.forEach((p) => {
        if (p.isPlayerTeam !== this.isPlayerTeam) {
          totalEnemies++;
          if (
            (isAttackingTop && p.x > pX + pW / 2) ||
            (!isAttackingTop && p.x < pX + pW / 2)
          ) {
            enemiesInOurHalf++;
          }
        }
      });

      if (enemiesInOurHalf >= totalEnemies * 0.6) {
        return true;
      }
    }
    return false;
  }

  findForwardAlly(scene) {
    const isAttackingTop = scene.isSecondHalf
      ? !this.isPlayerTeam
      : this.isPlayerTeam;
    const pX = scene.PITCH_X || 200;
    const pY = scene.PITCH_Y || 200;
    const pW = scene.PITCH_WIDTH || 1600;
    const pH = scene.PITCH_HEIGHT || 1000;
    let bestAlly = null;
    let bestScore = -9999;
    let bestTarget = null; // Para armazenar a posição prevista

    scene.allPlayers.forEach((p) => {
      if (p.isPlayerTeam === this.isPlayerTeam && p !== this) {
        const distToMe = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y);
        if (distToMe < 100 || distToMe > 500) return;

        const isAhead = isAttackingTop ? p.x < this.x - 50 : p.x > this.x + 50;
        if (!isAhead) return;

        // Prever a posição do aliado com base na sua velocidade
        const predictionFactor = 25;
        let futureX = Phaser.Math.Clamp(
          p.x + (p.body.velocity.x / 60) * predictionFactor,
          pX + 50,
          pX + pW - 50,
        );
        let futureY = Phaser.Math.Clamp(
          p.y + (p.body.velocity.y / 60) * predictionFactor,
          pY + 50,
          pY + pH - 50,
        );

        // Adicionar offset extra na direção do ataque
        futureX += isAttackingTop ? -80 : 80;

        let score = 0;

        // Mais à frente = melhor
        const xDist = isAttackingTop ? this.x - p.x : p.x - this.x;
        score += xDist / 10;

        // Menos inimigos perto = melhor (usando a posição prevista)
        let enemiesNear = 0;
        scene.allPlayers.forEach((e) => {
          if (e.isPlayerTeam !== this.isPlayerTeam) {
            const d = Phaser.Math.Distance.Between(futureX, futureY, e.x, e.y);
            if (d < 80) enemiesNear++;
          }
        });
        score -= enemiesNear * 50;

        if (score > bestScore) {
          bestScore = score;
          bestAlly = p;
          bestTarget = { x: futureX, y: futureY };
        }
      }
    });

    if (!bestAlly) return null;
    // Retornar um objeto que tem x, y (posição prevista) e ally
    return {
      ally: bestAlly,
      x: bestTarget.x,
      y: bestTarget.y,
    };
  }
}
