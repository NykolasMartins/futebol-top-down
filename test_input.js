// Check do input de gamepad (issue #4: cada botão disparava duas vezes,
// uma pelo evento gamepad.on e outra pelo polling do update).
// Rodar: node test_input.js

const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

globalThis.GameScene = class {};
globalThis.GameStates = { PLAYING: "PLAYING" };
globalThis.Phaser = {
  Input: { Keyboard: { KeyCodes: {}, JustDown: () => false } },
  Math: { DegToRad: (d) => (d * Math.PI) / 180 },
};

vm.runInThisContext(
  fs.readFileSync(__dirname + "/js/scenes/GameScene.input.js", "utf8"),
);

/** Cena falsa: só o que updateInputPolling toca, com contadores. */
function fakeScene(pad) {
  return Object.assign(Object.create(GameScene.prototype), {
    passes: [],
    chargesStarted: 0,
    chargedKicks: 0,
    pauseToggles: 0,
    switches: 0,
    gameState: "PLAYING",
    isSpectator: false,
    isGameOver: false,
    isReplaying: false,
    _pauseMenuActive: false,
    gamepadCharging: false,
    gamepadKickStartedAt: 0,
    tapPassThreshold: 180,
    keys: { tab: {} },
    time: { now: 1000 },
    player: { x: 0, y: 0, moveAngle: 0, maxKickChargeTime: 1000 },
    input: { gamepad: { pad1: pad }, activePointer: {} },
    executPass(_pointer, type) {
      this.passes.push(type);
    },
    cancelKickCharge() {},
    startKickCharging() {
      this.chargesStarted++;
    },
    executeChargedKick() {
      this.chargedKicks++;
    },
    switchPlayer() {
      this.switches++;
    },
    _openPauseMenu() {
      this._pauseMenuActive = true;
      this.pauseToggles++;
    },
    _closePauseMenu() {
      this._pauseMenuActive = false;
      this.pauseToggles++;
    },
  });
}

const press = (...indexes) => {
  const buttons = [];
  indexes.forEach((i) => (buttons[i] = { pressed: true }));
  return { connected: true, buttons, axes: [] };
};

// --- Botões de passe: A(0) curto, X(2) profundidade, Y(3) cruzamento ---
[
  [0, "short"],
  [2, "through"],
  [3, "cross"],
].forEach(([index, type]) => {
  const pad = press(index);
  const s = fakeScene(pad);

  // Segurar por 3 frames deve gerar UM passe (edge-triggered, não level).
  s.updateInputPolling();
  s.updateInputPolling();
  s.updateInputPolling();
  assert.deepStrictEqual(
    s.passes,
    [type],
    `botão ${index} segurado deveria passar 1x, veio: ${s.passes}`,
  );

  // Soltar e apertar de novo gera o segundo passe.
  pad.buttons[index].pressed = false;
  s.updateInputPolling();
  pad.buttons[index].pressed = true;
  s.updateInputPolling();
  assert.deepStrictEqual(
    s.passes,
    [type, type],
    `botão ${index} reapertado deveria passar 2x, veio: ${s.passes}`,
  );
});

// --- Botão B(1): segurar carrega uma vez, soltar depois do limiar chuta ---
{
  const pad = press(1);
  const s = fakeScene(pad);

  s.updateInputPolling();
  s.updateInputPolling();
  assert.strictEqual(s.chargesStarted, 1, "B segurado deveria carregar 1x");
  assert.strictEqual(s.chargedKicks, 0, "B ainda segurado não deveria chutar");

  s.time.now += 500; // acima do tapPassThreshold de 180ms
  pad.buttons[1].pressed = false;
  s.updateInputPolling();
  assert.strictEqual(s.chargedKicks, 1, "soltar B deveria chutar 1x");
  assert.deepStrictEqual(s.passes, [], "chute carregado não é passe");

  s.updateInputPolling();
  assert.strictEqual(s.chargedKicks, 1, "B solto não deveria rechutar");
}

// --- Botão B(1) tapeado abaixo do limiar vira passe, não chute ---
{
  const pad = press(1);
  const s = fakeScene(pad);
  s.updateInputPolling();
  s.time.now += 100; // abaixo dos 180ms
  pad.buttons[1].pressed = false;
  s.updateInputPolling();
  assert.strictEqual(s.chargedKicks, 0, "tap curto não deveria chutar");
  assert.strictEqual(s.passes.length, 1, "tap curto deveria virar passe");
}

// --- Start(9): segurar alterna a pausa uma vez só ---
{
  const pad = press(9);
  const s = fakeScene(pad);
  s.updateInputPolling();
  s.updateInputPolling();
  s.updateInputPolling();
  assert.strictEqual(s.pauseToggles, 1, "Start segurado deveria pausar 1x");
  assert.strictEqual(s._pauseMenuActive, true, "menu deveria estar aberto");
}

// --- L1(4): troca de jogador também é edge-triggered ---
{
  const pad = press(4);
  const s = fakeScene(pad);
  s.updateInputPolling();
  s.updateInputPolling();
  assert.strictEqual(s.switches, 1, "L1 segurado deveria trocar 1x");
}

// --- Sem gamepad conectado nada dispara ---
{
  const s = fakeScene({ connected: false, buttons: [], axes: [] });
  s.updateInputPolling();
  assert.deepStrictEqual(s.passes, [], "pad desconectado não deveria passar");
}

console.log("test_input.js: OK");
