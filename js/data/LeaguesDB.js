// =============================================================================
// LeaguesDB.js — Ligas nacionais, pool sul-americano e copas continentais
// =============================================================================
// Só DADOS. Quem sorteia vaga é o SeasonManager; quem marca data é o
// CalendarManager. Os `id` dos clubes que já existem em TEAMS_DB (constants.js)
// são iguais de propósito: esses são os únicos jogáveis hoje, o resto entra
// como adversário simulado até ganhar uniforme.

// `tier` da LIGA (1-5) é prestígio, não força de clube: decide quanto ela paga
// no mercado e a partir de que nível de jogador ela olha para fora do país.
const LEAGUES_DB = {
  premier_league: {
    name: "Premier League",
    short: "PL",
    tier: 5,
    cupName: "FA Cup",
    cupShort: "FA",
    country: "Inglaterra",
    confederation: "UEFA",
    // Vagas que a liga entrega ao continente na temporada seguinte.
    championsSlots: 4,
    europaSlots: 2,
    relegationSlots: 3,
    clubs: [
      { id: "Arsenal", name: "Arsenal", strength: 86 },
      { id: "Chelsea", name: "Chelsea", strength: 84 },
      { id: "man_city", name: "Manchester City", strength: 90 },
      { id: "liverpool", name: "Liverpool", strength: 88 },
      { id: "man_united", name: "Manchester United", strength: 82 },
      { id: "tottenham", name: "Tottenham", strength: 81 },
      { id: "newcastle", name: "Newcastle", strength: 79 },
      { id: "aston_villa", name: "Aston Villa", strength: 78 },
      { id: "brighton", name: "Brighton", strength: 76 },
      { id: "west_ham", name: "West Ham", strength: 74 },
    ],
  },

  la_liga: {
    name: "La Liga",
    short: "LL",
    tier: 5,
    cupName: "Copa del Rey",
    cupShort: "CDR",
    country: "Espanha",
    confederation: "UEFA",
    championsSlots: 4,
    europaSlots: 2,
    relegationSlots: 3,
    clubs: [
      { id: "Real_Madrid", name: "Real Madrid", strength: 90 },
      { id: "Valencia", name: "Valencia", strength: 76 },
      { id: "barcelona", name: "Barcelona", strength: 88 },
      { id: "atletico_madrid", name: "Atlético de Madrid", strength: 85 },
      { id: "athletic_bilbao", name: "Athletic Bilbao", strength: 80 },
      { id: "real_sociedad", name: "Real Sociedad", strength: 79 },
      { id: "betis", name: "Real Betis", strength: 77 },
      { id: "villarreal", name: "Villarreal", strength: 78 },
      { id: "sevilla", name: "Sevilla", strength: 76 },
      { id: "girona", name: "Girona", strength: 74 },
    ],
  },

  serie_a: {
    name: "Serie A",
    short: "SA",
    tier: 4,
    cupName: "Coppa Italia",
    cupShort: "CIT",
    country: "Itália",
    confederation: "UEFA",
    championsSlots: 4,
    europaSlots: 2,
    relegationSlots: 3,
    clubs: [
      { id: "inter_milan", name: "Inter de Milão", strength: 87 },
      { id: "milan", name: "Milan", strength: 84 },
      { id: "juventus", name: "Juventus", strength: 85 },
      { id: "napoli", name: "Napoli", strength: 83 },
      { id: "roma", name: "Roma", strength: 80 },
      { id: "lazio", name: "Lazio", strength: 79 },
      { id: "atalanta", name: "Atalanta", strength: 82 },
      { id: "fiorentina", name: "Fiorentina", strength: 77 },
      { id: "bologna", name: "Bologna", strength: 76 },
      { id: "torino", name: "Torino", strength: 73 },
    ],
  },

  bundesliga: {
    name: "Bundesliga",
    short: "BUN",
    tier: 4,
    cupName: "DFB-Pokal",
    cupShort: "DFB",
    country: "Alemanha",
    confederation: "UEFA",
    championsSlots: 4,
    europaSlots: 2,
    relegationSlots: 2,
    clubs: [
      { id: "bayern", name: "Bayern de Munique", strength: 89 },
      { id: "dortmund", name: "Borussia Dortmund", strength: 84 },
      { id: "leverkusen", name: "Bayer Leverkusen", strength: 86 },
      { id: "leipzig", name: "RB Leipzig", strength: 82 },
      { id: "stuttgart", name: "Stuttgart", strength: 79 },
      { id: "frankfurt", name: "Eintracht Frankfurt", strength: 78 },
      { id: "wolfsburg", name: "Wolfsburg", strength: 75 },
      { id: "freiburg", name: "Freiburg", strength: 74 },
      { id: "hoffenheim", name: "Hoffenheim", strength: 73 },
      { id: "werder", name: "Werder Bremen", strength: 72 },
    ],
  },

  ligue_1: {
    name: "Ligue 1",
    short: "L1",
    tier: 3,
    cupName: "Coupe de France",
    cupShort: "CDF",
    country: "França",
    confederation: "UEFA",
    championsSlots: 3,
    europaSlots: 2,
    relegationSlots: 2,
    clubs: [
      { id: "psg", name: "Paris Saint-Germain", strength: 88 },
      { id: "monaco", name: "Monaco", strength: 81 },
      { id: "marseille", name: "Olympique de Marseille", strength: 79 },
      { id: "lyon", name: "Olympique Lyonnais", strength: 78 },
      { id: "lille", name: "Lille", strength: 77 },
      { id: "nice", name: "Nice", strength: 76 },
      { id: "lens", name: "Lens", strength: 75 },
      { id: "rennes", name: "Rennes", strength: 74 },
      { id: "strasbourg", name: "Strasbourg", strength: 71 },
      { id: "nantes", name: "Nantes", strength: 70 },
    ],
  },
  // Brasileirão: entra no LeaguesDB para o CalendarManager gerar as rodadas
  // dele junto com as europeias. Sem isto, um jogador de carreira brasileiro
  // sairia do calendário global com UM jogo no ano (só a Libertadores).
  // Zero vaga de UEFA: estes clubes disputam CONMEBOL.
  brasileirao: {
    name: "Brasileirão",
    short: "BRA",
    tier: 3,
    cupName: "Copa do Brasil",
    cupShort: "CDB",
    country: "Brasil",
    confederation: "CONMEBOL",
    championsSlots: 0,
    europaSlots: 0,
    // Vagas continentais pela TABELA, igual às ligas europeias: os 6 primeiros
    // vão à Libertadores e os 6 seguintes à Sul-Americana. Antes os brasileiros
    // só entravam por sorteio no SOUTH_AMERICAN_POOL, onde estavam duplicados.
    libertadoresSlots: 6,
    sudamericanaSlots: 6,
    relegationSlots: 4,
    clubs: [
      { id: "Flamengo", name: "Flamengo", strength: 85 },
      { id: "Palmeiras", name: "Palmeiras", strength: 86 },
      { id: "Sao_Paulo", name: "São Paulo", strength: 80 },
      { id: "Corinthians", name: "Corinthians", strength: 78 },
      { id: "Galo", name: "Atlético Mineiro", strength: 81 },
      { id: "Cruzeiro", name: "Cruzeiro", strength: 77 },
      { id: "Gremio", name: "Grêmio", strength: 79 },
      { id: "Inter", name: "Internacional", strength: 79 },
      { id: "Fluminense", name: "Fluminense", strength: 78 },
      { id: "Botafogo", name: "Botafogo", strength: 82 },
      { id: "Santos", name: "Santos", strength: 74 },
      { id: "Vasco", name: "Vasco da Gama", strength: 73 },
      { id: "Bahia", name: "Bahia", strength: 75 },
      { id: "Fortaleza", name: "Fortaleza", strength: 76 },
      { id: "Mirassol", name: "Mirassol", strength: 71 },
      { id: "Remo", name: "Remo", strength: 70 },
    ],
  },
};


