/**
 * Ponta cliente da sala de LAN. Só transporte: abre o socket, manda pedido,
 * guarda o último estado que o servidor mandou e avisa a cena.
 *
 * Nenhuma regra mora aqui de propósito — quem decide se a posição está livre é
 * o servidor (`server/lobby.js`). Repetir a regra no cliente criaria duas
 * verdades, e a do cliente perderia toda vez que dois jogadores clicassem
 * junto na mesma posição.
 */
class LobbyClient {
  constructor() {
    this.socket = null;
    this.estado = null; // último pacote do servidor
    this.meuId = null;
    this.aoAtualizar = () => {};
    this.aoIniciar = () => {};
    /** Pacote de partida vindo de outro cliente (posições, bola, bots). */
    this.aoRede = () => {};
    /** Modo ONLINE: o servidor achou (ou abriu) uma sala para este jogador. */
    this.aoParear = () => {};
    /** Código digitado que não existe no servidor. */
    this.aoSalaNaoEncontrada = () => {};
    this.codigoDaSala = null;
    this.procurando = false;
    /** "procurar" (fila) | "criar" (sala privada) | "codigo" | null (LAN) */
    this.modoOnline = null;
    this.aoFechar = () => {};
    this.aoErro = () => {};
  }

  /**
   * `host` vazio = descobrir sozinho (o "Criar Sala").
   *
   * Herdar `location.host` cru NÃO basta: durante o desenvolvimento a página
   * costuma vir de outro servidor estático (o `python -m http.server 8000`
   * deste projeto), e aí o palpite vira `ws://localhost:8000`, onde não existe
   * sala nenhuma — foi exatamente esse o erro relatado.
   *
   * Regra: se a página veio da porta do servidor de sala, herda tudo; senão,
   * herda só o HOSTNAME e usa a porta da sala. Se ainda assim falhar, tenta o
   * outro candidato antes de desistir — quem hospeda pode ter mudado a porta
   * com a variável PORT.
   */
  /**
   * `procurar: true` é o modo ONLINE: em vez de entrar na sala aberta do
   * servidor (o jeito LAN), pede pareamento e espera o servidor dizer em qual
   * sala caiu. O transporte é o MESMO — só muda a primeira mensagem.
   */
  conectar(host, nome, opcoes) {
    this.nome = nome;
    const o = opcoes || {};
    // `procurar: true` continua valendo (chamada antiga); `modo` é o caminho
    // novo, que distingue fila, sala criada e entrada por código.
    this.modoOnline = o.modo || (o.procurar ? "procurar" : null);
    this.codigoPedido = o.codigo || null;
    this.procurando = this.modoOnline === "procurar";
    const manual = host && host.trim();
    this.candidatos = manual
      ? [manual.includes(":") ? manual : manual + ":" + LobbyClient.PORTA]
      : LobbyClient.candidatosLocais();
    this.tentativa = 0;
    this._abrir();
  }

  /** Onde procurar a sala quando o jogador não digitou IP. */
  static candidatosLocais() {
    const porta = String(LobbyClient.PORTA);
    // Página servida PELO servidor de sala: o host inteiro já está certo.
    if (location.port === porta) return [location.host];
    // Servida por outro servidor (ou pela porta 80/443): mesmo micro, porta da sala.
    const comPortaDaSala = location.hostname + ":" + porta;
    return location.host && location.host !== comPortaDaSala
      ? [comPortaDaSala, location.host]
      : [comPortaDaSala];
  }

