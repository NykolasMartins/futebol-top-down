/**
 * Estado da sala de LAN — SEM rede.
 *
 * Toda a regra vive aqui, em funções puras sobre um objeto: quem é capitão, que
 * posição está livre, quem pode começar. O `server.js` só traduz socket em
 * chamada e devolve o estado. Separar assim é o que permite testar a regra com
 * `node server/test_lobby.js`, sem abrir porta nenhuma.
 *
 * O SERVIDOR é a autoridade: o cliente pede, o servidor decide. Cliente que
 * mente (posição ocupada, time cheio) recebe o estado real de volta e se
 * corrige sozinho.
 */
const POSICOES = ["FIXO", "ALA_ESQ", "ALA_DIR", "PIVO"];
const LADOS = ["esq", "dir"];
const MAX_LINHA = 4; // 4 posições, uma cada — o teto é a própria lista
const MIN_PARA_INICIAR = 1; // 1 humano de cada lado

// Goleiro NÃO entra em POSICOES de propósito: os dois goleiros são bot, sempre.
// Deixar "GK" na lista seria a porta para alguém escolher e o jogo ficar sem
// goleiro do outro lado.

function novaSala(regras) {
  return {
    jogadores: {}, // id -> {id, nome, lado, posicao, pronto, capitao}
    capitaoDaSala: null, // quem criou: manda nas regras globais
    times: {
      esq: { uniforme: null, capitao: null, preencherComBots: true },
      dir: { uniforme: null, capitao: null, preencherComBots: true },
    },
    regras: Object.assign({ duracaoMin: 5 }, regras || {}),
    iniciada: false,
  };
}

function entrar(sala, id, nome) {
  if (sala.jogadores[id]) return sala;
  sala.jogadores[id] = {
    id,
    nome: nome || "Jogador",
    lado: null,
    posicao: null,
    pronto: false,
  };
  // Primeiro a conectar manda nas regras globais da partida.
  if (!sala.capitaoDaSala) sala.capitaoDaSala = id;
  return sala;
}

function sair(sala, id) {
  const j = sala.jogadores[id];
  if (!j) return sala;
  delete sala.jogadores[id];

  // Capitão que sai passa a faixa para quem entrou depois nesse time.
  LADOS.forEach((lado) => {
    if (sala.times[lado].capitao === id) {
      sala.times[lado].capitao = doLado(sala, lado)[0]?.id || null;
    }
  });
  if (sala.capitaoDaSala === id) {
    sala.capitaoDaSala = Object.keys(sala.jogadores)[0] || null;
  }
  return sala;
}

const doLado = (sala, lado) =>
  Object.values(sala.jogadores).filter((j) => j.lado === lado);

function escolherLado(sala, id, lado) {
  const j = sala.jogadores[id];
  if (!j || !LADOS.includes(lado)) return sala;
  if (j.lado === lado) return sala;
  if (doLado(sala, lado).length >= MAX_LINHA) return sala; // time cheio

  j.lado = lado;
  j.posicao = null; // posição é por time: trocar de lado libera a antiga
  j.pronto = false; // e obriga a confirmar de novo
  // Primeiro a entrar no time vira capitão dele.
  if (!sala.times[lado].capitao) sala.times[lado].capitao = id;
  return sala;
}

function escolherPosicao(sala, id, posicao) {
  const j = sala.jogadores[id];
  if (!j || !j.lado || !POSICOES.includes(posicao)) return sala;
  // TRAVA EXCLUSIVA: ocupada no mesmo time, ninguém mais pega.
  const ocupada = doLado(sala, j.lado).some(
    (o) => o.id !== id && o.posicao === posicao,
  );
  if (ocupada) return sala;
  j.posicao = posicao;
  return sala;
}

function marcarPronto(sala, id, valor) {
  const j = sala.jogadores[id];
  // Sem lado e sem posição não dá para estar pronto — senão a partida começa
  // com jogador sem lugar em campo.
  if (!j || !j.lado || !j.posicao) return sala;
  j.pronto = !!valor;
  return sala;
}

