// =============================================================================
// ExhibitionMatchScene.js — Modo Partida de Exibição
// =============================================================================

class ExhibitionMatchScene extends Phaser.Scene {
  constructor() {
    super("ExhibitionMatchScene");
  }

  create() {
    this.cameras.main.setBackgroundColor("#0a1f0a");

    // Team options
    this.teamOptions = Object.keys(REAL_ROSTERS);
    this.selectedHomeTeam = "Flamengo";
    this.selectedAwayTeam = "Palmeiras";
    this.selectedDuration = 5; // minutes
    this.selectedWeather = "clear";

    // Weather options
    this.weatherOptions = ["clear", "rain", "night"];

    // Create HTML UI
    const html = `
      <div class="pui-root pui-menu-root" style="width:1000px;height:600px;">
        <div class="pui-menu-logo pui-glow" style="margin-top:-20px;font-size:16px;">
          PARTIDA DE EXIBIÇÃO
        </div>

        <div style="display:flex;justify-content:space-between;gap:40px;margin-top:20px;">
          <!-- HOME TEAM -->
          <div style="flex:1;background:rgba(10,30,10,0.9);border:2px solid #2a7a2a;padding:20px;border-radius:8px;">
            <div style="color:#ffd700;font-size:8px;margin-bottom:15px;text-align:center;">
              MANDANTE
            </div>
            <select id="home-team-select" style="width:100%;height:40px;font-size:8px;background:#0a200a;border:1px solid #2a5a2a;color:#00ff88;padding:8px;">
              ${this.teamOptions.map(t => `<option value="${t}" ${t === this.selectedHomeTeam ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>

          <!-- AWAY TEAM -->
          <div style="flex:1;background:rgba(10,30,10,0.9);border:2px solid #2a7a2a;padding:20px;border-radius:8px;">
            <div style="color:#ffd700;font-size:8px;margin-bottom:15px;text-align:center;">
              VISITANTE
            </div>
            <select id="away-team-select" style="width:100%;height:40px;font-size:8px;background:#0a200a;border:1px solid #2a5a2a;color:#00ff88;padding:8px;">
              ${this.teamOptions.map(t => `<option value="${t}" ${t === this.selectedAwayTeam ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- SETTINGS -->
        <div style="display:flex;justify-content:space-between;gap:20px;margin-top:20px;">
          <div style="flex:1;background:rgba(10,30,10,0.9);border:2px solid #2a7a2a;padding:20px;border-radius:8px;">
            <div style="color:#ffd700;font-size:8px;margin-bottom:10px;text-align:center;">
              DURAÇÃO DA PARTIDA
            </div>
            <div style="display:flex;justify-content:center;gap:10px;">
              <button class="pui-btn pui-btn-secondary duration-btn" data-duration="3" style="width:70px;height:40px;">3 MIN</button>
              <button class="pui-btn pui-btn-primary duration-btn" data-duration="5" style="width:70px;height:40px;">5 MIN</button>
              <button class="pui-btn pui-btn-secondary duration-btn" data-duration="10" style="width:70px;height:40px;">10 MIN</button>
            </div>
          </div>

          <div style="flex:1;background:rgba(10,30,10,0.9);border:2px solid #2a7a2a;padding:20px;border-radius:8px;">
            <div style="color:#ffd700;font-size:8px;margin-bottom:10px;text-align:center;">
              CLIMA
            </div>
            <div style="display:flex;justify-content:center;gap:10px;">
              <button class="pui-btn pui-btn-primary weather-btn" data-weather="clear" style="width:70px;height:40px;">LIMPINHO</button>
              <button class="pui-btn pui-btn-secondary weather-btn" data-weather="rain" style="width:70px;height:40px;">CHUVA</button>
              <button class="pui-btn pui-btn-secondary weather-btn" data-weather="night" style="width:70px;height:40px;">NOITE</button>
            </div>
          </div>
        </div>

        <!-- BUTTONS -->
        <div class="pui-menu-buttons" style="margin-top:30px;">
          <button class="pui-btn pui-btn-green" id="btn-start-exhibition" style="width:100%;height:60px;font-size:9px;">
            ▶ &nbsp; INICIAR PARTIDA
          </button>
          <button class="pui-btn pui-btn-secondary" id="btn-back-menu" style="width:100%;height:50px;font-size:8px;">
            ← &nbsp; VOLTAR AO MENU PRINCIPAL
          </button>
        </div>
      </div>
    `;

    const menuDOM = this.add.dom(500, 300).createFromHTML(html).setOrigin(0.5);
    this.menuDOM = menuDOM;

    // Add event listeners
    menuDOM.addListener('click');
    menuDOM.addListener('change');
    menuDOM.on('click', (event) => this.handleClick(event));
    menuDOM.on('change', (event) => this.handleChange(event));

    // Fade in
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  handleClick(event) {
    const id = event.target.id || event.target.closest('[id]')?.id;
    const durationBtn = event.target.closest('.duration-btn');
    const weatherBtn = event.target.closest('.weather-btn');

    if (durationBtn) {
      this.selectedDuration = parseInt(durationBtn.dataset.duration);
      this.updateDurationButtons();
      return;
    }

    if (weatherBtn) {
      this.selectedWeather = weatherBtn.dataset.weather;
      this.updateWeatherButtons();
      return;
    }

    if (id === 'btn-start-exhibition' || event.target.closest('#btn-start-exhibition')) {
      this.startExhibitionMatch();
      return;
    }

    if (id === 'btn-back-menu' || event.target.closest('#btn-back-menu')) {
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start("MenuScene");
      });
    }
  }

  handleChange(event) {
    if (event.target.id === 'home-team-select') {
      this.selectedHomeTeam = event.target.value;
    } else if (event.target.id === 'away-team-select') {
      this.selectedAwayTeam = event.target.value;
    }
  }

  updateDurationButtons() {
    const buttons = this.menuDOM.node.querySelectorAll('.duration-btn');
    buttons.forEach(btn => {
      if (parseInt(btn.dataset.duration) === this.selectedDuration) {
        btn.classList.remove('pui-btn-secondary');
        btn.classList.add('pui-btn-primary');
      } else {
        btn.classList.remove('pui-btn-primary');
        btn.classList.add('pui-btn-secondary');
      }
    });
  }

  updateWeatherButtons() {
    const buttons = this.menuDOM.node.querySelectorAll('.weather-btn');
    buttons.forEach(btn => {
      if (btn.dataset.weather === this.selectedWeather) {
        btn.classList.remove('pui-btn-secondary');
        btn.classList.add('pui-btn-primary');
      } else {
        btn.classList.remove('pui-btn-primary');
        btn.classList.add('pui-btn-secondary');
      }
    });
  }

  startExhibitionMatch() {
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start("GameScene", {
        isExhibition: true,
        homeTeam: this.selectedHomeTeam,
        awayTeam: this.selectedAwayTeam,
        duration: this.selectedDuration,
        weather: this.selectedWeather
      });
    });
  }
}
