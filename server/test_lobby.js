/**
 * Check da regra de sala. `node server/test_lobby.js`.
 * Sem framework: assert do próprio node, como o resto do projeto.
 */
const assert = require("assert");
const L = require("./lobby");

// ── capitania ──────────────────────────────────────────────────────────────
let s = L.novaSala();
L.entrar(s, "a", "Ana");
L.entrar(s, "b", "Bia");
assert.strictEqual(s.capitaoDaSala, "a", "quem cria a sala manda nas regras");
L.escolherLado(s, "b", "esq");
L.escolherLado(s, "a", "esq");
assert.strictEqual(s.times.esq.capitao, "b", "primeiro a ENTRAR no time é capitão dele");

// ── trava exclusiva de posição ─────────────────────────────────────────────
L.escolherPosicao(s, "b", "PIVO");
L.escolherPosicao(s, "a", "PIVO"); // ocupada
assert.strictEqual(s.jogadores.a.posicao, null, "posição ocupada não pode ser roubada");
L.escolherPosicao(s, "a", "FIXO");
assert.strictEqual(s.jogadores.a.posicao, "FIXO");

// mesma posição no time ADVERSÁRIO é livre
L.entrar(s, "c", "Caio");
L.escolherLado(s, "c", "dir");
L.escolherPosicao(s, "c", "PIVO");
assert.strictEqual(s.jogadores.c.posicao, "PIVO", "trava é por time, não global");

// goleiro não é escolhível
L.escolherPosicao(s, "c", "GK");
assert.strictEqual(s.jogadores.c.posicao, "PIVO", "GK não entra na lista de escolha");

// ── teto de 4 por time ─────────────────────────────────────────────────────
let cheio = L.novaSala();
["p1", "p2", "p3", "p4", "p5"].forEach((id) => {
  L.entrar(cheio, id, id);
  L.escolherLado(cheio, id, "esq");
});
assert.strictEqual(L.doLado(cheio, "esq").length, 4, "máximo 4 de linha por equipe");
assert.strictEqual(cheio.jogadores.p5.lado, null, "o quinto fica de fora");

// ── trocar de lado libera a posição antiga ─────────────────────────────────
let troca = L.novaSala();
L.entrar(troca, "x", "X"); L.escolherLado(troca, "x", "esq"); L.escolherPosicao(troca, "x", "ALA_ESQ");
L.escolherLado(troca, "x", "dir");
assert.strictEqual(troca.jogadores.x.posicao, null, "mudou de time, perdeu a posição");
L.entrar(troca, "y", "Y"); L.escolherLado(troca, "y", "esq"); L.escolherPosicao(troca, "y", "ALA_ESQ");
assert.strictEqual(troca.jogadores.y.posicao, "ALA_ESQ", "vaga liberada volta a ser escolhível");

// ── trava de início ────────────────────────────────────────────────────────
assert.ok(!L.podeIniciar(s), "não começa com gente sem confirmar");
L.marcarPronto(s, "a", true); L.marcarPronto(s, "b", true); L.marcarPronto(s, "c", true);
assert.ok(L.podeIniciar(s), "todos prontos e um de cada lado: pode");
L.iniciar(s, "b");
assert.ok(!s.iniciada, "só o capitão da SALA inicia");
L.iniciar(s, "a");
assert.ok(s.iniciada, "capitão da sala inicia");

// um lado vazio trava, mesmo todo mundo pronto
let soUmLado = L.novaSala();
L.entrar(soUmLado, "u", "U"); L.escolherLado(soUmLado, "u", "esq");
L.escolherPosicao(soUmLado, "u", "FIXO"); L.marcarPronto(soUmLado, "u", true);
assert.ok(!L.podeIniciar(soUmLado), "precisa de 1 humano em CADA lado");

// pronto sem posição não cola
let semPos = L.novaSala();
L.entrar(semPos, "z", "Z"); L.escolherLado(semPos, "z", "esq");
L.marcarPronto(semPos, "z", true);
assert.ok(!semPos.jogadores.z.pronto, "sem posição não dá para estar pronto");

