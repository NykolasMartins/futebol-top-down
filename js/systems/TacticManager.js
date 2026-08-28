const ARCHETYPES = {
  FIXO: "FIXO",
  WING_L: "WING_L",
  WING_R: "WING_R",
  PIVOT: "PIVOT",
};

const TACTICS = {
  T3_1: "3-1",
  T2_2: "2-2",
  T4_0: "4-0",
};

/**
 * O losango, em fração de campo RELATIVA AO ATAQUE: `depth` 0 é a linha do gol
 * PRÓPRIO e 1 a do adversário, `lane` 0 é a lateral de cima. Guardar assim
 * (e não em pixels) é o que faz os dois times usarem a mesma tabela e a virada
 * do segundo tempo não precisar de nada.
 */
const FORMATION = {
  SHAPE: {
    [ARCHETYPES.FIXO]: { depth: 0.22, lane: 0.5 },
    [ARCHETYPES.WING_L]: { depth: 0.5, lane: 0.16 },
    [ARCHETYPES.WING_R]: { depth: 0.5, lane: 0.84 },
    [ARCHETYPES.PIVOT]: { depth: 0.78, lane: 0.5 },
  },
  PUSH_UP: 0.12, // com a posse o bloco inteiro sobe
  DROP_BACK: 0.12, // sem a posse recua: o posto fica ENTRE a bola e o gol
  // Ruptura: com a posse no campo de ataque, ala e pivô furam a linha e pedem
  // a bola em vez de ficarem plantados no posto. Em px, virado em fração.
  ATTACKING_RUN: 100,
  RUNNERS: [ARCHETYPES.WING_L, ARCHETYPES.WING_R, ARCHETYPES.PIVOT],
  // Giro de futsal: se NINGUÉM do time estiver dentro deste raio do posto do
  // pivô, um ala corta em diagonal e ocupa a área. O gatilho é a zona vazia,
  // não a posição do pivô — o que falta é alguém para receber o passe final.
  PIVOT_ZONE_RADIUS: 260,
  DESPERATE_PUSH: AI_BEHAVIOR.DESPERATE_PUSH,
  BALL_FOLLOW: 0.55, // acompanha a altura da bola (time sobe e desce junto)
  BALL_SHIFT: 0.45, // basculação para o lado da bola, sem fechar a largura
  DEPTH_MIN: 0.06,
  DEPTH_MAX: 0.94,
  LANE_MIN: 0.05,
  LANE_MAX: 0.95,
};

class TacticManager {
  constructor(scene) {
    this.scene = scene;
  }

  /**
   * Como está o jogo para este lado nos segundos finais: `"desperate"` (perde),
   * `"stall"` (ganha) ou `null` (resto da partida, ou empate). Mora aqui porque
   * o `TacticManager` carrega antes do `AIBrain` e os dois precisam ler o mesmo.
   */
  static matchUrgency(scene, isPlayerTeam) {
    if (!scene || !scene.isSecondHalf) return null;
    if (!(scene.timeLeft <= AI_BEHAVIOR.ENDGAME_SEC)) return null;
    const meu = isPlayerTeam ? scene.scorePlayer : scene.scoreOpponent;
    const dele = isPlayerTeam ? scene.scoreOpponent : scene.scorePlayer;
    if (meu === dele) return null;
    return meu < dele ? "desperate" : "stall";
  }

  getAttackDir(bot) {
    if (bot.isPlayerTeam) return this.scene.isSecondHalf ? 1 : -1;
    return this.scene.isSecondHalf ? -1 : 1;
  }

  getTeamPlayers(isPlayerTeam) {
    return this.scene.allPlayers.filter((p) => p.isPlayerTeam === isPlayerTeam);
  }

  getOwnGoalkeeper(bot) {
    if (!this.scene.gkTop || !this.scene.gkBottom) return null;
    if (!this.scene.isSecondHalf)
      return bot.isPlayerTeam ? this.scene.gkBottom : this.scene.gkTop;
    return bot.isPlayerTeam ? this.scene.gkTop : this.scene.gkBottom;
  }

