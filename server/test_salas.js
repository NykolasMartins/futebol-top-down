// Check do registro de salas (modo Online). O que ele protege não aparece no
// console de ninguém: pacote de partida vazando para a sala errada faz a bola
// teleportar na tela de estranhos, e sala vazia acumulada faz o pareamento
// parar de funcionar depois de horas no ar.
// Rodar: node server/test_salas.js
const assert = require("assert");
const S = require("./salas");
const L = require("./lobby");

let n = 0;
const ok = (cond, msg) => {
  n++;
  assert.ok(cond, msg);
};

// ── LAN continua sendo uma sala só ─────────────────────────────────────────
{
  const r = S.novoRegistro();
  S.entrar(r, S.PADRAO, "a", "Ana");
  S.entrar(r, S.PADRAO, "b", "Bia");
  S.entrar(r, S.PADRAO, "c", "Caio");
  ok(S.humanos(r.salas[S.PADRAO]) === 3, "LAN aceita mais de dois: é sala aberta");
  ok(S.colegas(r, "a").sort().join() === "a,b,c", "todo mundo se enxerga na LAN");
  // LAN não é pareamento: não começa sozinha ao chegar no segundo jogador.
  ok(S.iniciarSeCheia(r, S.PADRAO) === false, "sala LAN nunca inicia sozinha");
}

// ── Pareamento online: dois a dois, em salas separadas ─────────────────────
{
  const r = S.novoRegistro();
  const c1 = S.procurar(r, "a", "Ana");
  const c2 = S.procurar(r, "b", "Bia");
  ok(c1 === c2, "segundo jogador cai na sala que já tinha vaga");

  const c3 = S.procurar(r, "c", "Caio");
  ok(c3 !== c1, "terceiro NÃO entra numa sala cheia: abre outra");

  // O recorte que importa: ninguém enxerga a partida dos outros.
  ok(S.colegas(r, "a").sort().join() === "a,b", "sala 1 só tem os seus");
  ok(S.colegas(r, "c").join() === "c", "sala 2 só tem os seus");
  ok(!S.colegas(r, "a").includes("c"), "pacote não vaza entre salas");
}

// ── Sala cheia começa sozinha, e só uma vez ────────────────────────────────
{
  const r = S.novoRegistro();
  const c = S.procurar(r, "a", "Ana");
  ok(S.iniciarSeCheia(r, c) === false, "com um jogador só, não começa");
  S.procurar(r, "b", "Bia");
  ok(S.iniciarSeCheia(r, c) === true, "com dois, começa");
  ok(S.iniciarSeCheia(r, c) === false, "segunda chamada não reanuncia");

  const sala = r.salas[c];
  const lados = Object.values(sala.jogadores).map((j) => j.lado).sort();
  ok(lados.join() === "dir,esq", "um de cada lado, escolhido pelo servidor");
  ok(L.escalacao(sala, "esq").length > 0, "escalação sai pronta para a GameScene");
}

// ── Partida em andamento não recebe intruso ────────────────────────────────
{
  const r = S.novoRegistro();
  const c = S.procurar(r, "a", "Ana");
  S.procurar(r, "b", "Bia");
  S.iniciarSeCheia(r, c);
  const c2 = S.procurar(r, "c", "Caio");
  ok(c2 !== c, "sala já iniciada não aparece como vaga");
}

// ── Faxina: sala vazia some, a LAN fica ────────────────────────────────────
{
  const r = S.novoRegistro();
  const c = S.procurar(r, "a", "Ana");
  ok(r.salas[c], "sala existe enquanto tem gente");
  S.sair(r, "a");
  ok(!r.salas[c], "sala online vazia é removida");
  ok(S.codigoDe(r, "a") === null, "e o jogador não fica preso a ela");

  S.entrar(r, S.PADRAO, "b", "Bia");
  S.sair(r, "b");
  ok(r.salas[S.PADRAO], "a sala LAN NÃO é removida: o servidor é dela");
}

// ── Trocar de sala não deixa o jogador nas duas ────────────────────────────
{
  const r = S.novoRegistro();
  S.entrar(r, S.PADRAO, "a", "Ana");
  const c = S.procurar(r, "a", "Ana");
  ok(S.codigoDe(r, "a") === c, "o jogador está na nova");
  ok(!S.colegas(r, "a").includes("fantasma"), "sanidade");
  ok(
    Object.keys(r.salas[S.PADRAO].jogadores).length === 0,
    "e saiu da antiga — senão ele receberia pacote das duas partidas",
  );
}

// ── Sala PRIVADA por código ────────────────────────────────────────────────
{
  const r = S.novoRegistro();
  const codigo = S.criar(r, "host", "Ana");
  ok(S.existe(r, codigo), "a sala existe assim que o anfitrião cria");
  ok(r.salas[codigo].pareamento === false, "sala com código NÃO é de pareamento");

  // A regra que importa: ela NÃO começa sozinha ao chegar o segundo. Quem
  // convidou tem de poder escolher lado e clicar INICIAR, como na LAN.
  S.entrar(r, codigo, "amigo", "Bia");
  ok(S.humanos(r.salas[codigo]) === 2, "o convidado entrou pelo código");
  ok(
    S.iniciarSeCheia(r, codigo) === false,
    "sala com código espera o capitão — não começa sozinha",
  );

  // E a fila de pareamento não pode roubar a vaga do amigo que está a caminho.
  const r2 = S.novoRegistro();
  const privada = S.criar(r2, "host", "Ana");
  const daFila = S.procurar(r2, "estranho", "Caio");
  ok(daFila !== privada, "quem procura partida rápida NÃO cai em sala privada");
}

// ── Código digitado pelo jogador ───────────────────────────────────────────
{
  ok(S.normalizarCodigo(" 12 34 ") === "1234", "espaço no meio não atrapalha");
  ok(S.normalizarCodigo("1234567") === "1234", "corta no tamanho do código");
  ok(S.normalizarCodigo("ab-cd") === "ABCD", "caixa e traço normalizados");
  ok(S.normalizarCodigo(null) === "", "entrada vazia não vira sala fantasma");

  // Código inexistente NÃO cria sala: quem digitou errado precisa saber.
  const r = S.novoRegistro();
  ok(S.existe(r, "9999") === false, "sala que ninguém criou não existe");
}

// ── Código de sala: legível e sem colisão ──────────────────────────────────
{
  const r = S.novoRegistro();
  const c = S.gerarCodigo(r);
  ok(/^[0-9]{4}$/.test(c), "quatro dígitos: sem letra para confundir ao ditar");

  // Sorteio viciado: sempre o mesmo dígito. O gerador tem de escapar da colisão.
  r.salas["0000"] = L.novaSala();
  const c2 = S.gerarCodigo(r, () => 0);
  ok(c2 !== "0000", "código já usado não é devolvido de novo");
}

console.log("test_salas: OK (" + n + " asserts)");
