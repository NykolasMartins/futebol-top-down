// Render do mundo (campo, arquibancadas, gols, minimapa) extraído de GameScene.js.
// Mixin de prototype: `this` continua sendo a própria cena, nenhuma chamada muda.
// DEVE ser carregado DEPOIS de GameScene.js no index.html.

if (typeof GameScene === "undefined") {
  throw new Error(
    "GameScene.render.js carregado antes de GameScene.js — corrija a ordem dos <script> no index.html",
  );
}

// ponytail: Object.assign deixa os métodos enumeráveis no prototype (métodos de
// classe não são). Trocar por Object.defineProperties se algum for...in sobre a
// cena passar a enxergar coisa demais.
Object.assign(GameScene.prototype, {
  createMinimap() {
    const margin = 20;
    const mapWidth = 120;
    const mapHeight = 84; // Proporcional a 2000x1400
    const x = this.cameras.main.width - mapWidth - margin;
    const y = this.cameras.main.height - mapHeight - margin;

    // Fundo translúcido
    this.minimapBg = this.add.graphics();
    this.minimapBg.fillStyle(0x000000, 0.4);
    this.minimapBg.fillRoundedRect(x, y, mapWidth, mapHeight, 8);
    this.minimapBg.lineStyle(2, 0xffffff, 0.3);
    this.minimapBg.strokeRoundedRect(x, y, mapWidth, mapHeight, 8);
    this.minimapBg.setDepth(1000);

    // Linhas do campo no minimapa
    this.minimapBg.lineStyle(1, 0xffffff, 0.2);
    this.minimapBg.lineBetween(
      x + mapWidth / 2,
      y,
      x + mapWidth / 2,
      y + mapHeight,
    ); // Meio campo
    this.minimapBg.strokeCircle(x + mapWidth / 2, y + mapHeight / 2, 20); // Círculo central

    // Gráficos para os pontos
    this.minimapDots = this.add.graphics();
    this.minimapDots.setDepth(1001);

    this.minimapConfig = { x, y, width: mapWidth, height: mapHeight };
  },

  updateMinimap() {
    if (!this.minimapDots) return;
    this.minimapDots.clear();
    const cfg = this.minimapConfig;
    const COURT_W = WORLD_WIDTH;
    const COURT_H = WORLD_HEIGHT;

    const drawDot = (worldX, worldY, color, size = 3) => {
      const dotX = cfg.x + (worldX / COURT_W) * cfg.width;
      const dotY = cfg.y + (worldY / COURT_H) * cfg.height;
      this.minimapDots.fillStyle(color, 1);
      this.minimapDots.fillCircle(dotX, dotY, size);
    };

    // Gramado no minimapa (retângulo cinza claro para destacar do fundo)
    const pitchMinX = cfg.x + (PITCH_X / WORLD_WIDTH) * cfg.width;
    const pitchMinY = cfg.y + (PITCH_Y / WORLD_HEIGHT) * cfg.height;
    const pitchW = (PITCH_WIDTH / WORLD_WIDTH) * cfg.width;
    const pitchH = (PITCH_HEIGHT / WORLD_HEIGHT) * cfg.height;
    this.minimapDots.lineStyle(1, 0xffffff, 0.3);
    this.minimapDots.strokeRect(pitchMinX, pitchMinY, pitchW, pitchH);

    // Aliados (Verde)
    this.allies.forEach((p) => drawDot(p.x, p.y, 0x00ff00));
    if (this.gkBottom) drawDot(this.gkBottom.x, this.gkBottom.y, 0x00ff00);

    // Inimigos (Vermelho)
    this.enemies.forEach((p) => drawDot(p.x, p.y, 0xff0000));
    if (this.gkTop) drawDot(this.gkTop.x, this.gkTop.y, 0xff0000);

    // Jogador (Amarelo)
    if (this.player) drawDot(this.player.x, this.player.y, 0xffff00, 4);

    // Bola (Branco)
    if (this.ball) drawDot(this.ball.x, this.ball.y, 0xffffff, 3);
  },

  drawPitch(pitchWidth, pitchHeight) {
    // Dois Graphics de propósito: o ruído da grama precisa entrar ENTRE o
    // gramado e a pintura. Com tudo num objeto só não existe depth que faça
    // isso — o tileSprite ficaria ou sob as listras ou sobre as linhas.
    // Camadas: gramado 0 · ruído 1 · derrapagens 2 · linhas brancas 3.
    this.pitchGraphics = this.add.graphics().setDepth(0); // terra
    this.pitchLines = this.add.graphics().setDepth(3); // pintura
    const graphics = this.pitchGraphics;
    const lines = this.pitchLines;
    const centerX = PITCH_X + pitchWidth / 2;
    const centerY = PITCH_Y + pitchHeight / 2;

    // Gramado listrado: faixas VERTICAIS ao longo do X (campo deitado), como
    // o corte do cortador indo e voltando entre as duas linhas de gol.
    const stripes = 10;
    const stripeW = pitchWidth / stripes;
    for (let i = 0; i < stripes; i++) {
      graphics.fillStyle(i % 2 === 0 ? 0x2d8c3c : 0x2f9641, 1);
      graphics.fillRect(
        PITCH_X + i * stripeW,
        PITCH_Y,
        // A última faixa fecha na borda exata: stripeW fracionário deixaria
        // uma fresta de fundo aparecendo no canto direito.
        i === stripes - 1 ? pitchWidth - i * stripeW : stripeW,
        pitchHeight,
      );
    }

    // Desgaste: onde a grama morre primeiro — meio de campo e as duas áreas.
    // Sem blur no Graphics, então elipses concêntricas fazem a borda suave.
    const wear = (cx, cy, w, h) => {
      for (let i = 4; i >= 1; i--) {
        graphics.fillStyle(0x6b5a3a, 0.035);
        graphics.fillEllipse(cx, cy, w * (i / 4), h * (i / 4));
      }
    };
    wear(centerX, centerY, 300, 220); // círculo central
    wear(PITCH_X + GK_AREA_HEIGHT * 0.55, centerY, 320, GOAL_WIDTH * 1.5);
    wear(
      PITCH_X + pitchWidth - GK_AREA_HEIGHT * 0.55,
      centerY,
      320,
      GOAL_WIDTH * 1.5,
    );

    lines.lineStyle(4, 0xffffff, 0.8);

    // Linhas externas
    lines.strokeRect(PITCH_X, PITCH_Y, pitchWidth, pitchHeight);

    // Linha de meio campo
    lines.beginPath();
    lines.moveTo(centerX, PITCH_Y);
    lines.lineTo(centerX, PITCH_Y + pitchHeight);
    lines.strokePath();

    // Círculo central
    lines.strokeCircle(centerX, centerY, 80);
    lines.fillStyle(0xffffff, 0.8);
    lines.fillCircle(centerX, centerY, 6);

    // Áreas do Goleiro
    const gkAreaY = centerY - GK_AREA_WIDTH / 2;
    lines.strokeRect(PITCH_X, gkAreaY, GK_AREA_HEIGHT, GK_AREA_WIDTH);
    lines.strokeRect(PITCH_X + pitchWidth - GK_AREA_HEIGHT, gkAreaY, GK_AREA_HEIGHT, GK_AREA_WIDTH);

    // Marca do pênalti
    lines.fillStyle(0xffffff, 0.8);
    lines.fillCircle(PITCH_X + GK_AREA_HEIGHT - 60, centerY, 5);
    lines.fillCircle(PITCH_X + pitchWidth - GK_AREA_HEIGHT + 60, centerY, 5);

    // Marcações do Gol Recuado (Linha de fundo lógica)
    lines.lineStyle(2, 0xffffff, 0.5);
    // Linha de gol esquerda
    lines.lineBetween(
      PITCH_X + GOAL_LINE_OFFSET,
      centerY - GOAL_WIDTH / 2,
      PITCH_X + GOAL_LINE_OFFSET,
      centerY + GOAL_WIDTH / 2,
    );
    // Linha de gol direita
    lines.lineBetween(
      PITCH_X + pitchWidth - GOAL_LINE_OFFSET,
      centerY - GOAL_WIDTH / 2,
      PITCH_X + pitchWidth - GOAL_LINE_OFFSET,
      centerY + GOAL_WIDTH / 2,
    );

    this.createGrassNoise();
  },

  /**
   * Ruído de grama gerado em runtime: pontinhos e riscos num Graphics
   * descartável viram uma textura 256x256 que se repete pelo campo inteiro.
   * Nenhum asset externo e nenhum custo por frame — no fim é um tileSprite só.
   */
  createGrassNoise() {
    // A textura é global do jogo: gera uma vez, sobrevive a restart de cena.
    if (!this.textures.exists("grass_noise")) {
      const canvas = this.textures.createCanvas("grass_noise", 256, 256);
      const ctx = canvas.getContext();
      const img = ctx.createImageData(256, 256);
      const d = img.data;

      // Ruído de 1 pixel, o mais alta frequência possível em 256x256.
      // Sob MULTIPLY o valor do pixel vira um FATOR: 255 não mexe no que está
      // embaixo, quanto mais escuro mais escurece. Por isso o granulado é feito
      // de luminância, e não de preto com alpha — alpha por pixel sob MULTIPLY
      // dá resultado imprevisível entre WebGL e Canvas.
      for (let i = 0; i < d.length; i += 4) {
        const n = Math.random();
        let rr, gg, bb;
        if (n < 0.5) {
          // maioria quase neutra: preserva a listra por baixo
          const v = 226 + Math.random() * 29;
          rr = v - 12;
          gg = v;
          bb = v - 16;
        } else if (n < 0.85) {
          // verde-limão: puxa o brilho para o verde, apaga um pouco R e B
          rr = 150 + Math.random() * 30;
          gg = 205 + Math.random() * 35;
          bb = 120 + Math.random() * 30;
        } else {
          // verde-escuro/preto: a mancha de alto contraste do musgo
          const v = 70 + Math.random() * 55;
          rr = v * 0.7;
          gg = v;
          bb = v * 0.6;
        }
        d[i] = rr;
        d[i + 1] = gg;
        d[i + 2] = bb;
        d[i + 3] = 255;
      }

      ctx.putImageData(img, 0, 0);
      canvas.refresh(); // sem isso o WebGL não sobe a textura
    }

    this.grassNoise = this.add
      .tileSprite(PITCH_X, PITCH_Y, PITCH_WIDTH, PITCH_HEIGHT, "grass_noise")
      .setOrigin(0, 0)
      .setAlpha(0.4)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(1); // sobre o gramado (0), sob derrapagens (2) e linhas (3)
  },

  /**
   * Carrega os 80 PNGs soltos da arte base. Qualquer cena que vá gerar textura
   * de jogador chama isto no preload — a partida e a criação de personagem.
   * Idempotente: Phaser ignora chave já existente, então rodar duas vezes é
   * de graça na segunda.
   */
  loadBaseSprites() {
    BASE_DIRS.forEach((dir) => {
      this.load.image(
        `base_idle_${dir}`,
        `${BASE_SPRITE_PATH}/rotations/${dir}.png`,
      );
      for (let i = 0; i < BASE_RUN_FRAMES; i++) {
        this.load.image(
          `base_run_${dir}_${i}`,
          `${BASE_SPRITE_PATH}/animations/Running/${dir}/frame_00${i}.png`,
        );
      }
      for (let i = 0; i < BASE_KICK_FRAMES; i++) {
        // Frame que a arte não exportou nem é pedido: o 404 só sujava a rede.
        if ((BASE_KICK_MISSING[dir] || []).includes(i)) continue;
        this.load.image(
          `base_kick_${dir}_${i}`,
          `${BASE_SPRITE_PATH}/animations/shooting/${dir}/frame_00${i}.png`,
        );
      }
    });
  },

  /** RGB 0-255 -> HSL com h em graus, s e l em 0-1. */
  rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    if (mx === mn) return { h: 0, s: 0, l };

    const d = mx - mn;
    const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h;
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return { h: h * 60, s, l };
  },

  /** HSL -> RGB 0-255. */
  hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    if (s === 0) {
      const v = Math.round(l * 255);
      return [v, v, v];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const canal = (t) => {
      t = ((t % 1) + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const hn = h / 360;
    return [
      Math.round(canal(hn + 1 / 3) * 255),
      Math.round(canal(hn) * 255),
      Math.round(canal(hn - 1 / 3) * 255),
    ];
  },

  /**
   * A que material pertence um pixel da arte base, ou null se é contorno/meia.
   *
   * Casa por MATIZ, não por distância RGB. Medido na arte: os 80 frames têm 368
   * cores distintas porque a iluminação muda o RGB conforme a direção — sombra
   * e luz do mesmo tecido ficam longe em RGB mas praticamente no mesmo matiz.
   * Casar por matiz é o que faz frente, lado e costas caírem no mesmo material
   * e a cor parar de piscar ao virar de ângulo.
   */
  colorMaterial(r, g, b) {
    const { h, s } = this.rgbToHsl(r, g, b);
    // Cinza/preto/branco não têm matiz confiável: é contorno, meia, olho.
    if (s < SWAP_TUNING.SAT_MIN) return null;

    let melhor = null;
    let menorDist = SWAP_TUNING.MAX_HUE_DIST;
    for (const nome in KIT_KEYS) {
      const k = KIT_KEYS[nome];
      if (k.hue === undefined) k.hue = this.rgbToHsl(k.r, k.g, k.b).h;
      // Matiz é circular: 350° e 10° distam 20, não 340.
      const bruta = Math.abs(h - k.hue) % 360;
      const d = Math.min(bruta, 360 - bruta);
      if (d < menorDist) {
        menorDist = d;
        melhor = nome;
      }
    }
    return melhor;
  },

  /**
   * Monta a textura de um jogador: uniforme do time + pele/cabelo da instância.
   * Uma textura por variante com idle+run+kick juntos (grade de 10x8 frames).
   * Cacheada por chave, então dois jogadores iguais não pagam duas vezes.
   * Devolve a chave da textura.
   */
  buildKitAtlas(scene, teamName, playerVariant) {
    // Sem a arte base carregada, devolve null e o chamador cai no atlas antigo
    // do time — melhor um sprite velho que um jogador invisível.
    if (!scene.textures.exists(`base_idle_${BASE_DIRS[0]}`)) return null;

    const kit = TEAMS_DB[teamName] || TEAMS_DB.Flamengo;
    const key = `kit_${teamName}_${playerVariant.skin}_${playerVariant.hair}`;
    if (scene.textures.exists(key)) return key;

    const F = BASE_FRAME_SIZE;
    const cols = 1 + BASE_RUN_FRAMES + BASE_KICK_FRAMES; // idle | run | kick
    const tex = scene.textures.createCanvas(
      key,
      cols * F,
      BASE_DIRS.length * F,
    );
    const ctx = tex.getContext();

    // O swap acontece num canvas NOSSO, não no do Phaser: `willReadFrequently`
    // só vale se for passado na PRIMEIRA chamada de `getContext` do elemento, e
    // o do Phaser já nasce sem a flag dentro do `createCanvas`. Sem isso o
    // `getImageData` abaixo puxa a textura da GPU de volta para a CPU e o
    // Chrome avisa "Multiple readback operations". No fim, um único
    // `drawImage` leva a grade pronta para a textura do Phaser.
    const off = document.createElement("canvas");
    off.width = tex.width;
    off.height = tex.height;
    const octx = off.getContext("2d", { willReadFrequently: true });

    // Cor final de cada material. skin/hair vêm da instância, resto do time.
    // O sprite novo NÃO tem cor de escudo separada — `logo` saiu do KIT_KEYS, e
    // pedir por ele aqui quebraria o laço abaixo (`KIT_KEYS[mat]` undefined).
    const alvo = {
      shirt1: kit.shirt1,
      shirt2: kit.shirt2,
      shorts: kit.shorts,
      skin: playerVariant.skin,
      hair: playerVariant.hair,
    };

    // 1) empacota os PNGs soltos na grade e registra os frames
    BASE_DIRS.forEach((dir, linha) => {
      const y = linha * F;
      // Cada PNG entra CENTRADO na célula e com RECORTE.
      //
      // Centrado porque o personagem está centrado no canvas dele (medido: o
      // centro do bounding box opaco bate com o centro do canvas em ±2px nas
      // quatro dimensões de export). Alinhar pelo canto empurraria o boneco
      // para cima e para a esquerda conforme o tamanho do arquivo.
      //
      // Recortado porque `drawImage` não respeita fronteira de célula: com um
      // PNG de 96 numa célula de 76, os 10px que sobram de cada lado invadiam
      // o vizinho — era esse o "pé flutuando acima da cabeça". O clip garante
      // que nenhum frame possa vazar, seja qual for o tamanho do export.
      const põe = (srcKey, col, frameName) => {
        if (!scene.textures.exists(srcKey)) return;
        const img = scene.textures.get(srcKey).getSourceImage();
        const cx = col * F;
        octx.save();
        octx.beginPath();
        octx.rect(cx, y, F, F);
        octx.clip();
        octx.drawImage(img, cx + (F - img.width) / 2, y + (F - img.height) / 2);
        octx.restore();
        tex.add(frameName, 0, cx, y, F, F);
      };
      põe(`base_idle_${dir}`, 0, `idle_${dir}`);
      for (let i = 0; i < BASE_RUN_FRAMES; i++) {
        põe(`base_run_${dir}_${i}`, 1 + i, `run_${dir}_${i}`);
      }
      for (let i = 0; i < BASE_KICK_FRAMES; i++) {
        // Buraco na arte cai no frame 000 da MESMA direção: a pose fica parada
        // um quadro, mas o atlas nunca sai com célula vazia — célula faltando
        // vira sprite invisível no meio do chute.
        const faltando = (BASE_KICK_MISSING[dir] || []).includes(i);
        põe(
          `base_kick_${dir}_${faltando ? 0 : i}`,
          1 + BASE_RUN_FRAMES + i,
          `kick_${dir}_${i}`,
        );
      }
    });

    // HSL de cada cor-alvo, e a luminância da cor-chave correspondente. O
    // deslocamento entre as duas é o que mantém o sombreado (ver abaixo).
    const alvoHsl = {};
    for (const mat in alvo) {
      const c = alvo[mat];
      const k = KIT_KEYS[mat];
      alvoHsl[mat] = {
        ...this.rgbToHsl((c >> 16) & 255, (c >> 8) & 255, c & 255),
        lumChave: this.rgbToHsl(k.r, k.g, k.b).l,
      };
    }

    // 2) um único passe de swap sobre a grade inteira
    const img = octx.getImageData(0, 0, tex.width, tex.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue; // preserva o alpha original
      const mat = this.colorMaterial(d[i], d[i + 1], d[i + 2]);
      if (!mat) continue;

      const px = this.rgbToHsl(d[i], d[i + 1], d[i + 2]);
      const t = alvoHsl[mat];

      // Matiz e saturação vêm do time/instância; o RELEVO vem do pixel.
      // Guardar o L absoluto do pixel quebraria uniforme preto e branco: um
      // pixel de camisa em L=0.5 viraria cinza médio tanto para o preto do
      // Corinthians quanto para o branco do Real. Então o que se preserva é o
      // DESVIO do pixel em relação à cor-chave — sombra continua sombra,
      // brilho continua brilho, ancorados na luminância da cor nova.
      const l = Phaser.Math.Clamp(t.l + (px.l - t.lumChave), 0, 1);
      const [r2, g2, b2] = this.hslToRgb(t.h, t.s, l);
      d[i] = r2;
      d[i + 1] = g2;
      d[i + 2] = b2;
    }
    octx.putImageData(img, 0, 0);
    ctx.drawImage(off, 0, 0);
    tex.refresh();

    this.createKitAnims(key);
    return key;
  },

  /** Anims da variante: idle/run/kick por direção. */
  createKitAnims(atlasKey) {
    BASE_DIRS.forEach((dir) => {
      const cria = (acao, total, frameRate, repeat) => {
        const animKey = `${atlasKey}_${acao}_${dir}`;
        if (this.anims.exists(animKey)) return;
        const frames = [];
        for (let i = 0; i < total; i++) {
          frames.push({
            key: atlasKey,
            frame: total === 1 ? `idle_${dir}` : `${acao}_${dir}_${i}`,
          });
        }
        this.anims.create({ key: animKey, frames, frameRate, repeat });
      };
      cria("idle", 1, 1, 0);
      cria("run", BASE_RUN_FRAMES, 10, -1);
      cria("kick", BASE_KICK_FRAMES, 18, 0); // não repete: é uma pose
    });
  },

  drawGrandstands() {
    this.grandstandGraphics = this.add.graphics();
    const graphics = this.grandstandGraphics;
    graphics.fillStyle(0x3a3a3a, 1); // Cor concreto

    // Arquibancadas Laterais (Esquerda e Direita)
    graphics.fillRect(0, 0, PITCH_X - 20, WORLD_HEIGHT);
    graphics.fillRect(
      PITCH_X + PITCH_WIDTH + 20,
      0,
      WORLD_WIDTH - (PITCH_X + PITCH_WIDTH + 20),
      WORLD_HEIGHT,
    );

    // Arquibancadas Fundo (Topo e Baixo)
    graphics.fillRect(PITCH_X, 0, PITCH_WIDTH, PITCH_Y - 20);
    graphics.fillRect(
      PITCH_X,
      PITCH_Y + PITCH_HEIGHT + 20,
      PITCH_WIDTH,
      WORLD_HEIGHT - (PITCH_Y + PITCH_HEIGHT + 20),
    );

    // Detalhes (Degraus simples)
    graphics.lineStyle(2, 0x555555, 1);
    for (let i = 0; i < WORLD_HEIGHT; i += 40) {
      graphics.lineBetween(0, i, PITCH_X - 20, i);
      graphics.lineBetween(PITCH_X + PITCH_WIDTH + 20, i, WORLD_WIDTH, i);
    }
  },

  createGoals() {
    const centerY = PITCH_Y + PITCH_HEIGHT / 2;
    const halfGoal = GOAL_WIDTH / 2;

    // --- GOL ESQUERDO ---
    const leftGoalX = PITCH_X;

    this.createPost(leftGoalX, centerY - halfGoal);
    this.createPost(leftGoalX, centerY + halfGoal);

    // Redes - Para fora do campo (esquerda)
    this.createNet(leftGoalX - GOAL_DEPTH, centerY - halfGoal, GOAL_DEPTH, 10);
    this.createNet(leftGoalX - GOAL_DEPTH, centerY + halfGoal, GOAL_DEPTH, 10);
    this.createNet(leftGoalX - GOAL_DEPTH, centerY - halfGoal, 10, GOAL_WIDTH);

    // Sensor da Linha do Gol esquerda
    this.goalLineTop = this.add.rectangle(
      leftGoalX - 20,
      centerY,
      40,
      GOAL_WIDTH - 12,
      0xff0000,
      0,
    );
    this.physics.add.existing(this.goalLineTop, true);
    this.physics.add.overlap(this.ball, this.goalLineTop, () => {
      if (this.ball.z < 35) this.handleGoal("top");
    });

    // --- GOL DIREITO ---
    const rightGoalX = PITCH_X + PITCH_WIDTH;

    this.createPost(rightGoalX, centerY - halfGoal);
    this.createPost(rightGoalX, centerY + halfGoal);

    // Redes - Para fora do campo (direita)
    this.createNet(rightGoalX, centerY - halfGoal, GOAL_DEPTH, 10);
    this.createNet(rightGoalX, centerY + halfGoal, GOAL_DEPTH, 10);
    this.createNet(rightGoalX + GOAL_DEPTH, centerY - halfGoal, 10, GOAL_WIDTH);

    // Sensor da Linha do Gol direita
    this.goalLineBot = this.add.rectangle(
      rightGoalX + 20,
      centerY,
      40,
      GOAL_WIDTH - 12,
      0x0000ff,
      0,
    );
    this.physics.add.existing(this.goalLineBot, true);
    this.physics.add.overlap(this.ball, this.goalLineBot, () => {
      if (this.ball.z < 30) this.handleGoal("bottom");
    });
  },

  createPost(x, y) {
    const post = this.add.circle(x, y, 6, 0xffffff);
    this.physics.add.existing(post, true);
    this.physics.add.collider(this.ball, post);
    this.physics.add.collider(this.allPlayers, post);
    post.setDepth(32);

    if (!this.worldGroup) this.worldGroup = [];
    this.worldGroup.push(post);
  },

  /**
   * Mancha de derrapagem no gramado. Mora na cena (e não nos entities) para o
   * fade existir uma vez só; Player e Enemy apenas detectam e chamam.
   * O tween nativo apaga e destrói sozinho — nenhum update loop novo.
   */
  spawnSkidMark(x, y, angle) {
    if (!this.skidMarks) this.skidMarks = [];
    // ponytail: teto duro com descarte do mais antigo. Vira pool se algum dia
    // criar/destruir Ellipse nesse ritmo aparecer no profiler.
    if (this.skidMarks.length >= SKID_MARK.MAX) {
      const antiga = this.skidMarks.shift();
      if (antiga) {
        // Sem isso o tween da marca despejada segue rodando até 2s sobre um
        // objeto já destruído.
        this.tweens.killTweensOf(antiga);
        antiga.destroy();
      }
    }

    const mark = this.add.ellipse(
      x,
      y,
      SKID_MARK.LENGTH,
      SKID_MARK.WIDTH,
      0x3b2f1c,
      SKID_MARK.ALPHA,
    );
    mark.setRotation(angle); // deitada na direção do escorregão
    mark.setDepth(2); // acima do gramado, abaixo da sombra da bola (9)
    this.skidMarks.push(mark);

    this.tweens.add({
      targets: mark,
      alpha: 0,
      duration: SKID_MARK.FADE_MS,
      onComplete: () => {
        const i = this.skidMarks.indexOf(mark);
        if (i >= 0) this.skidMarks.splice(i, 1);
        mark.destroy();
      },
    });
  },

  createNet(x, y, w, h) {
    const net = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0xffffff, 0.2);
    this.physics.add.existing(net, true);
    this.physics.add.collider(this.ball, net);
    this.physics.add.collider(this.allPlayers, net);

    if (!this.worldGroup) this.worldGroup = [];
    this.worldGroup.push(net);
  },
});

