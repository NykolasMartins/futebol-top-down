// =============================================================================
// CONSTANTES GLOBAIS DO ESTÁDIO
// =============================================================================
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 1400;
const PITCH_WIDTH = 1600;
const PITCH_HEIGHT = 1000;
const PITCH_X = (WORLD_WIDTH - PITCH_WIDTH) / 2;
const PITCH_Y = (WORLD_HEIGHT - PITCH_HEIGHT) / 2;

const GOAL_WIDTH = 330;
const GOAL_DEPTH = 60;
const GOAL_LINE_OFFSET = 0;

const GK_AREA_WIDTH = 500;
const GK_AREA_HEIGHT = 250;

// =============================================================================
// MÁQUINA DE ESTADOS DA PARTIDA
// =============================================================================
const GameStates = {
  PLAYING: "PLAYING",
  THROW_IN: "THROW_IN",
  CORNER_KICK: "CORNER_KICK",
  GOAL_KICK: "GOAL_KICK",
  FREE_KICK: "FREE_KICK",
  PENALTY: "PENALTY",
  CELEBRATION: "CELEBRATION",
  PAUSED: "PAUSED",
};

// "É bola parada?" num lugar só. A pergunta estava copiada em Player, Enemy e
// AIBrain — estado novo (a falta) só valia em quem lembrasse de editar os três.
// Nome diferente de `isSetPiece` de propósito: esse é o nome da variável LOCAL
// nas três funções, e a global ficaria na sombra dela.
const ehBolaParada = (state) =>
  state === GameStates.THROW_IN ||
  state === GameStates.CORNER_KICK ||
  state === GameStates.GOAL_KICK ||
  state === GameStates.FREE_KICK ||
  state === GameStates.PENALTY;

// =============================================================================
// ARBITRAGEM — FALTA
// =============================================================================
const FOUL = {
  // Faixa de falta: quanto ALÉM do próprio alcance de bola o bote ainda pega o
  // homem. É banda, não raio fixo, porque o alcance muda (carrinho alcança 62,
  // bote 36, e o atributo `defending` mexe nos dois): com raio fixo em 52 o
  // carrinho NUNCA cometia falta — ele alcançava a bola antes, sempre, e o
  // cartão de entrada dura ficava sendo regra morta.
  CONTACT_BAND: 16,
  // O árbitro deixa correr. Sem isso todo dash mal dado parava o jogo — a IA
  // dá bote o tempo todo e não sobrava partida.
  CHANCE: 0.35,
  // Carrinho errado quase sempre é falta: é entrada com o corpo, não disputa.
  SLIDE_CHANCE: 0.8,
  // Cartão por REINCIDÊNCIA, não por sorteio: a cada N faltas do MESMO jogador
  // sai um amarelo, e o segundo amarelo é vermelho. Previsível de propósito —
  // cartão que o jogador não consegue antecipar não muda como ele joga.
  // Em 2 o jogo virava chuva de amarelo, porque falta é comum aqui.
  CARD_EVERY: 3,
};

// Tira do cartão desenhada EM CAMPO, acima do nome. A cor mora aqui porque
// quem desenha é o Phaser (0xRRGGBB); o lado DOM do placar lê `--cartao-*` do
// ui.css. Uma fonte por domínio — não há como o Phaser ler variável CSS.
const CARD_HUD = {
  W: 7,
  H: 15,
  GAP: 3,
  Y_OFFSET: 50, // acima do rótulo de nome, que fica em -34
  YELLOW: 0xffd400,
};

// =============================================================================
// GAME FEEL — o tempo entre a intenção e a resposta
// =============================================================================
// Jogabilidade boa e timing ruim é a diferença entre "funciona" e "gostoso".
// Estes números não mudam NENHUMA regra: mudam quanto o jogo faz o jogador
// Inclinação da câmera sobre o campo. É o COSSENO do ângulo de queda: 1 é
// top-down puro (o que o jogo era), 0.8 ≈ 37° e é o que casa com bonecos
// desenhados em high top-down. Quem aplica é o `Perspectiva`, e mexer aqui é
// o único jeito de afinar — o número não está escrito em lugar nenhum além
// deste. Abaixo de ~0.65 o campo vira uma faixa e a marcação some.
// Feedback visual da partida. Tudo aqui é PROPORCIONAL a um número que a
// jogada já produziu (força do chute, velocidade da bola, do boneco) — efeito
// de tamanho fixo diz "aconteceu algo" e nada mais, e é isso que faz um jogo
// parecer surdo. Os tetos existem para a tela não virar poeira.
const FEEDBACK = {
  RASTRO_V_MIN: 200, // px/s: abaixo disso a bola não deixa rastro
  RASTRO_CURVA: 0.55, // piso de rastro da bola rodando, mesmo devagar
  POEIRA_CORRIDA_MS: 150, // intervalo entre nuvens de quem corre
  POEIRA_CARRINHO_MS: 55, // o carrinho é contínuo: arranca grama o tempo todo
  CHUTE_TREMOR_MIN: 0.72, // fração da força a partir da qual o chute sacode
  PARTICULAS_MIN: 3, // nuvem mais fraca possível
  PARTICULAS_MAX: 18, // e a mais forte
};

const PERSPECTIVA = {
  ACHATAMENTO_Y: 0.8,
};

// esperar e quanto ele confirma o que acabou de acontecer. Afine jogando —
// é o único jeito de avaliar feel.
const GAME_FEEL = {
  // ── Buffer de input ───────────────────────────────────────────────────────
  // Apertar chute/passe um pouco ANTES de dominar a bola executa a jogada no
  // instante em que ela chega. É o que faz o jogo responder ao que o jogador
  // quis, e não ao frame exato em que ele apertou.
  //
  // O passe já era enfileirado, mas SEM PRAZO: um comando de dez segundos atrás
  // disparava quando a bola enfim chegasse — o boneco fazia algo que ninguém
  // mais estava pedindo. Agora o pedido vence.
  INPUT_BUFFER_MS: 220,

  // ── Bola parada: o tempo em que ninguém joga ──────────────────────────────
  // Era 400 + 600 de fade e 1800 até a IA cobrar: quase 2,8s parado a cada
  // lateral. Encurtar aqui é o que mais muda a sensação de ritmo do jogo.
  SETPIECE_FADE_OUT_MS: 240,
  SETPIECE_FADE_IN_MS: 360,
  SETPIECE_AI_DELAY_MS: 850,

  // ── Confirmação do gol ────────────────────────────────────────────────────
  // Congelar por um instante no gol é o "peso" que o replay sozinho não dá.
  GOAL_HITSTOP_MS: 110,
  GOAL_SHAKE_MS: 240,
  GOAL_SHAKE_INTENSITY: 0.009,

  // Espera antes de sair da partida para a tela de fim de jogo.
  ENDGAME_DELAY_MS: 1100,
};

// =============================================================================
// VERSÃO
// =============================================================================
// MAJOR: virada grande no jogo. MINOR: feature nova. PATCH: correção ou ajuste.
// Aparece no canto superior direito em TODA tela. Existe por um motivo prático:
// o navegador serve JS velho calado, e "a versão da tela não é a que subi" é a
// única forma barata de separar cache de regressão.
const GAME_VERSION = "1.15.0";

