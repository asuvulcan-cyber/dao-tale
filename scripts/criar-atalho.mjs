// Cria um atalho de área de trabalho que inicia o Dao Tale com um clique —
// a experiência de "abrir um programa" (doc 02 §5) sem empacotamento pesado.
// Uso: npm run atalho
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inicio = path.join(raiz, 'scripts', 'start.mjs');

if (process.platform === 'win32') {
  const desktop = path.join(os.homedir(), 'Desktop');
  // .vbs para iniciar sem janela de console presa; o navegador abre sozinho.
  const vbs = path.join(desktop, 'Dao Tale.vbs');
  fs.writeFileSync(
    vbs,
    [
      'Set shell = CreateObject("WScript.Shell")',
      `shell.CurrentDirectory = "${raiz.replace(/\\/g, '\\\\')}"`,
      `shell.Run "cmd /c node ""${inicio.replace(/\\/g, '\\\\')}""", 0, False`,
    ].join('\r\n'),
    'utf-8',
  );
  console.log(`Atalho criado: ${vbs}`);
  console.log('Dê dois cliques nele para iniciar o Dao Tale (o navegador abre sozinho).');
} else if (process.platform === 'linux') {
  const dirDados = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share');
  const dirApps = path.join(dirDados, 'applications');
  fs.mkdirSync(dirApps, { recursive: true });

  // Instala o selo 道 no tema de ícones do sistema (SVG + PNG pré-renderizado)
  // e o .desktop o chama pelo nome `dao-tale`: é a forma que o KWin e a barra
  // de tarefas resolvem com certeza (o SVG ainda fica nítido em qualquer
  // tamanho). A pasta hicolor do usuário não tem cache de ícones, então não há
  // cache velho escondendo o arquivo novo.
  const icones = [
    ['icone.svg', path.join(dirDados, 'icons', 'hicolor', 'scalable', 'apps', 'dao-tale.svg')],
    ['icone-256.png', path.join(dirDados, 'icons', 'hicolor', '256x256', 'apps', 'dao-tale.png')],
  ];
  for (const [origem, destino] of icones) {
    const arquivo = path.join(raiz, 'web', 'public', origem);
    if (!fs.existsSync(arquivo)) continue;
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(arquivo, destino);
  }

  // `--janela` abre o app numa janela própria de Chromium. No Wayland, o KDE
  // liga uma janela ao seu atalho pelo NOME do arquivo .desktop, que precisa
  // ser igual à classe (app_id) da janela — StartupWMClass sozinho não basta
  // no Plasma 6.7 (a janela ficou com o "W" genérico na barra). Para uma janela
  // `--app` de http://127.0.0.1:<porta> no perfil "Default", o Chromium usa a
  // classe `chrome-127.0.0.1__-Default` e ignora `--class` (medido no KWin em
  // 20/11/2026); é a mesma convenção dos atalhos que o próprio Chromium cria
  // ao instalar um site como app. Com o nome certo, o ícone fixado na barra
  // "acende" e traz a janela de volta, e o Alt+Tab mostra o selo 道.
  const ID_JANELA = 'chrome-127.0.0.1__-Default';
  // Versão anterior deste script gravava dao-tale.desktop; dois atalhos iguais
  // no menu confundiriam qual fixar.
  fs.rmSync(path.join(dirApps, 'dao-tale.desktop'), { force: true });
  // O `node` do PATH (ex.: /usr/bin/node), não o process.execPath: este vem com
  // o link resolvido (/usr/bin/node-22) e quebraria na próxima troca de versão.
  // Caminho absoluto porque o menu do sistema nem sempre herda o PATH do
  // terminal (nvm, ~/.local/bin…).
  const node =
    (process.env.PATH ?? '')
      .split(path.delimiter)
      .map((d) => path.join(d, 'node'))
      .find((p) => fs.existsSync(p)) ?? process.execPath;
  const desktopFile = path.join(dirApps, `${ID_JANELA}.desktop`);
  fs.writeFileSync(
    desktopFile,
    [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Dao Tale',
      'GenericName=Tradução assistida',
      'Comment=Tradução, revisão e tutor de idioma (mandarim ou inglês → PT-BR)',
      `Exec="${node}" "${inicio}" --janela`,
      `Path=${raiz}`,
      'Icon=dao-tale',
      'Terminal=false',
      `StartupWMClass=${ID_JANELA}`,
      'Categories=Education;Languages;',
      'Keywords=tradução;tradutor;novel;mandarim;inglês;tutor;vocabulário;',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  // Atualiza o cache de aplicativos para o atalho aparecer já, sem relogar.
  for (const [cmd, args] of [
    ['kbuildsycoca6', []],
    ['update-desktop-database', [dirApps]],
  ]) {
    try {
      execFileSync(cmd, args, { stdio: 'ignore' });
    } catch {
      // ferramenta ausente neste ambiente gráfico — o atalho aparece no próximo login
    }
  }
  console.log(`Atalho criado: ${desktopFile}`);
  console.log('"Dao Tale" agora aparece no menu de aplicativos do sistema.');
  console.log('Para fixar na barra de tarefas: abra pelo menu e, com a janela aberta,');
  console.log('clique com o botão direito no ícone dela na barra → "Fixar no Gerenciador de tarefas".');
} else {
  console.log(`Plataforma ${process.platform} sem gerador de atalho — inicie com: npm run start`);
}
