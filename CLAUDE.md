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

**Literais do schedule:** `type` só assume `"brasileirao"`, `"copa"` ou
`"selecao"` — as cenas comparam essas strings, inclusive quando a liga é a
Bundesliga. Para o nome real de exibição use `competitionName`. Mexer em `type`
exige varrer `PreGameScene`, `EndGameScene` e o próprio `CareerMode`.

**Quem decide se o jogador entra é `getLineupStatus()`, e só ela.** Suspensão e
lesão devolvem `not_related` ali dentro, ANTES da conta de forma — motivo novo
para não jogar entra nessa função, nunca como `if` novo espalhado pelas telas.
A suspensão é cumprida pela partida PERDIDA, em `_pesarPartidaNoCorpo()`, que
roda no registro de toda partida do usuário (inclusive a que ele não jogou).

**Súmula da partida viaja dentro de `matchStats`.** Ele já é repassado inteiro
por `PenaltyShootoutScene` e `EndGameScene`; campo solto no `data` é mais um a
esquecer de repassar — e isso já quebrou o pós-jogo aqui.

**Nacionalidade é do JOGADOR, não da liga.** A seleção convoca por
`getPlayerNationality()` varrendo o mundo inteiro — o uruguaio do Flamengo fica
de fora da Seleção Brasileira e o brasileiro do PSG entra. A ordem é: campo
explícito, curadoria `PLAYER_NATIONALITY` (rating 81+, a faixa que uma
convocação alcança), e só então hash do id enviesado pelo clube. Quem não está
na curadoria é PALPITE, não dado — corrigir é acrescentar uma linha.

**Seleção precisa de entrada no `TEAMS_DB`.** A chave `selecao_<pais>` é a mesma
no `NATIONAL_TEAMS`, no `TEAMS_DB` e no elenco vivo. Sem o uniforme, o
`buildKitAtlas` cai no fallback e os dois times entram de vermelho, calados. O
ELENCO dela é derivado (`Elenco.selecao`), não envelhece e não vai para o save.

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

**Nenhuma tela da carreira pode ficar sem saída.** O painel de dia de jogo
SUBSTITUI o de dia livre, que é onde mora o AVANÇAR DIA — quando o adversário
não resolvia (fase de copa sem chave, convocação desfeita), o jogador ficava
preso olhando "Aguardando próxima rodada..." sem nada para clicar. Painel sem
adversário cai de volta no de dia livre, com o aviso por cima.

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

**Dificuldade é FATOR, nunca `if`.** Quem consome pergunta
`Dificuldade.fator(chave)` e multiplica um número que já existia (ficha do
rival, intervalo de decisão da IA, alcance do goleiro). `decisao` e `goleiro`
valem só para o lado ADVERSÁRIO — no fácil, piorar o time do usuário seria
punir quem escolheu o fácil.

**O slot 1 do save fica na chave ANTIGA** (`phaser_football_career`, sem
sufixo): é a compatibilidade com quem já tinha carreira. Slot novo é
`_2`/`_3`, e tudo passa por `CareerMode.chaveDoSlot()`.

**A chave da Copa do Mundo mora no `CareerMode`, de propósito.** O invariante
que proíbe bracket local é sobre copa de CLUBE, que vive em `world.season` —
seleção não existe lá. BYE distribuído um por confronto, como no resto.

**Nada de nome de competição ou ID escrito na UI.** Copa vem de
`playerCupStatus()`/`playerCupName()`, liga de `playerLeagueName()`, nome de
clube de `CareerMode.clubLabel(id)`. `type` é literal estrutural e não vira
texto — o nome de exibição está em `competitionName`.

**`initializeWorld()` é idempotente.** Mundo vivo não é regerado: `this.world`
guarda tabelas e chaveamentos em andamento. Para um mundo novo, zere
`this.world` antes (só a virada de temporada faz isso).

**O elenco do mundo é VIVO, e a porta é `getTeamRoster()`.** Ele pergunta ao
`Elenco` (idade, rating envelhecido, garoto da base) antes de cair no
`REAL_ROSTERS`, que virou ponto de partida e não a verdade. Quem ler o banco
cru congela a força dos clubes para sempre — foi o que o `starterRating` fazia.
Aposentado sai e a cria entra NA MESMA POSIÇÃO (senão o clube perde o goleiro),
e `_reequilibrar()` segura a deriva: sem ele o mundo caía de 79.9 para 73.8 de
média em dez temporadas e o usuário enfrentava uma liga derretida.