// =============================================================================
// FÍSICA DA BOLA
// =============================================================================
const BALL_PHYSICS = {
  // Velocidade que sai do pé no CHUTE. Acompanha o PACE_SCALE: jogador mais
  // lento com bola igualmente rápida = defesa que nunca alcança nada.
  // (O PASSE não passa por aqui — ele é governado por PASS_SPEED_MIN/MAX.)
  KICK_SPEED_SCALE: 0.71,
  GRAVITY_Z: 0.45,
  BOUNCE_Z: 0.65,
  // Atrito do chão. Ele governa o ALCANCE de tudo que rola: com o teto de
  // 800px/s no passe, 0.958 (k=2.57/s) só entregava a bola até 311px e todo
  // passe médio morria no caminho. Em 0.978 (k=1.33/s) o teto cobre 600px.
  FRICTION_GROUND: 0.978,
  FRICTION_AIR: 0.99,
  FRICTION_RAIN: 0.985,
  BOUNCE_COLLISION: 0.6,
  MIN_VELOCITY_CUTOFF: 5,
  MAX_CATCH_HEIGHT_FIELD: 28,
  PLAYER_REACH_BASE: 40,
  // ── Passe (futsal: a bola tem de CHEGAR) ─────────────────────────────────
  // Com atrito geométrico a bola percorre no máximo `v0/k`, e `k` sai do
  // FRICTION_GROUND. A velocidade de saída é derivada daí em `passForceFor()`:
  // distância a cobrir + tempo de viagem alvo. Piso alto = passe curto seco.
  PASS_SPEED_MIN: 480, // px/s: piso do toque curto, para sair seco
  // TETO RÍGIDO. Acima disso o passe é impossível de dominar — melhor a bola
  // demorar mais do que virar pedrada. É o último corte do cálculo.
  PASS_SPEED_MAX: 700, // px/s
  // Duas exigências, e a força é a MAIOR das duas (antes do teto):
  //   chegar ainda rolando forte  -> v0 = d*k + PASS_ARRIVAL_SPEED_MIN
  //   chegar dentro do tempo alvo -> v0 = d*k / (1 - e^(-k*T))
  PASS_ARRIVAL_SPEED_MIN: 250, // px/s com que a bola tem de chegar no alvo
  // Tempo de viagem ESCALAR: toque curto é seco, passe longo pode demorar.
  PASS_TRAVEL_TIME_PER_PX: 1 / 600,
  PASS_TRAVEL_TIME_MIN_S: 0.4,
  PASS_TRAVEL_TIME_MAX_S: 1.2,
  BALL_OWNER_PUSH_PASS: 36,
  BALL_OWNER_PUSH_SHOT: 45,
};

// =============================================================================
// ATRIBUTOS BASE DO JOGADOR (cálculo applyAttributes)
// =============================================================================
// Ritmo global da partida. UM knob para a cadência: mexer aqui muda base e
// sprint dos dois times de uma vez. Menor = jogo mais lento, campo parece maior.
const PACE_SCALE = 0.75;

/**
 * Ficha do atleta. É ISTO que vem do payload de inicialização (hoje montado na
 * cena, amanhã vindo de uma API): cinco números de 0 a 100. As constantes
 * abaixo continuam sendo a CURVA — o que a ficha faz é dizer onde cada jogador
 * cai nela. `applyAttributes()` traduz ficha + curva em física da instância.
 */
const DEFAULT_STATS = {
  speed: 75, // velocidade base e de sprint
  power: 75, // força do chute
  stamina: 75, // capacidade de fôlego
  passing: 75, // alcance e critério de passe da IA
  defending: 75, // pressão e bote da IA
};

/** Normaliza a ficha, preenchendo o que faltar. Nunca devolve valor fora de 0-100. */
function normalizeStats(stats) {
  const saida = {};
  for (const chave of Object.keys(DEFAULT_STATS)) {
    const v = stats && typeof stats[chave] === "number" ? stats[chave] : DEFAULT_STATS[chave];
    saida[chave] = Math.min(100, Math.max(0, v));
  }
  return saida;
}

/**
 * Peso de um stat: 1.0 no jogador médio (50), e a distância dali escala pelo
 * `amplitude`. Um `power` 100 com amplitude 0.4 devolve 1.4.
 */
function statWeight(valor, amplitude) {
  return 1 + ((valor - 50) / 50) * amplitude;
}

const PLAYER_ATTR = {
  BASE_SPEED_COEF: 1.9,
  BASE_SPEED_VAR: 0.015,
  // O 0.8 final é o corte de ritmo de -20%: jogo mais cadenciado.
  BASE_SPEED_SCALE: 0.85 * 0.9 * 0.8 * PACE_SCALE,
  SPRINT_SPEED_COEF: 3.8,
  SPRINT_SPEED_VAR: 0.04,
  SPRINT_SPEED_SCALE: 0.85 * 0.9 * 0.8 * PACE_SCALE,
  // Capacidade DOBRADA: o pique tem de durar antes de cobrar. Fórmula:
  // maxStamina = COEF + (atributo - 50) * VAR.
  MAX_STAMINA_COEF: 120,
  MAX_STAMINA_VAR: 2.4,
  MAX_KICK_FORCE_COEF: 13,
  MAX_KICK_FORCE_VAR: 0.18,
  MAX_FORCE_ACCEL: 0.45,
  ENEMY_MAX_KICK_FORCE_COEF: 17,
  ENEMY_MAX_KICK_FORCE_VAR: 0.2,
  ENEMY_MAX_STAMINA_COEF: 140,
  ENEMY_MAX_STAMINA_VAR: 3.0,
};

// =============================================================================
// CUSTOS E RECUPERAÇÃO DE ESTAMINA
// =============================================================================
const STAMINA = {
  // Recarga RÁPIDA, e é escolha de ritmo, não de simulação: com 7.5/s encher do
  // zero levava ~28s e a partida virava caminhada. Em ~22/s o fôlego volta em
  // ~10s e o sprint é decisão de momento, não orçamento da partida inteira.
  // A pausa antes de começar a recarregar é o que ainda pune segurar o sprint.
  RECOVERY_RATE_PER_SEC: 18,
  RECOVERY_AI_PER_SEC: 24,
  RECOVERY_DELAY_MS: 700,
  DEPLETED_RECOVERY_DELAY_MS: 1200,
  DASH_COST: 25,
  KICK_COST: 10,
  PASS_COST: 5,
  SPRINT_PER_SEC: 20,
  DASH_PER_SEC: 30,
  LOW_STAMINA_PCT: 0.2,
  LOW_STAMINA_SPEED_PENALTY: 0.7,
  DEPLETED_BASE_SPEED_PENALTY: 0.7,
  EXHAUSTED_RECOVERY_THRESHOLD: 5,
  // Piso da capacidade. A fórmula `COEF + (atributo - 50) * VAR` chega a ZERO
  // (e a negativo na IA) com atributo baixo, e maxStamina 0 estoura toda conta
  // de `stamina / maxStamina`. Piso acima do custo de um bote.
  MIN_CAPACITY: 40,
};

