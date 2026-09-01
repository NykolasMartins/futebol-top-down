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
    // Da constante, não cravado: `CAREER_BASE.START_*` existia aqui do lado e
    // ninguém lia — mexer nele não mudava o jogo. É o clássico da casa.
    this.speed = CAREER_BASE.START_SPEED;
    this.kickPower = CAREER_BASE.START_KICK_POWER;
    this.stamina = CAREER_BASE.START_STAMINA;
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

    // Tática do time do usuário. Escolhida no menu de pausa da partida e
    // guardada aqui para valer no jogo seguinte.
    this.tactic = TACTICS.T3_1;

    // Idade e contrato do usuário. O contrato é um RELÓGIO: sem prazo, o
    // mercado era só "recebo proposta aleatória"; com ele, o último ano vira
    // decisão — renovar, esperar proposta ou sair de graça.
    this.age = CAREER_BASE.START_AGE;
    this.contractYears = CAREER_BASE.CONTRACT_YEARS;

    // Seleção nacional: convocação, jogos e gols. As partidas da seleção são
    // SIMULADAS (ver `_janelaDeSelecao`) — jogá-las exigiria um terceiro tipo
    // de compromisso no calendário, e `type` é literal comparado pelas cenas.
    this.national = { called: false, caps: 0, goals: 0, seasons: 0 };

    // Prêmios individuais e a história ano a ano (seção "HISTÓRICO" do perfil).
    this.awards = [];
    this.history = [];

    // Disciplina e lesão: o que acontece EM CAMPO passa a custar fora dele.
    // `suspended` e `injuryDays` entram por `getLineupStatus()` — a porta que
    // já decide se o jogador entra, entra no 2º tempo ou nem é relacionado.
    this.discipline = { yellows: 0, reds: 0, suspended: 0 };
    this.injuryDays = 0;

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
  // ───────────────────────────────────────────────────────────────────────────
  // SLOTS DE SAVE
  // ───────────────────────────────────────────────────────────────────────────
  // Havia UMA chave no localStorage: começar carreira nova apagava a anterior
  // sem aviso e sem volta. Agora são três, e o SLOT 1 continua na chave antiga
  // de propósito — quem já tem carreira salva não perde nada ao atualizar.

  static CHAVE_BASE = "phaser_football_career";
  static CHAVE_SLOT_ATIVO = "carreira_slot";
  static SLOTS = 3;

  /** Slot em uso. Vive no localStorage para sobreviver ao recarregar a página. */
  static slotAtivo() {
    const n = parseInt(localStorage.getItem(CareerMode.CHAVE_SLOT_ATIVO), 10);
    return n >= 1 && n <= CareerMode.SLOTS ? n : 1;
  }

  static usarSlot(n) {
    const slot = n >= 1 && n <= CareerMode.SLOTS ? n : 1;
    localStorage.setItem(CareerMode.CHAVE_SLOT_ATIVO, String(slot));
    return slot;
  }

  /** Slot 1 fica na chave SEM sufixo: é a compatibilidade com o save antigo. */
  static chaveDoSlot(n) {
    const slot = n || CareerMode.slotAtivo();
    return slot === 1
      ? CareerMode.CHAVE_BASE
      : `${CareerMode.CHAVE_BASE}_${slot}`;
  }

  /** Resumo dos três slots para a tela de carregar. Nunca lança. */
  static resumoDosSlots() {
    const lista = [];
    for (let n = 1; n <= CareerMode.SLOTS; n++) {
      const item = { slot: n, existe: false };
      try {
        const bruto = JSON.parse(localStorage.getItem(CareerMode.chaveDoSlot(n)));
        if (bruto && bruto.playerName) {
          item.existe = true;
          item.playerName = bruto.playerName;
          item.level = bruto.level || 1;
          item.season = bruto.season || 1;
          item.club = CareerMode.clubLabel(
            (bruto.currentTeam && bruto.currentTeam.name) || "",
          );
        }
      } catch (erro) {
        /* save corrompido conta como slot vazio */
      }
      lista.push(item);
    }
    return lista;
  }

  static apagarSlot(n) {
    localStorage.removeItem(CareerMode.chaveDoSlot(n));
  }

  static clubLabel(clubId) {
    // Só ID (string) entra. Proposta de save antigo trazia o OBJETO do clube
    // aqui e o HTML recebia "[object Object]" — o "undefined" da tela.
    if (typeof clubId !== "string" || !clubId) {
      return clubId && clubId.name ? CareerMode.clubLabel(clubId.name) : "A definir";
    }
    // Seleção também é "clube" para a UI: sem isto a tela mostrava
    // "selecao_brasil", que é o mesmo vazamento de ID que este método existe
    // para tapar.
    if (typeof NATIONAL_TEAMS !== "undefined" && NATIONAL_TEAMS[clubId])
      return NATIONAL_TEAMS[clubId].label;
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

    // Elenco vivo: o save manda quando existe (ele guarda idade e rating já
    // envelhecidos), senão o mundo nasce do banco com idade derivada do id.
    // Antes da tabela e do calendário porque a força dos clubes sai daqui.
    if (typeof Elenco !== "undefined") {
      if (this._elencoMundo) {
        Elenco.carregar(this._elencoMundo);
        this._elencoMundo = null;
      }
      Elenco.iniciar(this.worldSeed);
    }

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

    this._agendarSelecao(anterior);
  }

  /**
   * Janelas de SELEÇÃO no calendário do usuário. Só para quem foi convocado, e
   * sempre em dia livre com folga dos dois lados — a seleção não pode empurrar
   * jogo de clube, que é o calendário de verdade do mundo.
   *
   * `type: "selecao"` é o TERCEIRO literal estrutural do schedule (havia
   * "brasileirao" e "copa") e as cenas o comparam: quem mexer aqui varre
   * `PreGameScene` e `EndGameScene` junto.
   */
  _agendarSelecao(anterior) {
    if (!this.national || !this.national.called) return;
    const minha = this.nationalTeam();
    if (!minha) return;

    const ocupados = new Set();
    this.schedule.forEach((e) => {
      ocupados.add(e.dayOffset - 1);
      ocupados.add(e.dayOffset);
      ocupados.add(e.dayOffset + 1);
    });

    const rivais = Object.keys(NATIONAL_TEAMS).filter((k) => k !== minha.id);
    // Em ano de Copa as datas viram as FASES do mata-mata: o adversário sai da
    // chave (`jogoDoMundial`) e não de um sorteio de amistoso.
    const copa = this.ehAnoDeMundial() ? this.mundialAtual() : null;
    const total = copa
      ? Math.ceil(Math.log2(Math.max(2, (copa.rounds[0] || []).length * 2)))
      : CAREER_BASE.NATIONAL_WINDOWS;

    // A régua é o TAMANHO REAL da temporada, não um 320 chutado. Com o número
    // fixo a última data caía DEPOIS do último jogo do mundo — um compromisso
    // que nunca chega, e que deixava `hasRemainingMatches()` eternamente true:
    // o botão de simular o resto sumia e a tela dizia "próximo jogo" de um jogo
    // que não existia. Fim de temporada em ~214 dias contra régua de 320.
    const fimDoAno = this.lastFixtureDay();
    if (fimDoAno <= 1) return;
    const passo = Math.floor(fimDoAno / (total + 1));
    let marcados = 0;

    for (let i = 1; i <= total; i++) {
      // Procura um dia livre a partir do alvo, andando para a frente.
      let dia = i * passo;
      let tentativas = 0;
      while (ocupados.has(dia) && tentativas < 30) {
        dia++;
        tentativas++;
      }
      // Data que escorregou para fora da temporada é descartada: melhor uma
      // convocação a menos do que um compromisso que nunca chega.
      if (ocupados.has(dia) || dia >= fimDoAno) continue;
      ocupados.add(dia - 1);
      ocupados.add(dia);
      ocupados.add(dia + 1);

      // Na Copa o rival só existe quando a fase anterior termina: fica nulo e
      // `getSelecaoOpponent` o resolve no dia, pela chave.
      const rival = copa ? null : rivais[(i - 1) % rivais.length];
      this.schedule.push({
        dayOffset: dia,
        type: "selecao",
        matchIndex: 0,
        opponentId: rival,
        isHome: i % 2 === 1,
        competitionName: copa ? MUNDIAL.NOME : "Data FIFA",
        matchType: "selecao",
        played: !!(
          (anterior || []).find(
            (e) => e.dayOffset === dia && e.type === "selecao",
          ) || {}
        ).played,
      });
      marcados++;
    }

    if (marcados) this.schedule.sort((a, b) => a.dayOffset - b.dayOffset);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // COPA DO MUNDO
  // ───────────────────────────────────────────────────────────────────────────
  // O chaveamento mora AQUI, e não em `world.season.tournaments`, porque aquilo
  // é o mundo dos CLUBES: as seleções não existem lá, não têm tabela e não
  // recebem vaga continental. O invariante que proíbe bracket local vale para
  // copa de clube — este é outro domínio, com outro dono.

  ehAnoDeMundial() {
    return this.season % MUNDIAL.A_CADA === 0;
  }

  /**
   * Monta a chave: as seleções, semeadas por força de elenco, completadas com
   * BYE até a potência de 2 — um BYE por confronto, nunca empilhados no fim
   * (empilhado, meia chave nasce vazia e alguém chega à final sem jogar).
   */
  _montarMundial() {
    const ids = Object.keys(NATIONAL_TEAMS);
    const forca = (id) => {
      const e = window.getTeamRoster ? window.getTeamRoster(id) : [];
      return e.length ? e.reduce((s, j) => s + j.rating, 0) / e.length : 70;
    };
    const times = ids.slice().sort((a, b) => forca(b) - forca(a));

    let tamanho = 1;
    while (tamanho < times.length) tamanho *= 2;
    const byes = tamanho - times.length;

    const primeira = [];
    let i = 0;
    for (let c = 0; c < tamanho / 2; c++) {
      const home = times[i++] || null;
      // Os primeiros `byes` confrontos são walkover — o cabeça passa direto.
      const away = c < byes ? null : times[i++] || null;
      primeira.push({ home, away, winner: away ? null : home });
    }

    this.mundial = {
      season: this.season,
      round: 0,
      rounds: [primeira],
      champion: null,
    };
    return this.mundial;
  }

  /** A chave do ano, criando-a na primeira pergunta. */
  mundialAtual() {
    if (!this.ehAnoDeMundial()) return null;
    if (!this.mundial || this.mundial.season !== this.season)
      this._montarMundial();
    return this.mundial;
  }

  /** O confronto do usuário na fase atual, se ele ainda estiver vivo. */
  jogoDoMundial() {
    const m = this.mundialAtual();
    const minha = this.nationalTeam();
    if (!m || !minha || m.champion) return null;
    const rodada = m.rounds[m.round] || [];
    return (
      rodada.find(
        (j) => !j.winner && (j.home === minha.id || j.away === minha.id),
      ) || null
    );
  }

  /** Nome da fase, contado de trás para frente (Final, Semifinal, Quartas…). */
  faseDoMundial() {
    const m = this.mundialAtual();
    if (!m) return null;
    const jogos = (m.rounds[m.round] || []).length;
    if (jogos <= 1) return "Final";
    if (jogos === 2) return "Semifinal";
    if (jogos <= 4) return "Quartas de final";
    return `Fase de ${jogos * 2}`;
  }

  /**
   * Fecha a rodada: grava o resultado do usuário, simula os outros confrontos
   * e monta a fase seguinte. Sem isto a chave nunca anda e a Copa fica parada
   * na primeira fase para sempre.
   */
  _avancarMundial(vitoriaDoUsuario) {
    const m = this.mundialAtual();
    const minha = this.nationalTeam();
    if (!m || !minha) return;
    const rodada = m.rounds[m.round] || [];

    rodada.forEach((jogo) => {
      if (jogo.winner) return;
      const ehMeu = jogo.home === minha.id || jogo.away === minha.id;
      if (ehMeu) {
        const rival = jogo.home === minha.id ? jogo.away : jogo.home;
        jogo.winner = vitoriaDoUsuario ? minha.id : rival;
        return;
      }
      // Os outros: o mesmo simulador dos jogos de fundo, com o PRNG do mundo.
      const rand = this.world ? () => this.world.season._rand() : Math.random;
      // `MatchSimulator.js` carrega DEPOIS deste arquivo: no boot (e no check)
      // o global ainda não existe. A moeda pesada pelo rating cobre esse
      // instante sem acoplar a ordem dos <script> a uma regra de jogo.
      if (typeof simulateMatch === "function") {
        const placar = simulateMatch(jogo.home, jogo.away, rand);
        jogo.winner = placar.isDraw
          ? rand() < 0.5
            ? jogo.home
            : jogo.away
          : placar.winnerId;
      } else {
        jogo.winner = rand() < 0.5 ? jogo.home : jogo.away;
      }
    });

    const vencedores = rodada.map((j) => j.winner).filter(Boolean);
    if (vencedores.length <= 1) {
      m.champion = vencedores[0] || null;
      this._premiarMundial(m.champion === minha.id);
      return;
    }
    const proxima = [];
    for (let i = 0; i < vencedores.length; i += 2)
      proxima.push({
        home: vencedores[i],
        away: vencedores[i + 1] || null,
        winner: vencedores[i + 1] ? null : vencedores[i],
      });
    m.rounds.push(proxima);
    m.round += 1;
  }

  /**
   * O usuário caiu: as datas restantes da Copa somem do calendário dele. Sem
   * isto o jogo pediria para ele jogar uma semifinal em que não está — e o
   * painel de dia de jogo ficaria sem adversário.
   */
  _encerrarMundialDoUsuario() {
    this.schedule
      .filter(
        (e) =>
          e.type === "selecao" &&
          !e.played &&
          e.dayOffset > this.currentDayOffset,
      )
      .forEach((e) => (e.played = true));
    this.addNotification(
      `🌍 Eliminado da ${MUNDIAL.NOME}. A campanha da sua seleção acabou aqui.`,
      "news",
    );
  }

  _premiarMundial(euCampeao) {
    if (!euCampeao) {
      this.addNotification(
        `🌍 ${MUNDIAL.NOME} encerrada. Sua seleção não levou o título desta vez.`,
        "news",
      );
      return;
    }
    const minha = this.nationalTeam();
    this.trophies.push({ title: MUNDIAL.NOME, season: this.season });
    this.awards.push({
      title: `Campeão da ${MUNDIAL.NOME}`,
      season: this.season,
      // Sem `?.` aqui o título de campeão do mundo derrubava o registro da
      // partida — e a tela de pós-jogo parava no meio, o que na prática é o
      // jogo travado. Seleção que não resolve não pode custar o troféu.
      club: (minha && minha.label) || null,
    });
    this.coachReputation = Math.min(100, this.coachReputation + 10);
    this.addNotification(
      `🏆🌍 CAMPEÃO DA ${MUNDIAL.NOME.toUpperCase()}! Temporada ${this.season}`,
      "news",
    );
  }

  /** A seleção do usuário. Vem da NACIONALIDADE, não do clube atual: quem sai
   *  do Brasil para o Bayern continua jogando pelo Brasil. */
  nationalTeam() {
    if (typeof nationalTeamOfCountry !== "function") return null;
    // A nacionalidade é decidida na PRIMEIRA vez e congelada no save: derivar
    // do clube toda vez faria o jogador trocar de seleção junto com a
    // transferência, o que é o oposto do que uma seleção é.
    if (!this.nationality) this.nationality = this.currentLeague || "Brasil";
    return nationalTeamOfCountry(this.nationality);
  }

  /** Adversário de uma data FIFA, no mesmo formato de um time de tabela. */
  getSelecaoOpponent(evento) {
    const alvo =
      evento ||
      this.schedule.find(
        (e) => e.dayOffset === this.currentDayOffset && e.type === "selecao",
      );
    if (!alvo) return null;
    // Copa do Mundo: o rival é quem sobrou do outro lado da chave. Sem jogo
    // (eliminado, ou copa encerrada) devolve `null` — e a tela cai no painel
    // de dia livre, com o AVANÇAR DIA.
    let rivalId = alvo.opponentId;
    if (this.ehAnoDeMundial()) {
      const jogo = this.jogoDoMundial();
      const minha = this.nationalTeam();
      if (!jogo || !minha) return null;
      rivalId = jogo.home === minha.id ? jogo.away : jogo.home;
    }
    const dados = NATIONAL_TEAMS[rivalId];
    if (!dados) return null;
    const kit = TEAMS_DB[rivalId] || {};
    const elenco = window.getTeamRoster ? window.getTeamRoster(rivalId) : [];
    const rating = elenco.length
      ? Math.round(elenco.reduce((s, j) => s + j.rating, 0) / elenco.length)
      : 78;
    return {
      name: rivalId,
      label: dados.label,
      rating,
      tier: 5,
      shirtColor: kit.shirt1,
      shirtColor2: kit.shirt2,
    };
  }

  /**
   * Registro de uma data FIFA. Não mexe em tabela nem em artilharia da liga —
   * é jogo de seleção: conta caps, gols e desgaste, e nada mais.
   */
  recordSelecaoMatch(result) {
    this._pesarPartidaNoCorpo(result);
    const gols = (result.matchStats && result.matchStats.goals) || 0;
    this.national.caps += 1;
    this.national.goals += gols;
    this.condition = Math.max(
      0,
      this.condition - CAREER_BASE.FATIGUE_PER_MATCH * 0.8,
    );
    this.addNotification(
      gols > 0
        ? `🌎 ${gols} ${gols === 1 ? "gol" : "gols"} pela Seleção! Já são ${this.national.caps} jogos.`
        : `🌎 Mais um jogo pela Seleção (${this.national.caps} no total).`,
      "news",
    );
    if ((result.matchRating || 0) >= 7.5)
      this.adjustCoachReputation(3, "grande atuação pela seleção");

    // Copa do Mundo: a partida decide a fase. Empate no mata-mata cai no
    // critério do pênalti que o resto do jogo já usa (quem venceu vem por ID).
    if (this.ehAnoDeMundial()) {
      const minha = this.nationalTeam();
      const venci =
        result.playerScore > result.opponentScore ||
        (result.playerScore === result.opponentScore &&
          result.penaltyWinnerId === (minha && minha.id));
      this._avancarMundial(venci);
      if (!venci) this._encerrarMundialDoUsuario();
    }
    this._markFixturePlayed(
      this.schedule.find(
        (e) => e.dayOffset === this.currentDayOffset && e.type === "selecao",
      ),
    );
    this.saveToLocalStorage();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Navegação de calendário
  // ─────────────────────────────────────────────────────────────────────────────
  // ───────────────────────────────────────────────────────────────────────────
  // FIM DE TEMPORADA: prêmio, história, seleção e contrato
  // ───────────────────────────────────────────────────────────────────────────

  // ───────────────────────────────────────────────────────────────────────────
  // DISCIPLINA E LESÃO — o que acontece em campo cobra fora dele
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Súmula da partida. Amarelo acumula na temporada e a cada
   * `DISCIPLINE.YELLOWS_PER_BAN` custa um jogo; vermelho custa
   * `DISCIPLINE.RED_BAN_MATCHES` na hora. O contador zera ao gerar a suspensão
   * — senão o 4º amarelo suspenderia de novo, e o 5º outra vez.
   */
  /**
   * O que a partida cobrou do corpo e da ficha. Ponto único chamado por
   * `recordMatch` e `recordCopaMatch` — toda partida do usuário passa por um
   * dos dois, inclusive a que ele não jogou (é lá que a suspensão é cumprida).
   */
  _pesarPartidaNoCorpo(result) {
    this._cumprirSuspensao(result && result.lineupStatus);
    // Quem não entrou não leva cartão nem se machuca.
    if (!result || result.lineupStatus === "not_related") return;
    this._aplicarDisciplina(result.matchStats);
    this._avaliarLesao(result.matchStats);
  }

  _aplicarDisciplina(stats) {
    if (!stats) return;
    const d = this.discipline;
    const amarelos = stats.cartoesAmarelos || 0;
    const vermelho = !!stats.cartaoVermelho;
    if (!amarelos && !vermelho) return;

    d.yellows += amarelos;
    if (vermelho) {
      d.reds += 1;
      d.suspended += DISCIPLINE.RED_BAN_MATCHES;
      this.addNotification(
        `🟥 Expulso! Você cumpre ${DISCIPLINE.RED_BAN_MATCHES} jogos de suspensão.`,
        "news",
      );
      this.adjustCoachReputation(-8, "expulso em campo");
    }
    while (d.yellows >= DISCIPLINE.YELLOWS_PER_BAN) {
      d.yellows -= DISCIPLINE.YELLOWS_PER_BAN;
      d.suspended += 1;
      this.addNotification(
        `🟨 ${DISCIPLINE.YELLOWS_PER_BAN}º cartão amarelo: você está suspenso do próximo jogo.`,
        "news",
      );
    }
    this.saveToLocalStorage();
  }

  /**
   * Risco de lesão. Sai do que a partida REALMENTE teve — pancada tomada e
   * fôlego no fim — e não de um dado solto: quem joga inteiro, cansado e
   * apanhando, se machuca; quem administra, não. O carrinho sofrido conta
   * dobrado (ver `chamarFalta`).
   */
  _avaliarLesao(stats) {
    if (this.injuryDays > 0) return;
    const pancada = (stats && stats.faltasSofridas) || 0;
    const desgaste = Math.max(0, (DISCIPLINE.FIT_SAFE - this.condition) / 100);
    const risco = Math.min(
      DISCIPLINE.INJURY_RISK_MAX,
      pancada * DISCIPLINE.INJURY_PER_FOUL + desgaste * DISCIPLINE.INJURY_PER_FATIGUE,
    );
    if (Math.random() >= risco) return;

    this.injuryDays =
      DISCIPLINE.INJURY_DAYS_MIN +
      Math.floor(
        Math.random() *
          (DISCIPLINE.INJURY_DAYS_MAX - DISCIPLINE.INJURY_DAYS_MIN + 1),
      );
    this.condition = Math.min(this.condition, 45);
    this.addNotification(
      `🩹 Você se machucou na partida: ${this.injuryDays} dias fora.`,
      "news",
    );
    this.saveToLocalStorage();
  }

  /**
   * Um jogo de suspensão é cumprido pela partida PERDIDA, não pela jogada.
   * Chamado no registro do jogo, que é o único ponto por onde toda partida do
   * usuário passa — inclusive a que ele não jogou.
   */
  _cumprirSuspensao(lineupStatus) {
    if (!this.discipline || this.discipline.suspended <= 0) return;
    if (lineupStatus !== "not_related") return;
    this.discipline.suspended -= 1;
    if (this.discipline.suspended === 0)
      this.addNotification("✅ Suspensão cumprida: você está liberado.", "news");
  }

  /** Nota geral do usuário: a média dos três atributos. Régua de tudo aqui. */
  overall() {
    return Math.round((this.speed + this.kickPower + this.stamina) / 3);
  }

  /**
   * Fecha o ano do USUÁRIO. Ordem importa: os prêmios leem as estatísticas da
   * temporada, a história guarda o que os prêmios decidiram, e só então o
   * relógio anda (idade e contrato).
   */
  _fecharTemporada() {
    if (!this.playerStats) return;
    const premios = this._premiosDaTemporada();
    const selecao = this._janelaDeSelecao();

    // Posição final na liga, para a linha do histórico ter contexto.
    const tabela = (this.leagueTable || [])
      .slice()
      .sort((a, b) => (b.points || 0) - (a.points || 0));
    const posicao = tabela.findIndex((t) => t.isPlayerTeam) + 1;

    this.history.push({
      season: this.season,
      age: this.age,
      club: this.currentTeam ? this.currentTeam.name : null,
      league: this.playerLeagueName ? this.playerLeagueName() : null,
      position: posicao > 0 ? posicao : null,
      matches: this.playerStats.matches || 0,
      goals: this.playerStats.goals || 0,
      assists: this.playerStats.assists || 0,
      overall: this.overall(),
      // Só os títulos DESTE ano: `trophies` é acumulado da carreira inteira.
      trophies: (this.trophies || [])
        .filter((t) => t.season === this.season)
        .map((t) => t.title),
      awards: premios,
      national: selecao,
    });

    this._virarContrato();
    this.age += 1;
  }

  /**
   * Prêmios individuais. Saem dos números que o mundo JÁ grava (`topScorers` e
   * `leagueTable`) — nada de placar paralelo. Devolve os títulos do ano e
   * empilha em `awards`, que é a vitrine da carreira.
   */
  _premiosDaTemporada() {
    const ganhos = [];
    const lista = this.topScorers || [];
    const golsDoUsuario = (this.playerStats && this.playerStats.goals) || 0;

    // Artilheiro: primeiro da lista E com gol no ano (liderar com 0 não é
    // artilharia, é tabela vazia).
    if (lista.length && lista[0] && lista[0].isPlayer && golsDoUsuario > 0)
      ganhos.push("Artilheiro do campeonato");
    // Craque do campeonato: campeão da liga e entre os 3 primeiros da lista.
    const campeao = (this.leagueTable || [])
      .slice()
      .sort((a, b) => (b.points || 0) - (a.points || 0))[0];
    const top3 = lista.slice(0, 3).some((p) => p && p.isPlayer);
    if (campeao && campeao.isPlayerTeam && top3)
      ganhos.push("Craque do campeonato");
    // Revelação: só até os 21, e uma vez na vida.
    if (
      this.age <= 21 &&
      golsDoUsuario >= 5 &&
      !this.awards.some((a) => a.title === "Revelação do ano")
    )
      ganhos.push("Revelação do ano");

    ganhos.forEach((title) => {
      this.awards.push({ title, season: this.season, club: this.currentTeam?.name });
      this.addNotification(`🏅 ${title} — temporada ${this.season}!`, "news");
    });
    return ganhos;
  }

  /**
   * Seleção nacional. As partidas são SIMULADAS, não jogadas: um terceiro tipo
   * de compromisso no calendário obrigaria a mexer no literal `type`, que as
   * cenas comparam — e o retorno seria pequeno perto do risco. Aqui a
   * convocação vale como reconhecimento: jogos, gols e reputação.
   */
  _janelaDeSelecao() {
    const nota = this.overall();
    const convocado = nota >= CAREER_BASE.NATIONAL_CALL_RATING;
    this.national.called = convocado;
    if (!convocado) return null;

    // Só a parte NÃO jogada da janela: as datas FIFA que entraram no calendário
    // já foram contadas em `recordSelecaoMatch`. Sem este desconto o jogador
    // ganharia os amistosos duas vezes.
    const jogos = Math.max(
      0,
      CAREER_BASE.NATIONAL_MATCHES_PER_SEASON - CAREER_BASE.NATIONAL_WINDOWS,
    );
    if (jogos === 0) {
      this.national.seasons += 1;
      this.coachReputation = Math.min(100, this.coachReputation + 3);
      return { matches: 0, goals: 0 };
    }
    // Gols proporcionais ao que ele fez no clube, com teto: quem não faz gol no
    // clube não vira artilheiro de seleção por sorteio.
    const ritmo =
      (this.playerStats.goals || 0) / Math.max(this.playerStats.matches || 1, 1);
    const gols = Math.min(jogos, Math.round(ritmo * jogos));

    this.national.caps += jogos;
    this.national.goals += gols;
    this.national.seasons += 1;
    this.coachReputation = Math.min(100, this.coachReputation + 3);

    this.addNotification(
      this.national.seasons === 1
        ? `📣 Você foi convocado para a Seleção pela primeira vez!`
        : `📣 Convocado de novo: ${jogos} jogos e ${gols} gols pela Seleção.`,
      "news",
    );
    return { matches: jogos, goals: gols };
  }

  /**
   * Anda um ano no contrato. No ÚLTIMO ano o mercado é avisado — é isso que
   * transforma proposta em decisão. Contrato vencido não expulsa ninguém do
   * clube: ele vira pressão, e quem decide é o jogador no mercado.
   */
  _virarContrato() {
    this.contractYears = Math.max(0, (this.contractYears || 0) - 1);
    if (this.contractYears === 1) {
      this.addNotification(
        `📄 Seu contrato com o ${CareerMode.clubLabel(this.currentTeam?.name)} termina no fim da próxima temporada.`,
        "news",
      );
    } else if (this.contractYears === 0) {
      this.transferWindowOpen = true;
      this.addNotification(
        `📄 Contrato encerrado. Você está livre para negociar — o mercado está aberto.`,
        "news",
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // O MUNDO ENVELHECE (ver js/systems/Elenco.js)
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * Vira o ano para os 504 jogadores do mundo e transforma o resultado em
   * notícia. Só as aposentadorias e revelações da LIGA DO USUÁRIO viram texto:
   * o mundo inteiro produziria dezenas de linhas que ninguém lê.
   */
  _envelhecerMundo() {
    if (typeof Elenco === "undefined" || !Elenco.mundo) return;

    const gols = {};
    Object.keys(this.globalPlayerStats || {}).forEach((id) => {
      gols[id] = this.globalPlayerStats[id].goals || 0;
    });

    const { aposentados, revelacoes } = Elenco.virarTemporada(gols);
    const meusClubes = new Set(this.playerLeagueClubs().map((t) => t.name));

    aposentados
      .filter((a) => meusClubes.has(a.clube))
      .slice(0, 3)
      .forEach((a) =>
        this.addNotification(
          `${a.nome} (${a.clube}) pendurou as chuteiras aos ${a.idade} anos.`,
          "news",
        ),
      );
    revelacoes
      .filter((r) => meusClubes.has(r.clube))
      .slice(0, 2)
      .forEach((r) =>
        this.addNotification(
          `${r.clube} promove ${r.nome}, ${r.idade} anos, da base.`,
          "news",
        ),
      );
  }

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
    // Jogo do usuário HOJE que ele não jogou no controle: é simulado COM ele em
    // campo, exatamente como na simulação da temporada. Antes o dia passava e a
    // partida era resolvida sem ele — zero gol, zero assistência, zero XP, como
    // se ele não estivesse no elenco. Tem de vir ANTES do `_simulateWorldDay`,
    // que é quem marcaria o jogo como resolvido sem dar nada a ele.
    const jogoDeHoje = this.schedule.find(
      (e) =>
        e.dayOffset === this.currentDayOffset &&
        !e.played &&
        e.type !== "selecao",
    );
    if (jogoDeHoje) this._resolverPartidaDoUsuario(jogoDeHoje);

    // O mundo joga a rodada do dia que está terminando, antes do relógio virar.
    this._simulateWorldDay();
    this.currentDayOffset++;
    this.generateNews(); // Gera notícia ao avançar o dia
    // Recuperação da lesão anda no RELÓGIO, não no calendário de jogos: é a
    // única coisa da carreira que passa mesmo quando não há partida nenhuma.
    if (this.injuryDays > 0) {
      this.injuryDays--;
      if (this.injuryDays === 0)
        this.addNotification("🩹 Recuperado! Liberado para treinar e jogar.", "news");
    }
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
    // Antes/depois: o relatório sai da diferença, e não de contadores paralelos
    // que precisariam ser mantidos em sincronia com o registro da partida.
    const antes = {
      jogos: this.playerStats.matches,
      gols: this.playerStats.goals,
      assistencias: this.playerStats.assists,
      xp: this.xp,
      nivel: this.level,
    };

    while (this.currentDayOffset <= targetDayOffset) {
      const event = this.schedule.find(
        (e) => e.dayOffset === this.currentDayOffset,
      );
      // SIMULAR a temporada é jogá-la, não faltar a ela: o usuário entra em
      // campo, o placar sai do mesmo simulador dos jogos de fundo e a
      // participação dele é sorteada SOBRE esse placar. Gol, assistência, XP,
      // nível, condição, reputação, artilharia, cartão e lesão entram pelo
      // mesmo caminho de uma partida jogada — ver `_resolverPartidaDoUsuario`.
      //
      // A multa por falta continua existindo, mas agora só onde ela faz
      // sentido: quem PULA o dia no `advanceDay` tendo jogo para jogar. Data
      // FIFA nunca cobra multa de clube.
      if (event && !event.played && event.type !== "selecao") {
        this._resolverPartidaDoUsuario(event);
      }
      // `matchDay` anda no `_markFixturePlayed`, dentro do `_simulateWorldDay`
      // logo abaixo — um caminho só para jogo jogado e jogo pulado.
      // Todo dia da simulação, com ou sem jogo do usuário: o resto do mundo
      // tem confronto marcado em dias que o schedule dele nem lista.
      this._simulateWorldDay();
      this.currentDayOffset++;
      // Dia SEM jogo numa temporada simulada é dia de descanso: o jogador
      // automático não clica em "descansar", e com só +3 ele terminava o ano
      // com a condição no chão — o que joga `getLineupStatus` para
      // `not_related` e faz um atacante 82 passar a temporada inteira fora.
      // Com jogo no dia, o cansaço da partida já foi cobrado no registro.
      const teveJogo = !!(event && event.type !== "selecao");
      this.condition = Math.min(
        100,
        this.condition + (teveJogo ? 3 : CAREER_BASE.SIM_REST_PER_DAY),
      );
      // A LESÃO TAMBÉM PASSA AQUI. Este laço não chama `advanceDay`, e sem
      // esta linha quem se machucava no meio de uma temporada simulada não
      // curava nunca: ficava `not_related` até o fim do ano, sem gol, com a
      // reputação escorrendo -1 por partida. Um atacante 85 terminava o ano
      // com zero gols e reputação zero — e nada no console dizia por quê.
      if (this.injuryDays > 0) this.injuryDays--;
      this._checkSalary();

      // Checar fim de temporada durante a simulação
      if (this.isSeasonComplete()) {
        this.endSeason();
        break;
      }
    }

    // Relatório do que a simulação rendeu A ELE. Antes daqui saía um aviso de
    // ABSÊNCIA — o jogo tratava simular a temporada como faltar a ela.
    const jogos = this.playerStats.matches - antes.jogos;
    if (jogos > 0) {
      const gols = this.playerStats.goals - antes.gols;
      const assistencias = this.playerStats.assists - antes.assistencias;
      const niveis = this.level - antes.nivel;
      this.addNotification(
        `📋 ${jogos} ${jogos === 1 ? "partida simulada" : "partidas simuladas"}: ` +
          `${gols} ${gols === 1 ? "gol" : "gols"}, ${assistencias} ${assistencias === 1 ? "assistência" : "assistências"}` +
          `, +${this.xp - antes.xp} XP` +
          (niveis > 0 ? ` e ${niveis} ${niveis === 1 ? "nível" : "níveis"}!` : "."),
        "news",
      );
    }

    this.saveToLocalStorage();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEMPORADA SIMULADA — com o usuário DENTRO da partida
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Quanto o usuário produziu numa partida que ele não jogou no controle.
   *
   * O modelo é distribuir os gols que o TIME fez: para cada gol, sorteia-se se
   * foi ele, se ele deu a assistência, ou se foi coisa dos companheiros. Isso
   * amarra o número à realidade da partida — com o placar 1x0 ele não tem como
   * marcar três, que é o defeito de qualquer fórmula que sorteie gols do nada.
   *
   * O sorteio usa o PRNG do mundo: a mesma `worldSeed` reproduz a mesma
   * temporada, inclusive a artilharia.
   */
  _desempenhoSimulado(golsDoTime, lineupStatus) {
    const rand = this.world ? () => this.world.season._rand() : Math.random;
    const pos = String(this.position || "MEIA").toUpperCase();
    // Quem joga na frente finaliza mais. É a única coisa que a posição decide.
    const FATIA = { ATACANTE: 0.45, PIVOT: 0.42, WING: 0.3, MEIA: 0.28, FIXO: 0.12 };
    const base = FATIA[pos] !== undefined ? FATIA[pos] : 0.28;
    // A nota move a fatia: um 85 finaliza mais que um 65 no mesmo time.
    const peso = base * (1 + (this.overall() - 70) / 120);
    // Reserva entra no 2º tempo: metade do jogo, metade das chances.
    const corte = lineupStatus === "bench" ? 0.5 : 1;

    let gols = 0;
    let assistencias = 0;
    for (let i = 0; i < golsDoTime; i++) {
      if (rand() < peso * corte) gols++;
      else if (rand() < 0.28 * corte) assistencias++;
    }
    return { gols, assistencias, rand };
  }

  /**
   * Resolve uma partida do usuário SEM ele no controle, mas com ele em campo:
   * placar pelo mesmo simulador dos jogos de fundo, e a participação dele
   * sorteada sobre esse placar. O resultado entra pelo MESMO caminho de uma
   * partida jogada (`recordMatch`/`recordCopaMatch`), então gols, assistências,
   * XP, nível, condição, reputação, artilharia, cartão e lesão saem de graça —
   * nada disso é reimplementado aqui.
   */
  _resolverPartidaDoUsuario(entrada) {
    if (!entrada || entrada.played) return false;
    const meuClube = this.currentTeam && this.currentTeam.name;
    const rival = entrada.opponentId;
    if (!meuClube || !rival) return false;

    const lineup = this.getLineupStatus
      ? this.getLineupStatus()
      : { code: "starter" };

    const rand = this.world ? () => this.world.season._rand() : Math.random;
    const placar =
      typeof simulateMatch === "function"
        ? simulateMatch(
            entrada.isHome ? meuClube : rival,
            entrada.isHome ? rival : meuClube,
            rand,
          )
        : { homeScore: 0, awayScore: 0 };
    const meus = entrada.isHome ? placar.homeScore : placar.awayScore;
    const deles = entrada.isHome ? placar.awayScore : placar.homeScore;

    // Suspenso ou lesionado não entra: o time joga sem ele e ele não pontua.
    const jogou = lineup.code !== "not_related";
    const { gols, assistencias } = jogou
      ? this._desempenhoSimulado(meus, lineup.code)
      : { gols: 0, assistencias: 0 };

    let nota = 6.0;
    if (jogou) {
      // A base acompanha a QUALIDADE do jogador. Com 6.0 fixo, metade das
      // partidas caía abaixo de 6 e a reputação com o técnico ia a zero em
      // qualquer temporada simulada — o atacante 82 terminava o ano no banco
      // por ter jogado bem o ano inteiro.
      // Piso de 5.7: começando em 56 de overall, a base pura daria 5.26 e
      // QUASE toda partida cairia abaixo de 5.5 — o novato perdia reputação
      // por existir e vivia no banco sem ter feito nada errado. O teto evita o
      // contrário: nota alta de graça só porque o atributo é alto.
      const base = Math.max(5.7, Math.min(7.2, 5.9 + (this.overall() - 70) / 22));
      nota =
        base +
        gols * 0.9 +
        assistencias * 0.5 +
        (meus > deles ? 0.5 : meus < deles ? -0.35 : 0) +
        (rand() - 0.5) * 0.6;
      nota = Math.max(3, Math.min(10, Math.round(nota * 10) / 10));
    }

    const result = {
      playerScore: meus,
      opponentScore: deles,
      opponent: rival,
      matchRating: jogou ? nota : 5.2,
      lineupStatus: lineup.code,
      autoSimulated: true,
      matchStats: {
        goals: gols,
        assists: assistencias,
        passes: 0,
        shots: gols + (rand() < 0.5 ? 1 : 0),
        // A partida simulada também machuca e também dá cartão: sem isto,
        // simular o ano seria o jeito de nunca levar suspensão nem lesão.
        cartoesAmarelos: jogou && rand() < 0.12 ? 1 : 0,
        cartaoVermelho: jogou && rand() < 0.015,
        faltasSofridas: jogou ? Math.floor(rand() * 5) : 0,
      },
    };

    if (entrada.type === "copa") this.recordCopaMatch(result);
    else this.recordMatch(result);
    return true;
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
    // Lesionado descansa, não treina — é o mesmo critério do fôlego no chão.
    if (this.injuryDays > 0)
      return {
        success: false,
        msg: `Lesionado: ${this.injuryDays} dias fora. Só descanso.`,
      };
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
    if (this.injuryDays > 0)
      return {
        success: false,
        msg: `Lesionado: ${this.injuryDays} dias fora. Só descanso.`,
      };
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
  /**
   * Quanto XP custa o PRÓXIMO nível. Porta única — a barra de XP de quatro
   * telas lê daqui, senão elas continuariam desenhando `/100` para sempre.
   */
  xpParaSubir(nivel) {
    const n = nivel || this.level || 1;
    return CAREER_BASE.XP_BASE + (n - 1) * CAREER_BASE.XP_POR_NIVEL;
  }

  checkLevelUp() {
    while (this.xp >= this.xpParaSubir()) {
      this.xp -= this.xpParaSubir();
      this.level++;
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
    // Suspensão e lesão vêm ANTES de qualquer conta de forma: por melhor que
    // esteja, quem está suspenso ou machucado não entra. Entram por aqui, e
    // não numa checagem nova espalhada pelas telas, porque esta função já é a
    // única porta que decide se o jogador joga.
    if (this.discipline && this.discipline.suspended > 0) {
      const jogos = this.discipline.suspended;
      return {
        code: "not_related",
        label: "Suspenso",
        description: `Cumprindo suspensão: ${jogos} ${jogos === 1 ? "jogo" : "jogos"}. A partida é simulada.`,
        reason: "suspended",
      };
    }
    if (this.injuryDays > 0) {
      return {
        code: "not_related",
        label: "Lesionado",
        description: `No departamento médico por mais ${this.injuryDays} ${this.injuryDays === 1 ? "dia" : "dias"}. A partida é simulada.`,
        reason: "injured",
      };
    }

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

    this._pesarPartidaNoCorpo(result);

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
    this._pesarPartidaNoCorpo(result);
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
    // Data FIFA que o dia passou sem ele jogar: ninguém mais a resolve — ela
    // não existe no calendário do MUNDO, que é o que este laço percorre. Sem
    // isto ela ficava "não jogada" para sempre e o `simulateUntil` cobrava
    // multa e reputação por falta a um jogo de SELEÇÃO, que não é do clube.
    const fifaDeHoje = this.schedule.find(
      (e) => e.dayOffset === dayOffset && e.type === "selecao" && !e.played,
    );
    if (fifaDeHoje) this._markFixturePlayed(fifaDeHoje);

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
    // ANTES de qualquer reset: prêmios, história, seleção, contrato e
    // aniversário do usuário leem os números da temporada que acabou, e as
    // linhas abaixo zeram justamente esses números.
    //
    // E o fechamento NÃO pode impedir a virada. Ele é contabilidade — prêmio,
    // histórico, convocação, contrato; se qualquer uma dessas contas falhar
    // (save antigo com campo faltando, seleção que não resolve), o ano tem de
    // virar do mesmo jeito. Sem isto, um erro aqui deixa o jogador preso na
    // temporada para sempre, com o botão respondendo nada.
    try {
      this._fecharTemporada();
    } catch (erro) {
      console.error("Fechamento da temporada falhou; virando o ano assim mesmo:", erro);
    }

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

    // O MUNDO ENVELHECE aqui, e só aqui. Tem de ser antes de recriar tabela e
    // estatísticas: as duas leem rating de elenco, e leriam o elenco do ano
    // passado. Quem fez gol na temporada evolui mais — é o único acoplamento
    // entre o que foi jogado e o que o mundo vira.
    try {
      this._envelhecerMundo();
    } catch (erro) {
      console.error("Envelhecimento do mundo falhou; a temporada segue:", erro);
    }

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
      // Duração do vínculo. Clube grande amarra por mais tempo; renovação
      // devolve o prazo cheio. Campo PLANO, como todo o resto da proposta.
      contractYears: isRenewal
        ? CAREER_BASE.CONTRACT_YEARS
        : (club.tier || 3) >= 4
          ? CAREER_BASE.CONTRACT_YEARS + 1
          : CAREER_BASE.CONTRACT_YEARS,
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
    // Assinar zera o relógio do contrato — inclusive na renovação, que é
    // exatamente o que o jogador está comprando ao aceitar.
    this.contractYears = offer.contractYears || CAREER_BASE.CONTRACT_YEARS;
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
      tactic: this.tactic,
      age: this.age,
      contractYears: this.contractYears,
      discipline: this.discipline,
      injuryDays: this.injuryDays,
      nationality: this.nationality,
      mundial: this.mundial,
      national: this.national,
      awards: this.awards,
      history: this.history,
      // O mundo vivo: a `worldSeed` regenera calendário e chaveamento, mas NÃO
      // regenera idade e rating já envelhecidos — isso é estado, não derivação.
      _elencoMundo:
        typeof Elenco !== "undefined" && Elenco.mundo
          ? Elenco.paraSalvar()
          : this._elencoMundo,
      playerMoney: this.playerMoney,
      monthlySalary: this.monthlySalary,
      lastSalaryDay: this.lastSalaryDay,
      notifications: this.notifications,
      newsHistory: this.newsHistory || [],
      matchObjectives: this.matchObjectives || [],
      completedObjectivesCount: this.completedObjectivesCount || 0,
      transferWindowOpen: this.transferWindowOpen,
    };
    localStorage.setItem(CareerMode.chaveDoSlot(), JSON.stringify(data));
  }

  loadFromLocalStorage() {
    const raw = localStorage.getItem(CareerMode.chaveDoSlot());
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
      // Tática de save antigo (ou de uma tática que deixou de existir) não vale
      // nada: `shapeOf` cairia no 3-1 e a tela mostraria outra coisa. Filtra no
      // load, como manda a regra do estado persistido.
      if (!Object.values(TACTICS).includes(this.tactic))
        this.tactic = TACTICS.T3_1;

      // Carreira, contrato e seleção: save antigo não tem nada disso, e o
      // formato antigo não pode virar `undefined` no meio de uma conta.
      if (!Number.isFinite(this.age)) this.age = CAREER_BASE.START_AGE;
      if (!Number.isFinite(this.contractYears))
        this.contractYears = CAREER_BASE.CONTRACT_YEARS;
      if (!this.national || typeof this.national !== "object")
        this.national = { called: false, caps: 0, goals: 0, seasons: 0 };
      if (!this.discipline || typeof this.discipline !== "object")
        this.discipline = { yellows: 0, reds: 0, suspended: 0 };
      ["yellows", "reds", "suspended"].forEach((k) => {
        if (!Number.isFinite(this.discipline[k])) this.discipline[k] = 0;
      });
      if (!Number.isFinite(this.injuryDays)) this.injuryDays = 0;
      // Save antigo não tem nacionalidade, e um país sem seleção jogável aqui
      // deixaria `nationalTeam()` nulo em todo lugar que o usa.
      if (
        typeof this.nationality !== "string" ||
        (typeof nationalTeamOfCountry === "function" &&
          !nationalTeamOfCountry(this.nationality))
      ) {
        this.nationality =
          typeof nationalTeamOfCountry === "function" &&
          nationalTeamOfCountry(this.currentLeague)
            ? this.currentLeague
            : "Brasil";
      }
      // Chave de Copa de OUTRA temporada é lixo: a do ano corrente se remonta
      // sozinha na primeira pergunta (`mundialAtual`).
      if (
        !this.mundial ||
        this.mundial.season !== this.season ||
        !Array.isArray(this.mundial.rounds)
      )
        this.mundial = null;
      ["caps", "goals", "seasons"].forEach((k) => {
        if (!Number.isFinite(this.national[k])) this.national[k] = 0;
      });
      this.awards = (this.awards || []).filter(
        (a) => a && typeof a.title === "string" && Number.isFinite(a.season),
      );
      this.history = (this.history || []).filter(
        (h) => h && Number.isFinite(h.season) && Number.isFinite(h.goals),
      );
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

// =============================================================================
// Check: o fim de temporada do usuário. São quatro relógios que só andam uma
// vez por ano — errar aqui não aparece no console, aparece três temporadas
// depois como "nunca ganhei nada" ou "meu contrato nunca acaba".
// =============================================================================
console.assert(
  (() => {
    if (typeof CAREER_BASE === "undefined") return true;

    const fabricar = (mudanca) => {
      const c = Object.create(CareerMode.prototype);
      Object.assign(
        c,
        {
          season: 3,
          age: 24,
          contractYears: 2,
          speed: 80,
          kickPower: 80,
          stamina: 80,
          coachReputation: 50,
          currentTeam: { name: "Flamengo" },
          currentLeague: "Brasil",
          leagueTable: [
            { name: "Flamengo", points: 40, isPlayerTeam: true },
            { name: "Palmeiras", points: 30 },
          ],
          topScorers: [{ name: "Eu", goals: 12, isPlayer: true }],
          playerStats: { matches: 30, goals: 12, assists: 5 },
          trophies: [
            { title: "Brasileirão", season: 3 },
            { title: "Copa antiga", season: 1 },
          ],
          awards: [],
          history: [],
          national: { called: false, caps: 0, goals: 0, seasons: 0 },
          transferWindowOpen: false,
          notifications: [],
          newsHistory: [],
          currentDayOffset: 0,
        },
        mudanca || {},
      );
      c.playerLeagueName = () => "Brasileirão";
      return c;
    };

    // Ano cheio: artilheiro + craque, história gravada, seleção e contrato.
    const c = fabricar();
    c._fecharTemporada();
    const linha = c.history[0];

    // Ano vazio: sem gol, sem prêmio — e liderar a artilharia com 0 não conta.
    const seco = fabricar({
      playerStats: { matches: 30, goals: 0, assists: 0 },
      topScorers: [{ name: "Eu", goals: 0, isPlayer: true }],
      leagueTable: [
        { name: "Flamengo", points: 10, isPlayerTeam: true },
        { name: "Palmeiras", points: 40 },
      ],
    });
    seco._fecharTemporada();

    // Reserva sem nível para a Seleção não é convocado.
    const fraco = fabricar({ speed: 60, kickPower: 60, stamina: 60 });
    fraco._fecharTemporada();

    // Último ano de contrato: vira 0 e ABRE o mercado.
    const acabando = fabricar({ contractYears: 1 });
    acabando._fecharTemporada();

    return (
      // Prêmios do ano cheio, e nada no ano seco.
      c.awards.map((a) => a.title).includes("Artilheiro do campeonato") &&
      c.awards.map((a) => a.title).includes("Craque do campeonato") &&
      seco.awards.length === 0 &&
      // História: uma linha por temporada, com os títulos DAQUELE ano só.
      c.history.length === 1 &&
      linha.season === 3 &&
      linha.goals === 12 &&
      linha.position === 1 &&
      linha.trophies.length === 1 &&
      linha.trophies[0] === "Brasileirão" &&
      // Seleção: convocado com nota, ignorado sem ela. No fim do ano entram
      // apenas os amistosos NÃO jogados — as datas FIFA do calendário já
      // contaram em `recordSelecaoMatch`, e contá-las de novo dobraria os caps.
      c.national.caps ===
        CAREER_BASE.NATIONAL_MATCHES_PER_SEASON - CAREER_BASE.NATIONAL_WINDOWS &&
      c.national.seasons === 1 &&
      c.national.goals >= 0 &&
      fraco.national.caps === 0 &&
      fraco.national.called === false &&
      // Relógios: contrato desce, idade sobe, e o fim do vínculo abre a janela.
      c.contractYears === 1 &&
      c.age === 25 &&
      acabando.contractYears === 0 &&
      acabando.transferWindowOpen === true
    );
  })(),
  "CareerMode: fim de temporada fora do lugar (prêmio, história, seleção ou contrato)",
);

// =============================================================================
// Check: UMA atividade por dia. A trava é simples, mas quem a lê são três
// funções e duas telas — bastou um `career.train()` solto antes do handler para
// o jogador ver "já treinou hoje" no PRIMEIRO treino do dia, com o XP creditado
// e a tela sem atualizar. O erro não aparece no console: aparece como mentira.
// =============================================================================
console.assert(
  (() => {
    const atleta = () => {
      const c = Object.create(CareerMode.prototype);
      Object.assign(c, {
        currentDayOffset: 0,
        lastActivityDay: -1,
        condition: 100,
        xp: 0,
        level: 1,
        nextLevelXP: 1000,
        coachReputation: 50,
        notifications: [],
        newsHistory: [],
      });
      c.checkLevelUp = () => {};
      c.adjustCoachReputation = () => {};
      c.saveToLocalStorage = () => {};
      return c;
    };

    const c = atleta();
    const primeiro = c.train();
    const segundo = c.train();
    const descansoNoMesmoDia = c.rest();
    c.currentDayOffset++;
    const amanha = c.train();

    // Descanso continua valendo com o fôlego no chão — é justamente para isso.
    const exausto = atleta();
    exausto.condition = 10;
    const treinoExausto = exausto.train();
    const descansoExausto = exausto.rest();

    // O mini-game passa pela MESMA trava.
    const c2 = atleta();
    c2.train();
    const miniDepois = c2.trainWithBonus(80);

    return (
      primeiro.success === true &&
      segundo.success === false &&
      descansoNoMesmoDia.success === false &&
      amanha.success === true &&
      treinoExausto.success === false &&
      descansoExausto.success === true &&
      miniDepois.success === false
    );
  })(),
  "CareerMode: a trava de uma atividade por dia saiu do lugar",
);

// =============================================================================
// Check: disciplina e lesão. O elo entre a partida e a temporada — errar aqui
// não aparece no console, aparece como "levei vermelho e joguei no dia
// seguinte" ou como uma suspensão que nunca acaba.
// =============================================================================
console.assert(
  (() => {
    if (typeof DISCIPLINE === "undefined") return true;
    const atleta = (mud) => {
      const c = Object.create(CareerMode.prototype);
      Object.assign(
        c,
        {
          condition: 100,
          coachReputation: 80,
          currentDayOffset: 5,
          lastActivityDay: -1,
          injuryDays: 0,
          discipline: { yellows: 0, reds: 0, suspended: 0 },
          notifications: [],
          newsHistory: [],
          xp: 0,
        },
        mud || {},
      );
      c.saveToLocalStorage = () => {};
      c.adjustCoachReputation = () => {};
      c.checkLevelUp = () => {};
      return c;
    };
    const sumula = (a, v, f) => ({
      cartoesAmarelos: a,
      cartaoVermelho: !!v,
      faltasSofridas: f || 0,
    });

    // Amarelo acumula e o 3º suspende, zerando o contador (senão o 4º
    // suspenderia de novo, e o 5º outra vez).
    const c = atleta();
    c._aplicarDisciplina(sumula(2, false));
    const antesDoTerceiro = { ...c.discipline };
    c._aplicarDisciplina(sumula(1, false));
    const depoisDoTerceiro = { ...c.discipline };

    // Seis de uma vez valem DUAS suspensões, não uma.
    const seis = atleta();
    seis._aplicarDisciplina(sumula(6, false));

    // Vermelho suspende na hora.
    const expulso = atleta();
    expulso._aplicarDisciplina(sumula(0, true));

    // Suspenso e lesionado não entram, e a porta é `getLineupStatus`.
    const susp = atleta({ discipline: { yellows: 0, reds: 0, suspended: 1 } });
    const machucado = atleta({ injuryDays: 7 });
    const inteiro = atleta();

    // A suspensão é cumprida pela partida PERDIDA, não por uma jogada.
    const cumprindo = atleta({ discipline: { yellows: 0, reds: 0, suspended: 2 } });
    cumprindo._pesarPartidaNoCorpo({ lineupStatus: "not_related", matchStats: sumula(3, true) });
    const aposFalta = { ...cumprindo.discipline };

    // Lesionado descansa, não treina.
    const semTreino = machucado.train();
    const comDescanso = machucado.rest();

    // Risco de lesão: partida tranquila não machuca ninguém.
    const tranquilo = atleta();
    tranquilo._avaliarLesao(sumula(0, false, 0));

    return (
      antesDoTerceiro.yellows === 2 &&
      antesDoTerceiro.suspended === 0 &&
      depoisDoTerceiro.yellows === 0 &&
      depoisDoTerceiro.suspended === 1 &&
      seis.discipline.suspended === 2 &&
      expulso.discipline.suspended === DISCIPLINE.RED_BAN_MATCHES &&
      susp.getLineupStatus().reason === "suspended" &&
      susp.getLineupStatus().code === "not_related" &&
      machucado.getLineupStatus().reason === "injured" &&
      inteiro.getLineupStatus().code === "starter" &&
      // Quem não entrou não leva cartão da partida que não jogou, e a
      // suspensão anda um jogo.
      aposFalta.suspended === 1 &&
      aposFalta.yellows === 0 &&
      semTreino.success === false &&
      comDescanso.success === true &&
      tranquilo.injuryDays === 0
    );
  })(),
  "CareerMode: disciplina ou lesão fora do lugar (suspensão, cartão ou departamento médico)",
);

// =============================================================================
// Check: a DATA FIFA. `type: "selecao"` é o terceiro literal estrutural do
// schedule, e a regra que importa é uma só — ela nunca pode encostar num jogo
// de clube. Uma data FIFA em cima da final da copa não dá erro: dá um dia com
// dois jogos e um deles some.
// =============================================================================
console.assert(
  (() => {
    if (typeof NATIONAL_TEAMS === "undefined" || typeof CAREER_BASE === "undefined")
      return true;

    const c = Object.create(CareerMode.prototype);
    c.nationality = "Brasil";
    c.currentLeague = "Brasil";
    c.national = { called: true, caps: 0, goals: 0, seasons: 0 };
    // Calendário de clube denso, para a busca por dia livre ser exercitada.
    c.schedule = [];
    // Temporada de 220 dias, como uma de verdade: é ela que define a régua das
    // datas FIFA, e foi o 320 chutado que punha a última fora do ano.
    const fimDoAno = 220;
    c.lastFixtureDay = () => fimDoAno;
    for (let d = 3; d < fimDoAno; d += 7)
      c.schedule.push({ dayOffset: d, type: "brasileirao", played: false });
    const diasDeClube = c.schedule.map((e) => e.dayOffset);

    c._agendarSelecao([]);
    const datas = c.schedule.filter((e) => e.type === "selecao");

    // Nenhuma data FIFA a menos de um dia de jogo de clube.
    const encosta = datas.some((f) =>
      diasDeClube.some((d) => Math.abs(d - f.dayOffset) <= 1),
    );
    // Ordenado por dia: a tela lê o schedule na ordem.
    const ordenado = c.schedule.every(
      (e, i, a) => i === 0 || a[i - 1].dayOffset <= e.dayOffset,
    );
    // Nunca joga contra a própria seleção.
    const contraSiMesmo = datas.some((f) => f.opponentId === "selecao_brasil");

    // Quem NÃO foi convocado não recebe data nenhuma.
    const semConvocacao = Object.create(CareerMode.prototype);
    semConvocacao.nationality = "Brasil";
    semConvocacao.national = { called: false };
    semConvocacao.schedule = [];
    semConvocacao.lastFixtureDay = () => fimDoAno;
    semConvocacao._agendarSelecao([]);

    // O adversário sai no formato que as cenas consomem (nome, cor, rating).
    const adv = c.getSelecaoOpponent(datas[0]);

    return (
      datas.length === CAREER_BASE.NATIONAL_WINDOWS &&
      // NENHUMA data depois do fim da temporada: compromisso que nunca chega
      // trava o botão de simular o resto e mente sobre o "próximo jogo".
      datas.every((f) => f.dayOffset < fimDoAno) &&
      !encosta &&
      ordenado &&
      !contraSiMesmo &&
      datas.every((f) => f.matchType === "selecao" && f.played === false) &&
      semConvocacao.schedule.length === 0 &&
      !!adv &&
      typeof adv.label === "string" &&
      adv.label !== adv.name && // rótulo de exibição, não o ID
      Number.isFinite(adv.rating)
    );
  })(),
  "CareerMode: data FIFA fora do lugar (colidindo com jogo de clube ou sem adversário)",
);

// =============================================================================
// Check: a COPA DO MUNDO. A chave anda uma vez por fase e a temporada inteira
// depende disso — se ela não avança, o jogador fica preso na primeira fase; se
// avança errado, alguém chega à final sem jogar (o bug clássico do BYE).
// =============================================================================
console.assert(
  (() => {
    if (typeof MUNDIAL === "undefined" || typeof NATIONAL_TEAMS === "undefined")
      return true;

    const c = Object.create(CareerMode.prototype);
    Object.assign(c, {
      season: MUNDIAL.A_CADA, // ano de Copa
      nationality: "Brasil",
      national: { called: true, caps: 0, goals: 0, seasons: 0 },
      trophies: [],
      awards: [],
      schedule: [],
      notifications: [],
      newsHistory: [],
      currentDayOffset: 0,
      coachReputation: 50,
      world: null,
    });
    c.addNotification = () => {};

    const anoDeCopa = c.ehAnoDeMundial();
    const m = c.mundialAtual();
    const times = Object.keys(NATIONAL_TEAMS).length;
    const primeira = m.rounds[0];

    // A chave cobre TODO mundo, e o BYE vai um por confronto (nunca empilhado).
    const nomes = new Set();
    primeira.forEach((j) => {
      if (j.home) nomes.add(j.home);
      if (j.away) nomes.add(j.away);
    });
    const duploVazio = primeira.some((j) => !j.home && !j.away);

    // Ano que NÃO é de Copa não tem chave nenhuma.
    const semCopa = Object.create(CareerMode.prototype);
    Object.assign(semCopa, { season: MUNDIAL.A_CADA + 1 });
    const foraDeAno = semCopa.ehAnoDeMundial();

    // Rodar até o fim: a chave tem de fechar com UM campeão.
    let voltas = 0;
    while (!c.mundial.champion && voltas < 10) {
      c._avancarMundial(true); // o usuário vence sempre
      voltas++;
    }

    return (
      anoDeCopa &&
      !foraDeAno &&
      nomes.size === times &&
      !duploVazio &&
      // Potência de 2: 6 seleções viram 8 slots = 4 confrontos.
      primeira.length * 2 >= times &&
      (primeira.length & (primeira.length - 1)) === 0 &&
      // Ganhando tudo, o campeão é a seleção do usuário — e sai troféu.
      c.mundial.champion === "selecao_brasil" &&
      c.trophies.some((t) => t.title === MUNDIAL.NOME) &&
      c.awards.length === 1 &&
      voltas <= 4
    );
  })(),
  "CareerMode: Copa do Mundo fora do lugar (chave, BYE ou campeão)",
);

// =============================================================================
// Check: a partida SIMULADA do usuário. O erro aqui não aparece no console —
// aparece como "simulei a temporada e terminei com 0 gol" ou, pior, como um
// atacante que marca mais gols do que o time inteiro fez.
// =============================================================================
console.assert(
  (() => {
    const atleta = (pos, nota, rand) => {
      const c = Object.create(CareerMode.prototype);
      Object.assign(c, {
        position: pos,
        speed: nota,
        kickPower: nota,
        stamina: nota,
        world: null,
      });
      // PRNG fixo: aqui se mede a REGRA, não o sorteio.
      c._desempenhoSimulado = CareerMode.prototype._desempenhoSimulado.bind(c);
      const original = Math.random;
      Math.random = () => rand;
      const r = c._desempenhoSimulado(4, "starter");
      Math.random = original;
      return r;
    };

    // Sorte máxima: todo gol do time é dele — e NUNCA mais que isso.
    const tudo = atleta("ATACANTE", 85, 0);
    // Azar total: não marca e não assiste.
    const nada = atleta("ATACANTE", 85, 0.999);
    // A posição pesa: no mesmo sorteio, o atacante finaliza onde o fixo não.
    const atacante = atleta("ATACANTE", 75, 0.4);
    const fixo = atleta("FIXO", 75, 0.4);
    // Reserva entra no 2º tempo: metade das chances.
    const c = Object.create(CareerMode.prototype);
    Object.assign(c, { position: "ATACANTE", speed: 85, kickPower: 85, stamina: 85, world: null });
    const original = Math.random;
    Math.random = () => 0.3;
    const titular = c._desempenhoSimulado(4, "starter");
    const reserva = c._desempenhoSimulado(4, "bench");
    Math.random = original;

    return (
      // O teto é o placar: gol do usuário sai dos gols do TIME, nunca do nada.
      tudo.gols === 4 &&
      tudo.gols + tudo.assistencias <= 4 &&
      nada.gols === 0 &&
      nada.assistencias === 0 &&
      atacante.gols > fixo.gols &&
      titular.gols >= reserva.gols
    );
  })(),
  "CareerMode: desempenho simulado fora do lugar (gol acima do placar ou posição ignorada)",
);

// =============================================================================
// Check: a virada de temporada é INEGOCIÁVEL. Prêmio, histórico, convocação e
// contrato são contabilidade do ano que acabou — se qualquer uma dessas contas
// explodir (save antigo, seleção que não resolve), o ano tem de virar do mesmo
// jeito. O sintoma de não virar é o pior possível: o botão responde nada e o
// jogador fica preso na temporada para sempre.
// =============================================================================
console.assert(
  (() => {
    const c = Object.create(CareerMode.prototype);
    Object.assign(c, {
      season: 4,
      matchDay: 30,
      seasonEnded: true,
      startDate: new Date(2026, 3, 1),
      playerStats: { matches: 0, goals: 0, assists: 0 },
      leagueTable: [],
      trophies: [],
      awards: [],
      history: [],
      notifications: [],
      newsHistory: [],
      schedule: [],
      world: null,
    });
    // Contabilidade quebrada de propósito.
    c._fecharTemporada = () => {
      throw new Error("prêmio explodiu");
    };
    c._envelhecerMundo = () => {
      throw new Error("mundo explodiu");
    };
    c.initializeLeagueTable = () => {};
    c.initializeGlobalPlayerStats = () => {};
    c.initializeTopScorers = () => {};
    c.generateSchedule = () => {};
    c.saveToLocalStorage = () => {};

    const erroOriginal = console.error;
    console.error = () => {};
    c.startNewSeason();
    console.error = erroOriginal;

    // Virou o ano mesmo com as duas falhando.
    return c.season === 5 && c.seasonEnded === false && c.matchDay === 1;
  })(),
  "CareerMode: a virada de temporada travou por causa da contabilidade do ano",
);