**`_fecharTemporada()` é a PRIMEIRA linha de `startNewSeason()`.** Prêmio,
história, seleção e contrato leem as estatísticas do ano — e as linhas
seguintes zeram exatamente esses números. `_envelhecerMundo()` vem depois de
`this.world = null` e antes de recriar tabela e artilharia, que leem rating de
elenco.

**Aparência de NPC é determinística.** Nunca reintroduza `Math.random`/
`GetRandom` para pele e cabelo: vem de hash do `id` em `getPlayerAppearance()`.

**Falta é bote ERRADO que pega o homem, e o juiz é o anfitrião.** O ramo de
bote limpo nunca apita. Tudo passa por `chamarFalta()` e o ponto viaja em
`_faltaPonto` (o reposicionamento é 400ms depois, no fim do fade). Dentro da
área é `PENALTY`, fora é `FREE_KICK` recuado até a linha da área. "É bola
parada?" é `ehBolaParada(state)`: a tripla `THROW_IN/CORNER/GOAL_KICK` estava
copiada em `Player`, `Enemy` e `AIBrain`, e estado novo só valia em quem fosse
editado. **Não há impedimento e isso não é pendência** — é futsal 5v5.

**Expulso sai das LISTAS, não do jogo.** `expulsar()` filtra
`allPlayers`/`allies`/`enemies`/`playerTeam` e desliga corpo e sprite; destruir
quebraria `lastTouch`, o replay e o colisor do `create()`, que seguem apontando
para ele. Em LAN a expulsão não acontece (o convidado endereça por
`lado_POSICAO` e não recebe o evento — sobraria um fantasma no campo dele).
Por isso **quem reposiciona itera a LISTA, nunca `enemies[3]`**: o `resetMatch`
tinha índice fixo e o primeiro gol depois de uma expulsão morria em
`undefined.setPosition`. A fonte é `allPlayers`, a mesma que o `update()` lê.

**`bot.tactic` é LIDO.** `FORMATION.SHAPES` tem uma forma por tática e
`TacticManager.shapeOf()` é a única porta — nada de voltar a um `SHAPE` único,
que foi o que deixou `tactic` sendo escrito pelo `GameScene` inteiro sem mudar
um pixel. Tática desconhecida cai no 3-1; quem define é `playerTactic` /
`enemyTactic` da cena.

**IA tem UM cérebro.** `AIBrain` (FSM de `AI_STATES`) é o único lugar com
decisão de IA de linha; `Player` e `Enemy` só delegam. Nada de reabrir
`updateEnemyAI` com lógica própria — foi assim que o time do usuário passou meio
projeto sem saber passar a bola. Entidade guarda `aiState`, o cérebro é estático.

**Movimento de jogador é Arcade: `setAcceleration` + `setDrag`.** Nada de voltar
a integrar velocidade na mão. E `maxVelocity` do Arcade é **por eixo** — o teto
de verdade é o clamp por MÓDULO logo depois, senão a diagonal corre 1,41x.
Quem zera velocidade zera aceleração junto. Knobs em `PLAYER_PHYSICS`.

**Câmera de jogo tem UMA porta: `seguirCamera()`.** Z alterna entre seguir o
boneco e seguir a bola (`cameraAlvo`), e sem argumento o método REAPLICA o modo
— é assim que troca de jogador, expulsão, fim de replay, fim do pan do chute e
volta da rede respeitam a escolha. Com `startFollow` cravado nesses seis
lugares, qualquer modo novo durava até a próxima troca de jogador.

**Mouse: esquerdo é chute, direito é passe.** Um botão, uma função — clique
curto no esquerdo NÃO vira passe.

**Bote e carrinho começam num lugar só: `Player.iniciarBote()`.** Estático, e o
`Enemy` chama o mesmo — a troca de jogador põe um `Enemy` no comando, então o
bloco vivia copiado nos dois arquivos com `190/1050/1.38` cravados. Carrinho é
SHIFT+ESPAÇO (entrando correndo): mais alcance, mais velocidade, mais fôlego,
mais tempo no chão e cartão na falta. `isSliding` é escrito só ali, no INÍCIO do
bote — bote normal nunca herda o carrinho anterior, e bot nenhum dá carrinho.

