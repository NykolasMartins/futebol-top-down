// =============================================================================
// Som — todo o áudio do jogo, gerado em runtime. ZERO arquivo.
// =============================================================================
// O projeto não carrega asset de áudio e não vai carregar: cada som é montado
// com osciladores e ruído no WebAudio, na hora. Isso não é preciosismo — é o
// que mantém a regra do projeto (sem bundler, sem dependência, deploy estático)
// e o que faz o repositório continuar cabendo num push.
//
// A ARQUITETURA que importa: cada som é uma FUNÇÃO PURA de
// `(ctx, destino, t0, opções)`. Ela não sabe se está tocando na placa de som ou
// sendo renderizada num `OfflineAudioContext` — e é por isso que o check do
// boot consegue medir exatamente o que o jogador ouve, em vez de medir uma
// maquete do som.
//
// O `AudioContext` NASCE no primeiro gesto do usuário (ver `destravar`). Criar
// antes é o que fazia o Chrome reclamar de "AudioContext was not allowed to
// start" — o motivo pelo qual o Phaser roda com `noAudio: true` até hoje.
// Continuamos sem usar o gerente de áudio do Phaser: não há `load.audio` para
// ele gerenciar, e dois contextos seria um a mais.

const Som = {
  CHAVE: "somDoJogo",

  /** Igual ao EfeitosVisuais: a lista É a fonte (tela, padrão e save). */
  CATALOGO: [
    {
      id: "efeitos",
      nome: "EFEITOS SONOROS",
      dica: "Chute, passe, bote, defesa, rede, apito e cartão",
    },
    {
      id: "torcida",
      nome: "TORCIDA",
      dica: "Estádio ao fundo, que sobe quando o jogo aperta",
    },
  ],

  // Teto de mixagem. Todo som passa por aqui, então é o único lugar onde o
  // jogo inteiro fica mais alto ou mais baixo.
  VOLUME_MESTRE: 0.55,

  estado: null,
  ctx: null,
  mestre: null,
  ruido: null, // buffer de ruído branco, reusado por todo som percussivo
  torcida: null, // { fonte, ganho, filtro }
  _nivelTorcida: 0,

  // ───────────────────────────────────────────────────────────────────────────
  // Estado persistido (mesma regra do resto: sanitiza no load, confia no uso)
  // ───────────────────────────────────────────────────────────────────────────
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
      /* modo privado: a escolha vale só nesta sessão */
    }
  },

  ligado(id) {
    if (!this.estado) this.carregar();
    return this.estado[id] !== false;
  },

  alternar(id) {
    if (!this.estado) this.carregar();
    this.estado[id] = !this.ligado(id);
    this.salvar();
    // A torcida é um loop contínuo, não um disparo que acaba sozinho: desligar
    // tem de calar o que JÁ está tocando, e religar tem de voltar a tocar
    // AGORA — sem isso quem desliga e se arrepende fica em silêncio até a
    // próxima partida. `_emPartida` é o que impede o estádio de tocar no menu.
    if (id === "torcida") {
      if (!this.estado.torcida) this._calarTorcida();
      else if (this._emPartida) this.iniciarTorcida();
    }
    return this.estado[id];
  },

  /** Interruptores em HTML, para as duas telas de configuração usarem o mesmo. */
  linhasHtml() {
    if (!this.estado) this.carregar();
    return this.CATALOGO.map(
      (e) =>
        '<div class="pui-config-row">' +
        "<div>" +
        '<div class="pui-config-label">' +
        e.nome +
        "</div>" +
        '<div class="pui-config-hint">' +
        e.dica +
        "</div>" +
        "</div>" +
        '<div class="pui-toggle ' +
        (this.ligado(e.id) ? "on" : "") +
        '" data-som="' +
        e.id +
        '"></div>' +
        "</div>",
    ).join("");
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Contexto
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * Cria (ou retoma) o contexto. Só pode ser chamado de dentro de um gesto do
   * usuário — é regra do navegador, não escolha nossa. O `main.js` liga isto no
   * primeiro clique/tecla da página e nunca mais.
   */
  destravar() {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return null;
    if (!this.ctx) {
      this.ctx = new Contexto();
      this.mestre = this.ctx.createGain();
      this.mestre.gain.value = this.VOLUME_MESTRE;
      this.mestre.connect(this.ctx.destination);
      this.ruido = Som.criarRuido(this.ctx);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  },

  /** Ruído branco de 2s, criado uma vez e reusado por todo som percussivo. */
  criarRuido(ctx) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const dados = buffer.getChannelData(0);
    for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
    return buffer;
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Tijolos. Todos recebem `ctx` e `destino` — é o que deixa o check renderizar
  // o mesmo som que o jogo toca.
  // ───────────────────────────────────────────────────────────────────────────

  /** Envelope percussivo: sobe quase instantâneo e decai. */
  envelope(ctx, destino, t0, pico, ataque, queda) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(pico, 0.0001), t0 + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + ataque + queda);
    g.connect(destino);
    return g;
  },

  /** Oscilador com varredura de frequência (o "thump" e os apitos saem daqui). */
  tom(ctx, destino, t0, { tipo = "sine", de, para, dur, pico, ataque = 0.005 }) {
    const osc = ctx.createOscillator();
    osc.type = tipo;
    osc.frequency.setValueAtTime(de, t0);
    if (para && para !== de)
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(para, 0.0001),
        t0 + dur,
      );
    const g = this.envelope(ctx, destino, t0, pico, ataque, dur);
    osc.connect(g);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    return osc;
  },

  /** Ruído filtrado: a base de rede, raspagem, defesa e chute. */
  batida(
    ctx,
    destino,
    t0,
    { dur, pico, freq, q = 1, tipoFiltro = "bandpass", freqFim, buffer },
  ) {
    const fonte = ctx.createBufferSource();
    fonte.buffer = buffer || Som.criarRuido(ctx);
    fonte.loop = true;
    const filtro = ctx.createBiquadFilter();
    filtro.type = tipoFiltro;
    filtro.frequency.setValueAtTime(freq, t0);
    if (freqFim)
      filtro.frequency.exponentialRampToValueAtTime(
        Math.max(freqFim, 0.0001),
        t0 + dur,
      );
    filtro.Q.value = q;
    const g = this.envelope(ctx, destino, t0, pico, 0.004, dur);
    fonte.connect(filtro);
    filtro.connect(g);
    fonte.start(t0);
    fonte.stop(t0 + dur + 0.05);
    return fonte;
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Os sons. Cada um é (ctx, destino, t0, opções) e nada mais.
  // ───────────────────────────────────────────────────────────────────────────
  RECEITAS: {
    /** Chute: pancada grave no couro. `forca` 0..1 muda peso e brilho. */
    chute(ctx, destino, t0, { forca = 1 } = {}, buffer) {
      const f = somClamp(forca, 0.2, 1);
      Som.tom(ctx, destino, t0, {
        tipo: "sine",
        de: 190 + 90 * f,
        para: 55,
        dur: 0.1,
        pico: 0.55 * f,
      });
      Som.batida(ctx, destino, t0, {
        dur: 0.06,
        pico: 0.3 * f,
        freq: 1500,
        freqFim: 500,
        q: 0.8,
        buffer,
      });
    },

    /** Passe: o mesmo gesto, mais curto e mais agudo. Toque, não pancada. */
    passe(ctx, destino, t0, opcoes, buffer) {
      Som.tom(ctx, destino, t0, {
        tipo: "sine",
        de: 260,
        para: 120,
        dur: 0.07,
        pico: 0.3,
      });
      Som.batida(ctx, destino, t0, {
        dur: 0.04,
        pico: 0.16,
        freq: 2200,
        q: 0.7,
        buffer,
      });
    },

    /** Trave: metal. Dois parciais desafinados e decaimento longo. */
    trave(ctx, destino, t0, opcoes, buffer) {
      [437, 661].forEach((f, i) =>
        Som.tom(ctx, destino, t0, {
          tipo: "triangle",
          de: f,
          para: f * 0.96,
          dur: 0.7 - i * 0.2,
          pico: 0.35 - i * 0.12,
        }),
      );
      Som.batida(ctx, destino, t0, {
        dur: 0.05,
        pico: 0.25,
        freq: 3200,
        q: 2,
        buffer,
      });
    },

    /** Rede: chiado curto de malha, sem tom nenhum. */
    rede(ctx, destino, t0, opcoes, buffer) {
      Som.batida(ctx, destino, t0, {
        dur: 0.22,
        pico: 0.62,
        freq: 2600,
        freqFim: 900,
        q: 0.6,
        buffer,
      });
    },

    /** Defesa do goleiro: luva. Estalo abafado. */
    defesa(ctx, destino, t0, opcoes, buffer) {
      Som.batida(ctx, destino, t0, {
        dur: 0.09,
        pico: 0.58,
        freq: 900,
        freqFim: 300,
        q: 0.9,
        tipoFiltro: "lowpass",
        buffer,
      });
      Som.tom(ctx, destino, t0, {
        tipo: "sine",
        de: 130,
        para: 70,
        dur: 0.08,
        pico: 0.25,
      });
    },

    /** Bote e carrinho: raspagem no gramado. O carrinho é mais longo e sujo. */
    raspagem(ctx, destino, t0, { carrinho = false } = {}, buffer) {
      Som.batida(ctx, destino, t0, {
        dur: carrinho ? 0.42 : 0.16,
        pico: carrinho ? 0.62 : 0.34,
        freq: carrinho ? 1700 : 2400,
        freqFim: carrinho ? 380 : 900,
        q: 0.5,
        buffer,
      });
    },

    /**
     * Apito. `toques` é o que separa falta (1) do fim de jogo (3) — e a
     * "ervilha" do apito é o tremolo rápido, não um som diferente.
     */
    apito(ctx, destino, t0, { toques = 1, dur = 0.26 } = {}) {
      for (let i = 0; i < toques; i++) {
        const inicio = t0 + i * (dur + 0.12);
        [2180, 2680].forEach((f, j) => {
          const osc = ctx.createOscillator();
          osc.type = "square";
          osc.frequency.setValueAtTime(f, inicio);
          const g = Som.envelope(ctx, destino, inicio, 0.2 - j * 0.07, 0.01, dur);
          // A ervilha: modulação rápida de ganho por cima do envelope.
          const lfo = ctx.createOscillator();
          const lfoGanho = ctx.createGain();
          lfo.frequency.setValueAtTime(28, inicio);
          lfoGanho.gain.setValueAtTime(0.35, inicio);
          lfo.connect(lfoGanho);
          lfoGanho.connect(g.gain);
          lfo.start(inicio);
          lfo.stop(inicio + dur + 0.05);
          osc.connect(g);
          osc.start(inicio);
          osc.stop(inicio + dur + 0.05);
        });
      }
    },

    /** Cartão: dois bipes secos e altos. Não é apito — é aviso. */
    cartao(ctx, destino, t0, { vermelho = false } = {}) {
      const base = vermelho ? 520 : 880;
      [0, 0.13].forEach((atraso, i) =>
        Som.tom(ctx, destino, t0 + atraso, {
          tipo: "square",
          de: base * (vermelho ? 1 - i * 0.18 : 1 + i * 0.26),
          dur: 0.09,
          pico: 0.28,
        }),
      );
    },
  },

  /**
   * Toca um som pelo nome. Silencioso e barato antes do primeiro gesto do
   * usuário (sem contexto) e com os efeitos desligados — quem chama não
   * precisa perguntar nada disso.
   */
  tocar(nome, opcoes) {
    if (!this.ctx || !this.ligado("efeitos")) return false;
    const receita = this.RECEITAS[nome];
    if (!receita) return false;
    receita(this.ctx, this.mestre, this.ctx.currentTime + 0.001, opcoes || {}, this.ruido);
    return true;
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Torcida — ruído contínuo, com o nível dizendo o quanto o jogo aperta.
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * Liga o estádio. É UMA fonte em loop com filtro passa-baixa: subir o nível
   * abre o filtro e o ganho juntos, que é o que faz a torcida "acordar" em vez
   * de só ficar mais alta.
   */
  iniciarTorcida() {
    // A partida começou, mesmo que o jogador tenha o estádio desligado: é essa
    // marca que deixa o interruptor religar o som no meio do jogo.
    this._emPartida = true;
    if (!this.ctx || this.torcida || !this.ligado("torcida")) return;
    const fonte = this.ctx.createBufferSource();
    fonte.buffer = this.ruido;
    fonte.loop = true;
    const filtro = this.ctx.createBiquadFilter();
    filtro.type = "lowpass";
    filtro.frequency.value = 500;
    filtro.Q.value = 0.4;
    const ganho = this.ctx.createGain();
    ganho.gain.value = 0.0001;
    fonte.connect(filtro);
    filtro.connect(ganho);
    ganho.connect(this.mestre);
    fonte.start();
    this.torcida = { fonte, ganho, filtro };
    this.nivelTorcida(0.25);
  },

  /** Fim da partida: cala e esquece que havia jogo. */
  pararTorcida() {
    this._emPartida = false;
    this._calarTorcida();
  },

  /** Só cala. A partida continua — é o caso do interruptor no meio do jogo. */
  _calarTorcida() {
    if (!this.torcida) return;
    try {
      this.torcida.fonte.stop();
    } catch (erro) {
      /* já parada */
    }
    this.torcida = null;
    this._nivelTorcida = 0;
  },

  /** `nivel` 0..1. A rampa é longa de propósito: estádio não liga e desliga. */
  nivelTorcida(nivel, segundos = 1.2) {
    if (!this.torcida || !this.ctx) return;
    const n = somClamp(nivel, 0, 1);
    this._nivelTorcida = n;
    const t = this.ctx.currentTime;
    this.torcida.ganho.gain.cancelScheduledValues(t);
    this.torcida.ganho.gain.setValueAtTime(
      Math.max(this.torcida.ganho.gain.value, 0.0001),
      t,
    );
    this.torcida.ganho.gain.linearRampToValueAtTime(
      Math.max(0.05 + n * 0.5, 0.0001),
      t + segundos,
    );
    this.torcida.filtro.frequency.cancelScheduledValues(t);
    this.torcida.filtro.frequency.linearRampToValueAtTime(
      420 + n * 1900,
      t + segundos,
    );
  },

  /** Explosão do gol: sobe seco e volta devagar para o nível de antes. */
  explodirTorcida(favoravel = true) {
    if (!this.torcida || !this.ctx) return;
    const antes = this._nivelTorcida;
    // Gol contra a gente também faz barulho — só que menos, e é isso que
    // diferencia o estádio do seu time do estádio do adversário.
    this.nivelTorcida(favoravel ? 1 : 0.55, 0.15);
    const voltar = () => this.nivelTorcida(antes, 3.5);
    if (this.ctx.state === "running") setTimeout(voltar, 2200);
  },
};

/**
 * Clamp local. Este arquivo carrega ANTES do Phaser estar garantido em toda
 * página (e o check do boot roda sem cena nenhuma), então não dá para depender
 * de `Phaser.Math.Clamp` aqui.
 */
function somClamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

// =============================================================================
// Check: som mudo e som estourado são exatamente os dois defeitos que ninguém
// percebe até estar no ar — um não faz barulho, o outro estala a caixa. Aqui
// cada receita é RENDERIZADA num contexto offline (as mesmas funções que o jogo
// toca) e medida: tem de fazer barulho, e tem de caber no digital.
// =============================================================================
(() => {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) return;

  const nomes = Object.keys(Som.RECEITAS);
  const ESPACO = 1.2; // segundos entre um som e o outro na régua
  const ctx = new Offline(1, 44100 * ESPACO * (nomes.length + 1), 44100);
  const buffer = Som.criarRuido(ctx);
  nomes.forEach((nome, i) => {
    Som.RECEITAS[nome](ctx, ctx.destination, i * ESPACO + 0.01, {}, buffer);
  });

  ctx
    .startRendering()
    .then((saida) => {
      const dados = saida.getChannelData(0);
      const picos = nomes.map((nome, i) => {
        const de = Math.floor(i * ESPACO * 44100);
        const ate = Math.floor((i + 1) * ESPACO * 44100);
        let pico = 0;
        for (let j = de; j < ate; j++) pico = Math.max(pico, Math.abs(dados[j]));
        return { nome, pico };
      });
      const mudos = picos.filter((p) => p.pico < 0.01).map((p) => p.nome);
      const estourados = picos
        .filter((p) => p.pico * Som.VOLUME_MESTRE > 1)
        .map((p) => p.nome);
      console.assert(
        mudos.length === 0 && estourados.length === 0,
        "Som: receita muda " +
          JSON.stringify(mudos) +
          " ou estourando o teto " +
          JSON.stringify(estourados),
      );
    })
    .catch(() => {
      /* navegador sem render offline: o jogo toca igual, só não medimos */
    });
})();

/**
 * Trata o clique num interruptor de som. Espelha `EfeitosVisuais.tratarClique`
 * de propósito: as duas telas de configuração já chamam aquele, e uma segunda
 * linha ao lado é mais barata do que juntar dois domínios num catálogo só.
 */
Som.tratarClique = function (alvo) {
  const el = alvo && alvo.closest ? alvo.closest("[data-som]") : null;
  if (!el) return false;
  const ligado = this.alternar(el.getAttribute("data-som"));
  el.classList.toggle("on", ligado);
  return true;
};

Som.carregar();
