// =============================================================================
// PlayerProfileScene.js — v5.0 (UI Retro-Moderno Pixel Art via DOM)
// =============================================================================

class PlayerProfileScene extends Phaser.Scene {
  constructor() {
    super("PlayerProfileScene");
  }

  create() {
    this.cameras.main.setBackgroundColor("#080f08");
    const career = window.careerMode;

    // Fundo decorativo
    const bg = this.add.graphics();
    bg.lineStyle(1, 0x1a3a1a, 0.25);
    bg.strokeRect(10, 10, 980, 580);
    bg.strokeCircle(500, 300, 250);

    this._buildUI(career);
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  _buildUI(career) {
    if (this.mainDOM) { this.mainDOM.destroy(); this.mainDOM = null; }

    const bodyColor = career.currentTeam
      ? (career.currentTeam.shirtColor || '#3388ff')
      : '#3388ff';
    const skinHex = career.skinColor
      ? '#' + career.skinColor.toString(16).padStart(6, '0')
      : '#ffdbac';

    // ── Atributos ──────────────────────────────────────────────────────────
    const attrs = [
      { label: 'VELOCIDADE', value: career.speed,     color: 'blue' },
      { label: 'CHUTE',      value: career.kickPower,  color: 'orange' },
      { label: 'RESISTÊNCIA',value: career.stamina,    color: 'green' },
    ].map(a => UIHelper.createDOMBar(a.label, a.value, 100, a.color)).join('');

    // ── Skill Tree ─────────────────────────────────────────────────────────
    const skillList = [
      { id: 'sprintMaster', name: 'SPRINT MASTER', icon: '⚡', desc: '+2 Velocidade por nível', maxLv: 5 },
      { id: 'powerShot',    name: 'CHUTE POTENTE', icon: '💥', desc: '+2 Força de Chute por nível', maxLv: 5 },
      { id: 'tireless',     name: 'INCANSÁVEL',    icon: '🔋', desc: '+5 Resistência por nível', maxLv: 5 },
      { id: 'curveBall',    name: 'BOLA CURVA',    icon: '🌀', desc: 'Mais efeito no arrasto + força no chute com curva', maxLv: CURVE_SKILL.MAX_LEVEL },
    ];

    const skillCards = skillList.map(skill => {
      const lv    = career.skills[skill.id] || 0;
      const stars = Array.from({ length: skill.maxLv }, (_, i) =>
        `<div class="pui-skill-star ${i < lv ? 'filled' : ''}"></div>`
      ).join('');

      const effectMap = {
        sprintMaster: lv => `Vel +${lv * 2}`,
        powerShot:    lv => `Chute +${lv * 2}`,
        tireless:     lv => `Resist +${lv * 5}`,
        curveBall:    lv => `Curva ${CURVE_SKILL.MAX_CURVE_BASE + lv * CURVE_SKILL.MAX_CURVE_PER_LEVEL} · Força +${Math.round(lv * CURVE_SKILL.SPEED_BONUS_PER_LEVEL * 100)}%`,
      };
      const effectText = lv > 0 ? effectMap[skill.id](lv) : '—';
      const effectClass = lv > 0 ? 'pui-text-green' : 'pui-text-muted';

      const canUpgrade = career.skillPoints > 0 && lv < skill.maxLv;
      const isMax      = lv >= skill.maxLv;

      return `
        <div class="pui-skill-card ${lv > 0 ? 'unlocked' : ''}">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
            <div style="flex:1;">
              <div class="pui-text-pixel pui-text-white" style="font-size:7px;margin-bottom:4px;">
                ${skill.icon} ${skill.name}
              </div>
              <div class="pui-text-pixel pui-text-muted" style="font-size:5px;line-height:2;margin-bottom:6px;">
                ${skill.desc}
              </div>
              <div class="pui-skill-stars">${stars}</div>
              <div class="pui-text-pixel ${effectClass}" style="font-size:6px;margin-top:4px;">
                ${effectText}
              </div>
            </div>
            <div style="flex-shrink:0;">
              ${canUpgrade
                ? `<button class="pui-btn pui-btn-primary skill-upgrade-btn" data-skill="${skill.id}"
                    style="width:90px;height:40px;font-size:5px;white-space:normal;">
                    MELHORAR
                  </button>`
                : isMax
                  ? `<span class="pui-badge pui-badge-gold" style="font-size:5px;">MÁXIMO</span>`
                  : `<span class="pui-badge" style="font-size:5px;color:#444;border-color:#333;">BLOQUEADO</span>`
              }
            </div>
          </div>
        </div>`;
    }).join('');

    // ── Troféus ────────────────────────────────────────────────────────────
    let trophiesHTML = '';
    if (career.trophies && career.trophies.length > 0) {
      trophiesHTML = career.trophies.map(t => `
        <div class="pui-trophy-card">
          <div class="pui-trophy-icon">🏆</div>
          <div>
            <div class="pui-trophy-title">${(t.title || t.league || 'Título').toUpperCase()}</div>
            <div class="pui-trophy-season">Temporada ${t.season}</div>
          </div>
        </div>`).join('');
    } else {
      trophiesHTML = `
        <div style="text-align:center;padding:30px 0;">
          <div style="font-size:32px;margin-bottom:10px;">🏅</div>
          <p class="pui-text-pixel pui-text-muted" style="font-size:6px;line-height:2;">
            Nenhum título ainda.<br>Vença uma liga para<br>ganhar seu primeiro troféu!
          </p>
        </div>`;
    }

    const condColor = career.condition >= 80 ? 'pui-text-green'
      : career.condition >= 50 ? 'pui-text-gold' : 'pui-text-red';

    const html = `
    <div class="pui-root" style="width:1000px;height:600px;display:flex;flex-direction:column;">

      <!-- TOP BAR -->
      <div class="pui-topbar">
        <div class="pui-topbar-left">
          <span class="pui-player-name">PERFIL DO ATLETA</span>
          <span class="pui-player-info">
            ${career.playerName.toUpperCase()} &nbsp;—&nbsp;
            ${career.position || 'Meia'} &nbsp;—&nbsp;
            ${career.currentTeam ? career.currentTeam.name : ''} &nbsp;—&nbsp;
            ${career.currentLeague || 'Brasil'}
          </span>
        </div>
        <div class="pui-topbar-right">
          <span class="pui-date-text">Nível ${career.level}</span>
          <span class="pui-season-text">Temporada ${career.season}</span>
        </div>
      </div>

      <!-- CORPO: 3 colunas -->
      <div style="flex:1;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:10px;overflow:hidden;">

        <!-- COLUNA 1: Atributos + Stats -->
        <div class="pui-panel" style="height:100%;overflow:hidden;">
          <div class="pui-panel-header"><span class="pui-panel-title">ATRIBUTOS</span></div>
          <div class="pui-panel-body pui-scroll" style="height:calc(100% - 44px);overflow-y:auto;display:flex;flex-direction:column;gap:10px;">

            <!-- Avatar SVG -->
            <div style="text-align:center;padding:10px 0;">
              <svg width="70" height="90" viewBox="0 0 70 90" style="image-rendering:pixelated;">
                <rect x="15" y="35" width="40" height="40" fill="${bodyColor}" />
                <rect x="22" y="10" width="26" height="24" fill="${skinHex}" />
                <rect x="27" y="18" width="4" height="4" fill="#000" />
                <rect x="39" y="18" width="4" height="4" fill="#000" />
                <rect x="16" y="75" width="14" height="14" fill="#111" />
                <rect x="40" y="75" width="14" height="14" fill="#111" />
              </svg>
              <div class="pui-text-pixel pui-text-gold" style="font-size:9px;margin-top:4px;">
                Nível ${career.level}
              </div>
            </div>

            ${UIHelper.createDOMBar(`XP: ${career.xp}/100`, career.xp, 100, 'yellow')}

            <hr class="pui-divider" />

            ${attrs}

            <hr class="pui-divider" />

            <div class="pui-text-pixel pui-text-gold" style="font-size:6px;margin-bottom:4px;">
              ESTATÍSTICAS DA TEMPORADA
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
              <div class="pui-stat-card">
                <div class="pui-stat-label">GOLS</div>
                <div class="pui-stat-value pui-text-gold" style="font-size:14px;">${career.playerStats.goals}</div>
              </div>
              <div class="pui-stat-card">
                <div class="pui-stat-label">ASSIST</div>
                <div class="pui-stat-value" style="font-size:14px;color:#00ffff;">${career.playerStats.assists}</div>
              </div>
              <div class="pui-stat-card">
                <div class="pui-stat-label">JOGOS</div>
                <div class="pui-stat-value pui-text-blue" style="font-size:14px;">${career.playerStats.matches}</div>
              </div>
            </div>

            <div class="pui-text-pixel ${condColor}" style="font-size:6px;text-align:center;">
              CONDIÇÃO: ${career.condition}%
            </div>

          </div>
        </div>

        <!-- COLUNA 2: Skill Tree -->
        <div class="pui-panel" style="height:100%;overflow:hidden;">
          <div class="pui-panel-header">
            <span class="pui-panel-title">HABILIDADES</span>
            <span class="pui-badge ${career.skillPoints > 0 ? 'pui-badge-gold' : ''}"
              style="margin-left:auto;font-size:5px;">
              ${career.skillPoints} pt${career.skillPoints !== 1 ? 's' : ''} disponível
            </span>
          </div>
          <div class="pui-panel-body pui-scroll" style="height:calc(100% - 44px);overflow-y:auto;display:flex;flex-direction:column;gap:8px;">
            ${skillCards}
          </div>
        </div>

        <!-- COLUNA 3: Troféus -->
        <div class="pui-panel" style="height:100%;overflow:hidden;">
          <div class="pui-panel-header"><span class="pui-panel-title">CONQUISTAS</span></div>
          <div class="pui-panel-body pui-scroll" style="height:calc(100% - 44px);overflow-y:auto;display:flex;flex-direction:column;gap:8px;">
            ${trophiesHTML}
            <div class="pui-text-pixel pui-text-muted" style="font-size:5px;text-align:center;margin-top:auto;padding-top:8px;">
              Temporada atual: ${career.season}
            </div>
          </div>
        </div>

      </div>

      <!-- BOTÃO VOLTAR -->
      <div style="display:flex;justify-content:center;padding:8px;background:#080f08;border-top:2px solid #1a3a1a;">
        <button class="pui-btn pui-btn-dark" id="btn-back"
          style="width:200px;height:44px;font-size:7px;">
          ◀ VOLTAR
        </button>
      </div>

    </div>`;

    this.mainDOM = this.add.dom(500, 300).createFromHTML(html).setOrigin(0.5);

    this.mainDOM.addListener('click');
    this.mainDOM.on('click', (e) => {
      if (e.target.closest('#btn-back')) {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start("PreGameScene"));
        return;
      }

      const upgradeBtn = e.target.closest('.skill-upgrade-btn');
      if (upgradeBtn) {
        const skillId = upgradeBtn.dataset.skill;
        career.skillPoints--;
        career.skills[skillId] = (career.skills[skillId] || 0) + 1;
        if (skillId === 'sprintMaster') career.speed     = Math.min(100, career.speed + 2);
        if (skillId === 'powerShot')    career.kickPower = Math.min(100, career.kickPower + 2);
        if (skillId === 'tireless')     career.stamina   = Math.min(100, career.stamina + 5);
        career.saveToLocalStorage();
        this._buildUI(career);
      }
    });
  }

  shutdown() {
    if (this.mainDOM) { this.mainDOM.destroy(); this.mainDOM = null; }
  }
}
