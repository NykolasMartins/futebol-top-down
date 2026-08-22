// =============================================================================
// SeasonManager.js — Estado da temporada e semeadura das copas continentais
// =============================================================================
// Fonte de verdade de QUEM disputa o quê. Não marca data (isso é do
// CalendarManager) e não simula partida (isso é do MatchSimulator) — só guarda
// o resultado de quem já jogou.

class SeasonManager {
  constructor(seed = Date.now()) {
    this.season = 1;
    // PRNG próprio: a mesma seed devolve a mesma temporada. Math.random tornaria
    // impossível reproduzir um bug de calendário relatado por save.
    this._seed = seed >>> 0;
    this.standings = {}; // leagueId -> classificação FINAL fictícia do ano anterior
    this.tables = {}; // leagueId -> tabela VIVA desta temporada, ordenada
    this.tournaments = {}; // cupId -> { name, participants:[clubId], bracket }
  }

  /** PRNG determinístico (xorshift32). */
  _rand() {
    let x = this._seed || 1;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    this._seed = x;
    return x / 4294967296;
  }

  _shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this._rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * Temporada 1 não tem ano anterior de onde tirar classificação. Em vez de
   * deixar as copas vazias, inventa uma tabela final plausível: ordena por
   * força com um ruído, para o favorito quase sempre passar mas não sempre.
   */
  /**
   * @param {Object|null} previousTables tabelas FINAIS da temporada anterior
   *   (`{leagueId: [linhas ordenadas]}`). Com elas as vagas saem da
   *   classificação real; sem elas (temporada 1) cai na tabela fictícia.
   */
  seedInitialTournaments(previousTables = null) {
    this.standings = {};
    for (const leagueId of getAllLeagueIds()) {
      const real = previousTables && previousTables[leagueId];
      this.standings[leagueId] =
        real && real.length ? real : this._fakeFinalTable(LEAGUES_DB[leagueId]);
    }
    this.poolRanking = this._rankPool();
    this.tournaments = {};
    for (const cupId in CONTINENTAL_CUPS) {
      const cup = CONTINENTAL_CUPS[cupId];
      // Uma regra só: toda liga que declara o campo de vagas classifica pela
      // TABELA, e o pool completa com quem não tem liga jogável. O Brasileirão
      // entra na Libertadores pelo mesmo caminho da Premier na Champions.
      const participants = [
        ...new Set([
          ...this._leagueQualifiers(cup.slotKey),
          ...this._poolQualifiers(cup.slotKey),
        ]),
      ];

      this.tournaments[cupId] = {
        id: cupId,
        name: cup.name,
        scope: "continental",
        confederation: cup.confederation,
        participants,
        bracket: this._buildKnockout(participants),
      };
    }

    // Copa DOMÉSTICA de cada liga, em paralelo aos pontos corridos: não tem
    // vaga a conquistar, entra o campeonato inteiro. Mesmo chaveamento das
    // continentais — `_buildKnockout` já completa com BYE.
    for (const cupId in DOMESTIC_CUPS) {
      const cup = DOMESTIC_CUPS[cupId];
      const participants = LEAGUES_DB[cup.leagueId].clubs.map((c) => c.id);
      this.tournaments[cupId] = {
        id: cupId,
        name: cup.name,
        scope: "domestic",
        leagueId: cup.leagueId,
        confederation: cup.confederation,
        participants,
        bracket: this._buildKnockout(participants),
      };
    }
    return this.tournaments;
  }

  /** Qualquer torneio de mata-mata (continental ou doméstico) com esse id. */
  isCup(competitionId) {
    return !!this.tournaments[competitionId];
  }

  /** Classificação fictícia: força + ruído, para não ser sempre igual. */
  _fakeFinalTable(league) {
    return league.clubs
      .map((c) => ({
        clubId: c.id,
        name: c.name,
        // Ruído de +-8: um azarão sobe, um favorito tropeça, sem virar loteria.
        score: c.strength + (this._rand() * 16 - 8),
      }))
      .sort((a, b) => b.score - a.score)
      .map((row, i) => ({ ...row, position: i + 1 }));
  }

