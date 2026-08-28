/**
 * Sincronização da partida em LAN — mixin de prototype da `GameScene`.
 *
 * ARQUITETURA: autoridade no ANFITRIÃO. O servidor Node só repassa pacotes
 * (`{t:"rede"}`), não simula nada. Quem criou a sala é dono da verdade: bola,
 * bots e goleiros saem da simulação dele. Cada cliente é dono apenas do
 * próprio boneco.
 *
 *   convidado --(meu boneco: x,y,vx,vy)--> anfitrião
 *   anfitrião --(bola + bots + goleiros + placar)--> convidado
 *
 * Por que autoridade única e não cada um simulando o seu: com duas simulações
 * independentes a bola diverge no primeiro toque, e os dois jogadores passam a
 * ver partidas diferentes. Com um dono, a bola é UMA.
 *
 * ponytail: sem predição, sem interpolação, sem reconciliação — posição chega,
 * posição é aplicada. Em LAN (<5ms) isso já é jogável. Se um dia rodar pela
 * internet, o lugar de mexer é `aplicarEntidade` (interpolar entre o último
 * pacote e o novo), não a arquitetura.
 *
 * Carregar SEMPRE depois de GameScene.js.
 */
if (typeof GameScene === "undefined") {
  throw new Error("GameScene.lansync.js carregado antes de GameScene.js");
}

/** 20 pacotes por segundo. Acima disso a LAN aguenta, mas não muda nada visível. */
const LAN_TICK_MS = 50;

/** Abaixo disto o boneco está parado. Mesmo corte que o `updateAnimation` usa. */
const LAN_PARADO_PX = 10;

/**
 * Suavização por frame. 0.28 a 60fps fecha ~92% da distância no intervalo de um
 * pacote (50ms): rápido o bastante para não parecer atrasado, lento o bastante
 * para o olho não ver o degrau.
 */
const LAN_SUAVIZA = 0.28;

/**
 * Acima disto NÃO interpola, teleporta. Reinício de kickoff e troca de lado no
 * intervalo movem o boneco meio campo — deslizar isso pareceria patinação.
 */
const LAN_SALTO_PX = 260;

/**
 * Dead reckoning: por quanto tempo o alvo da rede é PROJETADO com a última
 * velocidade conhecida antes de congelar.
 *
 * O alvo perseguido é sempre passado: 50ms do intervalo de envio MAIS a
 * viagem até o outro cliente. Em LAN isso é quase nada; num servidor na
 * nuvem, com 100ms de ida, uma bola a 700px/s aparece ~105px atrás de onde
 * está de verdade — é o "engasgo" que o convidado sente.
 *
 * Projetar a velocidade que JÁ viaja no pacote recupera essa distância sem
 * ligar simulação nenhuma no convidado: não há atrito, colisão nem regra
 * aqui, só `posição + velocidade × tempo`. É o mesmo que a IA faz para
 * interceptar a bola.
 *
 * O TETO é o que impede isto de virar invenção: com pacote perdido, a
 * projeção seguiria em linha reta para sempre. Passado o teto o alvo congela
 * no último ponto conhecido e volta a valer o comportamento antigo —
 * atrasado, mas nunca fantasioso.
 */
const LAN_EXTRAPOLA_MAX_MS = 150;

/** Abaixo disto a entidade está parada: projetar só somaria tremor. */
const LAN_EXTRAPOLA_MIN_VEL = 30; // px/s