// O motor de troca de paleta não é exclusivo da partida: a criação de
// personagem usa o MESMO código para o preview ao vivo, então o que o jogador
// vê no menu é literalmente o que entra em campo. Mixin em vez de cópia.
if (typeof CharacterCreationScene !== "undefined") {
  Object.assign(CharacterCreationScene.prototype, {
    loadBaseSprites: GameScene.prototype.loadBaseSprites,
    rgbToHsl: GameScene.prototype.rgbToHsl,
    hslToRgb: GameScene.prototype.hslToRgb,
    colorMaterial: GameScene.prototype.colorMaterial,
    buildKitAtlas: GameScene.prototype.buildKitAtlas,
    createKitAnims: GameScene.prototype.createKitAnims,
  });
}

// Check: falha alto no console se algum método sumir na extração.
console.assert(
  [
    "createMinimap",
    "updateMinimap",
    "drawPitch",
    "drawGrandstands",
    "createGoals",
    "createPost",
    "createNet",
    "spawnSkidMark",
    "createGrassNoise",
    "colorMaterial",
    "rgbToHsl",
    "hslToRgb",
    "buildKitAtlas",
    "createKitAnims",
  ].every((m) => typeof GameScene.prototype[m] === "function"),
  "GameScene.render.js: método de render faltando no prototype",
);

