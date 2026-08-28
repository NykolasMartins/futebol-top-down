/**
 * Multiplayer LAN: escolha de modo, entrada na sala e o lobby.
 *
 * Uma cena só com três telas (`modo` -> `lan` -> `sala`) em vez de três cenas:
 * a conexão precisa sobreviver à navegação, e trocar de cena derrubaria o
 * socket ou obrigaria a pendurá-lo no `window` — que é o anti-padrão que este
 * projeto já carrega com o `careerMode`.
 *
 * A UI é DOM (`add.dom`) e usa as classes `.pui-*`, como todas as outras telas.
 * Nenhuma regra de sala vive aqui: quem decide é o servidor.
 */
const POS_LABEL = {
  FIXO: "FIXO",
  ALA_ESQ: "ALA ESQ",
  ALA_DIR: "ALA DIR",
  PIVO: "PIVÔ",
};

class MultiplayerScene extends Phaser.Scene {
  constructor() {
    super({ key: "MultiplayerScene" });
  }

  init(data) {
    // Volta da partida: o socket veio junto e já está dentro da sala. Criar um
    // `LobbyClient` novo daria outro id de rede, e a escalação da revanche não
    // bateria com a que o servidor guarda.
    this.clienteHerdado = (data && data.cliente) || null;
  }

  create() {
    this.tela = this.clienteHerdado ? "sala" : "modo";
    this.aviso = "";
    this.lobby = this.clienteHerdado || new LobbyClient();
    this.indoParaPartida = false;
    this.lobby.aoAtualizar = () => {
      this.aviso = "";
      this.render();
    };
    this.lobby.aoErro = (m) => {
      this.aviso = m;
      // Quem estava procurando partida volta para a tela ONLINE: jogar o
      // jogador na tela de LAN com uma mensagem sobre servidor online é
      // trocar o assunto no meio do erro.
      if (this.tela !== "online") {
        this.tela = this.origemDaSala === "online" ? "online" : "lan";
      }
      this.procurando = false;
      this.render();
    };
    // Online: o servidor achou a sala. Ainda não é partida — é o "achei, agora
    // espera o outro" que faz a tela mostrar o código em vez de "procurando".
    this.lobby.aoParear = () => {
      if (this.tela === "online" || this.tela === "sala") this.render();
    };
    // Código errado (ou sala que já começou): devolve para a tela online com o
    // motivo. Sem isto o jogador ficaria olhando um lobby vazio para sempre,
    // achando que o amigo é que não entrou.
    this.lobby.aoSalaNaoEncontrada = (msg) => {
      this.lobby.desconectar();
      this.tela = "online";
      this.procurando = false;
      this.aviso =
        msg && msg.motivo === "iniciada"
          ? "Essa sala já começou a partida."
          : "Não achei a sala " + (msg && msg.codigo ? msg.codigo : "") + ".";
      this.render();
    };
    // O servidor manda um evento próprio quando a sala fecha a escalação.
    this.lobby.aoIniciar = (pacote) => this.abrirPartida(pacote);
    this.lobby.aoFechar = () => {
      // Indo para o campo, socket fechando é o esperado — não é queda.
      if (this.indoParaPartida) return;
      if (this.tela === "sala") {
        this.aviso = "A conexão caiu.";
        this.tela = this.origemDaSala === "online" ? "online" : "lan";
        this.render();
      } else if (this.tela === "online" && this.procurando) {
        this.aviso = "A conexão caiu.";
        this.procurando = false;
        this.render();
      }
    };

    // Duas armadilhas juntas aqui, as duas custaram tela preta:
    // 1. `setOrigin(0.5)` — sem ele o Phaser ancora o node pelo canto e o
    //    painel de 1000x600 nasce deslocado para fora da área visível.
    // 2. `createFromHTML` EMBRULHA o HTML num wrapper próprio, então
    //    `node.innerHTML` apaga o que estiver dentro: a raiz `.pui-root` tem
    //    de ser reescrita a cada render, não criada uma vez aqui.
    // 3. O wrapper precisa NASCER com tamanho. O Phaser mede o node na criação
    //    e usa isso para o deslocamento do origin — wrapper vazio mede 0x0, o
    //    deslocamento vira zero e o `setOrigin(0.5)` não centra nada.
    this.dom = this.add.dom(500, 300)
      .createFromHTML('<div class="pui-mp-wrap" style="width:1000px;height:600px;"></div>')
      .setOrigin(0.5);
    this.dom.addListener("click");
    this.dom.on("click", (ev) => this.clique(ev));

    // Phaser NÃO chama shutdown como método: é evento (mesma armadilha do
    // placar órfão). Sem isto o socket fica aberto depois de sair da tela.
    // Sair da tela fecha o socket — MENOS quando estamos indo para a partida,
    // que continua usando a mesma conexão.
    this.events.once("shutdown", () => {
      if (!this.indoParaPartida) this.lobby.desconectar();
    });

    // Reaproveitando conexão: pede o estado atual da sala para redesenhar.
    // O servidor responde o broadcast inteiro a qualquer comando conhecido.
    if (this.clienteHerdado) this.lobby.enviar({ t: "pronto", valor: false });

    this.render();
  }

