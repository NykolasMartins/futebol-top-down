/**
 * CRT + VHS num passe só — versão Phaser 4.
 *
 * O Phaser 4 apagou o sistema de pipelines (`PostFXPipeline`, `setPostPipeline`)
 * e pôs no lugar `camera.filters`, com um par CONTROLLER + RENDER NODE:
 *   - o controller guarda os knobs e vive na câmera;
 *   - o render node compila o shader e copia os knobs para os uniforms.
 * O GLSL abaixo é o MESMO da versão 3.55 — `uMainSampler` e `outTexCoord`
 * seguem existindo no 4, então a imagem sai idêntica.
 *
 * UM passe: curvatura, bloom com limiar, cintilação, faixa de rastreamento,
 * grão por luminância, ranhuras e contraste acontecem todos aqui dentro. Fazer
 * bloom com os filtros nativos (`ParallelFilters` + `Threshold` + `Blur` +
 * `Blend`) custaria 3 a 4 passes de tela pelo mesmo resultado.
 */
const CRT_FRAG = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform float amount;   // curvatura: 0 = tela plana
uniform float zoom;     // reenquadra depois de curvar, para não sobrar borda
uniform float time;     // segundos
uniform float grain;    // grão de película
uniform float flicker;  // cintilação de brilho
uniform float tracking; // falha de rastreamento (lava a cor de uma faixa)
uniform float scratch;  // ranhuras escuras de película
uniform float bloom;    // força do vazamento de luz
uniform float limiar;   // brilho a partir do qual o pixel "acende"
uniform float raio;     // alcance do vazamento, em pixels
uniform vec2 texel;     // 1/resolução: converte pixel em coordenada de textura
uniform float contrast; // 1 = sem mudança; acima disso, preto mais fundo
uniform float saturate; // 1 = sem mudança; acima disso, cor mais viva

varying vec2 outTexCoord;

