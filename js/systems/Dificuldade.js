// =============================================================================
// Dificuldade — quão forte é o adversário. Um perfil, três fatores.
// =============================================================================
// O jogo tinha UMA dificuldade, e ela precisa servir de quem nunca jogou a quem
// já domina. O barato de fazer isso aqui é que os knobs já existem e já são
// lidos: ficha do adversário, ritmo de decisão da IA e alcance do goleiro. O
// que faltava era um lugar que os multiplicasse.
//
// A REGRA: dificuldade é FATOR, nunca `if`. Nenhum `if (dificil)` espalhado —
// quem consome pergunta `Dificuldade.fator("adversario")` e multiplica. Assim
// um perfil novo é uma linha nesta tabela, e não uma varredura no jogo todo.
//
// Persiste no localStorage e vale para exibição e carreira, como os efeitos e
// o som — a escolha é do jogador, não da partida.

const Dificuldade = {
  CHAVE: "dificuldade",

  /**
   * Os três perfis. Cada fator multiplica um número que já existia:
   *  - `adversario`: a ficha do time rival (velocidade, chute, fôlego).
   *  - `decisao`:    o intervalo entre decisões da IA — MENOR é mais esperto,
   *                  porque ela repensa mais vezes por segundo.
   *  - `goleiro`:    o alcance do goleiro adversário.
   */
  PERFIS: {
    facil: {
      nome: "FÁCIL",
      dica: "Adversário mais lento, pensa devagar e o goleiro alcança menos",
      adversario: 0.88,
      decisao: 1.6,
      goleiro: 0.85,
    },
    normal: {
      nome: "NORMAL",
      dica: "O jogo como foi balanceado",
      adversario: 1,
      decisao: 1,
      goleiro: 1,
    },
    dificil: {
      nome: "DIFÍCIL",
      dica: "Rival mais forte, decide quase o dobro mais rápido e goleiro maior",
      adversario: 1.08,
      decisao: 0.6,
      goleiro: 1.12,
    },
  },

  PADRAO: "normal",
  atual: null,

  carregar() {
    let escolha = this.PADRAO;
    try {
      const bruto = localStorage.getItem(this.CHAVE);
      // Só um perfil que EXISTE entra: save antigo ou mexido à mão não pode
      // virar `undefined` no meio de uma multiplicação.
      if (bruto && this.PERFIS[bruto]) escolha = bruto;
    } catch (erro) {
      /* modo privado: vale o padrão nesta sessão */
    }
    this.atual = escolha;
    return escolha;
  },

  salvar() {
    try {
      localStorage.setItem(this.CHAVE, this.atual);
    } catch (erro) {
      /* sem persistência: a escolha vale só nesta sessão */
    }
  },

  definir(id) {
    if (!this.PERFIS[id]) return this.atual;
    this.atual = id;
    this.salvar();
    return id;
  },

  perfil() {
    if (!this.atual) this.carregar();
    return this.PERFIS[this.atual] || this.PERFIS[this.PADRAO];
  },

  /** O multiplicador de um knob. Perfil sem a chave devolve 1 (neutro). */
  fator(chave) {
    const p = this.perfil();
    const v = p[chave];
    return Number.isFinite(v) ? v : 1;
  },

  /** Botões das telas de configuração. Mesma forma do `Som.linhasHtml()`. */
  linhasHtml() {
    if (!this.atual) this.carregar();
    const botoes = Object.keys(this.PERFIS)
      .map(
        (id) =>
          '<button class="pui-btn ' +
          (this.atual === id ? "pui-btn-primary" : "pui-btn-dark") +
          '" data-dificuldade="' +
          id +
          '" style="flex:1;height:34px;font-size:6px;">' +
          this.PERFIS[id].nome +
          "</button>",
      )
      .join("");
    return (
      '<div class="pui-config-row" style="flex-direction:column;align-items:stretch;gap:6px;">' +
      '<div class="pui-config-label">DIFICULDADE</div>' +
      '<div class="pui-config-hint">' +
      this.perfil().dica +
      "</div>" +
      '<div style="display:flex;gap:6px;">' +
      botoes +
      "</div>" +
      "</div>"
    );
  },

  /**
   * Trata o clique num dos botões. Devolve `true` quando era mesmo dificuldade,
   * para a tela saber que já tratou — e redesenhar, porque o botão aceso muda.
   */
  tratarClique(alvo) {
    const el = alvo && alvo.closest ? alvo.closest("[data-dificuldade]") : null;
    if (!el) return false;
    this.definir(el.getAttribute("data-dificuldade"));
    return true;
  },
};

Dificuldade.carregar();

// =============================================================================
// Check: os fatores. O estrago aqui é mudo — um perfil sem uma chave devolveria
// `undefined`, e `velocidade * undefined` é NaN: o adversário simplesmente
// para de andar, sem erro nenhum no console.
// =============================================================================
console.assert(
  (() => {
    const ids = Object.keys(Dificuldade.PERFIS);
    const chaves = ["adversario", "decisao", "goleiro"];
    const todos = ids.every((id) =>
      chaves.every((c) => Number.isFinite(Dificuldade.PERFIS[id][c])),
    );

    const antes = Dificuldade.atual;
    Dificuldade.atual = "facil";
    const facil = chaves.map((c) => Dificuldade.fator(c));
    Dificuldade.atual = "dificil";
    const dificil = chaves.map((c) => Dificuldade.fator(c));
    Dificuldade.atual = "normal";
    const normal = chaves.map((c) => Dificuldade.fator(c));
    const desconhecido = Dificuldade.fator("nao_existe");
    // Perfil inválido não entra e não derruba o resto.
    const recusa = Dificuldade.definir("impossivel");
    Dificuldade.atual = antes;

    return (
      todos &&
      // Normal é o jogo como está: nenhum fator mexe em nada.
      normal.every((v) => v === 1) &&
      // Fácil afrouxa e difícil aperta, em TODOS os eixos. `decisao` é o
      // invertido de propósito: intervalo maior = IA mais burra.
      facil[0] < 1 &&
      dificil[0] > 1 &&
      facil[1] > 1 &&
      dificil[1] < 1 &&
      facil[2] < 1 &&
      dificil[2] > 1 &&
      desconhecido === 1 &&
      recusa === "normal"
    );
  })(),
  "Dificuldade: perfil sem fator (adversário viraria NaN e pararia de andar)",
);