  /**
   * A copa de cima pega as N primeiras da tabela; a de baixo pega as seguintes,
   * sem repetir quem já subiu. É a MESMA regra para Champions/Europa e para
   * Libertadores/Sul-Americana — só muda o campo de vagas que a liga declara.
   */
  _leagueQualifiers(slotKey) {
    // Copa "de baixo" -> campo da copa "de cima" cujas vagas ela pula.
    const acimaDe = {
      europaSlots: "championsSlots",
      sudamericanaSlots: "libertadoresSlots",
    };
    const out = [];
    for (const leagueId of getAllLeagueIds()) {
      const liga = LEAGUES_DB[leagueId];
      const vagas = liga[slotKey] || 0;
      if (!vagas) continue;
      const pulados = (acimaDe[slotKey] && liga[acimaDe[slotKey]]) || 0;
      this.standings[leagueId]
        .slice(pulados, pulados + vagas)
        .forEach((row) => out.push(row.clubId));
    }
    return out;
  }

  /**
   * Clubes sem liga jogável: sorteio do pool com peso por força, para os
   * grandes aparecerem mais na Libertadores. Mesma regra de "quem já subiu não
   * repete" das ligas.
   */
  _poolQualifiers(slotKey) {
    const pool = SOUTH_AMERICAN_POOL;
    const vagas = pool[slotKey] || 0;
    if (!vagas) return [];

    // A ordem do pool é fato da TEMPORADA, não de cada chamada — como a tabela
    // das ligas. Sorteando de novo por copa, o corte "pula as N primeiras"
    // pulava as primeiras de OUTRA ordenação e o mesmo clube caía na
    // Libertadores e na Sul-Americana.
    if (!this.poolRanking) this.poolRanking = this._rankPool();

    const pulados =
      slotKey === "sudamericanaSlots" ? pool.libertadoresSlots || 0 : 0;
    return this.poolRanking.slice(pulados, pulados + vagas);
  }

  /** Pool ordenado por força + ruído: os grandes aparecem mais na Libertadores. */
  _rankPool() {
    return SOUTH_AMERICAN_POOL.clubs
      .map((c) => ({ id: c.id, score: c.strength + (this._rand() * 20 - 10) }))
      .sort((a, b) => b.score - a.score)
      .map((c) => c.id);
  }

  /**
   * Mata-mata a partir de qualquer quantidade de times. Completa com BYE até a
   * próxima potência de 2 — assim 12 ou 20 participantes funcionam sem tabela
   * de chaveamento escrita à mão.
   */
  _buildKnockout(participants) {
    if (!participants.length) return { rounds: [] };

    let tamanho = 1;
    while (tamanho < participants.length) tamanho *= 2;

    // BYE vai UM POR CONFRONTO, não empilhado no fim da lista. Empilhando,
    // 19 clubes numa chave de 32 deixavam metade do chaveamento vazia e um
    // clube caminhava até a semifinal sem jogar — na tela parecia que ele
    // estava clonado em três fases. Agora os primeiros `byes` confrontos são
    // walkover e o resto é jogo de verdade: ninguém passa duas fases de graça.
    const sorteados = this._shuffle(participants);
    const byes = tamanho - sorteados.length;
    const slots = [];
    for (let i = 0; i < tamanho / 2; i++) {
      slots.push(sorteados.shift() || null);
      slots.push(i < byes ? null : sorteados.shift() || null);
    }

    const rounds = [];
    let atual = slots;
    let numero = 1;
    while (atual.length > 1) {
      const jogos = [];
      for (let i = 0; i < atual.length; i += 2) {
        jogos.push({ home: atual[i], away: atual[i + 1], winner: null });
      }
      rounds.push({ round: numero++, matches: jogos });
      // Rodada seguinte fica com placeholders; o vencedor real preenche depois.
      atual = jogos.map((j) => (j.away === null ? j.home : undefined));
    }
    return { rounds };
  }