// Ruído barato e determinístico por pixel. Não é bom gerador, é grão de filme:
// o que importa é não ter padrão visível.
float hash(vec2 p)
{
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Só o que já é claro vaza luz. O corte é um smoothstep, não um step: com
// corte seco a linha do campo acende de uma vez quando o pixel cruza o limiar e
// a borda do brilho pisca ao mover a câmera.
vec3 acesos(vec2 p)
{
  vec3 c = texture2D(uMainSampler, p).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return c * smoothstep(limiar, limiar + 0.22, l);
}

void main()
{
  // Centro em (0,0): o deslocamento tem de trocar de sinal por quadrante.
  vec2 cc = outTexCoord - 0.5;

  // dot(cc, cc) é o raio AO QUADRADO — cresce devagar no miolo e rápido na
  // borda, que é justamente o perfil de um tubo. Usar o raio linear daria uma
  // lente cônica, com quina no centro.
  // Esta é a ÚNICA coisa que mexe em posição, e ela é ESTÁTICA: a mesma
  // curvatura em todo frame. Nada aqui embaixo desloca pixel — envelhecimento
  // de fita entra só na COR, senão a tela treme e a bola fica impossível de
  // seguir.
  vec2 uv = 0.5 + cc * (1.0 + dot(cc, cc) * amount) * zoom;

  // Fora da textura é vidro, não imagem: preto opaco em vez de esticar o pixel
  // da borda (CLAMP_TO_EDGE deixaria rastro de listras nos cantos).
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 col = texture2D(uMainSampler, uv).rgb;

  // ── Bloom (vazamento de fósforo) ────────────────────────────────────────
  // Dois anéis de 6 amostras em torno do pixel, o de fora com peso menor: 12
  // taps aproximam um borrão gaussiano bem o bastante para um brilho suave.
  // ponytail: passe único, sem downsample. Bloom "de verdade" seria meia
  // resolução + dois passes separáveis (UtilityPipeline.blurFrame), o que
  // exige mais um render target e umas 60 linhas. Se um dia isto custar frame
  // em GPU fraca, esse é o caminho — e o knob de pânico é bloom = 0.
  vec3 halo = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float ang = float(i) * 1.0472; // 60 graus
    vec2 dir = vec2(cos(ang), sin(ang));
    halo += acesos(uv + dir * texel * raio);
    halo += acesos(uv + dir * texel * raio * 2.1) * 0.6;
  }
  // 6*1.0 + 6*0.6 = 9.6: normaliza para o halo não depender da contagem.
  col += (halo / 9.6) * bloom;

  // ── Cintilação de brilho ────────────────────────────────────────────────
  // Dois senos de frequências incomensuráveis: a soma nunca fecha ciclo, então
  // o brilho respira sem virar batida de metrônomo.
  col *= 1.0 + flicker * (sin(time * 11.3) * 0.6 + sin(time * 3.7) * 0.4);

  // ── Falha de rastreamento ───────────────────────────────────────────────
  // Uma faixa fina que desce devagar e só APARECE de vez em quando (a janela
  // rara do seno lento). Dentro dela a cor lava e clareia, como fita perdendo
  // sincronismo — mas o pixel continua exatamente onde estava.
  float faixaY = fract(time * 0.11);
  float faixa = smoothstep(0.035, 0.0, abs(uv.y - faixaY));
  float janela = smoothstep(0.88, 1.0, sin(time * 0.27) * 0.5 + 0.5);
  float falha = faixa * janela * tracking;
  // MULTIPLICA, não soma: somar clareava o preto junto e era metade do aspecto
  // lavado. Assim a faixa brilha onde já havia imagem e o preto continua preto.
  col = mix(col, col * 1.5, falha);

  // ── Grão de película ────────────────────────────────────────────────────
  // Por PIXEL e por frame, senão vira textura fixa colada na tela. O peso
  // acompanha o brilho do pixel: grão de fita aparece no meio-tom e some no
  // preto — somar ruído no preto é exatamente o que dá aquele chuvisco cinza
  // na sombra.
  float n = hash(gl_FragCoord.xy + fract(time) * vec2(37.0, 17.0));
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col += (n - 0.5) * grain * (0.35 + lum);

  // ── Ranhuras de película ────────────────────────────────────────────────
  // Colunas finas sorteadas por QUADRO: o tempo é quantizado (12 trocas por
  // segundo), então os riscos saltam de lugar como sujeira de filme em vez de
  // deslizarem. Só ~1,2% das colunas viram risco em cada quadro.
  float quadro = floor(time * 12.0);
  // 620 colunas: cada risco tem ~1,6px numa tela de 1000px. A 240 colunas eles
  // saíam com 4px e pareciam barra, não arranhão.
  float coluna = floor(uv.x * 620.0);
  float sorteio = hash(vec2(coluna, quadro));
  // Corte mais alto porque há mais colunas: ~3 riscos por quadro, não 8.
  float risco = step(0.9955, sorteio);
  // O risco não vai de cima a baixo: um seno com fase sorteada corta a altura,
  // senão vira cortina em vez de arranhão.
  float altura = smoothstep(
    0.15, 0.55,
    abs(sin(uv.y * 2.7 + hash(vec2(quadro, 11.0)) * 6.283))
  );
  // MULTIPLICA por menos de 1: ranhura de película é sujeira, só escurece —
  // nunca some brilho, senão vira risco branco de vídeo, não desgaste de fita.
  col *= 1.0 - scratch * risco * altura;

  // ── Contraste e cor ─────────────────────────────────────────────────────
  // Tubo de verdade tem preto fundo e cor saturada. Pivô em 0.5: o que está
  // abaixo escurece, o que está acima clareia.
  col = (col - 0.5) * contrast + 0.5;
  col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, saturate);

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

const CRT_NODE = "FilterCrtVhs";

/**
 * Render node: compila o shader e entrega os uniforms. `setupUniforms` recebe o
 * controller — é ele quem carrega os valores, então knob mexido em tempo de
 * execução chega no frame seguinte sem recompilar nada.
 */