  /** Nick fica no localStorage: ninguém quer digitar o nome a cada partida. */
  nickSalvo() {
    try {
      return (localStorage.getItem("lan_nick") || "").slice(0, 14);
    } catch (e) {
      return "";
    }
  }

  /** Lê o campo, guarda e devolve. Vazio vira um nome genérico. */
  lerNick() {
    const campo = this.dom.node.querySelector("#mp-nick");
    const nick = ((campo && campo.value) || "").trim().slice(0, 14);
    const final = nick || "Jogador " + Math.floor(Math.random() * 90 + 10);
    try {
      if (nick) localStorage.setItem("lan_nick", nick);
    } catch (e) {}
    return final;
  }

  /**
   * Ponte lobby -> campo.
   *
   * Reusa o caminho da partida de exibição de propósito: ele já monta 5v5,
   * HUD, goleiros e placar. O que a LAN acrescenta é o pacote `lan`, que o
   * mixin `GameScene.lan.js` usa para reetiquetar os bonecos (arquétipo, nome,
   * quem é o local). Criar um caminho de partida separado duplicaria tudo isso.
   *
   * Cada cliente entra como MANDANTE do próprio lado: o uniforme de casa é o
   * do time dele. Enquanto o movimento não trafega pela rede, é o que faz os
   * dois navegadores mostrarem a mesma sala do ponto de vista de cada um.
   */
  abrirPartida(pacote) {
    const meu = this.lobby.eu;
    const meuLado = meu && meu.lado ? meu.lado : "esq";
    const outro = meuLado === "esq" ? "dir" : "esq";
    // O fallback tem de ser CHAVE do TEAMS_DB, não o nome em maiúsculas: o
    // `buildKitAtlas` faz `TEAMS_DB[nome] || TEAMS_DB.Flamengo`, então
    // "FLAMENGO"/"PALMEIRAS" caíam os DOIS no Flamengo e os times entravam em
    // campo com o mesmo uniforme. Na partida rápida não há lobby para escolher
    // kit, então este caminho é o normal, não a exceção.
    const PADRAO_ESQ = "Flamengo";
    const PADRAO_DIR = "Palmeiras";
    const valido = (nome) =>
      nome && typeof TEAMS_DB !== "undefined" && TEAMS_DB[nome] ? nome : null;
    const uniforme = (lado) =>
      valido(pacote.times[lado].uniforme) ||
      (lado === "esq" ? PADRAO_ESQ : PADRAO_DIR);

    // Ordem importa: trocar de cena PRIMEIRO. Fechar o socket antes disparava
    // `aoFechar`, que devolvia a tela para o menu LAN e engolia a transição —
    // o cliente convidado ficava preso no lobby enquanto o anfitrião entrava
    // no jogo. O socket é fechado no `shutdown` da cena, que já existe.
    this.indoParaPartida = true;
    this.scene.start("GameScene", {
      isExhibition: true,
      homeTeam: uniforme(meuLado),
      awayTeam: uniforme(outro),
      duration: pacote.regras.duracaoMin,
      weather: "clear",
      lan: {
        meuId: this.lobby.meuId,
        meuLado,
        escalacoes: pacote.escalacoes,
        times: pacote.times,
        // O socket VIVO segue para a partida: é por ele que as posições
        // trafegam. Reconectar na GameScene daria outro id de rede e a
        // escalação não bateria mais.
        cliente: this.lobby,
        souHost: this.lobby.souCapitaoDaSala(),
      },
    });
  }

