// =============================================================================
// MenuScene.js — v5.0 (UI Retro-Moderno Pixel Art via DOM)
// =============================================================================

class MenuScene extends Phaser.Scene {
  constructor() {
    super("MenuScene");
    this.menuButtons = []; // Para armazenar os botões do menu para navegação
    this.currentFocusedIndex = 0;
    this.previousDpadUp = false;
    this.previousDpadDown = false;
    this.previousAButton = false;
  }

  create() {
    this.cameras.main.setBackgroundColor("#0a1f0a");

    // ── Fundo decorativo com linhas de campo (canvas) ─────────────────────
    const fieldLines = this.add.graphics();
    fieldLines.lineStyle(1, 0x1a4a1a, 0.6);
    // Círculo central
    fieldLines.strokeCircle(500, 300, 130);
    // Retângulo externo
    fieldLines.strokeRect(180, 40, 640, 520);
    // Linha do meio
    fieldLines.moveTo(180, 300);
    fieldLines.lineTo(820, 300);
    fieldLines.strokePath();
    // Área superior
    fieldLines.strokeRect(310, 40, 380, 110);
    // Área inferior
    fieldLines.strokeRect(310, 450, 380, 110);
    // Ponto central
    fieldLines.fillStyle(0x1a4a1a, 0.6);
    fieldLines.fillCircle(500, 300, 5);

    // ── UI DOM ────────────────────────────────────────────────────────────
    const careerExists =
      localStorage.getItem("phaser_football_career") !== null;
    let saveInfo = "(Sem carreira salva)";
    let saveInfoColor = "var(--pui-text-muted)";

    if (careerExists) {
      try {
        const raw = JSON.parse(localStorage.getItem("phaser_football_career"));
        if (raw && raw.playerName) {
          saveInfo = `${raw.playerName.toUpperCase()} &nbsp;|&nbsp; Nível ${raw.level || 1} &nbsp;|&nbsp; Temporada ${raw.season || 1}`;
          saveInfoColor = "var(--pui-green-dim)";
        }
      } catch (e) {}
    }

    const continueVariant = careerExists ? "blue" : "disabled";

    const html = `<div class="pui-root pui-menu-root" style="width:1000px;height:600px;">

        <!-- Título principal -->
        <div class="pui-menu-logo pui-glow" style="margin-top:-40px;">
          FUTEBOL<br>TOP-DOWN
        </div>

        <!-- Subtítulo -->
        <div class="pui-menu-subtitle">
          ⚽ &nbsp; MODO CARREIRA &nbsp; ⚽
        </div>

        <!-- Botões -->
        <div class="pui-menu-buttons">
          <button class="pui-btn pui-btn-green pui-focused" id="btn-exhibition" style="width:100%;height:56px;font-size:8px;">
            ⚽ &nbsp; PARTIDA DE EXIBIÇÃO
          </button>
          
          <button class="pui-btn pui-btn-gold" id="btn-multiplayer" style="width:100%;height:56px;font-size:8px;">
            🖧 &nbsp; MULTIPLAYER
          </button>

          <button class="pui-btn pui-btn-primary" id="btn-new" style="width:100%;height:56px;font-size:8px;">
            ▶ &nbsp; NOVA CARREIRA
          </button>

          <button class="pui-btn pui-btn-${continueVariant}" id="btn-continue" style="width:100%;height:56px;font-size:8px;">
            ◎ &nbsp; CONTINUAR CARREIRA
          </button>

          <button class="pui-btn pui-btn-ghost" id="btn-efeitos" style="width:100%;height:44px;font-size:7px;">
            ⚙ &nbsp; EFEITOS VISUAIS
          </button>

          <div class="pui-menu-save-info" style="color:${saveInfoColor};">
            ${saveInfo}
          </div>
        </div>

        <!-- Controles -->
        <div class="pui-menu-controls">
          WASD: Mover &nbsp;|&nbsp; SHIFT: Sprint &nbsp;|&nbsp; ESPAÇO: Bote<br>
          Clique Esq: Chute &nbsp;|&nbsp; Clique Dir: Passe
        </div>

      </div>`;

    const menuDOM = this.add.dom(500, 300).createFromHTML(html).setOrigin(0.5);

    // Coletar os botões do menu (apenas os que são clicáveis)
    const btnElements = menuDOM.node.querySelectorAll(".pui-btn:not(.pui-btn-disabled)");
    this.menuButtons = Array.from(btnElements);
    this.currentFocusedIndex = 0;
    this.updateFocusedButton(); // Marca o botão inicial como focado

    // Eventos de clique
    menuDOM.addListener("click");
    menuDOM.on("click", (event) => {
      const id = event.target.id || event.target.closest("[id]")?.id;

      if (id === "btn-exhibition" || event.target.closest("#btn-exhibition")) {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () => {
          this.scene.start("ExhibitionMatchScene");
        });
        return;
      }

      if (id === "btn-efeitos" || event.target.closest("#btn-efeitos")) {
        this.abrirEfeitos();
        return;
      }

      if (id === "btn-multiplayer" || event.target.closest("#btn-multiplayer")) {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () => {
          this.scene.start("MultiplayerScene");
        });
        return;
      }

      if (id === "btn-new" || event.target.closest("#btn-new")) {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () => {
          this.scene.start("CharacterCreationScene");
        });
        return;
      }