  teamHasBall(bot) {
    const ball = this.scene.ball;
    if (!ball || !ball.owner) return false;
    if (ball.owner.isGoalkeeper)
      return ball.owner === this.getOwnGoalkeeper(bot);
    return ball.owner.isPlayerTeam === bot.isPlayerTeam;
  }

  applySpacing(bot, targetX, targetY, minDistance = 145) {
    const teammates = this.getTeamPlayers(bot.isPlayerTeam).filter(
      (p) => p !== bot,
    );
    let pushX = 0;
    let pushY = 0;

    teammates.forEach((tm) => {
      const dist = Phaser.Math.Distance.Between(targetX, targetY, tm.x, tm.y);
      if (dist > 0 && dist < minDistance) {
        const angle = Phaser.Math.Angle.Between(tm.x, tm.y, targetX, targetY);
        const strength = (minDistance - dist) / minDistance;
        pushX += Math.cos(angle) * strength * 72;
        pushY += Math.sin(angle) * strength * 72;
      }
    });

    return { x: targetX + pushX, y: targetY + pushY };
  }

  keepAwayFromGoalkeeper(bot, targetX, targetY) {
    const gk = this.getOwnGoalkeeper(bot);
    if (!gk || !gk.isHoldingBall) return { x: targetX, y: targetY };

    const dist = Phaser.Math.Distance.Between(targetX, targetY, gk.x, gk.y);
    const minDist = bot.archetype === ARCHETYPES.FIXO ? 190 : 230;
    if (dist >= minDist) return { x: targetX, y: targetY };

    const angle = Phaser.Math.Angle.Between(gk.x, gk.y, targetX, targetY);
    return {
      x: gk.x + Math.cos(angle) * minDist,
      y: gk.y + Math.sin(angle) * minDist,
    };
  }

  clampCourt(x, y) {
    const pX = this.scene.PITCH_X || 200;
    const pY = this.scene.PITCH_Y || 200;
    const pW = this.scene.PITCH_WIDTH || 1600;
    const pH = this.scene.PITCH_HEIGHT || 1000;

    return {
      x: Phaser.Math.Clamp(x, pX + 45, pX + pW - 45),
      y: Phaser.Math.Clamp(y, pY + 45, pY + pH - 45),
    };
  }

  /** Onde fica o posto do pivô, em pixels, para este time. */
  pivotZoneCenter(bot) {
    const pX = this.scene.PITCH_X || 200;
    const pY = this.scene.PITCH_Y || 200;
    const pW = this.scene.PITCH_WIDTH || 1600;
    const pH = this.scene.PITCH_HEIGHT || 1000;
    const forma = FORMATION.SHAPE[ARCHETYPES.PIVOT];
    const depth = this.getAttackDir(bot) > 0 ? forma.depth : 1 - forma.depth;
    return { x: pX + depth * pW, y: pY + forma.lane * pH };
  }

  /**
   * Ocupação da área: se NINGUÉM do time está na zona do pivô, o passe final
   * não tem para quem ir. Um ala corta em diagonal e assume a finalização —
   * o do lado OPOSTO à bola, que é o que chega no espaço vazio em vez de
   * empilhar em cima do portador.
   *
   * A escolha é determinística (lado da bola, desempate no WING_L): dois alas
   * cortando ao mesmo tempo esvaziam a lateral e não resolvem nada.
   * Devolve o arquétipo cuja forma o bot deve usar AGORA.
   */
  rotatedShapeKey(bot) {
    if (
      bot.archetype !== ARCHETYPES.WING_L &&
      bot.archetype !== ARCHETYPES.WING_R
    )
      return bot.archetype;

    const zona = this.pivotZoneCenter(bot);
    const meuTime = this.getTeamPlayers(bot.isPlayerTeam);
    // Sem time em campo não há zona vazia a ocupar — só lista vazia.
    if (meuTime.length === 0) return bot.archetype;
    const ocupada = meuTime.some(
      (p) =>
        Phaser.Math.Distance.Between(p.x, p.y, zona.x, zona.y) <
        FORMATION.PIVOT_ZONE_RADIUS,
    );
    if (ocupada) return bot.archetype;

    // O ala do lado contrário ao da bola é quem tem o espaço para atacar.
    const ball = this.scene.ball;
    const bolaEmCima = ball ? ball.y < zona.y : false;
    const oposto = bolaEmCima ? ARCHETYPES.WING_R : ARCHETYPES.WING_L;
    return bot.archetype === oposto ? ARCHETYPES.PIVOT : bot.archetype;
  }

