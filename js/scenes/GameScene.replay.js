// Replay pós-gol (buffer circular de 180 frames = 3s) extraído de GameScene.js.
// Mixin de prototype: `this` continua sendo a própria cena, nenhuma chamada muda.
// DEVE ser carregado DEPOIS de GameScene.js no index.html.

if (typeof GameScene === "undefined") {
  throw new Error(
    "GameScene.replay.js carregado antes de GameScene.js — corrija a ordem dos <script> no index.html",
  );
}

// ponytail: Object.assign deixa os métodos enumeráveis no prototype (métodos de
// classe não são). Trocar por Object.defineProperties se algum for...in sobre a
// cena passar a enxergar coisa demais.
Object.assign(GameScene.prototype, {
  recordReplayFrame() {
    if (this.isReplaying) return;

    const snapshot = {
      ball: {
        x: this.ball.x,
        y: this.ball.y,
        z: this.ball.z || 0,
        rotation: this.ball.visualBall
          ? this.ball.visualBall.rotation
          : this.ball.rotation,
        frame:
          this.ball.visualBall && this.ball.visualBall.frame
            ? this.ball.visualBall.frame.name
            : 0,
        visible: this.ball.visible,
      },
      players: this.allPlayers.map((p) => ({
        x: p.x,
        y: p.y,
        anim: p.anims.currentAnim ? p.anims.currentAnim.key : null,
        frame: p.anims.currentFrame ? p.anims.currentFrame.index : 0,
        flipX: p.flipX,
        visible: p.visible,
      })),
      gks: [this.gkTop, this.gkBottom].map((gk) => ({
        x: gk.x,
        y: gk.y,
        anim: gk.anims.currentAnim ? gk.anims.currentAnim.key : null,
        frame: gk.anims.currentFrame ? gk.anims.currentFrame.index : 0,
        flipX: gk.flipX,
        visible: gk.visible,
      })),
    };

    this.replayBuffer.push(snapshot);
    if (this.replayBuffer.length > this.replayMaxFrames) {
      this.replayBuffer.shift();
    }
  },

  startReplay() {
    if (this.replayBuffer.length === 0) {
      this.time.delayedCall(1500, () => this.resetMatch());
      return;
    }

    this.isReplaying = true;
    this.replayFrameIndex = 0;
    this.gameState = GameStates.PAUSED;

    // UI Feedback
    this.replayUI.setAlpha(1);

    // Desativar física durante o replay
    this.physics.world.pause();

    // Focar a câmera na bola durante o replay para ser mais dramático
    this.cameras.main.stopFollow();
    this.cameras.main.startFollow(this.ball, true, 0.1, 0.1);
    this.cameras.main.setZoom(1.1); // Zoom leve que não corta o HUD com setScrollFactor(0)
  },

  playNextReplayFrame() {
    if (!this.isReplaying) return;

    const frame = this.replayBuffer[this.replayFrameIndex];
    if (!frame) {
      this.stopReplay();
      return;
    }

    // Aplicar estado da bola (Sombra e Lógica)
    this.ball.setPosition(frame.ball.x, frame.ball.y);
    this.ball.z = frame.ball.z;
    this.ball.visible = frame.ball.visible;

    // Aplicar estado da bola visual
    if (this.ball.visualBall) {
      this.ball.visualBall.setPosition(
        frame.ball.x,
        frame.ball.y - frame.ball.z,
      );
      this.ball.visualBall.rotation = frame.ball.rotation;
      this.ball.visualBall.setFrame(frame.ball.frame);
      this.ball.visualBall.visible = frame.ball.visible;
    }

    // Escala da sombra (repetindo lógica do Ball.js para consistência visual no replay)
    const shadowScale = Phaser.Math.Clamp(1 - this.ball.z / 300, 0.4, 1);
    this.ball.setScale(shadowScale, shadowScale * 0.5);
    this.ball.setAlpha(0.3 * shadowScale);

    // Aplicar estado dos jogadores
    frame.players.forEach((pData, i) => {
      const p = this.allPlayers[i];
      if (p) {
        p.setPosition(pData.x, pData.y);
        if (pData.anim) p.play(pData.anim, true);
        p.flipX = pData.flipX;
        p.visible = pData.visible;
      }
    });

    // Aplicar estado dos goleiros
    const gks = [this.gkTop, this.gkBottom];
    frame.gks.forEach((gkData, i) => {
      const gk = gks[i];
      if (gk) {
        gk.setPosition(gkData.x, gkData.y);
        if (gkData.anim) gk.play(gkData.anim, true);
        gk.flipX = gkData.flipX;
        gk.visible = gkData.visible;
      }
    });

    this.replayFrameIndex++;
    if (this.replayFrameIndex >= this.replayBuffer.length) {
      // Pequena pausa no último frame antes de resetar
      this.isReplaying = false;
      this.time.delayedCall(1000, () => this.stopReplay());
    }
  },

  stopReplay() {
    // Convidado de LAN/online: o fim do replay NÃO reseta a partida. Quem
    // repõe a bola é o anfitrião, e resetar aqui brigaria com o pacote dele.
    if (this.lan && !this.souHostLan && this.lanPararReplay) {
      return this.lanPararReplay();
    }

    this.isReplaying = false;
    this.replayUI.setAlpha(0);
    this.physics.world.resume();
    this.cameras.main.setZoom(1);
    this.cameras.main.stopFollow();
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);

    // Limpar buffer para o próximo lance
    this.replayBuffer = [];

    // Finalmente resetar a partida
    this.resetMatch();
  },

});

// Check: falha alto no console se algum método sumir na extração.
console.assert(
  ["recordReplayFrame", "startReplay", "playNextReplayFrame", "stopReplay"].every(
    (m) => typeof GameScene.prototype[m] === "function",
  ),
  "GameScene.replay.js: método de replay faltando no prototype",
);
