// =============================================================================
// AIBrain.js — cérebro ÚNICO da IA de jogador de linha (FSM)
// =============================================================================
// Antes esta inteligência existia duas vezes: `Player.updateEnemyAI()` e o corpo
// de `Enemy.update()`. Mesmo preâmbulo, mesma locomoção, mesma perseguição —
// e o Enemy ainda tinha o motor de chute/passe que o time do usuário nunca teve
// (aliado com a bola só driblava rumo ao gol, nunca passava). Um cérebro só
// resolve a duplicação E o buraco de comportamento.
//
// Tudo é estático: o estado vive na entidade (`entity.aiState`), não aqui.
// O arquivo anterior era uma rede DQN em TensorFlow que ninguém carregava nem
// chamava — `tf` sequer entra no index.html.
//
// Ciclo de um frame:
//   1. guardas (bola parada, atordoado, jogo acabou)
//   2. timers, stamina, dash, sprint
//   3. contexto do frame (campo, goleiro adversário, marcador mais próximo)
//   4. FSM: decideState() -> execute<Estado>() devolve o ângulo alvo
//   5. locomoção comum (separação, suavização, velocidade, animação)

class AIBrain {
  // ── Diferenças entre as duas entidades ────────────────────────────────────
  // `Player` guarda `currentStamina`; `Enemy` guarda `stamina`. Renomear
  // cascatearia no HUD e na substituição, então o cérebro lê pelos dois nomes.
  static stamina(e) {
    return e.currentStamina !== undefined ? e.currentStamina : e.stamina || 0;
  }

  static setStamina(e, valor) {
    const v = Phaser.Math.Clamp(valor, 0, e.maxStamina);
    if (e.currentStamina !== undefined) e.currentStamina = v;
    if (e.stamina !== undefined) e.stamina = v;
  }

  /**
   * Hora de pensar? Decisão pesada roda a cada `DECISION_INTERVAL_MS`, com
   * jitter de ±25%: sem ele os 8 jogadores pensariam no MESMO frame e o custo
   * que se queria diluir viraria um pico a cada 180ms.
   * Entidade nova pensa no primeiro frame.
   */
  static shouldThink(entity, delta) {
    entity.decisionTimer = (entity.decisionTimer || 0) - delta;
    if (entity.decisionTimer > 0) return false;
    const base = AI_BEHAVIOR.DECISION_INTERVAL_MS;
    entity.decisionTimer = base * (0.75 + Math.random() * 0.5);
    return true;
  }

  // ── Ponto de entrada ──────────────────────────────────────────────────────
  /**
   * Dois ritmos: PENSAR (estado, alvo de chute/passe, bote) no tick de decisão;
   * MIRAR e ANDAR todo frame. O que custava O(n²) a 60fps era a escolha —
   * apontar para um alvo já escolhido é um `atan2`.
   */
  static update(entity, time, delta) {
    const dt = delta / 16.6666;
    const scene = entity.scene;
    const ball = scene.ball;

    if (!AIBrain.applyGuards(entity, ball, scene, delta)) return;
    AIBrain.tickTimers(entity, scene, delta);

    const ctx = AIBrain.buildContext(entity, scene, ball, delta, time);

    if (AIBrain.shouldThink(entity, delta)) {
      entity.aiState = AIBrain.decideState(entity, ctx);
      entity._aiPlan = AIBrain.think(entity, ctx);
    }

    // Chute de primeira: a bola acabou de chegar e a intenção já estava armada.
    // Roda por FRAME e BURLA o wind-up de propósito — esperar o tick de decisão
    // (~180ms) mais a carga é o tempo que a zaga usa para chegar.
    if (AIBrain.firstTimeShot(entity, ctx)) return;

    // Carga de chute/passe corre por frame: é ela que solta a bola na hora.
    // Solta o acelerador mas NÃO zera a velocidade: quem já vinha correndo
    // termina o movimento no drag. Zerar plantava o boneco no lugar (o humano
    // já não fazia isso) e cada finalização virava uma freada.
    if (entity.isChargingKick) {
      AIBrain.resolveCharge(entity, ctx);
      entity.body.setAcceleration(0, 0);
      entity.body.setDrag(PLAYER_PHYSICS.DRAG, PLAYER_PHYSICS.DRAG);
      entity.customVel.set(
        entity.body.velocity.x / 60,
        entity.body.velocity.y / 60,
      );
      entity.updateAnimation(entity.body.velocity.lengthSq() > 10);
      return;
    }

    const targetAngle = AIBrain.aim(entity, ctx);
    AIBrain.applyLocomotion(entity, ctx, targetAngle, dt);
    if (entity.updateSkidMarks) entity.updateSkidMarks(delta);
  }

  /**
   * A parte cara. Devolve um PLANO — um ponto de destino, não um ângulo: o
   * jogador anda entre um tick e outro, e ângulo guardado faria ele orbitar o
   * alvo em vez de chegar nele.
   */
  static think(entity, ctx) {
    switch (entity.aiState) {
      case AI_STATES.WITH_BALL:
        return AIBrain.executeWithBall(entity, ctx);
      case AI_STATES.DRIVE_TO_GOAL:
        return AIBrain.executeDriveToGoal(entity, ctx);
      case AI_STATES.SHIELD_BALL:
        return AIBrain.executeShieldBall(entity, ctx);
      case AI_STATES.SUPPORTING:
        return AIBrain.executeSupporting(entity, ctx);
      case AI_STATES.PRESSING:
        return AIBrain.executePressing(entity, ctx);
      case AI_STATES.RETREATING:
        return AIBrain.executeRetreating(entity, ctx);
      default:
        return AIBrain.executeDefending(entity, ctx);
    }
  }

  /**
   * Ângulo do frame a partir do plano. `chaseBall` é recalculado sempre: a bola
   * é a coisa mais rápida em campo e um alvo de 180ms atrás erraria a
   * interceptação por meio campo.
   */
  static aim(entity, ctx) {
    const plano = entity._aiPlan;
    if (!plano) return null;

    if (plano.chaseBall) {
      const alvo = AIBrain.interceptPoint(entity, ctx);
      return Phaser.Math.Angle.Between(entity.x, entity.y, alvo.x, alvo.y);
    }
    if (plano.hold) return null; // já chegou: para de andar

    const dist = Phaser.Math.Distance.Between(
      entity.x,
      entity.y,
      plano.x,
      plano.y,
    );
    if (plano.stopAt && dist < plano.stopAt) return null;

    let angulo = Phaser.Math.Angle.Between(entity.x, entity.y, plano.x, plano.y);
    if (plano.useDodge) angulo += entity.dodgeAngleOffset || 0;
    return angulo;
  }

  /** @returns {boolean} false quando o frame termina aqui. */
  static applyGuards(entity, ball, scene, delta) {
    const states = scene.GameStates;
    const isSetPiece =
      states &&
      (scene.gameState === states.THROW_IN ||
        scene.gameState === states.CORNER_KICK ||
        scene.gameState === states.GOAL_KICK);

    if (isSetPiece) {
      entity.customVel.set(0, 0);
      entity.body.setAcceleration(0, 0);
      entity.setVelocity(0, 0);
      // O batedor segue rodando a lógica para cobrar; o resto congela.
      if (ball.owner !== entity) return false;
    }

    // Hitstop do roubo de bola: congela o boneco por alguns frames. Fica ANTES
    // de qualquer timer para o congelamento ser de verdade.
    if (entity.hitStopTimer > 0) {
      entity.hitStopTimer = Math.max(0, entity.hitStopTimer - delta);
      entity.customVel.set(0, 0);
      entity.body.setAcceleration(0, 0);
      entity.setVelocity(0, 0);
      entity.updateAnimation(false);
      if (entity.hitStopTimer === 0) entity.clearTint();
      return false;
    }

    if (entity.invulnerableTimer > 0) entity.invulnerableTimer -= delta;
    if (entity.tackleSlowTimer > 0) entity.tackleSlowTimer -= delta;

    if (entity.stunTimer > 0) {
      entity.setTint(0x555555);
      entity.stunTimer -= delta;
      entity.customVel.set(0, 0);
      entity.body.setAcceleration(0, 0);
      entity.setVelocity(0, 0);
      entity.updateAnimation(false);
      return false;
    }

    entity.setAlpha(entity.invulnerableTimer > 0 ? 0.6 : 1.0);
    if (entity.tackleSlowTimer > 0) entity.setTint(0x8888ff);
    else entity.clearTint();

    if (!ball || scene.isGameOver || scene.isResetting) {
      entity.customVel.set(0, 0);
      entity.body.setAcceleration(0, 0);
      entity.setVelocity(0, 0);
      entity.updateAnimation(false);
      return false;
    }
    return true;
  }

  static tickTimers(entity, scene, delta) {
    // Dash / bote
    if (entity.dashTimer > 0 && AIBrain.stamina(entity) > 0) {
      entity.dashTimer -= delta;
      entity.isDashing = true;
      AIBrain.setStamina(
        entity,
        AIBrain.stamina(entity) - STAMINA.DASH_PER_SEC * (delta / 1000),
      );
      if (scene.spawnImpactDust && Phaser.Math.Between(1, 5) === 1) {
        scene.spawnImpactDust(entity.x, entity.y, 0xcbb88a);
      }
    } else {
      if (entity.isDashing && !entity.tackleHit) {
        entity.tackleSlowTimer = Math.max(entity.tackleSlowTimer, 480);
        if (scene.spawnImpactDust)
          scene.spawnImpactDust(entity.x, entity.y, 0x9aa4ad);
      }
      entity.isDashing = false;
      entity.tackleHit = false;
      entity.dashTimer = 0;
      if (entity.dashCooldown > 0) entity.dashCooldown -= delta;
    }

    // A ultrapassagem morre junto com a posse: sem isso ele seguiria correndo
    // para o ataque enquanto o adversário sai jogando.
    // Estes correm por FRAME: `think()` roda a cada ~180ms e um timer contado
    // lá drenaria 11x mais devagar que o relógio.
    if (entity.shieldCooldown > 0) entity.shieldCooldown -= delta;
    if (entity.shieldTimer > 0) entity.shieldTimer -= delta;

    if (entity.oneTwoTimer > 0) {
      const dono = scene.ball && scene.ball.owner;
      if (dono && dono.isPlayerTeam !== entity.isPlayerTeam)
        entity.oneTwoTimer = 0;
      else entity.oneTwoTimer -= delta;
    }

    // Sprint
    if (entity.sprintTimer > 0) {
      entity.sprintTimer -= delta;
      entity.isSprintingAI = true;
      if (AIBrain.stamina(entity) > 0) {
        AIBrain.setStamina(
          entity,
          AIBrain.stamina(entity) -
            (entity.sprintStaminaCostPerSecond / 1000) * delta,
        );
      } else {
        entity.isSprintingAI = false;
        entity.sprintTimer = 0;
      }
    } else {
      entity.isSprintingAI = false;
    }

    // Recuperação
    if (
      !entity.isDashing &&
      !entity.isSprintingAI &&
      AIBrain.stamina(entity) < entity.maxStamina
    ) {
      AIBrain.setStamina(
        entity,
        AIBrain.stamina(entity) + STAMINA.RECOVERY_AI_PER_SEC * (delta / 1000),
      );
    }
    AIBrain.setStamina(entity, AIBrain.stamina(entity));

    if (entity.passCooldown > 0) entity.passCooldown -= delta;
    if (entity.dodgeTimer > 0) entity.dodgeTimer -= delta;
    if (entity.targetUpdateTimer > 0) entity.targetUpdateTimer -= delta;
  }

  /**
   * Varredura de `allPlayers` — a única O(n) que dá para adiar. Reaproveitada
   * por `SCAN_CACHE_MS`: quem é o marcador mais próximo não muda em 100ms, e
   * rodar isso por jogador por frame é 8x8 distâncias a 60fps.
   */
  static scan(entity, scene, ball, now) {
    const cache = entity._aiScan;
    if (cache && now - cache.t < AI_BEHAVIOR.SCAN_CACHE_MS) return cache;

    let nearestEnemyDist = 9999;
    let nearestEnemy = null;
    let closestTeammate = null;
    let minDistToBall = 9999;
    scene.allPlayers.forEach((p) => {
      if (p.isPlayerTeam !== entity.isPlayerTeam) {
        const d = Phaser.Math.Distance.Between(entity.x, entity.y, p.x, p.y);
        if (d < nearestEnemyDist) {
          nearestEnemyDist = d;
          nearestEnemy = p;
        }
      } else {
        const d = Phaser.Math.Distance.Between(p.x, p.y, ball.x, ball.y);
        if (d < minDistToBall) {
          minDistToBall = d;
          closestTeammate = p;
        }
      }
    });

    entity._aiScan = { t: now, nearestEnemy, nearestEnemyDist, closestTeammate };
    return entity._aiScan;
  }

