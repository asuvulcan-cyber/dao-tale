import { serve } from '@hono/node-server';
import { exec } from 'node:child_process';
import { banco } from './db/index.js';
import { criarApp } from './app.js';
import { HOST, PORTA, caminhoBanco } from './config.js';

// C2 (cinto de segurança): promessa órfã de um job nunca deve derrubar o
// servidor no meio de uma tradução — loga e segue (o estado durável das
// frases permite retomar).
process.on('unhandledRejection', (motivo) => {
  console.error('[dao-tale] promessa rejeitada sem tratamento:', motivo);
});

const app = criarApp(banco());

serve({ fetch: app.fetch, hostname: HOST, port: PORTA }, (info) => {
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