// Check: o classificador de matiz. É AVISO, não asserção: ele valida a arte
// de origem, e arte fora do esperado não é motivo para atrapalhar quem está
// jogando. (Nem `console.assert` interrompe script — ele só loga — mas um
// "Assertion failed" no console assusta e se confunde com erro de verdade.)
//
// A versão anterior comparava com uma lista de cores escrita à mão de uma
// paleta ANTIGA: esperava magenta como `shirt1` (hoje é `shirt2`, ver
// KIT_KEYS), cobrava um material `logo` que não existe mais na tabela, e usava
// amostras de cabelo de antes de a arte ser girada para 264°. Resultado: o
// aviso disparava em todo boot com o classificador funcionando.
//
// Agora as expectativas saem da PRÓPRIA tabela, não de valores copiados: cada
// cor-chave tem de se reconhecer, e o que não tem matiz confiável tem de ficar
// de fora do swap. Isso continua pegando o estrago que importa — corte de
// saturação errado, matiz não circular, tabela com duas cores coladas.
(() => {
  const P = GameScene.prototype;
  const cm = (r, g, b) => P.colorMaterial(r, g, b);

  const seReconhecem = Object.keys(KIT_KEYS).filter(
    (nome) => cm(KIT_KEYS[nome].r, KIT_KEYS[nome].g, KIT_KEYS[nome].b) !== nome,
  );

  // Contorno, meia, olho e branco: matiz não confiável, não podem ser trocados.
  const semMatiz = [
    [26, 17, 21], // sat 0.21, matiz 333 (colado no magenta): 4718px
    [9, 8, 8],
    [48, 47, 52],
    [127, 128, 127],
    [231, 229, 237],
  ];
  const vazaram = semMatiz.filter((c) => cm(c[0], c[1], c[2]) !== null);

  if (seReconhecem.length)
    console.warn(
      "GameScene.render.js: cor-chave que não se reconhece no classificador:",
      seReconhecem.join(", "),
      "— duas cores da tabela podem ter ficado a menos de",
      SWAP_TUNING.MAX_HUE_DIST + "° uma da outra.",
    );
  if (vazaram.length)
    console.warn(
      "GameScene.render.js: cor sem matiz confiável entrando no swap:",
      vazaram.map((c) => `rgb(${c.join(",")})`).join(", "),
      "— SWAP_TUNING.SAT_MIN está baixo demais.",
    );
})();