// Clubes sul-americanos SEM liga jogável aqui. Os brasileiros saíram: eles têm
// o Brasileirão e classificam pela tabela, como os europeus. Estavam listados
// nos dois lugares, e a lista duplicada é que fazia parecer que o Brasileirão
// estava fora do continente.
const SOUTH_AMERICAN_POOL = {
  name: "América do Sul",
  confederation: "CONMEBOL",
  libertadoresSlots: 4,
  sudamericanaSlots: 2,
  clubs: [
    { id: "river_plate", name: "River Plate", strength: 84 },
    { id: "boca_juniors", name: "Boca Juniors", strength: 82 },
    { id: "penarol", name: "Peñarol", strength: 74 },
    { id: "nacional_uru", name: "Nacional", strength: 73 },
    { id: "colo_colo", name: "Colo-Colo", strength: 72 },
    { id: "olimpia", name: "Olimpia", strength: 71 },
  ],
};

// De onde cada copa tira participante: `slotKey` aponta para o campo de vagas,
// e QUALQUER liga (ou o pool) que declare esse campo entrega vaga. Não existe
// mais `source`: quem tem `libertadoresSlots` está na Libertadores, ponto.
const CONTINENTAL_CUPS = {
  champions: {
    name: "Champions League",
    short: "UCL",
    confederation: "UEFA",
    slotKey: "championsSlots",
  },
  europa: {
    name: "Europa League",
    short: "UEL",
    confederation: "UEFA",
    slotKey: "europaSlots",
  },
  libertadores: {
    name: "Libertadores",
    short: "LIB",
    confederation: "CONMEBOL",
    slotKey: "libertadoresSlots",
  },
  sudamericana: {
    name: "Sul-Americana",
    short: "SUL",
    confederation: "CONMEBOL",
    slotKey: "sudamericanaSlots",
  },
};