  /** Tudo que os executores precisam. O que é caro vem do cache. */
  static buildContext(entity, scene, ball, delta, now = 0) {
    const isAttackingTop = scene.isSecondHalf
      ? !entity.isPlayerTeam
      : entity.isPlayerTeam;

    const pX = scene.PITCH_X || 200;
    const pY = scene.PITCH_Y || 200;
    const pW = scene.PITCH_WIDTH || 1600;
    const pH = scene.PITCH_HEIGHT || 1000;
    const lineOffset = scene.GOAL_LINE_OFFSET || 0;
    const centerY = pY + pH / 2;

    // Goleiro adversário: pelo time, com fallback para o lado atacado.
    let enemyGK = null;
    if (scene.gkTop && scene.gkTop.isPlayerTeam !== entity.isPlayerTeam)
      enemyGK = scene.gkTop;
    else if (scene.gkBottom && scene.gkBottom.isPlayerTeam !== entity.isPlayerTeam)
      enemyGK = scene.gkBottom;
    if (!enemyGK) enemyGK = isAttackingTop ? scene.gkTop : scene.gkBottom;

    const { nearestEnemy, closestTeammate } = AIBrain.scan(
      entity,
      scene,
      ball,
      now,
    );
    // A distância ao marcador cacheado é O(1) e vale a pena refazer: é ela que
    // dispara o drible, e 100ms de atraso aí se vê na tela.
    const nearestEnemyDist = nearestEnemy
      ? Phaser.Math.Distance.Between(
          entity.x,
          entity.y,
          nearestEnemy.x,
          nearestEnemy.y,
        )
      : 9999;

    const targetGoalX = isAttackingTop
      ? pX + lineOffset
      : pX + pW - lineOffset;

    return {
      scene,
      ball,
      delta,
      isAttackingTop,
      pX,
      pY,
      pW,
      pH,
      centerY,
      targetGoalX,
      ownGoalX: isAttackingTop ? pX + pW - lineOffset : pX + lineOffset,
      enemyGK,
      nearestEnemy,
      nearestEnemyDist,
      closestTeammate,
      distToBall: Phaser.Math.Distance.Between(
        entity.x,
        entity.y,
        ball.x,
        ball.y,
      ),
      distToGoal: Phaser.Math.Distance.Between(
        entity.x,
        entity.y,
        isAttackingTop ? pX + lineOffset : pX + pW - lineOffset,
        centerY,
      ),
      teamHasBall:
        !!ball.owner && ball.owner.isPlayerTeam === entity.isPlayerTeam,
      // Relógio e placar: "desperate", "stall" ou null. Muda exigência de
      // chute, alvo de passe e a linha do bloco.
      urgency: TacticManager.matchUrgency(scene, entity.isPlayerTeam),
    };
  }

  // ── FSM ───────────────────────────────────────────────────────────────────
  /**
   * Uma regra por estado, nesta ordem. Sem `else` escondido: o estado sai daqui
   * e os executores não voltam a decidir.
   */
  static decideState(entity, ctx) {
    if (ctx.ball.owner === entity) {
      if (AIBrain.shouldShield(entity, ctx)) return AI_STATES.SHIELD_BALL;
      return AIBrain.shouldDrive(entity, ctx)
        ? AI_STATES.DRIVE_TO_GOAL
        : AI_STATES.WITH_BALL;
    }
    if (ctx.teamHasBall) return AI_STATES.SUPPORTING;

    // Adversário (ou ninguém) com a bola: o mais próximo vai ao bote.
    if (ctx.closestTeammate === entity) return AI_STATES.PRESSING;

    // Quem está muito à frente do próprio gol recompõe correndo em vez de
    // voltar andando para a marcação.
    const distDoProprioGol = Math.abs(entity.x - ctx.ownGoalX);
    if (distDoProprioGol > ctx.pW * 0.55) return AI_STATES.RETREATING;

    return AI_STATES.DEFENDING_POSITION;
  }

  // ── Execução por estado ───────────────────────────────────────────────────
  /**
   * Corredor até o gol sem adversário no caminho. Um teste só para as duas
   * coisas que perguntam isso: a infiltração e a condução em linha reta.
   */
  static isDriveLaneClear(entity, ctx) {
    if (!ctx.scene || !ctx.scene.allPlayers) return false;
    const folga = AI_BEHAVIOR.DRIVE_LANE_CLEARANCE;
    return !ctx.scene.allPlayers.some((p) => {
      if (p.isPlayerTeam === entity.isPlayerTeam) return false;
      return (
        AIBrain.distanceToSegment(
          p.x,
          p.y,
          entity.x,
          entity.y,
          ctx.targetGoalX,
          ctx.centerY,
        ) < folga
      );
    });
  }

  /**
   * Terço final, corredor limpo e ainda longe o bastante para valer a corrida:
   * ele IGNORA o passe e vai. Era aqui que a nota de assistência ganhava do
   * chute e o atacante devolvia a bola para trás com o gol aberto.
   */
  static shouldDrive(entity, ctx) {
    if (ctx.distToGoal === undefined) return false;
    if (ctx.distToGoal <= AI_BEHAVIOR.DRIVE_UNTIL_DIST) return false;
    // Do MEIO-CAMPO para a frente, não só do terço final: com corredor limpo
    // até o gol, passe de segurança para trás é posse jogada fora. Quem é
    // rápido começa a arrancada de mais longe — é a vantagem dele.
    const alcanceDaArrancada =
      (ctx.pW / 2) *
      statWeight(
        AIBrain.stats(entity).speed,
        AI_BEHAVIOR.STAT_SPEED_DRIVE_AMPLITUDE,
      );
    if (ctx.distToGoal > alcanceDaArrancada) return false;
    // Só um companheiro na cara do gol tira a bola dele.
    if (AIBrain.betterPlacedAlly(entity, ctx)) return false;
    // Corredor limpo entra direto. Sujo ainda pode valer: se o caminho
    // IMEDIATO tem saída pelo lado, ele dribla em vez de abortar a corrida.
    if (AIBrain.isDriveLaneClear(entity, ctx)) return true;
    return !!AIBrain.evadePoint(entity, ctx, ctx.targetGoalX, ctx.centerY);
  }

  /**
   * Jogo de pivô: recebeu no terço final com zagueiro colado NAS COSTAS (entre
   * ele e o gol). Virar ali é perder a bola; ele segura e espera o apoio.
   * O timer é o que impede isso de virar paralisia — estourou, joga normal.
   */
  static shouldShield(entity, ctx) {
    if (entity.shieldTimer > 0) return true;
    if (entity.shieldCooldown > 0) return false;
    if (ctx.distToGoal === undefined) return false;
    if (ctx.distToGoal > ctx.pW * (1 - AI_BEHAVIOR.FINAL_THIRD_PCT))
      return false;
    if (!ctx.nearestEnemy || ctx.nearestEnemyDist > AI_BEHAVIOR.SHIELD_MARK_DIST)
      return false;
    // Nas COSTAS: o marcador está entre ele e o gol que ele ataca.
    const rumoAoGol = Math.sign(ctx.targetGoalX - entity.x);
    if ((ctx.nearestEnemy.x - entity.x) * rumoAoGol <= 0) return false;

    entity.shieldTimer = AI_BEHAVIOR.SHIELD_MAX_MS;
    return true;
  }

  /**
   * Segura a bola parado, de costas para o gol, até um ala ULTRAPASSAR a linha
   * da bola — e aí rola de lado para ele chutar de primeira. Não tenta virar:
   * era assim que a bola morria no pé do pivô.
   */
  static executeShieldBall(entity, ctx) {
    entity.hasTargetCorner = false;
    entity.sprintTimer = 0;

    const apoio = AIBrain.overlappingAlly(entity, ctx);
    if (apoio && entity.passCooldown <= 0 && !entity.isChargingKick) {
      entity.isChargingKick = true;
      entity.kickType = "pass";
      entity.targetChargeTime = 100;
      entity.chargeTargetX = apoio.x;
      entity.chargeTargetY = apoio.y;
      entity.chargeTargetEntity = apoio;
      entity.shieldTimer = 0;
      entity.shieldCooldown = AI_BEHAVIOR.SHIELD_MAX_MS;
    }

    if (entity.shieldTimer <= 0) {
      entity.shieldTimer = 0;
      entity.shieldCooldown = AI_BEHAVIOR.SHIELD_MAX_MS;
    }
    // `hold` = para de andar e deixa o drag zerar: proteger é ficar no lugar.
    return { hold: true };
  }

  /** Companheiro que já passou da linha da bola, com corredor limpo. */
  static overlappingAlly(entity, ctx) {
    const rumo = Math.sign(ctx.targetGoalX - entity.x);
    let melhor = null;
    ctx.scene.allPlayers.forEach((ally) => {
      if (ally === entity || ally.isPlayerTeam !== entity.isPlayerTeam) return;
      if ((ally.x - entity.x) * rumo < AI_BEHAVIOR.SHIELD_LAYOFF_LEAD) return;
      if (!AIBrain.isPassLaneClear(entity, ally, ctx)) return;
      const d = Phaser.Math.Distance.Between(entity.x, entity.y, ally.x, ally.y);
      if (d > AI_BEHAVIOR.PASS_RANGE_MAX) return;
      if (!melhor || d < melhor._d) {
        melhor = ally;
        melhor._d = d;
      }
    });
    return melhor;
  }

  /**
   * Infiltração: reta para o gol, sem avaliar passe. Sai sozinho ao chegar em
   * `DRIVE_UNTIL_DIST` — `decideState` devolve `WITH_BALL` e ele finaliza.
   */
  static executeDriveToGoal(entity, ctx) {
    entity.hasTargetCorner = false;
    if (AIBrain.stamina(entity) > AI_BEHAVIOR.SPRINT_STAMINA_THRESHOLD)
      entity.sprintTimer = 1200;
    const fuga = AIBrain.evadePoint(entity, ctx, ctx.targetGoalX, ctx.centerY);
    return { ...(fuga || { x: ctx.targetGoalX, y: ctx.centerY }), useDodge: true };
  }

  /**
   * Zagueiro atravessado logo à FRENTE (não na rota inteira, só no primeiro
   * lance): devolve um ponto 45° para o lado mais livre. É o tapa na bola para
   * fora do bote, sem parar de correr — a corrida em linha reta trombava.
   * `null` quando o caminho imediato está limpo.
   */
  static evadePoint(entity, ctx, alvoX, alvoY) {
    const rumo = Phaser.Math.Angle.Between(entity.x, entity.y, alvoX, alvoY);
    const olho = AI_BEHAVIOR.DRIVE_EVADE_LOOKAHEAD;
    const frente = {
      x: entity.x + Math.cos(rumo) * olho,
      y: entity.y + Math.sin(rumo) * olho,
    };

    const estorvo = ctx.scene.allPlayers.some(
      (p) =>
        p.isPlayerTeam !== entity.isPlayerTeam &&
        AIBrain.distanceToSegment(p.x, p.y, entity.x, entity.y, frente.x, frente.y) <
          AI_BEHAVIOR.DRIVE_LANE_CLEARANCE,
    );
    if (!estorvo) return null;

    // Dos dois lados, o que tiver o adversário mais longe.
    let melhor = null;
    for (const sinal of [1, -1]) {
      const ang = rumo + sinal * AI_BEHAVIOR.DRIVE_EVADE_ANGLE_RAD;
      const p = AIBrain.clampToPitch(
        {
          x: entity.x + Math.cos(ang) * AI_BEHAVIOR.DRIVE_EVADE_STEP,
          y: entity.y + Math.sin(ang) * AI_BEHAVIOR.DRIVE_EVADE_STEP,
        },
        ctx,
      );
      let folga = Infinity;
      ctx.scene.allPlayers.forEach((o) => {
        if (o.isPlayerTeam === entity.isPlayerTeam) return;
        folga = Math.min(
          folga,
          AIBrain.distanceToSegment(o.x, o.y, entity.x, entity.y, p.x, p.y),
        );
      });
      if (!melhor || folga > melhor.folga) melhor = { ...p, folga };
    }
    return melhor;
  }

