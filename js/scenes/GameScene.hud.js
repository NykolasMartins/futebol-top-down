// HUD e overlays DOM (texto flutuante, partículas, relógio, menu de pausa)
// extraídos de GameScene.js.
// Mixin de prototype: `this` continua sendo a própria cena, nenhuma chamada muda.
// DEVE ser carregado DEPOIS de GameScene.js no index.html.
//
// Nota: `this.updateHUD` NÃO está aqui — é uma closure criada dentro de
// GameScene.create(), não um método do prototype.

if (typeof GameScene === "undefined") {
  throw new Error(
    "GameScene.hud.js carregado antes de GameScene.js — corrija a ordem dos <script> no index.html",
  );
}

// ponytail: Object.assign deixa os métodos enumeráveis no prototype (métodos de
// classe não são). Trocar por Object.defineProperties se algum for...in sobre a
// cena passar a enxergar coisa demais.
Object.assign(GameScene.prototype, {
  // === CICLO DE VIDA DO DOM ===

  /**
   * Varre e destrói TODO o DOM da cena. O placar é uma `div` pendurada à mão no
   * `#game-container`, fora do sistema do Phaser — ninguém a recolhia. E os
   * métodos `shutdown()`/`destroy()` da classe NÃO são chamados pelo Phaser: ele
   * emite o EVENTO `shutdown`. Resultado: placar e menu ficavam na tela até o F5.
   * Idempotente — pode ser chamado no fim da partida e de novo no shutdown.
   */
  _teardownDOM() {
    this.input.setDefaultCursor("default");

    if (this.hudElement && this.hudElement.parentNode) {
      this.hudElement.parentNode.removeChild(this.hudElement);
    }
    this.hudElement = null;

    if (this._pauseMenuDOM) {
      this._pauseMenuDOM.destroy();
      this._pauseMenuDOM = null;
    }
    this._pauseMenuActive = false;

    // Rede de segurança: qualquer `add.dom` que tenha sobrado na cena.
    (this.children ? this.children.list.slice() : [])
      .filter((o) => o && o.type === "DOMElement")
      .forEach((o) => o.destroy());
  },

  /** Liga o teardown ao fim da cena. Chamado uma vez, no fim do `create()`. */
  registerDOMTeardown() {
    this.events.once("shutdown", () => this._teardownDOM());
    this.events.once("destroy", () => this._teardownDOM());
    // A torcida é um loop contínuo no WebAudio: ninguém a recolhe sozinha, e
    // ela seguiria tocando por cima do menu depois do apito final. Mesmo
    // motivo do placar em DOM — o Phaser não sabe que isto existe.
    this.events.once("shutdown", () => Som.pararTorcida());
    this.events.once("destroy", () => Som.pararTorcida());
  },

  /**
   * Nível do estádio. Chamado uma vez por segundo pelo relógio — é a cadência
   * certa: torcida não reage a frame, reage a lance. Sobe quando a bola chega
   * perto de uma área e quando o jogo está apertado no fim.
   */
  atualizarTorcida() {
    if (!Som.torcida || !this.ball) return;
    const meio = PITCH_X + PITCH_WIDTH / 2;
    // 0 no meio de campo, 1 colado em qualquer um dos gols.
    const perigo = Phaser.Math.Clamp(
      Math.abs(this.ball.x - meio) / (PITCH_WIDTH / 2),
      0,
      1,
    );
    const decisivo =
      this.isSecondHalf &&
      this.timeLeft <= AI_BEHAVIOR.ENDGAME_SEC &&
      Math.abs(this.scorePlayer - this.scoreOpponent) <= 1
        ? 0.25
        : 0;
    Som.nivelTorcida(0.15 + perigo * 0.55 + decisivo, 1.5);
  },

  // === PLACAR DE TRANSMISSÃO ===

  /** Mandante/visitante do confronto. Fora da carreira, o usuário é o mandante. */
  _matchSides() {
    const career = window.careerMode;
    // No amistoso o time vem do `data` da cena — o `careerMode` pode estar
    // carregado na memória e não tem nada a ver com este jogo.
    const meu = this.isExhibition
      ? this.playerTeamName || "SEU TIME"
      : (career && career.currentTeam && career.currentTeam.name) ||
        this.playerTeamName ||
        "SEU TIME";
    const dele = (this.opponent && this.opponent.name) || "ADVERSÁRIO";
    const evento = this._fixtureOfMatch();
    const emCasa = evento ? evento.isHome !== false : true;
    return {
      home: emCasa ? meu : dele,
      away: emCasa ? dele : meu,
      homeIsPlayer: emCasa,
    };
  },

  /** A partida desta rodada no schedule do usuário, se houver carreira. */
  _fixtureOfMatch() {
    const career = window.careerMode;
    if (!career || this.isExhibition) return null;
    return (
      career.schedule.find(
        (e) => e.dayOffset === career.currentDayOffset && e.type === this.matchType,
      ) ||
      career.schedule.find((e) => e.dayOffset === career.currentDayOffset) ||
      null
    );
  },

  /** Nome da competição para a faixa inferior. Nunca um literal na tela. */
  _competitionLabel() {
    if (this.isExhibition) return "PARTIDA DE EXIBIÇÃO";
    const career = window.careerMode;
    const evento = this._fixtureOfMatch();
    if (evento && evento.competitionName) return evento.competitionName;
    if (!career) return "AMISTOSO";
    return this.matchType === "copa"
      ? career.playerCupName()
      : career.playerLeagueName();
  },

  /** Cor do uniforme como accent do bloco. TEAMS_DB guarda 0xRRGGBB. */
  _teamAccent(teamId) {
    const kit = typeof TEAMS_DB !== "undefined" ? TEAMS_DB[teamId] : null;
    const n = kit && typeof kit.shirt1 === "number" ? kit.shirt1 : 0x888888;
    return "#" + n.toString(16).padStart(6, "0");
  },

  /**
   * Placar em três faixas empilhadas, no padrão de transmissão: tempo em cima,
   * os dois blocos de time no meio (sigla para fora, número para o centro) e a
   * competição embaixo. O estilo mora no `ui.css` (`.hud-*`) — este HUD fica
   * fora de `.pui-root`, então as classes precisam declarar a fonte.
   */
  buildScoreboardHTML() {
    const { home, away, homeIsPlayer } = this._matchSides();
    const golsCasa = homeIsPlayer ? this.scorePlayer : this.scoreOpponent;
    const golsFora = homeIsPlayer ? this.scoreOpponent : this.scorePlayer;

    return `
      <div class="hud-board">
        <div class="hud-clock" id="hud-clock">1T 00:00</div>
        <div class="hud-teams">
          <div class="hud-team hud-team-home" style="border-bottom-color:${this._teamAccent(home)};">
            <span class="hud-acr">${clubAcronym(home)}</span>
            <span class="hud-reds" id="hud-reds-home"></span>
            <span class="hud-goals" id="hud-goals-home">${golsCasa}</span>
          </div>
          <div class="hud-team hud-team-away" style="border-bottom-color:${this._teamAccent(away)};">
            <span class="hud-goals" id="hud-goals-away">${golsFora}</span>
            <span class="hud-reds" id="hud-reds-away"></span>
            <span class="hud-acr">${clubAcronym(away)}</span>
          </div>
        </div>
        <div class="hud-competition">${this._competitionLabel().toUpperCase()}</div>
      </div>`;
  },

  /** Só os números e o relógio mudam durante a partida. */
  refreshScoreboard() {
    const { homeIsPlayer } = this._matchSides();
    const casa = document.getElementById("hud-goals-home");
    const fora = document.getElementById("hud-goals-away");
    if (casa)
      casa.textContent = homeIsPlayer ? this.scorePlayer : this.scoreOpponent;
    if (fora)
      fora.textContent = homeIsPlayer ? this.scoreOpponent : this.scorePlayer;

    // Uma tira vermelha por expulso, do lado do time que ficou com menos gente.
    // `casa/fora` é do ponto de vista de quem MANDA o jogo, e a contagem é por
    // time (PLAYER/OPPONENT) — inverter aqui é o mesmo cuidado do placar.
    const expulsos = this.expulsos || { PLAYER: 0, OPPONENT: 0 };
    const tira = (n) => '<i class="hud-red"></i>'.repeat(n);
    const vermelhosCasa = document.getElementById("hud-reds-home");
    const vermelhosFora = document.getElementById("hud-reds-away");
    if (vermelhosCasa)
      vermelhosCasa.innerHTML = tira(
        homeIsPlayer ? expulsos.PLAYER : expulsos.OPPONENT,
      );
    if (vermelhosFora)
      vermelhosFora.innerHTML = tira(
        homeIsPlayer ? expulsos.OPPONENT : expulsos.PLAYER,
      );

    const relogio = document.getElementById("hud-clock");
    if (relogio) {
      const m = Math.floor((this.timeLeft || 0) / 60);
      const s = Math.floor((this.timeLeft || 0) % 60);
      relogio.textContent = `${this.isSecondHalf ? "2T" : "1T"} ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
  },

  // === FEEDBACK VISUAL ===

  showFloatingText(x, y, message, color) {
    const floatingText = this.add.text(x, y, message, {
      fontSize: "20px",
      fill: color,
      fontStyle: "bold",
      fontFamily: "Arial, sans-serif",
      stroke: "#000000",
      strokeThickness: 3,
    });
    floatingText.setOrigin(0.5, 0.5);
    floatingText.setDepth(50);
    Perspectiva.reta(floatingText);

    this.tweens.add({
      targets: floatingText,
      y: y - 50,
      alpha: 0,
      duration: 1000,
      ease: "Quad.easeOut",
      onComplete: () => {
        floatingText.destroy();
      },
    });
  },

  /**
   * Hitstop do roubo de bola: congela os dois envolvidos e a bola por alguns
   * frames, com flash branco e poeira. Sem isto a troca de posse por contato
   * acontecia certinho e o jogador não via nada — a bola só trocava de pé.
   *
   * O congelamento é o `hitStopTimer`, lido nas MESMAS guardas que já param a
   * entidade no `stunTimer` (Player.update e AIBrain.applyGuards).
   */
  applyHitStop(a, b, ms = TACKLE.HIT_STOP_MS) {
    [a, b].forEach((e) => {
      if (!e) return;
      e.hitStopTimer = ms;
      e.setTint(0xffffff);
    });

    const bola = this.ball;
    if (bola) {
      const vx = bola.customVx;
      const vy = bola.customVy;
      const bodyVel = bola.body ? bola.body.velocity.clone() : null;
      bola.customVx = 0;
      bola.customVy = 0;
      if (bola.body) bola.body.setVelocity(0, 0);
      this.time.delayedCall(ms, () => {
        if (!this.ball || this.ball !== bola || bola.owner) return;
        bola.customVx = vx;
        bola.customVy = vy;
        if (bola.body && bodyVel) bola.body.setVelocity(bodyVel.x, bodyVel.y);
      });
    }

    this.spawnImpactDust(this.ball ? this.ball.x : a.x, this.ball ? this.ball.y : a.y, 0xffffff);
  },

  /**
   * Nuvem de impacto. UMA função para todo pó do jogo — chute, quique, defesa,
   * trave, carrinho, corrida — porque o que muda entre eles é NÚMERO, não
   * comportamento: `forca` (0..1) manda na quantidade, no tamanho, na distância
   * e na duração de uma vez só. Foi assim que a poeira de um toque de bola
   * deixou de ser igual à de uma bomba.
   *
   * `angulo` faz a nuvem sair para um LADO (com `abertura` de cone): pó de
   * chute sai contra o pé, grama de carrinho sai atrás do boneco. Sem ângulo,
   * espalha em roda como antes.
   */
  spawnImpactDust(x, y, color = 0xd8c08a, opcoes = {}) {
    if (typeof EfeitosVisuais !== "undefined" && !EfeitosVisuais.ligado("particulas"))
      return;
    const forca = Phaser.Math.Clamp(
      opcoes.forca === undefined ? 0.35 : opcoes.forca,
      0,
      1,
    );
    const abertura = opcoes.abertura === undefined ? Math.PI * 2 : opcoes.abertura;
    const quantos = Math.round(
      FEEDBACK.PARTICULAS_MIN +
        (FEEDBACK.PARTICULAS_MAX - FEEDBACK.PARTICULAS_MIN) * forca,
    );

    for (let i = 0; i < quantos; i++) {
      const particle = this.add.circle(
        x,
        y,
        Phaser.Math.Between(2, Math.round(3 + 4 * forca)),
        color,
        0.72,
      );
      particle.setDepth(opcoes.depth === undefined ? 28 : opcoes.depth);
      const base =
        opcoes.angulo === undefined || opcoes.angulo === null
          ? Phaser.Math.FloatBetween(0, Math.PI * 2)
          : opcoes.angulo;
      const angle = base + Phaser.Math.FloatBetween(-abertura / 2, abertura / 2);
      const dist = Phaser.Math.Between(
        Math.round(12 + 24 * forca),
        Math.round(30 + 70 * forca),
      );
      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.25,
        duration: 240 + 240 * forca,
        ease: "Quad.easeOut",
        onComplete: () => particle.destroy(),
      });
    }
  },

  /**
   * Pó de pé, todo frame: carrinho arranca grama enquanto desliza, e quem
   * corre em velocidade máxima levanta poeira. É o feedback de ESFORÇO — sem
   * ele, correr e andar são o mesmo desenho.
   *
   * O intervalo é por ENTIDADE, não global: dois carrinhos ao mesmo tempo
   * dividiriam a mesma nuvem e o segundo pareceria não ter acontecido.
   */
  atualizarPoeiraDosPes(time) {
    (this.allPlayers || []).forEach((e) => {
      if (!e || !e.active || !e.body) return;
      const v = e.body.velocity.length();
      const correndo = e === this.player && v > (e.sprintSpeed || 260) * 0.85;
      if (!e.isSliding && !correndo) return;
      if (time < (e._proximoPo || 0)) return;
      e._proximoPo =
        time +
        (e.isSliding ? FEEDBACK.POEIRA_CARRINHO_MS : FEEDBACK.POEIRA_CORRIDA_MS);

      const ang = Math.atan2(e.body.velocity.y, e.body.velocity.x) + Math.PI;
      this.spawnImpactDust(e.x, e.y + 10, e.isSliding ? 0x6ea84f : 0xd8c08a, {
        forca: e.isSliding ? 0.5 : 0.18,
        angulo: ang,
        abertura: 0.9,
        depth: 12,
      });
    });
  },

  updateTimer() {
    if (this.isGameOver) return;
    if (this._pauseMenuActive) return; // Não decrementar durante pausa

    if (this.timeLeft > 0) {
      this.timeLeft--;
      this.updateHUD(); // Use the DOM update function
      this.atualizarTorcida();
    } else {
      if (!this.isSecondHalf) {
        // Dois toques fecham o tempo; três encerram o jogo. É a convenção do
        // campo, e é o que diz ao jogador qual dos dois acabou de acontecer.
        Som.tocar("apito", { toques: 2 });
        this.startSecondHalf();
      } else {
        Som.tocar("apito", { toques: 3, dur: 0.4 });
        this.endGame();
      }
    }
  },

  // ---------------------------------------------------------------------------
  // Menu de pausa
  // ---------------------------------------------------------------------------
  _openPauseMenu() {
    if (this._pauseMenuActive) return;
    this._pauseMenuActive = true;
    this.input.setDefaultCursor("default"); // Show cursor when paused

    // Pausar a física e o timer
    this.physics.world.pause();
    if (this._gameTimer) this._gameTimer.paused = true;

    // Estado anterior para restaurar ao fechar
    this._prevGameState = this.gameState;
    this.gameState = GameStates.PAUSED;

    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;

    // IDs de clube ("man_city") não vão para a tela — ver CareerMode.clubLabel.
    const pName = window.careerMode
      ? CareerMode.clubLabel(window.careerMode.currentTeam.name)
      : "Seu Time";
    const oName = this.opponent
      ? CareerMode.clubLabel(this.opponent.name)
      : "Adversário";
    const scoreLabel = `${pName} ${this.scorePlayer} x ${this.scoreOpponent} ${oName}`;
    const halfLabel = this.isSecondHalf ? "2º TEMPO" : "1º TEMPO";
    const timeLabel = Math.ceil(this.timeLeft || 0) + "s";

    const subDisabled = this._substitutionUsed ? "pui-btn-disabled" : "";
    const subLabel = this._substitutionUsed
      ? "SUBSTITUIÇÃO JÁ USADA"
      : "PEDIR SUBSTITUIÇÃO";

    const html =
      '<div class="pui-root pui-pause-overlay" style="width:' +
      camW +
      "px;height:" +
      camH +
      'px;">' +
      '<div class="pui-pause-panel">' +
      '<div class="pui-pause-header">' +
      '<span class="pui-pause-title">⏸ PAUSADO</span>' +
      "</div>" +
      '<div class="pui-pause-score">' +
      scoreLabel +
      "<br>" +
      '<span style="font-size:5px;color:#3a5a3a;">' +
      halfLabel +
      " &nbsp;|&nbsp; " +
      timeLabel +
      " restantes</span>" +
      "</div>" +
      '<div class="pui-pause-body">' +
      '<button class="pui-pause-btn" id="pause-resume">' +
      '<span class="pause-icon">▶</span> VOLTAR AO JOGO' +
      "</button>" +
      '<button class="pui-pause-btn ' +
      subDisabled +
      '" id="pause-sub">' +
      '<span class="pause-icon">🔄</span> ' +
      subLabel +
      "</button>" +
      '<button class="pui-pause-btn" id="pause-tatica">' +
      '<span class="pause-icon">📐</span> TÁTICA: ' +
      (this.playerTactic || TACTICS.T3_1) +
      "</button>" +
      '<button class="pui-pause-btn" id="pause-config">' +
      '<span class="pause-icon">⚙</span> CONFIGURAÇÕES' +
      "</button>" +
      '<button class="pui-pause-btn danger" id="pause-quit">' +
      '<span class="pause-icon">✕</span> SAIR DO JOGO' +
      "</button>" +
      "</div>" +
      "</div>" +
      "</div>";

    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    const el = wrap.firstElementChild;

    // A camada DOM também anda na matriz da câmera — sem a compensação o menu
    // inteiro entra espremido junto com o campo.
    this._pauseMenuDOM = Perspectiva.tela(
      this.add.dom(0, 0, el).setOrigin(0, 0).setDepth(9000).setScrollFactor(0),
    );

    // Eventos
    el.addEventListener("click", (e) => {
      const id =
        e.target.id ||
        (e.target.closest("[id]") && e.target.closest("[id]").id);
      if (!id) return;

      if (id === "pause-resume") {
        this._closePauseMenu();
        return;
      }
      if (id === "pause-sub") {
        if (!this._substitutionUsed) this._openSubstitutionMenu();
        return;
      }
      if (id === "pause-tatica") {
        // Roda 3-1 → 2-2 → 4-0. Vale para quem ESTÁ em campo (a substituição
        // troca gente do time, então não dá para usar a lista fixa do início).
        const ordem = [TACTICS.T3_1, TACTICS.T2_2, TACTICS.T4_0];
        this.playerTactic =
          ordem[(ordem.indexOf(this.playerTactic) + 1) % ordem.length];
        this.allPlayers
          .filter((p) => p.isPlayerTeam)
          .forEach((p) => (p.tactic = this.playerTactic));
        // Vale para o próximo jogo também. Exibição e LAN não têm carreira.
        if (window.careerMode) {
          window.careerMode.tactic = this.playerTactic;
          window.careerMode.saveToLocalStorage();
        }
        const btn = el.querySelector("#pause-tatica");
        if (btn)
          btn.innerHTML =
            '<span class="pause-icon">📐</span> TÁTICA: ' + this.playerTactic;
        return;
      }
      if (id === "pause-config") {
        this._openConfigMenu();
        return;
      }
      if (id === "pause-quit") {
        this._quitToMenu();
        return;
      }
    });
  },

  _closePauseMenu() {
    if (!this._pauseMenuActive) return;
    this._pauseMenuActive = false;
    this.input.setDefaultCursor("none"); // Hide cursor again when resuming

    if (this._pauseMenuDOM) {
      this._pauseMenuDOM.destroy();
      this._pauseMenuDOM = null;
    }

    // Restaurar estado
    this.gameState = this._prevGameState || GameStates.PLAYING;
    this.physics.world.resume();
    if (this._gameTimer) this._gameTimer.paused = false;
  },

  // ---------------------------------------------------------------------------
  // Substituição
  // ---------------------------------------------------------------------------
  _openSubstitutionMenu() {
    if (this._pauseMenuDOM) {
      this._pauseMenuDOM.destroy();
      this._pauseMenuDOM = null;
    }

    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;

    // Montar lista de aliados atuais (exceto goleiro)
    const currentPlayers = [this.player, ...(this.allies || [])].filter(
      Boolean,
    );
    const playerCards = currentPlayers
      .map((p, i) => {
        const pos = p.archetype ? p.archetype.name || "Jogador" : "Jogador";
        const rating =
          Math.round((p.speed + p.kickPower + p.stamina) / 3) || 70;
        return (
          '<div class="pui-sub-player-card" data-player-idx="' +
          i +
          '">' +
          '<div class="pui-sub-player-name">' +
          (p.teamName || "Jogador " + (i + 1)) +
          "</div>" +
          '<div class="pui-sub-player-pos">' +
          pos +
          "</div>" +
          '<div class="pui-sub-player-rating">' +
          rating +
          "</div>" +
          "</div>"
        );
      })
      .join("");

    const html =
      '<div class="pui-root pui-pause-overlay" style="width:' +
      camW +
      "px;height:" +
      camH +
      'px;">' +
      '<div class="pui-pause-panel" style="width:500px;">' +
      '<div class="pui-pause-header">' +
      '<span class="pui-pause-title">🔄 SUBSTITUIÇÃO</span>' +
      "</div>" +
      '<div style="padding:14px;">' +
      '<p class="pui-text-pixel pui-text-muted" style="font-size:5px;margin-bottom:12px;">Selecione o jogador a substituir:</p>' +
      '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">' +
      playerCards +
      "</div>" +
      '<p class="pui-text-pixel pui-text-muted" style="font-size:5px;margin-bottom:8px;">O substituto entrará com atributos renovados (+10% stamina).</p>' +
      '<div style="display:flex;gap:8px;">' +
      '<button class="pui-btn pui-btn-danger" id="sub-cancel" style="flex:1;height:40px;font-size:6px;">CANCELAR</button>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>";

    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    const el = wrap.firstElementChild;

    // A camada DOM também anda na matriz da câmera — sem a compensação o menu
    // inteiro entra espremido junto com o campo.
    this._pauseMenuDOM = Perspectiva.tela(
      this.add.dom(0, 0, el).setOrigin(0, 0).setDepth(9000).setScrollFactor(0),
    );

    el.addEventListener("click", (e) => {
      if (e.target.id === "sub-cancel" || e.target.closest("#sub-cancel")) {
        this._openPauseMenuAfterSub();
        return;
      }

      const card = e.target.closest("[data-player-idx]");
      if (!card) return;

      const idx = parseInt(card.dataset.playerIdx);
      this._performSubstitution(idx);
    });
  },

  _performSubstitution(playerIdx) {
    const allPlayers = [this.player, ...(this.allies || [])].filter(Boolean);
    const target = allPlayers[playerIdx];
    if (!target) return;

    // Boost de stamina simulando jogador fresco
    if (target.stamina !== undefined) {
      target.stamina = Math.min(100, (target.stamina || 70) * 1.1);
    }
    if (target.maxStamina !== undefined) {
      target.maxStamina = Math.min(100, (target.maxStamina || 100) * 1.05);
    }
    // Restaurar energia
    if (target.currentStamina !== undefined) {
      target.currentStamina = target.maxStamina || 100;
    }

    this._substitutionUsed = true;

    // Feedback visual
    const flashText = this.add
      .text(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2,
        "SUBSTITUIÇÃO REALIZADA!",
        {
          fontSize: "12px",
          fill: "#00ff88",
          fontFamily: "'Press Start 2P', monospace",
          stroke: "#000",
          strokeThickness: 4,
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(9500);
    Perspectiva.tela(flashText);

    this.tweens.add({
      targets: flashText,
      alpha: 0,
      y: flashText.y - 40,
      duration: 2000,
      ease: "Power2",
      onComplete: () => flashText.destroy(),
    });

    this._openPauseMenuAfterSub();
  },

  _openPauseMenuAfterSub() {
    if (this._pauseMenuDOM) {
      this._pauseMenuDOM.destroy();
      this._pauseMenuDOM = null;
    }
    this._pauseMenuActive = false;
    this._openPauseMenu();
  },

  // ---------------------------------------------------------------------------
  // Configurações
  // ---------------------------------------------------------------------------
  _openConfigMenu() {
    if (this._pauseMenuDOM) {
      this._pauseMenuDOM.destroy();
      this._pauseMenuDOM = null;
    }

    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const s = this._gameSettings;

    const html =
      '<div class="pui-root pui-pause-overlay" style="width:' +
      camW +
      "px;height:" +
      camH +
      'px;">' +
      '<div class="pui-pause-panel" style="width:420px;">' +
      '<div class="pui-pause-header">' +
      '<span class="pui-pause-title">⚙ CONFIGURAÇÕES</span>' +
      "</div>" +
      '<div style="padding:16px;">' +
      // O interruptor de SOM está lá embaixo, com o catálogo do `Som`. O que
      // existia aqui mexia em `this.sound.mute` do Phaser, que nunca teve som
      // nenhum para calar (`noAudio: true`) — dois interruptores de som na
      // mesma tela, um deles decorativo.
      '<div class="pui-config-row">' +
      "<div>" +
      '<div class="pui-config-label">MINIMAPA</div>' +
      '<div class="pui-config-hint">Exibir minimapa durante a partida</div>' +
      "</div>" +
      '<div class="pui-toggle ' +
      (s.showMinimap ? "on" : "") +
      '" id="toggle-minimap"></div>' +
      "</div>" +
      // Efeitos: o catálogo se desenha sozinho (ver EfeitosVisuais.CATALOGO),
      // então efeito novo aparece aqui e no menu sem tocar nas duas telas.
      '<div class="pui-config-sep">EFEITOS VISUAIS</div>' +
      EfeitosVisuais.linhasHtml() +
      '<div class="pui-config-sep">SOM</div>' +
      Som.linhasHtml() +
      '<div class="pui-config-sep">JOGO</div>' +
      Dificuldade.linhasHtml() +
      '<div class="pui-config-row">' +
      "<div>" +
      '<div class="pui-config-label">CONTROLES</div>' +
      '<div class="pui-config-hint">WASD: Mover &nbsp;|&nbsp; SHIFT: Sprint<br>Clique Esq: Chute &nbsp;|&nbsp; Clique Dir: Passe<br>ESPAÇO: Bote &nbsp;|&nbsp; SHIFT+ESPAÇO: Carrinho<br>Z: Câmera (bola/jogador) &nbsp;|&nbsp; Q: Habilidade &nbsp;|&nbsp; ESC: Pausa</div>' +
      "</div>" +
      "</div>" +
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
      '<button class="pui-btn pui-btn-primary" id="config-back" style="flex:1;height:40px;font-size:6px;">VOLTAR</button>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>";

    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    const el = wrap.firstElementChild;

    // A camada DOM também anda na matriz da câmera — sem a compensação o menu
    // inteiro entra espremido junto com o campo.
    this._pauseMenuDOM = Perspectiva.tela(
      this.add.dom(0, 0, el).setOrigin(0, 0).setDepth(9000).setScrollFactor(0),
    );

    el.addEventListener("click", (e) => {
      if (e.target.id === "config-back" || e.target.closest("#config-back")) {
        this._openPauseMenuAfterSub();
        return;
      }

      // Interruptores de efeito e de som: cada módulo trata e persiste o seu.
      if (EfeitosVisuais.tratarClique(e.target)) return;
      if (Som.tratarClique(e.target)) return;
      // Trocar de dificuldade no meio da partida vale a partir do PRÓXIMO jogo:
      // as fichas dos bonecos em campo já foram calculadas no `create`.
      if (Dificuldade.tratarClique(e.target)) {
        this._openConfigMenu();
        return;
      }

      if (e.target.id === "toggle-minimap") {
        s.showMinimap = !s.showMinimap;
        e.target.classList.toggle("on", s.showMinimap);
        // Mostrar/ocultar minimapa se existir
        if (this.minimapContainer) {
          this.minimapContainer.setVisible(s.showMinimap);
        }
        return;
      }
    });
  },

  // ---------------------------------------------------------------------------
  // Sair do jogo
  // ---------------------------------------------------------------------------
  _quitToMenu() {
    // Fechar menu de pausa
    this._pauseMenuActive = false;
    if (this._pauseMenuDOM) {
      this._pauseMenuDOM.destroy();
      this._pauseMenuDOM = null;
    }

    // Restaurar física antes de sair
    this.physics.world.resume();
    this.isGameOver = true;

    // Salvar progresso parcial se houver carreira E NÃO for exibição
    if (window.careerMode && !this.isExhibition) {
      window.careerMode.saveToLocalStorage();
    }

    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      if (this.isExhibition) {
        this.scene.start("ExhibitionMatchScene");
      } else {
        this.scene.start("PreGameScene");
      }
    });
  },
});

// Check: falha alto no console se algum método sumir na extração.
console.assert(
  [
    "showFloatingText",
    "spawnImpactDust",
    "atualizarPoeiraDosPes",
    "updateTimer",
    "_openPauseMenu",
    "_closePauseMenu",
    "_openSubstitutionMenu",
    "_performSubstitution",
    "_openPauseMenuAfterSub",
    "_openConfigMenu",
    "_quitToMenu",
    "_teardownDOM",
    "registerDOMTeardown",
    "buildScoreboardHTML",
    "refreshScoreboard",
    "atualizarTorcida",
  ].every((m) => typeof GameScene.prototype[m] === "function"),
  "GameScene.hud.js: método de HUD faltando no prototype",
);

// Check: o placar de transmissão. Sigla de 3 letras, lado do mandante e cor do
// clube saem de dado — errar isso põe "undefined" ou o time errado em campo.
console.assert(
  (() => {
    if (typeof clubAcronym !== "function") return true;
    const cena = Object.create(GameScene.prototype);
    cena.isExhibition = false;
    cena.matchType = "brasileirao";
    cena.scorePlayer = 2;
    cena.scoreOpponent = 1;
    cena.timeLeft = 173;
    cena.isSecondHalf = false;
    cena.opponent = { name: "Remo" };
    cena.playerTeamName = "Flamengo";
    // Carreira falsa: o usuário joga FORA neste confronto.
    const careerAntes = window.careerMode;
    window.careerMode = {
      currentTeam: { name: "Flamengo" },
      currentDayOffset: 7,
      schedule: [
        {
          dayOffset: 7,
          type: "brasileirao",
          isHome: false,
          competitionName: "Brasileirão",
        },
      ],
      playerLeagueName: () => "Brasileirão",
      playerCupName: () => "Copa",
    };
    const fora = cena._matchSides();
    const html = cena.buildScoreboardHTML();
    window.careerMode = careerAntes;

    const div = document.createElement("div");
    div.innerHTML = html;
    const blocos = [...div.querySelectorAll(".hud-team")].map((t) =>
      t.innerText.replace(/\s+/g, " ").trim(),
    );

    return (
      // Sigla: 3 maiúsculas, com acento resolvido.
      clubAcronym("Sao_Paulo") === "SAO" &&
      clubAcronym("Flamengo") === "FLA" &&
      /^[A-Z]{3}$/.test(clubAcronym("id_que_nao_existe")) &&
      // Visitante é o usuário: o Remo é o mandante e fica no bloco da esquerda.
      fora.home === "Remo" &&
      fora.away === "Flamengo" &&
      // Placar do lado certo: 1 do Remo em casa, 2 do usuário fora.
      blocos[0] === "REM 1" &&
      blocos[1] === "2 FLA" &&
      // Cor do clube vira accent, não texto cru.
      div.querySelector(".hud-team").style.borderBottomColor !== "" &&
      div.querySelector(".hud-competition").textContent === "BRASILEIRÃO"
    );
  })(),
  "GameScene.hud.js: placar de transmissão com sigla, lado ou cor errados",
);

// Check: o teardown tem de limpar TUDO, inclusive o que não é do Phaser. Sem
// isto o placar sobrevive à troca de cena e só sai com F5.
console.assert(
  (() => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    let domDestruido = false;
    const fake = {
      input: { setDefaultCursor() {} },
      hudElement: div,
      _pauseMenuActive: true,
      _pauseMenuDOM: {
        destroy() {
          domDestruido = true;
        },
      },
      children: {
        list: [
          { type: "DOMElement", destroy() { this.morto = true; } },
          { type: "Sprite", destroy() { this.morto = true; } },
        ],
      },
    };
    const sprite = fake.children.list[1];
    GameScene.prototype._teardownDOM.call(fake);
    const limpo =
      !document.body.contains(div) &&
      fake.hudElement === null &&
      fake._pauseMenuDOM === null &&
      fake._pauseMenuActive === false &&
      domDestruido &&
      fake.children.list[0].morto === true &&
      // Só DOM: o resto da cena o Phaser recolhe sozinho.
      sprite.morto === undefined;
    if (document.body.contains(div)) div.remove();
    // Segunda passada não pode explodir (roda no fim da partida e no shutdown).
    GameScene.prototype._teardownDOM.call(fake);
    return limpo;
  })(),
  "GameScene.hud.js: _teardownDOM deixou DOM órfão na tela",
);

// =============================================================================
// Check: a nuvem tem de RESPONDER à força, e obedecer ao interruptor. Nuvem de
// tamanho fixo é o defeito que este arquivo existe para não ter — e ela é
// difícil de notar jogando, porque "saiu poeira" parece certo em qualquer caso.
// =============================================================================
console.assert(
  (() => {
    const cenaFalsa = () => {
      const cena = {
        criadas: [],
        tweens: { alvos: [], add(cfg) { cena.tweens.alvos.push(cfg); } },
        add: {
          circle(x, y, r) {
            const o = { x, y, r, setDepth: () => o };
            cena.criadas.push(o);
            return o;
          },
        },
      };
      cena.spawnImpactDust = GameScene.prototype.spawnImpactDust;
      return cena;
    };

    const conta = (forca) => {
      const c = cenaFalsa();
      c.spawnImpactDust(0, 0, 0xffffff, { forca });
      return c.criadas.length;
    };

    const fraca = conta(0);
    const media = conta(0.5);
    const forte = conta(1);

    // Cone: com abertura zero e ângulo zero, TODA partícula vai para +X.
    const cone = cenaFalsa();
    cone.spawnImpactDust(100, 100, 0xffffff, {
      forca: 1,
      angulo: 0,
      abertura: 0,
    });
    const soParaFrente = cone.tweens.alvos.every(
      (t) => t.x > 100 && Math.abs(t.y - 100) < 1e-9,
    );

    // Interruptor desligado: nenhuma partícula, nem uma.
    const antes = EfeitosVisuais.estado.particulas;
    EfeitosVisuais.estado.particulas = false;
    const desligada = conta(1);
    EfeitosVisuais.estado.particulas = antes;

    return (
      fraca === FEEDBACK.PARTICULAS_MIN &&
      forte === FEEDBACK.PARTICULAS_MAX &&
      fraca < media &&
      media < forte &&
      soParaFrente &&
      desligada === 0 &&
      // E o efeito tem interruptor na tela de configurações.
      EfeitosVisuais.CATALOGO.some((e) => e.id === "particulas")
    );
  })(),
  "GameScene.hud.js: a nuvem de impacto não acompanha a força (ou ignora o interruptor)",
);