**Falta é BANDA além do alcance, não raio fixo.** `distToVictim <= ballHitRange
+ FOUL.CONTACT_BAND`. Com raio fixo (52) o carrinho nunca cometia falta: ele
alcança 62 e pegava a bola antes, sempre — o cartão de entrada dura virava regra
morta. Amarelo sai por carrinho OU por reincidência (`FOUL.CARD_EVERY`); falta
comum sozinha não dá cartão, senão a partida vira chuva de amarelo.

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

**Cache do navegador engana, e a defesa é a URL.** Todo `<script>`/`<link>`
local do `index.html` carrega com `?v=<GAME_VERSION>`: versão nova é URL nova, e
URL nova o navegador não tem como servir do cache. Depois de mexer em
`GAME_VERSION` (constants.js), rode **`node versao.js`** — ele carimba as 40
tags sozinho, e fazer isso à mão se esquece na terceira entrega.

**Bump obrigatório em toda entrega** — MAJOR virada grande, MINOR feature, PATCH
correção. A versão aparece no canto superior direito de TODA tela; canto com
número velho continua significando cache, não regressão. E se o `index.html`
pedir uma versão e o JS que chegou for outra, o `main.js` grita no console e o
selo fica VERMELHO com as duas — é o pior caso possível (dois deploys
misturados) e antes disso ele era invisível.

**Feedback de partida é PROPORCIONAL, e o pó tem uma porta só.** Todo efeito
sai de um número que a jogada já produziu (força do chute, velocidade da bola,
`|vz|` do quique) e passa por `spawnImpactDust(x, y, cor, {forca, angulo,
abertura})` — `forca` 0..1 manda em quantidade, tamanho, distância e duração de
uma vez. Efeito de tamanho fixo diz "aconteceu algo" e nada mais. O rastro da
bola é velocidade (a curva é só piso), e a poeira de pé tem relógio POR
ENTIDADE: com um relógio global, dois carrinhos ao mesmo tempo dividem a mesma
nuvem. Tudo sob o efeito `particulas` do catálogo.

**O campo é INCLINADO, e a porta é `Perspectiva`.** A perspectiva é um zoom
assimétrico de câmera (`setZoom(z, z*k)`) — chão achatado, mundo intacto. Três
armadilhas: `cam.zoom` do Phaser 4 é a MÉDIA dos dois eixos e realimentá-lo
afunda a câmera sozinha (use `nivel()`); esticar o sprite estica o corpo Arcade
junto (`corpo()` devolve o hitbox); e o que é `scrollFactor(0)` não só espreme,
DESCE, porque a câmera achata em torno do centro (`tela()`). Quem está no chão
— sombra, círculo de stamina, linhas — fica achatado de propósito.

**Comando do jogador tem VALIDADE, e o ritmo mora em `GAME_FEEL`.** Passe e
chute pedidos com a bola chegando entram em `this.queuedPass` com carimbo `em` e
saem no domínio, dentro de `INPUT_BUFFER_MS` — sem o carimbo o boneco executa
minutos depois um comando esquecido. O ponteiro é COPIADO (o objeto do Phaser é
reaproveitado). E hitstop de gol NÃO passa por `applyHitStop()`: ela devolve a
velocidade da bola 110ms depois, quando a bola já foi reposta no meio.

**Aviso ao jogador é `UIHelper.toast()`, nunca um modal.** A pilha do canto não
bloqueia, some sozinha e aceita vários de uma vez; `toastFila()` despeja a fila
inteira do dia. O modal com OK que existia antes custava um clique e uma espera
POR AVISO — ninguém lia o terceiro. Toast montado à mão no `document.body`
também não: ele nasce fora do container do Phaser e não segue a cena.

**Camada DOM transparente precisa de `pointer-events: none !important`.**
`main.css` tem `#game-container > div * { pointer-events: auto }` —
especificidade 1-0-1, que ganha de qualquer classe. Sem o `!important` a camada
de avisos (invisível, do tamanho do canvas) engolia TODO clique da tela
enquanto houvesse um aviso. O sintoma não parece de CSS: parece que o jogo
travou até o toast sumir.