  /**
   * Conduz, dribla e decide chute/passe. Devolve `false` quando entrou em carga
   * de chute (o jogador para e o frame termina).
   */
  static executeWithBall(entity, ctx) {
    const { scene, delta, centerY, targetGoalX, pX, pY, pW, pH } = ctx;

    // Contra-ataque: lançamento em profundidade para quem já está lançado.
    if (
      entity.isCounterAttackOpportunity &&
      entity.isCounterAttackOpportunity(scene) &&
      ctx.distToGoal > 400
    ) {
      const forwardData = entity.findForwardAlly
        ? entity.findForwardAlly(scene)
        : null;
      if (forwardData && entity.passCooldown <= 0) {
        entity.isChargingKick = true;
        entity.kickType = "through";
        entity.targetChargeTime = 180;
        entity.chargeTargetX = forwardData.x;
        entity.chargeTargetY = forwardData.y;
        entity.chargeTargetEntity = null;
      } else {
        entity.sprintTimer = 2000;
      }
    }

    // Alvo de condução atualizado só de tempos em tempos (evita tremer).
    if (!entity.hasTargetCorner || entity.targetUpdateTimer <= 0) {
      entity.attackTargetY = centerY + (Math.random() * (pH * 0.4) - pH * 0.2);
      entity.hasTargetCorner = true;
      entity.targetUpdateTimer = entity.targetUpdateInterval || 800;
    }

    let conducaoY = ctx.distToGoal < 400 ? centerY : entity.attackTargetY;
    const anguloConducao = Phaser.Math.Angle.Between(
      entity.x,
      entity.y,
      targetGoalX,
      conducaoY,
    );

    // Drible: sai da frente do marcador que está no caminho.
    if (
      ctx.nearestEnemy &&
      entity.dodgeTimer <= 0 &&
      ctx.nearestEnemyDist < 85
    ) {
      const angleToEnemy = Phaser.Math.Angle.Between(
        entity.x,
        entity.y,
        ctx.nearestEnemy.x,
        ctx.nearestEnemy.y,
      );
      if (
        Math.abs(Phaser.Math.Angle.Wrap(anguloConducao - angleToEnemy)) <
        Math.PI / 3
      ) {
        const side = entity.x < ctx.nearestEnemy.x ? -1 : 1;
        entity.dodgeAngleOffset = side * (Math.PI / 2.5);
        entity.dodgeTimer = 550;
        if (AIBrain.stamina(entity) > 15) {
          entity.sprintTimer = 800;
          if (scene.showFloatingText)
            scene.showFloatingText(entity.x, entity.y - 40, "Drible!", "#ffff00");
        }
        scene.tweens.add({
          targets: entity,
          dodgeAngleOffset: 0,
          duration: 450,
          ease: "Power2",
        });
      }
    }

    // Ângulo de gol, linha livre e canto longe do goleiro, num número só.
    // `null` = chutar dali é jogar fora.
    const chute = AIBrain.evaluateShotQuality(entity, ctx);

    // Chute de primeira logo após receber o passe.
    if (
      entity.receivedPassFlag &&
      chute &&
      ctx.distToGoal < AI_BEHAVIOR.FIRST_TIME_SHOT_DIST
    ) {
      if (!entity.isChargingKick) {
        entity.isChargingKick = true;
        entity.kickType = "shoot";
        entity.shotPower = AI_BEHAVIOR.FIRST_TIME_POWER;
        entity.targetChargeTime = 50;
        entity.chargeTargetX = targetGoalX;
        entity.chargeTargetY = chute.y;
        entity.chargeTargetEntity = null;
        entity.receivedPassFlag = false;
        if (scene.showFloatingText)
          scene.showFloatingText(entity.x, entity.y - 40, "DE PRIMEIRA!", "#ff00ff");
      }
    } else if (entity.receivedPassFlag && !entity.isChargingKick) {
      entity.resetFlagTimer = (entity.resetFlagTimer || 0) + delta;
      if (entity.resetFlagTimer > 300) {
        entity.receivedPassFlag = false;
        entity.resetFlagTimer = 0;
      }
    }

    // Corredor livre até o gol: acelera em linha reta. Mesmo teste da
    // infiltração — fora do terço final é só isto que ele rende.
    const hasClearPathToGoal =
      ctx.distToGoal > 200 && AIBrain.isDriveLaneClear(entity, ctx);
    if (hasClearPathToGoal) {
      conducaoY = centerY;
      if (AIBrain.stamina(entity) > 5) entity.sprintTimer = 1500;
    }

    // Decisão: finalizar perto do gol, passar sob pressão.
    const extremePressure = ctx.nearestEnemyDist < 50;
    let temPasse = false;
    // Chute sem ângulo, com a linha fechada ou em cima do goleiro não sai
    // enquanto houver companheiro melhor posicionado: vira assistência.
    const chuteFraco = !chute || chute.score < AIBrain.shotGoodScore(entity, ctx);

    // Segundo pau: ala invadindo a lateral da área sem ângulo. Antes de pensar
    // em chute ou passe para trás, procura quem está atacando a trave oposta.
    if (
      entity.passCooldown <= 0 &&
      !entity.isChargingKick &&
      AIBrain.isFarPostSituation(entity, ctx)
    ) {
      const trave = AIBrain.farPostPoint(entity, ctx);
      const noSegundoPau = AIBrain.closestAllyTo(entity, ctx, trave);
      if (noSegundoPau && AIBrain.isPassLaneClear(entity, noSegundoPau, ctx)) {
        entity.isChargingKick = true;
        entity.kickType = "pass";
        entity.targetChargeTime = 120;
        entity.chargeTargetX = noSegundoPau.x;
        entity.chargeTargetY = noSegundoPau.y;
        entity.chargeTargetEntity = noSegundoPau;
        temPasse = true;
      }
    }

    // Sem ângulo NENHUM, pressionado e dentro do terço final: chuta cruzado no
    // canto em vez de recuar a bola. Passe para trás aqui é posse desperdiçada.
    const noTercoFinal =
      ctx.distToGoal < ctx.pW * (1 - AI_BEHAVIOR.FINAL_THIRD_PCT);
    if (
      entity.passCooldown <= 0 &&
      !entity.isChargingKick &&
      !chute &&
      noTercoFinal &&
      ctx.nearestEnemyDist < AI_BEHAVIOR.HOLD_UP_PRESSURE_DIST
    ) {
      entity.isChargingKick = true;
      entity.kickType = "shoot";
      entity.shotPower = AIBrain.shotPower(ctx);
      entity.targetChargeTime = AIBrain.shotWindup(entity.shotPower);
      entity.chargeTargetX = targetGoalX;
      entity.chargeTargetY = AIBrain.forcedCornerY(ctx);
      entity.chargeTargetEntity = null;
    }

    if (entity.passCooldown <= 0 && !entity.isChargingKick && chuteFraco) {
      const assistencia = AIBrain.findBestPassTarget(entity, ctx, !chute);
      temPasse = !!assistencia;
      if (assistencia) {
        entity.isChargingKick = true;
        entity.kickType = "pass";
        entity.targetChargeTime = 140;
        entity.chargeTargetX = assistencia.x;
        entity.chargeTargetY = assistencia.y;
        entity.chargeTargetEntity = assistencia;
      }
    }
    // Passe pró-gol: companheiro na área com o gol mais aberto manda no lance.
    // Aqui o chute não é opção, por melhor que seja a nota dele.
    if (entity.passCooldown <= 0 && !entity.isChargingKick) {
      const melhorColocado = AIBrain.betterPlacedAlly(entity, ctx);
      if (melhorColocado) {
        entity.isChargingKick = true;
        entity.kickType = "pass";
        entity.targetChargeTime = 120;
        entity.chargeTargetX = melhorColocado.x;
        entity.chargeTargetY = melhorColocado.y;
        entity.chargeTargetEntity = melhorColocado;
        temPasse = true;
      }
    }

    if (entity.passCooldown <= 0 && !entity.isChargingKick && chute) {
      if (
        ctx.distToGoal <
        (ctx.urgency === "desperate" ? ctx.pW : AI_BEHAVIOR.SHOOT_DISTANCE_THRESHOLD)
      ) {
        entity.isChargingKick = true;
        entity.kickType = "shoot";
        entity.shotPower = AIBrain.shotPower(ctx);
        entity.targetChargeTime = AIBrain.shotWindup(entity.shotPower);
        entity.chargeTargetX = targetGoalX;
        entity.chargeTargetY = chute.y;
        entity.chargeTargetEntity = null;
      } else if (
        ctx.nearestEnemyDist < 75 ||
        (!hasClearPathToGoal && ctx.nearestEnemyDist < 150)
      ) {
        const alvo = AIBrain.findBestPassTarget(entity, ctx, extremePressure);
        temPasse = !!alvo;
        if (alvo) {
          entity.isChargingKick = true;
          entity.kickType = "pass";
          entity.targetChargeTime = 180;
          entity.chargeTargetX = alvo.x;
          entity.chargeTargetY = alvo.y;
          entity.chargeTargetEntity = alvo;
        }
      }
    }

    // Hold up play: pressionado, sem chute e sem passe. Protege a bola no
    // espaço livre em vez de correr para cima do marcador e perdê-la.
    if (
      !entity.isChargingKick &&
      ctx.nearestEnemyDist < AI_BEHAVIOR.HOLD_UP_PRESSURE_DIST &&
      !chute &&
      !temPasse
    ) {
      const abrigo = AIBrain.holdUpPoint(entity, ctx);
      if (abrigo) return { ...abrigo, useDodge: true };
    }

    // Plano de condução: ponto, não ângulo — ele anda entre um tick e outro.
    return { x: targetGoalX, y: conducaoY, useDodge: true };
  }

  /**
   * Para onde girar com a bola sob pressão: o lado OPOSTO ao marcador, puxando
   * de leve para trás. Não é recuar por recuar — é tirar o corpo da linha do
   * bote e esperar o apoio chegar.
   */
  static holdUpPoint(entity, ctx) {
    if (!ctx.nearestEnemy) return null;
    const fugindoDoMarcador = Phaser.Math.Angle.Between(
      ctx.nearestEnemy.x,
      ctx.nearestEnemy.y,
      entity.x,
      entity.y,
    );
    const d = AI_BEHAVIOR.HOLD_UP_TURN_DIST;
    const bruto = {
      x: entity.x + Math.cos(fugindoDoMarcador) * d,
      y: entity.y + Math.sin(fugindoDoMarcador) * d,
    };
    return AIBrain.clampToPitch(bruto, ctx);
  }

  /** Mantém um ponto dentro das linhas, com a mesma margem do TacticManager. */
  static clampToPitch(p, ctx) {
    return {
      x: Phaser.Math.Clamp(p.x, ctx.pX + 45, ctx.pX + ctx.pW - 45),
      y: Phaser.Math.Clamp(p.y, ctx.pY + 45, ctx.pY + ctx.pH - 45),
    };
  }

  /** Ala ou pivô: quem tem função de ataque e faz corrida nas costas da zaga. */
  static isOffensiveArchetype(entity) {
    return (
      entity.archetype === ARCHETYPES.WING_L ||
      entity.archetype === ARCHETYPES.WING_R ||
      entity.archetype === ARCHETYPES.PIVOT
    );
  }

  /** Algum adversário dentro do raio? Espaço só vale se estiver vazio. */
  static isSpaceFree(ponto, entity, ctx, raio) {
    return !ctx.scene.allPlayers.some(
      (p) =>
        p.isPlayerTeam !== entity.isPlayerTeam &&
        Phaser.Math.Distance.Between(ponto.x, ponto.y, p.x, p.y) < raio,
    );
  }

  /**
   * Corrida nas costas da zaga ("facão"). Só no terço final e só para ala/pivô:
   * o ponto fica ALÉM do último defensor, na faixa do arquétipo — ala abre na
   * lateral para cruzar, pivô centraliza e pisa na área.
   * @returns {null|{x,y}} null quando não é hora ou o espaço está povoado.
   */
  static throughRunTarget(entity, ctx) {
    if (!AIBrain.isOffensiveArchetype(entity)) return null;

    // Bola no terço final do ataque?
    const avanco = ctx.isAttackingTop
      ? (ctx.pX + ctx.pW - ctx.ball.x) / ctx.pW
      : (ctx.ball.x - ctx.pX) / ctx.pW;
    if (avanco < AI_BEHAVIOR.FINAL_THIRD_PCT) return null;

    // Último defensor adversário (o mais perto do gol que ele ataca).
    let ultimoX = null;
    ctx.scene.allPlayers.forEach((p) => {
      if (p.isPlayerTeam === entity.isPlayerTeam) return;
      if (ultimoX === null) ultimoX = p.x;
      else if (ctx.isAttackingTop) ultimoX = Math.min(ultimoX, p.x);
      else ultimoX = Math.max(ultimoX, p.x);
    });
    if (ultimoX === null) return null;

    const profundidade = ctx.isAttackingTop
      ? -AI_BEHAVIOR.THROUGH_RUN_DEPTH
      : AI_BEHAVIOR.THROUGH_RUN_DEPTH;

    // Faixa do arquétipo: ala vai para a linha de fundo do seu lado, pivô fura
    // pelo meio. Duas alturas por papel, e vale a primeira que estiver livre.
    const faixas =
      entity.archetype === ARCHETYPES.PIVOT
        ? [ctx.centerY, ctx.centerY - 70, ctx.centerY + 70]
        : entity.archetype === ARCHETYPES.WING_L
          ? [ctx.pY + ctx.pH * 0.18, ctx.pY + ctx.pH * 0.32]
          : [ctx.pY + ctx.pH * 0.82, ctx.pY + ctx.pH * 0.68];

    for (const y of faixas) {
      const alvo = AIBrain.clampToPitch(
        { x: ultimoX + profundidade, y },
        ctx,
      );
      if (AIBrain.isSpaceFree(alvo, entity, ctx, AI_BEHAVIOR.THROUGH_RUN_FREE_RADIUS))
        return alvo;
    }
    return null;
  }