// =============================================================================
// DASH / BOTE / TACKLE
// =============================================================================
const TACKLE = {
  DASH_DURATION_MS: 190,
  DASH_COOLDOWN_MS_PLAYER: 1050,
  DASH_COOLDOWN_MS_AI: 1850,
  DASH_SPEED_MULT: 1.38,
  DASH_SPEED_MULT_AI: 1.32,
  MISSED_TACKLE_SLOW_MS: 520,
  MISSED_TACKLE_SLOW_MS_AI: 480,
  MISSED_TACKLE_SLOW_PCT: 0.4,
  STEAL_TRIGGER_DIST: 82,
  // Alcance do desarme em si: a que distância da BOLA o bote conecta. Vivia
  // cravado no GameScene enquanto STEAL_TRIGGER_DIST (que é o gatilho da IA,
  // outra coisa) ficava aqui sem ninguém ler.
  BALL_HIT_RANGE: 36,
  // CARRINHO: o bote comprometido. Vai mais longe, corre mais e alcança mais
  // bola — e paga por isso: gasta mais fôlego, deixa mais tempo no chão quando
  // erra e a falta dele é cartão na hora. Sai com SHIFT + ESPAÇO (correndo).
  // Reusa a máquina do dash inteira; só troca os números e liga `isSliding`.
  SLIDE_DURATION_MS: 340,
  SLIDE_COOLDOWN_MS: 1800,
  SLIDE_SPEED_MULT: 1.85,
  SLIDE_BALL_HIT_RANGE: 62,
  SLIDE_STAMINA_MULT: 1.6,
  SLIDE_MISSED_SLOW_MS: 900,
  TACKLE_IMPULSE: 0.4,
  INVULN_AFTER_PICKUP_MS: 1500,
  BALL_STEAL_COOLDOWN_MS: 500,
  // Micro-congelamento no roubo de bola: sem ele a troca de posse é invisível.
  // Acima de ~90ms começa a parecer travamento, não impacto.
  HIT_STOP_MS: 70,
  PASS_STEAL_COOLDOWN_MS: 450,
  SHOT_STEAL_COOLDOWN_MS: 550,
};

// =============================================================================
// CÂMERA — ZOOM CONTEXTUAL
// =============================================================================
// O zoom conta a história: abre quando a bola corre (dá para ver o ala abrindo
// espaço) e fecha quando ela entra no terço final devagar (cara a cara).
// Interpolado por LERP — corte seco de zoom embrulha o estômago.
const CAMERA = {
  // Suavidade do acompanhamento. A bola corre mais que o boneco, então segui-la
  // com o mesmo lerp embrulha o estômago: mais lento = a câmera "respira".
  LERP_JOGADOR: 0.08,
  LERP_BOLA: 0.055,
  ZOOM_WIDE: 0.9, // bola rápida ou no meio de campo
  ZOOM_DEFAULT: 1.0,
  ZOOM_TIGHT: 1.18, // terço final, jogada armada
  // Acima desta velocidade (px/s) a bola está em transição: abre.
  FAST_BALL_SPEED: 700,
  // Fração do campo, a partir do gol, que conta como terço final.
  DANGER_ZONE_PCT: 0.3,
  LERP: 0.02, // por frame; mais alto = zoom nervoso
};

// =============================================================================
// COMPORTAMENTO DE IA — DISTÂNCIAS E TEMPOS
// =============================================================================
// Inércia dos jogadores (Arcade Physics). Velocidade no jogo é `unidade * 60`,
// então estes valores estão em px/s². Botões de calibração:
//   ACCELERATION menor = arranque mais pesado; DRAG menor = desliza mais.
// A física da BOLA não passa por aqui (ver BALL_PHYSICS) — de propósito.
const PLAYER_PHYSICS = {
  ACCELERATION: 1100, // ~0,25s para chegar à velocidade base
  DRAG: 1400, // freia sozinho ao soltar o controle: deslize curto e visível
  TURN_BOOST: 1.7, // trocar de direção puxa mais forte, senão a virada empasta
  DASH_DRAG: 600, // rajada do bote desacelera mais devagar
};

// Estados da FSM da IA (AIBrain). Um jogador está em exatamente um por frame.
const AI_STATES = {
  WITH_BALL: "WITH_BALL", // é o dono da bola: chuta, dribla ou passa
  DRIVE_TO_GOAL: "DRIVE_TO_GOAL", // dono, terço final e corredor limpo: infiltra
  SHIELD_BALL: "SHIELD_BALL", // dono, marcado nas costas: segura e espera apoio
  SUPPORTING: "SUPPORTING", // time tem a bola: abre linha de passe / avança
  PRESSING: "PRESSING", // adversário tem a bola e ele é o mais próximo: bote
  DEFENDING_POSITION: "DEFENDING_POSITION", // volta à posição tática
  RETREATING: "RETREATING", // longe do próprio gol com a bola perdida: recompõe
};

