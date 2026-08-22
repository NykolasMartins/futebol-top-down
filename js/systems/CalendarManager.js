// =============================================================================
// CalendarManager.js — Monta o ano inteiro de jogos sem sobrepor clube
// =============================================================================
// Hierarquia: copa continental é marcada PRIMEIRO e manda no calendário; a liga
// nacional se encaixa no que sobrou. Nenhum clube joga duas vezes no mesmo dia
// nem com menos descanso que MIN_REST_DAYS.
//
// Usa o mesmo modelo de tempo do CareerMode: dayOffset inteiro a partir de uma
// data inicial. Assim os dois calendários podem conversar depois sem conversão.

const CALENDAR_RULES = {
  // 2 = terça, 3 = quarta (getDay do JS: 0 = domingo)
  CUP_DAYS: [2, 3],
  // 6 = sábado, 0 = domingo
  LEAGUE_DAYS: [6, 0],
  // Válvula de escape antes de adiar de vez: segunda-feira.
  OVERFLOW_DAYS: [1],
  // Descanso mínimo em dias entre dois jogos do MESMO clube. 3 = as 72h do
  // enunciado: quem jogou quarta não pode sexta (folga 2), pode sábado (3).
  // Suba para 4 se quiser forçar o domingo.
  MIN_REST_DAYS: 3,
  // Até onde procurar data reserva quando sábado, domingo e segunda falham.
  MAX_DEFER_DAYS: 21,
};

class CalendarManager {
  /** @param {Date} startDate início da temporada; dayOffset 0 é esse dia. */
  constructor(startDate = new Date(2026, 7, 1), rules = {}) {
    this.startDate = startDate;
    this.rules = { ...CALENDAR_RULES, ...rules };
    this.fixtures = []; // { dayOffset, competition, home, away, weekday, deferred }
    this._byClub = new Map(); // clubId -> [dayOffset] de todos os jogos dele
  }

  // ── Tempo ────────────────────────────────────────────────────────────────
  weekday(dayOffset) {
    const d = new Date(this.startDate);
    d.setDate(d.getDate() + dayOffset);
    return d.getDay();
  }

  dateOf(dayOffset) {
    const d = new Date(this.startDate);
    d.setDate(d.getDate() + dayOffset);
    return d;
  }

  /** Primeiro dayOffset >= from que caia num dos dias da semana pedidos. */
  _nextWeekday(from, weekdays) {
    for (let d = from; d < from + 14; d++) {
      if (weekdays.includes(this.weekday(d))) return d;
    }
    return from;
  }

  // ── Disponibilidade ──────────────────────────────────────────────────────
  _daysOf(clubId) {
    if (!this._byClub.has(clubId)) this._byClub.set(clubId, []);
    return this._byClub.get(clubId);
  }

  /** O clube aguenta jogar nesse dia? Cobre jogo no mesmo dia e descanso. */
  canPlay(clubId, dayOffset) {
    return this._daysOf(clubId).every(
      (d) => Math.abs(dayOffset - d) >= this.rules.MIN_REST_DAYS,
    );
  }

  bothCanPlay(home, away, dayOffset) {
    return this.canPlay(home, dayOffset) && this.canPlay(away, dayOffset);
  }

  _commit(fixture, dayOffset, deferred = false) {
    const registro = {
      ...fixture,
      dayOffset,
      weekday: this.weekday(dayOffset),
      date: this.dateOf(dayOffset),
      deferred,
    };
    this.fixtures.push(registro);
    this._daysOf(fixture.home).push(dayOffset);
    this._daysOf(fixture.away).push(dayOffset);
    return registro;
  }

  // ── REGRA 1: copas primeiro, sempre no meio de semana ────────────────────
  /**
   * Marca uma rodada de copa. Copa tem prioridade, então só cede se o próprio
   * confronto for impossível — aí anda para a próxima terça/quarta.
   */
  scheduleCupRound(fixtures, anchorDay) {
    const marcados = [];
    for (const jogo of fixtures) {
      let dia = this._nextWeekday(anchorDay, this.rules.CUP_DAYS);
      let tentativas = 0;
      // Anda de meio de semana em meio de semana até os dois clubes poderem.
      while (!this.bothCanPlay(jogo.home, jogo.away, dia) && tentativas < 8) {
        dia = this._nextWeekday(dia + 1, this.rules.CUP_DAYS);
        tentativas++;
      }
      marcados.push(this._commit(jogo, dia));
    }
    return marcados;
  }