  /**
   * Ponto que corta a linha de passe bola → atacante mais próximo. Fica do lado
   * do atacante (`LANE_CUT_BIAS`), que é onde a bola chega. Só vale dentro da
   * zona: cortar linha a meio campo de distância é abandonar o setor.
   */
  static laneCutPoint(entity, ctx, postoTatico) {
    const alvoMarcado = ctx.nearestEnemy;
    if (!alvoMarcado || !postoTatico) return null;

    const t = AI_BEHAVIOR.LANE_CUT_BIAS;
    const corte = AIBrain.clampToPitch(
      {
        x: ctx.ball.x + (alvoMarcado.x - ctx.ball.x) * t,
        y: ctx.ball.y + (alvoMarcado.y - ctx.ball.y) * t,
      },
      ctx,
    );

    // Bom zagueiro cobre mais espaço: a zona de onde ele aceita sair para
    // cortar a linha cresce com `defending`. Acima disso segue valendo a regra
    // velha — marcação zonal, não perseguição.
    const zona =
      AI_BEHAVIOR.DEFENSE_ZONE_RADIUS *
      statWeight(
        AIBrain.stats(entity).defending,
        AI_BEHAVIOR.STAT_DEFENDING_REACH_AMPLITUDE,
      );
    const foraDaZona =
      Phaser.Math.Distance.Between(
        corte.x,
        corte.y,
        postoTatico.x,
        postoTatico.y,
      ) > zona;
    return foraDaZona ? null : corte;
  }

  /**
   * Abertura angular do gol vista de onde ele está. É o critério de "ângulo
   * ruim": de frente a boca do gol abre muito; do canto da linha de fundo ela
   * some, e chutar dali é devolver a bola ao goleiro.
   */
  static goalOpeningAngle(entity, ctx) {
    const meiaBoca = 120; // metade da boca útil do gol, em px
    const a = Phaser.Math.Angle.Between(
      entity.x,
      entity.y,
      ctx.targetGoalX,
      ctx.centerY - meiaBoca,
    );
    const b = Phaser.Math.Angle.Between(
      entity.x,
      entity.y,
      ctx.targetGoalX,
      ctx.centerY + meiaBoca,
    );
    return Math.abs(Phaser.Math.Angle.Wrap(b - a));
  }