const AI_BEHAVIOR = {
  // ── Custo de CPU (ver AIBrain) ────────────────────────────────────────────
  // Decisão pesada (estado, alvo de chute, alvo de passe) roda neste intervalo,
  // não a 60fps. A MIRA continua por frame: o que é caro é ESCOLHER, não apontar.
  DECISION_INTERVAL_MS: 180,
  // Varredura de allPlayers (marcador mais próximo, companheiro mais perto da
  // bola, goleiro adversário) reaproveitada por este tempo.
  SCAN_CACHE_MS: 100,
  // Alvos avaliados na boca do gol: 7 de perto, 3 de longe. Cada alvo custa uma
  // varredura de bloqueio contra todos os adversários.
  SHOT_TARGETS_NEAR: 7,
  SHOT_TARGETS_FAR: 3,
  SHOT_TARGET_NEAR_DIST: 300,

  // ── Comportamento tático sem a bola ───────────────────────────────────────
  // Até onde o defensor sai do posto para cortar linha de passe. Acima disso a
  // marcação vira perseguição individual e abre buraco na zona.
  DEFENSE_ZONE_RADIUS: 260,
  // 0 = em cima da bola, 1 = em cima do atacante. 0.55 fica do lado do atacante,
  // que é onde a bola vai passar.
  LANE_CUT_BIAS: 0.55,
  // Terço final: a partir daqui ala e pivô procuram as costas da zaga.
  FINAL_THIRD_PCT: 0.66,
  THROUGH_RUN_DEPTH: 140, // quanto passa do último zagueiro
  THROUGH_RUN_FREE_RADIUS: 110, // raio sem adversário para o espaço valer
  // Hold up play: pressionado a menos que isto, sem chute nem passe, ele
  // protege a bola em vez de forçar.
  HOLD_UP_PRESSURE_DIST: 70,
  HOLD_UP_TURN_DIST: 120,

  // Ângulo do gol visto do portador. Abaixo disso a finalização é de canto
  // fechado e vira assistência: a IA procura quem está na grande área.
  // Corredor livre exigido para o passe: distância PERPENDICULAR mínima de
  // qualquer adversário à reta passador→recebedor. Subir = IA mais cautelosa.
  PASS_LANE_CLEARANCE: 46,
  MIN_SHOT_ANGLE_RAD: 0.22, // ~13°: dentro da área ele arrisca
  // Canto mais perto do goleiro que isto = chute na mão dele. Descartado.
  SHOT_GK_GAP_MIN: 45,
  // Faixa central do gol que nunca é alvo: mirar no meio é mirar no goleiro,
  // que fica ali. Todo chute sai cravado num canto.
  SHOT_CENTER_DEADZONE: 30,
  // Passe pró-gol: o companheiro na área precisa ter o gol ESTE tanto mais
  // aberto que o meu. 1.0 tornaria qualquer empate técnico um passe.
  UNSELFISH_ANGLE_EDGE: 1.25,
  // ── Ficha do atleta virando comportamento (ver DEFAULT_STATS) ─────────────
  // Amplitude de cada stat sobre a decisão. 0 = stat ignorado, 0.4 = o extremo
  // da escala mexe 40% no valor. Subir demais faz craque e perna-de-pau
  // jogarem jogos diferentes; a física deles já difere por conta própria.
  STAT_POWER_SHOT_AMPLITUDE: 0.4, // power alto = aceita chute de nota menor
  STAT_SPEED_DRIVE_AMPLITUDE: 0.35, // speed alto = infiltra de mais longe
  STAT_PASSING_RANGE_AMPLITUDE: 0.25, // passing alto = enxerga passe mais longe
  // Zagueiro bom bate a carteira em movimento e cobre mais espaço. Amplitude
  // maior na velocidade porque é ali que a diferença aparece em campo.
  STAT_DEFENDING_STEAL_AMPLITUDE: 0.5, // roubo por contato: teto de velocidade
  STAT_DEFENDING_REACH_AMPLITUDE: 0.25, // alcance do bote e do corte de linha
  // ── Força e tempo de carga do chute da IA ─────────────────────────────────
  // O bot não chuta no frame em que decide: ele engatilha. O tempo de carga E a
  // força saem do MESMO número (`shotPower`), que vem da distância ao gol.
  // Perto da linha, chute forte é bica: basta vencer o goleiro.
  SHOT_POWER_MIN: 0.4, // fração da força máxima na pequena área
  SHOT_POWER_NEAR_DIST: 150, // daqui para dentro é sempre a força mínima
  SHOT_WINDUP_MIN_MS: 200, // carga do toque suave
  SHOT_WINDUP_MAX_MS: 400, // carga do chute de fora da área
  // Chute de primeira: quem recebe a assistência na área já vem com a intenção
  // armada e dispara no frame da recepção, sem carga.
  FIRST_TIME_INTENT_MS: 1200, // validade da intenção; depois ele domina normal
  FIRST_TIME_POWER: 0.55,
  // Nota da finalização (abertura em rad * 100 + folga do goleiro em px).
  // Abaixo disso, companheiro melhor colocado na área tem prioridade.
  SHOT_GOOD_SCORE: 130,
  BOX_ASSIST_BONUS: 1800, // peso extra para aliado dentro da área
  // Desmarque: deslocamentos laterais tentados, em px, até abrir a linha de
  // passe. Dos dois lados e em duas amplitudes — mais que isso vira corrida.
  SUPPORT_SIDESTEPS: [90, -90, 170, -170],
  // Distância máxima que a IA considera para um passe. Tem de caber no alcance
  // que o atrito permite (`PASS_SPEED_MAX / k`), senão ela mira em quem a bola
  // nunca alcança — o check em GameScene.js trava isso.
  PASS_RANGE_MAX: 450,
  // Passe em profundidade: o ponto previsto nunca cai a menos disto do goleiro
  // adversário. Liderar o passe para dentro da pequena área é dar a bola a ele.
  LEAD_KEEPER_CLEARANCE: 110,
  PASS_RANGE_MIN: 100,
  // ── Relógio e placar ──────────────────────────────────────────────────────
  // Últimos segundos do 2º tempo: quem perde ataca de tudo, quem ganha faz
  // cera. Fora dessa janela a IA joga igual, ganhando ou perdendo.
  ENDGAME_SEC: 45,
  DESPERATE_ANGLE_MULT: 0.35, // exigência de ângulo cai: chuta de qualquer lugar
  DESPERATE_PUSH: 0.3, // fração de campo que o bloco inteiro sobe no desespero
  STALL_BACK_BONUS: 2500, // peso do companheiro recuado quando se faz cera

  // Jogo de pivô: recebeu no terço final com zagueiro colado nas costas. Ele
  // segura a bola de costas e espera o ala passar voando pelo lado.
  SHIELD_MARK_DIST: 90, // zagueiro mais perto que isto = colado
  SHIELD_MAX_MS: 1800, // teto da espera; depois volta a jogar normal
  SHIELD_LAYOFF_LEAD: 40, // quanto o ala precisa ter passado da linha da bola

  // Ultrapassagem (1-2): quem toca no campo de ataque, VAI — nas costas da
  // marcação, rumo à linha de fundo. E não recua enquanto o timer correr.
  ONE_TWO_RUN_MS: 2500,
  ONE_TWO_RUN_DEPTH: 220, // piso do avanço quando a linha de fundo está perto
  // Quanto ele para antes da linha de fundo: em cima dela não dá ângulo.
  ONE_TWO_BYLINE_INSET: 120,

  // Segundo pau: ala invadindo a lateral da área sem ângulo cruza rasteiro na
  // trave oposta, e o aliado mais adiantado ataca aquela coordenada.
  FAR_POST_OFFSET: 40, // quanto para DENTRO da trave o alvo fica
  FAR_POST_RUN_DIST: 90, // distância à frente da trave onde o atacante espera
  // Infiltração: com corredor limpo ele CORRE até aqui em vez de procurar passe
  // (era o passe para trás com o gol aberto). Daqui para dentro volta a
  // WITH_BALL, que finaliza — ou seja, é o goleiro que força o chute.
  DRIVE_UNTIL_DIST: 300,
  // Largura do corredor de infiltração: adversário mais perto que isto da reta
  // até o gol fecha a corrida. Mais largo que o do passe, que a bola vai no pé.
  DRIVE_LANE_CLEARANCE: 70,
  // Evasão na infiltração: raio curto à frente do portador. Zagueiro aí dentro
  // não aborta a corrida — ele desvia 45° para o lado mais livre e segue.
  DRIVE_EVADE_LOOKAHEAD: 80,
  DRIVE_EVADE_ANGLE_RAD: Math.PI / 4,
  DRIVE_EVADE_STEP: 160, // quanto o ponto de fuga anda na diagonal
  // Roubada por contato: encostou na bola do adversário andando ABAIXO deste
  // múltiplo da velocidade base, a posse troca. Correndo, não — atropelou.
  CONTACT_STEAL_SPEED_MULT: 1.15,

  DODGE_TRIGGER_DIST: 85,
  DODGE_TIMER_MS: 550,
  DODGE_FADE_DURATION_MS: 450,
  SPRINT_STAMINA_THRESHOLD: 15,
  CORNER_ATTACK_UPDATE_INTERVAL_MS: 800,
  CORNER_ATTACK_SPREAD_PCT: 0.4,
  PIVOT_OFFSET_TO_BALL: 80,
  SHOOT_DISTANCE_THRESHOLD: 420,
  SHOOT_CLEARSHOT_DIST: 500,
  FIRST_TIME_SHOT_DIST: 350,
  PRESS_BALL_CONE_RAD: Math.PI / 1.5,
  INTERCEPT_PREDICT_FACTOR_MAX: 1.0,
  PRESS_SPRINT_DIST: 100,
  LONG_SPRINT_DIST: 300,
  LONG_SPRINT_STAMINA: 30,
  PASS_MIN_DIST: 100,
  PASS_MAX_DIST: 620,
  PASS_ALLOW_BACKWARDS_ONLY_EXTREME_PRESS_DIST: 50,
  EXTREME_PRESSURE_DIST: 50,
  SUPPORT_RUN_TARGET_DIST: 50,
  COUNTERATTACK_BACKFIELD_PCT: 0.6,
  STAMINA_LOW_WARN_PCT: 0.2,
  SEPARATION_MIN_DIST: 45,
  SEPARATION_STRENGTH: 1.5,
};