  /**
   * Posto BASE do arquétipo: só a forma, sem bola, sem posse e sem giro.
   *
   * É o que serve para POSICIONAR gente (saída de bola, escalação da LAN), e
   * não o `getTargetPosition`: aquele depende do estado do instante, e no
   * instante em que todo mundo ainda está no lugar do spawn a zona do pivô
   * conta como vazia — aí a rotação promove um ala a pivô e os dois nascem em
   * cima um do outro (medido: 10px de distância).
   */
  postoBase(bot) {
    const forma = FORMATION.SHAPE[bot.archetype];
    if (!forma) return null;
    const pX = this.scene.PITCH_X || 200;
    const pY = this.scene.PITCH_Y || 200;
    const pW = this.scene.PITCH_WIDTH || 1600;
    const pH = this.scene.PITCH_HEIGHT || 1000;
    const attackDir = this.getAttackDir(bot);
    const depth = attackDir > 0 ? forma.depth : 1 - forma.depth;
    return this.clampCourt(pX + depth * pW, pY + forma.lane * pH);
  }

  /**
   * Posto do bot: home point do arquétipo, deslizado pela posse e pela bola.
   * A versão anterior colava ala e pivô no `ball.x` — daí o time inteiro correr
   * atrás da bola em vez de manter forma. Aqui a bola só DESLOCA o losango.
   */
  getTargetPosition(bot) {
    if (!FORMATION.SHAPE[bot.archetype]) return null;

    const pX = this.scene.PITCH_X || 200;
    const pY = this.scene.PITCH_Y || 200;
    const pW = this.scene.PITCH_WIDTH || 1600;
    const pH = this.scene.PITCH_HEIGHT || 1000;
    const attackDir = this.getAttackDir(bot);
    const ball = this.scene.ball;

    // Fração do campo no sentido do ataque DELE: 0 = gol próprio, 1 = o outro.
    const profundidadeDe = (x) => {
      const f = (x - pX) / pW;
      return attackDir > 0 ? f : 1 - f;
    };
    const bolaDepth = ball
      ? Phaser.Math.Clamp(profundidadeDe(ball.x), 0, 1)
      : 0.5;
    const bolaLane = ball ? Phaser.Math.Clamp((ball.y - pY) / pH, 0, 1) : 0.5;

    // Giro de futsal: o ala promovido joga com a forma do pivô.
    const papel = this.rotatedShapeKey(bot);
    const forma = FORMATION.SHAPE[papel];

    const comPosse = this.teamHasBall(bot);
    // Desespero: goleiro-linha. O bloco inteiro sobe e o fixo abandona o posto.
    const desespero =
      TacticManager.matchUrgency(this.scene, bot.isPlayerTeam) === "desperate"
        ? FORMATION.DESPERATE_PUSH
        : 0;
    // Ruptura: posse no campo de ataque solta ala e pivô à frente do posto.
    const ruptura =
      comPosse &&
      bolaDepth > 0.5 &&
      FORMATION.RUNNERS.includes(papel)
        ? FORMATION.ATTACKING_RUN / pW
        : 0;

    const depth = Phaser.Math.Clamp(
      forma.depth +
        (comPosse ? FORMATION.PUSH_UP : -FORMATION.DROP_BACK) +
        ruptura +
        desespero +
        (bolaDepth - 0.5) * FORMATION.BALL_FOLLOW,
      FORMATION.DEPTH_MIN,
      FORMATION.DEPTH_MAX,
    );
    const lane = Phaser.Math.Clamp(
      forma.lane + (bolaLane - 0.5) * FORMATION.BALL_SHIFT,
      FORMATION.LANE_MIN,
      FORMATION.LANE_MAX,
    );

    const alvoX = pX + (attackDir > 0 ? depth : 1 - depth) * pW;
    const alvoY = pY + lane * pH;

    // Espaçamento e recuo do goleiro já moravam aqui e nunca eram chamados.
    const espacado = this.applySpacing(bot, alvoX, alvoY);
    const livre = this.keepAwayFromGoalkeeper(bot, espacado.x, espacado.y);
    return this.clampCourt(livre.x, livre.y);
  }
}