  /**
   * Distância PERPENDICULAR de um ponto ao segmento A→B, projetando e limitando
   * ao trecho (`t` fora de [0,1] = o inimigo está atrás do passador ou depois do
   * recebedor, e aí não intercepta nada).
   */
  static distanceToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Phaser.Math.Distance.Between(px, py, ax, ay);
    const t = Phaser.Math.Clamp(
      ((px - ax) * dx + (py - ay) * dy) / lenSq,
      0,
      1,
    );
    return Phaser.Math.Distance.Between(px, py, ax + t * dx, ay + t * dy);
  }

  /**
   * Linha de visão do passe: nenhum adversário dentro do corredor da bola.
   * O teste antigo era um retângulo de 40px por inimigo — cobria pouco e a IA
   * tocava para o meio de dois marcadores. Corredor mais largo perto do
   * passador (o marcador em cima dele intercepta antes da bola ganhar
   * velocidade) e afunilando ao chegar no recebedor.
   */
  static isPassLaneClear(entity, ally, ctx) {
    const folga = AI_BEHAVIOR.PASS_LANE_CLEARANCE;
    return !ctx.scene.allPlayers.some((e) => {
      if (e.isPlayerTeam === entity.isPlayerTeam) return false;
      const d = AIBrain.distanceToSegment(
        e.x,
        e.y,
        entity.x,
        entity.y,
        ally.x,
        ally.y,
      );
      return d < folga;
    });
  }

  /** Está dentro da grande área que ele ataca? */
  static isInsideBox(x, y, ctx) {
    const profundidade = ctx.pW * 0.16;
    const meiaAltura = ctx.pH * 0.28;
    const dentroX = ctx.isAttackingTop
      ? x < ctx.pX + profundidade
      : x > ctx.pX + ctx.pW - profundidade;
    return dentroX && Math.abs(y - ctx.centerY) < meiaAltura;
  }

  /** Pontos da boca do gol a avaliar: 7 de perto, 3 de longe. */
  static shotTargets(centerY, distToGoal) {
    const perto = distToGoal < AI_BEHAVIOR.SHOT_TARGET_NEAR_DIST;
    const n = perto ? AI_BEHAVIOR.SHOT_TARGETS_NEAR : AI_BEHAVIOR.SHOT_TARGETS_FAR;
    const espacamento = perto ? 40 : 90;
    const meio = Math.floor(n / 2);
    const alvos = [];
    for (let i = 0; i < n; i++) alvos.push(centerY + (i - meio) * espacamento);
    return alvos;
  }

  /**
   * Qualidade da finalização daqui. Devolve `{ y, score }` do melhor canto ou
   * `null` quando chutar é desperdiçar a posse. Três cortes:
   *  - boca fechada (ala na linha de fundo chutava para fora da rede);
   *  - linha de tiro barrada por adversário;
   *  - canto colado no goleiro — mirar no meio do gol é mirar NELE.
   * O alvo escolhido é o lado mais vazio da rede, não o centro.
   */
  static evaluateShotQuality(entity, ctx) {
    if (ctx.distToGoal >= AIBrain.shootRange(ctx)) return null;
    const abertura = AIBrain.goalOpeningAngle(entity, ctx);
    if (abertura < AIBrain.minShotAngle(ctx)) return null;

    let melhor = null;
    for (const ty of AIBrain.shotTargets(ctx.centerY, ctx.distToGoal)) {
      // Trava de goleiro: o meio do gol nunca é alvo — é onde ele mora.
      if (Math.abs(ty - ctx.centerY) < AI_BEHAVIOR.SHOT_CENTER_DEADZONE)
        continue;
      const folgaGK = ctx.enemyGK
        ? Math.abs(ty - ctx.enemyGK.y)
        : AI_BEHAVIOR.SHOT_GK_GAP_MIN;
      if (folgaGK < AI_BEHAVIOR.SHOT_GK_GAP_MIN) continue;
      if (
        !AIBrain.isPassLaneClear(entity, { x: ctx.targetGoalX, y: ty }, ctx)
      )
        continue;
      const score = abertura * 100 + folgaGK;
      if (!melhor || score > melhor.score) melhor = { y: ty, score };
    }
    return melhor;
  }

  /**
   * Dispara o chute de primeira se a intenção estiver armada e a bola tiver
   * chegado. Devolve `true` quando chutou (o frame termina aí).
   */
  static firstTimeShot(entity, ctx) {
    if (!(entity.pendingFirstTimeShot > 0)) return false;
    entity.pendingFirstTimeShot -= ctx.delta;
    if (ctx.ball.owner !== entity) return false;

    entity.pendingFirstTimeShot = 0;
    const chute = AIBrain.evaluateShotQuality(entity, ctx);
    const alvoY = chute ? chute.y : AIBrain.forcedCornerY(ctx);

    entity.isChargingKick = false;
    entity.kickChargeTime = 0;
    entity.passCooldown = entity.passMinCooldown;
    ctx.scene.kickBallFrom(entity, ctx.targetGoalX, alvoY, 0, {
      chargePercent: AI_BEHAVIOR.FIRST_TIME_POWER,
      usePointerDirection: true,
    });
    if (ctx.scene.showFloatingText)
      ctx.scene.showFloatingText(entity.x, entity.y - 40, "DE PRIMEIRA!", "#ff00ff");
    return true;
  }

  /**
   * Força do chute, de 0 a 1, pela distância ao gol. De fora da área vai tudo;
   * na pequena área basta vencer o goleiro — chutar a 1000 dali é bica que
   * vara a rede e nada mais.
   */
  static shotPower(ctx) {
    const perto = AI_BEHAVIOR.SHOT_POWER_NEAR_DIST;
    const longe = AI_BEHAVIOR.SHOOT_CLEARSHOT_DIST;
    const t = Phaser.Math.Clamp(
      (ctx.distToGoal - perto) / (longe - perto),
      0,
      1,
    );
    return AI_BEHAVIOR.SHOT_POWER_MIN + t * (1 - AI_BEHAVIOR.SHOT_POWER_MIN);
  }

  /**
   * Wind-up: o bot não chuta no frame em que decide. Chute forte demora mais a
   * armar — é o tempo de reação que o humano tem com o botão e a defesa
   * precisa para chegar.
   */
  static shotWindup(power) {
    return (
      AI_BEHAVIOR.SHOT_WINDUP_MIN_MS +
      power * (AI_BEHAVIOR.SHOT_WINDUP_MAX_MS - AI_BEHAVIOR.SHOT_WINDUP_MIN_MS)
    );
  }

  /** Ângulo mínimo para chutar: cede no desespero (chuta de qualquer lugar). */
  static minShotAngle(ctx) {
    return ctx.urgency === "desperate"
      ? AI_BEHAVIOR.MIN_SHOT_ANGLE_RAD * AI_BEHAVIOR.DESPERATE_ANGLE_MULT
      : AI_BEHAVIOR.MIN_SHOT_ANGLE_RAD;
  }

  /** Distância a partir da qual nem se avalia chute. Some no desespero. */
  static shootRange(ctx) {
    return ctx.urgency === "desperate"
      ? ctx.pW
      : AI_BEHAVIOR.SHOOT_CLEARSHOT_DIST;
  }

  /** Ficha do atleta, com o padrão para quem não recebeu payload. */
  static stats(entity) {
    return entity.stats || DEFAULT_STATS;
  }

  /**
   * Nota mínima para preferir o chute ao passe. Zero quando é tudo ou nada, e
   * MENOR para quem tem canhão: `power` alto aceita finalização de nota pior
   * (chuta de mais longe e com menos ângulo), `power` baixo exige chance clara.
   */
  static shotGoodScore(entity, ctx) {
    if (ctx.urgency === "desperate") return 0;
    const peso = statWeight(
      AIBrain.stats(entity).power,
      AI_BEHAVIOR.STAT_POWER_SHOT_AMPLITUDE,
    );
    return AI_BEHAVIOR.SHOT_GOOD_SCORE / peso;
  }

  /**
   * O canto mais vazio da boca do gol. Serve de último recurso: sem ângulo e
   * sob pressão no terço final, chutar cruzado ainda é melhor que devolver a
   * bola para trás. Nunca devolve o meio — sai dos extremos da mesma grade de
   * alvos que `evaluateShotQuality` usa.
   */
  static forcedCornerY(ctx) {
    const alvos = AIBrain.shotTargets(ctx.centerY, ctx.distToGoal);
    const cima = alvos[0];
    const baixo = alvos[alvos.length - 1];
    if (!ctx.enemyGK) return cima;
    return Math.abs(cima - ctx.enemyGK.y) >= Math.abs(baixo - ctx.enemyGK.y)
      ? cima
      : baixo;
  }

  /**
   * Ultrapassagem depois do passe: `null` quando o timer não está correndo.
   * O alvo é a LINHA DE FUNDO, não um passo à frente — é o que quebra a linha
   * de marcação e cria a opção de devolução.
   */
  static overlapRunTarget(entity, ctx) {
    if (!(entity.oneTwoTimer > 0)) return null;
    const rumo = Math.sign(ctx.targetGoalX - entity.x);
    const fundo =
      ctx.targetGoalX - rumo * AI_BEHAVIOR.ONE_TWO_BYLINE_INSET;
    // Piso: mesmo perto do fundo ele ainda avança um tanto, nunca fica parado.
    const minimo = entity.x + rumo * AI_BEHAVIOR.ONE_TWO_RUN_DEPTH;
    return AIBrain.clampToPitch(
      { x: rumo > 0 ? Math.max(fundo, minimo) : Math.min(fundo, minimo), y: entity.y },
      ctx,
    );
  }

  /**
   * Corrida ao segundo pau: `null` a menos que um companheiro esteja com a bola
   * na lateral da área sem ângulo E este bot seja o mais indicado para atacar
   * a trave oposta. Espera um pouco À FRENTE da trave, não em cima da linha.
   */
  static farPostRunTarget(entity, ctx) {
    const portador = ctx.ball.owner;
    if (
      !portador ||
      portador === entity ||
      portador.isPlayerTeam !== entity.isPlayerTeam
    )
      return null;
    if (!AIBrain.isFarPostSituation(portador, ctx)) return null;

    const trave = AIBrain.farPostPoint(portador, ctx);
    if (AIBrain.closestAllyTo(portador, ctx, trave) !== entity) return null;

    const rumo = Math.sign(ctx.targetGoalX - portador.x);
    return AIBrain.clampToPitch(
      { x: trave.x - rumo * AI_BEHAVIOR.FAR_POST_RUN_DIST, y: trave.y },
      ctx,
    );
  }

  /**
   * O portador está invadindo a LATERAL da área e sem ângulo de chute? Então a
   * jogada é o segundo pau. Devolve a coordenada da trave oposta à dele, que é
   * onde a bola tem de chegar e para onde o atacante tem de correr — os dois
   * lados da tabela leem daqui, senão cada um mira num ponto diferente.
   */
  static farPostPoint(portador, ctx) {
    const meiaBoca = GOAL_WIDTH / 2 - AI_BEHAVIOR.FAR_POST_OFFSET;
    const traveOposta =
      portador.y > ctx.centerY ? ctx.centerY - meiaBoca : ctx.centerY + meiaBoca;
    return { x: ctx.targetGoalX, y: traveOposta };
  }

  /** Está na lateral da área, no terço final e sem ângulo? É cruzamento. */
  static isFarPostSituation(portador, ctx) {
    if (ctx.distToGoal >= ctx.pW * (1 - AI_BEHAVIOR.FINAL_THIRD_PCT))
      return false;
    // Lateral da área: fora do corredor central do gol.
    if (Math.abs(portador.y - ctx.centerY) < GOAL_WIDTH / 2) return false;
    return AIBrain.goalOpeningAngle(portador, ctx) < AI_BEHAVIOR.MIN_SHOT_ANGLE_RAD;
  }

  /**
   * Aliado mais bem posicionado com linha de passe limpa. Passe para trás só
   * sob pressão extrema — senão a IA recua a jogada sem motivo.
   */
  static findBestPassTarget(entity, ctx, extremePressure) {
    const { scene, targetGoalX, centerY, isAttackingTop } = ctx;
    let bestAlly = null;
    let bestScore = -9999;

    scene.allPlayers.forEach((ally) => {
      if (ally.isPlayerTeam !== entity.isPlayerTeam || ally === entity) return;
      const d = Phaser.Math.Distance.Between(entity.x, entity.y, ally.x, ally.y);
      // Quem passa bem enxerga a bola mais longe — nunca além do que a física
      // entrega, que é o teto protegido pelo check em GameScene.js.
      const alcance = Math.min(
        AI_BEHAVIOR.PASS_RANGE_MAX *
          statWeight(
            AIBrain.stats(entity).passing,
            AI_BEHAVIOR.STAT_PASSING_RANGE_AMPLITUDE,
          ),
        AI_BEHAVIOR.PASS_RANGE_MAX,
      );
      if (d <= AI_BEHAVIOR.PASS_RANGE_MIN || d >= alcance) return;

      const isAllyAhead = isAttackingTop
        ? ally.x < entity.x - 30
        : ally.x > entity.x + 30;
      // Cera: ganhando nos segundos finais, passe para trás é o objetivo.
      if (!isAllyAhead && !extremePressure && ctx.urgency !== "stall") return;

      if (!AIBrain.isPassLaneClear(entity, ally, ctx)) return;

      const allyDistToGoal = Phaser.Math.Distance.Between(
        ally.x,
        ally.y,
        targetGoalX,
        centerY,
      );
      // Cera: quanto MAIS longe do gol adversário, melhor. No resto do jogo é
      // o contrário — o passe procura quem está mais perto de finalizar.
      let score =
        ctx.urgency === "stall" ? allyDistToGoal : 2000 - allyDistToGoal;
      if (ctx.urgency === "stall") {
        // Longe do gol ADVERSÁRIO vale mais: roda a bola no próprio campo.
        if (allyDistToGoal > ctx.distToGoal) score += AI_BEHAVIOR.STALL_BACK_BONUS;
      } else if (ctx.distToGoal - allyDistToGoal > 50) score += 500;
      // Aliado na grande área é assistência: vale mais que qualquer avanço.
      if (AIBrain.isInsideBox(ally.x, ally.y, ctx))
        score += AI_BEHAVIOR.BOX_ASSIST_BONUS;
      if (score > bestScore) {
        bestScore = score;
        bestAlly = ally;
      }
    });

    const vale =
      bestAlly &&
      (ctx.urgency === "stall" ||
        bestScore > 2000 - ctx.distToGoal + 100 ||
        extremePressure);
    return vale ? bestAlly : null;
  }

  /**
   * Passe pró-gol: alguém na área com o gol MAIS aberto que o meu e linha de
   * passe livre. Existindo, o chute está errado — a assistência vale mais que
   * um chute de ângulo médio. `null` quando ninguém está melhor colocado.
   */
  static betterPlacedAlly(entity, ctx) {
    const meuAngulo = AIBrain.goalOpeningAngle(entity, ctx);
    let melhor = null;
    ctx.scene.allPlayers.forEach((ally) => {
      if (ally === entity || ally.isPlayerTeam !== entity.isPlayerTeam) return;
      if (!AIBrain.isInsideBox(ally.x, ally.y, ctx)) return;

      const d = Phaser.Math.Distance.Between(entity.x, entity.y, ally.x, ally.y);
      if (d <= AI_BEHAVIOR.PASS_RANGE_MIN || d >= AI_BEHAVIOR.PASS_RANGE_MAX)
        return;

      const anguloDele = AIBrain.goalOpeningAngle(ally, ctx);
      if (anguloDele <= meuAngulo * AI_BEHAVIOR.UNSELFISH_ANGLE_EDGE) return;
      // Linha DELE para o gol também tem de estar limpa, senão é só trocar um
      // chute ruim por outro.
      if (
        !AIBrain.isPassLaneClear(
          ally,
          { x: ctx.targetGoalX, y: ctx.centerY },
          ctx,
        )
      )
        return;
      if (!AIBrain.isPassLaneClear(entity, ally, ctx)) return;

      if (!melhor || anguloDele > melhor._ang) {
        melhor = ally;
        melhor._ang = anguloDele;
      }
    });
    return melhor;
  }

  /** Companheiro mais próximo de um ponto (ninguém = null). */
  static closestAllyTo(entity, ctx, ponto) {
    let melhor = null;
    let menor = Infinity;
    ctx.scene.allPlayers.forEach((ally) => {
      if (ally === entity || ally.isPlayerTeam !== entity.isPlayerTeam) return;
      const d = Phaser.Math.Distance.Between(ally.x, ally.y, ponto.x, ponto.y);
      if (d < menor) {
        menor = d;
        melhor = ally;
      }
    });
    return melhor;
  }

  /** Conta a carga e solta o chute/passe quando ela completa. */
  static resolveCharge(entity, ctx) {
    const { scene, delta, targetGoalX, centerY, pY, pH } = ctx;
    entity.kickChargeTime += delta;
    if (entity.kickChargeTime < entity.targetChargeTime) return;

    // Passe em profundidade: mira onde o recebedor VAI estar. A mira era feita
    // no tique da decisão e a bola chegava no ponto velho — quem estava em
    // ultrapassagem tinha de frear e voltar para buscar. A correção é aqui, na
    // hora do toque, porque é o dado mais fresco que existe.
    if (entity.chargeTargetEntity) {
      const alvo = AIBrain.leadPoint(entity, entity.chargeTargetEntity, ctx);
      entity.chargeTargetX = alvo.x;
      entity.chargeTargetY = alvo.y;
    }

    const finalDist = Phaser.Math.Distance.Between(
      entity.x,
      entity.y,
      entity.chargeTargetX,
      entity.chargeTargetY,
    );
    if (finalDist > 30) {
      if (entity.kickType === "pass" || entity.kickType === "through") {
        // A força NÃO sai daqui: `kickBallFrom` a deriva do atrito e da
        // distância (`passForceFor`). O valor que este método mandava era
        // recalculado por cima e nunca chegou a valer nada.
        const isOnWing = entity.y < pY + pH * 0.3 || entity.y > pY + pH * 0.7;
        const isNearGoalArea = ctx.distToGoal < 600;
        let passType = "short";
        if (isOnWing && isNearGoalArea) passType = "cross";
        else if (finalDist > 250 || entity.kickType === "through")
          passType = "through";

        scene.kickBallFrom(
          entity,
          entity.chargeTargetX,
          entity.chargeTargetY,
          0,
          { isPass: true, rawForce: true, usePointerDirection: true, passType },
        );
      } else {
        scene.kickBallFrom(
          entity,
          entity.chargeTargetX,
          entity.chargeTargetY,
          0,
          {
            // Força ESCALADA pela distância, não pelo tempo de carga: o
            // wind-up é tempo de reação, não medida de potência.
            chargePercent:
              entity.shotPower !== undefined
                ? entity.shotPower
                : Math.min(entity.kickChargeTime / entity.maxKickChargeTime, 1),
            usePointerDirection: true,
          },
        );
      }
    }
    // Intenção de chute de primeira: quem recebe a assistência DENTRO da área
    // já sabe o que vai fazer antes da bola chegar. Ver `firstTimeShot()`.
    if (
      finalDist > 30 &&
      entity.kickType === "pass" &&
      AIBrain.isInsideBox(entity.chargeTargetX, entity.chargeTargetY, ctx)
    ) {
      const recebedor = AIBrain.closestAllyTo(entity, ctx, {
        x: entity.chargeTargetX,
        y: entity.chargeTargetY,
      });
      if (recebedor) recebedor.pendingFirstTimeShot = AI_BEHAVIOR.FIRST_TIME_INTENT_MS;
    }

    // Ultrapassagem: quem tocou NO CAMPO DE ATAQUE vai. No próprio campo o
    // passe é saída de bola, e disparar dali só abriria a defesa.
    if (
      finalDist > 30 &&
      (entity.kickType === "pass" || entity.kickType === "through") &&
      ctx.distToGoal < ctx.pW / 2
    )
      entity.oneTwoTimer = AI_BEHAVIOR.ONE_TWO_RUN_MS;

    entity.isChargingKick = false;
    entity.kickChargeTime = 0;
    entity.chargeTargetEntity = null;
    entity.passCooldown = entity.passMinCooldown;
  }

  /**
   * Onde o recebedor estará quando a bola chegar. Duas passadas, como na
   * interceptação: a primeira estima o tempo pela distância atual, a segunda
   * corrige pelo ponto previsto. O alvo é preso ao campo e mantido FORA da
   * pequena área do goleiro — liderar para dentro dela é entregar a bola.
   */
  static leadPoint(entity, ally, ctx) {
    const vx = ally.body ? ally.body.velocity.x : 0;
    const vy = ally.body ? ally.body.velocity.y : 0;
    const tempoDe = (d) =>
      ctx.scene.passTravelTime ? ctx.scene.passTravelTime(d) : d / 700;

    let t = tempoDe(Phaser.Math.Distance.Between(entity.x, entity.y, ally.x, ally.y));
    for (let i = 0; i < 2; i++) {
      const px = ally.x + vx * t;
      const py = ally.y + vy * t;
      t = tempoDe(Phaser.Math.Distance.Between(entity.x, entity.y, px, py));
    }

    const bruto = AIBrain.clampToPitch(
      { x: ally.x + vx * t, y: ally.y + vy * t },
      ctx,
    );
    return AIBrain.keepOutOfKeeperArea(bruto, ctx);
  }

  /** Empurra um ponto para fora da pequena área que o goleiro adversário domina. */
  static keepOutOfKeeperArea(p, ctx) {
    const gk = ctx.enemyGK;
    if (!gk) return p;
    const d = Phaser.Math.Distance.Between(p.x, p.y, gk.x, gk.y);
    const minimo = AI_BEHAVIOR.LEAD_KEEPER_CLEARANCE;
    if (d >= minimo) return p;
    const fora = Phaser.Math.Angle.Between(gk.x, gk.y, p.x, p.y);
    return AIBrain.clampToPitch(
      { x: gk.x + Math.cos(fora) * minimo, y: gk.y + Math.sin(fora) * minimo },
      ctx,
    );
  }

  /** Time com a bola e ele não é o dono: corre para receber. */
  static executeSupporting(entity, ctx) {
    entity.hasTargetCorner = false;
    entity.isChargingKick = false;

    // Segundo pau: o companheiro está invadindo a lateral da área sem ângulo.
    // Vem antes de tudo — é a chance mais clara que existe em campo.
    const segundoPau = AIBrain.farPostRunTarget(entity, ctx);
    if (segundoPau) {
      if (AIBrain.stamina(entity) > AI_BEHAVIOR.SPRINT_STAMINA_THRESHOLD)
        entity.sprintTimer = 800;
      return { x: segundoPau.x, y: segundoPau.y, stopAt: 20 };
    }

    // Ultrapassagem: acabou de tocar, então VAI — nas costas da marcação, rumo
    // à linha de fundo, e não a um passo à frente.
    const ultrapassagem = AIBrain.overlapRunTarget(entity, ctx);
    if (ultrapassagem) {
      if (AIBrain.stamina(entity) > AI_BEHAVIOR.SPRINT_STAMINA_THRESHOLD)
        entity.sprintTimer = 400;
      return {
        ...AIBrain.openPassLanePoint(entity, ctx, ultrapassagem),
        stopAt: 25,
      };
    }

    // Terço final: ala e pivô atacam as costas da zaga em vez de acompanhar a
    // jogada de lado. É o que transforma posse em chance.
    const infiltracao = AIBrain.throughRunTarget(entity, ctx);
    if (infiltracao) {
      if (AIBrain.stamina(entity) > 20) entity.sprintTimer = 1200;
      return { x: infiltracao.x, y: infiltracao.y, stopAt: 25 };
    }

    // Fora do terço final ele mantém a forma — mas não na sombra de um
    // marcador: o posto desliza de lado até abrir linha para quem tem a bola.
    const posto = AIBrain.moveToTacticalPosition(entity, ctx);
    if (posto.hold) return posto;
    const aberto = AIBrain.openPassLanePoint(entity, ctx, posto);
    return { x: aberto.x, y: aberto.y, stopAt: 30 };
  }

  /**
   * Desmarque simples: se a reta do portador até o posto está fechada, desliza
   * PERPENDICULAR a ela até achar corredor livre. É movimento lateral, não
   * corrida para a bola — a forma do time continua de pé.
   */
  static openPassLanePoint(entity, ctx, ponto) {
    const dono = ctx.ball.owner;
    if (!dono || dono === entity) return ponto;
    if (AIBrain.isPassLaneClear(dono, ponto, ctx)) return ponto;

    const perpendicular =
      Phaser.Math.Angle.Between(dono.x, dono.y, ponto.x, ponto.y) + Math.PI / 2;
    for (const passo of AI_BEHAVIOR.SUPPORT_SIDESTEPS) {
      const alt = AIBrain.clampToPitch(
        {
          x: ponto.x + Math.cos(perpendicular) * passo,
          y: ponto.y + Math.sin(perpendicular) * passo,
        },
        ctx,
      );
      if (AIBrain.isPassLaneClear(dono, alt, ctx)) return alt;
    }
    return ponto;
  }

  /**
   * Adversário com a bola e ele é o mais próximo. O plano é "perseguir a bola";
   * a mira e o gatilho do bote ficam em `interceptPoint`, por frame — a bola é
   * rápida demais para um alvo de 180ms atrás.
   */
  static executePressing(entity, ctx) {
    entity.hasTargetCorner = false;
    entity.isChargingKick = false;
    if (ctx.distToBall > 100) entity.sprintTimer = 1200;
    if (ctx.distToBall > 300 && AIBrain.stamina(entity) > 30)
      entity.sprintTimer = 1500;
    return { chaseBall: true };
  }

  /**
   * Ponto de interceptação da bola, recalculado todo frame (é O(1)). Também é
   * aqui que sai o bote: esperar o tick de decisão perderia a janela.
   */
  static interceptPoint(entity, ctx) {
    const { ball } = ctx;
    const distToBall = Phaser.Math.Distance.Between(
      entity.x,
      entity.y,
      ball.x,
      ball.y,
    );
    const angleToBall = Phaser.Math.Angle.Between(
      entity.x,
      entity.y,
      ball.x,
      ball.y,
    );
    const diff = Math.abs(Phaser.Math.Angle.Wrap(entity.rotation - angleToBall));

    // Fora do cone de visão e longe: gira para a bola sem sair correndo.
    if (diff >= Math.PI / 1.5 && distToBall >= 100) {
      return {
        x: entity.x + Math.cos(angleToBall) * 10,
        y: entity.y + Math.sin(angleToBall) * 10,
      };
    }

    // Gatilho do bote. A distância vinha cravada aqui enquanto
    // `TACKLE.STEAL_TRIGGER_DIST` ficava em constants.js sem ninguém ler — e
    // agora ela cresce com `defending`: quem defende bem ataca a bola de mais
    // longe, quem não defende só bota o pé em cima dela.
    const alcanceDoBote =
      TACKLE.STEAL_TRIGGER_DIST *
      statWeight(
        AIBrain.stats(entity).defending,
        AI_BEHAVIOR.STAT_DEFENDING_REACH_AMPLITUDE,
      );
    if (
      distToBall < alcanceDoBote &&
      entity.dashCooldown <= 0 &&
      ball.owner &&
      ball.owner.isPlayerTeam !== entity.isPlayerTeam
    ) {
      entity.dashTimer = TACKLE.DASH_DURATION_MS;
      entity.dashCooldown = TACKLE.DASH_COOLDOWN_MS_AI;
      entity.tackleHit = false;
    }

    return AIBrain.ballInterceptPoint(entity, ctx, distToBall);
  }

  /**
   * Onde a bola VAI estar quando ele chegar, não onde ela está. O alvo antigo
   * era um empurrãozinho fixo de 0,2s e o bot corria em curva atrás da bola.
   *
   * A bola perde velocidade por atrito geométrico (`f` por frame), então o
   * deslocamento até `t` é a integral disso: `v0 * (1 - e^(-k t)) / k`. Duas
   * passadas bastam — a primeira estima `t` pela distância atual, a segunda
   * corrige pelo ponto previsto.
   */
  static ballInterceptPoint(entity, ctx, distToBall) {
    const { ball } = ctx;
    const vx = ball.body.velocity.x;
    const vy = ball.body.velocity.y;
    const v = Math.hypot(vx, vy);
    const minhaVel = Math.max((entity.sprintSpeed || 1) * 60, 1);
    if (v < 5) return { x: ball.x, y: ball.y };

    // Taxa de decaimento por SEGUNDO a partir do atrito por frame (60fps).
    const k = -60 * Math.log(BALL_PHYSICS.FRICTION_GROUND);
    const avanco = (t) => (1 - Math.exp(-k * t)) / k;

    let t = distToBall / minhaVel;
    for (let i = 0; i < 2; i++) {
      const alvoX = ball.x + vx * avanco(t);
      const alvoY = ball.y + vy * avanco(t);
      t =
        Phaser.Math.Distance.Between(entity.x, entity.y, alvoX, alvoY) /
        minhaVel;
    }
    return AIBrain.clampToPitch(
      { x: ball.x + vx * avanco(t), y: ball.y + vy * avanco(t) },
      ctx,
    );
  }

  /**
   * Sem a bola e sem ser o pressionador. Não é ficar em cima de um ponto fixo:
   * ele se põe no caminho da bola até o atacante mais próximo, cortando a linha
   * de passe — mas só enquanto isso não o tirar da zona dele.
   */
  static executeDefending(entity, ctx) {
    entity.hasTargetCorner = false;
    entity.isChargingKick = false;

    // Quem acabou de tocar no ataque NÃO recua enquanto o timer corre — nem
    // durante o voo da bola, quando ninguém é dono e o estado cai para cá.
    const ultrapassagem = AIBrain.overlapRunTarget(entity, ctx);
    if (ultrapassagem) return { ...ultrapassagem, stopAt: 25 };

    const posto = AIBrain.moveToTacticalPosition(entity, ctx);
    if (posto.hold) return posto;

    const corte = AIBrain.laneCutPoint(entity, ctx, posto);
    return corte ? { x: corte.x, y: corte.y, stopAt: 22 } : posto;
  }

  /** Igual ao defender, mas voltando no sprint — está longe demais. */
  static executeRetreating(entity, ctx) {
    entity.hasTargetCorner = false;
    entity.isChargingKick = false;
    const ultrapassagem = AIBrain.overlapRunTarget(entity, ctx);
    if (ultrapassagem) return { ...ultrapassagem, stopAt: 25 };
    if (AIBrain.stamina(entity) > 20) entity.sprintTimer = 1000;
    return AIBrain.moveToTacticalPosition(entity, ctx);
  }

  /** Plano até a posição tática. `stopAt` faz ele parar ao chegar, não orbitar. */
  static moveToTacticalPosition(entity, ctx) {
    const tm = ctx.scene.tacticManager;
    if (!tm || !tm.getTargetPosition) return { hold: true };
    const tPos = tm.getTargetPosition(entity);
    if (!tPos) return { hold: true };

    const dist = Phaser.Math.Distance.Between(
      entity.x,
      entity.y,
      tPos.x,
      tPos.y,
    );
    if (dist > 250 && AIBrain.stamina(entity) > 20) entity.sprintTimer = 800;
    return { x: tPos.x, y: tPos.y, stopAt: 30 };
  }

  // ── Locomoção comum ───────────────────────────────────────────────────────
  static applyLocomotion(entity, ctx, targetAngle, dt) {
    // Separação: empurra para longe de quem está colado (anti-aglomeração).
    let separationX = 0;
    let separationY = 0;
    ctx.scene.allPlayers.forEach((p) => {
      if (p === entity || p.isPlayerTeam !== entity.isPlayerTeam) return;
      const d = Phaser.Math.Distance.Between(entity.x, entity.y, p.x, p.y);
      if (d < 45) {
        const angle = Phaser.Math.Angle.Between(p.x, p.y, entity.x, entity.y);
        separationX += Math.cos(angle) * 1.5;
        separationY += Math.sin(angle) * 1.5;
      }
    });

    const exausto =
      AIBrain.stamina(entity) / entity.maxStamina < STAMINA.LOW_STAMINA_PCT;

    let maxS = entity.isDashing
      ? entity.sprintSpeed * 1.45
      : entity.isSprintingAI
        ? entity.sprintSpeed
        : entity.baseSpeed;
    if (exausto) maxS *= STAMINA.LOW_STAMINA_SPEED_PENALTY;
    if (entity.tackleSlowTimer > 0) maxS *= 0.4;
    entity.body.setMaxVelocity(maxS * 60);

    if (targetAngle !== null && targetAngle !== undefined) {
      if (entity.logicalRotation === undefined)
        entity.logicalRotation = Phaser.Math.DegToRad(entity.moveAngle || 0);

      entity.logicalRotation = Phaser.Math.Angle.RotateTo(
        entity.logicalRotation,
        targetAngle,
        0.12 * dt,
      );
      entity.setAngle(0); // sprite top-down fica "em pé"

      // Direção desejada = rumo + empurrão da separação, normalizado.
      const dir = new Phaser.Math.Vector2(
        Math.cos(entity.logicalRotation) + separationX,
        Math.sin(entity.logicalRotation) + separationY,
      );
      if (dir.lengthSq() > 0) dir.normalize();

      // Mesma inércia do jogador humano: Arcade acelera e o drag freia.
      entity.body.setDrag(PLAYER_PHYSICS.DRAG, PLAYER_PHYSICS.DRAG);
      const vel = entity.body.velocity;
      const vLen = vel.length();
      const virando =
        vLen > 10 && (dir.x * vel.x + dir.y * vel.y) / vLen < 0.2;
      const acc =
        PLAYER_PHYSICS.ACCELERATION * (virando ? PLAYER_PHYSICS.TURN_BOOST : 1);
      entity.body.setAcceleration(dir.x * acc, dir.y * acc);
    } else {
      // Sem rumo: solta o acelerador e deixa o drag parar — deslize, não freio.
      entity.body.setAcceleration(0, 0);
      entity.body.setDrag(PLAYER_PHYSICS.DRAG, PLAYER_PHYSICS.DRAG);
      if (entity.logicalRotation !== undefined)
        entity.logicalRotation = Phaser.Math.DegToRad(entity.moveAngle);
    }

    // `maxVelocity` do Arcade é por EIXO: sem isto a diagonal corre 1,41x.
    const tetoPx = maxS * 60;
    if (entity.body.velocity.lengthSq() > tetoPx * tetoPx)
      entity.body.velocity.normalize().scale(tetoPx);

    // Espelho para quem lê `customVel` (bote, derrapagem).
    entity.customVel.set(
      entity.body.velocity.x / 60,
      entity.body.velocity.y / 60,
    );

    if (entity.body.velocity.lengthSq() > 10) {
      entity.moveAngle = Phaser.Math.RadToDeg(
        Math.atan2(entity.body.velocity.y, entity.body.velocity.x),
      );
      entity.currentFacing = entity.get8WayDirection(entity.moveAngle);
    }
    entity.updateAnimation(true);
  }
}

