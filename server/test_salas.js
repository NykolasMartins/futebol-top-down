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

// ── Código de sala: legível e sem colisão ──────────────────────────────────
{
  const r = S.novoRegistro();
  const c = S.gerarCodigo(r);
  ok(/^[A-HJ-NP-Z2-9]{4}$/.test(c), "código sem 0/O e 1/I, que o jogador confunde ao ditar");

  // Sorteio viciado: sempre a mesma letra. O gerador tem de escapar da colisão.
  r.salas["AAAA"] = L.novaSala();
  const c2 = S.gerarCodigo(r, () => 0);
  ok(c2 !== "AAAA", "código já usado não é devolvido de novo");
}

console.log("test_salas: OK (" + n + " asserts)");
