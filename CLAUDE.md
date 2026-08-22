# Regras do Projeto (Futebol Top-Down)
- Use sempre funções nativas do JavaScript (ES6). NÃO use bundlers.
- Siga estritamente o princípio YAGNI (escreva o mínimo de código necessário).
- Nunca leia arquivos inteiros como o GameScene.js sem permissão explícita.
- Responda apenas com o código ou planos diretos. Seja extremamente conciso.

## Contexto
Arquitetura completa em `CONTEXTO.md`. Decisões e aprendizados em `memoria.md`.

---

## Invariantes — quebrar isso quebra o jogo

**O campo é HORIZONTAL.** Gols na esquerda e na direita, `WORLD 2000x1400`,
`PITCH 1600x1000`. Ataque corre no eixo **X**; as laterais são em **Y**.
`gkTop` = gol da ESQUERDA, `gkBottom` = gol da DIREITA (nomes legados).

**Constantes são a fonte, não decoração.** Já houve o caso de `PLAYER_ATTR`,
`GOALKEEPER` e `INPUT_CONFIG` existirem em `constants.js` enquanto as entidades
usavam números hardcoded — mexer na constante não mudava nada no jogo. Antes de
ajustar um valor, confirme que quem usa realmente **lê** a constante.

**`scene.PITCH_X/Y/WIDTH/HEIGHT` são definidos no `GameScene.create()`.** As
entidades leem daí. Se sumirem, todo mundo cai em fallback hardcoded e a IA
volta a jogar num campo fantasma.

**Literais do schedule:** `type` só assume `"brasileirao"` ou `"copa"` — as
cenas comparam essas strings, inclusive quando a liga é a Bundesliga. Para o
nome real de exibição use `competitionName`. Renomear `type` exige varrer
`PreGameScene`, `EndGameScene` e o próprio `CareerMode`.

**A liga do usuário não é o Brasileirão.** `leagueTable`, artilharia e os
títulos da UI saem de `playerLeagueId()`/`playerLeagueName()`/
`playerLeagueClubs()`. Nada de `leagues["Brasil"]` novo, nada de `slice(0, 18)`
em tabela: a liga tem 10 ou 16 times e o modal já rola sozinho.

**O clube disputa DUAS copas:** a continental e a doméstica da liga dele
(`copa_<ligaId>`). Nunca pergunte "qual é a copa dele" — pergunte qual é a copa
**do confronto** (`playerCupStatus(evento.matchType)`). "É copa?" é
`world.season.isCup(id)`, nunca `CONTINENTAL_CUPS[id]`.

**Cena que recebe `data` e passa adiante repassa o pacote INTEIRO.** A
`PenaltyShootoutScene` remontava um objeto pela metade e a tela de pós-jogo
recebia `undefined` (`opponent` virava string). Desempate viaja como
`penaltyWinnerId` (ID), nunca como booleano solto.

**Um critério só para "tem jogo hoje": a flag `played` do schedule.**
`isPlayerMatchPending()`, `getNextEvent()` e o painel leem a MESMA flag —
qualquer segundo critério (matchIndex, chave da copa) volta a produzir
"próximo jogo em 0 dias" com o botão JOGAR sumido.

**Virada de temporada nunca depende de aceitar proposta.**
`stayAndStartNewSeason()` é a saída garantida.

**Jogo do usuário só vira "resolvido" em `_markFixturePlayed()`.** É lá que
`matchDay` anda — e `matchDay` é o gatilho de fim de campeonato. Incrementá-lo
em outro lugar quebra a virada de temporada ou conta rodada duas vezes.

**Phaser NÃO chama `shutdown()`/`destroy()` de cena.** Ele emite os eventos.
Limpeza de DOM vai em `registerDOMTeardown()` (GameScene.hud.js), ligado no
`create()` — o placar é uma `div` fora do sistema do Phaser e ninguém a recolhe.

**Copa não tem estado no CareerMode.** `this.copa` foi apagado: chave, fase,
eliminação e campeão vivem em `world.season.tournaments` e se leem por
`playerCups()` / `playerCupStatus()`. Nada de ressuscitar bracket local.

**Nada de nome de competição ou ID escrito na UI.** Copa vem de
`playerCupStatus()`/`playerCupName()`, liga de `playerLeagueName()`, nome de
clube de `CareerMode.clubLabel(id)`. `type` é literal estrutural e não vira
texto — o nome de exibição está em `competitionName`.

**`initializeWorld()` é idempotente.** Mundo vivo não é regerado: `this.world`
guarda tabelas e chaveamentos em andamento. Para um mundo novo, zere
`this.world` antes (só a virada de temporada faz isso).

**Aparência de NPC é determinística.** Nunca reintroduza `Math.random`/
`GetRandom` para pele e cabelo: vem de hash do `id` em `getPlayerAppearance()`.

