// =============================================================================
// PreGameScene.js — v5.0 (UI Retro-Moderno Pixel Art via DOM)
// =============================================================================

class PreGameScene extends Phaser.Scene {
  constructor() {
    super("PreGameScene");
    this.menuButtons = [];
    this.currentFocusedIndex = 0;
    this.previousDpadUp = false;
    this.previousDpadDown = false;
    this.previousDpadLeft = false;
    this.previousDpadRight = false;
    this.previousAButton = false;
  }

  create() {
    this.cameras.main.setBackgroundColor("#080f08");

    if (!window.careerMode) window.careerMode = new CareerMode();
    window.careerMode.loadFromLocalStorage();
    const career = window.careerMode;

    // Fundo decorativo (canvas)
    const bg = this.add.graphics();
    bg.lineStyle(1, 0x1a3a1a, 0.3);
    bg.strokeRect(10, 10, 980, 580);
    bg.strokeCircle(500, 300, 180);
    bg.moveTo(10, 300);
    bg.lineTo(990, 300);
    bg.strokePath();

    // Notificações pendentes
    this._showPendingNotifications(career);

    // ── UI DOM principal ──────────────────────────────────────────────────
    this._buildMainUI(career);

    this.cameras.main.fadeIn(250, 0, 0, 0);

    // Coletar botões do navbar e painel central
    this.updateButtonList();
  }

  updateButtonList() {
    this.menuButtons = [];
    if (this.mainDOM) {
      const btnElements = this.mainDOM.node.querySelectorAll(
        ".pui-btn:not(.pui-btn-disabled), .pui-nav-btn",
      );
      this.menuButtons = Array.from(btnElements);
      if (this.menuButtons.length > 0) {
        if (this.currentFocusedIndex >= this.menuButtons.length)
          this.currentFocusedIndex = 0;
        this.updateFocusedButton();
      }
    }
  }

  update() {
    const pad = this.input.gamepad.pad1;
    if (pad && pad.connected) {
      // Navegação para cima/baixo
      const dpadUp = pad.up;
      if (dpadUp && !this.previousDpadUp) {
        this.currentFocusedIndex =
          (this.currentFocusedIndex - 1 + this.menuButtons.length) %
          this.menuButtons.length;
        this.updateFocusedButton();
      }
      this.previousDpadUp = dpadUp;

      const dpadDown = pad.down;
      if (dpadDown && !this.previousDpadDown) {
        this.currentFocusedIndex =
          (this.currentFocusedIndex + 1) % this.menuButtons.length;
        this.updateFocusedButton();
      }
      this.previousDpadDown = dpadDown;

      // Botão A para confirmar
      const aButton = pad.buttons[0]?.pressed;
      if (aButton && !this.previousAButton) {
        const currentBtn = this.menuButtons[this.currentFocusedIndex];
        if (currentBtn) {
          currentBtn.click();
          // Atualizar lista de botões após clique (caso modal abra/feche)
          setTimeout(() => this.updateButtonList(), 100);
        }
      }
      this.previousAButton = aButton;
    }
  }

