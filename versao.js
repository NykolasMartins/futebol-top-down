// =============================================================================
// versao.js — carimba o `?v=` de todo asset local do index.html
// =============================================================================
// Rodar depois de mexer em `GAME_VERSION` (constants.js):
//
//     node versao.js
//
// Por que existe: cada `<script>`/`<link>` do jogo carrega com `?v=<versão>`.
// Versão nova é URL nova, e URL nova o navegador não tem como servir do cache —
// é o que impede um jogador de ficar preso num JS antigo. Fazer isso à mão em
// 40 tags a cada entrega é o tipo de tarefa que se esquece na terceira vez.
//
// Sem dependência e sem passo de build: é um script solto, como o resto.

const fs = require("fs");
const path = require("path");

const raiz = __dirname;
const constantes = fs.readFileSync(path.join(raiz, "js/constants.js"), "utf8");
const versao = (constantes.match(/GAME_VERSION\s*=\s*"([^"]+)"/) || [])[1];

if (!versao) {
  console.error("versao.js: não achei GAME_VERSION em js/constants.js");
  process.exit(1);
}

const arquivo = path.join(raiz, "index.html");
const antes = fs.readFileSync(arquivo, "utf8");

// Só assets LOCAIS: o Phaser vem de CDN e as fontes do Google têm cache próprio.
let carimbadas = 0;
const depois = antes.replace(
  /(src|href)="((?:js|css)\/[^"?]+)(\?v=[^"]*)?"/g,
  (todo, attr, url) => {
    carimbadas++;
    return `${attr}="${url}?v=${versao}"`;
  },
);

if (antes === depois) {
  console.log(`versao.js: index.html já está em v${versao} (${carimbadas} tags)`);
  process.exit(0);
}

fs.writeFileSync(arquivo, depois);
console.log(`versao.js: ${carimbadas} tags carimbadas com v${versao}`);