  render() {
    const corpo = {
      modo: () => this.telaModo(),
      lan: () => this.telaLan(),
      online: () => this.telaOnline(),
      sala: () => this.telaSala(),
    }[
      this.tela
    ]();
    this.dom.node.innerHTML =
      '<div class="pui-root pui-mp-root" style="width:1000px;height:600px;">' +
      corpo +
      "</div>";
    // O conteúdo muda de tela para tela; sem remedir, o origin fica com o
    // tamanho antigo e o painel escorrega.
    if (this.dom.updateSize) this.dom.updateSize();
  }

  telaModo() {
    return [
      '<div class="pui-panel-title pui-mp-titulo">MULTIPLAYER</div>',
      '<div class="pui-menu-buttons pui-mp-col">',
      '  <button class="pui-btn pui-btn-green" id="mp-lan">LAN &nbsp;—&nbsp; REDE LOCAL</button>',
      '  <button class="pui-btn pui-btn-gold" id="mp-online">ONLINE &nbsp;—&nbsp; PARTIDA RÁPIDA</button>',
      '  <button class="pui-btn pui-btn-secondary" id="mp-voltar">VOLTAR</button>',
      "</div>",
    ].join("");
  }

  /**
   * Online é pareamento, não lobby: não há lado nem posição para escolher, o
   * servidor decide isso quando a sala fecha. Por isso a tela é só nome +
   * espera — reaproveitar `telaSala()` aqui mostraria controles que ninguém
   * pode usar.
   */
  /**
   * Online tem três caminhos, e só o primeiro dispensa lobby:
   *
   *   PARTIDA RÁPIDA  fila 1v1, o servidor pareia e começa sozinho;
   *   CRIAR SALA      sala privada com código — daí em diante é a MESMA tela
   *                   de lobby da LAN (`telaSala`), com lado, posição e o
   *                   capitão clicando INICIAR;
   *   ENTRAR POR CÓDIGO  o convidado digita os 4 dígitos que o anfitrião ditou.
   */
  telaOnline() {
    const codigo = this.lobby.codigoDaSala;
    return [
      '<div class="pui-panel-title pui-mp-titulo">ONLINE</div>',
      '<div class="pui-menu-buttons pui-mp-col">',
      this.procurando
        ? '  <div class="pui-mp-dica">' +
          (codigo
            ? "NA SALA <b>" + codigo + "</b> — esperando adversário…"
            : "PROCURANDO ADVERSÁRIO…") +
          "</div>"
        : [
            '  <div class="pui-mp-dica">SEU NOME EM CAMPO</div>',
            '  <input class="pui-input" id="mp-nick-online" maxlength="14" placeholder="Digite seu nick" value="' +
              this.nickSalvo() + '" />',
            '  <button class="pui-btn pui-btn-green" id="mp-procurar">PARTIDA RÁPIDA &nbsp;1v1</button>',
            '  <div class="pui-mp-dica">Fila aberta: você joga o pivô, o resto do time é bot dos dois lados.</div>',
            '  <button class="pui-btn pui-btn-gold" id="mp-criar-online">CRIAR SALA COM CÓDIGO</button>',
            '  <div class="pui-mp-dica">Você vira o anfitrião e divulga o código de 4 dígitos.</div>',
            '  <div class="pui-mp-linha">',
            '    <input class="pui-input" id="mp-codigo" maxlength="4" inputmode="numeric" placeholder="0000" />',
            '    <button class="pui-btn pui-btn-blue" id="mp-entrar-codigo">ENTRAR</button>',
            "  </div>",
          ].join(""),
      this.aviso ? '<div class="pui-mp-aviso">' + this.aviso + "</div>" : "",
      '  <button class="pui-btn pui-btn-secondary" id="mp-voltar-modo">VOLTAR</button>',
      "</div>",
    ].join("");
  }