// ── escalação final ────────────────────────────────────────────────────────
const esc = L.escalacao(s, "esq");
assert.strictEqual(esc.length, 5, "4 de linha + goleiro");
assert.strictEqual(esc[esc.length - 1].posicao, "GK");
assert.strictEqual(esc[esc.length - 1].tipo, "bot", "goleiro é SEMPRE bot");
assert.strictEqual(esc.filter((e) => e.tipo === "humano").length, 2);
assert.strictEqual(esc.filter((e) => e.tipo === "bot").length, 3, "vagas viram bot por padrão");

L.definirPreencherBots(s, "b", "esq", false);
const semBots = L.escalacao(s, "esq");
assert.strictEqual(semBots.filter((e) => e.tipo === "vazio").length, 2, "capitão pode jogar com menos");
assert.strictEqual(semBots[semBots.length - 1].tipo, "bot", "mesmo assim o goleiro é bot");

// ── privilégios ────────────────────────────────────────────────────────────
L.definirUniforme(s, "a", "esq", "FLAMENGO"); // 'a' não é capitão da esquerda
assert.strictEqual(s.times.esq.uniforme, null, "uniforme é do capitão do time");
L.definirUniforme(s, "b", "esq", "FLAMENGO");
assert.strictEqual(s.times.esq.uniforme, "FLAMENGO");
L.definirRegras(s, "b", { duracaoMin: 10 });
assert.strictEqual(s.regras.duracaoMin, 5, "regras globais são do capitão da sala");
L.definirRegras(s, "a", { duracaoMin: 10 });
assert.strictEqual(s.regras.duracaoMin, 10);

// ── saída passa a faixa ────────────────────────────────────────────────────
L.sair(s, "b");
assert.strictEqual(s.times.esq.capitao, "a", "capitão que sai passa a faixa");
L.sair(s, "a");
assert.strictEqual(s.capitaoDaSala, "c", "sala não fica sem capitão");

// ── o gate conta só HUMANOS QUE VÃO JOGAR ──────────────────────────────────
// (era o bug relatado: a sala nunca liberava o INICIAR)
let g = L.novaSala();
L.entrar(g, "h1", "H1"); L.escolherLado(g, "h1", "esq"); L.escolherPosicao(g, "h1", "FIXO"); L.marcarPronto(g, "h1", true);
L.entrar(g, "h2", "H2"); L.escolherLado(g, "h2", "dir"); L.escolherPosicao(g, "h2", "PIVO"); L.marcarPronto(g, "h2", true);
assert.ok(L.podeIniciar(g), "2 humanos prontos, 1 de cada lado: libera");

// bot NUNCA aparece em jogadores — a escalação é que os inventa
const comBots = L.escalacao(g, "esq");
assert.strictEqual(comBots.filter((e) => e.tipo === "bot").length, 4, "3 vagas + goleiro viram bot");
assert.strictEqual(Object.keys(g.jogadores).length, 2, "bot nao entra na contagem de gente");
assert.ok(L.podeIniciar(g), "os 4 bots do lado esquerdo NAO seguram o inicio");

// espectador (conectado, sem time) nao trava
L.entrar(g, "esp", "Espectador");
assert.strictEqual(L.participantes(g).length, 2, "quem nao escolheu time nao e participante");
assert.ok(L.podeIniciar(g), "aba parada na escolha de time nao segura a sala");

// mas participante SEM POSICAO trava, e a mensagem diz quem e
L.escolherLado(g, "esp", "esq");
assert.ok(!L.podeIniciar(g), "quem entrou no time precisa de posicao");
assert.ok(
  L.impedimentos(g).some((f) => f.includes("Espectador")),
  "o impedimento nomeia quem esta faltando",
);
L.escolherPosicao(g, "esp", "ALA_ESQ");
assert.ok(!L.podeIniciar(g), "escolheu posicao, falta confirmar");
assert.ok(L.impedimentos(g).some((f) => f.startsWith("não confirmou")), "mensagem certa");
L.marcarPronto(g, "esp", true);
assert.ok(L.podeIniciar(g), "confirmou: libera");

console.log("test_lobby: OK (27 asserts)");