  // ── REGRAS 2 e 3: liga no fim de semana, desviando de quem não descansou ──
  /**
   * Marca uma rodada de liga ancorada num sábado. Cada confronto tenta, nesta
   * ordem: sábado -> domingo -> segunda -> data reserva. É por CONFRONTO e não
   * por rodada inteira porque só os clubes que jogaram copa na quarta precisam
   * escorregar; o resto da rodada continua no sábado.
   */
  scheduleLeagueRound(fixtures, anchorDay) {
    const sabado = this._nextWeekday(anchorDay, [6]);
    const marcados = [];

    fixtures.forEach((jogo, idx) => {
      // Metade da rodada abre no sábado e metade no domingo. Sem isso todos os
      // jogos empilham no mesmo dia e o calendário fica irreal — e a regra de
      // descanso nunca chega a ser testada, porque sábado nunca conflita com
      // a terça da copa.
      const ordem =
        idx % 2 === 0
          ? this.rules.LEAGUE_DAYS
          : [...this.rules.LEAGUE_DAYS].reverse();
      const candidatos = [...ordem, ...this.rules.OVERFLOW_DAYS].map((wd) =>
        this._nextWeekday(sabado, [wd]),
      );

      const dia = candidatos.find((d) =>
        this.bothCanPlay(jogo.home, jogo.away, d),
      );
      if (dia !== undefined) {
        marcados.push(this._commit(jogo, dia));
        return;
      }

      // Nada na janela: adia. Varre para frente evitando dia de copa, para não
      // criar do zero o conflito que este método existe para evitar.
      let reserva = null;
      for (let d = sabado + 1; d <= sabado + this.rules.MAX_DEFER_DAYS; d++) {
        if (this.rules.CUP_DAYS.includes(this.weekday(d))) continue;
        if (this.bothCanPlay(jogo.home, jogo.away, d)) {
          reserva = d;
          break;
        }
      }
      marcados.push(
        this._commit(jogo, reserva !== null ? reserva : sabado, reserva === null),
      );
    });
    return marcados;
  }

  // ── Turno e returno pelo método do círculo ───────────────────────────────
  /** Todas as rodadas de uma liga: ida e volta, mandante invertido no returno. */
  static roundRobin(clubIds) {
    const times = clubIds.slice();
    if (times.length % 2) times.push(null); // folga
    const n = times.length;
    const ida = [];

    for (let r = 0; r < n - 1; r++) {
      const rodada = [];
      for (let i = 0; i < n / 2; i++) {
        const a = times[i];
        const b = times[n - 1 - i];
        if (a && b) rodada.push({ home: i % 2 ? b : a, away: i % 2 ? a : b });
      }
      ida.push(rodada);
      // Gira todos menos o primeiro.
      times.splice(1, 0, times.pop());
    }

    const volta = ida.map((rodada) =>
      rodada.map((j) => ({ home: j.away, away: j.home })),
    );
    return [...ida, ...volta];
  }

  /**
   * Monta a temporada inteira. Copas primeiro (regra 1), ligas depois nos
   * buracos que sobraram (regras 2 e 3).
   * @param {SeasonManager} season
   */
  generateSeason(season) {
    this.fixtures = [];
    this._byClub = new Map();

    // 1) COPAS — uma rodada a cada `intervalo` semanas, no meio de semana.
    // Só a 1ª fase tem confronto conhecido: mata-mata não sabe quem joga a 2ª
    // até a 1ª ser jogada. Então a data das fases seguintes fica RESERVADA em
    // cupWindows, e o SeasonManager chama scheduleCupRound quando souber os
    // vencedores. Sem essa reserva o ano "planejado" seria só a primeira fase.
    this.cupWindows = [];
    for (const cupId in season.tournaments) {
      const torneio = season.tournaments[cupId];
      const intervalo = 4; // semanas entre fases
      // Copa doméstica sai 2 semanas defasada da continental. As duas caem em
      // terça/quarta; sem a defasagem, quem disputa as duas empilharia tudo na
      // mesma semana e metade escorregaria pela regra de descanso.
      const inicio = torneio.scope === "domestic" ? 28 : 14;
      torneio.bracket.rounds.forEach((_, r) => {
        const ancora = inicio + r * intervalo * 7;
        const fixtures = season.getCupFixtures(cupId, r);
        if (fixtures.length) {
          this.scheduleCupRound(fixtures, ancora);
        }
        this.cupWindows.push({
          competition: cupId,
          competitionName: torneio.name,
          round: r + 1,
          dayOffset: this._nextWeekday(ancora, this.rules.CUP_DAYS),
          resolved: fixtures.length > 0,
        });
      });
    }

    // 2) LIGAS — uma rodada por semana, a partir do primeiro sábado.
    for (const leagueId of getAllLeagueIds()) {
      const liga = LEAGUES_DB[leagueId];
      const rodadas = CalendarManager.roundRobin(liga.clubs.map((c) => c.id));
      rodadas.forEach((rodada, i) => {
        const comCompeticao = rodada.map((j) => ({
          ...j,
          competition: leagueId,
          competitionName: liga.name,
        }));
        this.scheduleLeagueRound(comCompeticao, 7 + i * 7);
      });
    }

    this.fixtures.sort((a, b) => a.dayOffset - b.dayOffset);
    return this.fixtures;
  }