// =============================================================================
// GOLEIRO — ALCANCE E TEMPOS
// =============================================================================
const GOALKEEPER = {
  REACH_STANDING: 48,
  REACH_JUMPING: 90,
  // A que distância da bola o goleiro tenta agarrar. Vivia cravado no
  // `checkCollisions` como `45`, junto dos dois alcances acima — que existiam
  // aqui sem ninguém ler.
  CATCH_DISTANCE: 45,
  COLLIDE_CATCH_DIST: 45,
  // Goleiro pesado: ~45% mais lento que um jogador de linha. Antes ele corria
  // a 3.0, mais rápido que a corrida base de um atleta (1.16 após o corte).
  MOVE_SPEED: 1.4,
  WALK_SPEED_ARMADOR: 1.2,
  PENDULUM_RADIUS_BASE: 40,
  RUSH_MAX_DIST: 140,
  RUSH_FACTOR: 0.4,
  CATCH_COOLDOWN_MS: 450,
  AFTER_PARRY_CATCH_COOLDOWN: 700,
  DIVE_COOLDOWN_AFTER_PARRY: 520,
  REPO_MAX_HOLD_MS: 1450,
  DIVE_TRIGGER_VELOCITY: 200,
  DIVE_MAX_REACH_HORIZONTAL: 180,
  DIVE_SPEED_MIN: 2.2,
  DIVE_SPEED_MAX: 4.6,
  DIVE_SPEED_EFFICIENCY: 0.92,
  DIVE_COOLDOWN_GLOBAL_MS: 1800,
  // ── Goleiro-líbero ────────────────────────────────────────────────────────
  // Bola SOLTA dentro deste raio da trave e que ele alcança antes do atacante:
  // sai da meta e afasta. É o que mata o lançamento nas costas da zaga.
  SWEEP_RADIUS: 420,
  // Margem de segurança: só sai se chegar com esta folga sobre o atacante.
  // Sem ela, empate técnico vira gol feito de fora da área.
  SWEEP_TIME_MARGIN_S: 0.15,
  SWEEP_CLEAR_DIST: 55, // a que distância da bola ele já afasta
  SWEEP_CLEAR_SPEED: 900, // px/s do chutão
  SWEEP_MAX_MS: 2500, // teto da saída: não persegue a bola para sempre
  HITBOX_NORMAL: { w: 26, h: 32, ox: 11, oy: 12 },
  HITBOX_JUMP: { w: 44, h: 26, ox: 2, oy: 14 },
};

// =============================================================================
// CONTROLES E INPUT
// =============================================================================
const INPUT_CONFIG = {
  // Clique curto no botão esquerdo é chute fraco, nunca força zero.
  MIN_KICK_CHARGE_PCT: 0.28,
  TAP_PASS_THRESHOLD_MS: 180,
  CHARGE_VISIBLE_DELAY_MS: 90,
  MAX_KICK_CHARGE_MS: 800,
  CHARGE_MIN_FORCE_RATIO: 0.58,
  CHARGE_MAX_FORCE_RATIO: 1.14,
  KICK_DEFAULT_FORCE: 22,
  GLOBAL_SPEED_TUNE_X: 0.9,
  GLOBAL_SPEED_TUNE_Y: 0.95,
  RAIN_TRACTION_PENALTY: 0.92,
  MOVING_DAMPING: 0.92,
  STOPPED_DAMPING: 0.8,
  RAIN_MOVING_DAMPING: 0.95,
  RAIN_STOPPED_DAMPING: 0.85,
  // Rad/frame que o corpo gira ao mudar de direção. ~14°/frame = meia-volta em
  // ~0.2s: vira visivelmente sem atrasar o comando.
  TURN_RATE_RAD: 0.25,
};

// =============================================================================
// TIPOS DE PASSE — FORÇAS E CONFIGURAÇÕES
// =============================================================================
const PASS_TYPES = {
  THROUGH: {
    FORCE_DIST_COEF: 0.035,
    FORCE_MIN: 12,
    FORCE_MAX: 20,
    SPEED_MULT: 1.2,
    OFFSET_AHEAD: 100,
  },
  CROSS: {
    FORCE_DIST_COEF: 0.03,
    FORCE_MIN: 10,
    FORCE_MAX: 18,
    SPEED_MULT: 1.1,
    ARC_VZ_BASE: 6,
    ARC_VZ_FORCE_COEF: 0.2,
    RANDOM_OFFSET_X: 100,
    CURVE_STRENGTH: 1.2,
    TARGET_AREA_DEPTH: 100,
  },
  SHORT: {
    FORCE_DIST_COEF: 0.025,
    FORCE_MIN: 6,
    FORCE_MAX: 12,
    SPEED_MULT: 1.0,
  },
  NORMAL: {
    FORCE_DIST_COEF: 0.028,
    FORCE_MIN: 7,
    FORCE_MAX: 15,
    SPEED_MULT_PASS: 1.0,
    SPEED_MULT_SHOT: 1.18,
  },
};

// =============================================================================
// HUD / UI
// =============================================================================
const UI_CONFIG = {
  KICK_CHARGE_BAR_W: 96,
  KICK_CHARGE_BAR_H: 10,
  STAMINA_CIRCLE_R: 20,
  CAMERA_FOLLOW_LERP_X: 0.08,
  CAMERA_FOLLOW_LERP_Y: 0.08,
  REPLAY_BUFFER_FRAMES: 180,
  REPLAY_FPS: 60,
  SET_PIECE_TIMEOUT_MS: 8000,
  // Fonte ÚNICA da duração de um tempo. Antes o 1º tempo saía de
  // matchDuration*60 (=300s) e o 2º era 60s hardcoded em dois lugares.
  HALF_DURATION_SEC: 120,
};

// =============================================================================
// PALETTE SWAP — cores-chave da arte base
// =============================================================================
// Medidas na arte real (assets/Personagem-padro-linhas-verticais). A IA gerou
// 19 cores só, mas cada material tem 2-3 tons, e os tons de sombra ficam a
// 64-84 de distância RGB da cor-chave. Por isso a classificação normaliza a
// luminância antes de medir (ver colorMaterial em GameScene.render.js).
// Cores-chave da arte base. MEDIDAS no PNG, não copiadas de especificação: o
// export do sprite novo saiu com 42 tons anti-serrilhados e NENHUM dos hexes da
// paleta nominal existe no arquivo (procurei os 9, zero encontrados). Cada
// valor abaixo é a mediana de luminância da rampa daquela família, sobre os 110
// frames — é ela que ancora o `L_saida = L_alvo + (L_pixel − L_chave)`.
const KIT_KEYS = {
  shirt1: { r: 0x12, g: 0x78, b: 0xba }, // azul   H=203 — camisa e chuteira
  shirt2: { r: 0x9b, g: 0x0c, b: 0x71 }, // magenta H=317 — listras e meião
  shorts: { r: 0xab, g: 0xe9, b: 0x25 }, // lima   H=78  — calção
  skin: { r: 0xb1, g: 0x44, b: 0x1c }, //   laranja H=16  — pele
  hair: { r: 0x2f, g: 0x06, b: 0x69 }, //   violeta H=264 — cabelo (ver abaixo)
};

// O cabelo do sprite VEIO na mesma rampa magenta das listras. Como o swap
// classifica por MATIZ (o arquivo tem 42 tons; hex exato não serve), mudar 1
// dígito não separaria nada — a distância de matiz seria fração de grau. Os
// pixels do cabelo foram girados na arte para 264°, 50° longe do magenta 317°,
// acima do corte de 45° do `colorMaterial`. A cor de origem só precisa ser
// identificável: a cor final vem de `getPlayerAppearance` a cada jogador.

// Calibragem do classificador HSL. Medida sobre TODOS os 80 frames (368 cores
// distintas — a iluminação por direção espalha cada material em dezenas de
// tons, e era isso que fazia a cor "piscar" ao virar de ângulo).
//
// SAT_MIN 0.25 e não 0.20: o contorno (26,17,21) tem saturação HSL 0.21 e
// matiz 333°, colado no magenta — a 0.20 os seus 4718px viravam cor do time
// (shirt1 saltava de 2103px para 6827px). A 0.30 já começa a comer tons
// legítimos de cabelo. O joelho medido é 0.25.
//
// MAX_HUE_DIST 45: shirt1(322°) e hair(287°) ficam a 35° um do outro, então
// passar disso mistura camisa com cabelo.
const SWAP_TUNING = { SAT_MIN: 0.25, MAX_HUE_DIST: 45 };

