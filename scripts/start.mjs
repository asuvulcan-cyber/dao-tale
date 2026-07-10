// Launcher de uso diário: builda a interface se necessário e sobe o servidor
// abrindo o navegador — a experiência de "abrir um programa" (doc 02 §5).
import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(raiz, 'web', 'dist', 'index.html');

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
