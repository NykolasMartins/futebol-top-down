const config = {
  type: Phaser.AUTO,
  width: 1000,
  height: 600,
  parent: "game-container",
  dom: { createContainer: true },
  pixelArt: true,
  input: {
    gamepad: true, // Ativa suporte a gamepad!
  },
  // O jogo TEM som (js/systems/Som.js), e mesmo assim o gerente do Phaser
  // continua desligado: não existe um `load.audio` sequer para ele gerenciar —
  // todo som é gerado no WebAudio em runtime, com contexto próprio criado no
  // primeiro gesto do usuário (fim deste arquivo). Ligar `noAudio: false` aqui
  // só criaria um SEGUNDO contexto, vazio, e de volta o aviso do Chrome
  // ("The AudioContext was not allowed to start") por nascer antes do clique.
  audio: { noAudio: true },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 0, x: 0 },
      debug: false,
    },
  },
  scene: [
    MenuScene,
    CharacterCreationScene,
    ExhibitionMatchScene,
    PreGameScene,
    GameScene,
    PenaltyShootoutScene,
    EndGameScene,
    PlayerProfileScene,
    TransferMarketScene,
    TrainingScene, // v4.0 — Mini-games de treino
    MultiplayerScene, // Lobby LAN
  ],
};

// =============================================================================
// Check: os mixins de GameScene chegaram inteiros. Roda no ÚLTIMO script de
// propósito — é o único ponto que enxerga todo mundo já carregado.
//
// O modo de falha que isto pega: o navegador serve um mixin VELHO junto de um
// `GameScene.js` novo. O check dentro do próprio mixin não salva, porque a
// versão velha dele também tem uma versão velha do check. O sintoma sem isto é
// um `TypeError` dentro de um callback de colisão, no meio de um gol.
console.assert(
  [
    "recordReplayFrame",
    "startReplay",
    "registerDOMTeardown",
    // `updateHUD` NÃO entra: é closure criada no `create()`, não vive no
    // prototype (ver o comentário no topo de GameScene.hud.js).
  ].every((m) => typeof GameScene.prototype[m] === "function"),
  "GameScene: mixin faltando ou desatualizado (cache velho?). " +
    "Recarregue com Ctrl+Shift+R e o DevTools aberto com 'Disable cache'.",
);

const game = new Phaser.Game(config);

// Curvatura de tubo em TODA cena, num lugar só. `Scenes.Events.CREATE` dispara
// a cada `create()` — inclusive quando a cena é reiniciada — então cena que
// volta (menu → partida → menu) reganha a pipeline sem ninguém lembrar disso.
// Pôr a linha no `create()` de cada cena seria o mesmo conserto repetido dez
// vezes, e a próxima cena nasceria plana.
// Interruptor da curvatura de UI. O filtro SVG custa uma re-rasterização da
// camada DOM a cada repintura, e isso pesa mais em máquina fraca ou tela
// HiDPI. Se o menu engasgar aí, ponha `false`: a UI fica reta e o campo
// continua curvo pelo shader, que roda na GPU.
const CURVAR_MENUS = true;

// Cenas em que a UI tem de ficar RETA: são as que se joga, onde o clique
// precisa cair exatamente onde o olho vê. Todo o resto é menu e ganha a
// curvatura por CSS.
const CENAS_DE_JOGO = new Set([
  "GameScene",
  "ExhibitionMatchScene",
  "PenaltyShootoutScene",
  "TrainingScene",
]);

// Phaser 4: o CRT é um FILTRO de câmera (`aplicarCrt`, em CrtVhsFilter.js), não
// mais uma pipeline. O resto do gancho é igual ao da versão 3.55 — um lugar só,
// no evento `create` de cada cena, mais a chamada imediata para a primeira
// cena, que já rodou o `create()` quando o READY chega.
game.events.once(Phaser.Core.Events.READY, () => {
  const container = document.getElementById("game-container");
  const modoMenu = (key) =>
    container.classList.toggle(
      "crt-menu-mode",
      CURVAR_MENUS && !CENAS_DE_JOGO.has(key),
    );

  // `EfeitosVisuais.aplicarNaCena` no lugar do `aplicarCrt` direto: ele liga o
  // filtro OU o remove, conforme a escolha do jogador (Configurações). Chamar
  // `aplicarCrt` aqui reacenderia o CRT de quem o desligou a cada troca de cena.
  game.scene.scenes.forEach((cena) => {
    cena.events.on(Phaser.Scenes.Events.CREATE, () => {
      modoMenu(cena.scene.key);
      EfeitosVisuais.aplicarNaCena(cena);
    });
    modoMenu(cena.scene.key);
    EfeitosVisuais.aplicarNaCena(cena);
  });

  // Camadas DOM e curvatura: uma vez, no boot.
  EfeitosVisuais.aplicar(game);

  // Versão no canto: escrita aqui, e não no HTML, para ter UMA fonte
  // (`GAME_VERSION`). Se o canto mostrar número velho, o cache é que está
  // velho — o texto e o resto do JS vêm do mesmo arquivo.
  const selo = document.getElementById("app-version");
  if (selo) selo.textContent = "v" + GAME_VERSION;

  // CACHE: cada `<script>` e `<link>` do jogo carrega com `?v=<versão>`, então
  // versão nova é URL nova e o navegador NÃO tem como servir a antiga. Aqui só
  // se confere se o `index.html` (que é revalidado) está falando a mesma versão
  // que o JS que chegou — se divergirem, a página está rodando arquivos de duas
  // entregas ao mesmo tempo, que é o pior dos mundos e some do console sem isto.
  const marca = [...document.querySelectorAll("script[src]")]
    .map((s) => new URL(s.src, location.href).searchParams.get("v"))
    .find(Boolean);
  if (marca && marca !== GAME_VERSION) {
    console.error(
      `Versão MISTURADA: index.html pede v${marca}, o JS carregado é v${GAME_VERSION}. Recarregue com Ctrl+Shift+R.`,
    );
    if (selo) {
      selo.textContent = `v${GAME_VERSION} ≠ v${marca}`;
      selo.style.color = "var(--pui-red-bright)";
    }
  }

});

// ÁUDIO: o contexto só pode nascer dentro de um gesto do usuário — regra do
// navegador, e é o que gerava "The AudioContext was not allowed to start" no
// console quando nascia no boot.
//
// Fica FORA do `READY` e ouve os quatro eventos de propósito: o gesto pode
// chegar antes do jogo montar, e nem toda origem de clique emite `pointerdown`
// (automação e alguns navegadores mandam só `mousedown`). Custa quatro
// listeners que se removem sozinhos no primeiro gesto.
["pointerdown", "mousedown", "touchstart", "keydown"].forEach((evento) =>
  document.addEventListener(evento, () => Som.destravar(), { once: true }),
);