  /**
   * Transforma as datas RESERVADAS em `cupWindows` nos confrontos que já têm os
   * dois classificados. É o outro lado do que `generateSeason` deixou pendente:
   * o mata-mata não sabe quem joga a 2ª fase antes de a 1ª ser jogada, então a
   * data ficou guardada e o confronto entra aqui, depois de o resultado sair.
   *
   * Chame a cada dia simulado. `minDay` impede marcar jogo para um dia que já
   * passou (a fase anterior pode ter escorregado para cima da janela seguinte):
   * um fixture no passado nunca seria simulado e a copa travaria.
   * @param {SeasonManager} season
   */
  resolveCupWindows(season, minDay = 0) {
    const novos = season.advanceCupWinners();
    if (!novos.length) return 0;

    for (const jogo of novos) {
      const janela = (this.cupWindows || []).find(
        (w) => w.competition === jogo.competition && w.round === jogo.round,
      );
      const ancora = Math.max(janela ? janela.dayOffset : minDay, minDay);
      this.scheduleCupRound(
        [
          {
            competition: jogo.competition,
            competitionName: jogo.competitionName,
            home: jogo.home,
            away: jogo.away,
          },
        ],
        ancora,
      );
      if (janela) janela.resolved = true;
    }
    this.fixtures.sort((a, b) => a.dayOffset - b.dayOffset);
    return novos.length;
  }

  // ── Consultas ────────────────────────────────────────────────────────────
  fixturesOn(dayOffset) {
    return this.fixtures.filter((f) => f.dayOffset === dayOffset);
  }

  fixturesOfClub(clubId) {
    return this.fixtures.filter(
      (f) => f.home === clubId || f.away === clubId,
    );
  }

  /** Relatório rápido para depurar um calendário gerado. */
  summary() {
    const porCompeticao = {};
    let adiados = 0;
    for (const f of this.fixtures) {
      porCompeticao[f.competition] = (porCompeticao[f.competition] || 0) + 1;
      if (f.deferred) adiados++;
    }
    return {
      total: this.fixtures.length,
      porCompeticao,
      adiados,
      ultimoDia: this.fixtures.length
        ? this.fixtures[this.fixtures.length - 1].dayOffset
        : 0,
    };
  }
}

// =============================================================================
// Check: as três regras do calendário, num ano inteiro gerado de verdade.
// Sem isto, uma sobreposição de clube só apareceria quando o jogador reclamasse.
// =============================================================================
console.assert(
  (() => {
    const s = new SeasonManager(12345);
    s.seedInitialTournaments();
    const cal = new CalendarManager(new Date(2026, 7, 1));
    const fixtures = cal.generateSeason(s);
    if (!fixtures.length) return false;

    // Regra 1: copa sempre em terça ou quarta.
    const copaForaDoMeio = fixtures.filter(
      (f) => CONTINENTAL_CUPS[f.competition] && ![2, 3].includes(f.weekday),
    );

    // Regra 2: liga em sábado, domingo ou segunda (segunda = válvula).
    const ligaForaDoFim = fixtures.filter(
      (f) =>
        LEAGUES_DB[f.competition] &&
        !f.deferred &&
        ![6, 0, 1].includes(f.weekday),
    );

    // Regra 3: ninguém joga duas vezes no mesmo dia, nem sem descanso.
    const porClube = new Map();
    for (const f of fixtures) {
      for (const c of [f.home, f.away]) {
        if (!porClube.has(c)) porClube.set(c, []);
        porClube.get(c).push(f.dayOffset);
      }
    }
    let semDescanso = 0;
    for (const dias of porClube.values()) {
      dias.sort((a, b) => a - b);
      for (let i = 1; i < dias.length; i++) {
        if (dias[i] - dias[i - 1] < CALENDAR_RULES.MIN_REST_DAYS) semDescanso++;
      }
    }

    // Turno e returno: 10 clubes = 18 rodadas, e todo par se enfrenta 2x.
    const rr = CalendarManager.roundRobin(["a", "b", "c", "d"]);
    const pares = {};
    rr.flat().forEach((j) => {
      const k = [j.home, j.away].sort().join("-");
      pares[k] = (pares[k] || 0) + 1;
    });
    const rrOk =
      rr.length === 6 &&
      Object.keys(pares).length === 6 &&
      Object.values(pares).every((n) => n === 2);

    // Cenário do enunciado, isolado: quem jogou QUARTA na copa não pode sexta,
    // e o jogo de liga tem de escorregar para um dia com folga suficiente.
    const c2 = new CalendarManager(new Date(2026, 7, 1));
    const quarta = c2._nextWeekday(0, [3]);
    c2.scheduleCupRound(
      [{ competition: "champions", home: "X", away: "Y" }],
      quarta,
    );
    // Rodada de liga na MESMA semana: X joga, Z e W estão livres.
    c2.scheduleLeagueRound(
      [
        { competition: "premier_league", home: "X", away: "Z" },
        { competition: "premier_league", home: "W", away: "Q" },
      ],
      quarta,
    );
    const jogoDeX = c2.fixturesOfClub("X").find((f) => f.competition !== "champions");
    const folgaDeX = jogoDeX.dayOffset - quarta;
    const jogoLivre = c2.fixturesOfClub("W")[0];

    return (
      copaForaDoMeio.length === 0 &&
      ligaForaDoFim.length === 0 &&
      semDescanso === 0 &&
      rrOk &&
      // X respeitou o descanso e NÃO caiu na sexta (folga 2).
      folgaDeX >= CALENDAR_RULES.MIN_REST_DAYS &&
      c2.weekday(jogoDeX.dayOffset) !== 5 &&
      // Quem não jogou copa não foi arrastado: segue no fim de semana.
      [6, 0].includes(c2.weekday(jogoLivre.dayOffset))
    );
  })(),
  "CalendarManager: calendário gerado viola dia da semana, descanso ou turno/returno",
);

