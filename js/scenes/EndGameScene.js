// =============================================================================
// EndGameScene.js — v5.0 (UI Retro-Moderno Pixel Art via DOM)
// =============================================================================

class EndGameScene extends Phaser.Scene {
  constructor() {
    super("EndGameScene");
  }

  init(data) {
    this.playerScore = data.playerScore || 0;
    this.opponentScore = data.opponentScore || 0;
    this.opponent = data.opponent || { name: "Oponente" };
    this.matchStats = data.matchStats || {
      goals: 0,
      assists: 0,
      passes: 0,
      shots: 0,
    };
    this.matchRating = data.matchRating || 6.0;
    // Partida de LAN: o cliente de rede continua vivo aqui para a revanche.
    this.lan = data.lan || null;
    this.matchType = data.matchType || "brasileirao";
    this.lineupStatus = data.lineupStatus || "starter";
    this.autoSimulated = !!data.autoSimulated;
    this.isExhibition = !!data.isExhibition;
    // Desempate nos pênaltis: quem passou, por ID. Sem isto o registro tratava
    // o empate como derrota e eliminava quem tinha vencido.
    this.penaltyWinnerId = data.penaltyWinnerId || null;
    this.penaltyScore = data.penaltyScore || null;
    this.careerMode = window.careerMode;
  }

