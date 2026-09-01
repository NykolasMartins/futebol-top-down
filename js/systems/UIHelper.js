// =============================================================================
// UIHelper.js — v5.0 (Retro-Moderno Pixel Art — HTML/CSS via Phaser DOM)
// =============================================================================
// Mantém compatibilidade total com as cenas de gameplay (GameScene, TrainingScene)
// que usam canvas puro, enquanto as cenas de menu usam o novo sistema DOM.
// =============================================================================

class UIHelper {
  static COLORS = {
    PRIMARY: 0x00c853,
    SECONDARY: 0x2196f3,
    WARNING: 0xffd835,
    DANGER: 0xff1744,
    GRAY: 0x666666,
  };

  static STR_COLORS = {
    PRIMARY: "#00c853",
    SECONDARY: "#2196f3",
    WARNING: "#ffd835",
    DANGER: "#ff1744",
    GOLD: "#ffd700",
  };

  // ─── UTILITÁRIO DOM: criar elemento HTML e injetá-lo via Phaser ───────────

  /**
   * Cria um elemento DOM e o adiciona à cena via this.add.dom().
   * Retorna o objeto DOMElement do Phaser (com .node para acesso ao HTML).
   */
  static createDOMElement(scene, x, y, html, width, height) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    const el = wrapper.firstElementChild || wrapper;
    if (width) el.style.width = `${width}px`;
    if (height) el.style.height = `${height}px`;
    return scene.add.dom(x, y, el);
  }

  // ─── BOTÃO (DOM) ──────────────────────────────────────────────────────────

  /**
   * Cria um botão HTML estilizado com CSS Retro-Moderno.
   * Retorna o DOMElement do Phaser.
   * @param {string} variant  'primary'|'blue'|'gold'|'danger'|'dark'|'disabled'
   */
  static createDOMButton(scene, x, y, width, height, text, variant, callback) {
    const variantClass = `pui-btn-${variant || "primary"}`;
    const el = document.createElement("button");
    el.className = `pui-btn ${variantClass}`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.innerHTML = text;

    if (variant !== "disabled") {
      el.addEventListener("click", () => callback && callback());
    }

    const domEl = scene.add.dom(x, y, el);
    return domEl;
  }

  // ─── PAINEL (DOM) ─────────────────────────────────────────────────────────

  /**
   * Cria um painel HTML com cabeçalho e corpo.
   * Retorna o elemento DOM nativo para que o chamador possa preencher o corpo.
   */
  static createDOMPanel(scene, x, y, width, height, title) {
    const panel = document.createElement("div");
    panel.className = "pui-panel";
    panel.style.width = `${width}px`;
    panel.style.height = `${height}px`;

    const header = document.createElement("div");
    header.className = "pui-panel-header";
    header.innerHTML = `<span class="pui-panel-title">${title ? title.toUpperCase() : ""}</span>`;
    panel.appendChild(header);

    const body = document.createElement("div");
    body.className = "pui-panel-body";
    body.style.height = `${height - 44}px`;
    body.style.overflowY = "auto";
    panel.appendChild(body);

    const domEl = scene.add.dom(x, y, panel);
    domEl._body = body;
    return domEl;
  }

  // ─── BARRA DE PROGRESSO (DOM) ─────────────────────────────────────────────

  /**
   * Cria uma barra de progresso HTML.
   * @param {string} colorClass 'green'|'yellow'|'blue'|'orange'|'red'
   */
  static createDOMBar(label, value, maxValue, colorClass) {
    const pct = Math.min(100, Math.max(0, (value / maxValue) * 100));
    return `
      <div class="pui-bar-wrap">
        <div class="pui-bar-label">
          <span>${label}</span>
          <span>${Math.floor(value)}/${maxValue}</span>
        </div>
        <div class="pui-bar-track">
          <div class="pui-bar-fill pui-bar-${colorClass}" style="width:${pct}%"></div>
        </div>
      </div>`;
  }

  // ─── MODAL (DOM) ──────────────────────────────────────────────────────────

  /**
   * Cria um modal overlay HTML sobre o canvas.
   * Retorna { domEl, body, close() }.
   */
  static createDOMModal(scene, title, onClose) {
    const wrap = document.createElement("div");
    wrap.className = "pui-modal-wrap";
    wrap.style.cssText =
      "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:1000;";

    const modal = document.createElement("div");
    modal.className = "pui-modal";

    const header = document.createElement("div");
    header.className = "pui-modal-header";
    header.innerHTML = `
      <span class="pui-panel-title">${title ? title.toUpperCase() : ""}</span>
      <button class="pui-modal-close">✕ FECHAR</button>`;
    modal.appendChild(header);

    const body = document.createElement("div");
    body.className = "pui-modal-body";
    modal.appendChild(body);

    wrap.appendChild(modal);

    const domEl = scene.add
      .dom(scene.cameras.main.width / 2, scene.cameras.main.height / 2, wrap)
      .setOrigin(0.5);
    domEl.node.style.width = "100%";
    domEl.node.style.height = "100%";

    const closeBtn = header.querySelector(".pui-modal-close");
    let fechado = false;
    const close = () => {
      if (fechado) return;
      fechado = true;
      scene.input.keyboard.off("keydown-ESC", close);
      domEl.destroy();
      if (onClose) onClose();
    };
    closeBtn.addEventListener("click", close);

    // ESC e clique FORA fecham. Custa três linhas, vale para os nove modais do
    // jogo, e é o que todo mundo já tenta fazer antes de procurar o ✕.
    scene.input.keyboard.on("keydown-ESC", close);
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) close();
    });

    return { domEl, body, close };
  }

  // ─── NOTIFICAÇÃO TOAST (DOM) ──────────────────────────────────────────────

  /**
   * PILHA DE AVISOS — não bloqueante, empilhada, some sozinha.
   *
   * A versão anterior era um MODAL por notificação, um de cada vez, cada um
   * exigindo OK: passar um dia com três avisos custava três cliques e três
   * esperas, em cima de uma tela que o jogador nem podia usar enquanto isso.
   * Aqui os avisos aparecem juntos no canto, o jogo continua clicável, e cada
   * um sai sozinho — clicar só acelera.
   *
   * A CAMADA tem o tamanho do canvas cravado no ui.css: o `add.dom` a pendura
   * DENTRO do container DOM do Phaser, e não como filha direta do
   * `#game-container` — a regra que estica os filhos diretos não a alcança, e
   * sem tamanho ela encolhia até o texto e ancorava no canto errado.
   */
  static toast(scene, message, type, opcoes) {
    if (!scene || !scene.add || !message) return null;
    const cfg = opcoes || {};

    if (!scene._toastLayer || !scene._toastLayer.node) {
      const camada = document.createElement("div");
      camada.className = "pui-toast-layer";
      // O empilhamento vive num filho, não no nó que o Phaser gerencia: ele
      // escreve `display` INLINE no elemento do `add.dom`, e inline ganha da
      // folha de estilo — o `display:flex` da camada virava `block` e todo
      // aviso ancorava no canto superior esquerdo.
      camada.appendChild(
        Object.assign(document.createElement("div"), {
          className: "pui-toast-stack",
        }),
      );
      const dom = scene.add.dom(0, 0, camada).setOrigin(0, 0).setDepth(6000);
      if (dom.setScrollFactor) dom.setScrollFactor(0);
      scene._toastLayer = dom;
      // Cena que troca leva a pilha junto: são nós DOM soltos, e o Phaser não
      // recolhe nada que ele não criou (mesma regra do placar e da torcida).
      scene.events.once("shutdown", () => {
        if (scene._toastLayer) scene._toastLayer.destroy();
        scene._toastLayer = null;
      });
    }
    // `add.dom(x, y, el)` devolve o PRÓPRIO elemento em `.node`; a pilha é o
    // filho dele (ver acima).
    const camadaNode = scene._toastLayer.node;
    const pilha = camadaNode.querySelector(".pui-toast-stack") || camadaNode;
    // `main.css` crava `z-index: 1000 !important` em TODA camada DOM do Phaser,
    // então quem decide quem fica por cima é a ordem no DOM, não o `setDepth`.
    // Reanexar joga a pilha para o fim: sem isto o aviso nasce ATRÁS do painel
    // opaco da tela (a fila é despejada antes de a UI ser montada).
    if (camadaNode.parentNode)
      camadaNode.parentNode.appendChild(camadaNode);

    const card = document.createElement("div");
    card.className = "pui-toast pui-toast-" + (type || "info");
    card.textContent = message;
    pilha.appendChild(card);

    // Tempo proporcional ao texto: aviso curto não precisa ficar 5s na tela, e
    // aviso longo não pode sumir antes de ser lido.
    const ms =
      cfg.duracao ||
      Math.min(7000, Math.max(2500, 1200 + String(message).length * 45));

    let fechado = false;
    const fechar = () => {
      if (fechado) return;
      fechado = true;
      card.classList.add("saindo");
      // 220ms = a duração da animação de saída no ui.css.
      setTimeout(() => card.remove(), 220);
    };
    card.addEventListener("click", fechar);
    setTimeout(fechar, ms);

    // Teto de pilha: acima disso a tela vira parede de texto e o jogador não lê
    // nenhum. O mais VELHO sai primeiro.
    const MAX = 4;
    const vivos = [...pilha.querySelectorAll(".pui-toast:not(.saindo)")];
    if (vivos.length > MAX)
      vivos.slice(0, vivos.length - MAX).forEach((v) => v.click());

    return { card, fechar };
  }

  /** Despeja uma fila inteira de avisos de uma vez, com um respiro entre eles. */
  static toastFila(scene, itens) {
    (itens || []).forEach((item, i) => {
      const msg = typeof item === "string" ? item : item.msg;
      const tipo = typeof item === "string" ? "info" : item.type;
      // Escalonado: três cards nascendo no mesmo frame viram um bloco só.
      scene.time.delayedCall(i * 260, () => UIHelper.toast(scene, msg, tipo));
    });
  }

  // O antigo `createDOMNotification` (um MODAL por aviso, com botão OK) foi
  // apagado junto com o último chamador: ele bloqueava a tela inteira para dar
  // uma linha de texto, e a fila de um dia inteiro virava uma sequência de
  // cliques. Quem avisa agora é `toast()`/`toastFila()`, logo acima.

  // =========================================================================
  // CANVAS FALLBACKS — mantidos para GameScene, TrainingScene e outros
  // usos que não foram migrados para DOM.
  // =========================================================================

  /**
   * Cria um botão estilizado no canvas (legado).
   * Mantido para compatibilidade com GameScene / TrainingScene.
   */
  static createButton(scene, x, y, width, height, text, color, callback) {
    const container = scene.add.container(x, y);

    const shadow = scene.add.graphics();
    shadow.fillStyle(0x000000, 0.3);
    shadow.fillRoundedRect(4, 4, width, height, 4);
    container.add(shadow);

    const bg = scene.add.graphics();
    const drawBg = (bgColor, strokeAlpha) => {
      bg.clear();
      bg.fillStyle(bgColor, 1);
      bg.lineStyle(2, 0xffffff, strokeAlpha);
      bg.fillRoundedRect(0, 0, width, height, 4);
      bg.strokeRoundedRect(0, 0, width, height, 4);
    };
    drawBg(color, 0.4);
    container.add(bg);

    const label = scene.add
      .text(width / 2, height / 2, text, {
        fontSize: "10px",
        fill: "#ffffff",
        fontStyle: "bold",
        fontFamily: "'Press Start 2P', monospace",
        align: "center",
        wordWrap: { width: width - 8 },
      })
      .setOrigin(0.5);
    container.add(label);

    bg.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, width, height),
      Phaser.Geom.Rectangle.Contains,
    );

    bg.on("pointerover", () => {
      scene.tweens.add({
        targets: container,
        scale: 1.04,
        duration: 80,
        ease: "Power1",
      });
      const hoverColor =
        Phaser.Display.Color.ValueToColor(color).lighten(15).color;
      drawBg(hoverColor, 0.8);
    });

    bg.on("pointerout", () => {
      scene.tweens.add({
        targets: container,
        scale: 1.0,
        duration: 80,
        ease: "Power1",
      });
      drawBg(color, 0.4);
    });

    bg.on("pointerdown", () => {
      scene.tweens.add({ targets: container, scale: 0.96, duration: 50 });
      callback();
    });

    return container;
  }

  /**
   * Cria um painel no canvas (legado).
   */
  static createPanel(scene, x, y, width, height, title) {
    const container = scene.add.container(x, y);

    const shadow = scene.add.graphics();
    shadow.fillStyle(0x000000, 0.4);
    shadow.fillRoundedRect(5, 5, width, height, 6);
    container.add(shadow);

    const bg = scene.add.graphics();
    bg.fillStyle(0x111a11, 0.95);
    bg.lineStyle(2, 0x2a7a2a, 1);
    bg.fillRoundedRect(0, 0, width, height, 6);
    bg.strokeRoundedRect(0, 0, width, height, 6);
    container.add(bg);

    if (title) {
      const headerBg = scene.add.graphics();
      headerBg.fillStyle(0x1a4a1a, 1);
      headerBg.fillRoundedRect(0, 0, width, 44, { tl: 6, tr: 6, bl: 0, br: 0 });
      container.add(headerBg);

      const header = scene.add
        .text(width / 2, 22, title.toUpperCase(), {
          fontSize: "8px",
          fill: "#ffd700",
          fontStyle: "bold",
          fontFamily: "'Press Start 2P', monospace",
        })
        .setOrigin(0.5);
      container.add(header);

      const line = scene.add.graphics();
      line.lineStyle(1, 0x2a7a2a, 1);
      line.lineBetween(0, 44, width, 44);
      container.add(line);
    }

    return container;
  }

  /**
   * Cria um seletor de cores no canvas (legado).
   */
  static createColorSelector(
    scene,
    x,
    y,
    colors,
    selectedColor,
    onColorSelect,
  ) {
    const container = scene.add.container(x, y);
    const colorSize = 35;
    const spacing = 5;
    const colsPerRow = 4;

    colors.forEach((color, i) => {
      const col = i % colsPerRow;
      const row = Math.floor(i / colsPerRow);
      const cx = col * (colorSize + spacing);
      const cy = row * (colorSize + spacing);

      const colorBtn = scene.add.graphics();
      const isSelected = color === selectedColor;
      colorBtn.fillStyle(color, 1);
      colorBtn.fillRect(0, 0, colorSize, colorSize);
      if (isSelected) {
        colorBtn.lineStyle(3, 0xffd700, 1);
        colorBtn.strokeRect(0, 0, colorSize, colorSize);
      }

      const colorContainer = scene.add.container(cx, cy);
      colorContainer.add(colorBtn);
      colorContainer.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, colorSize, colorSize),
        Phaser.Geom.Rectangle.Contains,
      );

      colorContainer.on("pointerdown", () => onColorSelect(color));
      colorContainer.on("pointerover", () => {
        scene.tweens.add({
          targets: colorContainer,
          scale: 1.12,
          duration: 80,
          ease: "Power1",
        });
      });
      colorContainer.on("pointerout", () => {
        scene.tweens.add({
          targets: colorContainer,
          scale: 1.0,
          duration: 80,
          ease: "Power1",
        });
      });

      container.add(colorContainer);
    });

    return container;
  }

  /**
   * Cria um seletor de opções no canvas (legado).
   */
  static createOptionSelector(
    scene,
    x,
    y,
    options,
    selectedOption,
    onOptionSelect,
    buttonWidth = 80,
    buttonHeight = 30,
  ) {
    const container = scene.add.container(x, y);
    const spacing = 8;

    options.forEach((option, i) => {
      const bx = i * (buttonWidth + spacing);
      const isSelected = option === selectedOption;
      const btn = UIHelper.createButton(
        scene,
        bx,
        0,
        buttonWidth,
        buttonHeight,
        option,
        isSelected ? 0x1a7a1a : 0x333333,
        () => onOptionSelect(option),
      );
      container.add(btn);
    });

    return container;
  }

  /**
   * Cria um tooltip no canvas (legado).
   */
  static createTooltip(scene, x, y, text, targetObject) {
    const tooltip = scene.add
      .text(x, y, text, {
        fontSize: "9px",
        fill: "#ffd700",
        backgroundColor: "#111a11",
        padding: { x: 6, y: 4 },
        fontFamily: "'Press Start 2P', monospace",
      })
      .setOrigin(0.5, 1)
      .setVisible(false)
      .setDepth(1000);

    targetObject.on("pointerover", () => tooltip.setVisible(true));
    targetObject.on("pointerout", () => tooltip.setVisible(false));

    return tooltip;
  }

  /**
   * Cria uma barra de progresso no canvas (legado).
   */
  static createProgressBar(scene, x, y, width, height, value, maxValue, color) {
    const container = scene.add.container(x, y);

    const bg = scene.add.graphics();
    bg.fillStyle(0x1a1a1a, 1);
    bg.fillRoundedRect(0, 0, width, height, 3);
    container.add(bg);

    const fill = scene.add.graphics();
    const fillWidth = (width * value) / maxValue;
    fill.fillStyle(color, 1);
    fill.fillRoundedRect(0, 0, fillWidth, height, 3);
    container.add(fill);

    const border = scene.add.graphics();
    border.lineStyle(1, 0x2a7a2a, 0.6);
    border.strokeRoundedRect(0, 0, width, height, 3);
    container.add(border);

    return container;
  }

  static createStatBar(
    scene,
    x,
    y,
    width,
    height,
    label,
    value,
    maxValue,
    color,
  ) {
    const container = scene.add.container(x, y);

    const labelText = scene.add.text(0, -20, label, {
      fontSize: "10px",
      fill: "#ffd700",
      fontStyle: "bold",
      fontFamily: "'Press Start 2P', sans-serif",
    });
    container.add(labelText);

    const valText = scene.add
      .text(width, -20, `${Math.floor(value)}/${maxValue}`, {
        fontSize: "10px",
        fill: "#c8e8c8",
        fontStyle: "bold",
        fontFamily: "'Press Start 2P', sans-serif",
      })
      .setOrigin(1, 0);
    container.add(valText);

    const bg = scene.add.graphics();
    bg.fillStyle(0x0a140a, 1);
    bg.fillRoundedRect(0, 0, width, height, 3);
    container.add(bg);

    const fill = scene.add.graphics();
    const fillWidth = (width * value) / maxValue;
    fill.fillStyle(color, 1);
    fill.fillRoundedRect(0, 0, fillWidth, height, 3);
    container.add(fill);

    const border = scene.add.graphics();
    border.lineStyle(2, 0x2a7a2a, 1);
    border.strokeRoundedRect(0, 0, width, height, 3);
    container.add(border);

    return container;
  }

  static createInfoLabel(scene, x, y, label, value) {
    const container = scene.add.container(x, y);
    const labelText = scene.add.text(0, 0, `${label}:`, {
      fontSize: "10px",
      fill: "#888888",
      fontStyle: "bold",
    });
    container.add(labelText);
    const valueText = scene.add.text(labelText.width + 5, 0, value, {
      fontSize: "11px",
      fill: "#ffffff",
      fontStyle: "bold",
    });
    container.add(valueText);
    return container;
  }
}