if (typeof window !== "undefined") window.AIBrain = AIBrain;

// =============================================================================
// Check: a tabela de transição da FSM. Um estado errado não quebra nada no
// console — o time só para de marcar ou de atacar, e isso se descobre jogando.
// =============================================================================
console.assert(
  (() => {
    if (typeof AI_STATES === "undefined") return true;
    // Perto do próprio gol (100px): o caso normal de marcação.
    const ctxBase = { pX: 0, pY: 0, pW: 1600, pH: 1000, ownGoalX: 600 };

    // Entidade NOVA a cada caso: `shouldShield` ARMA um timer na entidade, e
    // sem isso um caso vazaria o estado para o seguinte.
    // Ficha NEUTRA (tudo 50) por padrão: os limites abaixo são os do jogador
    // médio. Os stats deslocam esses limites de propósito, e um caso adiante
    // mede exatamente isso.
    const s = (dono, extra = {}, stats = null) => {
      const eu = {
        isPlayerTeam: true,
        x: 500,
        y: 500,
        stats: normalizeStats(stats || { speed: 50, power: 50, passing: 50 }),
      };
      const ctx = {
        ...ctxBase,
        closestTeammate: null,
        ...extra,
        ball: { owner: dono === "eu" ? eu : dono },
      };
      if (ctx.closestTeammate === "eu") ctx.closestTeammate = eu;
      return AIBrain.decideState(eu, ctx);
    };

    const outro = { isPlayerTeam: true };
    const rival = { isPlayerTeam: false };
    // Campo: ele em x=500 atacando o gol em x=1800, dentro do terço final.
    const campo = (adversarios, extra = {}) => ({
      distToGoal: 400,
      targetGoalX: 1800,
      centerY: 500,
      scene: { allPlayers: adversarios },
      teamHasBall: true,
      ...extra,
    });

    return (
      // Dono da bola sem contexto de campo: WITH_BALL.
      s("eu", { teamHasBall: true, closestTeammate: "eu" }) ===
        AI_STATES.WITH_BALL &&
      // Time com a bola, ele não é o dono: SUPPORTING (nem pressiona nem marca).
      s(outro, { teamHasBall: true, closestTeammate: "eu" }) ===
        AI_STATES.SUPPORTING &&
      // Adversário com a bola e ele é o mais próximo: PRESSING.
      s(rival, { teamHasBall: false, closestTeammate: "eu" }) ===
        AI_STATES.PRESSING &&
      // Os outros marcam posição...
      s(rival, { teamHasBall: false, closestTeammate: outro }) ===
        AI_STATES.DEFENDING_POSITION &&
      // ...e quem está longe demais do próprio gol (1300px) recompõe correndo.
      s(rival, {
        teamHasBall: false,
        closestTeammate: outro,
        ownGoalX: 1800,
      }) === AI_STATES.RETREATING &&
      // Bola solta (sem dono) é disputa: o mais próximo vai nela.
      s(null, { teamHasBall: false, closestTeammate: "eu" }) ===
        AI_STATES.PRESSING &&
      // Terço final, corredor limpo: infiltra em vez de procurar passe.
      s("eu", campo([])) === AI_STATES.DRIVE_TO_GOAL &&
      // Zagueiro LONGE na reta até o gol: não dá para driblar o que ainda está
      // a meio caminho, então ele aborta a corrida e procura passe.
      s("eu", campo([{ isPlayerTeam: false, x: 1200, y: 500 }])) ===
        AI_STATES.WITH_BALL &&
      // Zagueiro COLADO à frente: não aborta, desvia na diagonal e segue.
      s("eu", campo([{ isPlayerTeam: false, x: 560, y: 500 }])) ===
        AI_STATES.DRIVE_TO_GOAL &&
      // Marcado NAS COSTAS (entre ele e o gol): segura a bola e espera apoio.
      s(
        "eu",
        campo([], { nearestEnemy: { x: 560, y: 500 }, nearestEnemyDist: 60 }),
      ) === AI_STATES.SHIELD_BALL &&
      // Marcador ATRÁS dele não é jogo de pivô: aí ele vira e vai.
      s(
        "eu",
        campo([], { nearestEnemy: { x: 440, y: 500 }, nearestEnemyDist: 60 }),
      ) === AI_STATES.DRIVE_TO_GOAL &&
      // Passado o meio-campo com corredor limpo ele infiltra, mesmo FORA do
      // terço final — era aqui que ele recuava a bola com o gol aberto.
      s("eu", campo([], { distToGoal: 700 })) === AI_STATES.DRIVE_TO_GOAL &&
      // No próprio campo e em cima do gol não é infiltração: um é cedo demais,
      // o outro é hora de chutar.
      s("eu", campo([], { distToGoal: 900 })) === AI_STATES.WITH_BALL &&
      // A FICHA move esse limite: o mesmo lance, a mesma distância, e só o
      // velocista arranca. Se isto parar de valer, `stats` virou enfeite.
      s("eu", campo([], { distToGoal: 900 }), { speed: 100 }) ===
        AI_STATES.DRIVE_TO_GOAL &&
      s("eu", campo([], { distToGoal: 900 }), { speed: 0 }) ===
        AI_STATES.WITH_BALL &&
      s("eu", campo([], { distToGoal: 200 })) === AI_STATES.WITH_BALL
    );
  })(),
  "AIBrain: tabela de transição da FSM errada (estado não bate com a posse)",
);