/**
 * Converte as ligas do LeaguesDB para o formato que o CareerMode já usa
 * ({ name, rating, tier, shirtColor, shirtColor2 }), chaveado por país.
 * Assim a tela de criação e o resto da carreira leem tudo pelo mesmo caminho,
 * sem uma segunda lista de times para manter em sincronia.
 *
 * O Brasil NÃO sai daqui: continua no literal do CareerMode, porque o
 * Brasileirão e a Copa do Brasil dependem daqueles tiers e ratings específicos.
 */
function buildCareerLeaguesFromDB() {
  // salaryTable do CareerMode vai de 1 a 5; força 70..90 vira tier 1..5.
  const tierDe = (strength) =>
    Math.max(1, Math.min(5, Math.round((strength - 68) / 4.5)));
  const hex = (n) => "#" + (n || 0).toString(16).padStart(6, "0");

  const out = {};
  for (const leagueId of getAllLeagueIds()) {
    const liga = LEAGUES_DB[leagueId];
    out[liga.country] = liga.clubs.map((c) => {
      const kit = typeof TEAMS_DB !== "undefined" ? TEAMS_DB[c.id] : null;
      return {
        name: c.id, // id é a chave de TEAMS_DB/REAL_ROSTERS: o que o jogo usa
        label: c.name, // nome bonito para a UI
        rating: c.strength,
        tier: tierDe(c.strength),
        shirtColor: hex(kit && kit.shirt1),
        shirtColor2: hex(kit && kit.shirt2),
      };
    });
  }
  return out;
}

function getLeague(leagueId) {
  return LEAGUES_DB[leagueId] || null;
}

function getAllLeagueIds() {
  return Object.keys(LEAGUES_DB);
}

/** Todo clube de todas as ligas + pool, achatado. Útil para busca por id. */
function getAllClubs() {
  const out = [];
  for (const id of getAllLeagueIds()) {
    LEAGUES_DB[id].clubs.forEach((c) => out.push({ ...c, leagueId: id }));
  }
  SOUTH_AMERICAN_POOL.clubs.forEach((c) =>
    out.push({ ...c, leagueId: null, confederation: "CONMEBOL" }),
  );
  return out;
}

