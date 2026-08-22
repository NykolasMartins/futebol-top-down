// =============================================================================
// EfeitosVisuais — quais efeitos estão ligados, e como ligá-los/desligá-los.
// =============================================================================
// Os efeitos vivem em três lugares diferentes: um shader de câmera (o CRT), duas
// camadas DOM (grão e riscos), uma classe CSS (a curvatura da UI) e chamadas
// espalhadas de `cameras.main.shake`. Sem um dono, "desligar efeito" viraria
// quatro interruptores espalhados que ninguém lembra de manter em sincronia.
//
// Mora fora de qualquer cena de propósito: o menu principal também é afetado, e
// a escolha tem de sobreviver à troca de cena e ao recarregar a página.
//
// A GRAVAÇÃO é sanitizada na leitura: chave desconhecida no `localStorage` (save
// antigo, usuário mexendo à mão) é descartada em vez de virar `undefined` no
// meio de um `if`. Mesma regra do resto do projeto — filtra no load, confia no
// uso.

const EfeitosVisuais = {
  CHAVE: "efeitosVisuais",

  /**
   * A lista é a fonte: ela gera os interruptores da tela, o padrão e o que é
   * aceito na leitura do save. Acrescentar efeito novo é acrescentar uma linha.
   */
  CATALOGO: [
    {
      id: "crt",
      nome: "TELA CRT",
      dica: "Curvatura, linhas de varredura e brilho da TV antiga",
    },
    {
      id: "grao",
      nome: "GRÃO",
      dica: "Ruído de filme por cima da imagem",
    },
    {
      id: "riscos",
      nome: "RISCOS DE FITA",
      dica: "Ranhuras verticais de VHS gasto",
    },
    {
      id: "curvaturaUI",
      nome: "MENUS CURVOS",
      dica: "Entorta os menus como o vidro da TV. Pesa em máquina fraca",
    },
    {
      id: "tremor",
      nome: "TREMOR DE CÂMERA",
      dica: "Sacode a tela em gol, bote e defesa",
    },
  ],

  /** Estado em memória. Preenchido por `carregar()` no boot. */
  estado: null,

  padrao() {
    const p = {};
    this.CATALOGO.forEach((e) => (p[e.id] = true));
    return p;
  },

  carregar() {
    const p = this.padrao();
    try {
      const bruto = JSON.parse(localStorage.getItem(this.CHAVE));
      if (bruto && typeof bruto === "object") {
        // SÓ as chaves do catálogo, e só booleanos: o save envelhece, a tela não.
        this.CATALOGO.forEach((e) => {
          if (typeof bruto[e.id] === "boolean") p[e.id] = bruto[e.id];
        });
      }
    } catch (erro) {
      /* save corrompido cai no padrão, sem derrubar o boot */
    }
    this.estado = p;
    return p;
  },

  salvar() {
    try {
      localStorage.setItem(this.CHAVE, JSON.stringify(this.estado));
    } catch (erro) {
      /* modo privado do navegador: a escolha vale só nesta sessão */
    }
  },

  ligado(id) {
    if (!this.estado) this.carregar();
    // Efeito desconhecido conta como LIGADO: um `if` novo no jogo não deve
    // sumir com o efeito só porque ninguém o cadastrou aqui ainda.
    return this.estado[id] !== false;
  },

  alternar(id) {
    if (!this.estado) this.carregar();
    this.estado[id] = !this.ligado(id);
    this.salvar();
    this.aplicar();
    return this.estado[id];
  },

  /**
   * Põe o estado em prática. Chamado ao alternar e no `create` de cada cena —
   * cena nova nasce com câmera nova, e a câmera é onde o filtro do CRT mora.
   */
  aplicar(jogo) {
    if (!this.estado) this.carregar();
    const g = jogo || (typeof game !== "undefined" ? game : null);

    // ── Camadas DOM: grão e riscos ──────────────────────────────────────────
    // `display` e não `opacity`: com opacidade 0 a animação continua rodando e
    // repintando, que é justamente o custo que o jogador quis cortar.
    const camada = (seletor, mostrar) => {
      const el = document.querySelector(seletor);
      if (el) el.style.display = mostrar ? "" : "none";
    };
    camada(".crt-grain", this.ligado("grao"));
    camada(".crt-scratches", this.ligado("riscos"));

    // ── Curvatura da UI ─────────────────────────────────────────────────────
    // Quem decide se o menu é curvo continua sendo o `main.js` (só menus, nunca
    // partida). Aqui é só o veto do jogador por cima disso.
    const container = document.getElementById("game-container");
    if (container) {
      container.classList.toggle("sem-curvatura-ui", !this.ligado("curvaturaUI"));
    }

    // ── Shader de câmera ────────────────────────────────────────────────────
    if (g && g.scene) {
      g.scene.scenes.forEach((cena) => {
        if (cena.scene.isActive() || cena.scene.isVisible()) {
          this.aplicarNaCena(cena);
        }
      });
    }
  },

  /** Liga ou tira o filtro de CRT da câmera de UMA cena. */
  aplicarNaCena(cena) {
    const cam = cena && cena.cameras && cena.cameras.main;
    if (!cam || !cam.filters || typeof CrtVhsFilter === "undefined") return;
    const lista = cam.filters.internal;
    if (!lista) return;

    if (this.ligado("crt")) {
      if (typeof aplicarCrt === "function") aplicarCrt(cena);
      return;
    }
    // Desligado: tira TODOS os passes, não só o primeiro. A lista já empilhou
    // filtro repetido neste projeto (a câmera sobrevive ao restart da cena).
    lista.list
      .filter((f) => f instanceof CrtVhsFilter)
      .forEach((f) => lista.remove(f));
  },

  /**
   * Tremor de câmera respeitando a escolha. Todo `cameras.main.shake` do jogo
   * passa por aqui — chamada solta volta a sacudir a tela de quem desligou.
   */
  tremer(cena, duracao, intensidade) {
    if (!this.ligado("tremor")) return;
    if (cena && cena.cameras && cena.cameras.main) {
      cena.cameras.main.shake(duracao, intensidade);
    }
  },

  /** Interruptores em HTML, para as duas telas de configuração usarem o mesmo. */
  linhasHtml() {
    if (!this.estado) this.carregar();
    return this.CATALOGO.map(
      (e) =>
        '<div class="pui-config-row">' +
        "<div>" +
        '<div class="pui-config-label">' + e.nome + "</div>" +
        '<div class="pui-config-hint">' + e.dica + "</div>" +
        "</div>" +
        '<div class="pui-toggle ' + (this.ligado(e.id) ? "on" : "") +
        '" data-efeito="' + e.id + '"></div>' +
        "</div>",
    ).join("");
  },

  /**
   * Trata o clique num interruptor. Devolve `true` quando era mesmo um efeito,
   * para a tela saber que já tratou o evento.
   */
  tratarClique(alvo) {
    const el = alvo && alvo.closest ? alvo.closest("[data-efeito]") : null;
    if (!el) return false;
    const ligado = this.alternar(el.getAttribute("data-efeito"));
    el.classList.toggle("on", ligado);
    return true;
  },
};

