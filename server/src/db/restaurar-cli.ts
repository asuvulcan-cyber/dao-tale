import path from 'node:path';
import readline from 'node:readline';
import { HOST, PORTA, caminhoBanco, diretorioDados } from '../config.js';
import { caminhoBackups, listarBackups, restaurarDe } from './backup.js';

// CLI de restauração (doc 10 §1). Uso: `npm run restaurar` (lista) ou
// `npm run restaurar -- <índice|nome>` (restaura). Recusa se o app estiver no ar.

async function appNoAr(): Promise<boolean> {
  try {
    const r = await fetch(`http://${HOST}:${PORTA}/api/saude`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

function confirmar(pergunta: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) =>
    rl.question(pergunta, (a) => {
      rl.close();
      res(/^s/i.test(a.trim()));
    }),
  );
}

const mb = (n: number) => (n / 1024 / 1024).toFixed(1);

async function main(): Promise<void> {
  const dir = caminhoBackups();
  const destino = caminhoBanco();
  const lista = listarBackups(dir);

  if (await appNoAr()) {
    console.error(
      `O Dao Tale parece estar rodando em http://${HOST}:${PORTA}. ` +
        `Feche-o antes de restaurar (o banco não pode ser trocado com o app aberto).`,
    );
    process.exit(1);
  }

  if (lista.length === 0) {
    console.error(`Nenhum backup encontrado em ${dir}.`);
    process.exit(1);
  }

  const alvo = process.argv[2];
  if (!alvo) {
    console.log(`Pasta de dados: ${diretorioDados()}`);
    console.log(`Backups disponíveis (mais novo primeiro):\n`);
    lista.forEach((b, i) => console.log(`  [${i}] ${b.nome}  (${mb(b.tamanho)} MB — ${b.em})`));
    console.log(`\nUso: npm run restaurar -- <índice|nome>`);
    console.log(`Ex.: npm run restaurar -- 0   (restaura o mais recente)`);
    process.exit(0);
  }

  let backup: string;
  if (/^\d+$/.test(alvo)) {
    const item = lista[Number(alvo)];
    if (!item) {
      console.error(`Índice ${alvo} fora do intervalo (0..${lista.length - 1}).`);
      process.exit(1);
    }
    backup = item.caminho;
  } else {
    backup = path.isAbsolute(alvo) ? alvo : path.join(dir, alvo);
  }

  console.log(`Restaurar de: ${backup}`);
  console.log(`Sobre:        ${destino}`);
  const ok =
    process.argv.includes('--sim') ||
    (await confirmar('Isto substitui o banco atual (uma cópia .pre-restauracao é guardada). Continuar? [s/N] '));
  if (!ok) {
    console.log('Cancelado.');
    process.exit(0);
  }

  const r = restaurarDe(backup, destino);
  console.log(r.mensagem);
  if (r.copiaSeguranca) console.log(`Banco anterior preservado em: ${r.copiaSeguranca}`);
  process.exit(r.ok ? 0 : 1);
}

void main();