function findClub(clubId) {
  return getAllClubs().find((c) => c.id === clubId) || null;
}

function getAllClubIds() {
  return [...new Set(getAllClubs().map((c) => c.id))];
}

/**
 * Copa doméstica de cada liga, derivada do `cupName`/`cupShort` dela. Toda liga
 * nacional disputa a sua em paralelo ao campeonato de pontos corridos.
 * A chave é o id de competição usado no calendário e no schedule.
 */
const DOMESTIC_CUPS = {};
for (const _ligaId of Object.keys(LEAGUES_DB)) {
  const _liga = LEAGUES_DB[_ligaId];
  if (!_liga.cupName) continue;
  DOMESTIC_CUPS[`copa_${_ligaId}`] = {
    name: _liga.cupName,
    short: _liga.cupShort,
    confederation: _liga.confederation,
    leagueId: _ligaId,
  };
}

/**
 * Sigla de 3 letras do clube, para o placar de transmissão ("FLA", "SAO").
 * Usa o campo `short` do clube se existir; senão tira as 3 primeiras letras do
 * nome de exibição, sem acento (São Paulo -> SAO). Cai no id quando o clube não
 * está no DB (amistoso com time avulso).
 */
function clubAcronym(clubId) {
  // Seleção tem sigla própria (BRA, ING): sem isto o placar da data FIFA
  // mostraria "SEL" nos dois lados, que é o nome do prefixo, não do time.
  if (typeof NATIONAL_TEAMS !== "undefined" && NATIONAL_TEAMS[clubId])
    return NATIONAL_TEAMS[clubId].short;
  const clube = typeof findClub === "function" ? findClub(clubId) : null;
  if (clube && clube.short) return clube.short.toUpperCase().slice(0, 3);
  const nome = (clube && clube.name) || String(clubId || "");
  // NFD separa o acento da letra; o filtro seguinte já descarta o acento junto
  // com espaço e pontuação, então "São Paulo" vira "SaoPaulo" -> "SAO".
  const letras = nome.normalize("NFD").replace(/[^A-Za-z]/g, "");
  return (letras.slice(0, 3) || "TBD").toUpperCase();
}

/**
 * Sigla curta de uma competição, para etiqueta de calendário ("PL", "UCL").
 * Sai do dado — a UI não sabe o nome de competição nenhuma.
 */
function competitionShort(competitionId) {
  const comp =
    LEAGUES_DB[competitionId] ||
    CONTINENTAL_CUPS[competitionId] ||
    DOMESTIC_CUPS[competitionId] ||
    null;
  if (comp && comp.short) return comp.short;
  // Competição sem `short`: inicial de cada palavra, cortada em 3.
  const nome = (comp && comp.name) || competitionId || "";
  const iniciais = nome
    .split(/[\s-]+/)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (iniciais || nome.slice(0, 3)).slice(0, 3);
}

// =============================================================================
// SELEÇÕES NACIONAIS
// =============================================================================
// Uma seleção por país que tem liga jogável. O ELENCO dela não é escrito à mão:
// sai dos melhores jogadores dos clubes daquela liga (ver `Elenco.selecao`), o
// que a mantém viva junto com o mundo — quem envelhece ou explode na base muda
// a convocação sozinho no ano seguinte.
//
// A chave é a mesma do TEAMS_DB (uniforme) e do elenco vivo: `selecao_<pais>`.
const NATIONAL_TEAMS = {
  selecao_brasil: { label: "Brasil", country: "Brasil", leagueId: "brasileirao", short: "BRA" },
  selecao_inglaterra: { label: "Inglaterra", country: "Inglaterra", leagueId: "premier_league", short: "ING" },
  selecao_espanha: { label: "Espanha", country: "Espanha", leagueId: "la_liga", short: "ESP" },
  selecao_italia: { label: "Itália", country: "Itália", leagueId: "serie_a", short: "ITA" },
  selecao_alemanha: { label: "Alemanha", country: "Alemanha", leagueId: "bundesliga", short: "ALE" },
  selecao_franca: { label: "França", country: "França", leagueId: "ligue_1", short: "FRA" },
};

