// Input (teclado, mouse, gamepad) extraído de GameScene.js.
// Mixin de prototype: `this` continua sendo a própria cena, nenhuma chamada muda.
// DEVE ser carregado DEPOIS de GameScene.js no index.html.
//
// Issue #4 resolvida aqui: o gamepad tinha DOIS caminhos para os mesmos botões —
// os eventos `input.gamepad.on("down"/"up")` e o polling no update(). Cada botão
// disparava duas vezes. Ficou só o polling, que é superset dos eventos (também
// trata L1 = trocar jogador, analógico direito = mira do chute, RT = chute forte).

if (typeof GameScene === "undefined") {
  throw new Error(
    "GameScene.input.js carregado antes de GameScene.js — corrija a ordem dos <script> no index.html",
  );
}

// ponytail: Object.assign deixa os métodos enumeráveis no prototype (métodos de
// classe não são). Trocar por Object.defineProperties se algum for...in sobre a
// cena passar a enxergar coisa demais.
Object.assign(GameScene.prototype, {
  /** Registra teclado, mouse e o estado de input. Chamado uma vez no create(). */
  setupInput() {
    this.keys = this.input.keyboard.addKeys({
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      c: Phaser.Input.Keyboard.KeyCodes.C,
      q: Phaser.Input.Keyboard.KeyCodes.Q, // Through Pass
      e: Phaser.Input.Keyboard.KeyCodes.E, // Cross
      x: Phaser.Input.Keyboard.KeyCodes.X, // Short Pass / First-time pass
      tab: Phaser.Input.Keyboard.KeyCodes.TAB,
    });

    // Estado do chute carregado (compartilhado por mouse e gamepad)
    this.gamepadKickStartedAt = 0;
    this.gamepadCharging = false;
    this.pointerPressStartedAt = 0;
    this.pointerPressWorld = { x: 0, y: 0 };
    this.tapPassThreshold = 180;
    this.minHoldForVisibleCharge = 90;

    // Drag-to-curve: linha elástica desenhada em coordenadas de MUNDO, para
    // acompanhar o jogador e o gramado quando a câmera anda.
    this.dragCurveGraphics = this.add.graphics().setDepth(40);

    // --- PASSES POR TECLA ---
    const passKeys = { Q: "through", E: "cross", X: "short" };
    Object.entries(passKeys).forEach(([key, type]) => {
      this.input.keyboard.on(`keydown-${key}`, () => {
        if (
          this.isGameOver ||
          this._pauseMenuActive ||
          this.gameState !== GameStates.PLAYING
        )
          return;
        this.executPass(this.input.activePointer, type);
      });
    });

    // --- PAUSA COM ESC ---
    this.input.keyboard.on("keydown-ESC", () => this.togglePauseMenu());

    // --- MOUSE: ESQUERDO = chute (carrega e solta), DIREITO = passe ---
    // Um botão, uma função. Antes o esquerdo era chute OU passe conforme o
    // tempo de clique: quem queria chute fraco de perto acabava tocando a bola.
    this.input.mouse?.disableContextMenu();

    this.input.on("pointerdown", (pointer) => {
      if (this.isSpectator) return; // Desabilitar input no modo assistir
      if (pointer.leftButtonDown()) {
        this.pointerPressStartedAt = this.time.now;
        this.pointerPressWorld = { x: pointer.worldX, y: pointer.worldY };
        this.startKickCharging(pointer);
      } else if (pointer.rightButtonDown()) {
        this.executPass(pointer);
      }
    });

    this.input.on("pointermove", (pointer) => {
      if (this.isSpectator || !this.player?.isChargingKick) return;
      if (!pointer.leftButtonDown()) return;
      this.drawDragCurve(pointer, this.computeDragCurve(pointer));
    });

    this.input.on("pointerup", (pointer) => {
      if (this.dragCurveGraphics) this.dragCurveGraphics.clear();
      if (!this.player) return;
      // Botão direito é passe e já resolveu no pointerdown.
      if (!pointer.leftButtonReleased()) return;

      // Esquerdo SEMPRE chuta — clique curto vira chute fraco, não passe.
      if (this.player.isChargingKick) {
        this.executeChargedKick(pointer, this.computeDragCurve(pointer));
      }
    });
  },

  /**
   * Componente do arrasto perpendicular à mira, em "unidades de curva".
   * Puro de propósito: é a única matemática do gesto e o check no fim do
   * arquivo depende disso não ter `this`.
   * Positivo = arrastou para a direita da mira = curva para a direita.
   */
  curveFromDrag(aimX, aimY, dragX, dragY, maxCurve = 9) {
    const aimLen = Math.hypot(aimX, aimY);
    if (aimLen < 1) return 0;
    // Produto vetorial 2D / |mira| = deslocamento lateral puro, em pixels.
    const lateral = (aimX * dragY - aimY * dragX) / aimLen;
    return Phaser.Math.Clamp(lateral / 20, -maxCurve, maxCurve);
  },

  /** Nível da skill Bola Curva. Sem carreira (amistoso) = 0 = curva mínima. */
  curveSkillLevel() {
    return Phaser.Math.Clamp(
      window.careerMode?.skills?.curveBall || 0,
      0,
      CURVE_SKILL.MAX_LEVEL,
    );
  },

  /** Teto de curva que o jogador destravou. */
  maxCurveForPlayer() {
    return (
      CURVE_SKILL.MAX_CURVE_BASE +
      this.curveSkillLevel() * CURVE_SKILL.MAX_CURVE_PER_LEVEL
    );
  },

  /** Aplica curveFromDrag ao estado atual do ponteiro. */
  computeDragCurve(pointer) {
    if (!this.player) return 0;
    return this.curveFromDrag(
      pointer.worldX - this.player.x,
      pointer.worldY - this.player.y,
      pointer.worldX - this.pointerPressWorld.x,
      pointer.worldY - this.pointerPressWorld.y,
      this.maxCurveForPlayer(),
    );
  },

  /** Linha elástica jogador → ponteiro, entortada para o lado da curva. */
  drawDragCurve(pointer, curveAmount) {
    const g = this.dragCurveGraphics;
    g.clear();
    if (!this.player) return;

    const charge = Phaser.Math.Clamp(
      this.player.kickChargeTime / this.player.maxKickChargeTime,
      0,
      1,
    );

    const start = new Phaser.Math.Vector2(this.player.x, this.player.y);
    const aim = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
    const dir = aim.clone().subtract(start).normalize();
    const nrm = new Phaser.Math.Vector2(-dir.y, dir.x); // mesma perpendicular do Magnus

    // A ponta sai da linha de mira para o lado da curva — é assim que a bola
    // termina. Arquear só o meio fazia a segunda metade do traço voltar para o
    // alvo, o oposto do que a bola faz, e era isso que parecia invertido.
    // Escala contida + teto rígido: o traço é indicação, não escala 1:1.
    // O teto sobe com a skill Bola Curva — é o feedback de que ela evoluiu.
    const arcLimit =
      CURVE_SKILL.ARC_LIMIT_BASE +
      this.curveSkillLevel() * CURVE_SKILL.ARC_LIMIT_PER_LEVEL;
    const lateral = Phaser.Math.Clamp(curveAmount * 8, -arcLimit, arcLimit);
    const tip = aim.clone().add(nrm.clone().scale(lateral));
    // Controle sobre a própria linha de mira: sai reto do pé e abre no fim.
    const control = start.clone().lerp(aim, 0.55);

    // Espessura e opacidade crescem com a carga = força do chute.
    g.lineStyle(2 + charge * 5, this.playerTeamColor, 0.35 + charge * 0.5);
    new Phaser.Curves.QuadraticBezier(start, control, tip).draw(g, 24);
    g.fillStyle(this.playerTeamColor, 0.9);
    g.fillCircle(tip.x, tip.y, 4 + charge * 6);
  },

  /** Abre/fecha o menu de pausa. Único ponto de toggle (ESC e Start do gamepad). */
  togglePauseMenu() {
    if (this.isGameOver || this.isReplaying) return;
    if (this._pauseMenuActive) {
      this._closePauseMenu();
    } else if (this.gameState === GameStates.PLAYING) {
      this._openPauseMenu();
    }
  },

  /** Leitura de input por frame (TAB + gamepad). Chamado do update(). */
  updateInputPolling() {
    // Manual switch: TAB key or gamepad button 4 (LB/L1)
    if (Phaser.Input.Keyboard.JustDown(this.keys.tab)) {
      this.switchPlayer();
    }

    const pad = this.input.gamepad.pad1;
    if (!pad || !pad.connected) return;

    // Switch player with L1 (button 4) or LB
    const switchButton = pad.L1 || pad.LB || pad.buttons[4]?.pressed;
    if (switchButton && !this.gamepadPrevSwitch) {
      this.switchPlayer();
    }
    this.gamepadPrevSwitch = switchButton;

    // Ler analogico direito para direção do chute
    this.gamepadRightStickX = pad.rightStick?.x || pad.axes[2]?.getValue() || 0;
    this.gamepadRightStickY = pad.rightStick?.y || pad.axes[3]?.getValue() || 0;

    // Passes: A (Cruz) curto, X (Quadrado) profundidade, Y (Triângulo) cruzamento
    const passButtons = [
      { pressed: pad.A || pad.buttons[0]?.pressed, prev: "gamepadPrevA", type: "short" },
      { pressed: pad.X || pad.buttons[2]?.pressed, prev: "gamepadPrevX", type: "through" },
      { pressed: pad.Y || pad.buttons[3]?.pressed, prev: "gamepadPrevY", type: "cross" },
    ];
    passButtons.forEach(({ pressed, prev, type }) => {
      if (
        pressed &&
        !this[prev] &&
        this.gameState === GameStates.PLAYING &&
        !this.isSpectator &&
        !this._pauseMenuActive
      ) {
        this.cancelKickCharge();
        this.gamepadCharging = false;
        this.executPass(this.input.activePointer, type);
      }
      this[prev] = pressed;
    });

    // Botão B (Círculo) - Chute
    const bButton = pad.B || pad.buttons[1]?.pressed;
    // Verificar se RT está pressionado (para chute forte)
    const rtPressed =
      (pad.RT && pad.RT > 0.5) ||
      (pad.buttons[7]?.value && pad.buttons[7].value > 0.5);
    if (
      bButton &&
      !this.gamepadPrevB &&
      this.gameState === GameStates.PLAYING &&
      !this.isSpectator
    ) {
      if (!this._pauseMenuActive) {
        this.gamepadKickStartedAt = this.time.now;
        this.gamepadCharging = true;
        // Se RT estiver pressionado, começa o carregamento com valor maior para chute forte
        if (rtPressed) {
          this.player.kickChargeTime = this.player.maxKickChargeTime * 0.8; // Chute forte
        }
        this.startKickCharging(this.input.activePointer);
      }
    }
    if (
      !bButton &&
      this.gamepadPrevB &&
      this.gamepadCharging &&
      this.gameState === GameStates.PLAYING &&
      !this.isSpectator
    ) {
      // Soltar botão B para finalizar chute
      const heldFor = this.time.now - this.gamepadKickStartedAt;
      if (heldFor <= this.tapPassThreshold) {
        this.cancelKickCharge();
        this.executPass(this.input.activePointer);
      } else {
        // Criar um fake pointer com a direção do analogico direito
        // Se o analogico direito não for movido, usa a direção do jogador
        let targetX, targetY;
        if (
          Math.abs(this.gamepadRightStickX) > 0.1 ||
          Math.abs(this.gamepadRightStickY) > 0.1
        ) {
          targetX = this.player.x + this.gamepadRightStickX * 500;
          targetY = this.player.y + this.gamepadRightStickY * 500;
        } else {
          // Usa a direção que o jogador está virado
          const angle = Phaser.Math.DegToRad(this.player.moveAngle || 0);
          targetX = this.player.x + Math.cos(angle) * 500;
          targetY = this.player.y + Math.sin(angle) * 500;
        }
        const fakePointer = { worldX: targetX, worldY: targetY };
        this.executeChargedKick(fakePointer);
      }
      this.gamepadCharging = false;
    }
    this.gamepadPrevB = bButton;

    // Botão Start (Options) - Pausar
    const startButton =
      pad.Start || pad.buttons[9]?.pressed || pad.buttons[10]?.pressed;
    if (startButton && !this.gamepadPrevStart) {
      this.togglePauseMenu();
    }
    this.gamepadPrevStart = startButton;
  },
});