**IA tem UM cérebro.** `AIBrain` (FSM de `AI_STATES`) é o único lugar com
decisão de IA de linha; `Player` e `Enemy` só delegam. Nada de reabrir
`updateEnemyAI` com lógica própria — foi assim que o time do usuário passou meio
projeto sem saber passar a bola. Entidade guarda `aiState`, o cérebro é estático.

**Movimento de jogador é Arcade: `setAcceleration` + `setDrag`.** Nada de voltar
a integrar velocidade na mão. E `maxVelocity` do Arcade é **por eixo** — o teto
de verdade é o clamp por MÓDULO logo depois, senão a diagonal corre 1,41x.
Quem zera velocidade zera aceleração junto. Knobs em `PLAYER_PHYSICS`.

**Mouse: esquerdo é chute, direito é passe.** Um botão, uma função — clique
curto no esquerdo NÃO vira passe.

**Tática sem a bola é escolha de PONTO, dentro do `think()`.** Corte de linha
(`laneCutPoint`), infiltração (`throughRunTarget`) e hold up (`holdUpPoint`)
devolvem coordenada, nunca comportamento novo solto no `update`. O corte só vale
dentro de `DEFENSE_ZONE_RADIUS`: sem isso a marcação zonal vira perseguição.

**IA pensa em tick, anda em frame.** Escolha (estado, alvo de chute/passe) vai
em `think()`, throttled por `DECISION_INTERVAL_MS`; mira e locomoção em `aim()`,
todo frame. Plano é PONTO, nunca ângulo — ângulo guardado faz o jogador orbitar
o alvo. Perseguir bola e gatilho de bote ficam por frame de propósito.

**Ordem dos `<script>` importa.** Mixins (`GameScene.*.js`) carregam DEPOIS de
`GameScene.js`. `constants.js` e `LeaguesDB.js` antes de tudo que os consome.

**Modal não é filho de `.pui-root`.** `scene.add.dom()` pendura o
`.pui-modal-wrap` como irmão, então todo estilo de base precisa citar as duas
raízes — foi assim que a tabela perdeu a fonte pixel para o Times New Roman.

**O olho de peixe é SHADER, não `filter` CSS.** `CrtVhsFilter` (filtro de
câmera do Phaser 4), aplicado em toda cena pelo `main.js`; o `feDisplacementMap`
em SVG só sobrou para curvar a UI DOM nos menus.
Filtro CSS/SVG joga o trabalho no compositor do navegador, que reprocessa a tela
já desenhada todo frame; o shader roda no mesmo passe de GPU do jogo. Só o
CANVAS entorta — a UI é DOM e fica reta por cima, de propósito (texto de 5px
curvado é ilegível e clique em DOM distorcido cai fora do lugar).

**Phaser 4: pipeline morreu, agora é FILTRO de câmera.** `PostFXPipeline`,
`setPostPipeline` e `config.pipeline` não existem mais. O CRT é o par
controller + render node em `CrtVhsFilter.js` (`Phaser.Filters.Controller` +
`BaseFilterShader`), registrado com `renderNodes.addNodeConstructor` e ligado em
`camera.filters.internal`. `uMainSampler` e `outTexCoord` seguem valendo no
GLSL. A ligação é idempotente: a câmera sobrevive ao restart e empilharia outro
passe a cada volta ao menu.

**LAN: a autoridade é o ANFITRIÃO, e o servidor não simula nada.** `server.js`
só repassa `{t:"rede"}`. Bola, bots, goleiros, posse, gol, relógio e apito final
saem da simulação de quem criou a sala; o convidado obedece e desenha. Ligar
qualquer regra dessas no convidado faz a simulação local brigar com o pacote —
foi assim que a bola ficou presa no meio de campo.

**Entidade de rede é endereçada por `lado_POSICAO`** (`esq_ALA_ESQ`, `GK_dir`),
nunca por índice de array: o `player` de um cliente é `enemy` do outro e as
listas têm ordens diferentes em cada máquina. Humano remoto vai por `lanId`.

**`casa/fora` é sempre do ponto de vista de QUEM ENVIA.** Cada cliente entra
como mandante do próprio lado, então todo pacote com placar carrega `lado` e o
receptor inverte quando joga do outro. Sem isso o convidado via 1x0 estando
perdendo de 0x1.

**Boneco comandado pela rede não roda `update()` local** (a IA brigaria com o
pacote), e por isso a animação dele precisa ser disparada no `applyLanPacket` —
alimentando `updateAnimation()` da própria entidade, nunca um `anims.play`
paralelo. O sprite tem 8 direções por ação: `flipX` não serve.

**O socket do lobby atravessa as cenas.** Ele viaja em `data.lan.cliente` até a
`EndGameScene` e volta para a `MultiplayerScene`; reconectar daria um `lanId`
novo e a escalação da revanche não bateria.