function definirUniforme(sala, id, lado, uniforme) {
  if (!sala.times[lado] || sala.times[lado].capitao !== id) return sala;
  // Dois times com o MESMO uniforme entram em campo indistinguíveis — aconteceu
  // no primeiro teste, porque os dois capitães avançam a lista a partir do
  // mesmo ponto. O servidor recusa; a UI só chama de novo e pega o próximo.
  const outro = lado === "esq" ? "dir" : "esq";
  if (uniforme && sala.times[outro].uniforme === uniforme) return sala;
  sala.times[lado].uniforme = uniforme;
  return sala;
}

function definirPreencherBots(sala, id, lado, valor) {
  if (sala.times[lado] && sala.times[lado].capitao === id) {
    sala.times[lado].preencherComBots = !!valor;
  }
  return sala;
}

function definirRegras(sala, id, regras) {
  if (sala.capitaoDaSala !== id) return sala;
  Object.assign(sala.regras, regras || {});
  return sala;
}

/**
 * Quem de fato vai a campo: humano que já escolheu um lado.
 *
 * Bot NUNCA entra nesta conta — bot não existe em `sala.jogadores`, ele só
 * aparece na `escalacao()`, que é montada na hora de descrever o time. Os dois
 * goleiros idem.
 *
 * Quem está conectado mas ainda não escolheu time é ESPECTADOR: aparece na
 * sala, não segura a partida. Sem esta distinção, uma aba aberta e esquecida na
 * tela de escolha travava todo mundo para sempre, porque espectador não tem
 * como ficar pronto (`marcarPronto` exige lado e posição).
 */
const participantes = (sala) =>
  Object.values(sala.jogadores).filter((j) => j.lado);

/** Por que NÃO dá para começar. Lista vazia = pode. */
function impedimentos(sala) {
  const faltas = [];
  LADOS.forEach((lado) => {
    if (doLado(sala, lado).length < MIN_PARA_INICIAR) {
      faltas.push(lado === "esq" ? "Falta jogador na esquerda" : "Falta jogador na direita");
    }
  });

  // Diz QUEM e o QUE falta: "1 jogador(es) sem confirmar" não ajudava ninguém
  // a descobrir que o problema era uma aba parada sem posição escolhida.
  const semPosicao = participantes(sala).filter((j) => !j.posicao);
  if (semPosicao.length) {
    faltas.push("sem posição: " + semPosicao.map((j) => j.nome).join(", "));
  }
  const semConfirmar = participantes(sala).filter((j) => j.posicao && !j.pronto);
  if (semConfirmar.length) {
    faltas.push("não confirmou: " + semConfirmar.map((j) => j.nome).join(", "));
  }
  return faltas;
}

function podeIniciar(sala) {
  return impedimentos(sala).length === 0;
}

function iniciar(sala, id) {
  if (sala.capitaoDaSala !== id || !podeIniciar(sala)) return sala;
  sala.iniciada = true;
  return sala;
}

/** Formação final: humanos nas posições escolhidas, resto bot (ou vazio). */
function escalacao(sala, lado) {
  const humanos = doLado(sala, lado);
  const time = sala.times[lado];
  return POSICOES.map((pos) => {
    const h = humanos.find((j) => j.posicao === pos);
    if (h) return { posicao: pos, tipo: "humano", id: h.id, nome: h.nome };
    return time.preencherComBots
      ? { posicao: pos, tipo: "bot" }
      : { posicao: pos, tipo: "vazio" };
  }).concat([{ posicao: "GK", tipo: "bot" }]); // goleiro é sempre bot
}

const api = {
  POSICOES, LADOS, MAX_LINHA, MIN_PARA_INICIAR,
  novaSala, entrar, sair, escolherLado, escolherPosicao, marcarPronto,
  definirUniforme, definirPreencherBots, definirRegras,
  impedimentos, podeIniciar, iniciar, escalacao, doLado, participantes,
};

if (typeof module !== "undefined") module.exports = api;
if (typeof window !== "undefined") window.Lobby = api;