  telaLan() {
    return [
      '<div class="pui-panel-title pui-mp-titulo">LAN</div>',
      '<div class="pui-menu-buttons pui-mp-col">',
      '  <div class="pui-mp-dica">SEU NOME EM CAMPO</div>',
      '  <input class="pui-input" id="mp-nick" maxlength="14" placeholder="Digite seu nick" value="' +
        this.nickSalvo() + '" />',
      '  <button class="pui-btn pui-btn-green" id="mp-criar">CRIAR SALA</button>',
      '  <div class="pui-mp-dica">Quem cria roda <b>node server/server.js</b> e passa o IP que aparecer no terminal.</div>',
      '  <div class="pui-mp-linha">',
      '    <input class="pui-input" id="mp-ip" placeholder="192.168.0.10:8080" />',
      '    <button class="pui-btn pui-btn-blue" id="mp-entrar">ENTRAR POR IP</button>',
      "  </div>",
      this.aviso ? '<div class="pui-mp-aviso">' + this.aviso + "</div>" : "",
      '  <button class="pui-btn pui-btn-secondary" id="mp-voltar-modo">VOLTAR</button>',
      "</div>",
    ].join("");
  }

  telaSala() {
    const e = this.lobby.estado;
    if (!e) return '<div class="pui-panel-title pui-mp-titulo">CONECTANDO…</div>';

    const eu = this.lobby.eu;
    const dono = this.lobby.souCapitaoDaSala();
    const total = Object.keys(e.sala.jogadores).length;

    const tempos = [3, 5, 10]
      .map(
        (m) =>
          '<button class="pui-btn ' +
          (e.sala.regras.duracaoMin === m ? "pui-btn-gold" : "pui-btn-secondary") +
          ' mp-tempo" data-min="' + m + '">' + m + " MIN</button>",
      )
      .join("");

    return [
      '<div class="pui-mp-topo">',
      '  <div class="pui-panel-title">' +
        (this.lobby.codigoDaSala ? "SALA " + this.lobby.codigoDaSala : "SALA LAN") +
        "</div>",
      '  <div class="pui-mp-dica">' + total + " na sala" + (dono ? " · você criou" : "") + "</div>",
      "</div>",
      '<div class="pui-mp-times">',
      this.colunaTime("esq", "MANDANTE"),
      this.colunaTime("dir", "VISITANTE"),
      "</div>",
      '<div class="pui-mp-rodape">',
      dono
        ? '<div class="pui-mp-regras"><span class="pui-mp-dica">TEMPO</span>' + tempos + "</div>"
        : '<div class="pui-mp-dica">Tempo: ' + e.sala.regras.duracaoMin + " min (definido por quem criou)</div>",
      '  <div class="pui-mp-linha">',
      '    <button class="pui-btn ' + (eu && eu.pronto ? "pui-btn-green" : "pui-btn-gold") + '" id="mp-pronto">' +
        (eu && eu.pronto ? "PRONTO ✔" : "ESTOU PRONTO") +
        "</button>",
      dono
        ? '    <button class="pui-btn ' + (e.podeIniciar ? "pui-btn-primary" : "pui-btn-disabled") +
          '" id="mp-iniciar" ' + (e.podeIniciar ? "" : "disabled") + ">INICIAR PARTIDA</button>"
        : "",
      "  </div>",
      "</div>",
      e.impedimentos.length ? '<div class="pui-mp-aviso">' + e.impedimentos.join(" · ") + "</div>" : "",
      '<button class="pui-btn pui-btn-secondary pui-mp-sair" id="mp-sair">SAIR DA SALA</button>',
    ].join("");
  }

