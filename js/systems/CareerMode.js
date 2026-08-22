// =============================================================================
// CareerMode.js — v4.0 (Foco Brasil + Copa do Brasil + Economia + Transferências)
// =============================================================================

// Fonte única das skills. Usada no reset E no load: sem isso, um save antigo
// (Object.assign substitui `skills` inteiro) fica sem as chaves adicionadas
// depois e a skill nova nasce `undefined`.
const DEFAULT_SKILLS = {
  sprintMaster: 0,
  powerShot: 0,
  tireless: 0,
  curveBall: 0, // Bola Curva: destrava o efeito no chute
  clinicalFinisher: 0,
  interceptor: 0,
};

class CareerMode {
  constructor(playerName = "Jogador") {
    this.resetDefaults(playerName);
  }

  resetDefaults(playerName) {
    this.playerName = playerName;
    this.level = 1;
    this.xp = 0;
    this.skillPoints = 0;
    this.speed = 68;
    this.kickPower = 68;
    this.stamina = 72;
    this.skinColor = 0xffdbac;
    this.hairColor = HAIR_COLORS[0];
    this.position = "Meia";
    this.skills = { ...DEFAULT_SKILLS };
    this.specialties = {
      powerShotSpecial: false, // Desbloqueado com 5 XP quando powerShot atingir nível 5
    };
    this.condition = 100;
    this.coachReputation = 50;
    this.lastLineupStatus = "starter";
    this.fatiguePerMatch = 25;
    this.currentTeam = null;
    this.currentLeague = "Brasil";
    this.season = 1;
    this.matchDay = 1;
    this.seasonEnded = false;

    // Flash Interviews
    this.interviewQuestions = [
      {
        id: "vitoria_facil",
        title: "ENTREVISTA PÓS-VITÓRIA",
        question: "Uma vitória tranquila hoje. Qual o segredo do time?",
        options: [
          {
            label: "Trabalho em Equipe",
            impact: { coachRep: 5, fans: 5 },
            result: "O grupo está muito unido.",
          },
          {
            label: "Minha Atuação",
            impact: { coachRep: -5, fans: 15 },
            result: "Eu estava em um dia inspirado.",
          },
        ],
      },
      {
        id: "derrota_dura",
        title: "ENTREVISTA PÓS-DERROTA",
        question: "O resultado não veio. Quem é o culpado?",
        options: [
          {
            label: "Assumir a Culpa",
            impact: { coachRep: 10, fans: 5 },
            result: "Eu poderia ter feito mais.",
          },
          {
            label: "Criticar Arbitragem",
            impact: { coachRep: -5, fans: 10 },
            result: "Fomos prejudicados pelo juiz.",
          },
        ],
      },
    ];

    // Patrocínio de Chuteiras
    this.bootSponsor = null; // { name, bonusPerGoal, bonusPerMatch, logo }
    this.sponsorshipOffers = [
      {
        name: "PUMBA",
        bonusPerGoal: 200,
        bonusPerMatch: 500,
        requirement: 0,
        color: "#ff5500",
      },
      {
        name: "NIKEI",
        bonusPerGoal: 500,
        bonusPerMatch: 1000,
        requirement: 10,
        color: "#ffffff",
      },
      {
        name: "ADIDASO",
        bonusPerGoal: 1200,
        bonusPerMatch: 2500,
        requirement: 25,
        color: "#ffff00",
      },
    ];

    // Calendário
    this.startDate = new Date(2026, 3, 1); // Abril (mês 3 = abril em JS)
    this.currentDayOffset = 0;
    this.totalMatches = 0;
    this.schedule = [];
    this.lastActivityDay = -1;
    // Último dia cujos jogos de fundo já foram simulados. Ver _simulateWorldDay.
    this.lastSimulatedDay = -1;

    // Conquistas e estatísticas
    this.trophies = [];
    this.leagueTable = [];
    this.playerStats = { goals: 0, assists: 0, matches: 0 };
    this.globalPlayerStats = {};
    this.topScorers = [];

    // Economia
    this.playerMoney = 0;
    this.monthlySalary = 0;
    this.lastSalaryDay = 0;
    this.notifications = []; // Fila de notificações para exibir na UI (pop-ups consumíveis)
    this.newsHistory = []; // Histórico de notícias (persistente)

    // Copas: NÃO existe estado local. As duas (continental e doméstica) são
    // torneios do mundo, em `world.season.tournaments`. Ver playerCups().

    // Mercado de transferências
    this.transferOffers = [];
    this.transferWindowOpen = false;

    // Objetivos de Partida
    this.matchObjectives = [];
    this.completedObjectivesCount = 0;

    // Dilemas de Carreira
    this.dilemmas = [
      // ... (os dilemas existentes continuam aqui, vou injetar os novos abaixo)
      {
        id: "z-4_tabela",
        title: "ZONA DE REBAIXAMENTO",
        description:
          "O time está na zona de rebaixamento. A torcida está protestando no CT. O que você faz?",
        condition: (c) => {
          const table = c.leagueTable;
          const myTeam = table.find((t) => t.isPlayerTeam);
          const pos = table.indexOf(myTeam) + 1;
          // Relativo ao tamanho da liga: fixo em 13 o dilema nunca dispararia
          // numa liga de 10 times.
          return pos > table.length - 4;
        },
        options: [
          {
            label: "Prometer a Virada",
            description: "Vamos tirar o time dessa!",
            impact: { fans: 10, coachRep: -5, condition: -10 },
            result:
              "A torcida se acalmou, mas a pressão sobre você aumentou muito.",
          },
          {
            label: "Criticar o Elenco",
            description: "Falta qualidade aos companheiros.",
            impact: { coachRep: -20, fans: 5, kickPower: 2 },
            result:
              "Você criou um clima terrível no vestiário, mas treinou mais sozinho.",
          },
        ],
      },
      {
        id: "lider_tabela",
        title: "LIDERANÇA ISOLADA",
        description:
          "O time é líder! O assédio da imprensa aumentou. Como lidar com o sucesso?",
        condition: (c) => {
          const table = c.leagueTable;
          const myTeam = table.find((t) => t.isPlayerTeam);
          const pos = table.indexOf(myTeam) + 1;
          return pos === 1;
        },
        options: [
          {
            label: "Pés no Chão",
            description: "Ainda não ganhamos nada.",
            impact: { coachRep: 15, condition: 5 },
            result: "O técnico adorou sua postura humilde e focada.",
          },
          {
            label: "Comemorar",
            description: "Somos os melhores mesmo!",
            impact: { fans: 20, coachRep: -10, money: 2000 },
            result:
              "Você virou o ídolo da galera, mas o técnico te achou prepotente.",
          },
        ],
      },
      {
        id: "artilheiro",
        title: "MÁQUINA DE GOLS",
        description:
          "Você está fazendo muitos gols! Um empresário europeu quer conversar.",
        condition: (c) => c.playerStats.goals >= 10,
        options: [
          {
            label: "Ouvir a Proposta",
            description: "Sempre sonhei com a Europa.",
            impact: { coachRep: -15, money: 10000 },
            result:
              "O técnico descobriu a conversa e ficou furioso com sua distração.",
          },
          {
            label: "Focar no Clube",
            description: "Minha cabeça está aqui.",
            impact: { coachRep: 20, xp: 100 },
            result:
              "Sua dedicação foi recompensada com moral alto e experiência.",
          },
        ],
      },
      {
        id: "seca_gols",
        title: "SECA DE GOLS",
        description:
          "Você não marca há vários jogos. A imprensa está te chamando de 'foguete molhado'.",
        condition: (c) => c.playerStats.goals < 2 && c.playerStats.matches > 5,
        options: [
          {
            label: "Treino Extra de Chute",
            description: "Vou ficar até mais tarde.",
            impact: { kickPower: 2, condition: -20 },
            result:
              "Você está exausto, mas sente que seu chute voltou a calibrar.",
          },
          {
            label: "Ignorar Críticas",
            description: "O gol vai sair naturalmente.",
            impact: { coachRep: -5, condition: 10 },
            result:
              "Você está descansado, mas o técnico está perdendo a paciência.",
          },
        ],
      },
      {
        id: "mata_mata",
        title: "DECISÃO NA COPA",
        description:
          "O jogo de amanhã na Copa é vida ou morte. O que você prioriza?",
        condition: (c) => {
          if (!c.isMatchDay() || c.getMatchDayType() !== "copa") return false;
          const cup = c.playerCupOfDay();
          return !!(cup && !cup.eliminated && !cup.champion);
        },
        options: [
          {
            label: "Estudar o Adversário",
            description: "Quero ver vídeos do goleiro.",
            impact: { xp: 50, coachRep: 10 },
            result:
              "Você se sente mais preparado mentalmente para o confronto.",
          },
          {
            label: "Descanso Total",
            description: "Preciso de 100% de energia.",
            impact: { condition: 20 },
            result: "Suas pernas estão leves para a grande decisão.",
          },
        ],
      },
    ];

    // Dilemas de Carreira (genéricos) — adicionados ao array existente de dilemas condicionais (NÃO sobrescreve!)
    this.pendingDilemma = null;
    this.dilemmas.push(
      {
        id: "reporter_polêmico",
        title: "ENTREVISTA POLÊMICA",
        description:
          "Um repórter te pergunta sobre a tática defensiva do seu treinador ser 'covarde'. Como você responde?",
        options: [
          {
            label: "Defender o Técnico",
            description: "O professor sabe o que faz.",
            impact: { coachRep: 10, fans: -5, money: 0 },
            result:
              "O treinador gostou da sua lealdade, mas a torcida queria ver mais ousadia.",
          },
          {
            label: "Concordar com Críticas",
            description: "Realmente, precisamos atacar mais.",
            impact: { coachRep: -15, fans: 15, money: 0 },
            result:
              "A torcida te amou pela sinceridade, mas o clima no vestiário azedou.",
          },
        ],
      },
      {
        id: "festa_vip",
        title: "CONVITE PARA FESTA",
        description:
          "Um patrocinador te convidou para uma festa VIP na véspera do jogo. O que você faz?",
        options: [
          {
            label: "Ficar e Descansar",
            description: "Foco total na partida.",
            impact: { condition: 10, coachRep: 5, money: 0 },
            result:
              "Você acordou descansado e o técnico elogiou seu profissionalismo.",
          },
          {
            label: "Ir à Festa",
            description: "Networking é importante.",
            impact: { condition: -20, coachRep: -5, money: 5000 },
            result:
              "Você ganhou um bônus de patrocínio, mas está exausto para o jogo.",
          },
        ],
      },
      {
        id: "treino_extra",
        title: "TREINO OPCIONAL",
        description:
          "Seu preparador físico sugere um treino extra de finalização após o horário.",
        options: [
          {
            label: "Fazer o Treino",
            description: "Quero melhorar meu chute.",
            impact: { xp: 50, condition: -15, kickPower: 1 },
            result: "Seu chute melhorou, mas suas pernas estão pesadas.",
          },
          {
            label: "Recusar",
            description: "Preciso poupar energia.",
            impact: { condition: 10, xp: 0 },
            result:
              "Você está bem fisicamente, mas perdeu a chance de evoluir.",
          },
        ],
      },
    );

    // Apenas ligas brasileiras
    this.leagues = {
      Brasil: [
        {
          name: "Flamengo",
          rating: 82,
          tier: 5,
          shirtColor: "#FF0000",
          shirtColor2: "#000000",
        },
        {
          name: "Palmeiras",
          rating: 81,
          tier: 5,
          shirtColor: "#006400",
          shirtColor2: "#FFFFFF",
        },
        {
          name: "Sao_Paulo",
          rating: 79,
          tier: 4,
          shirtColor: "#FFFFFF",
          shirtColor2: "#FF0000",
        },
        {
          name: "Corinthians",
          rating: 78,
          tier: 4,
          shirtColor: "#FFFFFF",
          shirtColor2: "#000000",
        },
        {
          name: "Galo",
          rating: 79,
          tier: 4,
          shirtColor: "#000000",
          shirtColor2: "#FFFFFF",
        },
        {
          name: "Cruzeiro",
          rating: 77,
          tier: 4,
          shirtColor: "#0000FF",
          shirtColor2: "#FFFFFF",
        },
        {
          name: "Gremio",
          rating: 78,
          tier: 4,
          shirtColor: "#00BFFF",
          shirtColor2: "#000000",
        },
        {
          name: "Inter",
          rating: 78,
          tier: 4,
          shirtColor: "#FF0000",
          shirtColor2: "#FFFFFF",
        },
        {
          name: "Fluminense",
          rating: 77,
          tier: 3,
          shirtColor: "#8B0000",
          shirtColor2: "#006400",
        },
        {
          name: "Botafogo",
          rating: 76,
          tier: 3,
          shirtColor: "#000000",
          shirtColor2: "#FFFFFF",
        },
        {
          name: "Santos",
          rating: 76,
          tier: 3,
          shirtColor: "#FFFFFF",
          shirtColor2: "#000000",
        },
        {
          name: "Vasco",
          rating: 75,
          tier: 3,
          shirtColor: "#000000",
          shirtColor2: "#FFFFFF",
        },
        {
          name: "Bahia",
          rating: 75,
          tier: 3,
          shirtColor: "#FFFFFF",
          shirtColor2: "#0000FF",
        },
        {
          name: "Fortaleza",
          rating: 74,
          tier: 3,
          shirtColor: "#0000FF",
          shirtColor2: "#FF0000",
        },
        {
          name: "Mirassol",
          rating: 73,
          tier: 2,
          shirtColor: "#FFFF00",
          shirtColor2: "#006400",
        },
        {
          name: "Remo",
          rating: 72,
          tier: 2,
          shirtColor: "#000080",
          shirtColor2: "#FFFFFF",
        },
      ],
    };

    // Ligas europeias vêm do LeaguesDB — uma fonte só de times, em vez de
    // duplicar a lista aqui. O Brasil fica no literal acima porque o
    // Brasileirão e a Copa dependem daqueles tiers e ratings.
    if (typeof buildCareerLeaguesFromDB === "function") {
      Object.assign(this.leagues, buildCareerLeaguesFromDB());
    }

    // Tabela de salários por tier do clube (mensal em R$)
    this.salaryTable = {
      1: 3000,
      2: 8000,
      3: 20000,
      4: 50000,
      5: 120000,
    };
    // Poder financeiro por tier da LIGA. Multiplica o salário do tier do clube:
    // um clube grande da Premier (120k x 5) contra um grande do Brasileirão
    // (120k x 1.6) é a diferença de bolso entre os dois mercados.
    this.leaguePayFactor = { 1: 0.6, 2: 1, 3: 1.6, 4: 3, 5: 5 };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Getter de data atual
  // ─────────────────────────────────────────────────────────────────────────────
  get currentDate() {
    const d = new Date(this.startDate);
    d.setDate(d.getDate() + this.currentDayOffset);
    return d;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Inicialização de carreira
  // ─────────────────────────────────────────────────────────────────────────────
  initializeCareer(playerName, teamName, leagueName = "Brasil") {
    this.resetDefaults(playerName);
    // Honra a liga escolhida. Antes forçava "Brasil" e ignorava o parâmetro,
    // então escolher um time europeu quebrava no find() e a carreira não subia.
    const liga = this.leagues[leagueName] ? leagueName : "Brasil";
    this.currentLeague = liga;
    const selectedTeamData = this.leagues[liga].find((t) => t.name === teamName);
    if (!selectedTeamData) return false;

    this.currentTeam = {
      name: teamName,
      tier: selectedTeamData.tier,
      budget: 50000,
      shirtColor: selectedTeamData.shirtColor,
      shirtColor2: selectedTeamData.shirtColor2,
      players: [{ name: this.playerName, rating: 75 }],
    };

    // Salário inicial baseado no tier do clube
    this.monthlySalary = this.salaryTable[selectedTeamData.tier] || 5000;
    this.playerMoney = this.monthlySalary; // Começa com 1 mês de salário

    // Rodadas da liga escolhida (turno e returno), não sempre as do Brasil.
    this.totalMatches = (this.leagues[liga].length - 1) * 2;
    this.initializeLeagueTable();
    this.initializeGlobalPlayerStats();
    this.initializeTopScorers();
    this.generateSchedule();
    this.saveToLocalStorage();
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Tabela da liga do usuário
  // ─────────────────────────────────────────────────────────────────────────────
  /** Id da liga do clube do usuário no LeaguesDB ("brasileirao", "bundesliga"…). */
  playerLeagueId() {
    const clube =
      typeof findClub === "function" && this.currentTeam
        ? findClub(this.currentTeam.name)
        : null;
    return (clube && clube.leagueId) || "brasileirao";
  }

  /** Nome de exibição da liga do usuário, para a UI parar de escrever "Brasileirão". */
  playerLeagueName() {
    const liga =
      typeof LEAGUES_DB !== "undefined" && LEAGUES_DB[this.playerLeagueId()];
    return (liga && liga.name) || "Liga";
  }

  /**
   * A copa continental do usuário, lida do MUNDO. Substitui o
   * chaveamento local legado, que só conhecia 4 fases de uma Copa do Brasil de
   * 8 times — a Champions tem 5 e não é brasileira.
   * @returns {null|{id,name,phase,round,match,fixtures,champion,eliminated}}
   */
  playerCupStatus(cupId = null) {
    const clube = this.currentTeam && this.currentTeam.name;
    const torneios = this.world && this.world.season.tournaments;
    if (!clube || !torneios) return null;

    const minhas = Object.values(torneios).filter((t) =>
      t.participants.includes(clube),
    );
    // Sem id pedido, a continental é a "copa principal" da UI. O clube disputa
    // as duas: a doméstica sai por `playerCups()` ou pelo id do confronto.
    const cup = cupId
      ? minhas.find((t) => t.id === cupId)
      : minhas.find((t) => t.scope !== "domestic") || minhas[0];
    if (!cup) return null;

    const rodadas = cup.bracket.rounds;
    const meu = (m) => m.home === clube || m.away === clube;
    // Fase atual = onde ele tem jogo em aberto; se não tem, a última em que apareceu.
    let idx = rodadas.findIndex((r) => r.matches.some((m) => meu(m) && !m.winner));
    if (idx === -1) idx = rodadas.map((r) => r.matches.some(meu)).lastIndexOf(true);
    const rodada = rodadas[idx] || null;
    const jogo = rodada ? rodada.matches.find(meu) : null;

    return {
      id: cup.id,
      name: cup.name,
      scope: cup.scope || "continental",
      round: idx,
      phase: this._cupPhaseName(idx, rodadas.length),
      match: jogo || null,
      // Só confrontos completos: a fase pode ter metade das vagas ainda vazias.
      fixtures: rodada ? rodada.matches.filter((m) => m.home && m.away) : [],
      champion: this.world.season.cupChampion(cup.id),
      eliminated: !!(jogo && jogo.winner && jogo.winner !== clube),
    };
  }

  /** TODAS as copas do clube do usuário (continental + doméstica), para a UI listar. */
  playerCups() {
    const clube = this.currentTeam && this.currentTeam.name;
    const torneios = this.world && this.world.season.tournaments;
    if (!clube || !torneios) return [];
    return Object.values(torneios)
      .filter((t) => t.participants.includes(clube))
      .map((t) => this.playerCupStatus(t.id))
      .filter(Boolean);
  }

  /** O confronto de copa do usuário num dia, com a copa certa (são duas). */
  playerCupOfDay(dayOffset = this.currentDayOffset) {
    const evento = this.schedule.find(
      (e) => e.type === "copa" && e.dayOffset === dayOffset,
    );
    return evento ? this.playerCupStatus(evento.matchType) : null;
  }

  /** Nome da fase contando de trás para frente, então serve para chave de qualquer tamanho. */
  _cupPhaseName(idx, total) {
    if (idx < 0) return "Fase de grupos";
    const nomes = ["Final", "Semifinal", "Quartas de Final", "Oitavas de Final"];
    const daFrente = total - 1 - idx;
    return nomes[daFrente] || `Fase de ${Math.pow(2, daFrente + 1)}`;
  }

  /**
   * ID do clube -> nome de exibição. Os IDs ("man_city", "Sao_Paulo") são a
   * chave de REAL_ROSTERS/TEAMS_DB e circulam por todo o código; ponto único
   * para eles não vazarem crus na tela.
   */
  static clubLabel(clubId) {
    // Só ID (string) entra. Proposta de save antigo trazia o OBJETO do clube
    // aqui e o HTML recebia "[object Object]" — o "undefined" da tela.
    if (typeof clubId !== "string" || !clubId) {
      return clubId && clubId.name ? CareerMode.clubLabel(clubId.name) : "A definir";
    }
    const c = typeof findClub === "function" ? findClub(clubId) : null;
    return c ? c.name : clubId;
  }

  /**
   * Nome da copa do usuário para a UI. Sem copa continental o rótulo é
   * genérico: escrever "Copa do Brasil" para um clube que não disputa nenhuma
   * é exatamente o hardcode que se quer matar.
   */
  playerCupName() {
    const cup = this.playerCupStatus();
    return (cup && cup.name) || "Copa";
  }

  /** Fase atual da copa do usuário. */
  _cupPhaseLabel() {
    const cup = this.playerCupStatus();
    return (cup && cup.phase) || "fase atual";
  }

  /** Clubes da liga do usuário no formato da carreira (chaveado por país). */
  playerLeagueClubs() {
    return this.leagues[this.currentLeague] || this.leagues["Brasil"];
  }

  /** Dados do clube do usuário (rating, tier, cores) na liga dele. */
  _myClubData() {
    if (!this.currentTeam) return null;
    return (
      this.playerLeagueClubs().find((t) => t.name === this.currentTeam.name) ||
      null
    );
  }

  initializeLeagueTable() {
    // A liga é a do clube do usuário, não o Brasileirão fixo: uma carreira na
    // Bundesliga mostrava a tabela brasileira, com 16 times que ele nunca joga.
    // Os números saem da tabela VIVA do mundo quando ela existe — numa
    // transferência no meio do ano a liga nova já rodou meia temporada sem ele.
    const clubes = this.playerLeagueClubs();
    const mundo = this.world
      ? this.world.season.tables[this.playerLeagueId()]
      : null;

    this.leagueTable = clubes.map((t) => {
      const linha = mundo ? mundo.find((r) => r.clubId === t.name) : null;
      return {
        name: t.name,
        label: t.label || t.name,
        played: linha ? linha.played : 0,
        wins: linha ? linha.wins : 0,
        draws: linha ? linha.draws : 0,
        losses: linha ? linha.losses : 0,
        goalsFor: linha ? linha.goalsFor : 0,
        goalsAgainst: linha ? linha.goalsAgainst : 0,
        points: linha ? linha.points : 0,
        rating: t.rating,
        tier: t.tier,
        shirtColor: t.shirtColor,
        shirtColor2: t.shirtColor2,
        isPlayerTeam: t.name === this.currentTeam.name,
      };
    });
    this.sortLeagueTable();
  }

  initializeGlobalPlayerStats() {
    this.globalPlayerStats = {};
    this.playerLeagueClubs().forEach((t) => {
      const roster = window.getTeamRoster ? window.getTeamRoster(t.name) : [];
      roster.forEach((player) => {
        if (!player || player.position === "GK") return;
        const isUserSlot =
          t.name === this.currentTeam?.name &&
          player === roster.find((r) => r.position !== "GK");
        const stat = window.createPlayerCareerStat
          ? window.createPlayerCareerStat(t.name, player, false)
          : {
              id: player.id,
              name: player.name,
              team: t.name,
              position: player.position,
              goals: 0,
              assists: 0,
              matches: 0,
              isPlayer: false,
            };
        this.globalPlayerStats[stat.id] = stat;
      });
    });
    this._ensureUserGlobalStat();
    this.sortTopScorers();
  }

  _ensureUserGlobalStat() {
    if (!this.globalPlayerStats) this.globalPlayerStats = {};
    this.globalPlayerStats.user_player = {
      id: "user_player",
      name: this.playerName,
      team: this.currentTeam ? this.currentTeam.name : "Sem Clube",
      position: this.position || "Meia",
      goals: this.playerStats?.goals || 0,
      assists: this.playerStats?.assists || 0,
      matches: this.playerStats?.matches || 0,
      isPlayer: true,
    };
  }

  initializeTopScorers() {
    if (
      !this.globalPlayerStats ||
      Object.keys(this.globalPlayerStats).length === 0
    ) {
      this.initializeGlobalPlayerStats();
      return;
    }
    this._ensureUserGlobalStat();
    this.sortTopScorers();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Geração de agenda (Brasileirão — 30 rodadas, 1 por semana)
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Cria o mundo da temporada: sorteio das copas + calendário global de TODAS
   * as competições. A seed fica no save, então recarregar reproduz o mesmo ano.
   */
  initializeWorld() {
    // Mundo vivo NÃO é regerado: as tabelas e os chaveamentos já andaram, e
    // `generateSchedule()` passou a ser chamado de novo no meio do ano (fase
    // nova de copa, transferência). Regerar apagaria a temporada inteira.
    // Quem quer um mundo novo zera `this.world` antes — ver startNewSeason.
    if (this.world) return true;
    if (
      typeof SeasonManager === "undefined" ||
      typeof CalendarManager === "undefined"
    ) {
      return false;
    }
    if (!this.worldSeed) this.worldSeed = Math.floor(Math.random() * 1e9);

    this.world = {
      season: new SeasonManager(this.worldSeed),
      calendar: new CalendarManager(new Date(this.startDate)),
    };
    // Vagas continentais saem da classificação FINAL do ano anterior quando
    // ela existe (virada de temporada); na temporada 1 não há ano anterior e o
    // SeasonManager fabrica uma tabela plausível.
    this.world.season.seedInitialTournaments(this._lastSeasonTables || null);
    this._lastSeasonTables = null;
    this.world.calendar.generateSeason(this.world.season);
    // Tabelas do save entram DEPOIS da semeadura e são consumidas uma única
    // vez: o mundo é regerado da seed, mas os resultados já jogados não.
    // Consumir aqui é o que impede a virada de temporada (que chama este mesmo
    // método) de ressuscitar a tabela do ano passado.
    if (this._worldTables) {
      this.world.season.tables = this._worldTables;
      this._worldTables = null;
    }
    return true;
  }

  /**
   * O schedule do jogador é um RECORTE do calendário global: filtra os jogos
   * onde o clube dele aparece como mandante ou visitante. Antes isto gerava um
   * round-robin próprio, que vivia paralelo ao mundo e nunca conversava com ele.
   *
   * Mantém `type` ("brasileirao"/"copa") e `matchIndex` porque o resto do
   * CareerMode e as cenas comparam esses literais; os campos novos
   * (opponentId, isHome, competitionName) vêm de brinde para a UI.
   */
  generateSchedule() {
    // O schedule é REFEITO sempre que uma fase de copa nova aparece. As marcas
    // de "já resolvido" precisam sobreviver a isso, senão o mesmo jogo seria
    // simulado de novo a cada refiltragem.
    const anterior = this.schedule || [];
    this.schedule = [];
    const clube = this.currentTeam && this.currentTeam.name;
    if (!clube || !this.initializeWorld()) return;

    const jogos = this.world.calendar
      .fixturesOfClub(clube)
      .slice()
      .sort((a, b) => a.dayOffset - b.dayOffset);

    let rodada = 0;
    for (const f of jogos) {
      // Copa = qualquer torneio de mata-mata do mundo, continental OU doméstico.
      // Testar só `CONTINENTAL_CUPS` contava a Copa do Brasil como rodada de
      // pontos corridos e estragava `matchIndex`/`totalMatches`.
      const ehCopa = this.world.season.isCup(f.competition);
      if (!ehCopa) rodada++;
      this.schedule.push({
        dayOffset: f.dayOffset,
        // ponytail: "brasileirao" é o literal que os consumidores comparam,
        // mesmo quando a liga é a Bundesliga. Renomear exige varrer as cenas.
        type: ehCopa ? "copa" : "brasileirao",
        matchIndex: ehCopa ? 0 : rodada,
        opponentId: f.home === clube ? f.away : f.home,
        isHome: f.home === clube,
        competitionName: f.competitionName,
        matchType: f.competition,
        played: !!(
          anterior.find(
            (e) => e.dayOffset === f.dayOffset && e.matchType === f.competition,
          ) || {}
        ).played,
      });
    }

    // Rodadas reais do calendário, não a conta teórica da tabela.
    if (rodada > 0) this.totalMatches = rodada;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Navegação de calendário
  // ─────────────────────────────────────────────────────────────────────────────
  addNotification(text, type = "info") {
    if (!this.notifications) this.notifications = [];
    if (!this.newsHistory) this.newsHistory = [];

    const item = {
      msg: text,
      type,
      time: Date.now(),
      day: this.currentDayOffset,
    };

    if (type === "news") {
      this.newsHistory.push(item);
      if (this.newsHistory.length > 10) this.newsHistory.shift();
    } else {
      this.notifications.push(item);
      if (this.notifications.length > 5) this.notifications.shift();
    }
  }

  _getObjectiveDefinitions() {
    return [
      {
        id: "score",
        text: "Marcar pelo menos 1 gol",
        xp: 200,
        money: 500,
        check: (stats) => stats.goals >= 1,
      },
      {
        id: "assist",
        text: "Dar pelo menos 1 assistência",
        xp: 150,
        money: 400,
        check: (stats) => stats.assists >= 1,
      },
      {
        id: "win",
        text: "Vencer a partida",
        xp: 100,
        money: 300,
        check: (stats, win) => win,
      },
      {
        id: "rating",
        text: "Ter nota acima de 7.5",
        xp: 150,
        money: 300,
        check: (stats) => stats.goals * 2 + stats.assists * 1.5 >= 2,
      },
      {
        id: "no_yellow",
        text: "Não receber cartões",
        xp: 50,
        money: 100,
        check: (stats) => !stats.yellowCard,
      },
    ];
  }

  generateMatchObjectives() {
    const possibleObjectives = this._getObjectiveDefinitions();

    // Sorteia 2 ou 3 objetivos
    this.matchObjectives = Phaser.Utils.Array.Shuffle(possibleObjectives)
      .slice(0, Math.floor(Math.random() * 2) + 2)
      .map((obj) => ({
        id: obj.id,
        text: obj.text,
        xp: obj.xp,
        money: obj.money,
        completed: false,
      }));
  }

  checkMatchObjectives(matchStats, win) {
    let earnedXP = 0;
    let earnedMoney = 0;
    let completedCount = 0;

    const definitions = this._getObjectiveDefinitions();

    this.matchObjectives.forEach((obj) => {
      const def = definitions.find((d) => d.id === obj.id);
      if (def && def.check(matchStats, win)) {
        obj.completed = true;
        earnedXP += obj.xp;
        earnedMoney += obj.money;
        completedCount++;
      }
    });

    this.completedObjectivesCount += completedCount;
    this.xp += earnedXP;
    this.playerMoney += earnedMoney;

    return { earnedXP, earnedMoney, completed: completedCount };
  }

  generateNews() {
    const newsTemplates = [
      "O {team} está interessado em novos talentos.",
      "A torcida do {team} comemora a boa fase.",
      "Especulações sobre a próxima janela de transferências aumentam.",
      "Técnico do {team} elogia o desempenho coletivo.",
      "Gramado do próximo estádio passará por reformas.",
      "Novo patrocínio master anunciado para o {team}.",
    ];

    const teams =
      this.leagueTable && this.leagueTable.length > 0
        ? this.leagueTable
        : [
            { name: "Flamengo" },
            { name: "Palmeiras" },
            { name: "Corinthians" },
          ];
    const randomTeam = teams[Math.floor(Math.random() * teams.length)].name;

    const text = newsTemplates[
      Math.floor(Math.random() * newsTemplates.length)
    ].replace("{team}", randomTeam);
    this.addNotification(text, "news");
  }

  advanceDay() {
    if (
      !this.isMatchDay() &&
      this.lastActivityDay !== this.currentDayOffset &&
      this.condition >= 35
    ) {
      this.adjustCoachReputation(-2, "faltou ao treino do dia");
    }
    // O mundo joga a rodada do dia que está terminando, antes do relógio virar.
    this._simulateWorldDay();
    this.currentDayOffset++;
    this.generateNews(); // Gera notícia ao avançar o dia
    this.condition = Math.min(100, this.condition + 3);
    this._checkSalary();
    this._checkTransferWindow();
    this._checkRandomDilemma();

    // Se for dia de jogo, gera objetivos
    if (this.isMatchDay()) {
      this.generateMatchObjectives();
    }

    if (this.isSeasonComplete()) this.endSeason();
    this.saveToLocalStorage();
  }

  _checkRandomDilemma() {
    // 20% de chance de um dilema se não houver um pendente
    if (!this.pendingDilemma && Math.random() < 0.2) {
      // Filtrar dilemas que atendem à condição atual
      const availableDilemmas = this.dilemmas.filter((d) => {
        if (!d.condition) return !this.isMatchDay(); // Dilemas genéricos só em dias sem jogo
        return d.condition(this);
      });

      if (availableDilemmas.length > 0) {
        const idx = Math.floor(Math.random() * availableDilemmas.length);
        this.pendingDilemma = JSON.parse(
          JSON.stringify(availableDilemmas[idx]),
        );
      }
    }
  }

  resolveDilemma(optionIndex) {
    if (!this.pendingDilemma) return null;
    const option = this.pendingDilemma.options[optionIndex];
    if (!option) return null;

    // Aplicar impactos
    if (option.impact.coachRep)
      this.adjustCoachReputation(
        option.impact.coachRep,
        this.pendingDilemma.title,
      );
    if (option.impact.condition)
      this.condition = Phaser.Math.Clamp(
        this.condition + option.impact.condition,
        0,
        100,
      );
    if (option.impact.money) this.playerMoney += option.impact.money;
    if (option.impact.xp) this.addXP(option.impact.xp);
    if (option.impact.kickPower) this.kickPower += option.impact.kickPower;

    const resultText = option.result;
    this.pendingDilemma = null;
    this.saveToLocalStorage();
    return resultText;
  }

  simulateUntil(targetDayOffset) {
    let skippedGames = 0;
    let totalFine = 0;
    let totalRepLoss = 0;

    while (this.currentDayOffset <= targetDayOffset) {
      const event = this.schedule.find(
        (e) => e.dayOffset === this.currentDayOffset,
      );
      // Faltou ao próprio jogo: multa e reputação. Um só critério para liga e
      // copa — `played` só é falso se ele realmente não jogou (o
      // `_simulateWorldDay` logo abaixo resolve a partida e marca).
      if (event && !event.played) {
        const fine = Math.floor(this.monthlySalary * 0.25);
        totalFine += fine;
        totalRepLoss += 20;
        skippedGames++;
        this.playerMoney = Math.max(0, this.playerMoney - fine);
        // Silenciar a notificação individual aqui
        this.adjustCoachReputation(
          -20,
          "falta injustificada a dia de jogo",
          true,
        );
      }
      // `matchDay` anda no `_markFixturePlayed`, dentro do `_simulateWorldDay`
      // logo abaixo — um caminho só para jogo jogado e jogo pulado.
      // Todo dia da simulação, com ou sem jogo do usuário: o resto do mundo
      // tem confronto marcado em dias que o schedule dele nem lista.
      this._simulateWorldDay();
      this.currentDayOffset++;
      this.condition = Math.min(100, this.condition + 3);
      this._checkSalary();

      // Checar fim de temporada durante a simulação
      if (this.isSeasonComplete()) {
        this.endSeason();
        break;
      }
    }

    // Notificação unificada se houveram faltas
    if (skippedGames > 0) {
      this.notifications.push({
        type: "penalty",
        msg: `⚠️ RELATÓRIO DE ABSÊNCIA: Você faltou a ${skippedGames} partida(s). 
Prejuízo: R$ ${totalFine.toLocaleString("pt-BR")} em multas e -${totalRepLoss} de reputação com o técnico.`,
        day: this.currentDayOffset,
      });
    }

    this.saveToLocalStorage();
  }

  applyNoShowPenalty() {
    const fine = Math.floor(this.monthlySalary * 0.25); // 25% de multa por falta
    this.playerMoney = Math.max(0, this.playerMoney - fine);
    this.adjustCoachReputation(-20, "falta injustificada a dia de jogo");
    this.notifications.push({
      type: "penalty",
      msg: `⚠️ MULTA: R$ ${fine.toLocaleString("pt-BR")} descontados por não comparecer ao jogo!`,
      day: this.currentDayOffset,
    });
  }

  simulatePlayerMatch() {
    if (!this.isMatchDay() || !this.isPlayerMatchPending()) return null;

    const type = this.getMatchDayType();
    const opponent =
      type === "copa" ? this.getCopaOpponent() : this.getNextOpponent();

    // Simulação básica baseada em ratings
    const pRating = this.currentTeam
      ? this._myClubData()?.rating || 75
      : 75;
    const oRating = opponent.rating || 75;

    // Chance de gol baseada na diferença de rating
    const pChance = 0.45 + (pRating - oRating) / 200;
    let pScore = 0;
    let oScore = 0;
    const totalGoals = Math.floor(Math.random() * 4);
    for (let i = 0; i < totalGoals; i++) {
      if (Math.random() < pChance) pScore++;
      else oScore++;
    }

    const result = {
      playerScore: pScore,
      opponentScore: oScore,
      opponent: opponent.name,
      matchRating: 5.5 + Math.random() * 1.5, // Nota mediana por simular
      matchStats: { goals: 0, assists: 0 },
      lineupStatus: this.getLineupStatus().code,
    };

    if (type === "copa") {
      this.recordCopaMatch(result);
    } else {
      this.recordMatch(result);
    }

    return result;
  }

  isMatchDay() {
    return this.schedule.some((e) => e.dayOffset === this.currentDayOffset);
  }

  getMatchDayType() {
    const event = this.schedule.find(
      (e) => e.dayOffset === this.currentDayOffset,
    );
    if (!event) return null;
    return event.type; // 'brasileirao' ou 'copa'
  }

  /**
   * Tem jogo dele HOJE por disputar? Critério ÚNICO: a flag `played` da entrada
   * do schedule, a mesma que `_markFixturePlayed()` escreve. Antes a liga
   * exigia `matchIndex === matchDay` e a copa consultava a chave — se qualquer
   * um desses desencontrasse, a tela dizia "próximo jogo em 0 dias" e o botão
   * JOGAR não aparecia, travando o dia.
   */
  isPlayerMatchPending() {
    const event = this.schedule.find(
      (e) => e.dayOffset === this.currentDayOffset,
    );
    return !!event && !event.played;
  }

  getNextEvent() {
    return this.schedule.find(
      (e) => e.dayOffset >= this.currentDayOffset && !e.played,
    );
  }

  /** O usuário ainda tem jogo nesta temporada? */
  hasRemainingMatches() {
    return !!this.getNextEvent();
  }

  /**
   * Ponto ÚNICO onde um jogo do usuário passa a "resolvido" — jogado por ele ou
   * simulado por ter sido pulado. É aqui que `matchDay` anda, porque ele é o
   * gatilho de fim de campeonato: antes só o `simulateUntil` o incrementava, e
   * quem avançava dia a dia via `advanceDay` terminava o ano com matchDay=1 e
   * a temporada nunca virava.
   */
  _markFixturePlayed(entrada) {
    if (!entrada || entrada.played) return;
    entrada.played = true;
    if (entrada.type === "brasileirao")
      this.matchDay = Math.min(this.totalMatches + 1, this.matchDay + 1);
  }

  /** Último dia com jogo marcado no calendário global. */
  lastFixtureDay() {
    if (!this.world) return this.currentDayOffset;
    return this.world.calendar.fixtures.reduce(
      (m, f) => Math.max(m, f.dayOffset),
      this.currentDayOffset,
    );
  }

  /**
   * Roda o que falta do ano de uma vez. A temporada só vira quando o calendário
   * do MUNDO esvazia (senão a tabela fecharia incompleta), e o usuário costuma
   * terminar os jogos dele antes das finais de copa dos bots — sem isto ele
   * ficaria clicando "avançar dia" até o fim do ano.
   */
  simulateSeasonRemainder() {
    this.simulateUntil(this.lastFixtureDay() + 1);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Salário mensal
  // ─────────────────────────────────────────────────────────────────────────────
  _checkSalary() {
    const daysSinceLastSalary = this.currentDayOffset - this.lastSalaryDay;
    if (daysSinceLastSalary >= 30) {
      this.playerMoney += this.monthlySalary;
      this.lastSalaryDay = this.currentDayOffset;
      this.notifications.push({
        type: "salary",
        msg: `💰 Salário recebido: R$ ${this.monthlySalary.toLocaleString("pt-BR")}`,
        day: this.currentDayOffset,
      });
    }
  }

  _checkTransferWindow() {
    // Janela de transferências: dias 0-14 e dias 140-154 de cada temporada
    const d = this.currentDayOffset;
    const aberta = (d >= 0 && d <= 14) || (d >= 140 && d <= 154);
    this.transferWindowOpen = aberta;
    if (aberta) this._rollDailyOffer();
  }

  /**
   * Com a janela aberta, um clube do mundo pode sondar o jogador em qualquer
   * dia. Antes as propostas só nasciam no `endSeason()`: a UI anunciava
   * "JANELA ABERTA" e o mercado ficava vazio a temporada inteira.
   */
  _rollDailyOffer() {
    if (!this.currentTeam) return;
    // ponytail: teto de 4 pendentes e ~15% ao dia. Vira parâmetro se alguém
    // quiser janela mais movimentada.
    if ((this.transferOffers || []).length >= 4) return;
    if (Math.random() > 0.15) return;

    const candidatos = this._allClubs().filter(
      (t) =>
        t.name !== this.currentTeam.name &&
        !this.transferOffers.find((o) => o.team === t.name),
    );
    if (!candidatos.length) return;

    const club = candidatos[Math.floor(Math.random() * candidatos.length)];
    // O mesmo cruzamento tier x rating do fim de temporada decide se o clube
    // realmente se interessa — clube grande não sonda jogador fraco.
    if (Math.random() >= this._offerChance(club)) return;

    this.transferOffers.push(this._buildOffer(club, "Sondagem na Janela"));
    this.transferOffers.sort((a, b) => b.salary - a.salary);
    this.addNotification(
      `📞 ${CareerMode.clubLabel(club.name)} fez uma proposta: R$ ${this._offerSalary(
        club,
      ).toLocaleString("pt-BR")}/mês`,
      "transfer",
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Treino e descanso
  // ─────────────────────────────────────────────────────────────────────────────
  train() {
    if (this.lastActivityDay === this.currentDayOffset)
      return { success: false, msg: "Já realizou uma atividade hoje!" };
    if (this.condition < 20)
      return { success: false, msg: "Muito cansado para treinar!" };
    this.xp += 35;
    this.condition -= 15;
    this.lastActivityDay = this.currentDayOffset;
    this.checkLevelUp();
    this.adjustCoachReputation(2, "treino rápido concluído");
    this.saveToLocalStorage();
    return { success: true, msg: "Treino concluído! +35 XP | Reputação +2" };
  }

  trainWithBonus(xpBonus) {
    // Chamado pelos mini-games ao concluir
    if (this.lastActivityDay === this.currentDayOffset)
      return { success: false, msg: "Já realizou uma atividade hoje!" };
    this.xp += xpBonus;
    this.condition = Math.max(20, this.condition - 20);
    this.lastActivityDay = this.currentDayOffset;
    this.checkLevelUp();
    const repDelta =
      xpBonus >= 75 ? 5 : xpBonus >= 50 ? 3 : xpBonus >= 30 ? 1 : -2;
    this.adjustCoachReputation(
      repDelta,
      xpBonus >= 30 ? "bom treino prático" : "treino abaixo do esperado",
    );
    this.saveToLocalStorage();
    return {
      success: true,
      msg: `Treino prático concluído! +${xpBonus} XP | Reputação ${repDelta >= 0 ? "+" : ""}${repDelta}`,
    };
  }

  rest() {
    if (this.lastActivityDay === this.currentDayOffset)
      return { success: false, msg: "Já realizou uma atividade hoje!" };
    this.condition = Math.min(100, this.condition + 25);
    this.lastActivityDay = this.currentDayOffset;
    this.saveToLocalStorage();
    return { success: true, msg: "Descanso concluído! Condição recuperada." };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Progressão de nível
  // ─────────────────────────────────────────────────────────────────────────────
  checkLevelUp() {
    while (this.xp >= 100) {
      this.level++;
      this.xp -= 100;
      this.skillPoints++;
      if (this.level % 3 === 0) {
        this.speed = Math.min(100, this.speed + 1);
        this.kickPower = Math.min(100, this.kickPower + 1);
        this.stamina = Math.min(100, this.stamina + 1);
      }
      if (this.level % 5 === 0) {
        this.speed = Math.min(100, this.speed + 1);
        this.kickPower = Math.min(100, this.kickPower + 1);
        this.stamina = Math.min(100, this.stamina + 1);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Reputação com o técnico, escalação e estatísticas globais
  // ─────────────────────────────────────────────────────────────────────────────
  clampCoachReputation() {
    this.coachReputation = Math.max(
      0,
      Math.min(100, Math.round(this.coachReputation || 0)),
    );
    return this.coachReputation;
  }

  adjustCoachReputation(delta, reason = "", silenceNotification = false) {
    if (this.coachReputation === undefined) this.coachReputation = 50;
    this.coachReputation += delta;
    this.clampCoachReputation();
    if (reason && !silenceNotification) {
      this.notifications.push({
        type: "coach",
        msg: `Relação com o técnico: ${delta >= 0 ? "+" : ""}${delta} (${reason}). Reputação atual: ${this.coachReputation}/100`,
        day: this.currentDayOffset,
      });
    }
    this.saveToLocalStorage();
    return this.coachReputation;
  }

  getLineupStatus() {
    const fitness = this.condition || 0;
    const reputation =
      this.coachReputation === undefined ? 50 : this.coachReputation;
    const highFitness = fitness >= 70;
    const highRep = reputation >= 70;
    const lowFitness = fitness < 40;
    const lowRep = reputation < 40;
    if (highFitness && highRep) {
      return {
        code: "starter",
        label: "Titular",
        description: "Condição e reputação altas: joga a partida inteira.",
      };
    }
    if (lowFitness && lowRep) {
      return {
        code: "not_related",
        label: "Não Relacionado",
        description:
          "Condição e reputação baixas: partida totalmente simulada.",
      };
    }
    return {
      code: "bench",
      label: "Reserva utilizado",
      description: "Entrará apenas no 2º tempo; o 1º tempo será simulado.",
    };
  }

  simulateFirstHalf(opponent) {
    const playerRating = this.currentTeam
      ? this._myClubData()?.rating || 75
      : 75;
    const oppRating = opponent?.rating || 75;
    const pChance = Math.max(
      0.15,
      Math.min(0.85, 0.48 + (playerRating - oppRating) / 220),
    );
    const goals = Math.floor(Math.random() * 3); // 0 a 2 gols no 1º tempo
    let playerScore = 0;
    let opponentScore = 0;
    for (let i = 0; i < goals; i++) {
      if (Math.random() < pChance) playerScore++;
      else opponentScore++;
    }
    return { playerScore, opponentScore };
  }

  _registerPlayerStat(
    teamName,
    player,
    goals = 0,
    assists = 0,
    matches = 0,
    isUser = false,
  ) {
    if (!this.globalPlayerStats) this.globalPlayerStats = {};
    const id = isUser
      ? "user_player"
      : window.makePlayerStatId
        ? window.makePlayerStatId(teamName, player)
        : player?.id;
    if (!id) return;
    if (!this.globalPlayerStats[id]) {
      this.globalPlayerStats[id] = window.createPlayerCareerStat
        ? window.createPlayerCareerStat(teamName, player, isUser)
        : {
            id,
            name: isUser ? this.playerName : player?.name,
            team: teamName,
            position: player?.position || "FWD",
            goals: 0,
            assists: 0,
            matches: 0,
            isPlayer: !!isUser,
          };
    }
    const stat = this.globalPlayerStats[id];
    stat.name = isUser ? this.playerName : stat.name;
    stat.team = teamName;
    stat.goals += goals;
    stat.assists += assists;
    stat.matches += matches;
    stat.isPlayer = !!isUser;
  }

  _registerTeamAppearances(teamName, includeUser = false) {
    const roster = window.getLinePlayers ? window.getLinePlayers(teamName) : [];
    const npcSlots = includeUser ? 5 : 6;
    roster
      .slice(0, npcSlots)
      .forEach((player) =>
        this._registerPlayerStat(teamName, player, 0, 0, 1, false),
      );
    if (includeUser)
      this._registerPlayerStat(
        teamName,
        { name: this.playerName, position: this.position },
        0,
        0,
        1,
        true,
      );
  }

  _pickRosterScorer(teamName, limitToFirstFive = false) {
    const roster = window.getLinePlayers ? window.getLinePlayers(teamName) : [];
    const eligible = (limitToFirstFive ? roster.slice(0, 5) : roster).filter(
      Boolean,
    );
    if (eligible.length === 0) return null;
    const total = eligible.reduce((sum, p) => sum + (p.scoringWeight || 1), 0);
    let roll = Math.random() * total;
    for (const p of eligible) {
      roll -= p.scoringWeight || 1;
      if (roll <= 0) return p;
    }
    return eligible[eligible.length - 1];
  }

  _pickRosterAssist(teamName, scorerId, limitToFirstFive = false) {
    const roster = window.getLinePlayers ? window.getLinePlayers(teamName) : [];
    const eligible = (limitToFirstFive ? roster.slice(0, 5) : roster).filter(
      (p) => p && p.id !== scorerId,
    );
    if (eligible.length === 0) return null;
    const total = eligible.reduce((sum, p) => sum + (p.assistWeight || 1), 0);
    let roll = Math.random() * total;
    for (const p of eligible) {
      roll -= p.assistWeight || 1;
      if (roll <= 0) return p;
    }
    return eligible[eligible.length - 1];
  }

  _distributeGoalsToRoster(teamName, goals, protagonistReplacesSlot = false) {
    for (let i = 0; i < goals; i++) {
      const scorer = this._pickRosterScorer(teamName, protagonistReplacesSlot);
      if (!scorer) continue;
      this._registerPlayerStat(teamName, scorer, 1, 0, 0, false);
      const assist = this._pickRosterAssist(
        teamName,
        scorer.id,
        protagonistReplacesSlot,
      );
      if (assist && Math.random() < 0.72)
        this._registerPlayerStat(teamName, assist, 0, 1, 0, false);
    }
  }

  _registerUserMatchStats(goals, assists, matches = 1) {
    this._registerPlayerStat(
      this.currentTeam.name,
      { name: this.playerName, position: this.position },
      goals,
      assists,
      matches,
      true,
    );
  }

  applyMatchReputation(rating, lineupStatus = "starter") {
    let delta = 0;
    if (rating >= 8.0) delta = 6;
    else if (rating >= 7.0) delta = 3;
    else if (rating < 5.5) delta = -5;
    else if (rating < 6.0) delta = -2;
    if (lineupStatus === "not_related") delta -= 1;
    if (delta !== 0)
      this.adjustCoachReputation(
        delta,
        rating >= 7 ? "boa atuação" : "atuação abaixo do esperado",
      );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Registro de partida do Brasileirão
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * @param {Object} result inclui `penaltyWinnerId` quando o confronto foi para
   *   os pênaltis. Na liga o empate é empate e o campo é ignorado; se a partida
   *   do dia for de mata-mata, o desempate segue para a chave do mundo.
   */
  recordMatch(result) {
    const doDia = this.schedule.find(
      (e) => e.dayOffset === this.currentDayOffset && !e.played,
    );
    if (result.penaltyWinnerId && doDia && doDia.type === "copa") {
      return this.recordCopaMatch(result);
    }

    const pTeam = this.leagueTable.find((t) => t.isPlayerTeam);
    const oTeam = this.leagueTable.find((t) => t.name === result.opponent);

    if (pTeam) {
      pTeam.played++;
      pTeam.goalsFor += result.playerScore;
      pTeam.goalsAgainst += result.opponentScore;
      if (result.playerScore > result.opponentScore) {
        pTeam.wins++;
        pTeam.points += 3;
      } else if (result.playerScore === result.opponentScore) {
        pTeam.draws++;
        pTeam.points += 1;
      } else pTeam.losses++;
    }

    if (oTeam) {
      oTeam.played++;
      oTeam.goalsFor += result.opponentScore;
      oTeam.goalsAgainst += result.playerScore;
      if (result.opponentScore > result.playerScore) {
        oTeam.wins++;
        oTeam.points += 3;
      } else if (result.opponentScore === result.playerScore) {
        oTeam.draws++;
        oTeam.points += 1;
      } else oTeam.losses++;
    }

    const goals = result.matchStats ? result.matchStats.goals : 0;
    const assists = result.matchStats ? result.matchStats.assists : 0;
    const rating = result.matchRating || 6.0;

    this.playerStats.goals += goals;
    this.playerStats.assists += assists;
    this.playerStats.matches++;

    this._registerTeamAppearances(this.currentTeam.name, true);
    this._registerTeamAppearances(result.opponent, false);
    this._registerUserMatchStats(goals, assists, 1);
    this._distributeGoalsToRoster(
      this.currentTeam.name,
      Math.max(0, result.playerScore - goals),
      true,
    );
    this._distributeGoalsToRoster(result.opponent, result.opponentScore, false);
    this.applyMatchReputation(
      rating,
      result.lineupStatus || this.lastLineupStatus || "starter",
    );

    this._recordPlayerResultInWorld(result);
    this._simulateWorldDay();

    let xpGain = 50;
    if (result.playerScore > result.opponentScore) xpGain += 20;
    xpGain += goals * 15;
    xpGain += assists * 10;
    xpGain += Math.floor(rating * 2);

    this.xp += Math.floor(xpGain);
    this.checkLevelUp();
    this.condition = Math.max(20, this.condition - this.fatiguePerMatch);

    // Aplicar ganhos de patrocínio
    if (this.bootSponsor) {
      const goalBonus = goals * this.bootSponsor.bonusPerGoal;
      const matchBonus = this.bootSponsor.bonusPerMatch;
      this.playerMoney += goalBonus + matchBonus;

      if (goalBonus > 0) {
        this.notifications.push({
          type: "money",
          msg: `👟 BÔNUS DE GOL: +R$ ${goalBonus.toLocaleString()} (${this.bootSponsor.name})`,
          day: this.currentDayOffset,
        });
      }
    }

    // Um dia, não um salto. Isto teleportava o relógio para 3 dias antes do
    // próximo jogo: além de a UI pular sozinha uma semana, os dias saltados
    // nunca eram simulados e o mundo ficava com rodadas por jogar.
    this.currentDayOffset++;

    this.saveToLocalStorage();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Registro de partida da Copa do Brasil
  // ─────────────────────────────────────────────────────────────────────────────
  recordCopaMatch(result) {
    const goals = result.matchStats ? result.matchStats.goals : 0;
    const assists = result.matchStats ? result.matchStats.assists : 0;
    const rating = result.matchRating || 6.0;

    this.playerStats.goals += goals;
    this.playerStats.assists += assists;
    this.playerStats.matches++;

    this._registerTeamAppearances(this.currentTeam.name, true);
    this._registerTeamAppearances(result.opponent, false);
    this._registerUserMatchStats(goals, assists, 1);
    this._distributeGoalsToRoster(
      this.currentTeam.name,
      Math.max(0, result.playerScore - goals),
      true,
    );
    this._distributeGoalsToRoster(result.opponent, result.opponentScore, false);
    this.applyMatchReputation(
      rating,
      result.lineupStatus || this.lastLineupStatus || "starter",
    );

    let xpGain = 60; // Copa dá mais XP base
    if (result.playerScore > result.opponentScore) xpGain += 30;
    xpGain += goals * 15 + assists * 10 + Math.floor(rating * 2);
    this.xp += Math.floor(xpGain);
    this.checkLevelUp();
    this.condition = Math.max(20, this.condition - this.fatiguePerMatch);

    // O resultado real vale na chave do MUNDO — é ela que a UI mostra. Sem
    // isto o `_simulateWorldDay` sortearia o jogo que o usuário acabou de
    // jogar, e a tela diria que ele perdeu o que ganhou.
    const cupDoDia = this.playerCupOfDay();
    this._recordPlayerCupResultInWorld(result);

    // Quem passou é o que ficou gravado na CHAVE, não uma segunda conta aqui.
    // Recalcular era o que anunciava "eliminado nos pênaltis" para quem tinha
    // acabado de se classificar neles.
    const passou =
      !!cupDoDia &&
      !!cupDoDia.match &&
      cupDoDia.match.winner === this.currentTeam.name;
    if (cupDoDia && !passou) {
      this.notifications.push({
        type: "copa_elim",
        msg: `❌ Eliminado da ${cupDoDia.name} ${
          result.playerScore === result.opponentScore
            ? `nos pênaltis (${cupDoDia.phase})`
            : `nas ${cupDoDia.phase}`
        }`,
        day: this.currentDayOffset,
      });
    }

    // Os outros jogos da fase e o avanço do chaveamento são do mundo:
    // `_simulateWorldDay` + `resolveCupWindows`.
    this._simulateWorldDay();
    this.currentDayOffset++;
    this.saveToLocalStorage();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Simulação dos jogos de fundo (o mundo jogando sem o usuário)
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Joga os confrontos do calendário GLOBAL marcados para o dia, menos o do
   * clube do usuário (esse ele joga, ou leva falta). Substituiu
   * `simulateLeagueRound`/`simulateOtherMatches`, que sorteavam DUPLAS ao acaso
   * a cada rodada: a tabela andava, mas sem nenhuma relação com os confrontos
   * que o CalendarManager tinha marcado — dois times podiam se enfrentar em
   * rodadas seguidas e o returno nunca acontecia.
   */
  _simulateWorldDay(dayOffset = this.currentDayOffset) {
    // Save recarregado não traz o calendário, só a worldSeed: reconstrói igual.
    if (!this.world && !this.initializeWorld()) return;
    // Guarda por DIA e não por confronto: como o calendário é regerado da seed,
    // uma flag no fixture morreria no reload e o dia seria pago duas vezes.
    if (this.lastSimulatedDay >= dayOffset) return;
    this.lastSimulatedDay = dayOffset;

    const meuClube = this.currentTeam && this.currentTeam.name;
    const rand = () => this.world.season._rand();

    for (const f of this.world.calendar.fixturesOn(dayOffset)) {
      const ehLiga = typeof LEAGUES_DB !== "undefined" && !!LEAGUES_DB[f.competition];

      // Jogo do usuário: se ele JOGOU, o resultado real já entrou e não se
      // toca. Se não jogou (pulou pelo calendário), o simulador resolve — antes
      // a partida simplesmente sumia da temporada e o clube dele ficava com
      // menos jogos que todo mundo na tabela.
      if (f.home === meuClube || f.away === meuClube) {
        const entrada = this.schedule.find(
          (e) => e.dayOffset === dayOffset && e.matchType === f.competition,
        );
        if (entrada && entrada.played) continue;
        this._markFixturePlayed(entrada);
      }

      const placar = simulateMatch(f.home, f.away, rand);
      if (ehLiga) {
        this.world.season.recordResult(f.competition, f.home, f.away, placar);
        this._applyResultToLeagueTable(f.home, f.away, placar);
      } else {
        this.world.season.recordCupResult(f.competition, f.home, f.away, placar);
      }
    }
    // Quem venceu hoje ganha adversário e data da fase seguinte.
    const novasFases = this.world.calendar.resolveCupWindows(
      this.world.season,
      dayOffset + 1,
    );
    // O schedule do usuário é um RECORTE do calendário, tirado uma vez. Se a
    // fase nova o incluiu, sem refiltrar ele nunca seria convocado para ela.
    if (novasFases) this.generateSchedule();
    this._checkCupTrophies();
    this.sortLeagueTable();
    this.sortTopScorers();
  }

  /**
   * Título de copa vem da chave do mundo. Antes só a copa local legada dava
   * troféu — ganhar a Champions não rendia nada. Deduplicado por temporada
   * porque isto roda todo dia.
   */
  _checkCupTrophies() {
    for (const cup of this.playerCups()) {
      if (cup.champion !== this.currentTeam.name) continue;
      const titulo = `Campeão ${cup.name}`;
      if (
        this.trophies.some(
          (t) => t.title === titulo && t.season === this.season,
        )
      )
        continue;
      this.trophies.push({ title: titulo, season: this.season });
      this.notifications.push({
        type: "trophy",
        msg: `🏆 CAMPEÃO DA ${cup.name.toUpperCase()}! Temporada ${this.season}`,
        day: this.currentDayOffset,
      });
    }
  }

  /** O jogo de copa que o usuário jogou decide a chave do mundo, não o simulador. */
  _recordPlayerCupResultInWorld(result) {
    // A copa é a do confronto do dia (continental ou doméstica).
    const evento = this.schedule.find(
      (e) => e.type === "copa" && e.dayOffset === this.currentDayOffset,
    );
    const cup = evento
      ? this.playerCupStatus(evento.matchType)
      : this.playerCupStatus();
    if (!cup || !cup.match || cup.match.winner || !cup.match.away) return;
    if (evento) evento.played = true;

    const meu = this.currentTeam.name;
    const emCasa = cup.match.home === meu;
    const golsCasa = emCasa ? result.playerScore : result.opponentScore;
    const golsFora = emCasa ? result.opponentScore : result.playerScore;
    const adversario = emCasa ? cup.match.away : cup.match.home;

    // Empate em mata-mata sai decidido nos pênaltis (PenaltyShootoutScene), e
    // quem passou vem por ID. `penaltyWin` (booleano) fica como compatibilidade.
    let winnerId = null;
    if (result.playerScore !== result.opponentScore) {
      winnerId = result.playerScore > result.opponentScore ? meu : adversario;
    } else if (result.penaltyWinnerId) {
      winnerId = result.penaltyWinnerId;
    } else if (result.penaltyWin === true) {
      winnerId = meu;
    }

    this.world.season.recordCupResult(cup.id, cup.match.home, cup.match.away, {
      homeScore: golsCasa,
      awayScore: golsFora,
      isDraw: golsCasa === golsFora,
      // null = ninguém decidiu; aí sim o SeasonManager tira no PRNG.
      winnerId,
    });
  }

  /**
   * O jogo do usuário também conta para a tabela do mundo. Sem isto o clube
   * dele apareceria com 0 jogos na tabela do SeasonManager enquanto lidera a da
   * carreira. A `leagueTable` já foi atualizada pelo `recordMatch`.
   */
  _recordPlayerResultInWorld(result) {
    if (!this.world) return;
    const jogo = this.schedule.find(
      (e) => e.dayOffset === this.currentDayOffset && e.type === "brasileirao",
    );
    // Marca antes de qualquer coisa: é isto que impede o `_simulateWorldDay`
    // de sortear de novo a partida que o usuário acabou de jogar (e é o que
    // faz `matchDay` andar).
    this._markFixturePlayed(jogo);
    if (!jogo) return;
    const meu = this.currentTeam.name;
    const casa = jogo.isHome ? meu : result.opponent;
    const fora = jogo.isHome ? result.opponent : meu;
    const golsCasa = jogo.isHome ? result.playerScore : result.opponentScore;
    const golsFora = jogo.isHome ? result.opponentScore : result.playerScore;
    this.world.season.recordResult(jogo.matchType, casa, fora, {
      homeScore: golsCasa,
      awayScore: golsFora,
      isDraw: golsCasa === golsFora,
      winnerId: golsCasa === golsFora ? null : golsCasa > golsFora ? casa : fora,
    });
  }

  /**
   * Espelha o placar na tabela que a UI mostra. Só as ligas que a carreira
   * exibe têm linha aqui; o resto do mundo vive apenas no SeasonManager.
   */
  _applyResultToLeagueTable(homeId, awayId, placar) {
    const casa = this.leagueTable.find((t) => t.name === homeId);
    const fora = this.leagueTable.find((t) => t.name === awayId);
    if (!casa || !fora) return;

    applyResultToRows(casa, fora, placar, homeId);
    this._registerTeamAppearances(homeId, false);
    this._registerTeamAppearances(awayId, false);
    this._distributeGoalsToRoster(homeId, placar.homeScore, false);
    this._distributeGoalsToRoster(awayId, placar.awayScore, false);
  }

  sortLeagueTable() {
    this.leagueTable.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const diffA = a.goalsFor - a.goalsAgainst;
      const diffB = b.goalsFor - b.goalsAgainst;
      if (diffB !== diffA) return diffB - diffA;
      return b.goalsFor - a.goalsFor;
    });
  }

  sortTopScorers() {
    this._ensureUserGlobalStat();
    this.topScorers = Object.values(this.globalPlayerStats || {}).sort(
      (a, b) =>
        b.goals - a.goals || b.assists - a.assists || a.matches - b.matches,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Fim e início de temporada — BUG CORRIGIDO
  // ─────────────────────────────────────────────────────────────────────────────
  isBrasileiraoFinished() {
    return this.matchDay > this.totalMatches || this.matchDay >= 31;
  }

  /**
   * A participação do clube nas copas acabou quando, em CADA uma delas, ele foi
   * eliminado ou o torneio já tem campeão (se não foi eliminado e há campeão,
   * o campeão é ele). Sem copa nenhuma, nada segura a temporada.
   */
  isCopaFinishedForPlayer() {
    return this.playerCups().every((cup) => cup.eliminated || cup.champion);
  }

  isSeasonComplete() {
    if (!(this.isBrasileiraoFinished() && this.isCopaFinishedForPlayer()))
      return false;
    // O calendário do MUNDO pode ter rodada marcada depois do último jogo do
    // usuário. Encerrar aí fechava a tabela com metade dos clubes com um jogo a
    // menos — e é essa tabela que define o campeão e as vagas continentais.
    return !this._worldHasPendingFixtures();
  }

  _worldHasPendingFixtures() {
    if (!this.world) return false;
    return this.world.calendar.fixtures.some(
      (f) => f.dayOffset >= this.currentDayOffset,
    );
  }

  endSeason() {
    if (!this.isSeasonComplete()) return false;
    if (this.seasonEnded) return true;

    this.sortLeagueTable();

    // Verificar campeão da liga do usuário
    if (this.leagueTable.length > 0 && this.leagueTable[0].isPlayerTeam) {
      const titulo = `Campeão ${this.playerLeagueName()}`;
      const alreadyAwarded = this.trophies.some(
        (t) => t.title === titulo && t.season === this.season,
      );
      if (!alreadyAwarded) {
        this.trophies.push({
          title: titulo,
          season: this.season,
        });
        this.notifications.push({
          type: "trophy",
          msg: `🏆 CAMPEÃO DO ${this.playerLeagueName().toUpperCase()}! Temporada ${this.season}`,
          day: this.currentDayOffset,
        });
      }
    }

    // Gerar propostas de transferência no fim da temporada
    this.generateTransferOffers();
    this.seasonEnded = true;
    this.saveToLocalStorage();
    return true;
  }

  startNewSeason() {
    this.season++;
    this.matchDay = 1;
    this.seasonEnded = false;

    // Resetar calendário para o início do novo ano
    this.startDate = new Date(this.startDate.getFullYear() + 1, 3, 1); // Abril do próximo ano
    this.currentDayOffset = 0;
    this.lastSalaryDay = 0;
    this.lastActivityDay = -1;
    this.lastSimulatedDay = -1;

    // Resetar estatísticas da temporada
    this.playerStats.matches = 0;
    this.playerStats.goals = 0;
    this.playerStats.assists = 0;

    // O mundo do ano passado morre AQUI, antes de a tabela ser recriada: ela
    // agora copia os números da tabela viva do mundo, e o mundo novo só nasce
    // dentro de generateSchedule() — sem isto a temporada começaria com os
    // pontos da anterior. As tabelas finais sobrevivem: são elas que definem
    // quem vai à Champions e à Libertadores no ano novo.
    this._lastSeasonTables = this.world ? this.world.season.tables : null;
    this.world = null;

    // Resetar tabela e agenda
    this.initializeLeagueTable();
    this.initializeGlobalPlayerStats();
    this.initializeTopScorers();
    this.generateSchedule();

    // Limpar notificações antigas
    this.notifications = [];

    this.saveToLocalStorage();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Próximo adversário do Brasileirão
  // ─────────────────────────────────────────────────────────────────────────────
  getNextOpponent() {
    const opponents = this.leagueTable.filter((t) => !t.isPlayerTeam);
    return opponents[(this.matchDay - 1) % opponents.length];
  }

  getCopaOpponent() {
    // Fonte de verdade é a chave do MUNDO, e a copa é a do CONFRONTO do dia:
    // o clube disputa a continental E a doméstica, então "a copa dele" no
    // singular devolvia o adversário da outra competição.
    const evento =
      this.schedule.find(
        (e) => e.type === "copa" && e.dayOffset === this.currentDayOffset,
      ) ||
      this.schedule.find(
        (e) => e.type === "copa" && e.dayOffset >= this.currentDayOffset,
      );
    const cup = evento
      ? this.playerCupStatus(evento.matchType)
      : this.playerCupStatus();
    if (!cup || cup.eliminated || cup.champion) return null;
    // Sem `away` = ele passou mas o outro lado da chave ainda não jogou.
    if (!cup.match || !cup.match.away || cup.match.winner) return null;
    const oppName =
      cup.match.home === this.currentTeam.name
        ? cup.match.away
        : cup.match.home;

    const local =
      this.leagueTable.find((t) => t.name === oppName) ||
      this.leagues["Brasil"].find((t) => t.name === oppName);
    if (local) return local;

    // Adversário continental: não está na liga do usuário, mas está no
    // LeaguesDB. Sem isto a tela mostrava o ID cru ("man_city"), cinza e 75.
    const mundial = typeof findClub === "function" ? findClub(oppName) : null;
    const kit = typeof TEAMS_DB !== "undefined" ? TEAMS_DB[oppName] : null;
    const hex = (n) => "#" + (n || 0x888888).toString(16).padStart(6, "0");
    return {
      // `name` continua sendo o ID: é a chave de REAL_ROSTERS que o registro de
      // gols usa. O nome bonito vai em `label`, como no resto da carreira.
      name: oppName,
      label: mundial ? mundial.name : oppName,
      rating: mundial ? mundial.strength : 75,
      shirtColor: kit ? hex(kit.shirt1) : "#888888",
      shirtColor2: kit ? hex(kit.shirt2) : null,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Mercado de Transferências
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Todos os clubes jogáveis, de todas as ligas — `this.leagues` já é o
   * `buildCareerLeaguesFromDB()` inteiro, chaveado por país. Cada clube sai
   * daqui com o `leagueId` colado, que é o que o mercado usa para saber o
   * prestígio (e o bolso) da liga compradora.
   */
  _allClubs() {
    const out = [];
    for (const pais of Object.keys(this.leagues)) {
      const ligaId = getAllLeagueIds().find(
        (id) => LEAGUES_DB[id].country === pais,
      );
      for (const clube of this.leagues[pais]) out.push({ ...clube, leagueId: ligaId });
    }
    return out;
  }

  /** Rating do jogador do jeito que o mercado enxerga. */
  playerMarketRating() {
    return Math.min(99, this.level * 2 + 60);
  }

  /** Prestígio da liga do clube (1-5). Sem liga conhecida, meio da tabela. */
  _leagueTier(leagueId) {
    const liga = typeof LEAGUES_DB !== "undefined" && LEAGUES_DB[leagueId];
    return (liga && liga.tier) || 3;
  }

  /**
   * Rating mínimo para uma liga olhar um jogador de FORA do país dela. O
   * mercado doméstico não passa por aqui — clube pequeno sempre pode sondar
   * quem já está na liga. Tier 1-2 abrem para qualquer um; a Premier (5) só
   * chama estrela.
   */
  _leagueEntryRating(ligaTier) {
    return { 1: 0, 2: 0, 3: 76, 4: 82, 5: 88 }[ligaTier] || 0;
  }

  /**
   * Cruzamento tier x rating: cada tier tem um nível de jogador que procura
   * (tier 1 ≈ 64, tier 5 ≈ 88). Quem está acima disso é assediado; quem está
   * 8 pontos abaixo não recebe proposta nenhuma daquele clube.
   */
  _clubTargetRating(tier) {
    return 58 + (tier || 3) * 6;
  }

  _offerChance(club) {
    const rating = this.playerMarketRating();
    // Filtro de realidade: liga forte não busca jogador médio no exterior.
    // O mercado doméstico fica sempre aberto.
    const domestico = club.leagueId === this.playerLeagueId();
    if (!domestico && rating < this._leagueEntryRating(this._leagueTier(club.leagueId)))
      return 0;

    const gap = rating - this._clubTargetRating(club.tier);
    return Math.max(0, Math.min(0.9, 0.45 + gap * 0.06));
  }

  /**
   * Salário: tabela do tier do CLUBE, multiplicada pelo poder da LIGA e com
   * adicional por quanto o jogador supera o alvo do clube. É o multiplicador de
   * liga que faz a Premier pagar ordem de grandeza acima do resto.
   */
  _offerSalary(club) {
    const base = this.salaryTable[club.tier] || 5000;
    const gap = Math.max(
      0,
      this.playerMarketRating() - this._clubTargetRating(club.tier),
    );
    const mult = this.leaguePayFactor[this._leagueTier(club.leagueId)] || 1;
    return Math.round((base * mult * (1 + gap * 0.04)) / 100) * 100;
  }

  /** Discurso da proposta: sai da liga compradora e do salto de patamar. */
  _offerPitch(club) {
    const ligaTier = this._leagueTier(club.leagueId);
    const salto = (club.tier || 3) - (this.currentTeam.tier || 3);
    if (club.leagueId !== this.playerLeagueId() && ligaTier >= 4)
      return `Salto para a ${(LEAGUES_DB[club.leagueId] || {}).name || "Europa"}`;
    if (salto > 0) return "Grande Oportunidade";
    if (salto === 0) return "Titular Garantido";
    return "Projeto Ambicioso";
  }

  /** Uma proposta no formato que a TransferMarketScene lê (campos planos). */
  _buildOffer(club, bonus, isRenewal = false) {
    const salary = this._offerSalary(club);
    return {
      team: club.name, // ID do clube (compatibilidade: acceptTransfer lê daqui)
      teamId: club.name, // mesmo ID, nome explícito para a UI
      teamLabel: club.label || CareerMode.clubLabel(club.name),
      tier: club.tier || 3,
      leagueTier: this._leagueTier(club.leagueId),
      salary,
      // Luvas: 3 salários, pagas à vista na assinatura. Renovação não tem.
      signingBonus: isRenewal ? 0 : salary * 3,
      bonus,
      rating: club.rating || 75,
      isRenewal,
    };
  }

  generateTransferOffers() {
    this.transferOffers = [];
    const currentTier = this.currentTeam.tier || 3;

    // Proposta de renovação do time atual
    const currentTeamData = this._myClubData();
    if (currentTeamData) {
      this.transferOffers.push(
        this._buildOffer(
          { ...currentTeamData, tier: currentTier },
          "Renovação de Contrato",
          true,
        ),
      );
    }

    // Propostas do MUNDO, não só do Brasil: a carreira pode estar em qualquer
    // liga e o assédio vem de fora dela. Embaralhado porque há teto de vagas —
    // sem isso os interessados seriam sempre os mesmos clubes, na ordem do DB.
    const pool = this._allClubs();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    // Varre o mundo INTEIRO e só depois corta as 5 melhores. Cortar dentro do
    // laço fazia o gigante europeu ficar de fora por sorteio: o teto enchia com
    // os primeiros clubes embaralhados antes de a Premier ser avaliada.
    // ponytail: 5 para a tela não virar lista infinita; vire paginação se
    // alguém quiser ver o mercado todo.
    const candidatas = [];
    for (const club of pool) {
      if (club.name === this.currentTeam.name) continue;
      if (Math.random() >= this._offerChance(club)) continue;
      candidatas.push(this._buildOffer(club, this._offerPitch(club)));
    }
    candidatas.sort((a, b) => b.salary - a.salary);
    this.transferOffers.push(...candidatas.slice(0, 5));

    // Piso de 3 propostas — mas só entre quem PODERIA propor. Sorteando do
    // mundo inteiro sem filtro, o piso furava a regra e mandava o Bayern atrás
    // de um jogador de rating 62. Se ninguém quer, a lista fica curta mesmo.
    while (this.transferOffers.length < 3) {
      const candidates = this._allClubs().filter(
        (t) =>
          t.name !== this.currentTeam.name &&
          !this.transferOffers.find((o) => o.team === t.name) &&
          this._offerChance(t) > 0,
      );
      if (candidates.length === 0) break;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      this.transferOffers.push(this._buildOffer(pick, "Interesse Súbito"));
    }

    // Ordenar por salário (maior primeiro)
    this.transferOffers.sort((a, b) => b.salary - a.salary);
  }

  acceptTransfer(offer) {
    // Proposta pode vir de QUALQUER liga: procurar só no Brasil fazia a oferta
    // estrangeira (e a renovação de um clube alemão) sumir sem aviso.
    const teamData = this._allClubs().find((t) => t.name === offer.team);
    if (!teamData) return;
    this.currentTeam = {
      name: offer.team,
      tier: teamData.tier,
      budget: 50000,
      shirtColor: teamData.shirtColor,
      shirtColor2: teamData.shirtColor2,
      players: [{ name: this.playerName, rating: 75 }],
    };
    this.monthlySalary = offer.salary;
    if (offer.signingBonus) {
      this.playerMoney += offer.signingBonus;
      this.addNotification(
        `💰 Luvas de R$ ${offer.signingBonus.toLocaleString("pt-BR")} pagas na assinatura`,
        "transfer",
      );
    }
    // Mudou de país: a tabela e a artilharia passam a ser as da liga nova, com
    // os números que o mundo já simulou nela enquanto o usuário jogava a outra.
    const ligaNova = LEAGUES_DB[this.playerLeagueId()];
    const paisNovo = (ligaNova && ligaNova.country) || "Brasil";
    if (paisNovo !== this.currentLeague) {
      this.currentLeague = paisNovo;
      this.initializeLeagueTable();
      this.initializeGlobalPlayerStats();
    }
    this.transferOffers = [];
    this.notifications.push({
      type: "transfer",
      msg: `✅ Transferência concluída! Agora você joga no ${offer.team}. Salário: R$ ${offer.salary.toLocaleString("pt-BR")}/mês`,
      day: this.currentDayOffset,
    });

    // Se a transferência ocorreu no fim da temporada, inicia o novo ano
    if (this.seasonEnded) {
      this.startNewSeason();
    } else {
      // Caso ocorra no meio da janela, garantir que a agenda seja atualizada para o novo time
      this.generateSchedule();
      this.saveToLocalStorage();
    }
  }

  declineTransfer(offer) {
    this.transferOffers = this.transferOffers.filter(
      (o) => o.team !== offer.team,
    );
    // Recusou tudo no fim do ano: sem isto a carreira ficava presa esperando
    // uma proposta que nunca vinha, porque só `acceptTransfer` virava o ano.
    if (this.seasonEnded && this.transferOffers.length === 0) {
      this.startNewSeason();
      return;
    }
    this.saveToLocalStorage();
  }

  /** Fica no clube atual e começa o ano novo. Sempre disponível no fim da temporada. */
  stayAndStartNewSeason() {
    this.transferOffers = [];
    this.startNewSeason();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Notificações
  // ─────────────────────────────────────────────────────────────────────────────
  popNotification() {
    return this.notifications.shift() || null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Persistência
  // ─────────────────────────────────────────────────────────────────────────────
  saveToLocalStorage() {
    const data = {
      playerName: this.playerName,
      level: this.level,
      xp: this.xp,
      skillPoints: this.skillPoints,
      speed: this.speed,
      kickPower: this.kickPower,
      stamina: this.stamina,
      skinColor: this.skinColor,
      hairColor: this.hairColor,
      position: this.position,
      skills: this.skills,
      condition: this.condition,
      coachReputation: this.coachReputation,
      lastLineupStatus: this.lastLineupStatus,
      currentTeam: this.currentTeam,
      currentLeague: this.currentLeague,
      season: this.season,
      matchDay: this.matchDay,
      seasonEnded: this.seasonEnded,
      startDate: this.startDate.toISOString(),
      currentDayOffset: this.currentDayOffset,
      totalMatches: this.totalMatches,
      schedule: this.schedule,
      worldSeed: this.worldSeed,
      // A seed regenera o calendário, não os placares já simulados.
      _worldTables: this.world ? this.world.season.tables : this._worldTables,
      lastSimulatedDay: this.lastSimulatedDay,
      leagueTable: this.leagueTable,
      trophies: this.trophies,
      lastActivityDay: this.lastActivityDay,
      playerStats: this.playerStats,
      globalPlayerStats: this.globalPlayerStats,
      topScorers: this.topScorers,
      transferOffers: this.transferOffers,
      playerMoney: this.playerMoney,
      monthlySalary: this.monthlySalary,
      lastSalaryDay: this.lastSalaryDay,
      notifications: this.notifications,
      newsHistory: this.newsHistory || [],
      matchObjectives: this.matchObjectives || [],
      completedObjectivesCount: this.completedObjectivesCount || 0,
      transferWindowOpen: this.transferWindowOpen,
    };
    localStorage.setItem("phaser_football_career", JSON.stringify(data));
  }

  loadFromLocalStorage() {
    const raw = localStorage.getItem("phaser_football_career");
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      Object.assign(this, data);
      if (data.startDate) this.startDate = new Date(data.startDate);
      // Compatibilidade com saves antigos
      this.skills = { ...DEFAULT_SKILLS, ...this.skills };
      if (!this.position) this.position = "Meia";
      if (!this.playerMoney) this.playerMoney = 0;
      if (!this.monthlySalary) this.monthlySalary = 5000;
      if (!this.lastSalaryDay) this.lastSalaryDay = 0;
      // Save antigo: o passado já está contabilizado na leagueTable, então
      // marca o dia atual como simulado para não pagar a rodada duas vezes.
      if (this.lastSimulatedDay === undefined)
        this.lastSimulatedDay = this.currentDayOffset;
      if (!this.notifications) this.notifications = [];
      if (!this.newsHistory) this.newsHistory = [];
      if (!this.matchObjectives) this.matchObjectives = [];
      if (this.completedObjectivesCount === undefined)
        this.completedObjectivesCount = 0;
      if (this.coachReputation === undefined) this.coachReputation = 50;
      if (!this.lastLineupStatus) this.lastLineupStatus = "starter";
      if (!this.globalPlayerStats) this.initializeGlobalPlayerStats();
      else this.initializeTopScorers();
      if (this.seasonEnded === undefined) this.seasonEnded = false;
      // Proposta de save antigo tinha `team` como OBJETO e nem tier nem rating:
      // ela chegava na tela como "[object Object]" e "—". Descarta — o mercado
      // regenera na próxima janela ou no fim do ano.
      this.transferOffers = (this.transferOffers || []).filter(
        (o) => o && typeof o.teamId === "string" && Number.isFinite(o.salary),
      );
      // Save antigo traz a copa local: era um chaveamento paralelo de 8 clubes
      // brasileiros que nada mais lê. As copas agora são torneios do mundo,
      // reconstruídos da worldSeed — o objeto salvo é lixo e vai embora calado.
      delete this.copa;
      if (!this.currentTeam.tier) this.currentTeam.tier = 3;
      if (this.leagueTable) {
        this.leagueTable.forEach((t) => {
          if (t.draws === undefined) t.draws = 0;
          if (t.losses === undefined) t.losses = 0;
          if (t.tier === undefined) t.tier = 3;
        });
      }
      // A liga vem do CLUBE. Antes o load forçava "Brasil", então uma carreira
      // alemã voltava com a tabela do Brasileirão — e é assim que os saves
      // antigos estão gravados. Só corrige quando o clube não é da liga salva.
      const clubes = this.leagues[this.currentLeague];
      if (!clubes || !clubes.some((t) => t.name === this.currentTeam.name)) {
        const liga = LEAGUES_DB[this.playerLeagueId()];
        this.currentLeague = (liga && liga.country) || "Brasil";
        this.initializeLeagueTable();
      }
      return true;
    } catch (e) {
      console.error("Erro ao carregar carreira:", e);
      return false;
    }
  }
}

// =============================================================================
// Check: a UI da copa lê a chave do MUNDO. Se `playerCupStatus` errar a fase ou
// a eliminação, a tela volta a mentir em silêncio — dizendo "Oitavas" na final
// ou "em jogo" para quem já caiu. Chave falsa de 4 times, sem carreira inteira.
// =============================================================================
console.assert(
  (() => {
    const c = Object.create(CareerMode.prototype);
    c.currentTeam = { name: "X" };
    const rounds = [
      {
        round: 1,
        matches: [
          { home: "X", away: "Y", winner: "X" },
          { home: "Z", away: "W", winner: "Z" },
        ],
      },
      { round: 2, matches: [{ home: "X", away: "Z", winner: null }] },
    ];
    let campeao = null;
    c.world = {
      season: {
        tournaments: {
          champions: {
            id: "champions",
            name: "Champions League",
            participants: ["X", "Y", "Z", "W"],
            bracket: { rounds },
          },
        },
        cupChampion: () => campeao,
      },
    };

    const emJogo = c.playerCupStatus();
    // Com jogo em aberto, a temporada NÃO pode fechar (gate de fim de ano).
    const gateEmJogo = c.isCopaFinishedForPlayer();
    // Perdeu a final: sai "eliminado nas Final", não "em jogo".
    rounds[1].matches[0].winner = "Z";
    const fora = c.playerCupStatus();
    const gateFora = c.isCopaFinishedForPlayer();
    // Campeão vem do mundo, não do bracket legado.
    rounds[1].matches[0].winner = "X";
    campeao = "X";
    const campeaoStatus = c.playerCupStatus();
    const gateCampeao = c.isCopaFinishedForPlayer();

    // Clube que não disputa copa nenhuma não inventa uma.
    c.currentTeam = { name: "NINGUEM" };
    const semCopa = c.playerCupStatus();

    return (
      emJogo.name === "Champions League" &&
      emJogo.phase === "Final" &&
      emJogo.round === 1 &&
      emJogo.fixtures.length === 1 &&
      !emJogo.eliminated &&
      fora.eliminated === true &&
      fora.phase === "Final" &&
      campeaoStatus.champion === "X" &&
      semCopa === null &&
      // O gate de fim de ano sai da mesma chave: só fecha eliminado ou campeão.
      gateEmJogo === false &&
      gateFora === true &&
      gateCampeao === true &&
      // Chave grande: 5 rodadas, a 1ª é a fase de 32.
      c._cupPhaseName(0, 5) === "Fase de 32" &&
      c._cupPhaseName(2, 5) === "Quartas de Final"
    );
  })(),
  "CareerMode.playerCupStatus: fase, eliminação ou campeão da copa errados na UI",
);

// =============================================================================
// Check: a proposta que chega na TransferMarketScene. Os campos são PLANOS e
// nenhum pode ser undefined — foi exatamente isso que encheu a tela de
// "undefined". E o cruzamento tier x rating tem de barrar o clube de elite
// atrás de um jogador fraco, senão o mercado vira loteria.
// =============================================================================
console.assert(
  (() => {
    const c = Object.create(CareerMode.prototype);
    c.salaryTable = { 1: 3000, 2: 8000, 3: 20000, 4: 50000, 5: 120000 };
    c.leaguePayFactor = { 1: 0.6, 2: 1, 3: 1.6, 4: 3, 5: 5 };
    c.transferOffers = [];
    c.currentTeam = { name: "Flamengo", tier: 4 }; // carreira brasileira
    c.leagues = {
      Brasil: [
        { name: "Flamengo", tier: 4, rating: 85 },
        { name: "Remo", tier: 1, rating: 70 }, // clube pequeno do mercado de casa
      ],
      Inglaterra: [{ name: "man_city", tier: 5, rating: 90 }],
    };

    // `_allClubs` cola o leagueId pelo país; os clubes precisam ser reais.
    const clubes = c._allClubs();
    const ingles = clubes.find((x) => x.name === "man_city"); // liga tier 5
    const domestico = clubes.find((x) => x.name === "Remo"); // liga do jogador

    c.level = 1; // rating 62: médio/baixo
    const chanceForaFraco = c._offerChance(ingles);
    const chanceCasaFraco = c._offerChance(domestico);
    c.level = 15; // rating 90: estrela
    const chanceForaEstrela = c._offerChance(ingles);
    const salarioIngles = c._offerSalary(ingles);
    const salarioDomestico = c._offerSalary({ ...domestico, tier: ingles.tier });

    const oferta = c._buildOffer(ingles, "Teste");
    const camposDaTela = ["team", "tier", "salary", "rating"];

    return (
      // Liga forte não olha jogador médio de fora; o mercado de casa segue aberto.
      chanceForaFraco === 0 &&
      chanceCasaFraco > 0 &&
      // Estrela desperta o gigante europeu.
      chanceForaEstrela > 0.5 &&
      chanceForaEstrela <= 0.9 &&
      // Poder financeiro: mesma força de clube, liga tier 5 paga MUITO mais.
      Number.isFinite(salarioIngles) &&
      salarioIngles > salarioDomestico * 2 &&
      // Nada de undefined chegando na UI, e luvas junto do salário.
      camposDaTela.every((k) => oferta[k] !== undefined) &&
      oferta.team === "man_city" &&
      oferta.signingBonus === oferta.salary * 3 &&
      // O mercado é o mundo inteiro, não uma liga só.
      clubes.length === 3 &&
      clubes.every((x) => !!x.leagueId)
    );
  })(),
  "CareerMode: mercado sem filtro de liga, sem escalonamento salarial ou com campo undefined",
);

// =============================================================================
// Check: nada de "[object Object]" ou undefined chegando na tela do mercado. A
// proposta antiga (com `team` = OBJETO) vinha de save gravado antes do formato
// plano — e o sintoma era só um texto errado, sem erro nenhum no console.
// =============================================================================
console.assert(
  (() => {
    const L = CareerMode.clubLabel;
    // ID conhecido, ID desconhecido, objeto legado e vazio: sempre string.
    const casos = [
      L("man_city"),
      L("id_inexistente"),
      L({ name: "Flamengo" }),
      L(null),
      L(undefined),
    ];

    const c = Object.create(CareerMode.prototype);
    c.salaryTable = { 1: 3000, 2: 8000, 3: 20000, 4: 50000, 5: 120000 };
    c.leaguePayFactor = { 1: 0.6, 2: 1, 3: 1.6, 4: 3, 5: 5 };
    c.level = 10;
    c.currentTeam = { name: "Santos", tier: 2 };
    const oferta = c._buildOffer(
      { name: "man_city", label: "Manchester City", tier: 5, rating: 90, leagueId: "premier_league" },
      "Teste",
    );

    return (
      casos.every((v) => typeof v === "string" && v.length > 0) &&
      L({ name: "Flamengo" }) === "Flamengo" &&
      // A UI lê estes três: nenhum pode faltar.
      oferta.teamId === "man_city" &&
      oferta.teamLabel === "Manchester City" &&
      Number.isFinite(oferta.tier) &&
      Number.isFinite(oferta.rating) &&
      Number.isFinite(oferta.salary)
    );
  })(),
  "CareerMode: proposta ou clubLabel devolvendo objeto/undefined para a tela",
);