// =============================================================================
// Check: o tick rate. A decisão pesada (linhas de passe e de chute, O(n²)) não
// pode voltar a rodar a 60fps — e o regressão aqui é invisível: o jogo continua
// funcionando, só engasga. Também garante que entidade nova decide no 1º frame,
// senão ela ficaria parada até o primeiro tick.
// =============================================================================
console.assert(
  (() => {
    if (typeof AI_BEHAVIOR === "undefined") return true;
    const intervalo = AI_BEHAVIOR.DECISION_INTERVAL_MS;

    const bot = {};
    const primeiro = AIBrain.shouldThink(bot, 16.67);
    let pensou = 1;
    // 1 segundo a 60fps
    for (let i = 1; i < 60; i++) if (AIBrain.shouldThink(bot, 16.67)) pensou++;

    // Com jitter de ±25%, 1000ms rende entre 1000/(1.25*i) e 1000/(0.75*i).
    const minEsperado = Math.floor(1000 / (intervalo * 1.25));
    const maxEsperado = Math.ceil(1000 / (intervalo * 0.75)) + 1;

    // Jitter existe: dois bots não pensam no mesmo frame para sempre.
    const a = {};
    const b = {};
    AIBrain.shouldThink(a, 16.67);
    AIBrain.shouldThink(b, 16.67);
    const dessincronizados = a.decisionTimer !== b.decisionTimer;

    // 3 alvos de chute longe, 7 perto.
    const perto = AIBrain.shotTargets(500, 100).length;
    const longe = AIBrain.shotTargets(500, 900).length;

    return (
      primeiro === true &&
      pensou >= minEsperado &&
      pensou <= maxEsperado &&
      pensou < 60 / 2 && // longe de "todo frame"
      dessincronizados &&
      perto === AI_BEHAVIOR.SHOT_TARGETS_NEAR &&
      longe === AI_BEHAVIOR.SHOT_TARGETS_FAR &&
      longe < perto
    );
  })(),
  "AIBrain: cooldown de decisão furado (IA voltou a pensar todo frame)",
);

// =============================================================================
// Check: o comportamento tático sem a bola. São decisões de POSIÇÃO — erradas,
// o time continua jogando e só fica pior, sem nada no console.
// =============================================================================
console.assert(
  (() => {
    if (typeof ARCHETYPES === "undefined") return true;

    // Campo de teste: 1600x1000 a partir de (200,200). Ataca para a DIREITA.
    const ctx = {
      pX: 200,
      pY: 200,
      pW: 1600,
      pH: 1000,
      centerY: 700,
      isAttackingTop: false,
      ball: { x: 1500, y: 700 },
      scene: { allPlayers: [] },
      nearestEnemy: null,
    };
    const zagueiro = { isPlayerTeam: false, x: 1550, y: 700 };
    const outroZagueiro = { isPlayerTeam: false, x: 1500, y: 400 };
    const ala = { isPlayerTeam: true, archetype: ARCHETYPES.WING_L, x: 900, y: 400 };
    const pivo = { isPlayerTeam: true, archetype: ARCHETYPES.PIVOT, x: 900, y: 700 };
    const fixo = { isPlayerTeam: true, archetype: ARCHETYPES.FIXO, x: 900, y: 700 };
    ctx.scene.allPlayers = [zagueiro, outroZagueiro, ala, pivo, fixo];

    // 1) Infiltração: ala e pivô atacam ALÉM do último zagueiro (x maior).
    const corridaAla = AIBrain.throughRunTarget(ala, ctx);
    const corridaPivo = AIBrain.throughRunTarget(pivo, ctx);
    // 2) Arquétipo defensivo não faz corrida nas costas da zaga.
    const corridaFixo = AIBrain.throughRunTarget(fixo, ctx);
    // 3) Fora do terço final, ninguém infiltra.
    const longe = AIBrain.throughRunTarget(ala, { ...ctx, ball: { x: 400, y: 700 } });

    // 4) Corte de linha: fica ENTRE a bola e o atacante marcado, e do lado dele.
    const ctxCorte = {
      ...ctx,
      ball: { x: 600, y: 700 },
      nearestEnemy: { x: 1000, y: 700 },
    };
    const corte = AIBrain.laneCutPoint({ isPlayerTeam: true }, ctxCorte, {
      x: 850,
      y: 700,
    });
    // 5) Corte longe demais do posto = abandonar a zona: recusa.
    const corteLonge = AIBrain.laneCutPoint({ isPlayerTeam: true }, ctxCorte, {
      x: 300,
      y: 700,
    });

    // 6) Hold up: gira para o lado OPOSTO ao marcador.
    const portador = { x: 900, y: 700 };
    const abrigo = AIBrain.holdUpPoint(portador, {
      ...ctx,
      nearestEnemy: { x: 960, y: 700 },
    });

    return (
      corridaAla !== null &&
      corridaAla.x > zagueiro.x &&
      corridaAla.y < ctx.centerY && // ala esquerdo abre na faixa dele
      corridaPivo !== null &&
      Math.abs(corridaPivo.y - ctx.centerY) < 100 && // pivô centraliza
      corridaFixo === null &&
      longe === null &&
      corte !== null &&
      corte.x > ctxCorte.ball.x &&
      corte.x < ctxCorte.nearestEnemy.x &&
      corteLonge === null &&
      abrigo !== null &&
      abrigo.x < portador.x // fugiu do marcador que vinha pela direita
    );
  })(),
  "AIBrain: tática sem a bola quebrada (infiltração, corte de linha ou hold up)",
);

// =============================================================================
// Check: ângulo de finalização e força do passe. Chutar de canto fechado ou
// tocar devagar não quebra nada — só devolve a bola ao adversário.
// =============================================================================
console.assert(
  (() => {
    if (typeof AI_BEHAVIOR === "undefined") return true;
    const ctx = {
      pX: 200,
      pY: 200,
      pW: 1600,
      pH: 1000,
      centerY: 700,
      targetGoalX: 1800,
      isAttackingTop: false,
    };

    // De frente para o gol, a boca abre; do canto da linha de fundo, fecha.
    const deFrente = AIBrain.goalOpeningAngle({ x: 1400, y: 700 }, ctx);
    const doCanto = AIBrain.goalOpeningAngle({ x: 1790, y: 250 }, ctx);

    // Área: quem está na cara do gol conta, quem está no meio-campo não.
    const naArea = AIBrain.isInsideBox(1700, 700, ctx);
    const foraDaArea = AIBrain.isInsideBox(1000, 700, ctx);
    const naLinhaDeFundoLonge = AIBrain.isInsideBox(1700, 250, ctx);

    return (
      deFrente > AI_BEHAVIOR.MIN_SHOT_ANGLE_RAD &&
      doCanto < AI_BEHAVIOR.MIN_SHOT_ANGLE_RAD &&
      deFrente > doCanto &&
      naArea === true &&
      foraDaArea === false &&
      naLinhaDeFundoLonge === false
    );
  })(),
  "AIBrain: ângulo de chute ou teste de área fora do esperado",
);

