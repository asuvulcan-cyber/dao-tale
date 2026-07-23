import { serve } from '@hono/node-server';
import { exec } from 'node:child_process';
import { banco } from './db/index.js';
import { checkpointWal, fazerBackup, listarBackups, verificarIntegridade } from './db/backup.js';
import { criarApp } from './app.js';
import { adquirirLock } from './instancia.js';
import { HOST, PORTA, caminhoBanco, diretorioDados } from './config.js';

// C2 (cinto de segurança): promessa órfã de um job nunca deve derrubar o
// servidor no meio de uma tradução — loga e segue (o estado durável das
// frases permite retomar).
process.on('unhandledRejection', (motivo) => {
  console.error('[dao-tale] promessa rejeitada sem tratamento:', motivo);
});

// Instância única por pasta de dados (doc 10 §2).
const lock = adquirirLock(PORTA);
if (!lock.ok) {
  console.error(
    `[dao-tale] já há uma instância usando esta pasta de dados ` +
      `(PID ${lock.dono.pid}, porta ${lock.dono.porta}).\n` +
      `           Pasta: ${diretorioDados()}\n` +
      `           Use a instância existente ou feche-a antes de subir outra.\n` +
      `           Se tiver certeza de que nada está rodando, apague ${lock.arquivo}.`,
  );
  process.exit(1);
}
const liberarLock = lock.liberar;

const db = banco();

// Integridade + backup de boot (doc 10 §1). O backup de boot é limitado por
// tempo para não expulsar backups antigos a cada reinício do PC — os backups de
// risco (pré-lote/import/migração) rodam sempre, independentemente disto.
const integridade = verificarIntegridade(db);
if (integridade !== 'ok') {
  console.error(`[dao-tale] ATENÇÃO: integrity_check retornou "${integridade}" — verifique o banco/backups.`);
}
const INTERVALO_BOOT_MS = Number(process.env.DAO_TALE_BACKUP_BOOT_INTERVALO_H ?? 6) * 60 * 60 * 1000;
const ultimo = listarBackups()[0];
if (ultimo && Date.now() - new Date(ultimo.em).getTime() < INTERVALO_BOOT_MS) {
  console.log(`[dao-tale] backup recente encontrado (${ultimo.em}); pulando backup de boot.`);
} else {
  fazerBackup(db, 'boot')
    .then((caminho) => console.log(`[dao-tale] backup de boot: ${caminho}`))
    .catch((e) => console.error('[dao-tale] falha no backup de boot:', (e as Error).message));
}

const app = criarApp(db);

const servidor = serve({ fetch: app.fetch, hostname: HOST, port: PORTA }, (info) => {
  const url = `http://${HOST}:${info.port}`;
  console.log(`Dao Tale rodando em ${url}`);
  console.log(`Banco de dados: ${caminhoBanco()}`);

  if (process.env.DAO_TALE_ABRIR === '1') {
    const comando =
      process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(comando, (erro) => {
      if (erro) console.log(`Abra o navegador manualmente em: ${url}`);
    });
  }
});

// Porta ocupada por outra coisa (B7): mensagem amigável em vez de stack bruta.
servidor.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`[dao-tale] porta ${PORTA} já está em uso. Feche a outra instância ou defina DAO_TALE_PORTA.`);
    liberarLock();
    process.exit(1);
  }
  throw e;
});

// Shutdown limpo (doc 10 §1): checkpoint do WAL (assim copiar só o .db é seguro),
// fecha o banco e libera o lock. Jobs/lotes em voo são abandonados — o estado por
// frase é durável, "Retomar" reconstrói.
let encerrando = false;
function encerrar(sinal: string): void {
  if (encerrando) return;
  encerrando = true;
  console.log(`[dao-tale] ${sinal} recebido — encerrando com segurança…`);
  try {
    checkpointWal(db);
  } catch (e) {
    console.error('[dao-tale] checkpoint no shutdown falhou:', (e as Error).message);
  }
  try {
    db.close();
  } catch {
    /* já fechado */
  }
  liberarLock();
  servidor.close(() => process.exit(0));
  // Rede de segurança: se o servidor não fechar em 3 s, sai mesmo assim.
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => encerrar('SIGINT'));
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('exit', () => liberarLock());