// =============================================================================
// UNIFORMES DOS TIMES — só cor, a arte é uma só
// =============================================================================
const TEAMS_DB = {
  // Seleções (ver NATIONAL_TEAMS em LeaguesDB.js). Precisam estar AQUI: sem
  // entrada no TEAMS_DB o `buildKitAtlas` cai no fallback do Flamengo e os dois
  // times entram de vermelho, sem erro nenhum no console.
  selecao_brasil: { shirt1: 0xf7d117, shirt2: 0x009c3b, shorts: 0x002776, logo: 0x009c3b },
  selecao_inglaterra: { shirt1: 0xffffff, shirt2: 0xcf081f, shorts: 0x001489, logo: 0xcf081f },
  selecao_espanha: { shirt1: 0xc60b1e, shirt2: 0xffc400, shorts: 0x1a1a6e, logo: 0xffc400 },
  selecao_italia: { shirt1: 0x1a4fa0, shirt2: 0x1a4fa0, shorts: 0xffffff, logo: 0xffffff },
  selecao_alemanha: { shirt1: 0xffffff, shirt2: 0x111111, shorts: 0x111111, logo: 0xdd0000 },
  selecao_franca: { shirt1: 0x1a2a6c, shirt2: 0xffffff, shorts: 0xffffff, logo: 0xce1126 },

  Flamengo: { shirt1: 0xc52728, shirt2: 0x111111, shorts: 0x111111, logo: 0xffffff },
  Palmeiras: { shirt1: 0x006437, shirt2: 0x006437, shorts: 0xffffff, logo: 0xffffff },
  Sao_Paulo: { shirt1: 0xffffff, shirt2: 0xc52728, shorts: 0xffffff, logo: 0x111111 },
  Corinthians: { shirt1: 0xffffff, shirt2: 0x111111, shorts: 0x111111, logo: 0xc52728 },
  Galo: { shirt1: 0x111111, shirt2: 0xffffff, shorts: 0x111111, logo: 0xffffff },
  Cruzeiro: { shirt1: 0x1c3f94, shirt2: 0x1c3f94, shorts: 0xffffff, logo: 0xffffff },
  Gremio: { shirt1: 0x2a6ebb, shirt2: 0x111111, shorts: 0x111111, logo: 0xffffff },
  Inter: { shirt1: 0xc52728, shirt2: 0xc52728, shorts: 0xffffff, logo: 0xffffff },
  Fluminense: { shirt1: 0x8a1538, shirt2: 0x006437, shorts: 0xffffff, logo: 0xffffff },
  Botafogo: { shirt1: 0x111111, shirt2: 0xffffff, shorts: 0x111111, logo: 0xffffff },
  Santos: { shirt1: 0xffffff, shirt2: 0xffffff, shorts: 0xffffff, logo: 0x111111 },
  Vasco: { shirt1: 0x111111, shirt2: 0x111111, shorts: 0xffffff, logo: 0xc52728 },
  Bahia: { shirt1: 0xffffff, shirt2: 0x1c5aa8, shorts: 0xffffff, logo: 0xc52728 },
  Fortaleza: { shirt1: 0x1c3f94, shirt2: 0xc52728, shorts: 0x1c3f94, logo: 0xffffff },
  Mirassol: { shirt1: 0xf5d800, shirt2: 0x006437, shorts: 0x006437, logo: 0xffffff },
  Remo: { shirt1: 0x0b2a6b, shirt2: 0xffffff, shorts: 0xffffff, logo: 0xffffff },
  Real_Madrid: { shirt1: 0xffffff, shirt2: 0xffffff, shorts: 0xffffff, logo: 0x00529f },
  Valencia: { shirt1: 0xffffff, shirt2: 0xffffff, shorts: 0x111111, logo: 0xf5820d },
  Arsenal: { shirt1: 0xc52728, shirt2: 0xffffff, shorts: 0xffffff, logo: 0xffffff },
  Chelsea: { shirt1: 0x1c4fa8, shirt2: 0x1c4fa8, shorts: 0x1c4fa8, logo: 0xffffff },
  man_city: { shirt1: 0x6cabdd, shirt2: 0x6cabdd, shorts: 0xffffff, logo: 0x1c2c5b },
  liverpool: { shirt1: 0xc8102e, shirt2: 0xc8102e, shorts: 0xc8102e, logo: 0xf6eb61 },
  man_united: { shirt1: 0xda291c, shirt2: 0xda291c, shorts: 0xffffff, logo: 0xffe500 },
  tottenham: { shirt1: 0xffffff, shirt2: 0xffffff, shorts: 0x132257, logo: 0x132257 },
  newcastle: { shirt1: 0x241f20, shirt2: 0xffffff, shorts: 0x241f20, logo: 0xffffff },
  aston_villa: { shirt1: 0x670e36, shirt2: 0x95bfe5, shorts: 0xffffff, logo: 0x95bfe5 },
  brighton: { shirt1: 0x0057b8, shirt2: 0xffffff, shorts: 0x0057b8, logo: 0xffffff },
  west_ham: { shirt1: 0x7a263a, shirt2: 0x1bb1e7, shorts: 0xffffff, logo: 0x1bb1e7 },
  barcelona: { shirt1: 0xa50044, shirt2: 0x004d98, shorts: 0x004d98, logo: 0xffed02 },
  atletico_madrid: { shirt1: 0xcb3524, shirt2: 0xffffff, shorts: 0x1b2f5e, logo: 0x1b2f5e },
  athletic_bilbao: { shirt1: 0xee2523, shirt2: 0xffffff, shorts: 0x000000, logo: 0xffffff },
  real_sociedad: { shirt1: 0x0067b1, shirt2: 0xffffff, shorts: 0xffffff, logo: 0x0067b1 },
  betis: { shirt1: 0x00954c, shirt2: 0xffffff, shorts: 0xffffff, logo: 0x00954c },
  villarreal: { shirt1: 0xffe667, shirt2: 0xffe667, shorts: 0x005187, logo: 0x005187 },
  sevilla: { shirt1: 0xffffff, shirt2: 0xffffff, shorts: 0xffffff, logo: 0xd90429 },
  girona: { shirt1: 0xd42a2a, shirt2: 0xffffff, shorts: 0x1b2f5e, logo: 0xffffff },
  inter_milan: { shirt1: 0x0068a8, shirt2: 0x000000, shorts: 0x000000, logo: 0xffffff },
  milan: { shirt1: 0xfb090b, shirt2: 0x000000, shorts: 0xffffff, logo: 0xffffff },
  juventus: { shirt1: 0x000000, shirt2: 0xffffff, shorts: 0xffffff, logo: 0x000000 },
  napoli: { shirt1: 0x12a0d7, shirt2: 0x12a0d7, shorts: 0x12a0d7, logo: 0xffffff },
  roma: { shirt1: 0x8e1f2f, shirt2: 0x8e1f2f, shorts: 0xffffff, logo: 0xf0bc42 },
  lazio: { shirt1: 0x87d8f7, shirt2: 0x87d8f7, shorts: 0xffffff, logo: 0xffffff },
  atalanta: { shirt1: 0x1e71b8, shirt2: 0x000000, shorts: 0x000000, logo: 0xffffff },
  fiorentina: { shirt1: 0x582c83, shirt2: 0x582c83, shorts: 0x582c83, logo: 0xffffff },
  bologna: { shirt1: 0x1a2f4b, shirt2: 0xa21c26, shorts: 0xffffff, logo: 0xffffff },
  torino: { shirt1: 0x881600, shirt2: 0x881600, shorts: 0x881600, logo: 0xffffff },
  bayern: { shirt1: 0xdc052d, shirt2: 0xdc052d, shorts: 0xdc052d, logo: 0xffffff },
  dortmund: { shirt1: 0xfde100, shirt2: 0xfde100, shorts: 0x000000, logo: 0x000000 },
  leverkusen: { shirt1: 0xe32219, shirt2: 0x000000, shorts: 0x000000, logo: 0xffffff },
  leipzig: { shirt1: 0xffffff, shirt2: 0xffffff, shorts: 0xdd0741, logo: 0xdd0741 },
  stuttgart: { shirt1: 0xffffff, shirt2: 0xffffff, shorts: 0xffffff, logo: 0xe32219 },
  frankfurt: { shirt1: 0x000000, shirt2: 0xe1000f, shorts: 0x000000, logo: 0xffffff },
  wolfsburg: { shirt1: 0x65b32e, shirt2: 0x65b32e, shorts: 0x65b32e, logo: 0xffffff },
  freiburg: { shirt1: 0xe4001b, shirt2: 0xe4001b, shorts: 0x000000, logo: 0xffffff },
  hoffenheim: { shirt1: 0x1961b5, shirt2: 0x1961b5, shorts: 0x1961b5, logo: 0xffffff },
  werder: { shirt1: 0x1d9053, shirt2: 0x1d9053, shorts: 0xffffff, logo: 0xffffff },
  psg: { shirt1: 0x004170, shirt2: 0xda291c, shorts: 0x004170, logo: 0xffffff },
  monaco: { shirt1: 0xe63329, shirt2: 0xffffff, shorts: 0xffffff, logo: 0xe63329 },
  marseille: { shirt1: 0xffffff, shirt2: 0xffffff, shorts: 0xffffff, logo: 0x2faee0 },
  lyon: { shirt1: 0xffffff, shirt2: 0xffffff, shorts: 0xffffff, logo: 0xd2001e },
  lille: { shirt1: 0xe01e13, shirt2: 0xe01e13, shorts: 0xffffff, logo: 0xffffff },
  nice: { shirt1: 0xe4032e, shirt2: 0x000000, shorts: 0x000000, logo: 0xffffff },
  lens: { shirt1: 0xffe500, shirt2: 0xd10a11, shorts: 0xffe500, logo: 0x000000 },
  rennes: { shirt1: 0xe23023, shirt2: 0x000000, shorts: 0x000000, logo: 0xffffff },
  strasbourg: { shirt1: 0x0066b1, shirt2: 0x0066b1, shorts: 0xffffff, logo: 0xffffff },
  nantes: { shirt1: 0xfdd500, shirt2: 0x00a54f, shorts: 0xfdd500, logo: 0x00a54f },
  river_plate: { shirt1: 0xffffff, shirt2: 0xd6001c, shorts: 0x000000, logo: 0xd6001c },
  boca_juniors: { shirt1: 0x0d2b6b, shirt2: 0xfcd200, shorts: 0x0d2b6b, logo: 0xfcd200 },
  penarol: { shirt1: 0xffd700, shirt2: 0x000000, shorts: 0x000000, logo: 0xffd700 },
  nacional_uru: { shirt1: 0xffffff, shirt2: 0x004b93, shorts: 0x004b93, logo: 0xd6001c },
  colo_colo: { shirt1: 0xffffff, shirt2: 0xffffff, shorts: 0x000000, logo: 0x000000 },
  olimpia: { shirt1: 0xffffff, shirt2: 0x000000, shorts: 0x000000, logo: 0x000000 },
  // Manequim da criação de personagem: uniforme neutro para a pele e o cabelo
  // escolhidos serem a única coisa que muda no preview.
  __preview: { shirt1: 0xffffff, shirt2: 0xffffff, shorts: 0xffffff, logo: 0xffffff },
};

