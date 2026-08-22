/**
 * Registro de SALAS — sem rede, como o `lobby.js`.
 *
 * O `lobby.js` cuida do que acontece DENTRO de uma sala (quem é capitão, que
 * posição está livre, quem pode começar). Este arquivo cuida de QUAIS salas
 * existem e de quem está em qual — que é a única coisa que faltava para o modo
 * Online: em LAN existe uma sala só, porque a sala É o servidor que o dono da
 * casa levantou; online, estranhos precisam ser pareados em salas separadas.
 *
 * O modo LAN continua caindo na sala `PADRAO` e se comporta exatamente como
 * antes: uma sala, todo mundo dentro, ninguém precisa saber que o conceito de
 * várias salas passou a existir.
 *
 * A REGRA CRÍTICA daqui é o escopo: pacote de partida e estado de sala só
 * podem alcançar quem está na MESMA sala. Sem isso, duas partidas online
 * simultâneas trocam posição de bola entre si, e o sintoma é bola teleportando
 * sem motivo — o tipo de bug que ninguém liga ao servidor.
 */
const L = require("./lobby");

const PADRAO = "lan"; // sala do modo LAN: comportamento de sempre
const MAX_HUMANOS = 2; // pareamento online: 1 de cada lado
const CODIGO_TAM = 4;
// Só dígitos: o código é ditado por voz ou digitado no celular, e com letras
// sempre sobra a dúvida entre O/0 e I/1. 10.000 combinações bastam — a sala
// morre quando esvazia, então nunca há muitas vivas ao mesmo tempo.
const CODIGO_ALFABETO = "0123456789";

function novoRegistro() {
  return {
    salas: {}, // codigo -> sala do lobby.js
    onde: {}, // id do jogador -> codigo da sala
  };
}

/** Como o jogador digitou -> como a sala é guardada. */
function normalizarCodigo(txt) {
  return String(txt || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODIGO_TAM);
}

/** Código curto para o jogador ditar. Ver CODIGO_ALFABETO. */
function gerarCodigo(registro, sorteio) {
  const alfabeto = CODIGO_ALFABETO;
  const rnd = sorteio || (() => Math.floor(Math.random() * alfabeto.length));
  for (let tentativa = 0; tentativa < 50; tentativa++) {
    let c = "";
    for (let i = 0; i < CODIGO_TAM; i++) c += alfabeto[rnd() % alfabeto.length];
    if (!registro.salas[c]) return c;
  }
  // Alfabeto cheio é praticamente impossível (32^4), mas devolver `undefined`
  // aqui viraria uma sala sem código lá na frente.
  return "S" + Object.keys(registro.salas).length;
}

function obter(registro, codigo, regras) {
  if (!registro.salas[codigo]) registro.salas[codigo] = L.novaSala(regras);
  return registro.salas[codigo];
}

function humanos(sala) {
  return Object.keys(sala.jogadores).length;
}

/** Em que sala este jogador está? `null` se ainda não entrou em nenhuma. */
function salaDe(registro, id) {
  const codigo = registro.onde[id];
  return codigo ? registro.salas[codigo] || null : null;
}

function codigoDe(registro, id) {
  return registro.onde[id] || null;
}

/** Ids na MESMA sala do jogador — é isto que limita todo broadcast. */
function colegas(registro, id) {
  const codigo = registro.onde[id];
  if (!codigo || !registro.salas[codigo]) return [];
  return Object.keys(registro.salas[codigo].jogadores);
}

function entrar(registro, codigo, id, nome, regras) {
  sair(registro, id); // trocar de sala nunca deixa o jogador nas duas
  const sala = obter(registro, codigo, regras);
  L.entrar(sala, id, nome);
  registro.onde[id] = codigo;
  return sala;
}

/**
 * Pareamento: cai na primeira sala online com vaga, ou abre uma nova. Salas já
 * iniciadas não contam — entrar no meio de uma partida em andamento colocaria
 * um jogador sem escalação em campo.
 */
function procurar(registro, id, nome, sorteio) {
  const comVaga = Object.keys(registro.salas).find(
    (c) =>
      c !== PADRAO &&
      // SÓ sala de pareamento. Sala com código é de quem convidou alguém —
      // cair nela de fila roubaria a vaga do amigo que está a caminho.
      registro.salas[c].pareamento &&
      !registro.salas[c].iniciada &&
      humanos(registro.salas[c]) > 0 &&
      humanos(registro.salas[c]) < MAX_HUMANOS,
  );
  const codigo = comVaga || gerarCodigo(registro, sorteio);
  const sala = entrar(registro, codigo, id, nome);
  sala.pareamento = true;
  return codigo;
}

/**
 * Sala PRIVADA: o anfitrião cria, recebe o código e o divulga. Funciona como a
 * sala de LAN — lobby com lado, posição e o capitão clicando INICIAR —, e é por
 * isso que ela NÃO é de pareamento: começar sozinha ao chegar o segundo tiraria
 * o lobby da mão de quem convidou.
 */
function criar(registro, id, nome, sorteio) {
  const codigo = gerarCodigo(registro, sorteio);
  const sala = entrar(registro, codigo, id, nome);
  sala.pareamento = false;
  return codigo;
}

/** A sala existe e ainda dá para entrar? Usado antes de aceitar um código. */
function existe(registro, codigo) {
  return !!registro.salas[codigo];
}

function sair(registro, id) {
  const codigo = registro.onde[id];
  if (!codigo) return null;
  delete registro.onde[id];
  const sala = registro.salas[codigo];
  if (!sala) return codigo;

  L.sair(sala, id);
  // Sala vazia é lixo: sem isto o `procurar` acumularia salas mortas para
  // sempre e um dia pararia de parear gente nova.
  if (codigo !== PADRAO && humanos(sala) === 0) delete registro.salas[codigo];
  return codigo;
}

/**
 * Sala online cheia começa sozinha: no pareamento não existe lobby para
 * escolher lado nem clicar em PRONTO, então o servidor decide — um de cada
 * lado, na posição de pivô, e o resto do time é bot (que é o padrão da sala).
 *
 * Devolve `true` quando ESTA chamada iniciou a partida, para o servidor
 * anunciar uma vez só.
 */
function iniciarSeCheia(registro, codigo) {
  // NUNCA a sala LAN nem a sala com código: nas duas quem começa a partida é o
  // capitão, clicando INICIAR depois de todo mundo escolher lado e posição.
  // Iniciar sozinho ali seria arrancar o lobby da mão dos jogadores assim que
  // o segundo entrasse. Só a fila de pareamento começa sozinha, porque nela
  // não existe lobby nenhum para usar.
  if (codigo === PADRAO) return false;
  const sala = registro.salas[codigo];
  if (!sala || !sala.pareamento || sala.iniciada) return false;
  const ids = Object.keys(sala.jogadores);
  if (ids.length < MAX_HUMANOS) return false;

  ["esq", "dir"].forEach((lado, i) => {
    L.escolherLado(sala, ids[i], lado);
    L.escolherPosicao(sala, ids[i], "PIVO");
    L.marcarPronto(sala, ids[i], true);
  });
  L.iniciar(sala, ids[0]);
  return sala.iniciada;
}

module.exports = {
  PADRAO,
  MAX_HUMANOS,
  CODIGO_TAM,
  novoRegistro,
  gerarCodigo,
  normalizarCodigo,
  criar,
  existe,
  obter,
  salaDe,
  codigoDe,
  colegas,
  entrar,
  procurar,
  sair,
  iniciarSeCheia,
  humanos,
};
