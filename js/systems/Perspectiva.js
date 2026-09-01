// =============================================================================
// PERSPECTIVA — o campo visto de cima, mas INCLINADO.
//
// Os bonecos são "high top-down": vistos de cima e ainda assim DE PÉ. O campo
// era top-down puro, e a mistura entregava a impressão errada — chão de mapa
// com gente de lado em cima.
//
// A inclinação aqui é ORTOGRÁFICA: câmera baixada, sem ponto de fuga. Isso é
// uma coisa só — o CHÃO encolhe na vertical por `cos(θ)`. Quem faz é o zoom
// ASSIMÉTRICO da câmera (`setZoom(z, z*k)`), e é por isso que a perspectiva
// sai de graça: nenhuma coordenada de jogo muda, a física continua num campo
// plano de 1600x1000 e a mira do mouse continua certa (`getWorldPoint` inverte
// a matriz da câmera, zoomY incluso).
//
// Trapézio (perto maior que longe) seria ponto de fuga de verdade — e aí a
// posição de tela deixaria de ser uma função linear da posição de mundo:
// clique, hitbox e sombra teriam de ser remapeados um a um. Ortográfico é o
// que dá o mesmo recado por uma multiplicação.
//
// O preço é o resto: a câmera achata TUDO, inclusive quem deveria continuar de
// pé (boneco, bola no ar, texto, menu). Para esses a compensação é o inverso —
// desenhar 1/k mais alto para a câmera devolver à altura certa. Daí as portas:
// `zoom` (o achatamento), `dePe`/`reta` (quem escapa dele) e `corpo` (o hitbox
// de quem escapou).
// =============================================================================

const Perspectiva = {
  get k() {
    return typeof PERSPECTIVA !== "undefined" ? PERSPECTIVA.ACHATAMENTO_Y : 1;
  },

  /**
   * Porta ÚNICA do zoom. A assimetria mora aqui e em lugar nenhum mais: com
   * `setZoom` cravado nos quatro pontos que mexem em zoom (câmera dinâmica,
   * replay, fim de replay, LAN), a inclinação sumiria na primeira volta do
   * replay e ninguém ligaria o sintoma à causa.
   */
  zoom(cam, z) {
    if (cam) cam.setZoom(z, z * this.k);
    return cam;
  },

  /**
   * O nível de zoom VIVO. `cam.zoom` do Phaser 4 devolve a MÉDIA de zoomX e
   * zoomY — com a câmera inclinada ele responde menos do que se pediu, e o
   * zoom dinâmico realimenta o próprio valor todo frame. O resultado é uma
   * câmera que encolhe sozinha até o campo sumir: medido, 1.0 virou 0.169 em
   * poucos segundos, com o jogador fora da tela e o minimapa intacto — parece
   * bug de render, é aritmética.
   */
  nivel(cam) {
    return cam ? cam.zoomX : 1;
  },

  /** Sprite que fica DE PÉ: desenhado mais alto para a câmera achatar de volta. */
  dePe(sprite, largura, altura) {
    sprite.setDisplaySize(largura, altura / this.k);
    return sprite;
  },

  /** Já dimensionado (texto, retângulo, DOM): mesma ideia, pela escala. */
  reta(obj) {
    if (obj) obj.setScale(obj.scaleX, obj.scaleY / this.k);
    return obj;
  },

  /**
   * Objeto PREGADO NA TELA (`setScrollFactor(0)`): HUD, menu, minimapa.
   *
   * Esses precisam de mais do que a escala. A câmera achata em torno do CENTRO
   * dela, então quem está fixo no alto da tela não só espreme: DESCE. Um HUD a
   * 80px do topo aparecia a 124px, e um menu que ocupa a tela inteira começava
   * a 60px do topo e vazava por baixo — parece desalinho de CSS e é a matriz
   * da câmera.
   *
   * A conta desfaz exatamente a da câmera (`tela = c + (y - c) * k`), então o
   * objeto volta ao pixel de origem, com a altura de origem.
   */
  tela(obj, cam) {
    if (!obj) return obj;
    const camera = cam || (obj.scene && obj.scene.cameras.main);
    const c = (camera ? camera.height : 600) / 2;
    obj.setScale(obj.scaleX, obj.scaleY / this.k);
    obj.y = c + (obj.y - c) / this.k;
    return obj;
  },

  /**
   * Hitbox de quem foi esticado. O corpo Arcade NÃO é independente da escala:
   *   body.height   = sourceHeight * scaleY
   *   body.position = y + scaleY * (offset.y - displayOriginY)
   * Esticar o desenho por 1/k, sozinho, inflaria o corpo por 1/k junto — o
   * boneco continuaria do mesmo tamanho na tela e roubaria bola 25% mais longe
   * sem nada no console. Por isso a fonte encolhe por k, e o offset encolhe em
   * torno da ORIGEM (não é `offset * k`: a origem não está no zero).
   */
  corpo(sprite, largura, altura, offX, offY) {
    const origem = sprite.displayOriginY; // pixels de TEXTURA, a escala não conta
    sprite.body.setSize(largura, altura * this.k, false);
    sprite.body.setOffset(offX, origem + this.k * (offY - origem));
    return sprite;
  },
};