// Check: falha alto no console se algum método sumir na extração.
console.assert(
  [
    "setupInput",
    "togglePauseMenu",
    "updateInputPolling",
    "curveFromDrag",
    "computeDragCurve",
    "drawDragCurve",
    "curveSkillLevel",
    "maxCurveForPlayer",
  ].every((m) => typeof GameScene.prototype[m] === "function"),
  "GameScene.input.js: método de input faltando no prototype",
);

// Check: mira para +X. Arrastar para BAIXO (+Y) tem de curvar positivo, para
// CIMA negativo, e arrastar em cima da própria mira não pode curvar nada.
console.assert(
  GameScene.prototype.curveFromDrag(100, 0, 0, 200) === 9 &&
    GameScene.prototype.curveFromDrag(100, 0, 0, -200) === -9 &&
    GameScene.prototype.curveFromDrag(100, 0, 300, 0) === 0 &&
    GameScene.prototype.curveFromDrag(100, 0, 0, 100) === 5,
  "GameScene.input.js: curveFromDrag com sinal, escala ou clamp errado",
);

// Check: o teto da skill tem de limitar de verdade. Sem Bola Curva (nível 0) um
// arrastão enorme não pode passar de MAX_CURVE_BASE; no nível máximo, sim.
console.assert(
  GameScene.prototype.curveFromDrag(100, 0, 0, 9999, 1.5) === 1.5 &&
    GameScene.prototype.curveFromDrag(100, 0, 0, -9999, 1.5) === -1.5 &&
    GameScene.prototype.curveFromDrag(100, 0, 0, 20, 1.5) === 1 &&
    GameScene.prototype.curveFromDrag(100, 0, 0, 9999, 9) === 9,
  "GameScene.input.js: teto de curva da skill não está limitando",
);
