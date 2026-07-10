import { Hono } from 'hono';
import { z } from 'zod';
import type { BancoDados } from '../db/index.js';
import { reposObras, reposPrompts } from '../db/repos.js';

const criarObraSchema = z.object({
  titulo: z.string().min(1),
  titulo_original: z.string().optional(),
  prompt_inicial: z.object({ versao: z.string().min(1), conteudo: z.string().min(1) }).optional(),
  glossario_inicial: z
    .array(
      z.object({
        termo_zh: z.string().min(1),
        termo_pt: z.string().min(1),
        categoria: z.enum(['local', 'poder-habilidade', 'entidade', 'titulo-cargo', 'personagem', 'outro']).optional(),
        nota: z.string().optional(),
      }),
    )
    .optional(),
});

const atualizarObraSchema = z.object({
  titulo: z.string().min(1).optional(),
  titulo_original: z.string().nullable().optional(),
  provedor_padrao: z.enum(['claude', 'gemini', 'mock']).nullable().optional(),
  modelo_padrao: z.string().nullable().optional(),
});

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

  app.delete('/obras/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (c.req.query('simular') === '1') {
      return c.json(reposObras.simularExclusao(db, id));
    }
    const ok = reposObras.excluir(db, id);
    if (!ok) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    return c.json({ ok: true });
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