const SKIN_COLORS = [0xf3cfa8, 0xd9a06b, 0xa9683f, 0x6b3d24];
const HAIR_COLORS = [0x1b1512, 0x4a2c17, 0xb5761f, 0x8c2f1a];

// Layout da arte base. 68x68 por frame, 8 direções, PNGs soltos.
const BASE_SPRITE_PATH = "assets/Jogador-novo/Idle";
const BASE_DIRS = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
];
// Célula do atlas. NÃO é o tamanho dos PNGs: o export veio com QUATRO tamanhos
// (68, 84, 88 e 96), e desenhar tudo numa grade de 68 fazia o frame maior
// transbordar para a célula vizinha — o pé de um sprite aparecia flutuando
// sobre a cabeça do outro. 76 é o mínimo que cabe o maior personagem centrado
// (36px do centro à borda em `shooting/south/frame_004`) mais folga.
const BASE_FRAME_SIZE = 76;
const BASE_RUN_FRAMES = 8; // sprite novo tem 8 frames de corrida (o antigo, 4)
const BASE_KICK_FRAMES = 5;

// Buracos conhecidos no export da arte: `shooting/north` só tem os frames 000,
// 003 e 004. Estes índices NÃO são pedidos ao servidor (paravam em 404 e
// poluíam a rede) e caem no frame 000 da mesma direção — pose parada em vez de
// textura faltando. APAGUE a entrada quando os PNGs chegarem; o check no boot
// avisa se alguém listar direção ou índice que não existe.
const BASE_KICK_MISSING = {
  north: [1, 2],
};
// Duração da pose de chute antes de voltar a correr.
const KICK_ANIM_MS = 320;

// =============================================================================
// MARCAS DE DERRAPAGEM (SKID MARKS)
// =============================================================================
const SKID_MARK = {
  // Medido no jogo: soltar o controle em sprint derruba 98 px/s no 1º frame e
  // ~10 nos seguintes; uma curva fechada gira 0.55/0.71/0.32 rad por frame.
  // Os limiares ficam logo abaixo disso para render um rastro de 2-3 marcas
  // em vez de uma só, sem disparar em desaceleração comum.
  MIN_SPEED: 130, // px/s abaixo disso ninguém derrapa
  BRAKE_DROP: 10, // queda de velocidade em 1 frame que conta como freada
  TURN_RAD: 0.3, // virada de ~17° num frame conta como curva fechada
  COOLDOWN_MS: 45, // espaçamento entre marcas do mesmo jogador
  // Uma freada derruba a velocidade abaixo de MIN_SPEED já no 2º frame, então
  // o gatilho abre uma janela e o rastro continua durante ela — senão sairia
  // uma marca solta em vez de um risco.
  STREAK_MS: 180,
  MAX: 60, // teto de marcas vivas no campo
  LENGTH: 26,
  WIDTH: 9,
  ALPHA: 0.3,
  FADE_MS: 2000,
};

// =============================================================================
// SKILL "BOLA CURVA" — o que cada nível destrava
// =============================================================================
const CURVE_SKILL = {
  MAX_LEVEL: 5,
  // Teto do curveAmount. Sem a skill a bola mal desvia (~9°); no nível máximo
  // chega a 9, o valor usado para calibrar o Magnus em Ball.js (~34°).
  MAX_CURVE_BASE: 1.5,
  MAX_CURVE_PER_LEVEL: 1.5,
  // Teto do arco desenhado durante o arrasto (px), acompanha o teto acima.
  ARC_LIMIT_BASE: 20,
  ARC_LIMIT_PER_LEVEL: 8,
  // Bônus de força aplicado SÓ quando o chute sai com efeito.
  SPEED_BONUS_PER_LEVEL: 0.04,
};