  // ── Tabela viva ──────────────────────────────────────────────────────────
  /**
   * Tabela da liga nesta temporada, criada zerada na primeira consulta. É
   * separada de `standings` de propósito: standings é a classificação FINAL
   * (fictícia na temporada 1) de onde saem as vagas continentais; sobrescrevê-la
   * com uma tabela de 3 rodadas mandaria o líder provisório para a Champions.
   */
  table(leagueId) {
    if (!this.tables[leagueId]) {
      const liga = (typeof LEAGUES_DB !== "undefined" && LEAGUES_DB[leagueId]) || null;
      this.tables[leagueId] = (liga ? liga.clubs : []).map((c) => ({
        clubId: c.id,
        name: c.name,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
      }));
    }
    return this.tables[leagueId];
  }

  /**
   * Grava um placar já simulado na tabela. Não sorteia nada — quem decide o
   * placar é o `MatchSimulator`.
   * @returns {Array|null} a tabela ordenada, ou null se o confronto não é dessa liga.
   */
  recordResult(leagueId, homeId, awayId, result) {
    const tabela = this.table(leagueId);
    const casa = tabela.find((r) => r.clubId === homeId);
    const fora = tabela.find((r) => r.clubId === awayId);
    if (!casa || !fora) return null;

    applyResultToRows(casa, fora, result, homeId);
    tabela.sort(
      (a, b) =>
        b.points - a.points ||
        b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
        b.goalsFor - a.goalsFor,
    );
    return tabela;
  }

  // ── Mata-mata: quem passou de fase ───────────────────────────────────────
  /**
   * Grava o placar de um jogo de copa e define quem passou.
   *
   * O vencedor vem de fora quando alguém já decidiu: `winnerId` (placar aberto)
   * ou `penaltyWinnerId` (o usuário jogou a disputa e classificou). A moeda no
   * PRNG é só para EMPATE SIMULADO de bots — usá-la quando o usuário venceu nos
   * pênaltis era o que eliminava quem tinha passado. Pênalti não tem fator casa,
   * por isso a moeda e não a vantagem do mandante.
   */
  recordCupResult(cupId, homeId, awayId, result) {
    const torneio = this.tournaments[cupId];
    if (!torneio) return null;
    for (const rodada of torneio.bracket.rounds) {
      const jogo = rodada.matches.find(
        (m) => m.home === homeId && m.away === awayId && !m.winner,
      );
      if (!jogo) continue;
      jogo.homeScore = result.homeScore;
      jogo.awayScore = result.awayScore;
      const decidido = result.winnerId || result.penaltyWinnerId || null;
      jogo.winner = decidido || (this._rand() < 0.5 ? homeId : awayId);
      // Vencedor de fora que não é nem mandante nem visitante seria um erro de
      // integração silencioso: a fase seguinte receberia um clube fantasma.
      if (decidido && decidido !== homeId && decidido !== awayId) {
        console.warn(
          `SeasonManager: vencedor "${decidido}" não joga ${homeId} x ${awayId}`,
        );
        jogo.winner = this._rand() < 0.5 ? homeId : awayId;
      }
      return jogo;
    }
    return null;
  }

