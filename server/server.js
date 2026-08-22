/**
 * Servidor de LAN: serve o jogo e hospeda a sala.
 *
 *   node server/server.js        → http://<seu-ip>:8080
 *
 * ZERO dependência de propósito. O handshake e o enquadramento de WebSocket
 * cabem em ~80 linhas de `http` + `crypto`, e isso mantém o LAN como "copiar a
 * pasta e rodar" — com `ws` do npm, todo amigo que hospedasse precisaria de
 * `npm install` antes de jogar.
 *
 * ponytail: implementa só o necessário para JSON de sala — frame de texto,
 * FIN=1, payload até 64KB, ping/pong e close. Sem continuação, sem binário,
 * sem compressão. Se um dia isto carregar o ESTADO DA PARTIDA (60 pacotes por
 * segundo, binário), troque por `ws` em vez de crescer este arquivo.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const L = require("./lobby");
const S = require("./salas");

// O Render (e qualquer PaaS) injeta a porta em `PORT` e recusa porta fixa. O
// fallback 8080 é o do modo LAN e casa com `LobbyClient.PORTA` — mudar só um
// dos dois quebra a descoberta automática de sala na rede local.
const PORTA = Number(process.env.PORT) || 8080;
const RAIZ = path.join(__dirname, "..");
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"; // RFC 6455

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
};

// ── HTTP: serve o jogo ──────────────────────────────────────────────────────
const servidor = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]);

  // Sinal de vida para o monitor externo (UptimeRobot) segurar a máquina
  // acordada no plano free do Render, que hiberna depois de ~15min parada.
  //
  // Rota PRÓPRIA, e não a raiz: no Render sobe só a pasta `server/`, sem
  // index.html — `GET /` cairia no 404 do servidor de arquivos e o monitor
  // marcaria o serviço como fora do ar justamente quando ele está de pé.
  if (rel === "/health" || rel === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Servidor Online");
    return;
  }

  const arquivo = path.join(RAIZ, rel === "/" ? "index.html" : rel);
  // Sem isto, `GET /../../secret` sairia da pasta do jogo.
  if (!arquivo.startsWith(RAIZ)) {
    res.writeHead(403).end("fora da raiz");
    return;
  }
  fs.readFile(arquivo, (erro, dados) => {
    if (erro) {
      // Sem arquivo estático (deploy só do backend), a raiz responde 200 assim
      // mesmo: quem abre a URL do Render no navegador vê que está no ar, e um
      // monitor apontado para `/` não acusa queda falsa.
      if (rel === "/") {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Servidor Online — sala de partidas. O jogo é servido à parte.");
        return;
      }
      res.writeHead(404).end("404");
      return;
    }
    res.writeHead(200, {
      "Content-Type": TIPOS[path.extname(arquivo)] || "application/octet-stream",
      // Cache mordeu este projeto a sessão inteira. Em dev, nunca cachear.
      "Cache-Control": "no-store",
    });
    res.end(dados);
  });
});

// ── WebSocket ───────────────────────────────────────────────────────────────
// Registro de salas. O modo LAN vive inteiro na sala `S.PADRAO` e não sabe que
// existem outras — quem entra sem pedir sala nenhuma cai lá, como sempre foi.
// O modo ONLINE cria uma sala por par de jogadores (ver server/salas.js).
const registro = S.novoRegistro();
const salaPadrao = S.obter(registro, S.PADRAO);
const clientes = new Map(); // id -> socket
const vivos = new Map(); // id -> instante do último sinal de vida

// Socket meio-aberto não dispara `close`: wi-fi que cai ou tampa de notebook
// fechada deixam um jogador FANTASMA na sala, com time e posição, que nunca
// confirma e trava o INICIAR para todo mundo. O ping resolve na raiz.
const PING_MS = 15000;
const SILENCIO_MAX_MS = 40000;
setInterval(() => {
  const agora = Date.now();
  clientes.forEach((socket, id) => {
    if (agora - (vivos.get(id) || 0) > SILENCIO_MAX_MS) {
      encerrar(id);
      return;
    }
    if (!socket.destroyed) socket.write(montarQuadro(Buffer.alloc(0), 0x9));
  });
}, PING_MS).unref();

servidor.on("upgrade", (req, socket) => {
  const chave = req.headers["sec-websocket-key"];
  if (!chave) return socket.destroy();

  const aceite = crypto
    .createHash("sha1")
    .update(chave + GUID)
    .digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
      "Sec-WebSocket-Accept: " + aceite + "\r\n\r\n",
  );

  const id = crypto.randomUUID().slice(0, 8);
  clientes.set(id, socket);
  vivos.set(id, Date.now());
  socket.on("error", () => {});

  let buffer = Buffer.alloc(0);
  socket.on("data", (pedaco) => {
    buffer = Buffer.concat([buffer, pedaco]);
    let quadro;
    while ((quadro = lerQuadro(buffer))) {
      buffer = buffer.subarray(quadro.total);
      vivos.set(id, Date.now()); // qualquer quadro conta como sinal de vida
      if (quadro.opcode === 0x8) return encerrar(id); // close
      if (quadro.opcode === 0x9) { socket.write(montarQuadro(quadro.payload, 0xa)); continue; } // ping
      if (quadro.opcode === 0xa) continue; // pong: o `vivos` acima já registrou
      if (quadro.opcode !== 0x1) continue; // só texto
      try {
        tratar(id, JSON.parse(quadro.payload.toString("utf8")));
      } catch (e) {
        /* mensagem torta do cliente não derruba a sala */
      }
    }
  });
  socket.on("close", () => encerrar(id));
});