/** A seleção de um país, pela chave do país. `null` para país sem liga aqui. */
function nationalTeamOfCountry(country) {
  const id = Object.keys(NATIONAL_TEAMS).find(
    (k) => NATIONAL_TEAMS[k].country === country,
  );
  return id ? { id, ...NATIONAL_TEAMS[id] } : null;
}

// =============================================================================
// NACIONALIDADE DO JOGADOR
// =============================================================================
// Nacionalidade é do JOGADOR, não da liga onde ele joga. Sem isto a "seleção do
// Brasil" convocava o Arrascaeta (uruguaio no Flamengo) e a da Inglaterra
// virava o elenco estrangeiro da Premier League.
//
// O banco não tem esse campo e não vai ter 504 linhas escritas à mão: a
// nacionalidade é DERIVADA do id (mesmo hash da aparência e da idade), com o
// país do clube pesando — a maioria de um clube brasileiro é brasileira, e uma
// minoria vem do pool de vizinhos. É a mesma regra do futebol real, e o efeito
// que importa aparece: brasileiro que joga na Europa continua convocável, e
// estrangeiro no Brasil não entra na Seleção.
//
// `player.nationality` explícito GANHA do derivado — mesma porta do `skin`/
// `hair` em `getPlayerAppearance`. É por ali que se corrige um caso conhecido
// sem tocar no resto (ver Arrascaeta em RealRosters.js).
const NATIVE_SHARE = 0.7; // fatia do elenco que é do próprio país

const FOREIGN_POOLS = {
  Brasil: ["Uruguai", "Argentina", "Colômbia", "Chile", "Paraguai", "Venezuela"],
  Inglaterra: ["Irlanda", "Escócia", "França", "Noruega", "Egito", "Brasil"],
  Espanha: ["Argentina", "Brasil", "França", "Uruguai", "Marrocos", "Croácia"],
  Itália: ["Argentina", "França", "Sérvia", "Brasil", "Nigéria", "Suíça"],
  Alemanha: ["Áustria", "França", "Japão", "Polônia", "Marrocos", "Brasil"],
  França: ["Senegal", "Argélia", "Brasil", "Marrocos", "Camarões", "Portugal"],
};

/** País do clube. `null` para clube fora das ligas jogáveis (pool CONMEBOL). */
function clubCountry(clubId) {
  const liga = Object.keys(LEAGUES_DB).find((id) =>
    LEAGUES_DB[id].clubs.some((c) => (c.id || c) === clubId),
  );
  return liga ? LEAGUES_DB[liga].country : null;
}

/**
 * Nacionalidade do jogador. Explícita ganha; senão hash do id decide entre o
 * país do clube e o pool de estrangeiros daquele país.
 */
function getPlayerNationality(player, clubId) {
  if (player && typeof player.nationality === "string") return player.nationality;
  // Curadoria (RealRosters.js) antes do palpite: é ela que impede o Haaland de
  // ser inglês e o Arrascaeta de ser brasileiro só porque jogam ali.
  const curado =
    typeof PLAYER_NATIONALITY !== "undefined" &&
    player &&
    PLAYER_NATIONALITY[player.id];
  if (curado) return curado;
  const pais = clubCountry(clubId);
  if (!pais) return null;

  const id = (player && (player.id || player.name)) || "anon";
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // Bits altos para a moeda e baixos para o sorteio do pool: usar o mesmo
  // pedaço do hash nos dois amarraria "é estrangeiro" a "é uruguaio".
  const moeda = ((h >>> 16) % 1000) / 1000;
  if (moeda < NATIVE_SHARE) return pais;
  const pool = FOREIGN_POOLS[pais] || [pais];
  return pool[h % pool.length];
}
