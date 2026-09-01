// =============================================================================
// CharacterCreationScene.js — v5.0 (UI Retro-Moderno Pixel Art via DOM)
// =============================================================================

class CharacterCreationScene extends Phaser.Scene {
  constructor() {
    super("CharacterCreationScene");
  }

  preload() {
    // Mesma arte base da partida: o preview usa o motor de swap de verdade.
    this.loadBaseSprites();
  }

  create() {
    this.cameras.main.setBackgroundColor("#0a1f0a");

    // Estado
    this.currentStep      = 1;
    this.playerName       = "";
    this.selectedLeague   = "Brasil";
    this.selectedTeam     = null;
    this.selectedPosition = "Meia";
    this.selectedSkinColor = '#ffdbac';

    this.skinColors = [
      { hex: '#ffdbac', label: 'Clara' },
      { hex: '#f4a460', label: 'Morena' },
      { hex: '#d4a574', label: 'Parda' },
      { hex: '#a0826d', label: 'Morena Escura' },
      { hex: '#704214', label: 'Negra' },
    ];

    // Cabelo vem de HAIR_COLORS: as mesmas cores que os NPCs usam em campo.
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    this.hairColors = HAIR_COLORS.map((c, i) => ({
      hex: hex(c),
      label: ['Preto', 'Castanho', 'Loiro', 'Ruivo'][i] || 'Cor ' + (i + 1),
    }));
    this.selectedHairColor = this.hairColors[0].hex;

    this.positionBases = {
      // O jogador COMEÇA fraco — overall ~57, não ~70. A forma de cada posição
      // continua a mesma (o atacante chuta, o lateral corre); o que mudou é o
      // ponto de partida, para a carreira ter para onde subir. A régua é
      // `CAREER_BASE.START_*`, e estes números orbitam ela.
      "Atacante": { speed: 60, kickPower: 63, stamina: 53, desc: "Vel 60 | Chute 63 | Resist 53" },
      "Meia":     { speed: 56, kickPower: 56, stamina: 60, desc: "Vel 56 | Chute 56 | Resist 60" },
      "Lateral":  { speed: 64, kickPower: 50, stamina: 58, desc: "Vel 64 | Chute 50 | Resist 58" },
      "Zagueiro": { speed: 50, kickPower: 58, stamina: 56, desc: "Vel 50 | Chute 58 | Resist 56" },
    };

    // Fundo decorativo
    const fieldLines = this.add.graphics();
    fieldLines.lineStyle(1, 0x1a4a1a, 0.35);
    fieldLines.strokeCircle(500, 300, 200);
    fieldLines.strokeRect(100, 50, 800, 500);
    fieldLines.moveTo(100, 300); fieldLines.lineTo(900, 300); fieldLines.strokePath();

    // Container DOM principal
    this.domRoot = null;
    this.renderStep();

    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  // ── Renderiza o passo atual ───────────────────────────────────────────────
  renderStep() {
    if (this.domRoot) {
      this.domRoot.destroy();
      this.domRoot = null;
    }

    const stepTitles = ['IDENTIDADE', 'LIGA', 'TIME', 'APARÊNCIA'];
    const stepsHTML = stepTitles.map((t, i) => {
      const n = i + 1;
      const cls = n < this.currentStep ? 'done' : n === this.currentStep ? 'active' : '';
      return `
        <div class="pui-step-item ${cls}">
          <div class="pui-step-dot">${n < this.currentStep ? '✓' : n}</div>
          <div class="pui-step-label">${t}</div>
        </div>`;
    }).join('');

    const backLabel  = this.currentStep === 1 ? 'CANCELAR' : '◀ VOLTAR';
    const nextLabel  = this.currentStep === 4 ? 'COMEÇAR! ▶' : 'PRÓXIMO ▶';
    const nextVariant = this.currentStep === 4 ? 'gold' : 'primary';

    let stepContent = '';
    switch (this.currentStep) {
      case 1: stepContent = this._buildStep1(); break;
      case 2: stepContent = this._buildStep2(); break;
      case 3: stepContent = this._buildStep3(); break;
      case 4: stepContent = this._buildStep4(); break;
    }

    const html = `
      <div class="pui-root" style="width:1000px;height:600px;display:flex;flex-direction:column;padding:16px 20px;gap:12px;">

        <!-- Cabeçalho -->
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span class="pui-title" style="font-size:12px;">CRIAR SEU JOGADOR</span>
          <span class="pui-subtitle">PASSO ${this.currentStep} DE 4</span>
        </div>

        <!-- Indicador de passos -->
        <div class="pui-steps">${stepsHTML}</div>

        <!-- Conteúdo do passo -->
        <div style="flex:1;overflow:hidden;">
          ${stepContent}
        </div>

        <!-- Mensagem de erro -->
        <div id="error-msg" style="min-height:20px;text-align:center;"></div>

        <!-- Navegação -->
        <div style="display:flex;justify-content:space-between;gap:12px;">
          <button class="pui-btn pui-btn-danger" id="btn-back"
            style="width:180px;height:50px;font-size:7px;">${backLabel}</button>
          <button class="pui-btn pui-btn-${nextVariant}" id="btn-next"
            style="width:180px;height:50px;font-size:7px;">${nextLabel}</button>
        </div>

      </div>`;

    this.domRoot = this.add.dom(500, 300).createFromHTML(html).setOrigin(0.5);

    // Eventos de clique
    this.domRoot.addListener('click');
    this.domRoot.on('click', (e) => {
      const t = e.target;
      if (t.closest('#btn-back'))  this._prevStep();
      if (t.closest('#btn-next'))  this._nextStep();
      if (t.closest('.pui-pos-btn'))   this._selectPosition(t.closest('.pui-pos-btn').dataset.pos);
      if (t.closest('.pui-team-card')) this._selectTeam(t.closest('.pui-team-card').dataset.team);
      if (t.closest('[data-league]')) this._selectLeague(t.closest('[data-league]').dataset.league);
      // Cabelo antes de pele: .pui-hair-btn também carrega a classe .pui-skin-btn
      // (reusa o estilo), então testar pele primeiro engoliria o clique.
      if (t.closest('.pui-hair-btn')) {
        this._selectHair(t.closest('.pui-hair-btn').dataset.color);
      } else if (t.closest('.pui-skin-btn')) {
        this._selectSkin(t.closest('.pui-skin-btn').dataset.color);
      }
    });

    // renderStep() reconstrói o DOM inteiro a cada clique, então o manequim é
    // repintado aqui — um ponto só, vale para pele e para cabelo.
    this.updatePlayerPreview();
  }

  // ── Conteúdo dos passos ───────────────────────────────────────────────────

  _buildStep1() {
    const positions = Object.keys(this.positionBases);
    const posCards = positions.map(pos => {
      const sel = pos === this.selectedPosition ? 'selected' : '';
      const d = this.positionBases[pos];
      return `
        <div class="pui-pos-btn ${sel}" data-pos="${pos}">
          <span class="pos-name">${pos.toUpperCase()}</span>
          <span class="pos-stats">${d.desc}</span>
        </div>`;
    }).join('');

    const nameVal = this.playerName ? `value="${this.playerName}"` : '';

    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;height:100%;">

        <!-- Nome -->
        <div class="pui-panel" style="height:100%;">
          <div class="pui-panel-header"><span class="pui-panel-title">QUEM É VOCÊ?</span></div>
          <div class="pui-panel-body" style="display:flex;flex-direction:column;gap:12px;padding-top:20px;">
            <label class="pui-subtitle" style="text-align:center;display:block;margin-bottom:4px;">
              NOME DO JOGADOR
            </label>
            <input id="player-name-input" class="pui-input"
              type="text" maxlength="20" placeholder="Digite seu nome..."
              ${nameVal}
              style="font-size:9px;" />
            <p class="pui-text-pixel pui-text-muted" style="font-size:5px;text-align:center;line-height:2;margin-top:8px;">
              Máximo de 20 caracteres.<br>Este nome aparecerá em toda a carreira.
            </p>
          </div>
        </div>

        <!-- Posição -->
        <div class="pui-panel" style="height:100%;">
          <div class="pui-panel-header"><span class="pui-panel-title">POSIÇÃO NO CAMPO</span></div>
          <div class="pui-panel-body" style="padding-top:16px;">
            <div class="pui-pos-grid">${posCards}</div>
          </div>
        </div>

      </div>`;
  }

  _buildStep2() {
    const tempCareer = new CareerMode("temp");
    // Ligas vêm do CareerMode (Brasil + as do LeaguesDB). Nada hardcoded aqui:
    // adicionar liga no LeaguesDB.js já a faz aparecer nesta tela.
    const ligas = Object.keys(tempCareer.leagues);
    const bandeiras = {
      Brasil: "🇧🇷",
      Inglaterra: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
      Espanha: "🇪🇸",
      Itália: "🇮🇹",
      Alemanha: "🇩🇪",
      França: "🇫🇷",
    };

    const cards = ligas
      .map((liga) => {
        const sel = liga === this.selectedLeague ? "selected" : "";
        const n = tempCareer.leagues[liga].length;
        return `
        <div class="pui-pos-btn ${sel}" data-league="${liga}">
          <span class="pos-name">${bandeiras[liga] || "🌍"} ${liga.toUpperCase()}</span>
          <span class="pos-stats">${n} clubes</span>
        </div>`;
      })
      .join("");

    return `
      <div class="pui-panel" style="height:100%;">
        <div class="pui-panel-header"><span class="pui-panel-title">ONDE VOCÊ VAI JOGAR?</span></div>
        <div class="pui-panel-body" style="height:calc(100% - 44px);overflow-y:auto;">
          <p class="pui-text-pixel pui-text-muted" style="font-size:6px;text-align:center;line-height:2.2;margin-bottom:12px;">
            Escolha a liga onde sua carreira começa.
          </p>
          <div class="pui-pos-grid">${cards}</div>
        </div>
      </div>`;
  }

  _selectLeague(liga) {
    if (!liga || liga === this.selectedLeague) return;
    this.selectedLeague = liga;
    this.selectedTeam = null; // time da liga antiga não vale mais
    this.renderStep();
  }

  _buildStep3() {
    const tempCareer = new CareerMode();
    const teams = (tempCareer.leagues && tempCareer.leagues[this.selectedLeague]) || [];

    const teamCards = teams.map(team => {
      const sel = this.selectedTeam && this.selectedTeam.name === team.name ? 'selected' : '';
      const color = team.shirtColor || '#3388ff';
      return `
        <div class="pui-team-card ${sel}" data-team="${team.name}">
          <div class="pui-team-shirt" style="background:${color};"></div>
          <span class="pui-team-name">${team.label || team.name}</span>
          <span class="pui-team-rating">${team.rating}</span>
        </div>`;
    }).join('');

    return `
      <div class="pui-panel" style="height:100%;">
        <div class="pui-panel-header">
          <span class="pui-panel-title">TIMES DA LIGA: ${this.selectedLeague.toUpperCase()}</span>
          ${this.selectedTeam
            ? `<span class="pui-badge pui-badge-blue" style="margin-left:auto;">${this.selectedTeam.label || this.selectedTeam.name}</span>`
            : ''}
        </div>
        <div class="pui-panel-body pui-scroll"
          style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;height:calc(100% - 44px);overflow-y:auto;">
          ${teamCards}
        </div>
      </div>`;
  }

  _buildStep4() {
    if (!this.selectedTeam) {
      return `<p class="pui-text-pixel pui-text-muted" style="text-align:center;padding-top:60px;">
        Selecione um time no passo anterior.</p>`;
    }

    const attrs = this.positionBases[this.selectedPosition];
    const teamColor = this.selectedTeam.shirtColor || '#3388ff';

    const skinBtns = this.skinColors.map(s => {
      const sel = s.hex === this.selectedSkinColor ? 'selected' : '';
      return `<div class="pui-skin-btn ${sel}" data-color="${s.hex}"
        style="background:${s.hex};" title="${s.label}"></div>`;
    }).join('');

    const hairBtns = this.hairColors.map(h => {
      const sel = h.hex === this.selectedHairColor ? 'selected' : '';
      return `<div class="pui-skin-btn pui-hair-btn ${sel}" data-color="${h.hex}"
        style="background:${h.hex};" title="${h.label}"></div>`;
    }).join('');

    const bars = [
      { label: 'VELOCIDADE', value: attrs.speed,     color: 'blue' },
      { label: 'CHUTE',      value: attrs.kickPower,  color: 'orange' },
      { label: 'RESISTÊNCIA',value: attrs.stamina,    color: 'green' },
    ].map(b => UIHelper.createDOMBar(b.label, b.value, 100, b.color)).join('');

    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;height:100%;">

        <!-- Aparência -->
        <div class="pui-panel" style="height:100%;">
          <div class="pui-panel-header"><span class="pui-panel-title">APARÊNCIA</span></div>
          <div class="pui-panel-body" style="display:flex;flex-direction:column;align-items:center;gap:16px;padding-top:20px;">

            <!-- Preview: o sprite REAL, repintado pelo mesmo motor da partida -->
            <div id="player-preview" style="
              width:${BASE_FRAME_SIZE}px;height:${BASE_FRAME_SIZE}px;
              transform:scale(2.6);transform-origin:top center;
              margin:6px auto ${BASE_FRAME_SIZE * 1.7}px;
              image-rendering:pixelated;"></div>

            <label class="pui-subtitle" style="display:block;text-align:center;">COR DE PELE</label>
            <div class="pui-skin-grid">${skinBtns}</div>

            <label class="pui-subtitle" style="display:block;text-align:center;">COR DE CABELO</label>
            <div class="pui-skin-grid">${hairBtns}</div>

          </div>
        </div>

        <!-- Resumo -->
        <div class="pui-panel" style="height:100%;">
          <div class="pui-panel-header"><span class="pui-panel-title">RESUMO DO ATLETA</span></div>
          <div class="pui-panel-body" style="display:flex;flex-direction:column;gap:12px;padding-top:16px;">

            <div style="text-align:center;">
              <div class="pui-text-pixel pui-text-white" style="font-size:10px;margin-bottom:4px;">
                ${this.playerName.toUpperCase() || 'SEU NOME'}
              </div>
              <div class="pui-badge pui-badge-gold" style="font-size:5px;">
                ${this.selectedPosition.toUpperCase()} &nbsp;|&nbsp; ${(this.selectedTeam.label || this.selectedTeam.name).toUpperCase()}
              </div>
            </div>

            <hr class="pui-divider" />

            <div style="display:flex;flex-direction:column;gap:10px;">
              ${bars}
            </div>

            <hr class="pui-divider" />

            <p class="pui-text-pixel pui-text-muted" style="font-size:5px;text-align:center;line-height:2;">
              Atributos crescem conforme você joga e treina.<br>
              Invista em pontos de skill para evoluir mais rápido!
            </p>

          </div>
        </div>

      </div>`;
  }

  // ── Lógica de navegação ───────────────────────────────────────────────────

  _selectPosition(pos) {
    if (!pos) return;
    this.selectedPosition = pos;
    this.renderStep();
  }

  _selectTeam(teamName) {
    if (!teamName) return;
    const tempCareer = new CareerMode();
    const teams = (tempCareer.leagues && tempCareer.leagues[this.selectedLeague]) || [];
    this.selectedTeam = teams.find(t => t.name === teamName) || null;
    this.renderStep();
  }

  _selectSkin(color) {
    if (!color) return;
    this.selectedSkinColor = color;
    this.renderStep();
  }

  _selectHair(color) {
    if (!color) return;
    this.selectedHairColor = color;
    this.renderStep();
  }

  /**
   * Repinta o manequim com a pele e o cabelo escolhidos, pelo MESMO
   * buildKitAtlas que a partida usa — o que se vê aqui é o que entra em campo.
   *
   * ponytail: o sprite é uma div com background-position em vez de um
   * Phaser.Sprite porque a UI é DOM e fica ACIMA do canvas: um sprite de Phaser
   * ficaria escondido atrás do painel. São os mesmos pixels da textura gerada.
   * Se a UI um dia virar canvas, trocar por this.add.sprite + setScale.
   */
  updatePlayerPreview() {
    const alvo = document.getElementById('player-preview');
    if (!alvo) return; // só existe no passo de aparência

    if (!this.textures.exists(`base_idle_${BASE_DIRS[0]}`)) return;

    const variant = {
      skin: parseInt(this.selectedSkinColor.replace('#', ''), 16),
      hair: parseInt(this.selectedHairColor.replace('#', ''), 16),
    };
    const key = this.buildKitAtlas(this, '__preview', variant);
    if (!key) return;

    const F = BASE_FRAME_SIZE;
    const linha = BASE_DIRS.indexOf('south'); // de frente para o jogador
    const url = this.textures.get(key).getSourceImage().toDataURL();

    alvo.style.backgroundImage = `url(${url})`;
    alvo.style.backgroundPosition = `-${F}px -${linha * F}px`;
    // Corrida de frente: colunas 1..4 da grade, em passos discretos.
    alvo.style.animation = `preview-run 0.55s steps(${BASE_RUN_FRAMES}) infinite`;

    if (!document.getElementById('preview-run-css')) {
      const st = document.createElement('style');
      st.id = 'preview-run-css';
      st.textContent = `@keyframes preview-run {
        from { background-position: -${F}px -${linha * F}px; }
        to   { background-position: -${F * (BASE_RUN_FRAMES + 1)}px -${linha * F}px; }
      }`;
      document.head.appendChild(st);
    }
  }

  _showError(msg) {
    const el = document.getElementById('error-msg');
    if (el) {
      el.innerHTML = `<span class="pui-text-pixel pui-text-red" style="font-size:6px;">${msg}</span>`;
      setTimeout(() => { if (el) el.innerHTML = ''; }, 2500);
    }
  }

  _nextStep() {
    // Validações
    if (this.currentStep === 1) {
      const nameInput = document.getElementById('player-name-input');
      const name = nameInput ? nameInput.value.trim() : this.playerName;
      if (!name) { this._showError('Digite o nome do jogador!'); return; }
      this.playerName = name;
    }
    if (this.currentStep === 3 && !this.selectedTeam) {
      this._showError('Escolha um time para continuar!'); return;
    }

    if (this.currentStep < 4) {
      this.currentStep++;
      this.renderStep();
    } else {
      this._startCareer();
    }
  }

  _prevStep() {
    if (this.currentStep > 1) {
      // Salvar nome antes de voltar
      if (this.currentStep === 1) {
        const nameInput = document.getElementById('player-name-input');
        if (nameInput) this.playerName = nameInput.value.trim();
      }
      this.currentStep--;
      this.renderStep();
    } else {
      this._cleanupAndGo("MenuScene");
    }
  }

  _startCareer() {
    // Converter hex de skin para inteiro
    const skinInt = parseInt(this.selectedSkinColor.replace('#', ''), 16);
    const hairInt = parseInt(this.selectedHairColor.replace('#', ''), 16);
    const attrs = this.positionBases[this.selectedPosition];
    window.careerMode = new CareerMode(this.playerName);
    window.careerMode.initializeCareer(this.playerName, this.selectedTeam.name, this.selectedLeague);
    window.careerMode.speed     = attrs.speed;
    window.careerMode.kickPower = attrs.kickPower;
    window.careerMode.stamina   = attrs.stamina;
    window.careerMode.position  = this.selectedPosition;
    window.careerMode.skinColor = skinInt;
    window.careerMode.hairColor = hairInt;
    window.careerMode.saveToLocalStorage();

    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this._cleanupAndGo("PreGameScene");
    });
  }

  _cleanupAndGo(sceneName) {
    if (this.domRoot) { this.domRoot.destroy(); this.domRoot = null; }
    this.scene.start(sceneName);
  }

  shutdown() {
    if (this.domRoot) { this.domRoot.destroy(); this.domRoot = null; }
  }
}