// =============================================================================
// Check: o mata-mata anda até o fim. As datas das fases seguintes nascem
// RESERVADAS em cupWindows — se `resolveCupWindows` parar de convertê-las em
// jogo, as copas ficam eternamente na primeira fase e ninguém percebe, porque
// o calendário continua "válido".
// =============================================================================
console.assert(
  (() => {
    if (typeof simulateMatch !== "function") return true;

    const s = new SeasonManager(12345);
    s.seedInitialTournaments();
    const cal = new CalendarManager(new Date(2026, 7, 1));
    cal.generateSeason(s);
    const rand = () => s._rand();

    const jogosDeCopa = [];
    for (let dia = 0; dia <= 400; dia++) {
      for (const f of cal.fixturesOn(dia)) {
        // Qualquer mata-mata: continental E doméstico (Copa do Brasil, FA Cup…).
        if (!s.isCup(f.competition)) continue;
        jogosDeCopa.push(f);
        s.recordCupResult(
          f.competition,
          f.home,
          f.away,
          simulateMatch(f.home, f.away, rand),
        );
      }
      cal.resolveCupWindows(s, dia + 1);
    }

    // Toda copa tem campeão, e o campeão é um dos participantes.
    const campeoes = Object.keys(s.tournaments).map((id) => ({
      id,
      quem: s.cupChampion(id),
    }));
    const semCampeao = campeoes.filter(
      (c) => !c.quem || !s.tournaments[c.id].participants.includes(c.quem),
    );

    // As fases seguintes viraram jogo de verdade (não só a 1ª fase).
    const rodadasJogadas = new Set(
      jogosDeCopa.map((f) => f.competition + ":" + f.dayOffset),
    );
    const janelasPendentes = cal.cupWindows.filter((w) => !w.resolved);

    // Regras do calendário continuam valendo para os jogos criados agora.
    const foraDoMeioDeSemana = jogosDeCopa.filter(
      (f) => ![2, 3].includes(f.weekday),
    );
    const porClube = new Map();
    for (const f of cal.fixtures) {
      for (const c of [f.home, f.away]) {
        if (!porClube.has(c)) porClube.set(c, []);
        porClube.get(c).push(f.dayOffset);
      }
    }
    let semDescanso = 0;
    for (const dias of porClube.values()) {
      dias.sort((a, b) => a - b);
      for (let i = 1; i < dias.length; i++) {
        if (dias[i] - dias[i - 1] < CALENDAR_RULES.MIN_REST_DAYS) semDescanso++;
      }
    }

    return (
      semCampeao.length === 0 &&
      janelasPendentes.length === 0 &&
      rodadasJogadas.size > Object.keys(s.tournaments).length &&
      // A copa doméstica existe e foi jogada de verdade.
      jogosDeCopa.some((f) => f.competition === "copa_brasileirao") &&
      foraDoMeioDeSemana.length === 0 &&
      semDescanso === 0
    );
  })(),
  "CalendarManager: mata-mata não avançou até o campeão (cupWindows não viraram jogo)",
);