  /**
   * Promove os vencedores para a fase seguinte do bracket e devolve os
   * confrontos NOVOS, para o CalendarManager marcá-los nas datas que já estavam
   * reservadas (cupWindows). Só avança rodada COMPLETA: meia rodada geraria um
   * confronto contra `undefined`.
   *
   * O par vem da posição: o jogo `i` alimenta o mandante (i par) ou o visitante
   * (i ímpar) do jogo `i/2` da fase seguinte — que é como o chaveamento foi
   * montado em `_buildKnockout`.
   */
  advanceCupWinners() {
    const novos = [];
    for (const cupId in this.tournaments) {
      const torneio = this.tournaments[cupId];
      const rodadas = torneio.bracket.rounds;

      for (let r = 0; r < rodadas.length - 1; r++) {
        const atual = rodadas[r].matches;
        // Quem passou: o vencedor, ou quem estava sozinho na chave (BYE). Um
        // confronto de dois BYEs não tem vencedor e mesmo assim está decidido —
        // 20 classificados numa chave de 32 produzem vários, e tratá-los como
        // pendentes travaria a Champions inteira na primeira fase.
        const vencedorDe = (m) =>
          m.winner || (!m.away && m.home) || (!m.home && m.away) || null;
        const decidido = (m) => !!m.winner || !m.home || !m.away;
        if (!atual.every(decidido)) continue;

        const proxima = rodadas[r + 1].matches;
        atual.forEach((m, i) => {
          const alvo = proxima[Math.floor(i / 2)];
          const lado = i % 2 === 0 ? "home" : "away";
          const passou = vencedorDe(m);
          if (passou && !alvo[lado]) alvo[lado] = passou;
        });

        proxima.forEach((m) => {
          if (!m.home || !m.away || m.scheduled) return;
          m.scheduled = true; // marcado aqui: não devolver o mesmo jogo todo dia
          novos.push({
            competition: cupId,
            competitionName: torneio.name,
            round: r + 2, // 1-based, igual ao `round` de cupWindows
            home: m.home,
            away: m.away,
          });
        });
      }
    }
    return novos;
  }

  /** Campeão do torneio, ou null enquanto a final não foi jogada. */
  cupChampion(cupId) {
    const torneio = this.tournaments[cupId];
    if (!torneio || !torneio.bracket.rounds.length) return null;
    const final = torneio.bracket.rounds[torneio.bracket.rounds.length - 1];
    return (final.matches[0] && final.matches[0].winner) || null;
  }

  /** Todos os confrontos de uma rodada de copa, no formato do CalendarManager. */
  getCupFixtures(cupId, roundIndex) {
    const t = this.tournaments[cupId];
    const rodada = t && t.bracket.rounds[roundIndex];
    if (!rodada) return [];
    return rodada.matches
      .filter((m) => m.home && m.away) // BYE não gera jogo
      .map((m) => ({
        competition: cupId,
        competitionName: t.name,
        home: m.home,
        away: m.away,
      }));
  }
}

// =============================================================================
// Check: as vagas continentais. O Brasileirão classifica pela TABELA, igual às
// europeias, e ninguém pode aparecer duas vezes na mesma copa (aconteceria com
// clube listado na liga E no pool: ele jogaria contra si mesmo na chave).
// =============================================================================
console.assert(
  (() => {
    const s = new SeasonManager(2026);
    s.seedInitialTournaments();
    const t = s.tournaments;
    const semRepetido = (arr) => new Set(arr).size === arr.length;
    const brasileiros = LEAGUES_DB.brasileirao.clubs.map((c) => c.id);

    const lib = t.libertadores.participants;
    const sul = t.sudamericana.participants;
    const ucl = t.champions.participants;
    const uel = t.europa.participants;

    // Vagas declaradas no dado batem com o que foi sorteado.
    const vagasLib =
      LEAGUES_DB.brasileirao.libertadoresSlots +
      SOUTH_AMERICAN_POOL.libertadoresSlots;
    const vagasSul =
      LEAGUES_DB.brasileirao.sudamericanaSlots +
      SOUTH_AMERICAN_POOL.sudamericanaSlots;

    // Virada de temporada: com a tabela real do ano anterior, quem terminou em
    // 1º vai à Libertadores mesmo sendo o clube mais fraco do país.
    const tabelaFalsa = {
      brasileirao: [{ clubId: "Remo" }, { clubId: "Mirassol" }].concat(
        brasileiros
          .filter((id) => id !== "Remo" && id !== "Mirassol")
          .map((id) => ({ clubId: id })),
      ),
    };
    const s2 = new SeasonManager(2026);
    s2.seedInitialTournaments(tabelaFalsa);
    const libDoAnoSeguinte = s2.tournaments.libertadores.participants;

    return (
      lib.length === vagasLib &&
      sul.length === vagasSul &&
      semRepetido(lib) &&
      semRepetido(sul) &&
      semRepetido(ucl) &&
      // Brasileiro na Libertadores pela tabela, não por sorteio de pool.
      lib.filter((id) => brasileiros.includes(id)).length ===
        LEAGUES_DB.brasileirao.libertadoresSlots &&
      // Quem está na Libertadores não está na Sul-Americana.
      sul.every((id) => !lib.includes(id)) &&
      uel.every((id) => !ucl.includes(id)) &&
      // Brasileirão não dá vaga de UEFA.
      ucl.every((id) => !brasileiros.includes(id)) &&
      libDoAnoSeguinte.includes("Remo")
    );
  })(),
  "SeasonManager: vagas continentais erradas (contagem, repetição ou Brasileirão fora da Libertadores)",
);

