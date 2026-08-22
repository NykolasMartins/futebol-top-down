/**
 * Mixin de prototype: aplica a escalação da sala LAN nos bonecos que a
 * `GameScene` já criou.
 *
 * Por que DEPOIS do spawn, e não no lugar dele: o `create()` monta 5v5 com
 * arquétipos fixos (PIVOT no jogador, FIXO/WING_L/WING_R nos aliados) e liga
 * física, times, nomes, goleiros e HUD nessa ordem. Reescrever aquele bloco
 * para a LAN seria um segundo caminho de spawn dentro do God Object — e
 * qualquer conserto futuro teria de ser feito nos dois. Aqui só se REETIQUETA
 * o que já existe: arquétipo, nome e dono de rede.
 *
 * Carregar SEMPRE depois de GameScene.js, como os outros mixins.
 */
if (typeof GameScene === "undefined") {
  throw new Error("GameScene.lan.js carregado antes de GameScene.js");
}

/** Posição da sala -> arquétipo tático do jogo. */
const LAN_POS_ARQUETIPO = {
  FIXO: "FIXO",
  ALA_ESQ: "WING_L",
  ALA_DIR: "WING_R",
  PIVO: "PIVOT",
};

Object.assign(GameScene.prototype, {
  /**
   * `this.lan` vem do lobby: `{ meuId, meuLado, escalacoes, times }`.
   * Sem ele a função não faz nada — partida de carreira e de exibição passam
   * por aqui e não devem mudar em nada.
   */
  applyLanLineup() {
    const lan = this.lan;
    if (!lan || !lan.escalacoes) return;

    const meuTime = lan.escalacoes[lan.meuLado] || [];
    const outroLado = lan.meuLado === "esq" ? "dir" : "esq";
    const timeAdversario = lan.escalacoes[outroLado] || [];

    // Só as vagas de linha: o goleiro é bot e a `GameScene` já o criou.
    const linhaMinha = meuTime.filter((v) => v.posicao !== "GK");
    const linhaDeles = timeAdversario.filter((v) => v.posicao !== "GK");

    // A vaga que EU ocupo manda no arquétipo do boneco controlado. Sem isto o
    // jogador local nasceria sempre PIVOT, mesmo tendo escolhido ALA no lobby.
    const minhaVaga = linhaMinha.find(
      (v) => v.tipo === "humano" && v.id === lan.meuId,
    );
    const meuArquetipo = minhaVaga
      ? ARCHETYPES[LAN_POS_ARQUETIPO[minhaVaga.posicao]]
      : null;

    // `this.enemies` JÁ contém `this.enemy` (o `create()` faz push dele). Somar
    // os dois duplicava um adversário — dois bonecos com o mesmo arquétipo,
    // parados um em cima do outro.
    const bonecosDeles = this.enemies.slice();

    // O jogador local primeiro: ele fica com a vaga dele, e os companheiros
    // dividem as que sobraram, na ordem em que a sala as lista.
    if (meuArquetipo) this.player.archetype = meuArquetipo;
    this.player.lanId = lan.meuId;
    // Chave IGUAL nos dois clientes: lado da sala + posição. Índice de array
    // não serviria — o `player` de um é `enemy` do outro, e as listas têm
    // ordens diferentes em cada máquina.
    this.player.lanChave = minhaVaga ? lan.meuLado + "_" + minhaVaga.posicao : null;
    this.player.isLocalPlayer = true; // é por aqui que a câmera vai achar ele
    this.player.athleteName = minhaVaga ? minhaVaga.nome : this.player.athleteName;

    const sobrandoMinhas = linhaMinha.filter((v) => v !== minhaVaga);
    this.allies.forEach((aliado, i) => {
      const vaga = sobrandoMinhas[i];
      if (!vaga) return;
      aliado.archetype = ARCHETYPES[LAN_POS_ARQUETIPO[vaga.posicao]] || aliado.archetype;
      aliado.lanId = vaga.tipo === "humano" ? vaga.id : null;
      aliado.isRemotePlayer = vaga.tipo === "humano";
      aliado.athleteName = vaga.tipo === "humano" ? vaga.nome : aliado.athleteName;
      aliado.lanChave = lan.meuLado + "_" + vaga.posicao;
      // Vaga que o capitão deixou vazia: some do campo, não vira bot.
      if (vaga.tipo === "vazio") this.removeLanSlot(aliado);
    });

    bonecosDeles.forEach((adv, i) => {
      const vaga = linhaDeles[i];
      if (!vaga) return;
      adv.archetype = ARCHETYPES[LAN_POS_ARQUETIPO[vaga.posicao]] || adv.archetype;
      adv.lanId = vaga.tipo === "humano" ? vaga.id : null;
      adv.isRemotePlayer = vaga.tipo === "humano";
      adv.athleteName = vaga.tipo === "humano" ? vaga.nome : adv.athleteName;
      adv.lanChave = outroLado + "_" + vaga.posicao;
      if (vaga.tipo === "vazio") this.removeLanSlot(adv);
    });

    // Reposiciona todo mundo pelo arquétipo novo — senão os bonecos ficam onde
    // o spawn fixo os deixou e a formação não corresponde ao que a sala montou.
    this.repositionLanTeams();

    // As etiquetas de nome já tinham sido criadas com os nomes do elenco
    // (`assignRealPlayerNames` roda antes). Refaz para o nick digitado no
    // lobby aparecer em cima do boneco certo.
    this.createAthleteNameLabels();

    // E liga o rádio da partida.
    this.startLanSync();
  },

  /** Vaga vazia (capitão escolheu jogar com menos): tira o boneco de campo. */
  removeLanSlot(entidade) {
    entidade.setActive(false);
    entidade.setVisible(false);
    if (entidade.body) entidade.body.enable = false;
    if (entidade.nameText) entidade.nameText.setVisible(false);
    this.allPlayers = this.allPlayers.filter((p) => p !== entidade);
    this.allies = this.allies.filter((p) => p !== entidade);
    this.enemies = this.enemies.filter((p) => p !== entidade);
  },

  /**
   * Põe cada boneco no posto tático do seu arquétipo NOVO.
   *
   * Usa a INSTÂNCIA que a cena já criou (`this.tacticManager`) e a assinatura
   * que a IA usa (`getTargetPosition(bot)`), não uma versão estática com
   * coordenadas soltas — foi exatamente esse engano que derrubou o `create()`
   * na primeira tentativa ("TacticManager.getTargetPosition is not a
   * function") e deixou a partida sem goleiro e sem HUD.
   */
  repositionLanTeams() {
    const tm = this.tacticManager;
    if (!tm || typeof tm.getTargetPosition !== "function") return;

    [this.player, ...this.allies, ...this.enemies].forEach((entidade) => {
      if (!entidade || !entidade.active) return;
      const alvo = tm.getTargetPosition(entidade);
      if (!alvo) return;
      entidade.setPosition(alvo.x, alvo.y);
      if (entidade.body && entidade.body.reset) entidade.body.reset(alvo.x, alvo.y);
    });
  },
});

// Check de boot, no padrão dos outros mixins deste projeto.
console.assert(
  ["applyLanLineup", "removeLanSlot", "repositionLanTeams"].every(
    (m) => typeof GameScene.prototype[m] === "function",
  ),
  "GameScene.lan.js: método faltando no prototype",
);
console.assert(
  Object.keys(LAN_POS_ARQUETIPO).length === 4 &&
    !("GK" in LAN_POS_ARQUETIPO),
  "GameScene.lan.js: o goleiro não é vaga de escolha, não deve estar no mapa",
);