Object.assign(GameScene.prototype, {
  /** Liga o rádio. Sem `lan.cliente` (carreira, exibição) não faz nada. */
  startLanSync() {
    const lan = this.lan;
    if (!lan || !lan.cliente) return;

    this.rede = lan.cliente;
    this.souHostLan = !!lan.souHost;
    this.rede.aoRede = (msg) => this.applyLanPacket(msg);

    this.lanTimer = this.time.addEvent({
      delay: LAN_TICK_MS,
      loop: true,
      callback: () => this.sendLanPacket(),
    });

    // Phaser emite o evento, não chama o método (a armadilha do placar órfão).
    // Sem isto o timer continua batendo e o socket fica aberto ao sair.
    this.events.once("shutdown", () => {
      if (this.lanTimer) this.lanTimer.remove();
      if (!this.rede) return;
      // Callback sempre sai: a cena morreu, não pode continuar recebendo.
      this.rede.aoRede = () => {};
      // O socket só cai se a saída NÃO for para a tela de fim de jogo — de lá
      // dá para voltar ao lobby e jogar de novo sem reconectar (id de rede
      // novo quebraria a escalação).
      if (!this.isGameOver) this.rede.desconectar();
    });
  },

  /** Estado de uma entidade, enxuto: só o que muda todo frame. */
  lanEstadoDe(e) {
    return {
      x: Math.round(e.x),
      y: Math.round(e.y),
      vx: Math.round(e.body ? e.body.velocity.x : 0),
      vy: Math.round(e.body ? e.body.velocity.y : 0),
      a: Math.round(e.rotation * 100) / 100,
      // Janela da pose de chute. Sem isto o `updateAnimation` do outro cliente
      // nunca escolhe "kick" e o chute vira um passe invisível.
      // Nome `ch`, não `k`: `k` já é a CHAVE do bot no pacote, e o
      // `Object.assign` sobrescrevia a chave pelo flag — os bots sumiam da
      // sincronização do convidado.
      ch: e.kickAnimUntil && e.kickAnimUntil > this.time.now ? 1 : 0,
    };
  },

  sendLanPacket() {
    if (!this.rede || !this.player) return;

    const pacote = { t: "rede", eu: null };
    // Todo cliente é dono do próprio boneco, sempre.
    pacote.eu = Object.assign({ id: this.player.lanId }, this.lanEstadoDe(this.player));

    if (this.souHostLan) {
      // Só o anfitrião fala pela bola, pelos bots e pelos goleiros.
      if (this.ball) {
        pacote.bola = Object.assign(this.lanEstadoDe(this.ball), {
          z: Math.round((this.ball.z || 0) * 10) / 10,
          dono: this.ball.owner ? this.ball.owner.lanChave || null : null,
        });
      }
      pacote.bots = [];
      this.lanTodasEntidades().forEach((e) => {
        if (!e || e.isRemotePlayer || e === this.player || !e.active) return;
        pacote.bots.push(Object.assign({ k: e.lanChave }, this.lanEstadoDe(e)));
      });
      if (this.gkTop) pacote.bots.push(Object.assign({ k: "GK_esq" }, this.lanEstadoDe(this.gkTop)));
      if (this.gkBottom) pacote.bots.push(Object.assign({ k: "GK_dir" }, this.lanEstadoDe(this.gkBottom)));
      pacote.placar = {
        casa: this.scorePlayer,
        fora: this.scoreOpponent,
        estado: this.gameState,
        // Relógio e tempo também: o convidado não conta, só exibe. O nome do
        // campo no jogo é `timeLeft` (segundos restantes), não `matchTime`.
        seg: Math.round(this.timeLeft || 0),
        segundo: !!this.isSecondHalf,
        // De que lado o REMETENTE joga. "casa/fora" é sempre do ponto de vista
        // de quem envia; sem este campo o convidado copiava o placar espelhado
        // e via 1x0 quando estava perdendo de 0x1.
        lado: this.lan.meuLado,
      };
    }

    this.rede.enviar(pacote);
  },

  applyLanPacket(msg) {
    if (!msg) return;

    // Tocando o replay: só o que muda o RUMO da partida entra (gol, apito
    // final). Posição vinda da rede é ignorada — ela sobrescreveria o quadro
    // gravado e a jogada repetida viraria um borrão entre os dois.
    if (this.isReplaying) {
      if (msg.gol && !this.souHostLan) this.lanComemorarGol(msg.gol);
      if (msg.fim && !this.souHostLan) this.lanEncerrar(msg.fim);
      return;
    }

    // Chute vindo da rede: só o anfitrião executa (é ele quem tem a bola).
    if (msg.chute) this.lanAplicarChute(msg.chute);

    // Gol: ordem oficial do anfitrião. O convidado só obedece.
    if (msg.gol && this.lan && !this.souHostLan) this.lanComemorarGol(msg.gol);

    // Apito final: idem. O convidado nunca encerra por conta própria.
    if (msg.fim && this.lan && !this.souHostLan) this.lanEncerrar(msg.fim);

    // Boneco de outro humano: vale para os dois lados da conexão.
    if (msg.eu && msg.eu.id) {
      const alvo = this.lanTodasEntidades().find((e) => e && e.lanId === msg.eu.id);
      if (alvo && alvo !== this.player) this.aplicarEntidade(alvo, msg.eu);
    }

    // Bola, bots e placar só valem vindos do anfitrião. O host ignora — a
    // verdade dele é a simulação local, senão os dois se corrigiriam em
    // pingue-pongue.
    if (this.souHostLan) return;

    if (msg.bola && this.ball) {
      // A bola do convidado é DESENHO, não simulação. `body.moves = false` tira
      // o Arcade do caminho (atrito, integração de velocidade, colisão), senão
      // a física local puxa a bola de volta entre um pacote e outro.
      // `body.enable` também é reativado: a cola do portador o desliga, e um
      // corpo desabilitado ignora `setPosition` vindo do `reset`.
      if (this.ball.body) {
        this.ball.body.moves = false;
        this.ball.body.enable = true;
      }
      this.aplicarEntidade(this.ball, msg.bola);
      if (typeof msg.bola.z === "number") this.ball.z = msg.bola.z;
      // Dono também é do anfitrião: é o que faz o efeito de "bola no pé"
      // aparecer no jogador certo dos dois lados.
      this.ball.owner = msg.bola.dono ? this.lanPorChave(msg.bola.dono) : null;
      // DESENHAR. `this` do Ball é a SOMBRA; a bola mesmo é `visualBall`, e ela
      // só sai do lugar dentro do `updateVisual()`. Sem esta chamada o
      // convidado via a sombra deslizando sozinha pelo campo.
      this.ball.updateRotation(msg.bola.vx || 0, msg.bola.vy || 0);
      this.ball.updateVisual();
    }
    if (msg.bots) {
      msg.bots.forEach((b) => {
        const alvo = this.lanPorChave(b.k);
        if (alvo) this.aplicarEntidade(alvo, b);
      });
    }
    if (msg.placar) {
      // Mesma inversão que o evento de gol usa: sem ela os dois canais
      // discordavam e o periódico (20x/s) vencia o evento.
      const mesmoLado = !msg.placar.lado || msg.placar.lado === this.lan.meuLado;
      this.scorePlayer = mesmoLado ? msg.placar.casa : msg.placar.fora;
      this.scoreOpponent = mesmoLado ? msg.placar.fora : msg.placar.casa;
      // Estado da partida também vem de lá: sem isto o convidado ficava no
      // próprio ciclo de bola parada, repondo a bola no meio por conta própria.
      if (msg.placar.estado) this.gameState = msg.placar.estado;
      if (typeof msg.placar.seg === "number") this.timeLeft = msg.placar.seg;
      if (typeof msg.placar.segundo === "boolean") this.isSecondHalf = msg.placar.segundo;
    }
  },

  /**
   * Guarda o ALVO da rede em vez de cravar a posição.
   *
   * Cravar a 20Hz numa tela de 60fps dá o "soquinho": três frames parados e um
   * salto. O alvo é perseguido por `lanInterpolar()` todo frame. Velocidade e
   * rotação continuam sendo aplicadas na hora, porque quem lê velocidade é a
   * animação — e ela deve reagir ao pacote, não ao deslize.
   */
  aplicarEntidade(e, dado) {
    if (!e || !dado) return;

    const dist = Phaser.Math.Distance.Between(e.x, e.y, dado.x, dado.y);
    if (dist > LAN_SALTO_PX || !e.lanAlvo) {
      // Primeiro pacote ou teleporte (kickoff, virada de tempo): sem deslize.
      e.setPosition(dado.x, dado.y);
      if (e.body && e.body.reset) e.body.reset(dado.x, dado.y);
    }
    // O alvo guarda a velocidade e QUANDO chegou: é o que permite projetar o
    // ponto no `lanInterpolar`, em vez de perseguir uma posição já velha.
    e.lanAlvo = {
      x: dado.x,
      y: dado.y,
      vx: dado.vx || 0,
      vy: dado.vy || 0,
      t: this.time.now,
    };

    if (e.body && e.body.setVelocity) e.body.setVelocity(dado.vx || 0, dado.vy || 0);
    if (typeof dado.a === "number" && e.setRotation) e.setRotation(dado.a);
    this.animarPelaRede(e, dado);
  },

  /**
   * Persegue o alvo da rede, um passo por frame. Chamado do `update()` da cena.
   *
   * O passo é corrigido pelo delta real: com queda de fps, um fator fixo
   * andaria devagar demais e o boneco ficaria para trás do pacote.
   */
  lanInterpolar(delta) {
    if (!this.lan) return;
    const passo = 1 - Math.pow(1 - LAN_SUAVIZA, (delta || 16.7) / 16.7);

    const desliza = (e) => {
      if (!e || !e.lanAlvo || !e.active) return;
      const alvo = GameScene.lanPontoPrevisto(e.lanAlvo, this.time.now);
      e.x = Phaser.Math.Linear(e.x, alvo.x, passo);
      e.y = Phaser.Math.Linear(e.y, alvo.y, passo);
    };

    // Bonecos de outros humanos: valem nos dois lados da conexão.
    this.lanTodasEntidades().forEach((e) => {
      if (e && e.isRemotePlayer) desliza(e);
    });

    if (this.souHostLan) return;

    // No convidado, bots, goleiros e bola também são cópia.
    this.lanTodasEntidades().forEach((e) => {
      if (e && e !== this.player) desliza(e);
    });
    desliza(this.gkTop);
    desliza(this.gkBottom);
    if (this.ball && this.ball.lanAlvo) {
      desliza(this.ball);
      // A bola precisa REDESENHAR a cada passo: o sprite visível é o
      // `visualBall`, e ele só acompanha dentro do `updateVisual()`.
      this.ball.updateVisual();
    }
  },

  /**
   * Anima quem a rede comanda.
   *
   * O `update()` local desses bonecos está desligado (é o que impede a IA de
   * brigar com o pacote), e era ele que chamava `updateAnimation()` — daí os
   * bonecos deslizarem parados no frame idle.
   *
   * NÃO se escreve animação nova aqui: alimenta-se o que a entidade já tem.
   * `updateAnimation(true)` decide run/idle/kick lendo `body.velocity` (que
   * acabou de vir da rede) e monta a chave do atlas com `currentFacing`.
   * Escrever um `anims.play("run")` paralelo daria duas lógicas de animação
   * para manter — e erraria feio, porque este jogo NÃO usa `flipX`: o atlas
   * tem 8 direções por ação, e virar o sprite no eixo X mostraria o jogador
   * correndo de costas.
   */
  animarPelaRede(e, dado) {
    if (!e.anims) return;

    const vx = dado.vx || 0;
    const vy = dado.vy || 0;
    const parado = Math.hypot(vx, vy) <= LAN_PARADO_PX;

    // Direção pelo VETOR da velocidade da rede. Parado mantém o último facing:
    // recalcular com vetor zero jogaria todo mundo olhando para o mesmo lado a
    // cada frada de bola.
    if (!parado && typeof e.get8WayDirection === "function") {
      e.moveAngle = Phaser.Math.RadToDeg(Math.atan2(vy, vx));
      e.currentFacing = e.get8WayDirection(e.moveAngle);
    }

    // Goleiro tem `updateAnimation()` sem argumento e lê `customVel`, não o
    // corpo — por isso ele precisa do espelho preenchido antes.
    if (e.customVel && e.customVel.set) e.customVel.set(vx / 60, vy / 60);

    // Reabre a janela de chute do lado de cá para a pose aparecer.
    if (dado.ch) e.kickAnimUntil = this.time.now + (typeof KICK_ANIM_MS !== "undefined" ? KICK_ANIM_MS : 320);

    if (typeof e.updateAnimation === "function") {
      e.updateAnimation(e === this.gkTop || e === this.gkBottom ? undefined : true);
    }
  },

  /**
   * Chute do CONVIDADO: ele não tem autoridade sobre a bola, então em vez de
   * aplicar força local manda o evento para o anfitrião, que executa o mesmo
   * `kickBallFrom` com o boneco correspondente.
   *
   * Sem isto o convidado ficava assistindo: a perna dele se mexia e a bola não
   * saía do lugar, porque quem manda na física é o outro lado.
   */
  lanEnviarChute(kicker, tx, ty, forca, options) {
    if (!this.rede || !kicker || !kicker.lanId) return;
    // `options` carrega alvo de passe (entidade) em alguns caminhos — objeto não
    // atravessa a rede. Só os campos simples viajam; o resto o anfitrião
    // resolve com a simulação dele.
    const opcoes = {};
    Object.keys(options || {}).forEach((k) => {
      const v = options[k];
      if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
        opcoes[k] = v;
      }
    });
    this.rede.enviar({
      t: "rede",
      chute: { id: kicker.lanId, tx: Math.round(tx), ty: Math.round(ty), f: forca, o: opcoes },
    });
  },

  /** Anfitrião recebe o chute de outro jogador e aplica na SUA simulação. */
  lanAplicarChute(chute) {
    if (!this.souHostLan || !chute) return;
    const kicker = this.lanTodasEntidades().find((e) => e && e.lanId === chute.id);
    if (!kicker) return;
    // O anfitrião só aceita chute de quem está com a bola na simulação DELE —
    // é a autoridade valendo: sem isto um cliente poderia chutar do outro lado
    // do campo, ou dois jogadores chutariam a mesma bola no mesmo frame.
    if (this.ball && this.ball.owner !== kicker) return;
    this.kickBallFrom(kicker, chute.tx, chute.ty, chute.f, chute.o || {});
  },

  /**
   * Convidado recebendo o gol: comemora e atualiza o placar. NÃO chama
   * `resetMatch()` nem mexe em posição — a volta ao meio-campo chega nos
   * pacotes de posição do anfitrião, como qualquer outro movimento.
   */
  lanComemorarGol(gol) {
    // O placar vem pronto, mas os campos são "casa/fora" do ponto de vista de
    // QUEM ENVIOU. Se o anfitrião joga do outro lado, inverte.
    const mesmoLado = gol.marcouLado === this.lan.meuLado;
    this.scorePlayer = mesmoLado ? gol.casa : gol.fora;
    this.scoreOpponent = mesmoLado ? gol.fora : gol.casa;

    if (typeof this.showGoalCelebration === "function") {
      this.showGoalCelebration("GOOOL!", 0x00aa00);
    }
    if (this.updateHUD) this.updateHUD();

    // REPLAY no convidado. Sem isto ele só via a comemoração: o anfitrião
    // rodava o replay dele e, como durante o replay os bonecos do anfitrião
    // são movidos para as posições gravadas, o que chegava aqui pelo pacote
    // era a jogada repetida SEM a moldura de replay — bonecos saltando sem
    // explicação, e nenhum "REPLAY" na tela.
    //
    // O convidado tem o próprio buffer (ele grava todo frame, com as posições
    // que recebeu), então toca o dele, no mesmo instante, com a mesma UI.
    this.time.delayedCall(1200, () => {
      if (!this.isGameOver && !this.isReplaying) this.startReplay();
    });
  },

  /**
   * Convidado encerrando por ordem do anfitrião. Usa o placar e as estatísticas
   * do PACOTE, não os locais: é o que garante os mesmos números nas duas telas.
   */
  lanEncerrar(fim) {
    if (this.isGameOver) return;
    const mesmoLado = !fim.lado || fim.lado === this.lan.meuLado;
    this.scorePlayer = mesmoLado ? fim.casa : fim.fora;
    this.scoreOpponent = mesmoLado ? fim.fora : fim.casa;
    if (fim.stats) this.matchStats = fim.stats;
    if (fim.nota) this.playerMatchRating = fim.nota;

    // Libera o `endGame` original só desta vez — o gancho barra o resto.
    this._fimAutorizado = true;
    this.endGame();
  },

  /**
   * Fim do replay no CONVIDADO: volta a desenhar o que chega e para por aí.
   *
   * O `stopReplay` original termina em `resetMatch()`, que repõe bola e
   * jogadores no meio de campo. No convidado isso brigaria com o anfitrião —
   * ele é quem decide a saída de bola, e o reset local só criaria um solavanco
   * antes do próximo pacote corrigir tudo de volta.
   */
  lanPararReplay() {
    this.isReplaying = false;
    if (this.replayUI) this.replayUI.setAlpha(0);
    this.physics.world.resume();
    this.cameras.main.setZoom(1);
    this.cameras.main.stopFollow();
    if (this.player) this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.replayBuffer = [];
    this.gameState = GameStates.PLAYING;
  },

  lanTodasEntidades() {
    return [this.player, ...(this.allies || []), ...(this.enemies || [])];
  },

  lanPorChave(chave) {
    if (chave === "GK_esq") return this.gkTop;
    if (chave === "GK_dir") return this.gkBottom;
    return this.lanTodasEntidades().find((e) => e && e.lanChave === chave);
  },
});