function encerrar(id) {
  const s = clientes.get(id);
  if (s) s.destroy();
  clientes.delete(id);
  vivos.delete(id);
  const codigo = S.sair(registro, id);
  if (codigo) transmitir(codigo);
}

/** Um comando, uma função da regra. O servidor decide; o cliente só pede. */
function tratar(id, msg) {
  // `procurar` é o modo ONLINE: o servidor escolhe a sala e responde qual foi.
  // Vem antes do switch porque é a única mensagem que pode chegar de alguém
  // que ainda não está em sala nenhuma.
  if (msg.t === "procurar") {
    const codigo = S.procurar(registro, id, msg.nome);
    enviarPara(id, { t: "sala_encontrada", codigo, aguardando: S.humanos(registro.salas[codigo]) < S.MAX_HUMANOS });
    transmitir(codigo);
    // Sala cheia começa sozinha: no pareamento não há lobby para clicar.
    if (S.iniciarSeCheia(registro, codigo)) {
      transmitir(codigo);
      anunciarPartida(codigo);
    }
    return;
  }

  const codigo = S.codigoDe(registro, id) || S.PADRAO;
  const sala = S.salaDe(registro, id) || salaPadrao;

  switch (msg.t) {
    // Sem `sala` na mensagem é LAN: cai na sala padrão, comportamento de sempre.
    case "entrar": S.entrar(registro, msg.sala || S.PADRAO, id, msg.nome); break;
    case "lado": L.escolherLado(sala, id, msg.lado); break;
    case "posicao": L.escolherPosicao(sala, id, msg.posicao); break;
    case "pronto": L.marcarPronto(sala, id, msg.valor); break;
    case "uniforme": L.definirUniforme(sala, id, msg.lado, msg.uniforme); break;
    case "bots": L.definirPreencherBots(sala, id, msg.lado, msg.valor); break;
    case "regras": L.definirRegras(sala, id, msg.regras); break;
    // Pacote de PARTIDA: o servidor não entende nem valida, só repassa para os
    // outros. A autoridade é o anfitrião (ver GameScene.lansync.js) — pôr regra
    // de jogo aqui obrigaria o servidor a simular física, que é justamente o
    // que este projeto não precisa numa LAN.
    case "rede":
      // Só para quem está na MESMA sala. Sem este recorte, duas partidas
      // online simultâneas trocam posição de bola entre si — e o sintoma
      // (bola teleportando) não parece problema de servidor.
      S.colegas(registro, id).forEach((outro) => {
        const socket = clientes.get(outro);
        if (outro === id || !socket || socket.destroyed) return;
        socket.write(montarQuadro(Buffer.from(JSON.stringify(Object.assign({ de: id }, msg)), "utf8")));
      });
      return; // sem broadcast de sala: isto roda 20x por segundo
    case "iniciar":
      L.iniciar(sala, id);
      // Evento PRÓPRIO, e não só a flag no estado: o broadcast de sala é
      // repetido a cada mudança, e a cena reagiria a ele várias vezes. Este
      // sai uma vez e é o gatilho da troca de tela.
      if (sala.iniciada) {
        transmitir(codigo);
        return anunciarPartida(codigo);
      }
      break;
    default: return;
  }
  transmitir(codigo);
}