const FilterCrtVhs = new Phaser.Class({
  Extends: Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader,

  initialize: function FilterCrtVhs(manager) {
    Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader.call(
      this,
      CRT_NODE,
      manager,
      null,
      CRT_FRAG,
    );
  },

  setupUniforms: function (controller, drawingContext) {
    const u = this.programManager;
    u.setUniform("amount", controller.amount);
    u.setUniform("zoom", controller.zoom);
    u.setUniform("grain", controller.grain);
    u.setUniform("flicker", controller.flicker);
    u.setUniform("tracking", controller.tracking);
    u.setUniform("scratch", controller.scratch);
    u.setUniform("bloom", controller.bloom);
    u.setUniform("limiar", controller.limiar);
    u.setUniform("raio", controller.raio);
    u.setUniform("contrast", controller.contrast);
    u.setUniform("saturate", controller.saturate);
    // Relógio do jogo, não `performance.now()`: pausa e troca de cena não dão
    // salto no envelhecimento da fita.
    u.setUniform("time", controller.camera.scene.game.loop.time / 1000);
    // O texel depende do alvo de render, que muda com o tamanho da tela.
    u.setUniform("texel", [
      1 / drawingContext.width,
      1 / drawingContext.height,
    ]);
  },
});

/** Controller: os knobs. Mesmos nomes e mesmos valores da versão 3.55. */
const CrtVhsFilter = new Phaser.Class({
  Extends: Phaser.Filters.Controller,

  initialize: function CrtVhsFilter(camera) {
    Phaser.Filters.Controller.call(this, camera, CRT_NODE);

    this.amount = 0.15; // curvatura
    this.zoom = 0.975; // reenquadre depois de curvar
    this.grain = 0.105; // grão por pixel/frame
    this.flicker = 0.022; // respiração do brilho
    this.tracking = 0.8; // faixa de rastreamento
    this.scratch = 0.2; // ranhuras (finas no campo)
    this.bloom = 0.5; // vazamento de luz
    this.limiar = 0.62; // brilho a partir do qual acende
    this.raio = 2.4; // alcance do bloom, em pixels
    this.contrast = 1.16;
    this.saturate = 1.2;
  },
});

/**
 * Liga o filtro na câmera de uma cena, uma vez só. Idempotente: a câmera
 * sobrevive ao restart e guardaria o filtro anterior — sem a checagem, cada
 * volta ao menu empilhava outro passe (isso já aconteceu na versão 3.55).
 */
function aplicarCrt(cena) {
  const cam = cena.cameras && cena.cameras.main;
  if (!cam || !cam.filters) return false;

  const renderNodes = cena.game.renderer.renderNodes;
  if (!renderNodes) return false; // renderer Canvas: sem filtro
  if (!renderNodes.hasNode(CRT_NODE)) {
    renderNodes.addNodeConstructor(CRT_NODE, FilterCrtVhs);
  }

  const lista = cam.filters.internal;
  const jaTem = lista.list.some((f) => f instanceof CrtVhsFilter);
  if (!jaTem) lista.add(new CrtVhsFilter(cam));
  return true;
}

// Checks de boot: se o Phaser mudar o contrato, isto grita aqui em vez de a
// tela ficar preta sem aviso.
console.assert(
  typeof Phaser !== "undefined" &&
    Phaser.Filters &&
    typeof Phaser.Filters.Controller === "function" &&
    Phaser.Renderer.WebGL.RenderNodes &&
    typeof Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader === "function",
  "CrtVhsFilter: API de filtros do Phaser 4 não encontrada",
);
console.assert(
  CRT_FRAG.includes("uMainSampler") &&
    CRT_FRAG.includes("outTexCoord") &&
    [
      "amount",
      "zoom",
      "time",
      "grain",
      "flicker",
      "tracking",
      "scratch",
      "bloom",
      "limiar",
      "raio",
      "contrast",
      "saturate",
    ].every((u) => new RegExp("uniform float " + u).test(CRT_FRAG)),
  "CrtVhsFilter: shader sem os nomes que o filtro injeta",
);
// A imagem tem de ficar FIRME: nada pode somar ao uv depois da curvatura.
console.assert(
  !/uv\s*[+\-]=/.test(CRT_FRAG),
  "CrtVhsFilter: alguém voltou a deslocar o uv — a tela vai tremer",
);