/**
 * Gancho no APITO FINAL. Mesma regra do gol: um juiz só.
 *
 * No convidado, `endGame()` local é bloqueado — ele só encerra quando chega a
 * ordem. No anfitrião, roda normal e anuncia com as estatísticas para os dois
 * verem os MESMOS números.
 */
const _endGameOriginal = GameScene.prototype.endGame;
GameScene.prototype.endGame = function () {
  if (this.lan && !this.souHostLan && !this._fimAutorizado) return;
  if (this.lan && this.souHostLan && this.rede) {
    this.rede.enviar({
      t: "rede",
      fim: {
        casa: this.scorePlayer,
        fora: this.scoreOpponent,
        lado: this.lan.meuLado,
        stats: this.matchStats || null,
        nota: this.playerMatchRating || null,
      },
    });
  }
  return _endGameOriginal.call(this);
};

/**
 * Gancho no GOL. O sensor de gol é um `overlap` de física e dispara nos dois
 * clientes — mas juiz é um só. No convidado a detecção local morre aqui; no
 * anfitrião ela roda normalmente e vira anúncio na rede.
 */
const _handleGoalOriginal = GameScene.prototype.handleGoal;
GameScene.prototype.handleGoal = function (goalSide) {
  if (this.lan && !this.souHostLan) return; // convidado não apita
  const antesCasa = this.scorePlayer;
  const antesFora = this.scoreOpponent;
  const r = _handleGoalOriginal.call(this, goalSide);
  if (this.lan && this.souHostLan && this.rede) {
    // Só anuncia se o gol foi mesmo validado: `handleGoal` sai cedo em
    // `isResetting`/`isGameOver`, e anunciar assim mesmo faria o convidado
    // comemorar gol que não houve.
    const valeu = this.scorePlayer !== antesCasa || this.scoreOpponent !== antesFora;
    if (valeu) {
      this.rede.enviar({
        t: "rede",
        gol: {
          lado: goalSide,
          casa: this.scorePlayer,
          fora: this.scoreOpponent,
          autor: this.lastTouch ? this.lastTouch.athleteName : null,
          // Quem marcou visto DO LADO DE CÁ; o convidado inverte para saber se
          // foi a favor ou contra ele.
          marcouLado: this.lan.meuLado,
        },
      });
    }
  }
  return r;
};