// Check: HSL ida e volta, e o desvio de luminância que salva uniforme preto e
// branco. Guardar o L absoluto do pixel devolveria cinza médio nos dois casos.
console.assert(
  (() => {
    const P = GameScene.prototype;
    const rt = (r, g, b) => {
      const c = P.rgbToHsl(r, g, b);
      const [a, d, e] = P.hslToRgb(c.h, c.s, c.l);
      return Math.abs(a - r) <= 1 && Math.abs(d - g) <= 1 && Math.abs(e - b) <= 1;
    };
    const lumChave = P.rgbToHsl(223, 70, 167).l; // shirt1
    const lumPixel = P.rgbToHsl(235, 39, 159).l;
    const aplica = (alvo) => {
      const t = P.rgbToHsl((alvo >> 16) & 255, (alvo >> 8) & 255, alvo & 255);
      const l = Math.max(0, Math.min(1, t.l + (lumPixel - lumChave)));
      return P.rgbToHsl(...P.hslToRgb(t.h, t.s, l)).l;
    };
    return (
      rt(235, 39, 159) &&
      rt(13, 73, 126) &&
      rt(127, 128, 127) &&
      aplica(0x111111) < 0.2 && // preto do Corinthians continua preto
      aplica(0xffffff) > 0.8 // branco do Real continua branco
    );
  })(),
  "GameScene.render.js: conversão HSL ou desvio de luminância quebrado",
);
