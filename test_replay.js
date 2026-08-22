// Check do buffer circular do replay: se o cap sumir, o vazamento é silencioso.
// Rodar: node test_replay.js

const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

globalThis.GameScene = class {};
globalThis.GameStates = { PAUSED: "PAUSED" };
globalThis.Phaser = { Math: { Clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)) } };

vm.runInThisContext(
  fs.readFileSync(__dirname + "/js/scenes/GameScene.replay.js", "utf8"),
);

const sprite = (x) => ({
  x,
  y: 0,
  flipX: false,
  visible: true,
  anims: { currentAnim: null, currentFrame: null },
});

const scene = Object.assign(Object.create(GameScene.prototype), {
  isReplaying: false,
  replayBuffer: [],
  replayMaxFrames: 180,
  ball: { x: 0, y: 0, z: 0, rotation: 0, visible: true, visualBall: null },
  allPlayers: [sprite(1), sprite(2)],
  gkTop: sprite(3),
  gkBottom: sprite(4),
});

// Grava 500 frames movendo a bola, para poder identificar qual sobreviveu.
for (let i = 0; i < 500; i++) {
  scene.ball.x = i;
  scene.recordReplayFrame();
}

assert.strictEqual(
  scene.replayBuffer.length,
  180,
  `buffer deveria parar em 180, veio ${scene.replayBuffer.length}`,
);
assert.strictEqual(
  scene.replayBuffer[179].ball.x,
  499,
  "último frame do buffer deveria ser o mais recente",
);
assert.strictEqual(
  scene.replayBuffer[0].ball.x,
  320,
  "frames antigos deveriam ter sido descartados pela frente",
);

// Durante o replay nada é gravado (senão o buffer se corrompe no meio da reprise).
scene.isReplaying = true;
scene.recordReplayFrame();
assert.strictEqual(scene.replayBuffer.length, 180, "replay em curso não grava");

console.log("test_replay.js: OK");
