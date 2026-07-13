// Launcher de uso diário: builda a interface se necessário e sobe o servidor
// abrindo o navegador — a experiência de "abrir um programa" (doc 02 §5).
// Se o Dao Tale já estiver no ar, só abre o navegador (clicar no atalho com o
// servidor rodando não pode derrubar nada nem morrer em silêncio).
import { spawnSync, spawn, exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(raiz, 'web', 'dist', 'index.html');
const porta = Number(process.env.DAO_TALE_PORTA ?? 8317);
const url = `http://127.0.0.1:${porta}`;

function abrirNavegador() {
  const comando =
    process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(comando, (erro) => {
    if (erro) console.log(`Abra o navegador manualmente em: ${url}`);
  });
}

// Instância já no ar? A porta está ocupada — subir outra só daria EADDRINUSE.
const jaRodando = await fetch(`${url}/api/saude`, { signal: AbortSignal.timeout(1500) })
  .then((r) => r.ok)
  .catch(() => false);
if (jaRodando) {
  console.log(`Dao Tale já está rodando em ${url} — abrindo o navegador.`);
  abrirNavegador();
  process.exit(0);
}

if (!fs.existsSync(dist)) {
  console.log('Compilando a interface (primeira execução)…');
  const build = spawnSync('npm', ['run', 'build'], { cwd: raiz, stdio: 'inherit', shell: true });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const servidor = spawn('npm', ['-w', 'server', 'run', 'start'], {
  cwd: raiz,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DAO_TALE_ABRIR: '1' },
});
servidor.on('exit', (codigo) => process.exit(codigo ?? 0));