      if (
        (id === "btn-continue" || event.target.closest("#btn-continue")) &&
        careerExists
      ) {
        window.careerMode = new CareerMode();
        const loaded = window.careerMode.loadFromLocalStorage();
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () => {
          if (loaded) {
            this.scene.start("PreGameScene");
          } else {
            this.scene.start("CharacterCreationScene");
          }
        });
      }
    });

    // Fade in
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  update() {
    // Tratar controles de gamepad para navegação no menu
    const pad = this.input.gamepad.pad1;
    if (pad && pad.connected) {
      // Navegação para cima
      const dpadUp = pad.up;
      if (dpadUp && !this.previousDpadUp) {
        this.currentFocusedIndex = (this.currentFocusedIndex - 1 + this.menuButtons.length) % this.menuButtons.length;
        this.updateFocusedButton();
      }
      this.previousDpadUp = dpadUp;

      // Navegação para baixo
      const dpadDown = pad.down;
      if (dpadDown && !this.previousDpadDown) {
        this.currentFocusedIndex = (this.currentFocusedIndex + 1) % this.menuButtons.length;
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

  /**
   * Efeitos visuais, aqui e na pausa da partida, com a MESMA lista: quem
   * desenha os interruptores é o `EfeitosVisuais`, então efeito novo aparece
   * nas duas telas sem ninguém lembrar de editar as duas.
   *
   * O modal é filho do container DOM do Phaser (1000x600, `overflow:hidden`) —
   * mede em %, nunca em vw/vh, senão sai cortado em tela grande.
   */
  abrirEfeitos() {
    if (this._efeitos) return;

    const html =
      '<div class="pui-modal-wrap" style="width:100%;height:100%;' +
      'display:flex;align-items:center;justify-content:center;">' +
      '<div class="pui-panel" style="width:72%;max-height:82%;overflow-y:auto;padding:18px;">' +
      '<div class="pui-menu-logo pui-glow" style="font-size:11px;margin-bottom:6px;">EFEITOS VISUAIS</div>' +
      '<div class="pui-config-hint" style="margin-bottom:10px;">' +
      "Desligue o que pesar ou incomodar. A escolha fica salva neste navegador." +
      "</div>" +
      EfeitosVisuais.linhasHtml() +
      '<button class="pui-btn pui-btn-ghost" id="btn-efeitos-fechar" ' +
      'style="width:100%;height:40px;font-size:7px;margin-top:14px;">FECHAR</button>' +
      "</div></div>";

    this._efeitos = this.add.dom(500, 300).createFromHTML(html).setOrigin(0.5);
    this._efeitos.addListener("click");
    this._efeitos.on("click", (event) => {
      if (EfeitosVisuais.tratarClique(event.target)) return;
      if (event.target.closest("#btn-efeitos-fechar")) this.fecharEfeitos();
    });
  }

  fecharEfeitos() {
    if (!this._efeitos) return;
    this._efeitos.destroy();
    this._efeitos = null;
  }

  updateFocusedButton() {
    // Remove a classe focused de todos os botões
    this.menuButtons.forEach((btn, index) => {
      btn.classList.remove("pui-focused");
    });

    // Adiciona a classe focused ao botão selecionado
    if (this.menuButtons[this.currentFocusedIndex]) {
      this.menuButtons[this.currentFocusedIndex].classList.add("pui-focused");
    }
  }
}
