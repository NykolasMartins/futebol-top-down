// =============================================================================
// MatchSimulator.js — Placar de uma partida que ninguém joga
// =============================================================================
// Só o resultado. Não marca data (CalendarManager), não sabe quem disputa o quê
// (SeasonManager) e não mexe em tabela — quem grava é quem chama.
//
// Um único modelo: a diferença de rating vira GOL ESPERADO de cada lado e o
// placar é sorteado por Poisson em cima disso. Não existe uma segunda fórmula
// para vitória/empate/derrota — as três probabilidades SÃO a distribuição do
// Poisson. Duas fórmulas para a mesma coisa se contradizem na primeira mudança
// de constante.

const MATCH_SIM = {
  // Pontos de rating somados ao mandante. 2.5 põe o clássico equilibrado em
  // ~45% mandante / ~26% empate / ~29% visitante, que é o futebol real.
  HOME_ADVANTAGE: 2.5,
  // Gols esperados de um time médio contra um igual.
  BASE_GOALS: 1.35,
  // Quanto 1 ponto de rating vale em gol esperado. Subir aqui mata a zebra.
  RATING_WEIGHT: 0.075,
  // Nem o pior time tem 0 de expectativa, nem o melhor faz 8 todo jogo.
  MIN_XG: 0.25,
  MAX_XG: 4.0,
  // 1 goleiro + os 4 melhores de linha = os 5 titulares que definem o time.
  LINE_STARTERS: 4,
  // Elenco ausente (clube sem entrada em REAL_ROSTERS).
  FALLBACK_RATING: 75,
};

/**
 * Média de rating dos 5 titulares: o goleiro do elenco + os 4 jogadores de
 * linha de maior rating. Elenco inteiro seria injusto com quem tem banco ruim.
 */
function starterRating(teamId) {
  // Pelo `getTeamRoster`, não pelo banco cru: é assim que o simulador enxerga
  // o clube que envelheceu, vendeu o craque ou subiu um garoto da base. Com
  // `REAL_ROSTERS` direto, a força dos times ficava congelada para sempre.
  const roster =
    (typeof getTeamRoster === "function" && getTeamRoster(teamId)) ||
    (typeof REAL_ROSTERS !== "undefined" && REAL_ROSTERS[teamId]) ||
    [];
  const gk = roster.find((p) => p.position === "GK");
  const linha = roster
    .filter((p) => p.position !== "GK")
    .sort((a, b) => b.rating - a.rating)
    .slice(0, MATCH_SIM.LINE_STARTERS);
  const titulares = gk ? [gk, ...linha] : linha;
  if (!titulares.length) return MATCH_SIM.FALLBACK_RATING;
  return titulares.reduce((s, p) => s + p.rating, 0) / titulares.length;
}

/**
 * Sorteio de Poisson (Knuth). É o que dá zebra: com 2.4 de expectativa contra
 * 0.5, o favorito ainda perde de vez em quando, sem nenhum "if de zebra".
 */
function poissonSample(lambda, rand) {
  const limite = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > limite);
  return k - 1;
}

/**
 * Placar de um confronto.
 * @param {string} homeTeamId chave de REAL_ROSTERS / LEAGUES_DB
 * @param {string} awayTeamId
 * @param {() => number} rand PRNG em [0,1). Passe o `_rand` do SeasonManager
 *   (semeado pela worldSeed) para o mundo ser reproduzível; o default é só
 *   conveniência de console.
 * @returns {{homeScore:number, awayScore:number, winnerId:string|null, isDraw:boolean}}
 */
function simulateMatch(homeTeamId, awayTeamId, rand = Math.random) {
  const forcaCasa = starterRating(homeTeamId) + MATCH_SIM.HOME_ADVANTAGE;
  const forcaFora = starterRating(awayTeamId);
  const vantagem = (forcaCasa - forcaFora) * MATCH_SIM.RATING_WEIGHT;

  const clamp = (v) =>
    Math.min(MATCH_SIM.MAX_XG, Math.max(MATCH_SIM.MIN_XG, v));
  const homeScore = poissonSample(clamp(MATCH_SIM.BASE_GOALS + vantagem), rand);
  const awayScore = poissonSample(clamp(MATCH_SIM.BASE_GOALS - vantagem), rand);

  return {
    homeScore,
    awayScore,
    isDraw: homeScore === awayScore,
    winnerId:
      homeScore === awayScore
        ? null
        : homeScore > awayScore
          ? homeTeamId
          : awayTeamId,
  };
}