/**
 * Gancho no chute. Envolve o método original em vez de editar as ~10 chamadas
 * espalhadas (mouse, gamepad, IA, bola parada): um ponto só decide se o chute
 * é executado aqui ou se vira pacote para o anfitrião.
 */
const _kickBallFromOriginal = GameScene.prototype.kickBallFrom;
GameScene.prototype.kickBallFrom = function (entity, targetX, targetY, forca, options) {
  const convidado = this.lan && !this.souHostLan;
  if (convidado && entity === this.player) {
    // Pose local imediata: esperar o pacote voltar faria o chute parecer travado.
    entity.kickAnimUntil =
      this.time.now + (typeof KICK_ANIM_MS !== "undefined" ? KICK_ANIM_MS : 320);
    this.lanEnviarChute(entity, targetX, targetY, forca, options);
    return;
  }
  // Convidado não simula chute de mais ninguém: o resultado chega pela rede.
  if (convidado) return;
  return _kickBallFromOriginal.call(this, entity, targetX, targetY, forca, options);
};

/**
 * Onde a entidade DEVE estar agora, projetando a última velocidade recebida.
 *
 * Pura de propósito: sem `this`, sem cena, sem Phaser — é a única parte da
 * sincronização que dá para testar sem abrir socket nem subir partida, e é
 * justamente a que erra em silêncio (bola adiantada demais quando um pacote
 * se perde, ou projeção que nunca acontece e o convidado segue engasgando).
 */