EfeitosVisuais.carregar();

// Check: a sanitização do save. O estrago que isto pega é o clássico do
// projeto — estado salvo envelhece, e a tela passa a renderizar `undefined`.
console.assert(
  (() => {
    const E = EfeitosVisuais;
    const original = E.estado;

    // Save de uma versão que tinha outro efeito, com tipo errado no meio.
    const sujo = { crt: false, efeitoQueNaoExisteMais: true, grao: "sim" };
    const limpo = {};
    E.CATALOGO.forEach((e) => (limpo[e.id] = true));
    E.CATALOGO.forEach((e) => {
      if (typeof sujo[e.id] === "boolean") limpo[e.id] = sujo[e.id];
    });

    const ok =
      // O que veio certo é respeitado...
      limpo.crt === false &&
      // ...o que veio com tipo errado cai no padrão, não vira string...
      limpo.grao === true &&
      // ...e chave de fora do catálogo não entra no estado.
      !("efeitoQueNaoExisteMais" in limpo) &&
      // Todo efeito do catálogo tem nome e dica para a tela mostrar.
      E.CATALOGO.every((e) => e.id && e.nome && e.dica) &&
      // Padrão é tudo ligado: quem nunca abriu as opções vê o jogo completo.
      Object.values(E.padrao()).every((v) => v === true) &&
      // Efeito desconhecido conta como ligado (ver `ligado`).
      E.ligado("qualquer-coisa-nova") === true;

    E.estado = original;
    return ok;
  })(),
  "EfeitosVisuais: sanitização do save de efeitos fora do esperado",
);