**Phaser escreve `display` INLINE no elemento do `add.dom`.** Inline ganha da
folha, então `display:flex` na classe daquele elemento vira `block` calado — foi
o que ancorou a pilha de avisos no canto errado. Layout de camada DOM vai num
FILHO. E quem fica por cima é a ordem no DOM, não `setDepth`: `main.css` crava
`z-index: 1000 !important` em toda camada, então reanexar o nó é o que o traz
para a frente.

**`#game-container > div` é esticado por `!important`.** A regra da camada DOM
do Phaser (main.css) força `top/left: 0`, `width/height: 100%` em TODO div filho
direto. Posicionar um overlay novo com `top`/`right` ali perde calado — o selo
de versão É a camada, e quem vai para o canto é o TEXTO (`text-align` +
`padding`).

**ONLINE é a mesma LAN, com sala.** `server/salas.js` só decide QUEM está em
qual sala; o `lobby.js` continua dono do que acontece DENTRO dela e o
`lansync.js` continua o único dono da sincronização. Todo broadcast (estado e
pacote de partida) é recortado por `S.colegas()` — sem isso duas partidas
online trocam bola entre si e o sintoma não parece de servidor.

**`sala.pareamento` separa fila de sala privada.** Só a fila começa sozinha ao
encher (não há lobby para clicar). Sala com código e sala LAN esperam o capitão
— iniciar sozinho ali arranca o lobby da mão de quem convidou.

**O modo é a PRIMEIRA mensagem, não um segundo protocolo.** `entrar` (LAN),
`procurar` (fila), `criar` e `entrar_codigo` divergem só no `onopen` do
`LobbyClient`. Daí em diante tudo é idêntico — inclusive a `GameScene`, que não
tem nenhum `if (isOnline)`: ela lê `data.lan` e pronto.

**Esquema do socket acompanha a página.** `LobbyClient.urlDe()` devolve `wss://`
em página https. Navegador recusa `ws://` em página segura e a falha vem MUDA —
o socket nem tenta abrir. É o que separa "funciona no localhost" de "funciona no
Netlify + Render".

**Nome de time é CHAVE do `TEAMS_DB`, nunca texto em maiúscula.**
`buildKitAtlas` cai em `|| TEAMS_DB.Flamengo`, então nome errado não quebra:
veste os dois times de vermelho e ninguém liga o sintoma à causa.

**Posicionar gente usa `postoBase()`, jogar usa `getTargetPosition()`.** O
tático depende do estado do instante; no instante do spawn a zona do pivô conta
como vazia, a rotação promove um ala e dois bonecos nascem colados (medido:
10px). O `applySpacing` não salva — ele mede posições atuais, não os alvos.

**Alvo da rede é PROJETADO, não perseguido cru.** `lanPontoPrevisto` soma
`velocidade × tempo desde o pacote`, com teto de 150ms. Não é simulação (sem
atrito, sem colisão): é o que tira o atraso de 50ms de tick + viagem. Passado o
teto congela — pacote perdido não pode virar invenção.

**Convidado não reseta partida.** `stopReplay` dele desvia para
`lanPararReplay`: quem repõe a bola no meio é o anfitrião. E durante o replay o
`applyLanPacket` ignora posição, senão o pacote ao vivo sobrescreve o quadro
gravado.

**Efeito visual tem UM dono.** `EfeitosVisuais` guarda, aplica e persiste; o
`CATALOGO` gera os interruptores das DUAS telas de configuração. `shake` solto
volta a sacudir a tela de quem desligou — use `EfeitosVisuais.tremer()`.

**O passe tem de CHEGAR.** A força sai da física em `passForceFor()`
(`v0 = d*k + chegada`, com teto), não de palpite. Já houve o caso de TODO passe
do jogo morrer antes do alvo — um toque de 200px partia a 246px/s e parava aos
96px. `PASS_SPEED_MAX / k` tem de cobrir `PASS_RANGE_MAX`, e o check no
`GameScene.js` trava essa relação.

**O som é GERADO, não carregado, e o Phaser continua fora disso.** Zero
`load.audio` e `audio: { noAudio: true }` seguem valendo — todo som nasce de
oscilador e ruído no `Som.js`, com contexto próprio criado no PRIMEIRO GESTO do
usuário (listeners no fim do `main.js`, fora do `READY`). Ligar `noAudio: false`
só criaria um segundo contexto, vazio, e devolveria o aviso do Chrome.