**Célula do atlas ≠ tamanho do PNG.** O export tem quatro tamanhos (68/84/88/96)
e a célula é `BASE_FRAME_SIZE` (76): cada frame entra CENTRADO e com `clip()`.
Sem o recorte, frame grande invade a célula vizinha e o pé de um sprite aparece
sobre a cabeça do outro. `body.setOffset` e `setDisplaySize` das entidades
derivam da célula — número fixo ali desalinha o corpo e encolhe o boneco.

**Cor-chave do swap é MEDIDA no PNG, não copiada de especificação.** A arte tem
42 tons anti-serrilhados e nenhum hex da paleta nominal existe no arquivo; por
isso a classificação é por MATIZ. O cabelo veio na mesma rampa das listras e foi
girado na ARTE para 264° (50° de distância, o corte é 45°) — separar por "1
dígito de hex" não funciona com classificação por matiz.

**Efeito sumiu depois de mexer em JS? É cache, não regressão.** Aconteceu duas
vezes: `Ctrl+Shift+R` e reload forçado continuaram servindo `main.js` velho, e o
sintoma era exatamente "o shader não aparece". O que resolveu foi revalidar os
scripts (`fetch(url, {cache: "reload"})` em todos, depois reload) ou o
"Disable cache" do DevTools aberto.

**Custo de filtro se mede NA PARTIDA.** No menu a cena é quase estática e o
número mente: deu 16,7ms com e sem filtro enquanto o jogo engasgava em campo.

**Cor nova entra como variável no `:root`.** Literal de cor no meio de uma regra
escapa de qualquer troca de tema: numa virada de paleta sobraram 14 glows, o
placar e dois hexes inline no `MenuScene` com a cor velha, e desfazer virou
trabalho de arqueologia.

**Modal mede em %, nunca em `vw`/`vh`.** Ele vive no container DOM do Phaser,
que tem o tamanho do canvas (1000x600) e `overflow: hidden`. `width: 90vw` numa
tela de 1920px dava 1728px e o modal era cortado nos dois lados — o corte que
parecia bug de flex no chaveamento. Probe de UI de cena também tem de ser
pendurado nesse container; no `document.body` o bug não reproduz.

**Estado da UI persistido no save envelhece.** `transferOffers` é gravado: save
antigo trazia `team` como objeto e a tela mostrava `[object Object]`. A regra
vale para qualquer estado salvo: **o `loadFromLocalStorage` sanitiza — descarta
o que não bate com o formato atual — e o render assume só o formato validado.**
Defesa no render (`|| "—"`, `typeof`) esconde o lixo e o mantém no save; o
filtro no load some com ele de vez, porque o dado se regenera.

**BYE vai um por confronto, nunca empilhado no fim da lista.** Empilhado, meia
chave nasce vazia e um clube chega à semifinal sem jogar — na tela parece que
ele foi clonado em três fases. O bug é do sorteio, não do renderizador.

**Bracket divide por POSIÇÃO no chaveamento, nunca pela lista filtrada.** Com
BYEs a metade filtrada fica vazia e a árvore vira pilha. Slot sem time é
"A definir"; a convergência é `space-around` em colunas de altura igual.

**Proposta de transferência é PLANA:** `{team: <id>, teamId, teamLabel, tier,
leagueTier, salary, signingBonus, bonus, rating, isRenewal}`. Nada de `offer.team.tier` — esse
objeto aninhado nunca existiu. Toda oferta sai de `_buildOffer()`, e todo filtro
de interesse passa por `_offerChance()` — inclusive o piso de 3 propostas, senão
o Bayern sonda um rating 62.

**Cache do navegador engana.** Ao validar mudança de JS/CSS, force
`Ctrl+Shift+R` — várias sessões foram perdidas depurando arquivo velho.

## Checks existentes (rodam no boot, gritam no console)
- `GameScene.render.js`: métodos no prototype + `colorMaterial` classificando
  20 cores medidas da arte real + ida/volta HSL + contraste preto/branco.
- `GameScene.input.js`: métodos no prototype + sinal/escala/clamp do
  `curveFromDrag`.
- `CareerMode.js`: `playerCupStatus()` com chave falsa de 4 times — fase,
  eliminação e campeão, mais os nomes de fase de uma chave de 32. E a proposta
  de transferência: campos planos sem `undefined` e o cruzamento tier x rating.
- `AIBrain.js`: tabela de transição da FSM (posse → estado) com entidades falsas.
- `SeasonManager.js`: vagas continentais — contagem, sem repetição, brasileiro
  na Libertadores pela tabela e a virada usando a classificação do ano anterior.
- `MatchSimulator.js`: 5 titulares exatos, favorito entre 60% e 95% de vitórias
  (zebra existe e acontece na amostra), fator casa e determinismo por seed.
- `CalendarManager.js`: um ano inteiro gerado — dia da semana por competição,
  descanso mínimo, turno/returno, e o cenário "jogou quarta, não pode sexta".
  Mais um: o mata-mata roda até o campeão, com as `cupWindows` todas resolvidas.
- `test_input.js` e `test_replay.js` na raiz (`node test_*.js`).