/**
 * Aplica o placar em duas linhas de tabela. Existe aqui porque a tabela do
 * SeasonManager e a `leagueTable` do CareerMode são a MESMA contabilidade em
 * objetos diferentes — duplicar os 3 pontos da vitória em dois arquivos é
 * garantir que um dia só um dos dois seja corrigido.
 * As duas linhas precisam ter: played/wins/draws/losses/goalsFor/goalsAgainst/points.
 */
function applyResultToRows(homeRow, awayRow, result, homeTeamId) {
  homeRow.played++;
  awayRow.played++;
  homeRow.goalsFor += result.homeScore;
  homeRow.goalsAgainst += result.awayScore;
  awayRow.goalsFor += result.awayScore;
  awayRow.goalsAgainst += result.homeScore;

  if (result.isDraw) {
    homeRow.draws++;
    awayRow.draws++;
    homeRow.points += 1;
    awayRow.points += 1;
  } else if (result.winnerId === homeTeamId) {
    homeRow.wins++;
    homeRow.points += 3;
    awayRow.losses++;
  } else {
    awayRow.wins++;
    awayRow.points += 3;
    homeRow.losses++;
  }
}

if (typeof window !== "undefined") {
  window.MATCH_SIM = MATCH_SIM;
  window.simulateMatch = simulateMatch;
  window.starterRating = starterRating;
  window.applyResultToRows = applyResultToRows;
}

// =============================================================================
// Check: o favorito ganha a grande maioria, mas NÃO todas; e a mesma seed
// devolve a mesma temporada. Sem isto, um RATING_WEIGHT errado só apareceria
// como "o Mirassol foi campeão" três horas de jogo depois.
// =============================================================================
console.assert(
  (() => {
    if (typeof REAL_ROSTERS === "undefined" || typeof SeasonManager === "undefined")
      return true; // fora do browser o check não se aplica

    const semear = (s) => {
      const sm = new SeasonManager(s);
      return () => sm._rand();
    };

    // 1) Titulares: 5 exatos, e o goleiro entra mesmo sem ser o melhor rating.
    const flaGk = REAL_ROSTERS.Flamengo.find((p) => p.position === "GK");
    const flaTop4 = REAL_ROSTERS.Flamengo.filter((p) => p.position !== "GK")
      .map((p) => p.rating)
      .sort((a, b) => b - a)
      .slice(0, 4);
    const esperado =
      (flaGk.rating + flaTop4.reduce((a, b) => a + b, 0)) / 5;
    if (Math.abs(starterRating("Flamengo") - esperado) > 1e-9) return false;

    // 2) Favoritão x lanterna: maioria esmagadora, mas com zebra.
    const rand = semear(4242);
    let vitorias = 0;
    let derrotas = 0;
    let golsCasa = 0;
    for (let i = 0; i < 2000; i++) {
      const r = simulateMatch("man_city", "torino", rand);
      golsCasa += r.homeScore;
      if (r.winnerId === "man_city") vitorias++;
      if (r.winnerId === "torino") derrotas++;
    }
    const pctFavorito = vitorias / 2000;
    const mediaGols = golsCasa / 2000;

    // 3) Fator casa: o mesmo confronto invertido tem de render menos.
    const randA = semear(777);
    const randB = semear(777);
    let casa = 0;
    let fora = 0;
    for (let i = 0; i < 2000; i++) {
      if (simulateMatch("Flamengo", "Palmeiras", randA).winnerId === "Flamengo")
        casa++;
      if (simulateMatch("Palmeiras", "Flamengo", randB).winnerId === "Flamengo")
        fora++;
    }

    // 4) Determinismo: mesma seed, mesmo placar.
    const r1 = simulateMatch("Santos", "Vasco", semear(9));
    const r2 = simulateMatch("Santos", "Vasco", semear(9));

    return (
      pctFavorito > 0.6 &&
      pctFavorito < 0.95 && // zebra existe
      derrotas > 0 && // ... e acontece de verdade nesta amostra
      mediaGols > 1.2 &&
      mediaGols < 4 &&
      casa > fora && // mandar em casa vale alguma coisa
      r1.homeScore === r2.homeScore &&
      r1.awayScore === r2.awayScore
    );
  })(),
  "MatchSimulator: favorito ganhando de menos/de mais, sem fator casa ou não determinístico",
);
