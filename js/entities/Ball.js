// Botões de calibragem da curva — é aqui que se mexe se ela ficar fraca ou
// exagerada. Medido com chute de força 20 (1200 px/s) na grama:
//   ganho 1 + 0.96 -> 9° de desvio (era isso, e era invisível)
//   ganho 3 + 0.99 -> 33° e ~200px de desvio, com 305px de avanço
//   ganho 20       -> 77°, avanço de 22px: a bola encaracola e volta pra trás
const MAGNUS_GAIN = 3;
// Perto de 1 = a força lateral age durante o voo inteiro em vez de morrer logo
// após o chute. O decaimento antigo (0.96) matava a curva em ~1s.
const MAGNUS_DECAY = 0.99;

class Ball extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    // O sprite principal agora atuará como a SOMBRA/POSIÇÃO LÓGICA no chão
    super(scene, x, y, "ball_spritesheet", 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Configuração da Sombra (o objeto principal)
    this.setDisplaySize(18, 9); // Reduzido de 24x12 para 18x9 para ser mais proporcional
    this.setAlpha(0.25);
    this.setTint(0x000000);
    this.setDepth(9); // Sombra abaixo de tudo

    this.body.setCollideWorldBounds(true);
    this.body.setCircle(12);
    this.body.setOffset(52, 52);
    this.body.setDrag(0, 0);
    this.body.setBounce(0.6);

    // --- EIXO Z FALSO ---
    this.z = 0; // Altura atual
    this.vz = 0; // Velocidade vertical
    this.gravity = 0.45; // Força da gravidade (puxa para z=0)
    this.bounce = 0.65; // Quanto da velocidade é mantida no quique

    // Sprite Visual da Bola (o que o jogador vê "voando")
    this.visualBall = scene.add.sprite(x, y, "ball_spritesheet", 0);
    // A sombra (o sprite principal) FICA achatada — ela está no chão, é o que
    // a inclinação deve fazer com ela. Só a bola no ar volta a ser redonda.
    Perspectiva.dePe(this.visualBall, 24, 24);
    this.visualBall.setDepth(35); // Bola sempre acima

    this.customVx = 0;
    this.customVy = 0;

    this.owner = null;
    this.stealCooldown = 0;
    // O atrito mora em BALL_PHYSICS. Estes três números eram literais aqui e as
    // constantes eram decoração: mexer nelas não mudava nada no jogo.
    this.friction = BALL_PHYSICS.FRICTION_GROUND;

    // Curva como escalar: o desvio é perpendicular à velocidade ATUAL (Magnus),
    // então a bola vira ao longo do voo em vez de sofrer um empurrão fixo.
    // Sinal positivo = curva para a direita da direção do chute.
    this.curveAmount = 0;
    this.trail = [];
    this.trailGraphics = scene.add.graphics().setDepth(34);
  }

  update(time, delta) {
    const dt = delta / 16.6666;

    if (this.stealCooldown > 0) {
      this.stealCooldown -= delta;
      if (this.stealCooldown < 0) this.stealCooldown = 0;
    }

    // --- LÓGICA DO EIXO Z (ALTURA) ---
    if (!this.owner) {
      // Efeito Magnus: acelera perpendicular à velocidade atual, e não numa
      // direção fixa — é isso que faz a trajetória arquear de verdade.
      if (this.curveAmount !== 0) {
        const v = this.body.velocity;
        const speed = v.length();
        if (speed > 5) {
          const nx = -v.y / speed;
          const ny = v.x / speed;
          v.x += nx * this.curveAmount * MAGNUS_GAIN * dt;
          v.y += ny * this.curveAmount * MAGNUS_GAIN * dt;
        }
        this.curveAmount *= Math.pow(MAGNUS_DECAY, dt);
        if (Math.abs(this.curveAmount) < 0.1) this.curveAmount = 0;
      }

      // Se a bola está no ar ou tem velocidade vertical
      if (this.z > 0 || this.vz !== 0) {
        this.vz -= this.gravity * dt; // Aplica gravidade
        this.z += this.vz * dt; // Atualiza altura

        // Quique no chão
        if (this.z <= 0) {
          this.z = 0;
          if (Math.abs(this.vz) > 1.5) {
            // Quique visível: quanto mais alto ela vinha, mais grama levanta.
            if (this.scene && this.scene.spawnImpactDust) {
              this.scene.spawnImpactDust(this.x, this.y, 0x8fbf63, {
                forca: Phaser.Math.Clamp(Math.abs(this.vz) / 14, 0.08, 0.65),
                angulo: -Math.PI / 2,
                abertura: Math.PI * 0.9,
                depth: 12,
              });
            }
            this.vz = -this.vz * this.bounce; // Inverte e reduz velocidade
          } else {
            this.vz = 0;
          }
        }
      }

      // Física Horizontal (X, Y) - Arcade Physics cuida disso, mas aplicamos atrito customizado
      let vx = this.body.velocity.x;
      let vy = this.body.velocity.y;

      if (this.customVx !== 0 || this.customVy !== 0) {
        vx = this.customVx * 60;
        vy = this.customVy * 60;
        this.customVx = 0;
        this.customVy = 0;
      }

      // Atrito maior se a bola estiver no chão
      let currentFriction =
        this.z === 0 ? this.friction : BALL_PHYSICS.FRICTION_AIR;

      // MELHORIA: Clima dinâmico afeta atrito
      if (this.scene.weather === "rain" && this.z === 0) {
        currentFriction = BALL_PHYSICS.FRICTION_RAIN; // Desliza mais na chuva
      }

      vx *= Math.pow(currentFriction, dt);
      vy *= Math.pow(currentFriction, dt);

      // Deadzone pela velocidade TOTAL, não por eixo: por eixo ela zerava o
      // desvio lateral do Magnus a cada frame, antes de ele acumular.
      if (Math.hypot(vx, vy) < 5) {
        vx = 0;
        vy = 0;
        // Com o decaimento lento, a curva sobreviveria à bola parar e voltaria
        // a agir no próximo toque. Morre junto com a velocidade.
        this.curveAmount = 0;
      }

      this.body.setVelocity(vx, vy);

      this.updateRotation(vx, vy);
    } else {
      // Bola com o dono
      this.z = 0;
      this.vz = 0;
      this.body.setVelocity(0, 0);
      this.customVx = 0;
      this.customVy = 0;
      this.visualBall.stop();
    }

    this.updateVisual();
  }

  /**
   * Desenho: onde a bola aparece e como a sombra se deforma. Separado do
   * `update()` porque na partida em LAN o CONVIDADO não roda física nenhuma da
   * bola (a posição vem do anfitrião) mas continua precisando desenhar.
   *
   * Sem isto, só a sombra andava na tela do convidado: `this` É a sombra
   * (achatada, alpha 0.3) e a bola de verdade é `visualBall`, que só sai do
   * lugar aqui dentro.
   */
  updateVisual() {
    // A sombra (this) já está em (x, y); a bola visual fica em (x, y - z).
    this.visualBall.x = this.x;
    this.visualBall.y = this.y - this.z;

    // Escala da sombra baseada na altura
    const shadowScale = Phaser.Math.Clamp(1 - this.z / 300, 0.4, 1);
    this.setScale(shadowScale, shadowScale * 0.5);
    this.setAlpha(0.3 * shadowScale);

    this.updateTrail();
  }

  /** Giro do desenho pela velocidade. Serve tanto para a física local quanto
   *  para a velocidade que chega pela rede. */
  updateRotation(vx, vy) {
    const speedSq = vx * vx + vy * vy;
    if (speedSq <= 100) {
      this.visualBall.stop();
      return;
    }
    if (!this.scene.anims.exists("ball_rotate")) return;
    if (
      !this.visualBall.anims.isPlaying ||
      this.visualBall.anims.currentAnim.key !== "ball_rotate"
    ) {
      this.visualBall.play("ball_rotate");
    }
    this.visualBall.anims.timeScale = Phaser.Math.Clamp(
      Math.sqrt(speedSq) / 300,
      0.5,
      3.0,
    );
  }

  /** Rastro translúcido — existe só enquanto o chute ainda tem curva ativa. */
  updateTrail() {
    const g = this.trailGraphics;
    g.clear();

    if (
      this.owner ||
      (typeof EfeitosVisuais !== "undefined" && !EfeitosVisuais.ligado("particulas"))
    ) {
      this.trail.length = 0;
      return;
    }

    // A força do rastro é a VELOCIDADE. Antes ele só existia em chute com
    // curva, então a bomba reta — o chute que mais precisa parecer forte —
    // viajava com o mesmo desenho de um toque lateral. A curva virou PISO: bola
    // rodando risca o ar mesmo devagar.
    const v = this.body ? this.body.velocity.length() : 0;
    const faixa = BALL_PHYSICS.PASS_SPEED_MAX - FEEDBACK.RASTRO_V_MIN;
    const forca = Math.max(
      Phaser.Math.Clamp((v - FEEDBACK.RASTRO_V_MIN) / faixa, 0, 1),
      this.curveAmount !== 0 ? FEEDBACK.RASTRO_CURVA : 0,
    );
    if (forca <= 0.02) {
      this.trail.length = 0;
      return;
    }

    this.trail.push({ x: this.visualBall.x, y: this.visualBall.y });
    const maximo = Math.round(5 + 11 * forca);
    while (this.trail.length > maximo) this.trail.shift();

    // O mais antigo é o mais fraco/menor: fade natural sem tween nem asset.
    this.trail.forEach((p, i) => {
      const t = (i + 1) / this.trail.length;
      g.fillStyle(0xffffff, 0.45 * forca * t);
      g.fillCircle(p.x, p.y, (3 + 7 * forca) * t);
    });
  }

  // Método para aplicar força 3D (X, Y, Z) e opcionalmente curva
  applyImpulse(vx, vy, vz, curveAmount = 0) {
    this.customVx = vx;
    this.customVy = vy;
    this.vz = vz;
    this.curveAmount = curveAmount;
    this.owner = null;
  }
}