  create() {
    this.cameras.main.setBackgroundColor("#080f08");

    const career = this.careerMode;
    const levelBefore = career ? career.level : 1;
    const isCopa = this.matchType === "copa";

    // Registrar partida APENAS se NÃO for exibição
    if (career && !this.isExhibition) {
      const resultado = {
        playerScore: this.playerScore,
        opponentScore: this.opponentScore,
        opponent: this.opponent.name,
        matchStats: this.matchStats,
        matchRating: this.matchRating,
        lineupStatus: this.lineupStatus,
        // Empate no tempo normal só vira classificação com isto.
        penaltyWinnerId: this.penaltyWinnerId,
      };
      if (isCopa) career.recordCopaMatch(resultado);
      else career.recordMatch(resultado);
    }

    const levelAfter = career ? career.level : 1;
    const leveledUp = levelAfter > levelBefore;
    const seasonComplete = career ? career.isSeasonComplete() : false;

    // Fundo decorativo
    const bgG = this.add.graphics();
    bgG.lineStyle(1, 0x1a3a1a, 0.2);
    bgG.strokeRect(10, 10, 980, 580);

    this._buildUI(career, isCopa, leveledUp, levelAfter, seasonComplete);
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  _buildUI(career, isCopa, leveledUp, levelAfter, seasonComplete) {
    // Resultado
    let resultText = "EMPATE";
    let resultClass = "pui-text-gold";
    let resultBg = "rgba(255,215,0,0.08)";

    if (this.playerScore > this.opponentScore) {
      resultText = isCopa ? "CLASSIFICADO! ✅" : "VITÓRIA!";
      resultClass = "pui-text-green";
      resultBg = "rgba(0,255,136,0.08)";
    } else if (this.playerScore < this.opponentScore) {
      resultText = isCopa ? "ELIMINADO ❌" : "DERROTA";
      resultClass = "pui-text-red";
      resultBg = "rgba(255,68,85,0.08)";
    }

    const badgeText = this.isExhibition
      ? "PARTIDA DE EXIBIÇÃO"
      : isCopa
        ? `${(window.careerMode ? window.careerMode.playerCupName() : "COPA").toUpperCase()} — MATA-MATA`
        : `${(window.careerMode && window.careerMode.playerLeagueName ? window.careerMode.playerLeagueName() : "LIGA").toUpperCase()} — PONTOS CORRIDOS`;
    const badgeClass = this.isExhibition
      ? "pui-badge-blue"
      : isCopa
        ? "pui-badge-green"
        : "pui-badge-gold";

    // Nome de exibição: `currentTeam.name` e `opponent.name` são IDs.
    const nomeClube = (id) => {
      const c = typeof findClub === "function" ? findClub(id) : null;
      return c ? c.name : id;
    };
    const playerTeamName = this.isExhibition
      ? "Seu Time"
      : career && career.currentTeam
        ? nomeClube(career.currentTeam.name)
        : "Seu Time";

    // Estatísticas da partida
    const statItems = [
      {
        label: "Gols",
        value: this.matchStats.goals,
        color: "pui-text-gold",
        icon: "⚽",
      },
      {
        label: "Assistências",
        value: this.matchStats.assists,
        color: "pui-text-blue",
        icon: "🎯",
      },
      {
        label: "Passes",
        value: this.matchStats.passes,
        color: "pui-text-white",
        icon: "↗",
      },
      {
        label: "Chutes",
        value: this.matchStats.shots,
        color: "pui-text-orange",
        icon: "💥",
      },
    ];

    const statCards = statItems
      .map(
        (s) => `
      <div class="pui-stat-card">
        <div class="pui-stat-label">${s.icon} ${s.label}</div>
        <div class="pui-stat-value ${s.color}" style="font-size:24px;">${s.value}</div>
      </div>`,
      )
      .join("");

    const notePct = ((this.matchRating - 1) / 9) * 100;
    const noteColor =
      this.matchRating >= 8
        ? "green"
        : this.matchRating >= 6
          ? "yellow"
          : "red";

    // Progresso de carreira (apenas se não for exibição)
    let progressHTML = "";
    if (career && !this.isExhibition) {
      progressHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
          <div class="pui-stat-card">
            <div class="pui-stat-label">NÍVEL</div>
            <div class="pui-stat-value pui-text-gold">${career.level}</div>
          </div>
          <div class="pui-stat-card">
            <div class="pui-stat-label">💰 SALDO</div>
            <div class="pui-stat-value pui-text-green" style="font-size:10px;">
              R$ ${(career.playerMoney || 0).toLocaleString("pt-BR")}
            </div>
          </div>
        </div>

        ${UIHelper.createDOMBar(`XP: ${career.xp}/100`, career.xp, 100, "yellow")}

        <div class="pui-text-pixel pui-text-muted" style="font-size:5px;margin-top:8px;line-height:2;">
          Vel: ${career.speed} &nbsp;|&nbsp;
          Chute: ${career.kickPower} &nbsp;|&nbsp;
          Resist: ${career.stamina} &nbsp;|&nbsp;
          Rep: ${career.coachReputation}/100
        </div>

        <div class="pui-text-pixel pui-text-muted" style="font-size:5px;margin-top:4px;">
          ${
            isCopa
              ? `${career.playerCupName()} — ${career._cupPhaseLabel()} | T${career.season}`
              : `Rodada ${career.matchDay} / ${career.totalMatches} | T${career.season}`
          }
        </div>

        ${
          career.skillPoints > 0
            ? `
          <div class="pui-badge pui-badge-gold pui-pulse" style="margin-top:8px;font-size:5px;display:block;text-align:center;padding:6px;">
            ⭐ ${career.skillPoints} ponto(s) de skill disponível!
          </div>`
            : ""
        }

        ${
          leveledUp
            ? `
          <div class="pui-badge pui-badge-green pui-glow" style="margin-top:8px;font-size:6px;display:block;text-align:center;padding:8px;">
            🎉 SUBIU PARA NÍVEL ${levelAfter}!
          </div>`
            : ""
        }`;
    }

    // Botões
    let buttonsHTML = "";
    if (this.lan) {
      // LAN: sair devolve para a SALA, não para o menu. O socket segue vivo,
      // então dá para trocar de posição e jogar de novo sem reconectar.
      buttonsHTML = `
        <div style="display:flex;justify-content:center;gap:12px;padding:10px;background:#080f08;border-top:2px solid #1a3a1a;">
          <button class="pui-btn pui-btn-green" id="btn-lan-lobby"
            style="width:280px;height:48px;font-size:7px;">
            ⟲ VOLTAR PARA A SALA
          </button>
          <button class="pui-btn pui-btn-dark" id="btn-lan-sair"
            style="width:220px;height:48px;font-size:7px;">
            ← MENU PRINCIPAL
          </button>
        </div>`;
    } else if (this.isExhibition) {
      buttonsHTML = `
        <div style="display:flex;justify-content:center;gap:12px;padding:10px;background:#080f08;border-top:2px solid #1a3a1a;">
          <button class="pui-btn pui-btn-green" id="btn-new-exhibition"
            style="width:260px;height:48px;font-size:7px;">
            ⚽ NOVA PARTIDA
          </button>
          <button class="pui-btn pui-btn-dark" id="btn-back-menu"
            style="width:220px;height:48px;font-size:7px;">
            ← MENU PRINCIPAL
          </button>
        </div>`;
    } else {
      buttonsHTML = `
        <div style="display:flex;justify-content:center;gap:12px;padding:10px;background:#080f08;border-top:2px solid #1a3a1a;">
          <button class="pui-btn pui-btn-dark" id="btn-profile"
            style="width:220px;height:48px;font-size:7px;">
            👤 VER PERFIL
          </button>
          <button class="pui-btn pui-btn-blue" id="btn-continue"
            style="width:260px;height:48px;font-size:7px;">
            ▶ CONTINUAR
          </button>
        </div>`;
    }

    const html = `
    <div class="pui-root" style="width:1000px;height:600px;display:flex;flex-direction:column;">

      <!-- BANNER DE RESULTADO -->
      <div class="pui-result-banner" style="background:${resultBg};border-bottom:2px solid #1a3a1a;">
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:6px;">
          <span class="pui-badge ${badgeClass}" style="font-size:5px;">${badgeText}</span>
          ${this.autoSimulated ? `<span class="pui-badge" style="font-size:5px;color:#888;border-color:#444;">SIMULADO</span>` : ""}
        </div>
        <div class="pui-result-text ${resultClass}">${resultText}</div>
        <div class="pui-result-score">
          ${playerTeamName} &nbsp; ${this.playerScore} &nbsp;×&nbsp; ${this.opponentScore} &nbsp; ${nomeClube(this.opponent.name)}
        </div>
        ${
          this.penaltyScore
            ? `<div class="pui-text-pixel pui-text-gold" style="font-size:6px;margin-top:4px;">
          PÊNALTIS ${this.penaltyScore.player} × ${this.penaltyScore.opponent} — classificado: ${nomeClube(this.penaltyWinnerId)}
        </div>`
            : ""
        }
      </div>

      <!-- CORPO -->
      <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px;overflow:hidden;">

        <!-- COLUNA ESQUERDA: Atuação -->
        <div class="pui-panel" style="height:100%;overflow:hidden;">
          <div class="pui-panel-header">
            <span class="pui-panel-title">${this.autoSimulated ? "PARTIDA SIMULADA" : "ATUAÇÃO NA PARTIDA"}</span>
          </div>
          <div class="pui-panel-body" style="height:calc(100% - 44px);display:flex;flex-direction:column;gap:10px;">

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              ${statCards}
            </div>

            <hr class="pui-divider" />

            <div style="text-align:center;">
              <div class="pui-text-pixel pui-text-gold" style="font-size:10px;margin-bottom:6px;">
                NOTA: ${this.matchRating.toFixed(1)}
              </div>
              ${UIHelper.createDOMBar("DESEMPENHO", this.matchRating - 1, 9, noteColor)}
            </div>

          </div>
        </div>

        <!-- COLUNA DIREITA: Progresso (apenas se não exibição) -->
        <div class="pui-panel" style="height:100%;overflow:hidden;">
          <div class="pui-panel-header"><span class="pui-panel-title">${this.isExhibition ? "DETALHES DA PARTIDA" : "PROGRESSO DE CARREIRA"}</span></div>
          <div class="pui-panel-body" style="height:calc(100% - 44px);overflow-y:auto;display:flex;flex-direction:column;gap:8px;">
            ${progressHTML}
          </div>
        </div>

      </div>

      <!-- BOTÕES -->
      ${buttonsHTML}

    </div>`;

    this.mainDOM = this.add.dom(500, 300).createFromHTML(html).setOrigin(0.5);

    this.mainDOM.addListener("click");
    this.mainDOM.on("click", (e) => {
      if (e.target.closest("#btn-lan-lobby")) {
        // Volta para o lobby REUSANDO o socket: id de rede novo quebraria a
        // escalação da próxima partida.
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () =>
          this.scene.start("MultiplayerScene", { cliente: this.lan.cliente }),
        );
        return;
      }

      if (e.target.closest("#btn-lan-sair")) {
        if (this.lan && this.lan.cliente) this.lan.cliente.desconectar();
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () =>
          this.scene.start("MenuScene"),
        );
        return;
      }

      if (e.target.closest("#btn-new-exhibition")) {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () =>
          this.scene.start("ExhibitionMatchScene"),
        );
        return;
      }
      if (e.target.closest("#btn-back-menu")) {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () =>
          this.scene.start("MenuScene"),
        );
        return;
      }
      if (e.target.closest("#btn-profile")) {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () =>
          this.scene.start("PlayerProfileScene"),
        );
        return;
      }
      if (e.target.closest("#btn-continue")) {
        if (seasonComplete && career) {
          career.endSeason();
          this._showSeasonEndOverlay(career);
        } else {
          this.cameras.main.fadeOut(200, 0, 0, 0);
          this.cameras.main.once("camerafadeoutcomplete", () =>
            this.scene.start("PreGameScene"),
          );
        }
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Overlay de fim de temporada
  // ─────────────────────────────────────────────────────────────────────────
  _showSeasonEndOverlay(career) {
    const isChampion =
      career.leagueTable &&
      career.leagueTable.length > 0 &&
      career.leagueTable[0].isPlayerTeam;
    // Campeão da copa sai da chave do MUNDO, que é quem tem o resultado real.
    const cup = career.playerCupStatus();
    const copaNome = career.playerCupName();
    const isCopaChampeao = !!(
      cup && cup.champion === career.currentTeam.name
    );

    const ligaNome = career.playerLeagueName
      ? career.playerLeagueName()
      : "LIGA";
    let titleStr = `FIM DA TEMPORADA ${career.season}`;
    if (isChampion && isCopaChampeao)
      titleStr = `🏆🏆 BICAMPEÃO! ${ligaNome.toUpperCase()} + ${copaNome.toUpperCase()}!`;
    else if (isChampion)
      titleStr = `🏆 CAMPEÃO DO ${ligaNome.toUpperCase()}! T${career.season}`;
    else if (isCopaChampeao)
      titleStr = `🏆 CAMPEÃO DA ${copaNome.toUpperCase()}! T${career.season}`;

    const { domEl, body, close } = UIHelper.createDOMModal(
      this,
      titleStr,
      null,
    );

    // Sem corte: a liga tem o tamanho que tiver, e o corpo do modal já rola.
    const tableRows = (career.leagueTable || [])
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
          <td>${sg >= 0 ? "+" + sg : sg}</td>
          <td><strong>${team.points}</strong></td>
        </tr>`;
      })
      .join("");

    const nomeClube = (id) => {
      const c = typeof findClub === "function" ? findClub(id) : null;
      return c ? c.name : id;
    };
    let copaResult = "";
    if (cup && cup.champion) {
      copaResult = `<span class="pui-text-pixel pui-text-gold" style="font-size:6px;">
        🏆 Campeão: ${nomeClube(cup.champion)}</span>`;
    } else if (cup && cup.eliminated) {
      copaResult = `<span class="pui-text-pixel pui-text-red" style="font-size:6px;">
        Você foi eliminado nas ${cup.phase}</span>`;
    }

    const hasOffers = career.transferOffers && career.transferOffers.length > 0;

    body.innerHTML = `
      ${
        isChampion || isCopaChampeao
          ? `
        <div class="pui-badge pui-badge-gold pui-glow" style="display:block;text-align:center;padding:8px;margin-bottom:12px;font-size:6px;">
          🎉 PARABÉNS! VOCÊ CONQUISTOU O TÍTULO!
        </div>`
          : ""
      }

      <div class="pui-text-pixel pui-text-gold" style="font-size:7px;margin-bottom:8px;">
        CLASSIFICAÇÃO FINAL — ${ligaNome.toUpperCase()}
      </div>

      <table class="pui-table" style="margin-bottom:14px;">
        <thead>
          <tr>
            <th>POS</th><th>TIME</th><th>J</th><th>V</th><th>E</th>
            <th>D</th><th>SG</th><th>PTS</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>

      <hr class="pui-divider" />

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div class="pui-text-pixel pui-text-green" style="font-size:7px;">${copaNome.toUpperCase()}</div>
        ${copaResult}
      </div>

      <div class="pui-text-pixel pui-text-muted" style="font-size:5px;line-height:2;margin-bottom:12px;">
        Seus gols: ${career.playerStats.goals} &nbsp;|&nbsp;
        Assist: ${career.playerStats.assists} &nbsp;|&nbsp;
        Jogos: ${career.playerStats.matches} &nbsp;|&nbsp;
        💰 R$ ${(career.playerMoney || 0).toLocaleString("pt-BR")}
      </div>

      ${
        hasOffers
          ? `
        <div class="pui-badge pui-badge-gold pui-pulse" style="display:block;text-align:center;padding:6px;margin-bottom:12px;font-size:5px;">
          📋 ${career.transferOffers.length} proposta(s) de transferência disponíveis!
        </div>`
          : ""
      }

      <div style="display:flex;justify-content:center;gap:12px;margin-top:8px;">
        ${
          hasOffers
            ? `
          <button class="pui-btn pui-btn-gold" id="btn-market"
            style="width:220px;height:44px;font-size:6px;">
            VER PROPOSTAS
          </button>`
            : ""
        }
        <button class="pui-btn pui-btn-primary" id="btn-new-season"
          style="width:240px;height:44px;font-size:6px;">
          ▶ NOVA TEMPORADA
        </button>
      </div>`;

    body.addEventListener("click", (e) => {
      if (e.target.closest("#btn-market")) {
        close();
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () =>
          this.scene.start("TransferMarketScene"),
        );
        return;
      }
      if (e.target.closest("#btn-new-season")) {
        close();
        career.startNewSeason();
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () =>
          this.scene.start("PreGameScene"),
        );
      }
    });
  }

  shutdown() {
    if (this.mainDOM) {
      this.mainDOM.destroy();
      this.mainDOM = null;
    }
  }
}
