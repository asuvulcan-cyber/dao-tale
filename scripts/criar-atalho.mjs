// Cria um atalho de área de trabalho que inicia o Dao Tale com um clique —
// a experiência de "abrir um programa" (doc 02 §5) sem empacotamento pesado.
// Uso: npm run atalho
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

  // Instala o selo 道 no tema de ícones do sistema (SVG + PNG pré-renderizado).
  // O .desktop usa o caminho absoluto do PNG — funciona mesmo sem o cache de
  // ícones do tema atualizado (KDE/GNOME).
  const iconePng = path.join(dirDados, 'icons', 'hicolor', '256x256', 'apps', 'dao-tale.png');
  const icones = [
    ['icone.svg', path.join(dirDados, 'icons', 'hicolor', 'scalable', 'apps', 'dao-tale.svg')],
    ['icone-256.png', iconePng],
  ];
  for (const [origem, destino] of icones) {
    const arquivo = path.join(raiz, 'web', 'public', origem);
    if (!fs.existsSync(arquivo)) continue;
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(arquivo, destino);
  }

  const desktopFile = path.join(dirApps, 'dao-tale.desktop');
  fs.writeFileSync(
    desktopFile,
    [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Dao Tale',
      'Comment=Tradução e revisão assistida (chinês → PT-BR)',
      `Exec=node "${inicio}"`,
      `Path=${raiz}`,
      `Icon=${fs.existsSync(iconePng) ? iconePng : 'dao-tale'}`,
      'Terminal=false',
      'Categories=Utility;',
    ].join('\n'),
    { mode: 0o755 },
  );
  console.log(`Atalho criado: ${desktopFile}`);
  console.log('"Dao Tale" agora aparece no menu de aplicativos do sistema.');
} else {
  console.log(`Plataforma ${process.platform} sem gerador de atalho — inicie com: npm run start`);
}