  _abrir() {
    const alvo = this.candidatos[this.tentativa];
    const url = LobbyClient.urlDe(alvo);
    this.ultimaUrl = url;
    try {
      this.socket = new WebSocket(url);
    } catch (e) {
      this.aoErro("Endereço inválido: " + url);
      return;
    }
    const nome = this.nome;
    // A PRIMEIRA mensagem é o que separa os modos. O resto do protocolo (sala,
    // partida, pacote de rede) é idêntico nos quatro casos.
    this.socket.onopen = () => {
      const m = this.modoOnline;
      if (m === "procurar") return this.enviar({ t: "procurar", nome });
      if (m === "criar") return this.enviar({ t: "criar", nome });
      if (m === "codigo")
        return this.enviar({ t: "entrar_codigo", nome, sala: this.codigoPedido });
      this.enviar({ t: "entrar", nome }); // LAN: sala aberta do servidor
    };
    this.socket.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.t === "rede") {
        this.aoRede(msg);
        return;
      }
      if (msg.t === "sala_encontrada") {
        this.codigoDaSala = msg.codigo;
        this.aoParear(msg);
        return;
      }
      if (msg.t === "sala_nao_encontrada") {
        this.codigoDaSala = null;
        this.aoSalaNaoEncontrada(msg);
        return;
      }
      if (msg.t === "partida") {
        this.meuId = msg.voce;
        this.aoIniciar(msg);
        return;
      }
      if (msg.t !== "sala") return;
      this.estado = msg;
      this.meuId = msg.voce;
      this.aoAtualizar(msg);
    };
    this.socket.onclose = () => this.aoFechar();
    this.socket.onerror = () => {
      // Falhou neste candidato: tenta o próximo antes de acusar o usuário.
      if (this.tentativa < this.candidatos.length - 1) {
        this.tentativa++;
        this._abrir();
        return;
      }
      this.aoErro(
        this.procurando
          ? "Servidor online fora do ar (" +
            this.candidatos.join(", ") +
            "). Tente a LAN ou volte mais tarde."
          : "Não achei sala em " +
            this.candidatos.map((c) => LobbyClient.urlDe(c)).join(" nem ") +
            ". Quem hospeda precisa rodar: node server/server.js",
      );
    };
  }

  enviar(msg) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  desconectar() {
    if (this.socket) this.socket.close();
    this.socket = null;
  }

  // ── atalhos de leitura, usados pela UI ────────────────────────────────────
  get eu() {
    return this.estado ? this.estado.sala.jogadores[this.meuId] : null;
  }
  souCapitaoDaSala() {
    return !!this.estado && this.estado.sala.capitaoDaSala === this.meuId;
  }
  souCapitaoDoTime(lado) {
    return !!this.estado && this.estado.sala.times[lado].capitao === this.meuId;
  }
  jogadoresDo(lado) {
    if (!this.estado) return [];
    return Object.values(this.estado.sala.jogadores).filter((j) => j.lado === lado);
  }
  /** Posição ocupada por OUTRO jogador do mesmo time = indisponível. */
  posicaoOcupadaPor(lado, posicao) {
    return this.jogadoresDo(lado).find((j) => j.posicao === posicao) || null;
  }
}

/**
 * Porta padrão do servidor de sala — a mesma do `server/server.js`. Quem mudar
 * lá (variável de ambiente PORT) entra pelo campo "ENTRAR POR IP" com
 * `ip:porta`, que tem prioridade sobre este palpite.
 */
/**
 * Endereço -> URL de socket.
 *
 * O ESQUEMA acompanha a página, e isso não é detalhe: o navegador recusa
 * `ws://` numa página `https://`, e a falha vem MUDA — o socket nem chega a
 * abrir e não existe mensagem de erro para mostrar ao jogador. Com o frontend
 * no Netlify (https por padrão) e o backend no Render, `wss://` é obrigatório.
 *
 * Aceita host cru (`abc.onrender.com`) ou URL inteira (`wss://abc.onrender.com`),
 * porque é natural colar a URL que o Render mostra.
 */
LobbyClient.urlDe = function (alvo) {
  const t = String(alvo || "").trim();
  if (/^wss?:\/\//i.test(t)) return t;
  const seguro =
    typeof location !== "undefined" && location.protocol === "https:";
  return (seguro ? "wss://" : "ws://") + t.replace(/^https?:\/\//i, "");
};

LobbyClient.PORTA = 8080;

/**
 * ▸▸ COLE AQUI A URL DO RENDER ◂◂
 *
 * Depois de criar o Web Service no Render, ele mostra algo como
 * `https://futebol-sala.onrender.com`. Cole o HOST (sem `https://` e SEM porta
 * — o Render serve na 443) nesta constante:
 *
 *   LobbyClient.ONLINE_HOST = "futebol-sala.onrender.com";
 *
 * O `wss://` entra sozinho porque a página do Netlify é https (ver `urlDe`).
 * Colar a URL inteira (`wss://futebol-sala.onrender.com`) também funciona.
 *
 * Vazio = mesmo host da página. Serve para quando o jogo é servido pelo
 * próprio `server/server.js` (LAN ou VPS única), e é por isso que o modo LAN
 * não depende de nada disto.
 */
LobbyClient.ONLINE_HOST = "https://futebol-top-down.onrender.com/";

// Check: o esquema do socket. É a falha MUDA do deploy — navegador recusa
// `ws://` em página https e o socket nem tenta abrir, sem erro para mostrar.
// Roda no boot porque `urlDe` é a única coisa entre "Netlify + Render" e
// "botão de partida online que não faz nada".
console.assert(
  (() => {
    const u = LobbyClient.urlDe;
    // `location` real do navegador: o esquema tem de acompanhar a página.
    const seguro = typeof location !== "undefined" && location.protocol === "https:";
    const esperado = seguro ? "wss://" : "ws://";
    return (
      u("abc.onrender.com") === esperado + "abc.onrender.com" &&
      u("192.168.0.10:8080") === esperado + "192.168.0.10:8080" &&
      // URL inteira colada do painel do Render passa intacta...
      u("wss://abc.onrender.com") === "wss://abc.onrender.com" &&
      u("ws://192.168.0.10:8080") === "ws://192.168.0.10:8080" &&
      // ...e `https://` colado por engano vira socket, não fica quebrado.
      u("https://abc.onrender.com") === esperado + "abc.onrender.com" &&
      u("  abc.onrender.com  ") === esperado + "abc.onrender.com"
    );
  })(),
  "LobbyClient.urlDe: esquema do socket errado — online não conecta em página https",
);