**Som é função pura de `(ctx, destino, t0, opções)`.** É isso que deixa o check
do boot RENDERIZAR cada receita num `OfflineAudioContext` e medir o pico — som
mudo e som estourado são os dois defeitos que ninguém percebe até estar no ar.
Receita que dependa de `Som.ctx` por dentro sai do alcance do check.

**A torcida é um loop que ninguém recolhe.** Igual ao placar em DOM: o Phaser
não sabe que ela existe, e ela seguiria tocando por cima do menu. `pararTorcida`
vai no `registerDOMTeardown`. Ela também não pode tocar no menu — quem separa é
`_emPartida`, senão religar o interruptor fora do jogo acende o estádio.

## Checks existentes (rodam no boot, gritam no console)
- `GameScene.render.js`: métodos no prototype + `colorMaterial` classificando
  20 cores medidas da arte real + ida/volta HSL + contraste preto/branco.
- `GameScene.input.js`: métodos no prototype + sinal/escala/clamp do
  `curveFromDrag`.
- `GameScene.js`: arbitragem — retângulo da área nos dois lados, a marca do
  pênalti caindo dentro dela, e a progressão do cartão (nada, amarelo, nada,
  vermelho + expulsão).
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
- `server/test_lobby.js` (27 asserts) e `server/test_salas.js` (33): regra da
  sala e registro de salas, sem abrir porta nenhuma. `npm test` dentro de
  `server/` roda os dois.
- `GameScene.lansync.js`: projeção do alvo da rede (sem tempo, meio da janela,
  no teto, além do teto, entidade parada, relógio para trás).
- `TacticManager.js`: losango, ocupação da área, giro, ruptura e `postoBase`
  sem colisão dentro do time. Mais as TRÊS táticas: postos únicos em cada uma,
  times diferentes entre elas, 2-2 com dois atrás e 4-0 em linha.
- `EfeitosVisuais.js`: sanitização do save de efeitos.
- `Dificuldade.js`: todo perfil com os três fatores (faltando um, a ficha do
  rival vira NaN e ele para de andar, sem erro no console).
- `CareerMode.js`: Copa do Mundo — chave cobrindo todas as seleções, BYE
  distribuído, e a chave fechando com UM campeão.
- `Som.js`: cada receita renderizada offline — nenhuma muda, nenhuma estoura o
  teto depois do volume mestre.
- `Elenco.js`: dez temporadas de mundo — elenco não encolhe, posições
  preservadas, ids únicos, todo mundo dentro da idade de carreira, e o bônus do
  artilheiro medido com a curva zerada (senão mede o sorteio).
- `CareerMode.js`: fim de temporada — prêmio só com gol no ano, história com os
  títulos DAQUELE ano, seleção convocando pela nota, contrato descendo e
  abrindo o mercado no fim do vínculo. Mais: uma atividade por dia; disciplina
  (3º amarelo suspende e zera o contador, vermelho suspende 2, suspenso e
  lesionado não entram); e a data FIFA nunca encostando em jogo de clube.
- `LobbyClient.js`: `urlDe` devolvendo o esquema certo (é a falha muda do
  deploy).
- `main.js`: mixins de `GameScene` presentes — pega mixin VELHO servido junto
  de um `GameScene.js` novo, que o check de dentro do próprio mixin não pega.

## Onde as coisas moram (mapa curto)

- **Partida:** `GameScene.js` + mixins `render` / `input` / `replay` / `hud` /
  `lan` / `lansync`. Mixin carrega DEPOIS do `GameScene.js`.
- **IA:** `AIBrain.js` (FSM), `TacticManager.js` (onde ficar).
- **Rede:** `LobbyClient.js` (cliente), `server/server.js` (transporte + rotas),
  `server/lobby.js` (regra da sala), `server/salas.js` (quais salas existem).
- **Carreira:** `CareerMode.js`, `SeasonManager.js`, `MatchSimulator.js`,
  `CalendarManager.js`.
- **Ajuste de jogo:** quase tudo em `constants.js`. Antes de mudar um número,
  confirme que quem usa realmente LÊ a constante.
