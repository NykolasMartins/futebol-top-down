// =============================================================================
// TransferMarketScene.js — v5.0 (Retro-Moderno Pixel Art via DOM)
// =============================================================================

class TransferMarketScene extends Phaser.Scene {
  constructor() {
    super("TransferMarketScene");
    this.menuButtons = [];
    this.currentFocusedIndex = 0;
    this.previousDpadUp = false;
    this.previousDpadDown = false;
    this.previousAButton = false;
  }

  create() {
    const career = window.careerMode;
    this.cameras.main.setBackgroundColor("#080f08");

    // Fundo decorativo (canvas)
    const bg = this.add.graphics();
    bg.lineStyle(1, 0x1a3a1a, 0.3);
    bg.strokeRect(10, 10, 980, 580);
    bg.strokeCircle(500, 300, 180);
    bg.moveTo(10, 300);
    bg.lineTo(990, 300);
    bg.strokePath();

    // Build DOM UI
    this._buildUI(career);

    this.cameras.main.fadeIn(250, 0, 0, 0);

    this.updateButtonList();
  }

  updateButtonList() {
    this.menuButtons = [];
    if (this.mainDOM) {
      const btnElements = this.mainDOM.node.querySelectorAll(
        ".pui-btn:not(.pui-btn-disabled)",
      );
      this.menuButtons = Array.from(btnElements);
      if (this.menuButtons.length > 0) {
        if (this.currentFocusedIndex >= this.menuButtons.length)
          this.currentFocusedIndex = 0;
        this.updateFocusedButton();
      }
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
        }
      }
      this.previousAButton = aButton;
    }
  }

  _buildUI(career) {
    if (this.mainDOM) {
      this.mainDOM.destroy();
      this.mainDOM = null;
    }

    const currentSalary = career.monthlySalary || 0;
    const offers = career.transferOffers || [];

    // Build offers content
    let offersHTML = "";
    if (offers.length === 0) {
      offersHTML = `
        <div style="text-align:center;padding:60px 0;">
          <p class="pui-text-pixel pui-text-muted" style="font-size:9px;margin-bottom:16px;">
            Nenhuma proposta recebida no momento.
          </p>
          <p class="pui-text-pixel pui-text-muted" style="font-size:6px;line-height:2;">
            Continue se destacando em campo!<br>
            Novas propostas surgem ao fim da temporada.
          </p>
        </div>`;
    } else {
      const offersCards = offers.map((offer, idx) => {
        // A oferta é PLANA: `team` é o ID do clube, e tier/rating/salary ficam
        // no topo. Ler `offer.team.tier` (objeto) é o que enchia a tela de
        // "undefined" — esse formato nunca existiu do lado do CareerMode.
        const teamId = offer.teamId || offer.team;
        const teamLabel = offer.teamLabel || CareerMode.clubLabel(teamId);
        const tier = offer.tier || 3;
        const salary = offer.salary || 0;
        const tierLabel = ["", "PEQUENO", "REGIONAL", "NACIONAL", "GRANDE", "ELITE"];
        const tierColor =
          tier >= 4 ? "#ffd700" : tier >= 2 ? "#00e676" : "#888888";
        const salaryDiff = salary - currentSalary;
        const diffColor =
          salaryDiff > 0
            ? "#2196f3"
            : salaryDiff < 0
              ? "#ff1744"
              : "#ffd835";
        const diffText =
          salaryDiff > 0
            ? `+ R$ ${salaryDiff.toLocaleString("pt-BR")}`
            : salaryDiff < 0
              ? `- R$ ${Math.abs(salaryDiff).toLocaleString("pt-BR")}`
              : "MESMO SALÁRIO";

        return `
          <div class="pui-panel" style="margin-bottom:10px;">
            <div class="pui-panel-header" style="display:flex;justify-content:space-between;align-items:center;">
              <span class="pui-panel-title" style="font-size:8px;">${teamLabel}${offer.isRenewal ? " — RENOVAÇÃO" : ""}</span>
              <span style="font-size:6px;color:${tierColor};font-weight:bold;">TIER ${tier} — ${tierLabel[tier] || "—"}</span>
            </div>
            <div class="pui-panel-body" style="padding:14px 16px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
                <div>
                  <div class="pui-text-pixel pui-text-muted" style="font-size:5px;">FORÇA DO CLUBE</div>
                  <div class="pui-text-pixel pui-text-white" style="font-size:7px;">${offer.rating || "—"}</div>
                </div>
                <div style="text-align:right;">
                  <div class="pui-text-pixel pui-text-muted" style="font-size:5px;">PROPOSTA SALARIAL</div>
                  <div class="pui-text-pixel" style="font-size:10px;color:#ffd700;">
                    R$ ${salary.toLocaleString("pt-BR")}/mês
                  </div>
                  <div class="pui-text-pixel" style="font-size:6px;color:${diffColor};">
                    ${diffText}
                  </div>
                </div>
              </div>
              <div class="pui-text-pixel pui-text-muted" style="font-size:5px;">
                ${offer.bonus ? offer.bonus.toUpperCase() : "Bônus a negociar"}
                ${
                  offer.signingBonus
                    ? ` &nbsp;|&nbsp; LUVAS: R$ ${offer.signingBonus.toLocaleString("pt-BR")}`
                    : ""
                }
              </div>
              <div style="display:flex;gap:8px;margin-top:14px;">
                <button class="pui-btn pui-btn-primary" data-action="accept" data-idx="${idx}" style="flex:1;height:46px;font-size:6px;">
                  ✓ ACEITAR
                </button>
                <button class="pui-btn pui-btn-danger" data-action="decline" data-idx="${idx}" style="flex:1;height:46px;font-size:6px;">
                  ✗ RECUSAR
                </button>
              </div>
            </div>
          </div>`;
      });

      offersHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div class="pui-badge pui-badge-gold" style="font-size:5px;text-align:center;margin-bottom:4px;">
            ${offers.length} PROPOSTA(S) RECEBIDA(S)
          </div>
          ${offersCards.join("")}
        </div>`;
    }

    const html = `
    <div class="pui-root" style="width:1000px;height:600px;display:flex;flex-direction:column;">
      <div class="pui-topbar">
        <div class="pui-topbar-left">
          <span class="pui-player-name">MERCADO DE TRANSFERÊNCIAS</span>
          <span class="pui-player-info">Clube atual: ${career.currentTeam ? CareerMode.clubLabel(career.currentTeam.name) : "—"}</span>
        </div>
        <div class="pui-topbar-right">
          <span class="pui-date-text">
            Salário atual: R$ ${currentSalary.toLocaleString("pt-BR")}/mês
          </span>
        </div>
      </div>

      <div style="flex:1;display:flex;flex-direction:column;padding:10px;overflow:hidden;">
        <div style="flex:1;overflow-y:auto;">
          ${offersHTML}
        </div>
      </div>

      <div style="padding:10px;">
        <button class="pui-btn pui-btn-default" id="btn-back" style="width:100%;height:48px;font-size:7px;">
          ← VOLTAR AO CT
        </button>
      </div>
    </div>`;

    this.mainDOM = this.add.dom(500, 300).createFromHTML(html).setOrigin(0.5);
    this.mainDOM.addListener("click");
    this.mainDOM.on("click", (e) => {
      const career = window.careerMode;
      const t = e.target;

      // Handle accept/decline buttons
      const btn = t.closest("[data-action]");
      if (btn) {
        const idx = parseInt(btn.dataset.idx);
        const action = btn.dataset.action;
        const offer = career.transferOffers[idx];
        if (!offer) return;

        if (action === "accept") {
          career.acceptTransfer(offer);
          this.showConfirmation(offer);
        } else {
          career.declineTransfer(offer);
          this._buildUI(career);
          this.updateButtonList();
        }
        return;
      }

      // Back button
      if (t.closest("#btn-back")) {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () =>
          this.scene.start("PreGameScene"),
        );
      }
    });
  }

  showConfirmation(offer) {
    const { domEl, body, close } = UIHelper.createDOMModal(
      this,
      "CONTRATO ASSINADO!",
      null,
    );

    body.innerHTML = `
      <div style="text-align:center;padding:20px;">
        <div style="font-size:52px;margin-bottom:16px;">✓</div>
        <p class="pui-text-pixel pui-text-white" style="font-size:12px;margin-bottom:12px;">
          BEM-VINDO AO ${(offer.teamLabel || CareerMode.clubLabel(offer.teamId || offer.team)).toUpperCase()}!
        </p>
        <p class="pui-text-pixel" style="font-size:7px;color:#00e676;margin-bottom:24px;">
          SEU NOVO DESAFIO COMEÇA AGORA!
        </p>
        <button class="pui-btn pui-btn-primary" id="btn-continue"
          style="width:240px;height:50px;font-size:7px;">
          VAMOS NESSA!
        </button>
      </div>`;

    body.addEventListener("click", (e) => {
      if (e.target.closest("#btn-continue")) {
        close();
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () =>
          this.scene.start("PreGameScene"),
        );
      }
    });
  }
}