// =============================================================================
// Check: qualidade da finalização. Os dois erros que custaram gol na prática —
// ala chutando da linha de fundo sem boca de gol, e chute no meio da rede com o
// goleiro parado ali — não aparecem no console, só no placar.
// =============================================================================
console.assert(
  (() => {
    if (typeof AI_BEHAVIOR === "undefined") return true;
    const base = {
      pX: 200,
      pY: 200,
      pW: 1600,
      pH: 1000,
      centerY: 700,
      targetGoalX: 1800,
      isAttackingTop: false,
      scene: { allPlayers: [] },
    };
    const com = (gkY, dist, inimigos = []) => ({
      ...base,
      distToGoal: dist,
      enemyGK: { y: gkY },
      scene: {
        allPlayers: inimigos.map((p) => ({ isPlayerTeam: false, ...p })),
      },
    });
    const atacante = { isPlayerTeam: true, x: 1600, y: 700 };

    // Da linha de fundo, sem boca de gol: nada de chute.
    const semAngulo = AIBrain.evaluateShotQuality(
      { isPlayerTeam: true, x: 1790, y: 250 },
      com(700, 200),
    );
    // Longe demais nem é avaliado.
    const longe = AIBrain.evaluateShotQuality(atacante, com(700, 900));
    // Goleiro no centro: mira num canto, nunca nele.
    const cara = AIBrain.evaluateShotQuality(atacante, com(700, 200));
    // Goleiro puxado para cima: o alvo vai para BAIXO, o lado vazio.
    const gkEmCima = AIBrain.evaluateShotQuality(atacante, com(600, 200));
    const gkEmBaixo = AIBrain.evaluateShotQuality(atacante, com(800, 200));
    // Do limite da área a nota cai: chute de fora perde para uma assistência.
    const deLonge = AIBrain.evaluateShotQuality(
      { isPlayerTeam: true, x: 1380, y: 700 },
      com(700, 420),
    );
    // Zagueiro em cima da linha de tiro central não deixa o chute do meio.
    const bloqueado = AIBrain.evaluateShotQuality(
      atacante,
      com(700, 200, [{ x: 1700, y: 700 }]),
    );

    // Canto forçado: último recurso, sempre no lado oposto ao goleiro.
    const cantoComGkEmCima = AIBrain.forcedCornerY(com(600, 200));
    const cantoComGkEmBaixo = AIBrain.forcedCornerY(com(800, 200));

    return (
      semAngulo === null &&
      longe === null &&
      cara !== null &&
      Math.abs(cara.y - 700) >= AI_BEHAVIOR.SHOT_GK_GAP_MIN &&
      // Trava de goleiro: nenhum chute sai pelo meio do gol, em distância
      // nenhuma — nem quando o goleiro está longe do centro.
      Math.abs(cara.y - 700) >= AI_BEHAVIOR.SHOT_CENTER_DEADZONE &&
      Math.abs(AIBrain.evaluateShotQuality(atacante, com(200, 200)).y - 700) >=
        AI_BEHAVIOR.SHOT_CENTER_DEADZONE &&
      Math.abs(deLonge.y - 700) >= AI_BEHAVIOR.SHOT_CENTER_DEADZONE &&
      cantoComGkEmCima > 700 &&
      cantoComGkEmBaixo < 700 &&
      gkEmCima.y > 700 &&
      gkEmBaixo.y < 700 &&
      (bloqueado === null || Math.abs(bloqueado.y - 700) > 40) &&
      // Cara a cara vale mais que chute do limite da área — mas os dois agora
      // passam do corte: dentro da área ele arrisca em vez de recuar a bola.
      cara.score > AI_BEHAVIOR.SHOT_GOOD_SCORE &&
      deLonge.score > AI_BEHAVIOR.SHOT_GOOD_SCORE &&
      deLonge.score < cara.score &&
      // ...e a prioridade de passe continua alcançável: o pior chute que a
      // geometria ainda aprova (ângulo no limite, goleiro colado no canto)
      // fica ABAIXO do corte. Sem isto, `SHOT_GOOD_SCORE` vira decoração.
      AI_BEHAVIOR.MIN_SHOT_ANGLE_RAD * 100 + AI_BEHAVIOR.SHOT_GK_GAP_MIN <
        AI_BEHAVIOR.SHOT_GOOD_SCORE
    );
  })(),
  "AIBrain: qualidade de chute aprovando canto fechado ou mira no goleiro",
);

// =============================================================================
// Check: força e wind-up do chute, e o passe pró-gol. Os três erram calados —
// o bot vara a rede de dentro da pequena área, chuta no frame em que decide
// (sem tempo de reação para a defesa) ou finaliza de ângulo médio com o
// companheiro livre debaixo da trave.
// =============================================================================
console.assert(
  (() => {
    if (typeof AI_BEHAVIOR === "undefined") return true;
    const ctx = (d) => ({ distToGoal: d });
    const pertoDaLinha = AIBrain.shotPower(ctx(60));
    const naArea = AIBrain.shotPower(ctx(250));
    const deFora = AIBrain.shotPower(ctx(600));

    const base = {
      pX: 200,
      pY: 200,
      pW: 1600,
      pH: 1000,
      centerY: 700,
      targetGoalX: 1800,
      isAttackingTop: false,
      distToGoal: 400,
    };
    const comTime = (aliados) => ({
      ...base,
      scene: {
        allPlayers: aliados.map((a) => ({ isPlayerTeam: true, ...a })),
      },
    });
    // Portador de ângulo médio, longe da meta e de lado.
    const portador = { isPlayerTeam: true, x: 1400, y: 980 };
    // Companheiro DENTRO da área, na cara do gol: manda ele finalizar.
    const naCaraDoGol = comTime([{ x: 1680, y: 700 }]);
    // Mesmo companheiro, mas FORA da área: não é passe pró-gol.
    const foraDaArea = comTime([{ x: 1300, y: 700 }]);
    // Companheiro na área porém de ângulo PIOR que o meu: chute continua.
    const anguloPior = comTime([{ x: 1780, y: 980 }]);

    return (
      // Perto da linha sai no mínimo; de fora vai tudo; e cresce no meio.
      Math.abs(pertoDaLinha - AI_BEHAVIOR.SHOT_POWER_MIN) < 0.001 &&
      Math.abs(deFora - 1) < 0.001 &&
      naArea > pertoDaLinha &&
      naArea < deFora &&
      // Wind-up dentro da faixa, e chute forte demora mais a armar.
      AIBrain.shotWindup(pertoDaLinha) >= AI_BEHAVIOR.SHOT_WINDUP_MIN_MS &&
      AIBrain.shotWindup(deFora) <= AI_BEHAVIOR.SHOT_WINDUP_MAX_MS &&
      AIBrain.shotWindup(deFora) > AIBrain.shotWindup(pertoDaLinha) &&
      // O bot NUNCA chuta no frame em que decide.
      AIBrain.shotWindup(0) > 0 &&
      // Passe pró-gol.
      AIBrain.betterPlacedAlly(portador, naCaraDoGol) !== null &&
      AIBrain.betterPlacedAlly(portador, foraDaArea) === null &&
      AIBrain.betterPlacedAlly(portador, anguloPior) === null &&
      AIBrain.betterPlacedAlly(portador, comTime([])) === null
    );
  })(),
  "AIBrain: força/wind-up do chute fora de escala, ou passe pró-gol não dispara",
);

// =============================================================================
// Check: segundo pau e ultrapassagem. Os dois erram calados — o cruzamento vai
// para a trave errada (do lado do próprio portador, onde o goleiro está) e o
// passador "ultrapassa" recuando. Nenhum dos dois aparece no console.
// =============================================================================
console.assert(
  (() => {
    if (typeof AI_BEHAVIOR === "undefined") return true;
    const base = {
      pX: 200,
      pY: 200,
      pW: 1600,
      pH: 1000,
      centerY: 700,
      targetGoalX: 1800,
      scene: { allPlayers: [] },
    };
    const meiaBoca = GOAL_WIDTH / 2 - AI_BEHAVIOR.FAR_POST_OFFSET;

    // Ala invadindo a lateral de BAIXO da área: sem ângulo, cruza para a trave
    // de CIMA — a oposta. Cruzar para a própria é entregar no goleiro.
    const alaEmBaixo = { isPlayerTeam: true, x: 1700, y: 1050 };
    const ctxBaixo = { ...base, distToGoal: 380 };
    const alvoBaixo = AIBrain.farPostPoint(alaEmBaixo, ctxBaixo);

    const alaEmCima = { isPlayerTeam: true, x: 1700, y: 350 };
    const alvoCima = AIBrain.farPostPoint(alaEmCima, ctxBaixo);

    // A situação só vale na LATERAL da área e sem ângulo.
    const naLateral = AIBrain.isFarPostSituation(alaEmBaixo, ctxBaixo);
    const naCaraDoGol = AIBrain.isFarPostSituation(
      { isPlayerTeam: true, x: 1600, y: 700 },
      { ...base, distToGoal: 200 },
    );
    const noMeioDeCampo = AIBrain.isFarPostSituation(alaEmBaixo, {
      ...base,
      distToGoal: 900,
    });

    // Ultrapassagem: com o timer correndo o alvo é a linha de fundo, à frente
    // de onde ele está. Sem timer, não existe.
    const passador = { isPlayerTeam: true, x: 900, y: 500, oneTwoTimer: 2000 };
    const corrida = AIBrain.overlapRunTarget(passador, { ...base });
    const semTimer = AIBrain.overlapRunTarget(
      { ...passador, oneTwoTimer: 0 },
      { ...base },
    );
    // Já colado no fundo, ele ainda avança — nunca fica parado nem volta.
    const jaNoFundo = AIBrain.overlapRunTarget(
      { ...passador, x: 1750 },
      { ...base },
    );

    return (
      alvoBaixo.y === 700 - meiaBoca &&
      alvoCima.y === 700 + meiaBoca &&
      alvoBaixo.x === 1800 &&
      naLateral === true &&
      naCaraDoGol === false &&
      noMeioDeCampo === false &&
      semTimer === null &&
      corrida.x > 900 &&
      corrida.x >= 1800 - AI_BEHAVIOR.ONE_TWO_BYLINE_INSET - 46 &&
      jaNoFundo.x > 1750
    );
  })(),
  "AIBrain: segundo pau na trave errada ou ultrapassagem sem avançar",
);

// =============================================================================
// Check: a interceptação. Correr para a bola PARADA em vez de para onde ela vai
// não quebra nada no console — só faz o bot chegar sempre um passo atrás, em
// trajetória curva, e isso se vê jogando, não no log.
// =============================================================================
console.assert(
  (() => {
    if (typeof BALL_PHYSICS === "undefined") return true;
    const ctx = (vx, vy, bx = 1000, by = 700) => ({
      pX: 200,
      pY: 200,
      pW: 1600,
      pH: 1000,
      ball: { x: bx, y: by, body: { velocity: { x: vx, y: vy } } },
    });
    const bot = { x: 1000, y: 200, sprintSpeed: 3 }; // 180 px/s

    // Bola parada: o alvo é ela mesma.
    const parada = AIBrain.ballInterceptPoint(bot, ctx(0, 0), 500);
    // Bola indo para a direita: o alvo sai na FRENTE dela, no mesmo eixo.
    const rolando = AIBrain.ballInterceptPoint(bot, ctx(600, 0), 500);
    // Mais rápida = mais adiantado, mas nunca além do alcance do atrito.
    const rapida = AIBrain.ballInterceptPoint(bot, ctx(900, 0), 500);
    const k = -60 * Math.log(BALL_PHYSICS.FRICTION_GROUND);
    // Bola saindo pela lateral: o alvo fica dentro das linhas.
    const paraFora = AIBrain.ballInterceptPoint(bot, ctx(0, 4000), 500);

    return (
      parada.x === 1000 &&
      parada.y === 700 &&
      rolando.x > 1000 &&
      rolando.y === 700 &&
      rapida.x > rolando.x &&
      rapida.x < 1000 + 900 / k + 1 &&
      paraFora.y <= 200 + 1000 - 45
    );
  })(),
  "AIBrain: interceptação mirando a bola parada em vez da posição futura",
);

// =============================================================================
// Check: linha de visão do passe. O teste antigo era um retângulo por inimigo e
// deixava passar bola no meio de dois marcadores — erro que só aparece como
// "a IA toca para o adversário", nunca no console.
// =============================================================================
console.assert(
  (() => {
    if (typeof AI_BEHAVIOR === "undefined") return true;
    const passador = { isPlayerTeam: true, x: 200, y: 500 };
    const aliado = { x: 800, y: 500 };
    const com = (inimigos) => ({
      scene: { allPlayers: inimigos.map((p) => ({ isPlayerTeam: false, ...p })) },
    });

    const d = AIBrain.distanceToSegment;
    return (
      // Projeção perpendicular no trecho.
      d(500, 500, 200, 500, 800, 500) === 0 &&
      d(500, 900, 200, 500, 800, 500) === 400 &&
      // Fora do trecho mede até a ponta, não até a reta infinita.
      d(50, 500, 200, 500, 800, 500) === 150 &&
      // Marcador na trajetória barra o passe...
      AIBrain.isPassLaneClear(passador, aliado, com([{ x: 500, y: 500 }])) === false &&
      // ...inclusive de raspão, dentro da folga.
      AIBrain.isPassLaneClear(
        passador,
        aliado,
        com([{ x: 500, y: 500 + AI_BEHAVIOR.PASS_LANE_CLEARANCE - 5 }]),
      ) === false &&
      // Longe da linha, ou atrás do passador, não intercepta nada.
      AIBrain.isPassLaneClear(passador, aliado, com([{ x: 500, y: 900 }])) === true &&
      AIBrain.isPassLaneClear(passador, aliado, com([{ x: 50, y: 500 }])) === true
    );
  })(),
  "AIBrain: linha de visão do passe não barra marcador na trajetória",
);
