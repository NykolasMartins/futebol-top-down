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
  // O projeto não carrega NENHUM áudio hoje (zero `load.audio`), mas o Phaser
  // cria um WebAudioSoundManager no boot de qualquer jeito — e o Chrome loga
  // "The AudioContext was not allowed to start" porque isso acontece antes do
  // primeiro clique. Sem som para tocar, o gerente de áudio só existia para
  // gerar esse aviso.
  //
  // QUANDO ENTRAR SOM: troque `noAudio` por false e destrave o contexto no
  // primeiro input do usuário, nunca no `create()`/`preload()`:
  //   this.input.once("pointerdown", () => this.sound.context.resume());
  // `this.sound.mute` (usado no HUD) e `playSfx()` seguem funcionando nos dois
  // modos — o gerente mudo tem a mesma interface.
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

  game.scene.scenes.forEach((cena) => {
    cena.events.on(Phaser.Scenes.Events.CREATE, () => {
      modoMenu(cena.scene.key);
      aplicarCrt(cena);
    });
    modoMenu(cena.scene.key);
    aplicarCrt(cena);
  });
});
