import { Hono } from 'hono';
import { z } from 'zod';
import { PROVEDORES_IDS } from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import { reposObras, reposPrompts } from '../db/repos.js';
import { exportarObra, importarObra } from '../db/portabilidade.js';

const criarObraSchema = z.object({
  titulo: z.string().min(1),
  titulo_original: z.string().optional(),
  sinopse: z.string().optional(),
  tags: z.array(z.string().min(1)).max(20).optional(),
  prompt_inicial: z.object({ versao: z.string().min(1), conteudo: z.string().min(1) }).optional(),
  glossario_inicial: z
    .array(
      z.object({
        termo_zh: z.string().min(1),
        termo_pt: z.string().min(1),
        categoria: z.string().trim().min(1).max(30).optional(),
        nota: z.string().optional(),
      }),
    )
    .optional(),
});

const atualizarObraSchema = z.object({
  titulo: z.string().min(1).optional(),
  titulo_original: z.string().nullable().optional(),
  sinopse: z.string().nullable().optional(),
  tags: z.array(z.string().min(1)).max(20).optional(),
  provedor_padrao: z.enum(PROVEDORES_IDS).nullable().optional(),
  modelo_padrao: z.string().nullable().optional(),
});

const MIMES_CAPA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const CAPA_MAX_BYTES = 2 * 1024 * 1024;

const criarPromptSchema = z.object({
  versao: z.string().min(1),
  conteudo: z.string().min(1),
  notas_versao: z.string().optional(),
  ativar: z.boolean().default(true),
});

export function rotasObras(db: BancoDados): Hono {
  const app = new Hono();

  app.get('/obras', (c) => c.json(reposObras.listar(db)));

  app.post('/obras', async (c) => {
    const corpo = criarObraSchema.safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    return c.json(reposObras.criar(db, corpo.data), 201);
  });

  app.get('/obras/:id', (c) => {
    const obra = reposObras.obter(db, Number(c.req.param('id')));
    if (!obra) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    return c.json(obra);
  });

  app.put('/obras/:id', async (c) => {
    const corpo = atualizarObraSchema.safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const obra = reposObras.atualizar(db, Number(c.req.param('id')), corpo.data);
    if (!obra) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    return c.json(obra);
  });

  // ── Capa (imagem enviada como corpo binário; servida direto do banco) ────

  app.get('/obras/:id/capa', (c) => {
    const capa = reposObras.obterCapa(db, Number(c.req.param('id')));
    if (!capa) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra sem capa.' } }, 404);
    return c.body(new Uint8Array(capa.capa), 200, {
      'Content-Type': capa.mime,
      'Cache-Control': 'no-cache',
    });
  });

  app.put('/obras/:id/capa', async (c) => {
    const mime = c.req.header('content-type') ?? '';
    if (!MIMES_CAPA.has(mime)) {
      return c.json(
        { erro: { codigo: 'formato-invalido', mensagem: 'Envie uma imagem JPEG, PNG, WebP ou GIF.' } },
        415,
      );
    }
    const corpo = Buffer.from(await c.req.arrayBuffer());
    if (corpo.length === 0 || corpo.length > CAPA_MAX_BYTES) {
      return c.json({ erro: { codigo: 'tamanho-invalido', mensagem: 'A capa deve ter entre 1 byte e 2 MB.' } }, 413);
    }
    const ok = reposObras.definirCapa(db, Number(c.req.param('id')), corpo, mime);
    if (!ok) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    return c.json({ ok: true });
  });

  app.delete('/obras/:id/capa', (c) => {
    const ok = reposObras.definirCapa(db, Number(c.req.param('id')), null, null);
    if (!ok) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    return c.json({ ok: true });
  });

  app.delete('/obras/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (c.req.query('simular') === '1') {
      return c.json(reposObras.simularExclusao(db, id));
    }
    const ok = reposObras.excluir(db, id);
    if (!ok) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    return c.json({ ok: true });
  });

  // ── Exportação / reimportação completa (formato dao-tale-export v1) ──────

  app.get('/obras/:id/exportar', (c) => {
    const id = Number(c.req.param('id'));
    const dados = exportarObra(db, id);
    if (!dados) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    const nomeArquivo = `dao-tale-obra-${id}.json`;
    return c.body(JSON.stringify(dados, null, 2), 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
    });
  });

  app.post('/obras/importar', async (c) => {
    const dados = await c.req.json().catch(() => null);
    if (!dados) return c.json({ erro: { codigo: 'payload-invalido', mensagem: 'Envie o JSON exportado.' } }, 400);
    const resultado = importarObra(db, dados);
    if ('erro' in resultado) {
      return c.json({ erro: { codigo: 'import-invalido', mensagem: resultado.erro } }, 400);
    }
    return c.json(resultado, 201);
  });

  // ── Prompt mãe ──────────────────────────────────────────────────────────

  app.get('/obras/:id/prompts', (c) => c.json(reposPrompts.listar(db, Number(c.req.param('id')))));

  app.post('/obras/:id/prompts', async (c) => {
    const corpo = criarPromptSchema.safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    try {
      return c.json(reposPrompts.criar(db, Number(c.req.param('id')), corpo.data), 201);
    } catch (e: any) {
      if (String(e.message).includes('UNIQUE')) {
        return c.json({ erro: { codigo: 'versao-duplicada', mensagem: 'Já existe uma versão com esse identificador nesta obra.' } }, 409);
      }
      throw e;
    }
  });

  app.post('/prompts/:id/ativar', (c) => {
    const prompt = reposPrompts.ativar(db, Number(c.req.param('id')));
    if (!prompt) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Versão não encontrada.' } }, 404);
    return c.json(prompt);
  });

  return app;
}