  colunaTime(lado, titulo) {
    const e = this.lobby.estado;
    const time = e.sala.times[lado];
    const membros = this.lobby.jogadoresDo(lado);
    const souCap = this.lobby.souCapitaoDoTime(lado);
    const eu = this.lobby.eu;
    const cheio = membros.length >= 4 && (!eu || eu.lado !== lado);

    const posicoes = ["FIXO", "ALA_ESQ", "ALA_DIR", "PIVO"]
      .map((p) => {
        const ocupante = this.lobby.posicaoOcupadaPor(lado, p);
        const minha = ocupante && ocupante.id === this.lobby.meuId;
        const travada = ocupante && !minha;
        return (
          '<button class="pui-btn ' +
          (minha ? "pui-btn-green" : travada ? "pui-btn-disabled" : "pui-btn-secondary") +
          ' mp-pos" data-lado="' + lado + '" data-pos="' + p + '" ' + (travada ? "disabled" : "") + ">" +
          POS_LABEL[p] + (ocupante ? "<br><small>" + ocupante.nome + "</small>" : "") +
          "</button>"
        );
      })
      .join("");

    const lista =
      membros
        .map(
          (m) =>
            '<div class="pui-mp-jogador' + (m.pronto ? " pronto" : "") + '">' +
            "<span>" + (m.id === time.capitao ? "★ " : "") + m.nome + "</span>" +
            "<span>" + (m.posicao ? POS_LABEL[m.posicao] : "—") + (m.pronto ? " ✔" : "") + "</span>" +
            "</div>",
        )
        .join("") || '<div class="pui-mp-dica">time vazio</div>';

    const painelCapitao = souCap
      ? [
          '<div class="pui-mp-cap">',
          '  <div class="pui-mp-dica">VOCÊ É CAPITÃO DESTE TIME</div>',
          '  <button class="pui-btn pui-btn-gold mp-uniforme" data-lado="' + lado + '">UNIFORME: ' +
            (time.uniforme || "sortear") + "</button>",
          '  <button class="pui-btn ' + (time.preencherComBots ? "pui-btn-primary" : "pui-btn-secondary") +
            ' mp-bots" data-lado="' + lado + '">VAGAS: ' +
            (time.preencherComBots ? "COM BOTS" : "JOGAR COM MENOS") + "</button>",
          "</div>",
        ].join("")
      : "";

    return [
      '<div class="pui-panel pui-mp-time">',
      '  <div class="pui-panel-header">',
      '    <span class="pui-panel-title">' + titulo + "</span>",
      '    <span class="pui-mp-dica">' + membros.length + "/4</span>",
      "  </div>",
      '  <div class="pui-panel-body pui-mp-corpo">',
      '    <button class="pui-btn ' +
        (eu && eu.lado === lado ? "pui-btn-green" : cheio ? "pui-btn-disabled" : "pui-btn-blue") +
        ' mp-lado" data-lado="' + lado + '" ' + (cheio ? "disabled" : "") + ">" +
        (eu && eu.lado === lado ? "VOCÊ ESTÁ AQUI" : cheio ? "TIME CHEIO" : "ENTRAR NESTE TIME") +
        "</button>",
      '    <div class="pui-mp-grid">' + posicoes + "</div>",
      '    <div class="pui-mp-lista">' + lista +
        '<div class="pui-mp-jogador bot"><span>GOLEIRO</span><span>BOT</span></div></div>',
      painelCapitao,
      "  </div>",
      "</div>",
    ].join("");
  }