// =============================================================================
// Check: o losango. O bug que isto pega não aparece no console — aparece como
// "o time todo correndo atrás da bola", que foi o que a versão anterior fazia
// ao colar ala e pivô no `ball.x`.
// =============================================================================
console.assert(
  (() => {
    if (typeof Phaser === "undefined" || !Phaser.Math) return true;
    // Cena falsa: campo padrão, sem goleiros, bola onde o teste mandar.
    const cena = (bolaX, bolaY, donoDaBola) => ({
      PITCH_X: 200,
      PITCH_Y: 200,
      PITCH_WIDTH: 1600,
      PITCH_HEIGHT: 1000,
      isSecondHalf: false,
      gkTop: null,
      gkBottom: null,
      ball: { x: bolaX, y: bolaY, owner: donoDaBola },
      allPlayers: [],
    });
    const bot = (arquetipo, isPlayerTeam = true) => ({
      archetype: arquetipo,
      isPlayerTeam,
      x: 0,
      y: 0,
    });
    // Time completo COM o pivô no posto dele: assim as medidas abaixo são da
    // formação normal, não da rotação. As entidades entram em `allPlayers` e
    // são as MESMAS consultadas — senão `applySpacing` empurraria o alvo.
    const pos = (arquetipo, cenaAtual) => {
      const time = [
        { ...bot(ARCHETYPES.FIXO), x: 1640, y: 700 },
        { ...bot(ARCHETYPES.WING_L), x: 1192, y: 360 },
        { ...bot(ARCHETYPES.WING_R), x: 1192, y: 1040 },
        { ...bot(ARCHETYPES.PIVOT), x: 552, y: 700 },
      ];
      cenaAtual.allPlayers = time;
      const alvo = time.find((p) => p.archetype === arquetipo);
      return new TacticManager(cenaAtual).getTargetPosition(alvo);
    };

    // Time do usuário no 1º tempo ataca para a ESQUERDA (attackDir -1): gol
    // próprio na direita, então o fixo fica com X MAIOR que o pivô.
    const meio = cena(1000, 700, null);
    const fixo = pos(ARCHETYPES.FIXO, meio);
    const pivo = pos(ARCHETYPES.PIVOT, meio);
    const alaCima = pos(ARCHETYPES.WING_L, meio);
    const alaBaixo = pos(ARCHETYPES.WING_R, meio);

    // Mesma bola, só mudando a posse: com ela o bloco sobe (X menor).
    const comPosse = cena(1000, 700, { isPlayerTeam: true });
    const semPosse = cena(1000, 700, { isPlayerTeam: false });

    // Basculação: bola em cima puxa o losango para cima.
    const bolaEmCima = pos(ARCHETYPES.FIXO, cena(1000, 350, null));
    const bolaEmBaixo = pos(ARCHETYPES.FIXO, cena(1000, 1050, null));

    return (
      // Losango: fixo atrás do pivô, alas abertas nas duas laterais.
      fixo.x > pivo.x &&
      alaCima.y < 700 &&
      alaBaixo.y > 700 &&
      Math.abs(alaCima.y - alaBaixo.y) > 400 &&
      // Alas no meio da profundidade, entre o fixo e o pivô.
      alaCima.x < fixo.x &&
      alaCima.x > pivo.x &&
      // Sobe com a posse, recua sem ela (ataca para a esquerda: menor = frente).
      pos(ARCHETYPES.PIVOT, comPosse).x < pos(ARCHETYPES.PIVOT, semPosse).x &&
      pos(ARCHETYPES.FIXO, comPosse).x < pos(ARCHETYPES.FIXO, semPosse).x &&
      // Bascula para o lado da bola, sem trocar de lado.
      bolaEmCima.y < bolaEmBaixo.y &&
      // Ruptura: posse no campo de ATAQUE (ataca para a esquerda, bola em
      // x=500) manda ala e pivô à frente do posto; o fixo fica.
      pos(ARCHETYPES.PIVOT, cena(500, 700, { isPlayerTeam: true })).x <
        pos(ARCHETYPES.PIVOT, cena(500, 700, { isPlayerTeam: false })).x -
          FORMATION.ATTACKING_RUN &&
      Math.abs(
        pos(ARCHETYPES.FIXO, cena(500, 700, { isPlayerTeam: true })).x -
          (pos(ARCHETYPES.FIXO, cena(500, 700, { isPlayerTeam: false })).x -
            2 * FORMATION.PUSH_UP * 1600),
      ) < 1 &&
      // Ocupação da área. O time do usuário ataca para a ESQUERDA, então a zona
      // do pivô é x = 200 + 0.22*1600 = 552, y = 700.
      (() => {
        // Zona VAZIA e bola em cima: quem corta é o ala de BAIXO (o oposto).
        const c = cena(1000, 400, null);
        c.allPlayers = [
          { archetype: ARCHETYPES.PIVOT, isPlayerTeam: true, x: 1400, y: 700 },
          { archetype: ARCHETYPES.WING_L, isPlayerTeam: true, x: 1000, y: 300 },
          { archetype: ARCHETYPES.WING_R, isPlayerTeam: true, x: 1000, y: 1100 },
        ];
        const tm = new TacticManager(c);
        const papel = (a) => tm.rotatedShapeKey(a);
        const [pivo, alaCima, alaBaixo] = c.allPlayers;
        return (
          Math.round(tm.pivotZoneCenter(pivo).x) === 552 &&
          papel(alaBaixo) === ARCHETYPES.PIVOT &&
          papel(alaCima) === ARCHETYPES.WING_L &&
          papel(pivo) === ARCHETYPES.PIVOT
        );
      })() &&
      // Bola em BAIXO inverte quem corta — sempre o ala do lado oposto.
      (() => {
        const c = cena(1000, 1100, null);
        c.allPlayers = [
          { archetype: ARCHETYPES.WING_L, isPlayerTeam: true, x: 1000, y: 300 },
          { archetype: ARCHETYPES.WING_R, isPlayerTeam: true, x: 1000, y: 1100 },
        ];
        const tm = new TacticManager(c);
        return (
          tm.rotatedShapeKey(c.allPlayers[0]) === ARCHETYPES.PIVOT &&
          tm.rotatedShapeKey(c.allPlayers[1]) === ARCHETYPES.WING_R
        );
      })() &&
      // Posto BASE: um lugar por arquétipo, nos DOIS times, sem ninguém em cima
      // de ninguém. É o que a escalação da LAN usa para posicionar — com o
      // posto tático, a rotação punha dois bonecos no mesmo ponto no spawn.
      (() => {
        const c = cena(1000, 700, null);
        const tm = new TacticManager(c);
        // Unicidade DENTRO do time. Entre times não vale: o posto do pivô de
        // um é o posto do fixo do outro, espelhado — e isso é a formação
        // correta, não colisão.
        const postosDo = (meuTime) =>
          Object.keys(FORMATION.SHAPE).map((arq) => {
            const p = tm.postoBase({ archetype: arq, isPlayerTeam: meuTime });
            return Math.round(p.x) + "," + Math.round(p.y);
          });
        const meus = postosDo(true);
        const deles = postosDo(false);
        return (
          new Set(meus).size === 4 && // ninguém divide posto com companheiro
          new Set(deles).size === 4 &&
          // E o posto base NÃO se mexe com a bola: é a forma pura.
          (() => {
            const c2 = cena(200, 250, { isPlayerTeam: true });
            const outro = new TacticManager(c2).postoBase({
              archetype: ARCHETYPES.PIVOT,
              isPlayerTeam: true,
            });
            const antes = tm.postoBase({
              archetype: ARCHETYPES.PIVOT,
              isPlayerTeam: true,
            });
            return outro.x === antes.x && outro.y === antes.y;
          })()
        );
      })() &&
      // Relógio: fora dos segundos finais o placar não muda nada.
      (() => {
        const c = cena(1000, 700, null);
        const sem = { ...c, isSecondHalf: true, timeLeft: 300, scorePlayer: 0, scoreOpponent: 1 };
        const perdendo = { ...c, isSecondHalf: true, timeLeft: 10, scorePlayer: 0, scoreOpponent: 1 };
        const ganhando = { ...c, isSecondHalf: true, timeLeft: 10, scorePlayer: 2, scoreOpponent: 1 };
        const empate = { ...c, isSecondHalf: true, timeLeft: 10, scorePlayer: 1, scoreOpponent: 1 };
        const primeiroTempo = { ...c, isSecondHalf: false, timeLeft: 10, scorePlayer: 0, scoreOpponent: 1 };
        const u = (cn, meu = true) => TacticManager.matchUrgency(cn, meu);
        return (
          u(sem) === null &&
          u(perdendo) === "desperate" &&
          u(ganhando) === "stall" &&
          u(empate) === null &&
          u(primeiroTempo) === null &&
          // O outro lado vê o mesmo jogo ao contrário.
          u(perdendo, false) === "stall" &&
          u(ganhando, false) === "desperate"
        );
      })() &&
      // Desespero: o fixo abandona o posto e sobe — é o goleiro-linha.
      (() => {
        const normal = cena(1000, 700, null);
        const desespero = { ...normal, isSecondHalf: true, timeLeft: 10,
                            scorePlayer: 0, scoreOpponent: 1 };
        const fixoNormal = pos(ARCHETYPES.FIXO, normal);
        const fixoDesespero = pos(ARCHETYPES.FIXO, desespero);
        // Ataca para a ESQUERDA: subir é X MENOR.
        return (
          fixoDesespero.x < fixoNormal.x - FORMATION.DESPERATE_PUSH * 1600 * 0.9
        );
      })() &&
      // Zona OCUPADA: ninguém abandona a lateral.
      (() => {
        const c = cena(1000, 400, null);
        c.allPlayers = [
          { archetype: ARCHETYPES.PIVOT, isPlayerTeam: true, x: 560, y: 700 },
          { archetype: ARCHETYPES.WING_L, isPlayerTeam: true, x: 1000, y: 300 },
          { archetype: ARCHETYPES.WING_R, isPlayerTeam: true, x: 1000, y: 1100 },
        ];
        const tm = new TacticManager(c);
        return (
          tm.rotatedShapeKey(c.allPlayers[1]) === ARCHETYPES.WING_L &&
          tm.rotatedShapeKey(c.allPlayers[2]) === ARCHETYPES.WING_R
        );
      })() &&
      // No campo de DEFESA a ruptura não vale: ninguém fura linha lá atrás.
      Math.abs(
        pos(ARCHETYPES.PIVOT, cena(1500, 700, { isPlayerTeam: true })).x -
          pos(ARCHETYPES.FIXO, cena(1500, 700, { isPlayerTeam: true })).x,
      ) > 100 &&
      // Arquétipo desconhecido não inventa posto (goleiro cai aqui).
      new TacticManager(meio).getTargetPosition(bot("GK")) === null
    );
  })(),
  "TacticManager: losango fora de forma (fixo/pivô/alas ou basculação)",
);