// =============================================================================
// Check: quem venceu nos pênaltis passa. A moeda do PRNG é só para empate
// SIMULADO de bots — usá-la quando o usuário decidiu a disputa eliminava quem
// tinha classificado, e o bug não aparece no console, só na chave.
// =============================================================================
console.assert(
  (() => {
    const chave = () => ({
      rounds: [{ round: 1, matches: [{ home: "A", away: "B", winner: null }] }],
    });
    const comChave = (bracket) => {
      const s = new SeasonManager(7);
      s.tournaments = { copa_teste: { id: "copa_teste", bracket } };
      return s;
    };

    // 1) Empate decidido nos pênaltis PELO usuário: o ID mandaria mesmo que a
    //    moeda quisesse o outro lado.
    const b1 = chave();
    comChave(b1).recordCupResult("copa_teste", "A", "B", {
      homeScore: 1,
      awayScore: 1,
      isDraw: true,
      penaltyWinnerId: "B",
    });

    // 2) `winnerId` explícito continua mandando.
    const b2 = chave();
    comChave(b2).recordCupResult("copa_teste", "A", "B", {
      homeScore: 2,
      awayScore: 0,
      isDraw: false,
      winnerId: "A",
    });

    // 3) Empate de bots, sem ninguém decidindo: aí sim a moeda, e ela só pode
    //    devolver um dos dois participantes.
    const b3 = chave();
    comChave(b3).recordCupResult("copa_teste", "A", "B", {
      homeScore: 0,
      awayScore: 0,
      isDraw: true,
    });

    return (
      b1.rounds[0].matches[0].winner === "B" &&
      b2.rounds[0].matches[0].winner === "A" &&
      ["A", "B"].includes(b3.rounds[0].matches[0].winner)
    );
  })(),
  "SeasonManager.recordCupResult: vencedor dos pênaltis ignorado (PRNG sobrescrevendo)",
);

// =============================================================================
// Check: distribuição dos BYEs. Empilhados no fim da lista, metade do
// chaveamento fica vazia e um clube chega à semifinal sem jogar — e isso não
// dá erro nenhum, só aparece na tela como "time clonado em três fases".
// =============================================================================
console.assert(
  (() => {
    const s = new SeasonManager(2026);
    const casos = [19, 12, 8, 5, 3]; // 8 é potência de 2: zero BYE
    return casos.every((n) => {
      const times = Array.from({ length: n }, (_, i) => `t${i}`);
      const { rounds } = s._buildKnockout(times);
      const primeira = rounds[0].matches;

      // Todo mundo entra, e ninguém entra duas vezes.
      const inscritos = primeira.flatMap((m) => [m.home, m.away]).filter(Boolean);
      const semRepetir = new Set(inscritos).size === inscritos.length;

      // Nenhum confronto com os DOIS lados vazios: era isso que abria o buraco
      // pelo qual o clube subia de fase sem adversário.
      const semConfrontoFantasma = primeira.every((m) => m.home || m.away);

      // Quem tem BYE tem UM só: a 2ª fase não pode nascer com slot vazio.
      const segunda = rounds[1] ? rounds[1].matches : [];
      const segundaSemVazio =
        !segunda.length ||
        segunda.every((m) => m.home !== null && m.away !== null);

      return (
        inscritos.length === n &&
        semRepetir &&
        semConfrontoFantasma &&
        segundaSemVazio
      );
    });
  })(),
  "SeasonManager._buildKnockout: BYE mal distribuído (clube avançando sem jogar)",
);
