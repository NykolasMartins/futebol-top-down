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
    // Degraus MENORES e em MAIOR número: o total continua parecido, mas a
    // subida passa a ter passos — com 5 níveis de +2/+5, dois pontos de skill
    // já resolviam metade da árvore. Ganho e teto num lugar só (`SKILL_ATTR`
    // em constants.js): antes o número aparecia no texto E no clique, e mudar
    // um sem o outro fazia a tela mentir.
    const skillList = [
      { id: 'sprintMaster', name: 'SPRINT MASTER', icon: '⚡', desc: `+${SKILL_ATTR.sprintMaster.ganho} Velocidade por nível`, maxLv: SKILL_ATTR.sprintMaster.max },
      { id: 'powerShot',    name: 'CHUTE POTENTE', icon: '💥', desc: `+${SKILL_ATTR.powerShot.ganho} Força de Chute por nível`, maxLv: SKILL_ATTR.powerShot.max },
      { id: 'tireless',     name: 'INCANSÁVEL',    icon: '🔋', desc: `+${SKILL_ATTR.tireless.ganho} Resistência por nível`, maxLv: SKILL_ATTR.tireless.max },
      { id: 'curveBall',    name: 'BOLA CURVA',    icon: '🌀', desc: 'Mais efeito no arrasto + força no chute com curva', maxLv: CURVE_SKILL.MAX_LEVEL },
    ];

    const skillCards = skillList.map(skill => {
      const lv    = career.skills[skill.id] || 0;
      const stars = Array.from({ length: skill.maxLv }, (_, i) =>
        `<div class="pui-skill-star ${i < lv ? 'filled' : ''}"></div>`
      ).join('');

      const effectMap = {
        sprintMaster: lv => `Vel +${lv * SKILL_ATTR.sprintMaster.ganho}`,
        powerShot:    lv => `Chute +${lv * SKILL_ATTR.powerShot.ganho}`,
        tireless:     lv => `Resist +${lv * SKILL_ATTR.tireless.ganho}`,
        curveBall:    lv => `Curva ${CURVE_SKILL.MAX_CURVE_BASE + lv * CURVE_SKILL.MAX_CURVE_PER_LEVEL} · Força +${Math.round(lv * CURVE_SKILL.SPEED_BONUS_PER_LEVEL * 100)}%`,
      };
      const effectText = lv > 0 ? effectMap[skill.id](lv) : '—';
      const effectClass = lv > 0 ? 'pui-text-green' : 'pui-text-muted';

      const canUpgrade = career.skillPoints > 0 && lv < skill.maxLv;
      const isMax      = lv >= skill.maxLv;

      // O layout é do CSS (`.pui-skill-card` é grid): aqui só entram os dois
      // lados. Antes o botão vinha com 90px cravados no HTML e escapava do
      // card na coluna estreita.
      return `
        <div class="pui-skill-card ${lv > 0 ? 'unlocked' : ''}">
          <div class="pui-skill-info">
            <div class="pui-text-pixel pui-text-white" style="font-size:7px;margin-bottom:4px;">
              ${skill.icon} ${skill.name} <span class="${effectClass}" style="font-size:5px;">${lv}/${skill.maxLv}</span>
            </div>
            <div class="pui-text-pixel pui-text-muted" style="font-size:5px;line-height:1.9;margin-bottom:6px;">
              ${skill.desc}
            </div>
            <div class="pui-skill-stars">${stars}</div>
            <div class="pui-text-pixel ${effectClass}" style="font-size:6px;margin-top:6px;">
              ${effectText}
            </div>
          </div>
          <div class="pui-skill-acao">
            ${canUpgrade
              ? `<button class="pui-btn pui-btn-primary skill-upgrade-btn" data-skill="${skill.id}">MELHORAR</button>`
              : isMax
                ? `<span class="pui-badge pui-badge-gold" style="font-size:5px;">MÁXIMO</span>`
                : `<span class="pui-badge" style="font-size:5px;color:#444;border-color:#333;">SEM PONTO</span>`
            }
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

    // ── Seleção, prêmios e história ────────────────────────────────────────
    // Tudo dentro da coluna que JÁ rola (`pui-scroll`): nenhum modal novo,
    // nenhum handler novo. O que falta a esta tela é memória, não navegação.
    const nac = career.national || { caps: 0, goals: 0 };
    const selecaoHTML = nac.caps > 0 ? `
      <div class="pui-trophy-card">
        <div class="pui-trophy-icon">📣</div>
        <div>
          <div class="pui-trophy-title">${nac.caps} JOGOS &nbsp;·&nbsp; ${nac.goals} GOLS</div>
          <div class="pui-trophy-season">${nac.called ? 'Convocado nesta temporada' : 'Fora da última convocação'}</div>
        </div>
      </div>` : '';

    const premios = career.awards || [];
    const premiosHTML = premios.length ? `
      ${premios.slice().reverse().map(a => `
        <div class="pui-trophy-card">
          <div class="pui-trophy-icon">🏅</div>
          <div>
            <div class="pui-trophy-title">${a.title.toUpperCase()}</div>
            <div class="pui-trophy-season">Temporada ${a.season}</div>
          </div>
        </div>`).join('')}` : '';

    const hist = career.history || [];
    const historicoHTML = hist.length ? `
      <table class="pui-table" style="font-size:5px;width:100%;">
        <thead><tr><th>ANO</th><th>CLUBE</th><th>J</th><th>G</th><th>A</th><th>NOTA</th></tr></thead>
        <tbody>
          ${hist.slice().reverse().map(h => `
            <tr>
              <td>${h.season}</td>
              <td>${CareerMode.clubLabel(h.club)}</td>
              <td>${h.matches}</td>
              <td>${h.goals}</td>
              <td>${h.assists}</td>
              <td>${h.overall}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : '';

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
          <span class="pui-date-text">${career.age} anos &nbsp;·&nbsp; Nível ${career.level}</span>
          <span class="pui-season-text">
            Temporada ${career.season} &nbsp;·&nbsp;
            ${career.contractYears > 0
              ? `contrato: ${career.contractYears} ${career.contractYears === 1 ? 'ano' : 'anos'}`
              : 'SEM CONTRATO'}
          </span>
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

            ${UIHelper.createDOMBar(`XP — PRÓXIMO NÍVEL`, career.xp, career.xpParaSubir(), 'yellow')}

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
          <div class="pui-abas">
            <button class="pui-aba ativa" data-aba="conquistas">TÍTULOS</button>
            <button class="pui-aba" data-aba="premios">PRÊMIOS</button>
            <button class="pui-aba" data-aba="historico">HISTÓRICO</button>
          </div>
          <div class="pui-panel-body pui-scroll" style="height:calc(100% - 78px);overflow-y:auto;display:flex;flex-direction:column;gap:8px;">
            <!-- Tudo renderizado; a aba só mostra um bloco por vez. Trocar de
                 aba não reconstrói a tela — é só classe. -->
            <div data-painel="conquistas" style="display:flex;flex-direction:column;gap:8px;">
              ${selecaoHTML}
              ${trophiesHTML}
            </div>
            <div data-painel="premios" style="display:none;flex-direction:column;gap:8px;">
              ${premiosHTML || '<p class="pui-text-pixel pui-text-muted" style="font-size:6px;text-align:center;padding:24px 0;line-height:2;">Nenhum prêmio individual<br>ainda.</p>'}
            </div>
            <div data-painel="historico" style="display:none;flex-direction:column;gap:8px;">
              ${historicoHTML || '<p class="pui-text-pixel pui-text-muted" style="font-size:6px;text-align:center;padding:24px 0;line-height:2;">A primeira temporada<br>ainda não fechou.</p>'}
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

      const aba = e.target.closest('[data-aba]');
      if (aba) {
        const alvo = aba.dataset.aba;
        this.mainDOM.node.querySelectorAll('[data-aba]').forEach(b =>
          b.classList.toggle('ativa', b === aba));
        this.mainDOM.node.querySelectorAll('[data-painel]').forEach(p => {
          p.style.display = p.dataset.painel === alvo ? 'flex' : 'none';
        });
        return;
      }

      const upgradeBtn = e.target.closest('.skill-upgrade-btn');
      if (upgradeBtn) {
        const skillId = upgradeBtn.dataset.skill;
        career.skillPoints--;
        career.skills[skillId] = (career.skills[skillId] || 0) + 1;
        // Mesma tabela que desenhou o texto: um ganho, um lugar.
        const efeito = SKILL_ATTR[skillId];
        if (efeito)
          career[efeito.atributo] = Math.min(100, career[efeito.atributo] + efeito.ganho);
        career.saveToLocalStorage();
        this._buildUI(career);
      }
    });
  }

  shutdown() {
    if (this.mainDOM) { this.mainDOM.destroy(); this.mainDOM = null; }
  }
}