  clique(ev) {
    const alvo = ev.target.closest("button, [id]");
    if (!alvo || alvo.disabled) return;
    const id = alvo.id;
    const dado = (n) => alvo.dataset[n];

    if (id === "mp-voltar") return this.scene.start("MenuScene");
    if (id === "mp-lan") {
      this.tela = "lan";
      this.aviso = "";
      return this.render();
    }
    if (id === "mp-online") {
      this.tela = "online";
      this.aviso = "";
      this.procurando = false;
      return this.render();
    }
    if (id === "mp-criar-online" || id === "mp-entrar-codigo") {
      const nickEl = this.dom.node.querySelector("#mp-nick-online");
      const nick = (nickEl && nickEl.value.trim()) || this.lerNick();
      const criar = id === "mp-criar-online";
      let codigo = null;
      if (!criar) {
        const campo = this.dom.node.querySelector("#mp-codigo");
        codigo = (campo && campo.value) || "";
        if (codigo.replace(/\D/g, "").length < 4) {
          this.aviso = "Digite os 4 dígitos do código.";
          return this.render();
        }
      }
      // Sala com código usa o MESMO lobby da LAN — por isso a tela vira "sala".
      // `origemDaSala` é o que faz VOLTAR e QUEDA devolverem para a tela certa:
      // jogar quem estava online na tela de LAN é trocar o assunto.
      this.origemDaSala = "online";
      this.tela = "sala";
      this.aviso = "";
      this.render();
      this.lobby.conectar(LobbyClient.ONLINE_HOST, nick, {
        modo: criar ? "criar" : "codigo",
        codigo,
      });
      return;
    }

    if (id === "mp-procurar") {
      // Mesmo transporte da LAN; o que muda é a PRIMEIRA mensagem
      // (`procurar` em vez de `entrar`) e o endereço do servidor.
      const campo = this.dom.node.querySelector("#mp-nick-online");
      const nick = (campo && campo.value.trim()) || this.lerNick();
      this.procurando = true;
      this.aviso = "";
      this.render();
      this.lobby.conectar(LobbyClient.ONLINE_HOST, nick, { procurar: true });
      return;
    }
    if (id === "mp-voltar-modo") {
      // Sair da fila fecha o socket: ficar pendurado seguraria uma vaga de
      // sala online que nunca seria preenchida.
      if (this.procurando) {
        this.procurando = false;
        this.lobby.desconectar();
      }
      this.tela = "modo";
      this.aviso = "";
      return this.render();
    }

    if (id === "mp-criar" || id === "mp-entrar") {
      // "Criar sala" NÃO sobe processo: o navegador não pode. Ele conecta no
      // servidor que serviu esta página, e quem o iniciou é o dono da sala.
      // Lê os DOIS campos antes de trocar de tela: o `render()` da sala apaga
      // o formulário, e ler depois devolvia string vazia — o nick digitado
      // virava "Jogador 35".
      const campo = this.dom.node.querySelector("#mp-ip");
      const host = id === "mp-criar" ? "" : campo && campo.value;
      const nick = this.lerNick();
      this.origemDaSala = "lan";
      this.tela = "sala";
      this.aviso = "";
      this.render();
      this.lobby.conectar(host, nick);
      return;
    }

    if (id === "mp-sair") {
      this.lobby.desconectar();
      this.tela = this.origemDaSala === "online" ? "online" : "lan";
      return this.render();
    }
    if (id === "mp-pronto") {
      const atual = this.lobby.eu && this.lobby.eu.pronto;
      return this.lobby.enviar({ t: "pronto", valor: !atual });
    }
    if (id === "mp-iniciar") return this.lobby.enviar({ t: "iniciar" });

    if (alvo.classList.contains("mp-lado")) {
      return this.lobby.enviar({ t: "lado", lado: dado("lado") });
    }
    if (alvo.classList.contains("mp-pos")) {
      return this.lobby.enviar({ t: "posicao", posicao: dado("pos") });
    }
    if (alvo.classList.contains("mp-tempo")) {
      return this.lobby.enviar({ t: "regras", regras: { duracaoMin: Number(dado("min")) } });
    }
    if (alvo.classList.contains("mp-bots")) {
      const lado = dado("lado");
      const atual = this.lobby.estado.sala.times[lado].preencherComBots;
      return this.lobby.enviar({ t: "bots", lado, valor: !atual });
    }
    if (alvo.classList.contains("mp-uniforme")) {
      const lado = dado("lado");
      const ids = Object.keys(typeof TEAMS_DB !== "undefined" ? TEAMS_DB : {}).filter(
        (k) => k !== "__preview",
      );
      if (!ids.length) return;
      const outro = lado === "esq" ? "dir" : "esq";
      const doAdversario = this.lobby.estado.sala.times[outro].uniforme;
      const atual = this.lobby.estado.sala.times[lado].uniforme;
      // Pula o uniforme do adversário: o servidor recusaria e o botão pareceria
      // travado.
      let i = (ids.indexOf(atual) + 1) % ids.length;
      if (ids[i] === doAdversario) i = (i + 1) % ids.length;
      return this.lobby.enviar({ t: "uniforme", lado, uniforme: ids[i] });
    }
  }
}
