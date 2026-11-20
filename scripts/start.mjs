// Launcher de uso diário: builda a interface se necessário e sobe o servidor
// abrindo o navegador — a experiência de "abrir um programa" (doc 02 §5).
// Se o Dao Tale já estiver no ar, só abre o navegador (clicar no atalho com o
// servidor rodando não pode derrubar nada nem morrer em silêncio).
//
// `--janela` (o atalho do Linux passa): abre numa janela própria de navegador
// Chromium (modo app, sem abas nem barra de endereço), que o atalho reconhece
// pela classe da janela (o nome do .desktop em criar-atalho.mjs) — é o que faz o
// ícone fixado na barra de tarefas funcionar como o de um programa. Sem um
// Chromium instalado, cai no navegador padrão como antes.
import { spawnSync, spawn, exec, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(raiz, 'web', 'dist', 'index.html');
const porta = Number(process.env.DAO_TALE_PORTA ?? 8317);
const url = `http://127.0.0.1:${porta}`;
const emJanela = process.argv.includes('--janela');

// Aberto pelo atalho não há terminal: tudo vai para um log ao lado do banco,
// senão um erro na subida some sem deixar rastro.
const semTerminal = !process.stdout.isTTY;
const caminhoLog = semTerminal ? path.join(dirDados(), 'dao-tale.log') : null;
let saida = semTerminal ? fs.openSync(caminhoLog, 'a') : 'inherit';

// O log anterior vai para .1 — só quando um servidor novo sobe. Girar num
// clique com o servidor já no ar deixaria o processo vivo escrevendo no .1.
function girarLog() {
  if (!semTerminal) return;
  fs.closeSync(saida);
  try {
    fs.renameSync(caminhoLog, `${caminhoLog}.1`);
  } catch {
    // girar o log é conveniência; não impede a subida
  }
  saida = fs.openSync(caminhoLog, 'a');
}

function log(msg) {
  if (semTerminal) fs.writeSync(saida, `${new Date().toISOString()} ${msg}\n`);
  else console.log(msg);
}

// Mesma regra do servidor (server/src/config.ts → diretorioDados).
function dirDados() {
  if (process.env.DAO_TALE_DIR) return process.env.DAO_TALE_DIR;
  const base =
    process.platform === 'win32'
      ? (process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'))
      : (process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share'));
  const dir = path.join(base, 'dao-tale');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Sem terminal, a única forma de avisar é uma notificação da área de trabalho.
function avisar(titulo, corpo) {
  if (!semTerminal || process.platform !== 'linux') return;
  exec(`notify-send -a "Dao Tale" -i dao-tale ${JSON.stringify(titulo)} ${JSON.stringify(corpo)}`, () => {});
}

function existeNoPath(nome) {
  const dirs = (process.env.PATH ?? '').split(path.delimiter);
  dirs.push(path.join(os.homedir(), '.local', 'bin'));
  return dirs.some((d) => d && fs.existsSync(path.join(d, nome)));
}

function flatpakInstalado(id) {
  try {
    execFileSync('flatpak', ['info', id], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Navegador da família Chromium para o modo app. Firefox (e derivados como o
// Zen) não tem mais janela de aplicativo, então não entra na lista.
function chromiumDisponivel() {
  if (process.platform !== 'linux') return null;
  for (const nome of [
    'chromium',
    'chromium-browser',
    'google-chrome',
    'google-chrome-stable',
    'brave-browser',
    'microsoft-edge',
  ]) {
    if (existeNoPath(nome)) return [nome];
  }
  for (const id of ['org.chromium.Chromium', 'com.google.Chrome', 'com.brave.Browser', 'com.microsoft.Edge']) {
    if (flatpakInstalado(id)) return ['flatpak', 'run', id];
  }
  return null;
}

function abrirNavegador() {
  const chromium = emJanela ? chromiumDisponivel() : null;
  if (chromium) {
    // Perfil próprio: processo separado de qualquer Chromium já aberto (a
    // janela não some junto se você fechar o navegador), e as preferências da
    // interface (tema, modo do editor) ficam guardadas aqui, à parte.
    const xdgConfig = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
    const perfil = path.join(xdgConfig, 'dao-tale', 'janela');
    fs.mkdirSync(perfil, { recursive: true });
    const [cmd, ...pre] = chromium;
    const filho = spawn(
      cmd,
      [...pre, `--app=${url}`, `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check'],
      { detached: true, stdio: 'ignore' },
    );
    filho.on('error', () => abrirPadrao());
    filho.unref();
    log(`Abrindo a janela do Dao Tale (${chromium.join(' ')}).`);
    return;
  }
  abrirPadrao();
}

function abrirPadrao() {
  const comando =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(comando, (erro) => {
    if (erro) log(`Abra o navegador manualmente em: ${url}`);
  });
}

const noAr = () =>
  fetch(`${url}/api/saude`, { signal: AbortSignal.timeout(1500) })
    .then((r) => r.ok)
    .catch(() => false);

// Arquivo mais novo dentro das pastas que entram no build da interface.
function mtimeMaisRecente(alvos) {
  let maior = 0;
  const visitar = (p) => {
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      for (const nome of fs.readdirSync(p)) if (nome !== 'node_modules') visitar(path.join(p, nome));
    } else if (st.mtimeMs > maior) maior = st.mtimeMs;
  };
  alvos.forEach(visitar);
  return maior;
}

// Instância já no ar? A porta está ocupada — subir outra só daria EADDRINUSE.
if (await noAr()) {
  log(`Dao Tale já está rodando em ${url} — abrindo o navegador.`);
  abrirNavegador();
  process.exit(0);
}

girarLog();
const stdio = semTerminal ? ['ignore', saida, saida] : 'inherit';

// Recompila quando a interface mudou depois do último build, não só quando ele
// não existe: senão o atalho continuaria servindo a tela antiga após cada
// atualização do código.
const fontes = ['web/src', 'web/public', 'web/index.html', 'web/vite.config.ts', 'shared/src'].map((p) =>
  path.join(raiz, p),
);
const desatualizado = !fs.existsSync(dist) || mtimeMaisRecente(fontes) > fs.statSync(dist).mtimeMs;
if (desatualizado) {
  log('Compilando a interface…');
  avisar('Atualizando o Dao Tale', 'Compilando a interface, a janela abre em alguns segundos.');
  const build = spawnSync('npm', ['run', 'build'], { cwd: raiz, stdio, shell: true });
  if (build.status !== 0) {
    avisar('Dao Tale não abriu', `A compilação da interface falhou. Detalhes em ${caminhoLog}`);
    process.exit(build.status ?? 1);
  }
}

const servidor = spawn('npm', ['-w', 'server', 'run', 'start'], { cwd: raiz, stdio, shell: true });
let codigoSaida = null;
servidor.on('exit', (codigo) => {
  codigoSaida = codigo ?? 0;
});

// Espera o servidor responder para abrir a janela (abrir antes mostraria
// "não foi possível conectar"). A subida inclui migrações, que fazem snapshot
// do banco antes, daí a folga generosa.
const limite = Date.now() + 120_000;
let pronto = false;
while (Date.now() < limite) {
  if (await noAr()) {
    pronto = true;
    break;
  }
  if (codigoSaida !== null) {
    // Dois cliques seguidos: a outra instância ganhou a porta e esta saiu. Não
    // é erro, só abre a janela na que ficou.
    pronto = await noAr();
    break;
  }
  await new Promise((r) => setTimeout(r, 400));
}

if (!pronto) {
  log('O servidor não respondeu.');
  avisar('Dao Tale não abriu', `O servidor não subiu. Detalhes em ${caminhoLog ?? 'no terminal'}`);
  servidor.kill('SIGTERM');
  process.exit(1);
}

abrirNavegador();
if (codigoSaida !== null) process.exit(0);
servidor.on('exit', (codigo) => process.exit(codigo ?? 0));
