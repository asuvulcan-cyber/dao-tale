import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import type { BancoDados } from './db/index.js';
import { rotasSistema } from './rotas/sistema.js';
import { rotasObras } from './rotas/obras.js';
import { rotasCapitulos } from './rotas/capitulos.js';
import { rotasFrases } from './rotas/frases.js';
import { rotasCuradoria } from './rotas/curadoria.js';
import { rotasComparador } from './rotas/comparador.js';

const dirWebDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

export function criarApp(db: BancoDados): Hono {
  const app = new Hono();

  app.route('/api', rotasSistema(db));
  app.route('/api', rotasObras(db));
  app.route('/api', rotasCapitulos(db));
  app.route('/api', rotasFrases(db));
  app.route('/api', rotasCuradoria(db));
  app.route('/api', rotasComparador(db));

  app.onError((erro, c) => {
    console.error('[erro não tratado]', erro);
    return c.json({ erro: { codigo: 'interno', mensagem: erro.message } }, 500);
  });

  // Interface compilada (web/dist), com fallback SPA para index.html.
  app.get('*', (c) => {
    if (!fs.existsSync(dirWebDist)) {
      return c.text(
        'Interface ainda não compilada. Rode "npm run build" (ou use "npm run dev" durante o desenvolvimento).',
        503,
      );
    }
    const solicitado = path.normalize(decodeURIComponent(new URL(c.req.url).pathname));
    let arquivo = path.join(dirWebDist, solicitado);
    if (!arquivo.startsWith(dirWebDist) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
      arquivo = path.join(dirWebDist, 'index.html');
    }
    const tipo = MIME[path.extname(arquivo)] ?? 'application/octet-stream';
    return c.body(fs.readFileSync(arquivo), 200, { 'Content-Type': tipo });
  });

  return app;
}