// =============================================================================
// CAREER MODE — VALORES BASE
// =============================================================================
const CAREER_BASE = {
  // O jogador COMEÇA fraco: a carreira é a subida. Com 68/68/72 (overall 69)
  // ele já nascia a cinco pontos da Seleção e a progressão não tinha para onde
  // ir. Aqui ele nasce em 56 e precisa construir o resto.
  START_SPEED: 55,
  START_KICK_POWER: 54,
  START_STAMINA: 58,
  START_LEVEL: 1,
  START_XP: 0,
  START_SKILL_POINTS: 0,
  START_COACH_REP: 50,
  START_CONDITION: 100,
  FATIGUE_PER_MATCH: 25,
  CONDITION_PENALTY_THRESHOLD: 70,
  START_DATE_YYYY_MM_DD: [2026, 3, 1],
  MATCH_RATING_START: 6.0,
  // Idade do usuário e prazo do contrato. O contrato é um RELÓGIO: é o último
  // ano dele que transforma o mercado de "proposta aleatória" em decisão.
  START_AGE: 18,
  CONTRACT_YEARS: 3,
  // Convocação: a régua para a seleção olhar para você. `rating` do usuário é
  // a média dos três atributos.
  NATIONAL_CALL_RATING: 74,
  NATIONAL_MATCHES_PER_SEASON: 6,
  // Datas FIFA JOGÁVEIS no calendário do usuário por temporada. As outras da
  // janela (NATIONAL_MATCHES_PER_SEASON) seguem simuladas no fim do ano.
  NATIONAL_WINDOWS: 4,
  // Recuperação por dia LIVRE numa temporada simulada. O jogador automático não
  // clica em "descansar": com os mesmos +3 do dia normal ele terminava o ano
  // exausto e reserva, o que não é uma simulação da carreira dele — é uma
  // simulação de alguém que nunca dorme.
  SIM_REST_PER_DAY: 9,

  // ── Curva de nível ────────────────────────────────────────────────────────
  // Custo do PRÓXIMO nível: `XP_BASE + (nível - 1) * XP_POR_NIVEL`. Era 100
  // fixo, e uma temporada inteira rendia ~29 níveis — 29 pontos de skill, que
  // é mais do que a árvore inteira. Progressivo, o primeiro nível sai barato e
  // o vigésimo custa cinco vezes mais.
  XP_BASE: 100,
  XP_POR_NIVEL: 45,
};

// Skills que mexem em ATRIBUTO: quanto cada nível dá e quantos níveis existem.
// Fonte única — o número aparecia no texto da tela E no clique que aplica, e
// mudar um sem o outro fazia o card prometer uma coisa e entregar outra.
const SKILL_ATTR = {
  sprintMaster: { atributo: "speed", ganho: 1, max: 12 },
  powerShot: { atributo: "kickPower", ganho: 1, max: 12 },
  tireless: { atributo: "stamina", ganho: 2, max: 12 },
};

// =============================================================================
// COPA DO MUNDO
// =============================================================================
// A cada N temporadas as datas FIFA deixam de ser amistoso e viram mata-mata
// entre as seleções. É o pico narrativo que faltava à carreira longa: até aqui
// a convocação rendia jogos e nada mais.
const MUNDIAL = {
  A_CADA: 4, // temporadas entre uma Copa e a seguinte
  NOME: "Copa do Mundo",
};

// =============================================================================
// DISCIPLINA E LESÃO (carreira)
// =============================================================================
// O elo que faltava entre a partida e a temporada: até aqui o cartão morria no
// apito final e dava para jogar todo jogo com o fôlego no chão.
const DISCIPLINE = {
  YELLOWS_PER_BAN: 3, // amarelos acumulados que custam um jogo
  RED_BAN_MATCHES: 2, // o vermelho já sai suspendendo
  // Risco de lesão: pancada tomada + desgaste. Somados e limitados pelo teto —
  // uma partida violenta com o jogador acabado bate no máximo, nunca em 100%.
  INJURY_PER_FOUL: 0.02, // por falta sofrida (carrinho conta dobrado)
  INJURY_PER_FATIGUE: 0.25, // peso do fôlego que faltou no fim
  FIT_SAFE: 75, // acima disto o cansaço não pesa no risco
  INJURY_RISK_MAX: 0.35,
  INJURY_DAYS_MIN: 4,
  INJURY_DAYS_MAX: 16,
};

// =============================================================================
// Check: a economia de fôlego. Estes números ficaram MUITO tempo aqui sem que
// ninguém os lesse — as entidades tinham os valores cravados no corpo, e mexer
// na constante não mudava nada no jogo. Agora que são a fonte, as relações que
// dão sentido ao sprint precisam valer, senão o pique vira grátis e o jogo volta
// a ser corrida.
// =============================================================================
console.assert(
  (() => {
    const cap = (attr) =>
      PLAYER_ATTR.MAX_STAMINA_COEF + (attr - 50) * PLAYER_ATTR.MAX_STAMINA_VAR;
    const capIA = (attr) =>
      PLAYER_ATTR.ENEMY_MAX_STAMINA_COEF +
      (attr - 50) * PLAYER_ATTR.ENEMY_MAX_STAMINA_VAR;

    // Segundos de sprint contínuo, e segundos para encher do zero.
    const segundosDeSprint = cap(50) / STAMINA.SPRINT_PER_SEC;
    const segundosDeRecarga = cap(50) / STAMINA.RECOVERY_RATE_PER_SEC;

    return (
      // Correr custa mais rápido do que descansar devolve. Invertido, o sprint
      // é de graça e não existe decisão nenhuma em usá-lo.
      STAMINA.SPRINT_PER_SEC > STAMINA.RECOVERY_RATE_PER_SEC &&
      STAMINA.DASH_PER_SEC > STAMINA.RECOVERY_AI_PER_SEC &&
      // Encher ainda demora mais do que esvaziar — mas só um pouco. O fator
      // era 2x, escolha de ritmo de quando a recarga era lenta de propósito;
      // hoje o fôlego volta rápido por decisão de jogo, e quem segura o pique
      // é a PAUSA antes de recarregar (RECOVERY_DELAY_MS), não o gotejamento.
      segundosDeRecarga > segundosDeSprint &&
      STAMINA.RECOVERY_DELAY_MS >= 400 &&
      // Um pique útil, mas não infinito.
      segundosDeSprint >= 4 &&
      segundosDeSprint <= 12 &&
      // Nenhum jogador nasce sem fôlego para um bote sequer — nem com o
      // atributo no chão, onde a fórmula crua devolve zero ou negativo.
      STAMINA.MIN_CAPACITY > STAMINA.DASH_COST &&
      Math.max(cap(0), STAMINA.MIN_CAPACITY) > STAMINA.DASH_COST &&
      Math.max(capIA(0), STAMINA.MIN_CAPACITY) > STAMINA.DASH_COST &&
      // Atributo melhor = mais fôlego, nos dois lados.
      cap(80) > cap(20) &&
      capIA(80) > capIA(20) &&
      // Frações são frações.
      STAMINA.LOW_STAMINA_PCT > 0 &&
      STAMINA.LOW_STAMINA_PCT < 1 &&
      STAMINA.LOW_STAMINA_SPEED_PENALTY > 0 &&
      STAMINA.LOW_STAMINA_SPEED_PENALTY < 1
    );
  })(),
  "Economia de estamina fora de equilíbrio (sprint grátis ou recarga instantânea)",
);