GameScene.lanPontoPrevisto = function (alvo, agora) {
  if (!alvo) return { x: 0, y: 0 };
  const vx = alvo.vx || 0;
  const vy = alvo.vy || 0;
  if (Math.abs(vx) + Math.abs(vy) < LAN_EXTRAPOLA_MIN_VEL) {
    return { x: alvo.x, y: alvo.y };
  }
  // Teto duplo: nunca projeta para trás (relógio zerado num restart de cena)
  // nem além da janela em que a velocidade recebida ainda vale.
  const dt =
    Math.min(Math.max((agora || 0) - (alvo.t || 0), 0), LAN_EXTRAPOLA_MAX_MS) /
    1000;
  return { x: alvo.x + vx * dt, y: alvo.y + vy * dt };
};

// Check: a projeção do alvo da rede. Errar aqui não emite nada no console — o
// sintoma é bola adiantada, ou o engasgo que a projeção deveria ter tirado.
console.assert(
  (() => {
    const P = GameScene.lanPontoPrevisto;
    const alvo = (vx, vy) => ({ x: 100, y: 100, vx, vy, t: 1000 });

    // Sem tempo decorrido, nada muda.
    const zero = P(alvo(600, 0), 1000);
    // 100ms a 600px/s = 60px à frente.
    const meio = P(alvo(600, 0), 1100);
    // Passado o teto, CONGELA: 1s de silêncio não vira 600px de invenção.
    const teto = P(alvo(600, 0), 2000);
    const noTeto = P(alvo(600, 0), 1000 + LAN_EXTRAPOLA_MAX_MS);
    // Entidade parada não é projetada.
    const parado = P(alvo(5, 5), 1500);
    // Relógio para trás (restart de cena) não puxa a entidade para trás.
    const passado = P(alvo(600, 0), 500);

    return (
      zero.x === 100 &&
      Math.abs(meio.x - 160) < 0.001 &&
      Math.abs(teto.x - noTeto.x) < 0.001 &&
      teto.x < 100 + 600 * 1 &&
      parado.x === 100 &&
      parado.y === 100 &&
      passado.x === 100 &&
      // Projeta nos dois eixos.
      Math.abs(P(alvo(0, -400), 1100).y - 60) < 0.001 &&
      // Alvo ausente não quebra o desenho.
      P(null, 1000).x === 0
    );
  })(),
  "GameScene.lansync.js: projeção do alvo da rede fora do esperado",
);

console.assert(
  ["startLanSync", "sendLanPacket", "applyLanPacket", "aplicarEntidade"].every(
    (m) => typeof GameScene.prototype[m] === "function",
  ),
  "GameScene.lansync.js: método faltando no prototype",
);