  updateFocusedButton() {
    this.menuButtons.forEach((btn) => {
      btn.classList.remove("pui-focused");
    });
    if (this.menuButtons[this.currentFocusedIndex]) {
      this.menuButtons[this.currentFocusedIndex].classList.add("pui-focused");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  _buildMainUI(career) {
    if (this.mainDOM) {
      this.mainDOM.destroy();
      this.mainDOM = null;
    }

    const matchDayType = career.getMatchDayType();
    const isMatchDay = career.isMatchDay();
    const isPlayerPending = career.isPlayerMatchPending();

    // ── Top Bar ────────────────────────────────────────────────────────────
    const posLabel = career.position ? ` (${career.position})` : "";
    const dateStr = career.currentDate
      .toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
      .toUpperCase();
    // Nome de exibição, não o ID: a topbar mostrava "bayern" e "man_city".
    const teamName = career.currentTeam
      ? CareerMode.clubLabel(career.currentTeam.name)
      : "";

    // ── Painel central ─────────────────────────────────────────────────────
    let centralContent = "";
    if (isMatchDay && isPlayerPending) {
      centralContent = this._buildMatchDayPanel(career, matchDayType);
    } else {
      centralContent = this._buildIdleDayPanel(career);
    }

    // ── Painel de status ───────────────────────────────────────────────────
    const condPct = Math.min(100, career.condition);
    const xpPct = Math.min(100, career.xp);
    const copaStatus = this._buildCopaStatus(career);

    // ── Navbar ─────────────────────────────────────────────────────────────
    const nextEvent = career.getNextEvent();
    const compLabel =
      nextEvent && nextEvent.type === "copa" ? "CHAVE DA COPA" : "TABELA";

    const html = `
    <div class="pui-root" style="width:1000px;height:600px;display:flex;flex-direction:column;">

      <!-- TOP BAR -->
      <div class="pui-topbar">
        <div class="pui-topbar-left">
          <span class="pui-player-name">${career.playerName.toUpperCase()}${posLabel}</span>
          <span class="pui-player-info">${teamName} &nbsp;—&nbsp; ${career.playerLeagueName ? career.playerLeagueName() : "Liga"}</span>
        </div>
        <div class="pui-topbar-right">
          <span class="pui-date-text">${dateStr}</span>
          <span class="pui-season-text">Nível ${career.level} &nbsp;|&nbsp; Temporada ${career.season}</span>
        </div>
      </div>

      <!-- CORPO PRINCIPAL -->
      <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px;overflow:hidden;">

        <!-- COLUNA ESQUERDA: Central de Carreira -->
        <div style="display:flex;flex-direction:column;gap:8px;overflow:hidden;">
          <!-- Painel principal -->
          <div class="pui-panel" style="flex:1;overflow:hidden;">
            <div class="pui-panel-header" id="central-header">
              <span class="pui-panel-title" id="central-title">CENTRAL DE CARREIRA</span>
            </div>
            <div class="pui-panel-body" style="height:calc(100% - 44px);overflow-y:auto;" id="central-body">
              ${centralContent}
            </div>
          </div>

          <!-- Painel de finanças -->
          <div class="pui-panel" style="flex-shrink:0;">
            <div class="pui-panel-header"><span class="pui-panel-title">FINANÇAS</span></div>
            <div class="pui-panel-body" style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;">
              <span class="pui-text-pixel pui-text-gold" style="font-size:8px;">
                💰 R$ ${(career.playerMoney || 0).toLocaleString("pt-BR")}
              </span>
              <span class="pui-text-pixel pui-text-green" style="font-size:7px;">
                📅 R$ ${(career.monthlySalary || 0).toLocaleString("pt-BR")}/mês
              </span>
            </div>
          </div>
        </div>

        <!-- COLUNA DIREITA: Status + Copa -->
        <div style="display:flex;flex-direction:column;gap:8px;overflow:hidden;">
          <!-- Status do atleta -->
          <div class="pui-panel" style="flex:1;overflow:hidden;">
            <div class="pui-panel-header"><span class="pui-panel-title">STATUS DO ATLETA</span></div>
            <div class="pui-panel-body" style="height:calc(100% - 44px);overflow-y:auto;display:flex;flex-direction:column;gap:10px;">

              ${UIHelper.createDOMBar("CONDIÇÃO FÍSICA", career.condition, 100, "green")}
              ${UIHelper.createDOMBar(`XP — NÍVEL ${career.level}`, career.xp, 100, "yellow")}

              <hr class="pui-divider" />

              <!-- Stats grid -->
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
                <div class="pui-stat-card">
                  <div class="pui-stat-label">VELOCIDADE</div>
                  <div class="pui-stat-value pui-text-blue">${career.speed}</div>
                </div>
                <div class="pui-stat-card">
                  <div class="pui-stat-label">CHUTE</div>
                  <div class="pui-stat-value pui-text-orange">${career.kickPower}</div>
                </div>
                <div class="pui-stat-card">
                  <div class="pui-stat-label">RESISTÊNCIA</div>
                  <div class="pui-stat-value pui-text-green">${career.stamina}</div>
                </div>
              </div>

              <hr class="pui-divider" />

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                <div>
                  <div class="pui-text-pixel pui-text-muted" style="font-size:5px;">RODADA</div>
                  <div class="pui-text-pixel pui-text-white" style="font-size:7px;">${career.matchDay} / ${career.totalMatches}</div>
                </div>
                <div>
                  <div class="pui-text-pixel pui-text-muted" style="font-size:5px;">TEMPORADA</div>
                  <div class="pui-text-pixel pui-text-white" style="font-size:7px;">${career.season}</div>
                </div>
                <div>
                  <div class="pui-text-pixel pui-text-muted" style="font-size:5px;">SKILL PTS</div>
                  <div class="pui-text-pixel ${career.skillPoints > 0 ? "pui-text-gold" : "pui-text-muted"}" style="font-size:7px;">${career.skillPoints}</div>
                </div>
                <div>
                  <div class="pui-text-pixel pui-text-muted" style="font-size:5px;">POSIÇÃO</div>
                  <div class="pui-text-pixel pui-text-blue" style="font-size:7px;">${career.position || "Meia"}</div>
                </div>
              </div>

              <div class="pui-text-pixel pui-text-muted" style="font-size:5px;line-height:2;">
                ⚽ ${career.playerStats.goals} gols &nbsp;|&nbsp;
                🎯 ${career.playerStats.assists} assist &nbsp;|&nbsp;
                📋 ${career.playerStats.matches} jogos
              </div>

            </div>
          </div>

          <!-- Copas do usuário: continental + doméstica -->
          <div class="pui-panel" style="flex-shrink:0;">
            <div class="pui-panel-header"><span class="pui-panel-title">COPAS</span></div>
            <div class="pui-panel-body" style="padding:10px 16px;">
              ${copaStatus}
            </div>
          </div>
        </div>

      </div>

      <!-- NAVBAR INFERIOR -->
      <div class="pui-navbar">
        <div class="pui-nav-btn" id="nav-calendar">
          <span class="pui-nav-icon">📅</span>CALENDÁRIO
        </div>
        <div class="pui-nav-btn" id="nav-competition">
          <span class="pui-nav-icon">🏆</span>${compLabel}
        </div>
        <div class="pui-nav-btn" id="nav-stats">
          <span class="pui-nav-icon">📊</span>ARTILHARIA
        </div>
        <div class="pui-nav-btn" id="nav-training">
          <span class="pui-nav-icon">⚡</span>TREINO
        </div>
        <div class="pui-nav-btn" id="nav-offers">
          <span class="pui-nav-icon">📋</span>PROPOSTAS
        </div>
        <div class="pui-nav-btn" id="nav-rest">
          <span class="pui-nav-icon">💤</span>DESCANSAR
        </div>
        <div class="pui-nav-btn" id="nav-sponsors">
          <span class="pui-nav-icon">💼</span>PATROCÍNIOS
        </div>
        <div class="pui-nav-btn" id="nav-profile">
          <span class="pui-nav-icon">👤</span>PERFIL
        </div>
      </div>

    </div>`;

    this.mainDOM = this.add.dom(500, 300).createFromHTML(html).setOrigin(0.5);

    // Eventos
    this.mainDOM.addListener("click");
    this.mainDOM.on("click", (e) => {
      const t = e.target;
      const nav = t.closest('[id^="nav-"]');

      // Handle control mode toggle
      if (t.closest("#btn-single-mode")) {
        localStorage.setItem("controlMode", "single");
        this._buildMainUI(career); // Refresh UI
        this.updateButtonList();
        return;
      }
      if (t.closest("#btn-full-mode")) {
        localStorage.setItem("controlMode", "full");
        this._buildMainUI(career); // Refresh UI
        this.updateButtonList();
        return;
      }

      if (nav) {
        // Marca a aba clicada como ativa. A navbar abre modais/cenas em vez de
        // trocar painel, então esse é o único estado de "onde estou" que existe.
        nav.parentElement
          .querySelectorAll(".pui-nav-btn.is-active")
          .forEach((b) => b.classList.remove("is-active"));
        nav.classList.add("is-active");

        switch (nav.id) {
          case "nav-calendar":
            this.showCalendar();
            break;
          case "nav-competition":
            this.showCompetitionPanel();
            break;
          case "nav-stats":
            this.showStats();
            break;
          case "nav-training":
            this.showTrainingHub();
            break;
          case "nav-offers":
            this.showOffersPanel();
            break;
          case "nav-rest":
            this._handleActivity("rest");
            break;
          case "nav-sponsors":
            this.showSponsorships();
            break;
          case "nav-profile":
            this.cameras.main.fadeOut(200, 0, 0, 0);
            this.cameras.main.once("camerafadeoutcomplete", () =>
              this.scene.start("PlayerProfileScene"),
            );
            break;
        }
        return;
      }

      // Botões do painel central
      if (t.closest("#btn-play")) this._handlePlayMatch(career, matchDayType);
      if (t.closest("#btn-advance")) this._handleAdvanceDay(career);
      if (t.closest("#btn-new-season")) {
        career.stayAndStartNewSeason();
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () =>
          this.scene.restart(),
        );
      }
      if (t.closest("#btn-finish-season")) {
        career.simulateSeasonRemainder();
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () =>
          this.scene.restart(),
        );
      }
      if (t.closest("#btn-market")) {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () =>
          this.scene.start("TransferMarketScene"),
        );
      }
    });
  }

  // ─── Conteúdo do painel central: dia de jogo ──────────────────────────────
  _buildMatchDayPanel(career, matchDayType) {
    const isCopa = matchDayType === "copa";
    const opponent = isCopa
      ? career.getCopaOpponent()
      : career.getNextOpponent();

    if (!opponent) {
      return `<p class="pui-text-pixel pui-text-muted" style="font-size:7px;text-align:center;padding-top:40px;">
        Aguardando próxima rodada...</p>`;
    }

    const lineup = career.getLineupStatus
      ? career.getLineupStatus()
      : { code: "starter", label: "Titular", description: "" };

    const lineupColor =
      lineup.code === "starter"
        ? "pui-text-green"
        : lineup.code === "bench"
          ? "pui-text-gold"
          : "pui-text-red";

    const badgeText = isCopa
      ? `${career.playerCupName().toUpperCase()} — MATA-MATA`
      : `${(career.playerLeagueName ? career.playerLeagueName() : "LIGA").toUpperCase()} — PONTOS CORRIDOS`;
    const badgeClass = isCopa ? "pui-badge-green" : "pui-badge-gold";
    // Fase real da chave do mundo ("Oitavas de Final"), não o índice legado.
    const roundInfo = isCopa
      ? career._cupPhaseLabel()
      : `Rodada ${career.matchDay} / ${career.totalMatches}`;

    const ratingDiff = career.level * 2 + 60 - (opponent.rating || 75);
    const diffColor = ratingDiff >= 0 ? "pui-text-green" : "pui-text-red";
    const diffLabel =
      ratingDiff >= 0 ? `Favorito (+${ratingDiff})` : `Azarão (${ratingDiff})`;

    const pColor = career.currentTeam.shirtColor || "#3388ff";
    const oColor = opponent.shirtColor || "#ff3333";

    const playLabel =
      lineup.code === "not_related"
        ? "SIMULAR PARTIDA"
        : isCopa
          ? `JOGAR — ${career.playerCupName().toUpperCase()}`
          : "JOGAR PARTIDA";
    const playVariant =
      lineup.code === "not_related" ? "dark" : isCopa ? "primary" : "primary";

    // Get saved control mode, default to "single"
    const savedControlMode = localStorage.getItem("controlMode") || "single";

    return `
      <div style="display:flex;flex-direction:column;gap:10px;padding:4px 0;">

        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span class="pui-badge ${badgeClass}">${badgeText}</span>
          <span class="pui-text-pixel pui-text-muted" style="font-size:5px;">${roundInfo}</span>
        </div>

        <!-- VS -->
        <div style="display:flex;align-items:center;justify-content:center;gap:20px;padding:10px 0;">
          <div style="text-align:center;">
            <div style="width:44px;height:54px;background:${pColor};margin:0 auto 6px;border:2px solid rgba(255,255,255,0.2);"></div>
            <div class="pui-text-pixel pui-text-white" style="font-size:5px;">${CareerMode.clubLabel(career.currentTeam.name)}</div>
          </div>
          <div class="pui-text-pixel pui-text-muted" style="font-size:16px;">VS</div>
          <div style="text-align:center;">
            <div style="width:44px;height:54px;background:${oColor};margin:0 auto 6px;border:2px solid rgba(255,255,255,0.2);"></div>
            <div class="pui-text-pixel pui-text-white" style="font-size:5px;">${opponent.label || CareerMode.clubLabel(opponent.name)}</div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span class="pui-text-pixel ${lineupColor}" style="font-size:6px;">
            Escalação: ${lineup.label}
          </span>
          <span class="pui-text-pixel ${diffColor}" style="font-size:6px;">${diffLabel}</span>
        </div>

        <div class="pui-text-pixel pui-text-muted" style="font-size:5px;">
          Rep. técnico: ${career.coachReputation}/100 &nbsp;|&nbsp; Condição: ${career.condition}%
        </div>

        <!-- Control Mode Toggle -->
        <div class="pui-panel" style="padding:8px;">
          <div class="pui-panel-header" style="padding:6px 8px;">
            <span class="pui-panel-title" style="font-size:6px;">MODO DE CONTROLE</span>
          </div>
          <div class="pui-panel-body" style="display:flex;gap:6px;padding:8px;">
            <button class="pui-btn control-mode-btn ${savedControlMode === "single" ? "pui-btn-primary" : "pui-btn-default"}" 
                    id="btn-single-mode" 
                    style="flex:1;height:40px;font-size:6px;">
              🎮 JOGADOR ÚNICO
            </button>
            <button class="pui-btn control-mode-btn ${savedControlMode === "full" ? "pui-btn-primary" : "pui-btn-default"}" 
                    id="btn-full-mode" 
                    style="flex:1;height:40px;font-size:6px;">
              👥 TIME INTEIRO
            </button>
          </div>
        </div>

        <button class="pui-btn pui-btn-${playVariant}" id="btn-play"
          style="width:100%;height:50px;font-size:7px;margin-top:4px;">
          ⚽ &nbsp; ${playLabel}
        </button>

      </div>`;
  }

  // ─── Conteúdo do painel central: dia sem jogo ─────────────────────────────
  _buildIdleDayPanel(career) {
    const nextMatch = career.getNextEvent();
    const diff = nextMatch ? nextMatch.dayOffset - career.currentDayOffset : 0;
    const nextType = nextMatch ? nextMatch.type : null;

    let nextLabel = nextMatch
      ? `Próximo jogo em ${diff} dia${diff !== 1 ? "s" : ""}`
      : "Temporada encerrada para você — o mundo ainda joga.";
    let nextClass = "pui-text-white";
    // `type` é literal estrutural ("brasileirao"/"copa") e NUNCA vira texto: o
    // nome vem do `competitionName` que o schedule carrega do calendário global.
    if (nextType) {
      const nome =
        (nextMatch && nextMatch.competitionName) ||
        (nextType === "copa" ? career.playerCupName() : career.playerLeagueName());
      nextLabel += ` (${nome})`;
      nextClass = nextType === "copa" ? "pui-text-green" : "pui-text-gold";
    }

    const condTip =
      career.condition < 60
        ? "⚠ Condição baixa — recomenda-se descanso"
        : career.condition < 80
          ? "Condição razoável — treino leve disponível"
          : "Ótima condição — bom momento para treinar!";
    const condClass =
      career.condition < 60 ? "pui-text-orange" : "pui-text-green";

    const hasOffers = career.transferOffers && career.transferOffers.length > 0;

    return `
      <div style="display:flex;flex-direction:column;gap:12px;padding:4px 0;">

        <div class="pui-text-pixel ${nextClass}" style="font-size:7px;text-align:center;">
          ${nextLabel}
        </div>

        <div class="pui-text-pixel ${condClass}" style="font-size:6px;text-align:center;">
          ${condTip}
        </div>

        ${
          career.transferWindowOpen
            ? `
          <div class="pui-badge pui-badge-gold" style="text-align:center;font-size:5px;padding:6px;">
            🔔 JANELA DE TRANSFERÊNCIAS ABERTA!
          </div>`
            : ""
        }

        ${
          hasOffers
            ? `
          <div class="pui-badge pui-badge-blue" style="text-align:center;font-size:5px;padding:6px;">
            📋 ${career.transferOffers.length} proposta(s) de transferência!
          </div>
          <button class="pui-btn pui-btn-gold" id="btn-market"
            style="width:100%;height:44px;font-size:6px;">
            MERCADO DE TRANSFERÊNCIAS
          </button>
        `
            : ""
        }

        <button class="pui-btn pui-btn-blue" id="btn-advance"
          style="width:100%;height:50px;font-size:7px;margin-top:4px;">
          ▶ AVANÇAR DIA
        </button>

        ${
          // Temporada encerrada: o ano novo não pode depender de aceitar
          // proposta. Este botão é a saída garantida.
          career.seasonEnded
            ? `
        <button class="pui-btn pui-btn-gold" id="btn-new-season"
          style="width:100%;height:48px;font-size:7px;">
          🏁 INICIAR TEMPORADA ${career.season + 1}
        </button>`
            : career.hasRemainingMatches()
              ? ""
              : `
        <button class="pui-btn pui-btn-danger" id="btn-finish-season"
          style="width:100%;height:44px;font-size:6px;">
          ⏩ SIMULAR ATÉ O FIM DA TEMPORADA
        </button>`
        }

      </div>`;
  }

  // ─── Status Copa ──────────────────────────────────────────────────────────
  _buildCopaStatus(career) {
    // O clube disputa DUAS copas: a continental e a doméstica do país dele.
    // Estado vem da chave do MUNDO, que é quem decide de verdade.
    const cups = career.playerCups();
    if (!cups.length) {
      return `<span class="pui-text-pixel pui-text-muted" style="font-size:6px;">Sem copa nesta temporada</span>`;
    }
    return cups
      .map((cup) => {
        let estado = `<span class="pui-text-green">✅ ${cup.phase}</span>`;
        if (cup.champion) {
          const eu = cup.champion === career.currentTeam.name;
          estado = `<span class="pui-text-gold">🏆 ${CareerMode.clubLabel(cup.champion)}${eu ? " (você!)" : ""}</span>`;
        } else if (cup.eliminated) {
          estado = `<span class="pui-text-red">❌ Fora nas ${cup.phase}</span>`;
        }
        return `<div class="pui-text-pixel" style="font-size:6px;line-height:2;">
          <span class="pui-text-muted">${cup.name}:</span> ${estado}
        </div>`;
      })
      .join("");
  }

  // ─── Handlers de ação ─────────────────────────────────────────────────────
  _handlePlayMatch(career, matchDayType) {
    const isCopa = matchDayType === "copa";
    const opponent = isCopa
      ? career.getCopaOpponent()
      : career.getNextOpponent();
    if (!opponent) return;

    const lineup = career.getLineupStatus
      ? career.getLineupStatus()
      : { code: "starter", label: "Titular" };

    career.lastLineupStatus = lineup.code;

    if (lineup.code === "not_related") {
      const full = career.simulateFirstHalf(opponent);
      const second = career.simulateFirstHalf(opponent);
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.start("EndGameScene", {
          playerScore: full.playerScore + second.playerScore,
          opponentScore: full.opponentScore + second.opponentScore,
          opponent,
          matchStats: { goals: 0, assists: 0, passes: 0, shots: 0 },
          matchRating: 5.2,
          matchType: matchDayType,
          lineupStatus: lineup.code,
          autoSimulated: true,
        });
      });
      return;
    }

    const firstHalf =
      lineup.code === "bench"
        ? career.simulateFirstHalf(opponent)
        : { playerScore: 0, opponentScore: 0 };

    const controlMode = localStorage.getItem("controlMode") || "single";

    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("GameScene", {
        opponent,
        matchType: matchDayType,
        lineupStatus: lineup.code,
        initialScorePlayer: firstHalf.playerScore,
        initialScoreOpponent: firstHalf.opponentScore,
        startSecondHalf: lineup.code === "bench",
        playerTeamColor: career.currentTeam.shirtColor,
        playerTeamColor2: career.currentTeam.shirtColor2,
        opponentTeamColor: opponent.shirtColor,
        opponentTeamColor2: opponent.shirtColor2,
        controlMode, // Pass control mode to GameScene
      });
    });
  }

  _handleAdvanceDay(career) {
    career.advanceDay();
    this.cameras.main.fadeOut(150, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.restart());
  }

  _handleActivity(type) {
    const career = window.careerMode;
    const result = type === "train" ? career.train() : career.rest();
    // Mostrar feedback via toast rápido
    const toast = document.createElement("div");
    toast.style.cssText = `
      position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
      background:#0a1f0a;border:2px solid #2a7a2a;padding:10px 20px;z-index:9999;
      font-family:'Press Start 2P',monospace;font-size:7px;
      color:${result.success ? "#00ff88" : "#ff4455"};
      box-shadow:3px 3px 0 #000;`;
    toast.textContent = result.msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
      if (result.success) {
        this.cameras.main.fadeOut(150, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () =>
          this.scene.restart(),
        );
      }
    }, 1500);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Notificações pendentes
  // ─────────────────────────────────────────────────────────────────────────
  _showPendingNotifications(career) {
    const notif = career.popNotification();
    if (!notif) return;

    const { close } = UIHelper.createDOMNotification(
      this,
      notif.msg,
      notif.type,
      () => this._showPendingNotifications(career),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Hub de Treino
  // ─────────────────────────────────────────────────────────────────────────
  showTrainingHub() {
    const career = window.careerMode;

    const miniGames = [
      {
        title: "🎯 CHUTE AO ALVO",
        desc: "30 segundos. Acerte alvos no gol. Quanto mais acertar, mais XP!",
        xpMax: 80,
        key: "ShootingMiniGame",
        color: "#1a1a5a",
        border: "#3333aa",
      },
      {
        title: "⚽ DOMÍNIO DE BOLA",
        desc: "Fuja dos marcadores. Dure 1 minuto com a bola para XP máximo.",
        xpMax: 90,
        key: "DribbleMiniGame",
        color: "#3a1a00",
        border: "#aa5500",
      },
      {
        title: "🏃 CIRCUITO DE CONES",
        desc: "Percorra o slalom do ponto A ao B no menor tempo.",
        xpMax: 100,
        key: "SlalomMiniGame",
        color: "#1a1a3a",
        border: "#4444aa",
      },
    ];

    const canPlay =
      career.lastActivityDay !== career.currentDayOffset &&
      career.condition >= 20;

    const miniCards = miniGames
      .map((mg) => {
        const btnVariant = canPlay ? "blue" : "disabled";
        return `
        <div class="pui-minigame-card" style="border-color:${mg.border};background:${mg.color};" data-key="${mg.key}">
          <div>
            <div class="pui-minigame-title">${mg.title}</div>
            <div class="pui-minigame-desc">${mg.desc}</div>
            <div class="pui-minigame-xp">XP máximo: ${mg.xpMax}</div>
          </div>
          <button class="pui-btn pui-btn-${btnVariant} mg-play-btn" data-key="${mg.key}"
            style="width:130px;height:56px;font-size:6px;white-space:normal;">
            JOGAR<br>MINI-GAME
          </button>
        </div>`;
      })
      .join("");

    const { domEl, body, close } = UIHelper.createDOMModal(
      this,
      "HUB DE TREINAMENTOS",
      null,
    );

    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;">

        <p class="pui-text-pixel pui-text-muted" style="font-size:6px;text-align:center;">
          Escolha como treinar hoje
        </p>

        <!-- Treino Rápido -->
        <div class="pui-panel" style="border-color:#2a5a2a;">
          <div class="pui-panel-body" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;">
            <div>
              <div class="pui-text-pixel pui-text-gold" style="font-size:8px;margin-bottom:4px;">⚡ TREINO RÁPIDO</div>
              <div class="pui-text-pixel pui-text-muted" style="font-size:5px;line-height:2;">
                Treino instantâneo. Ganha 35 XP genérico. Não requer tempo extra.
              </div>
            </div>
            <button class="pui-btn pui-btn-primary" id="btn-quick-train"
              style="width:130px;height:56px;font-size:6px;white-space:normal;">
              TREINAR<br>RÁPIDO
            </button>
          </div>
        </div>

        <!-- Mini-games -->
        ${miniCards}

      </div>`;

    // Eventos do modal
    body.addEventListener("click", (e) => {
      if (e.target.closest("#btn-quick-train")) {
        const result = career.train();
        close();
        this._handleActivity("train");
        return;
      }

      const mgBtn = e.target.closest(".mg-play-btn");
      if (mgBtn) {
        const key = mgBtn.dataset.key;
        if (!canPlay) {
          const msg =
            career.condition < 20 ? "Cansado demais!" : "Já treinou hoje!";
          mgBtn.textContent = msg;
          setTimeout(() => {
            mgBtn.innerHTML = "JOGAR<br>MINI-GAME";
          }, 1500);
          return;
        }
        close();
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () => {
          this.scene.start("TrainingScene", { miniGame: key });
        });
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Calendário
  // ─────────────────────────────────────────────────────────────────────────
  showCalendar() {
    const career = window.careerMode;
    const { domEl, body, close } = UIHelper.createDOMModal(
      this,
      "CALENDÁRIO",
      null,
    );

    // Mês exibido em relação ao mês atual do jogo. Zerado a cada abertura: o
    // calendário sempre abre em "hoje".
    this.calendarMonthOffset = 0;
    this._renderCalendarBody(body, career);

    const avancarAte = (offset) => {
      career.simulateUntil(offset);
      close();
      this.cameras.main.fadeOut(150, 0, 0, 0);
      this.cameras.main.once("camerafadeoutcomplete", () =>
        this.scene.restart(),
      );
    };

    body.addEventListener("click", (e) => {
      const nav = e.target.closest("[data-month-step]");
      if (nav) {
        this.calendarMonthOffset += parseInt(nav.dataset.monthStep, 10);
        this._renderCalendarBody(body, career);
        return;
      }

      // Até o último jogo marcado no calendário global — o fim real do ano.
      if (e.target.closest("#btn-sim-season")) {
        career.simulateSeasonRemainder();
        close();
        this.cameras.main.fadeOut(150, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () =>
          this.scene.restart(),
        );
        return;
      }

      const cell = e.target.closest(".pui-cal-day");
      if (!cell || cell.dataset.clickable !== "true") return;
      avancarAte(parseInt(cell.dataset.offset));
    });
  }

  /** Desenha o mês. Separado do `showCalendar` porque os botões redesenham. */
  _renderCalendarBody(body, career) {
    const gameDate = career.currentDate;
    const mesExibido = new Date(
      gameDate.getFullYear(),
      gameDate.getMonth() + (this.calendarMonthOffset || 0),
      1,
    );
    const startDOW = mesExibido.getDay();
    const monthName = mesExibido
      .toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
      .toUpperCase();

    const dayNames = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
    const headers = dayNames
      .map((d) => `<div class="pui-cal-header">${d}</div>`)
      .join("");

    // 42 células (6 semanas): 35 cortam o fim de meses que começam no sábado.
    let cells = "";
    for (let i = 0; i < 42; i++) {
      const dayDate = new Date(mesExibido);
      dayDate.setDate(dayDate.getDate() + (i - startDOW));

      const isCurrentMonth = dayDate.getMonth() === mesExibido.getMonth();
      const isToday = dayDate.toDateString() === gameDate.toDateString();
      const diffTime = dayDate.getTime() - career.startDate.getTime();
      const dayOffset = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const evento = career.schedule.find((e) => e.dayOffset === dayOffset);
      const isCopa = evento && evento.type === "copa";

      // Qualquer dia futuro é clicável. O teto de 60 dias impedia pular mais de
      // dois meses sem motivo — `simulateUntil` roda o ano inteiro sem reclamar.
      const isClickable = dayOffset > career.currentDayOffset;

      let cls = "pui-cal-day";
      if (!isCurrentMonth) cls += " other-month";
      if (isToday) cls += " today";
      else if (isCopa) cls += " has-copa";
      else if (evento) cls += " has-br";
      if (isClickable) cls += " clickable";

      // Sigla da competição REAL, do dado. "BR"/"Copa" fixos mentiam para quem
      // joga a Premier League ou a Champions.
      const sigla = evento
        ? competitionShort(evento.matchType) ||
          (evento.competitionName || "").slice(0, 3).toUpperCase()
        : "";

      const events = [
        evento
          ? `<span class="pui-cal-event" style="color:${isCopa ? "#88ff88" : "#ff8888"};" title="${evento.competitionName || ""}">${isCopa ? "🏆" : "⚽"} ${sigla}</span>`
          : "",
        isToday
          ? `<span class="pui-cal-event" style="color:#88aaff;">HOJE</span>`
          : "",
      ].join("");

      cells += `<div class="${cls}" data-offset="${dayOffset}" data-clickable="${isClickable}">
        <span class="pui-cal-num">${dayDate.getDate()}</span>
        ${events}
      </div>`;
    }

    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="display:flex;gap:12px;">
          <span class="pui-badge pui-badge-red" style="font-size:5px;">${competitionShort(career.playerLeagueId())} — ${career.playerLeagueName()}</span>
          <span class="pui-badge pui-badge-green" style="font-size:5px;">${career.playerCupName()}</span>
          <span class="pui-badge pui-badge-blue" style="font-size:5px;">Hoje</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="pui-btn pui-btn-default" data-month-step="-1"
            style="height:26px;padding:0 10px;font-size:6px;">‹ MÊS</button>
          <span class="pui-text-pixel pui-text-gold" style="font-size:7px;min-width:150px;text-align:center;">${monthName}</span>
          <button class="pui-btn pui-btn-default" data-month-step="1"
            style="height:26px;padding:0 10px;font-size:6px;">MÊS ›</button>
        </div>
      </div>
      <div class="pui-calendar-grid">${headers}${cells}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;">
        <p class="pui-text-pixel pui-text-muted" style="font-size:5px;margin:0;">
          Clique em um dia futuro para avançar até ele.
        </p>
        <button class="pui-btn pui-btn-danger" id="btn-sim-season"
          style="height:30px;padding:0 12px;font-size:6px;">⏩ SIMULAR TEMPORADA INTEIRA</button>
      </div>`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Propostas de transferência
  // ─────────────────────────────────────────────────────────────────────────
  showOffersPanel() {
    const career = window.careerMode;
    const { domEl, body, close } = UIHelper.createDOMModal(
      this,
      "MERCADO — PROPOSTAS RECEBIDAS",
      null,
    );

    const offers = career.transferOffers || [];

    let content = `
      <p class="pui-text-pixel pui-text-muted" style="font-size:5px;margin-bottom:12px;">
        Clube atual: ${career.currentTeam.name} &nbsp;|&nbsp;
        Salário atual: R$ ${(career.salary || 0).toLocaleString("pt-BR")}/mês
      </p>`;

    if (offers.length === 0) {
      content += `
        <div style="text-align:center;padding:40px 0;">
          <p class="pui-text-pixel pui-text-muted" style="font-size:8px;margin-bottom:12px;">
            Nenhuma proposta recebida.
          </p>
          <p class="pui-text-pixel pui-text-muted" style="font-size:5px;line-height:2;">
            Novas propostas surgem ao fim da temporada<br>conforme sua reputação e desempenho.
          </p>
        </div>`;
    } else {
      content += offers
        .map((offer, idx) => {
          const diff = (offer.salary || 0) - (career.salary || 0);
          const diffText =
            diff >= 0
              ? `+R$ ${diff.toLocaleString("pt-BR")}`
              : `-R$ ${Math.abs(diff).toLocaleString("pt-BR")}`;
          const diffClass = diff >= 0 ? "pui-text-green" : "pui-text-red";
          return `
          <div class="pui-offer-card" style="margin-bottom:8px;">
            <div>
              <div class="pui-offer-team">${offer.team.name}</div>
              <div class="pui-offer-details">
                Tier ${offer.team.tier || "-"} &nbsp;|&nbsp; Rating ${offer.team.rating || "-"}<br>
                Salário: R$ ${(offer.salary || 0).toLocaleString("pt-BR")}/mês
              </div>
              <div class="pui-offer-salary-diff ${diffClass}">Diferença: ${diffText}</div>
            </div>
            <button class="pui-btn pui-btn-primary" data-action="accept" data-idx="${idx}"
              style="width:110px;height:44px;font-size:6px;">ACEITAR</button>
            <button class="pui-btn pui-btn-danger" data-action="decline" data-idx="${idx}"
              style="width:110px;height:44px;font-size:6px;">RECUSAR</button>
          </div>`;
        })
        .join("");
    }

    body.innerHTML = content;

    body.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx);
      const action = btn.dataset.action;
      const offer = career.transferOffers[idx];
      if (!offer) return;

      if (action === "accept") {
        career.acceptTransfer(offer);
      } else {
        career.declineTransfer(offer);
      }
      career.saveToLocalStorage();
      close();
      this.showOffersPanel();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Painel de competição (Tabela ou Chave Copa)
  // ─────────────────────────────────────────────────────────────────────────
  showCompetitionPanel() {
    const career = window.careerMode;
    const nextEvent = career.getNextEvent();
    if (nextEvent && nextEvent.type === "copa") {
      this.showCopaBracket();
    } else {
      this.showStandings();
    }
  }

  /**
   * Chave da copa continental do usuário, lida do mundo. Antes desenhava o
   * bracket local fixo de 8 clubes brasileiros — o jogador via a Copa do Brasil
   * enquanto disputava a Champions.
   *
   * ponytail: mostra só a FASE ATUAL, não a árvore inteira. Uma Champions de 32
   * não cabe legível num modal de 760px, e as fases seguintes ainda nem têm
   * adversário definido. Vira árvore quando alguém pedir para navegar por fase.
   */
  showCopaBracket() {
    const career = window.careerMode;
    // A copa mostrada é a do PRÓXIMO confronto; o clube disputa duas.
    const proximo = career.schedule.find(
      (e) => e.type === "copa" && e.dayOffset >= career.currentDayOffset,
    );
    const cups = career.playerCups();
    const cup =
      (proximo && cups.find((c) => c.id === proximo.matchType)) || cups[0];

    const { domEl, body, close } = UIHelper.createDOMModal(
      this,
      `CHAVEAMENTO — ${(cup ? cup.name : "COPA").toUpperCase()}${cup ? ` (${cup.phase})` : ""}`,
      null,
    );
    // Chave inteira não cabe nos 760px do modal padrão.
    domEl.node.querySelector(".pui-modal")?.classList.add("pui-modal-wide");

    if (!cup) {
      body.innerHTML = `<p class="pui-text-pixel pui-text-muted" style="text-align:center;padding:40px;font-size:8px;">
        Seu clube não está em copa nenhuma nesta temporada.</p>`;
      return;
    }

    const meu = career.currentTeam.name;
    const nome = CareerMode.clubLabel;
    // As outras copas do clube ficam num resumo de uma linha no fim.
    const outras = cups.filter((c) => c.id !== cup.id);

    let infoHTML = "";
    if (cup.champion) {
      infoHTML = `<div class="pui-badge pui-badge-gold" style="margin-bottom:10px;font-size:5px;">
        🏆 Campeão: ${nome(cup.champion)}${cup.champion === meu ? " — você!" : ""}
      </div>`;
    } else if (cup.eliminated) {
      infoHTML = `<div class="pui-badge pui-badge-red" style="margin-bottom:10px;font-size:5px;">
        Você foi eliminado nas ${cup.phase}.
      </div>`;
    } else if (cup.match) {
      const adversario = cup.match.home === meu ? cup.match.away : cup.match.home;
      const evento = career.schedule.find(
        (e) =>
          e.matchType === cup.id && e.dayOffset >= career.currentDayOffset,
      );
      const data = evento
        ? new Date(
            career.startDate.getTime() + evento.dayOffset * 86400000,
          ).toLocaleDateString("pt-BR")
        : "a definir";
      infoHTML = `<div class="pui-badge pui-badge-green" style="margin-bottom:10px;font-size:5px;">
        ${cup.phase} — ${nome(meu)} x ${nome(adversario)} — ${data}
      </div>`;
    }

    body.innerHTML = `
      ${infoHTML}
      ${this._buildBracketTree(career, cup, meu, nome)}
      ${
        outras.length
          ? `<hr class="pui-divider" />
      <div class="pui-text-pixel pui-text-muted" style="font-size:5px;line-height:2;">
        ${outras
          .map(
            (o) =>
              `${o.name}: ${o.champion ? "🏆 " + nome(o.champion) : o.eliminated ? "❌ fora nas " + o.phase : "✅ " + o.phase}`,
          )
          .join(" &nbsp;|&nbsp; ")}
      </div>`
          : ""
      }`;
  }

  /**
   * Chave em ÁRVORE CONVERGENTE de verdade: metade de CIMA do chaveamento vai
   * para a coluna da esquerda, metade de BAIXO para a direita, e as duas
   * afunilam na final ao centro.
   *
   * A versão anterior dividia a lista JÁ FILTRADA de confrontos válidos — com
   * BYEs (a Libertadores tem vários) a metade direita ficava vazia e o layout
   * virava uma pilha de dois blocos à esquerda. A divisão agora é por POSIÇÃO
   * no bracket, e slot vazio vira "A definir" para a árvore não perder a forma.
   *
   * Desenha TODAS as fases do chaveamento. Cabe porque o modal do bracket é
   * largo (90vw) e a árvore rola na horizontal com largura mínima própria —
   * antes eu cortava nas 3 últimas justamente porque 5 colunas não cabiam em
   * 760px.
   */
  _buildBracketTree(career, cup, meu, nome) {
    const rodadas =
      (career.world &&
        career.world.season.tournaments[cup.id].bracket.rounds) ||
      [];
    const ultimas = rodadas; // todas as fases, da inicial à final
    if (!ultimas.length) return "";

    const lado = (m, ehCasa) => {
      const id = ehCasa ? m.home : m.away;
      const gols = ehCasa ? m.homeScore : m.awayScore;
      const cls = [
        "pui-bt-team",
        m.winner && m.winner === id ? "winner" : "",
        id && id === meu ? "player" : "",
        id ? "" : "vazio",
      ].join(" ");
      return `<div class="${cls}">
        <span class="pui-bt-name">${id ? nome(id) : "A definir"}</span>
        <span class="pui-bt-score">${m.winner ? (gols ?? "") : ""}</span>
      </div>`;
    };

    const cartao = (m) => `
      <div class="pui-bt-match ${m.home === meu || m.away === meu ? "mine" : ""}">
        ${lado(m, true)}${lado(m, false)}
      </div>`;

    const nomeFase = (i) =>
      career._cupPhaseName(rodadas.length - ultimas.length + i, rodadas.length);

    // Metade de cima / metade de baixo POR POSIÇÃO, não por jogo válido.
    const coluna = (jogos, fase, ladoCss) => `
      <div class="pui-bt-col ${ladoCss}">
        <div class="pui-bt-round">${fase}</div>
        <div class="pui-bt-slots">${jogos.map(cartao).join("")}</div>
      </div>`;

    const anteriores = ultimas.slice(0, -1);
    const esquerda = anteriores
      .map((r, i) =>
        coluna(r.matches.slice(0, Math.ceil(r.matches.length / 2)), nomeFase(i), "lado-esq"),
      )
      .join("");
    const direita = anteriores
      .map((r, i) =>
        coluna(r.matches.slice(Math.ceil(r.matches.length / 2)), nomeFase(i), "lado-dir"),
      )
      .reverse()
      .join("");

    const final = ultimas[ultimas.length - 1];
    const campeao = cup.champion
      ? `<div class="pui-bt-champion">🏆 ${nome(cup.champion)}</div>`
      : "";

    return `
      <div class="pui-bracket-scroll"><div class="pui-bracket-tree">
        ${esquerda}
        <div class="pui-bt-col pui-bt-final">
          <div class="pui-bt-round">${nomeFase(ultimas.length - 1)}</div>
          <div class="pui-bt-slots">${final.matches.map(cartao).join("")}</div>
          ${campeao}
        </div>
        ${direita}
      </div></div>`;
  }

  showStandings() {
    const career = window.careerMode;
    const { domEl, body, close } = UIHelper.createDOMModal(
      this,
      `CLASSIFICAÇÃO — ${(career.playerLeagueName
        ? career.playerLeagueName()
        : "LIGA"
      ).toUpperCase()}`,
      null,
    );

    // Sem `slice`: a liga tem o tamanho que tiver (10 na Bundesliga, 16 no
    // Brasileirão). O corte fixo em 18 escondia time em liga maior e o painel
    // já rola sozinho.
    const rows = (career.leagueTable || [])
      .map((team, i) => {
        const sg = team.goalsFor - team.goalsAgainst;
        return `
        <tr class="${team.isPlayerTeam ? "player-row" : ""}">
          <td>${i + 1}</td>
          <td>${(team.label || team.name).substring(0, 18).toUpperCase()}</td>
          <td>${team.played}</td>
          <td>${team.wins}</td>
          <td>${team.draws}</td>
          <td>${team.losses}</td>
          <td>${team.goalsFor}</td>
          <td>${team.goalsAgainst}</td>
          <td>${sg >= 0 ? "+" + sg : sg}</td>
          <td><strong>${team.points}</strong></td>
        </tr>`;
      })
      .join("");

    body.innerHTML = `
      <table class="pui-table">
        <thead>
          <tr>
            <th>POS</th><th>TIME</th><th>J</th><th>V</th><th>E</th>
            <th>D</th><th>GP</th><th>GC</th><th>SG</th><th>PTS</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Artilharia e Estatísticas
  // ─────────────────────────────────────────────────────────────────────────
  showStats() {
    const career = window.careerMode;
    const { domEl, body, close } = UIHelper.createDOMModal(
      this,
      "ARTILHARIA E ESTATÍSTICAS",
      null,
    );

    if (career.sortTopScorers) career.sortTopScorers();
    else if (career.initializeTopScorers) career.initializeTopScorers();

    const scorerRows = (career.topScorers || [])
      .slice(0, 13)
      .map(
        (s, i) => `
      <tr class="${s.isPlayer ? "player-row" : ""}">
        <td>${i + 1}</td>
        <td>${s.name.substring(0, 22).toUpperCase()}</td>
        <td>${s.team.toUpperCase()}</td>
        <td><strong>${s.goals}</strong></td>
        <td>${s.assists || 0}</td>
        <td>${s.matches || 0}</td>
      </tr>`,
      )
      .join("");

    body.innerHTML = `
      <!-- Desempenho pessoal -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;">
        <div class="pui-stat-card">
          <div class="pui-stat-label">JOGOS</div>
          <div class="pui-stat-value pui-text-blue">${career.playerStats.matches}</div>
        </div>
        <div class="pui-stat-card">
          <div class="pui-stat-label">GOLS</div>
          <div class="pui-stat-value pui-text-gold">${career.playerStats.goals}</div>
        </div>
        <div class="pui-stat-card">
          <div class="pui-stat-label">ASSIST</div>
          <div class="pui-stat-value" style="color:#00ffff;">${career.playerStats.assists}</div>
        </div>
        <div class="pui-stat-card">
          <div class="pui-stat-label">REP. TÉC.</div>
          <div class="pui-stat-value pui-text-green" style="font-size:14px;">${career.coachReputation}/100</div>
        </div>
      </div>

      <hr class="pui-divider" />

      <div class="pui-text-pixel pui-text-gold" style="font-size:7px;margin-bottom:8px;">
        ARTILHARIA — ${(career.playerLeagueName ? career.playerLeagueName() : "LIGA").toUpperCase()}
      </div>

      <table class="pui-table pui-table-scorers">
        <thead>
          <tr>
            <th>POS</th><th>JOGADOR</th><th>TIME</th>
            <th>GOLS</th><th>ASS</th><th>J</th>
          </tr>
        </thead>
        <tbody>${scorerRows}</tbody>
      </table>`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Patrocínios
  // ─────────────────────────────────────────────────────────────────────────
  showSponsorships() {
    const career = window.careerMode;
    const offers = career.sponsorshipOffers || [
      {
        name: "NIKE",
        bonusPerGoal: 5000,
        bonusPerMatch: 2000,
        requirement: 1,
        color: "#ff6600",
      },
      {
        name: "ADIDAS",
        bonusPerGoal: 10000,
        bonusPerMatch: 4000,
        requirement: 3,
        color: "#0044cc",
      },
      {
        name: "PUMA",
        bonusPerGoal: 20000,
        bonusPerMatch: 8000,
        requirement: 6,
        color: "#cc0000",
      },
    ];

    const { domEl, body, close } = UIHelper.createDOMModal(
      this,
      "CONTRATOS DE PATROCÍNIO",
      () => {},
    );

    const cards = offers
      .map((offer, i) => {
        const isSigned =
          career.bootSponsor && career.bootSponsor.name === offer.name;
        const canSign = career.level >= offer.requirement;
        const btnVariant = isSigned ? "gold" : canSign ? "primary" : "dark";
        const btnLabel = isSigned
          ? "✓ ATIVO"
          : canSign
            ? "ASSINAR"
            : `NÍVEL ${offer.requirement}`;

        return `
        <div class="pui-sponsor-card ${isSigned ? "active" : ""} ${!canSign ? "locked" : ""}" data-idx="${i}">
          <div class="pui-sponsor-name" style="color:${offer.color}">${offer.name}</div>
          <div class="pui-sponsor-detail">
            <span class="pui-text-pixel pui-text-muted" style="font-size:5px;">BÔNUS/GOL</span>
            <span class="pui-text-pixel pui-text-gold" style="font-size:7px;">R$ ${offer.bonusPerGoal.toLocaleString("pt-BR")}</span>
          </div>
          <div class="pui-sponsor-detail">
            <span class="pui-text-pixel pui-text-muted" style="font-size:5px;">BÔNUS/JOGO</span>
            <span class="pui-text-pixel pui-text-green" style="font-size:7px;">R$ ${offer.bonusPerMatch.toLocaleString("pt-BR")}</span>
          </div>
          <div class="pui-sponsor-detail">
            <span class="pui-text-pixel pui-text-muted" style="font-size:5px;">NÍVEL MÍNIMO</span>
            <span class="pui-text-pixel ${canSign ? "pui-text-green" : "pui-text-red"}" style="font-size:7px;">${offer.requirement}</span>
          </div>
          <button class="pui-btn pui-btn-${btnVariant} sponsor-sign-btn" data-idx="${i}"
            style="width:100%;height:40px;font-size:6px;margin-top:8px;">
            ${btnLabel}
          </button>
        </div>`;
      })
      .join("");

    body.innerHTML = `
      <p class="pui-text-pixel pui-text-muted" style="font-size:5px;margin-bottom:12px;text-align:center;">
        Assine contratos para ganhar bônus por gol e por partida jogada.
      </p>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        ${cards}
      </div>`;

    body.addEventListener("click", (e) => {
      const btn = e.target.closest(".sponsor-sign-btn");
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx);
      const offer = offers[idx];
      if (!offer) return;
      const canSign = career.level >= offer.requirement;
      if (!canSign) return;
      career.bootSponsor = offer;
      career.saveToLocalStorage();
      close();
      this.showSponsorships();
    });
  }

  shutdown() {
    if (this.mainDOM) {
      this.mainDOM.destroy();
      this.mainDOM = null;
    }
  }
}