// =============================================================================
// Check: esticar o desenho não pode mexer no CAMPO. O corpo de um boneco
// compensado tem de ocupar o mesmo retângulo de mundo que ocupava sem
// inclinação nenhuma — e o zoom tem de sair assimétrico pela porta.
// =============================================================================
console.assert(
  (() => {
    const k = Perspectiva.k;
    if (!(k > 0.5 && k <= 1)) return false;

    const escala = 0.63, origem = 38, alt = 24, offY = 20;
    const antes = { alto: alt * escala, topo: escala * (offY - origem) };

    const altNova = alt * k;
    const offNova = origem + k * (offY - origem);
    const escalaNova = escala / k; // o dePe
    const depois = {
      alto: altNova * escalaNova,
      topo: escalaNova * (offNova - origem),
    };

    const perto = (a, b) => Math.abs(a - b) < 1e-9;

    const falsa = { setZoom(x, y) { this.x = x; this.y = y; } };
    Perspectiva.zoom(falsa, 1.2);

    // O laço do zoom dinâmico, com a câmera do Phaser 4 de verdade: `zoom` lê
    // a média dos dois eixos. Realimentar essa média (em vez de `nivel()`)
    // afunda a câmera frame a frame, e é isso que este trecho tranca.
    const cam = {
      zoomX: 1, zoomY: k,
      get zoom() { return (this.zoomX + this.zoomY) / 2; },
      setZoom(x, y) { this.zoomX = x; this.zoomY = y; },
    };
    const alvo = 1.15;
    for (let i = 0; i < 600; i++) {
      Perspectiva.zoom(cam, cam.zoomX + (alvo - Perspectiva.nivel(cam)) * 0.05);
    }

    // E o que está pregado na tela tem de voltar ao MESMO pixel, com a MESMA
    // altura: a câmera achata em torno do centro, não do topo.
    const meia = 300;
    const naTela = (y, escalaY) => ({
      y: meia + (y - meia) * k,
      alto: 40 * escalaY * k,
    });
    const hud = { y: 80, scaleX: 1, scaleY: 1, setScale(x, y) { this.scaleX = x; this.scaleY = y; } };
    Perspectiva.tela(hud, { height: 600 });
    const posto = naTela(hud.y, hud.scaleY);

    return (
      perto(posto.y, 80) &&
      perto(posto.alto, 40) &&
      perto(antes.alto, depois.alto) &&
      perto(antes.topo, depois.topo) &&
      falsa.x === 1.2 &&
      perto(falsa.y, 1.2 * k) &&
      Math.abs(cam.zoomX - alvo) < 1e-3 &&
      Math.abs(cam.zoomY - alvo * k) < 1e-3
    );
  })(),
  "Perspectiva: compensação do corpo ou zoom assimétrico fora do lugar",
);
