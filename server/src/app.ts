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
import { rotasExportacao } from './rotas/exportacao.js';
import { protecaoOrigem } from './rotas/protecaoOrigem.js';
import { rotasPublicas } from './rotas/publico.js';
import { exigirSessao, rotasSessao } from './rotas/sessao.js';
import type { OpcoesLimite } from './auth/limite.js';

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

export interface OpcoesApp {
  /** Ajuste do freio de login — os testes zeram o atraso progressivo. */
  limiteLogin?: OpcoesLimite;
}

export function criarApp(db: BancoDados, opcoes: OpcoesApp = {}): Hono {
  const app = new Hono();

  // Cabeçalhos de segurança em tudo (doc 13 §4): não dependem do proxy, então
  // valem igual no modo local.
  app.use('*', async (c, next) => {
    await next();
    try {
      c.res.headers.set('X-Content-Type-Options', 'nosniff');
      c.res.headers.set('Referrer-Policy', 'same-origin');
      c.res.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
    } catch {
      /* resposta congelada — sem cabeçalho extra, sem quebrar a requisição */
    }
  });

  // Origem permitida: loopback no modo local, allowlist do domínio no hospedado
  // (doc 10 §3 → doc 13 §1). Antes de qualquer rota.
  app.use('/api/*', protecaoOrigem());

  // Login/logout/status ficam ANTES da guarda — são a porta, não o cômodo.
  app.route('/api', rotasSessao(opcoes.limiteLogin));

  // Vitrine pública (doc 14), também antes da guarda: leitura das obras que o
  // dono marcou como públicas, capítulos em 'finalizado', sem sessão. É a única
  // outra porta aberta, e a lista de rotas dela cabe numa tela de propósito.
  app.route('/api', rotasPublicas(db));

  // Daqui para baixo, em modo hospedado, tudo exige sessão (doc 13 §3).
  app.use('/api/*', exigirSessao());

  app.route('/api', rotasSistema(db));
  app.route('/api', rotasObras(db));
  app.route('/api', rotasCapitulos(db));
  app.route('/api', rotasFrases(db));
  app.route('/api', rotasCuradoria(db));
  app.route('/api', rotasComparador(db));
  app.route('/api', rotasExportacao(db));

  app.onError((erro, c) => {
    console.error('[erro não tratado]', erro);
    return c.json({ erro: { codigo: 'interno', mensagem: erro.message } }, 500);
  });

  // Publicar não é o mesmo que indexar (doc 14 §6). A vitrine existe para o dono
  // mandar o link a quem ele quiser; virar resultado de busca é uma decisão
  // separada, e mais difícil de desfazer do que de tomar. Padrão: fora do índice.
  // Para permitir buscadores, troque o Disallow por "Allow: /".
  app.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /\n'));

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
