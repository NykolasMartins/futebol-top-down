// =============================================================================
// Elenco — o elenco VIVO do mundo. Envelhece, evolui, se aposenta e se renova.
// =============================================================================
// `REAL_ROSTERS` é o ponto de partida, não a verdade do jogo: sem isto os
// mesmos 504 jogadores ficam com o mesmo rating para sempre, e a temporada 5 é
// idêntica à 1 — o único que evolui é o usuário. É o que separa "vários jogos
// seguidos" de "uma carreira".
//
// A PORTA É UMA SÓ: `getTeamRoster()` (RealRosters.js) pergunta aqui primeiro.
// Quem lê elenco — GameScene, CareerMode, MatchSimulator, mercado — continua
// chamando o que já chamava e passa a ver o mundo vivo sem saber que existe
// este arquivo.
//
// Idade não está no banco e não vai estar: 504 entradas escritas à mão
// envelheceriam mal. Ela é DERIVADA do `id` por hash (mesma técnica da
// aparência) e aí sim guardada no save, porque a partir da primeira virada ela
// é estado, não derivação.

const Elenco = {
  // Curva de evolução por faixa etária: [mínimo, máximo] de pontos de rating
  // por temporada. Não é simulação de fisiologia — é o formato que faz um
  // elenco parecer vivo: garoto explode, veterano cai, o meio oscila.
  CURVA: [
    { ate: 21, de: 1, a: 5 },
    { ate: 24, de: 0, a: 3 },
    { ate: 28, de: -1, a: 2 },
    { ate: 31, de: -2, a: 1 },
    { ate: 34, de: -3, a: 0 },
    { ate: 99, de: -5, a: -1 },
  ],
  IDADE_MIN: 18,
  IDADE_MAX_CARREIRA: 39, // aqui todo mundo pendura as chuteiras
  APOSENTA_DE: 34, // a partir daqui já pode parar, com chance crescente
  RATING_MIN: 45,
  RATING_MAX: 92,
  // Artilheiro do ano ganha um empurrão: quem joga bem evolui mais que quem
  // apenas existe no elenco. É o único acoplamento com a temporada jogada.
  BONUS_ARTILHEIRO: 2,
  GOLS_PARA_BONUS: 8,

  /** `{ [clube]: [ {id, name, position, rating, age} ] }` — o mundo vivo. */
  mundo: null,
  _nomes: null,

  // ───────────────────────────────────────────────────────────────────────────
  // PRNG próprio (xorshift32), pelo mesmo motivo do SeasonManager: a mesma
  // `worldSeed` tem de reproduzir a mesma carreira. `Math.random` aqui faria
  // um save carregado duas vezes divergir.
  // ───────────────────────────────────────────────────────────────────────────
  _semente: 1,
  _rand() {
    let x = this._semente;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this._semente = x >>> 0 || 1;
    return this._semente / 4294967296;
  },
  _entre(min, max) {
    return min + Math.floor(this._rand() * (max - min + 1));
  },

  /** FNV-1a, o mesmo hash da aparência: derivação estável a partir do id. */
  _hash(texto) {
    let h = 2166136261;
    const s = String(texto || "anon");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  },

  /**
   * Idade inicial derivada do id, enviesada pelo rating: craque de 88 não pode
   * nascer com 19 anos e nem com 36 — quem chegou lá está no auge. O hash
   * garante que o mesmo jogador tenha sempre a mesma idade no primeiro ano.
   */
  idadeInicial(jogador) {
    const h = this._hash(jogador.id || jogador.name);
    const r = jogador.rating || 70;
    if (r >= 84) return 25 + (h % 8); // 25..32, auge
    if (r >= 78) return 22 + (h % 11); // 22..32
    return 18 + (h % 17); // 18..34, o resto da carreira inteira
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Ciclo de vida
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * De onde sair gente: o mundo vivo se ele já tem CLUBE, senão o banco.
   *
   * A distinção não é preciosismo. `this.mundo` também guarda convocações em
   * cache, então "o mundo existe" não é a mesma pergunta que "o mundo tem
   * clubes": a primeira seleção montada criava o objeto, e a seguinte lia um
   * mundo só de seleções — e voltava vazia. A primeira convocação do jogo
   * funcionava, a segunda não.
   */
  _fonteDeClubes() {
    const temClube =
      this.mundo &&
      Object.keys(this.mundo).some(
        (k) => typeof NATIONAL_TEAMS === "undefined" || !NATIONAL_TEAMS[k],
      );
    if (temClube) return this.mundo;
    return (typeof REAL_ROSTERS !== "undefined" && REAL_ROSTERS) || {};
  },

  /**
   * Primeira carga: copia `REAL_ROSTERS` e dá idade a todo mundo. Idempotente —
   * mundo vivo não é recriado, pela mesma razão que `initializeWorld` não é.
   */
  iniciar(seed) {
    this._semente = (seed >>> 0) || 1;
    // Mundo VIVO não se recria — mas mundo só com seleções em cache não é
    // mundo vivo, e cair nessa guarda pularia a criação do mundo inteiro.
    if (this._fonteDeClubes() === this.mundo) return this.mundo;
    if (typeof REAL_ROSTERS === "undefined") return null;

    // Convocação em cache é descartada aqui: foi montada do banco cru, sem
    // idade nem envelhecimento.
    this.mundo = {};
    Object.keys(REAL_ROSTERS).forEach((clube) => {
      this.mundo[clube] = REAL_ROSTERS[clube].map((j) => ({
        ...j,
        age: this.idadeInicial(j),
      }));
    });
    return this.mundo;
  },

  /** Elenco vivo do clube, ou o banco original enquanto o mundo não existir. */
  doClube(clube) {
    if (this.mundo && this.mundo[clube]) return this.mundo[clube];
    // Seleção não tem elenco escrito: ela é CONVOCADA por nacionalidade, e por
    // isso é montada sob demanda (e cacheada no mundo, para o `getTeamRoster`
    // achar como qualquer outro time).
    if (typeof NATIONAL_TEAMS !== "undefined" && NATIONAL_TEAMS[clube])
      return this.selecao(clube);
    return (typeof REAL_ROSTERS !== "undefined" && REAL_ROSTERS[clube]) || null;
  },

  /**
   * Convoca a seleção de um país: o melhor goleiro e os 6 melhores de linha
   * entre TODOS os jogadores daquela NACIONALIDADE, joguem onde jogarem.
   * Ninguém escreve elenco de seleção à mão — assim ela envelhece junto com o
   * mundo e a convocação do ano que vem já reflete quem subiu da base.
   */
  selecao(id) {
    const dados = typeof NATIONAL_TEAMS !== "undefined" && NATIONAL_TEAMS[id];
    if (!dados || typeof LEAGUES_DB === "undefined") return null;
    if (this.mundo && this.mundo[id]) return this.mundo[id];

    // Varre o MUNDO INTEIRO e filtra por NACIONALIDADE — não pela liga. Ler só
    // a liga do país convocava o estrangeiro que joga lá (o uruguaio do
    // Flamengo entrava na Seleção Brasileira) e deixava de fora o brasileiro
    // que joga na Europa, que é exatamente quem uma seleção convoca.
    const fonte = this._fonteDeClubes();
    const candidatos = [];
    Object.keys(fonte).forEach((clube) => {
      if (NATIONAL_TEAMS[clube]) return; // outra seleção não é fonte de gente
      (fonte[clube] || []).forEach((j) => {
        if (getPlayerNationality(j, clube) === dados.country)
          candidatos.push(j);
      });
    });
    if (!candidatos.length) return null;

    const porRating = (a, b) => b.rating - a.rating;
    const gk = candidatos.filter((j) => j.position === "GK").sort(porRating)[0];
    const linha = candidatos
      .filter((j) => j.position !== "GK")
      .sort(porRating)
      .slice(0, 6);
    const convocados = (gk ? [gk, ...linha] : linha).map((j) => ({ ...j }));

    if (!this.mundo) this.mundo = {};
    this.mundo[id] = convocados;
    return convocados;
  },

  /** Esquece as convocações: a virada de temporada muda quem é o melhor. */
  limparSelecoes() {
    if (!this.mundo || typeof NATIONAL_TEAMS === "undefined") return;
    Object.keys(NATIONAL_TEAMS).forEach((id) => delete this.mundo[id]);
  },

  /**
   * Vira o ano para o mundo inteiro: todo mundo faz aniversário, o rating anda
   * pela curva, quem passou do ponto se aposenta e a base entrega um garoto no
   * lugar. `golsPorJogador` (opcional) é o que faz o artilheiro evoluir mais.
   *
   * Devolve o resumo — aposentados e revelações — para virar notícia.
   */
  virarTemporada(golsPorJogador) {
    if (!this.mundo) return { aposentados: [], revelacoes: [] };
    const gols = golsPorJogador || {};
    const aposentados = [];
    const revelacoes = [];

    // Seleção não envelhece: ela é uma CÓPIA de jogadores que já vão envelhecer
    // no clube deles. Envelhecer as duas somaria dois anos por temporada ao
    // convocado. A convocação inteira é descartada no fim (`limparSelecoes`) e
    // remontada com os ratings novos quando alguém pedir.
    const clubes = Object.keys(this.mundo).filter(
      (k) => typeof NATIONAL_TEAMS === "undefined" || !NATIONAL_TEAMS[k],
    );
    clubes.forEach((clube) => {
      const elenco = this.mundo[clube];
      const forca = this.forcaDoClube(clube);

      for (let i = 0; i < elenco.length; i++) {
        const j = elenco[i];
        j.age = (j.age || this.idadeInicial(j)) + 1;

        if (this.seAposenta(j)) {
          aposentados.push({ nome: j.name, clube, idade: j.age });
          const cria = this.revelar(clube, j.position, forca);
          revelacoes.push({ nome: cria.name, clube, idade: cria.age });
          elenco[i] = cria;
          continue;
        }

        const faixa = this.CURVA.find((f) => j.age <= f.ate);
        let delta = this._entre(faixa.de, faixa.a);
        if ((gols[j.id] || 0) >= this.GOLS_PARA_BONUS)
          delta += this.BONUS_ARTILHEIRO;
        j.rating = Math.max(
          this.RATING_MIN,
          Math.min(this.RATING_MAX, j.rating + delta),
        );
      }

      this._reequilibrar(clube);
    });

    this.limparSelecoes();
    return { aposentados, revelacoes };
  },

  /**
   * O CLUBE volta ao nível dele — não o jogador. Sem isto o mundo inteiro
   * derrete: medido, 79.9 de média virava 73.8 em dez temporadas, porque a
   * curva é líquida negativa numa população madura e o garoto entra abaixo da
   * média. O usuário continuaria subindo e enfrentaria uma liga de pernas de
   * pau. Um ponto por temporada, no máximo: corrige a deriva sem apagar o
   * envelhecimento de ninguém.
   */
  _reequilibrar(clube) {
    const base = this.forcaBase(clube);
    if (!base) return;
    const elenco = this.mundo[clube];
    const atual = elenco.reduce((s, j) => s + j.rating, 0) / elenco.length;
    const falta = base - atual;
    if (Math.abs(falta) < 0.75) return;
    const passo = falta > 0 ? 1 : -1;
    elenco.forEach((j) => {
      j.rating = Math.max(
        this.RATING_MIN,
        Math.min(this.RATING_MAX, j.rating + passo),
      );
    });
  },

  /** Nível HISTÓRICO do clube: a média do banco original, que não envelhece. */
  forcaBase(clube) {
    if (typeof REAL_ROSTERS === "undefined") return null;
    const original = REAL_ROSTERS[clube];
    if (!original || !original.length) return null;
    if (!this._base) this._base = {};
    if (this._base[clube] === undefined)
      this._base[clube] =
        original.reduce((s, j) => s + j.rating, 0) / original.length;
    return this._base[clube];
  },

  /** Aos 39 para todo mundo; antes disso, chance que cresce com a idade. */
  seAposenta(j) {
    if (j.age >= this.IDADE_MAX_CARREIRA) return true;
    if (j.age < this.APOSENTA_DE) return false;
    // 34 anos: 12%. 38: 60%. Rating alto segura mais um ano.
    const base = (j.age - this.APOSENTA_DE + 1) * 0.12;
    const desconto = j.rating >= 82 ? 0.5 : 1;
    return this._rand() < base * desconto;
  },

  /** Média de rating do clube — a régua do garoto que sobe da base. */
  forcaDoClube(clube) {
    const e = this.mundo[clube] || [];
    if (!e.length) return 70;
    return e.reduce((s, j) => s + j.rating, 0) / e.length;
  },

  /**
   * Sobe um garoto da base na posição vaga. O nome sai da recombinação dos
   * nomes que JÁ existem no banco: sem isso seria preciso um dicionário de
   * nomes por país, que é dado novo para manter — e o resultado soa igual.
   */
  revelar(clube, posicao, forca) {
    const nomes = this.poolDeNomes();
    const nome =
      nomes.primeiros[this._entre(0, nomes.primeiros.length - 1)] +
      " " +
      nomes.ultimos[this._entre(0, nomes.ultimos.length - 1)];
    const idade = this._entre(this.IDADE_MIN, this.IDADE_MIN + 2);
    const rating = Math.max(
      this.RATING_MIN,
      Math.round(forca) - this._entre(6, 14),
    );
    return {
      // O id carrega clube e um número do PRNG: precisa ser único e estável
      // porque é a chave de estatística, de aparência e de save.
      id:
        clube.toLowerCase() +
        "_cria_" +
        this._hash(nome + clube + this._semente).toString(36).slice(0, 6),
      name: nome,
      position: posicao,
      rating,
      age: idade,
    };
  },

  /** Nomes colhidos do banco uma vez, para a base ter de onde tirar gente. */
  poolDeNomes() {
    if (this._nomes) return this._nomes;
    const primeiros = new Set();
    const ultimos = new Set();
    Object.keys(REAL_ROSTERS || {}).forEach((clube) =>
      REAL_ROSTERS[clube].forEach((j) => {
        const partes = String(j.name).trim().split(/\s+/);
        if (partes[0]) primeiros.add(partes[0]);
        if (partes.length > 1) ultimos.add(partes[partes.length - 1]);
        else if (partes[0]) ultimos.add(partes[0]);
      }),
    );
    this._nomes = {
      primeiros: [...primeiros],
      ultimos: [...ultimos],
    };
    return this._nomes;
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Save (sanitizado na leitura, como todo estado persistido do projeto)
  // ───────────────────────────────────────────────────────────────────────────
  /** As seleções ficam de fora: são derivadas, e derivado não se salva. */
  paraSalvar() {
    if (!this.mundo) return this.mundo;
    const saida = {};
    Object.keys(this.mundo).forEach((k) => {
      if (typeof NATIONAL_TEAMS !== "undefined" && NATIONAL_TEAMS[k]) return;
      saida[k] = this.mundo[k];
    });
    return saida;
  },

  carregar(dados) {
    if (!dados || typeof dados !== "object") return false;
    const limpo = {};
    Object.keys(dados).forEach((clube) => {
      const lista = dados[clube];
      if (!Array.isArray(lista)) return;
      const validos = lista.filter(
        (j) =>
          j &&
          typeof j.id === "string" &&
          typeof j.name === "string" &&
          typeof j.position === "string" &&
          Number.isFinite(j.rating) &&
          Number.isFinite(j.age),
      );
      // Elenco pela metade é pior que elenco velho: o clube perderia o goleiro
      // e o MatchSimulator passaria a achar que ele é um time de 3 jogadores.
      if (validos.length === lista.length && validos.length > 0)
        limpo[clube] = validos;
    });
    if (!Object.keys(limpo).length) return false;
    this.mundo = limpo;
    return true;
  },
};

// =============================================================================
// Check: a passagem do tempo. O estrago que isto pega é silencioso — um elenco
// que encolhe, um clube que fica sem goleiro, ou uma liga inteira estacionada
// no mesmo rating por 10 anos (que é o mundo de hoje, e é o bug que este
// arquivo existe para consertar).
// =============================================================================
console.assert(
  (() => {
    if (typeof REAL_ROSTERS === "undefined") return true;
    const salvo = Elenco.mundo;
    const semente = Elenco._semente;
    Elenco.mundo = null;
    Elenco.iniciar(12345);

    const clube = Object.keys(Elenco.mundo)[0];
    const tamanhoAntes = Elenco.mundo[clube].length;
    const posicoesAntes = Elenco.mundo[clube].map((j) => j.position).join();
    const idadesIniciais = Elenco.mundo[clube].map((j) => j.age);

    // Idade derivada: dentro da carreira e ESTÁVEL para o mesmo id.
    const idadeOk = idadesIniciais.every((a) => a >= 18 && a <= 34);
    const primeiro = REAL_ROSTERS[clube][0];
    const mesmaIdade =
      Elenco.idadeInicial(primeiro) === Elenco.idadeInicial(primeiro);

    // Dez temporadas: o mundo tem de continuar de pé e ter MUDADO.
    const ratingsAntes = Elenco.mundo[clube].map((j) => j.rating).join();
    let aposentados = 0;
    let revelacoes = 0;
    for (let i = 0; i < 10; i++) {
      const r = Elenco.virarTemporada();
      aposentados += r.aposentados.length;
      revelacoes += r.revelacoes.length;
    }
    const ratingsDepois = Elenco.mundo[clube].map((j) => j.rating).join();
    const tamanhoDepois = Elenco.mundo[clube].length;
    const posicoesDepois = Elenco.mundo[clube].map((j) => j.position).join();
    const idades = [];
    const ids = new Set();
    let semNome = 0;
    Object.keys(Elenco.mundo).forEach((c) =>
      Elenco.mundo[c].forEach((j) => {
        idades.push(j.age);
        ids.add(j.id);
        if (!j.name || !j.name.trim()) semNome++;
      }),
    );
    const totalJogadores = Object.keys(Elenco.mundo).reduce(
      (s, c) => s + Elenco.mundo[c].length,
      0,
    );

    // Bônus do artilheiro: quem fez gol evolui MAIS que o companheiro que não
    // fez. Os DOIS na mesma virada de propósito — o reequilíbrio do clube
    // aplica o mesmo ponto aos dois e sai da conta sozinho. Comparar duas
    // execuções separadas deixaria o resultado à mercê dele.
    Elenco.mundo = null;
    Elenco.iniciar(999);
    // Curva ZERADA durante a medição: a evolução normal é aleatória dentro da
    // faixa, e com ela ligada o que se mede é o sorteio, não o bônus. Com a
    // curva em zero sobra exatamente o que este teste quer.
    const curvaReal = Elenco.CURVA;
    Elenco.CURVA = [{ ate: 99, de: 0, a: 0 }];
    const time = Elenco.mundo[clube];
    time.forEach((j) => (j.age = 26)); // longe da idade de aposentadoria
    const artilheiro = time[1];
    const reserva = time[2];
    const r1 = artilheiro.rating;
    const r2 = reserva.rating;
    Elenco.virarTemporada({ [artilheiro.id]: 20 });
    const comGols = artilheiro.rating - r1;
    const semGols = reserva.rating - r2;
    Elenco.CURVA = curvaReal;

    // Save sanitizado: elenco pela metade é descartado inteiro.
    const bomSave = Elenco.carregar({ X: [{ id: "a", name: "A", position: "GK", rating: 70, age: 25 }] });
    const salvouLixo = Elenco.carregar({ X: [{ id: "a" }] });

    Elenco.mundo = salvo;
    Elenco._semente = semente;

    return (
      idadeOk &&
      mesmaIdade &&
      // O elenco não encolhe nem troca de formato: aposentado sai, cria entra
      // na MESMA posição — senão um clube perde o goleiro e o MatchSimulator
      // passa a achar que ele é um time de três jogadores.
      tamanhoDepois === tamanhoAntes &&
      posicoesDepois === posicoesAntes &&
      totalJogadores === 504 &&
      ids.size === totalJogadores && // nenhum id repetido entre as crias
      semNome === 0 &&
      idades.every((a) => a >= 18 && a < Elenco.IDADE_MAX_CARREIRA) &&
      // Dez anos mexeram no mundo, e a base repôs exatamente quem saiu.
      ratingsAntes !== ratingsDepois &&
      aposentados > 0 &&
      revelacoes === aposentados &&
      comGols === semGols + Elenco.BONUS_ARTILHEIRO &&
      bomSave === true &&
      salvouLixo === false
    );
  })(),
  "Elenco: a passagem do tempo saiu do lugar (idade, aposentadoria ou reposição)",
);

// =============================================================================
// Check: a CONVOCAÇÃO. Dois erros silenciosos moram aqui — convocar pelo país
// da LIGA (o uruguaio do Flamengo entrando na Seleção Brasileira) e a segunda
// seleção do jogo sair vazia porque a primeira virou a fonte de gente.
// =============================================================================
console.assert(
  (() => {
    if (
      typeof NATIONAL_TEAMS === "undefined" ||
      typeof REAL_ROSTERS === "undefined" ||
      typeof getPlayerNationality !== "function"
    )
      return true;

    const salvo = Elenco.mundo;
    Elenco.mundo = null;

    // Duas seguidas: a segunda é a que quebrava.
    const bra = Elenco.selecao("selecao_brasil") || [];
    const ing = Elenco.selecao("selecao_inglaterra") || [];
    const nomes = (l) => l.map((j) => j.name);

    // Nacionalidade explícita vence a derivação, e a derivada é ESTÁVEL.
    const arras = REAL_ROSTERS.Flamengo.find(
      (j) => j.id === "flamengo_arrascaeta",
    );
    const outro = REAL_ROSTERS.Flamengo.find((j) => !j.nationality);
    const derivadaEstavel =
      getPlayerNationality(outro, "Flamengo") ===
      getPlayerNationality(outro, "Flamengo");

    // Ninguém joga por duas seleções.
    const ids = new Set(bra.map((j) => j.id));
    const dupla = ing.some((j) => ids.has(j.id));

    Elenco.mundo = salvo;

    return (
      bra.length === 7 &&
      ing.length === 7 &&
      bra.filter((j) => j.position === "GK").length === 1 &&
      ing.filter((j) => j.position === "GK").length === 1 &&
      getPlayerNationality(arras, "Flamengo") === "Uruguai" &&
      !nomes(bra).includes("Arrascaeta") &&
      derivadaEstavel &&
      !dupla
    );
  })(),
  "Elenco: convocação fora do lugar (nacionalidade errada ou seleção vazia)",
);