/** Mensagem para UM cliente. */
function enviarPara(id, obj) {
  const socket = clientes.get(id);
  if (!socket || socket.destroyed) return;
  socket.write(montarQuadro(Buffer.from(JSON.stringify(obj), "utf8")));
}

/**
 * Pacote de início. Cada cliente recebe o SEU id em `voce` para saber qual dos
 * bonecos em campo é ele — sem isso o cliente não tem como se achar no meio da
 * escalação.
 */
function anunciarPartida(codigo) {
  const sala = registro.salas[codigo];
  if (!sala) return;
  const base = {
    t: "partida",
    escalacoes: { esq: L.escalacao(sala, "esq"), dir: L.escalacao(sala, "dir") },
    times: sala.times,
    regras: sala.regras,
  };
  Object.keys(sala.jogadores).forEach((id) => {
    enviarPara(id, Object.assign({ voce: id }, base));
  });
}

/** Estado inteiro para todo mundo. A sala é pequena; diff seria complexidade à toa. */
function transmitir(codigo) {
  const sala = registro.salas[codigo || S.PADRAO];
  if (!sala) return;
  const corpo = JSON.stringify({
    t: "sala",
    sala,
    impedimentos: L.impedimentos(sala),
    podeIniciar: L.podeIniciar(sala),
    escalacoes: { esq: L.escalacao(sala, "esq"), dir: L.escalacao(sala, "dir") },
  });
  // Só para os jogadores DESTA sala.
  Object.keys(sala.jogadores).forEach((id) => {
    const socket = clientes.get(id);
    if (!socket || socket.destroyed) return;
    // `voce` vai por fora: cada cliente precisa saber qual dos jogadores é ele.
    socket.write(montarQuadro(Buffer.from(corpo.replace('{"t":"sala"', '{"t":"sala","voce":"' + id + '"'), "utf8")));
  });
}

// ── enquadramento RFC 6455, só o que a sala usa ─────────────────────────────
function lerQuadro(buf) {
  if (buf.length < 2) return null;
  const fin = (buf[0] & 0x80) !== 0;
  const opcode = buf[0] & 0x0f;
  const temMascara = (buf[1] & 0x80) !== 0;
  let tam = buf[1] & 0x7f;
  let i = 2;
  if (tam === 126) {
    if (buf.length < 4) return null;
    tam = buf.readUInt16BE(2);
    i = 4;
  } else if (tam === 127) {
    return null; // >64KB não existe nesta sala
  }
  const mascara = temMascara ? buf.subarray(i, i + 4) : null;
  if (temMascara) i += 4;
  if (buf.length < i + tam) return null; // pacote ainda chegando
  const payload = Buffer.from(buf.subarray(i, i + tam));
  // Cliente SEMPRE mascara (a spec exige); desmascarar é XOR com 4 bytes.
  if (mascara) for (let k = 0; k < payload.length; k++) payload[k] ^= mascara[k % 4];
  return { fin, opcode, payload, total: i + tam };
}

function montarQuadro(payload, opcode) {
  const dados = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  const cab = dados.length < 126
    ? Buffer.from([0x80 | (opcode || 0x1), dados.length])
    : Buffer.concat([
        Buffer.from([0x80 | (opcode || 0x1), 126]),
        (() => { const b = Buffer.alloc(2); b.writeUInt16BE(dados.length); return b; })(),
      ]);
  return Buffer.concat([cab, dados]); // servidor não mascara
}

// Sem host explícito o Node escuta em 0.0.0.0, que é o que o Render exige —
// amarrar em 127.0.0.1 faria o deploy subir e o health check falhar.
servidor.listen(PORTA, () => {
  // Em nuvem, IP de interface não serve para nada: o endereço é o domínio que
  // a plataforma dá. `RENDER` existe no ambiente deles.
  if (process.env.RENDER || process.env.PORT) {
    console.log("Servidor de partidas no ar na porta " + PORTA);
    console.log("Health check: /health");
    return;
  }
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n.family === "IPv4" && !n.internal)
    .map((n) => n.address);
  console.log("Sala aberta. Os outros entram por um destes IPs:");
  ips.forEach((ip) => console.log("   " + ip + ":" + PORTA));
  console.log("Aqui: http://localhost:" + PORTA);
});
