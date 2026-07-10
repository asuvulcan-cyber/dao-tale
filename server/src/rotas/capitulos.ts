import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type { EventoTraducao } from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import { reposCapitulos, reposFrases, reposObras } from '../db/repos.js';
import { segmentar } from '../segmentacao/segmentar.js';
import {
  cancelarJob,
  emissorDoCapitulo,
  iniciarTraducao,
  jobEmExecucao,
  progressoAtual,
} from '../traducao/job.js';

const criarCapituloSchema = z.object({
  numero: z.number().int().min(0),
  titulo: z.string().optional(),
  texto_origem: z.string().min(1),
});

const atualizarCapituloSchema = z.object({
  titulo: z.string().nullable().optional(),
  status: z.enum(['rascunho', 'traduzindo', 'revisado', 'finalizado']).optional(),
  provedor: z.enum(['claude', 'gemini', 'mock']).nullable().optional(),
  modelo: z.string().nullable().optional(),
});

const traduzirSchema = z.object({
  provedor: z.enum(['claude', 'gemini', 'mock']).optional(),
  modelo: z.string().optional(),
  sobrescrever: z.boolean().optional(),
  sobrescrever_editadas: z.boolean().optional(),
});

export function rotasCapitulos(db: BancoDados): Hono {
  const app = new Hono();

  app.get('/obras/:obraId/capitulos', (c) =>
    c.json(reposCapitulos.listar(db, Number(c.req.param('obraId')))),
  );

  app.post('/obras/:obraId/capitulos', async (c) => {
    const obraId = Number(c.req.param('obraId'));
    if (!reposObras.obter(db, obraId)) {
      return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    }
    const corpo = criarCapituloSchema.safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);

    const { frases, avisos } = segmentar(corpo.data.texto_origem);
    if (frases.length === 0) {
      return c.json({ erro: { codigo: 'texto-vazio', mensagem: 'O texto enviado não contém nenhuma frase.' } }, 400);
    }
    try {
      const capitulo = reposCapitulos.criar(db, obraId, corpo.data, frases);
      return c.json({ capitulo, frases_total: frases.length, avisos }, 201);
    } catch (e: any) {
      if (String(e.message).includes('UNIQUE')) {
        return c.json({ erro: { codigo: 'numero-duplicado', mensagem: 'Já existe um capítulo com esse número nesta obra.' } }, 409);
      }
      throw e;
    }
  });

  app.get('/capitulos/:id', (c) => {
    const id = Number(c.req.param('id'));
    const capitulo = reposCapitulos.obter(db, id);
    if (!capitulo) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Capítulo não encontrado.' } }, 404);
    return c.json({
      capitulo,
      frases: reposFrases.listarPorCapitulo(db, id),
      progresso: progressoAtual(db, id),
    });
  });

  app.put('/capitulos/:id', async (c) => {
    const corpo = atualizarCapituloSchema.safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const capitulo = reposCapitulos.atualizar(db, Number(c.req.param('id')), corpo.data);
    if (!capitulo) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Capítulo não encontrado.' } }, 404);
    return c.json(capitulo);
  });

  app.delete('/capitulos/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (c.req.query('simular') === '1') {
      return c.json(reposCapitulos.simularExclusao(db, id));
    }
    if (jobEmExecucao(id)) {
      return c.json({ erro: { codigo: 'job-ativo', mensagem: 'Cancele a tradução em andamento antes de excluir.' } }, 409);
    }
    const ok = reposCapitulos.excluir(db, id);
    if (!ok) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Capítulo não encontrado.' } }, 404);
    return c.json({ ok: true });
  });

  // ── Tradução ────────────────────────────────────────────────────────────

  app.post('/capitulos/:id/traduzir', async (c) => {
    const id = Number(c.req.param('id'));
    const corpo = traduzirSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const resultado = await iniciarTraducao(db, id, corpo.data);
    if (!resultado.ok) {
      const codigo = resultado.erro.includes('em andamento') ? 409 : 400;
      return c.json({ erro: { codigo: 'traducao', mensagem: resultado.erro } }, codigo);
    }
    return c.json({ ok: true, progresso: progressoAtual(db, id) }, 202);
  });

  app.post('/capitulos/:id/traduzir/cancelar', (c) => {
    const cancelou = cancelarJob(Number(c.req.param('id')));
    return c.json({ ok: cancelou });
  });

  app.get('/capitulos/:id/traducao/eventos', (c) => {
    const id = Number(c.req.param('id'));
    return streamSSE(c, async (stream) => {
      const emissor = emissorDoCapitulo(id);
      let encerrar: (() => void) | null = null;
      const encerrado = new Promise<void>((resolve) => {
        encerrar = resolve;
      });

      // Escritas serializadas: eventos emitidos em sequência imediata (último bloco +
      // job_concluido) geram writeSSE concorrentes, que conflitam e derrubam o stream.
      let fila: Promise<unknown> = Promise.resolve();
      const escrever = (evento: string, dados: unknown, aoFim?: () => void) => {
        fila = fila
          .then(() => stream.writeSSE({ event: evento, data: JSON.stringify(dados) }))
          .then(() => aoFim?.())
          .catch(() => encerrar?.());
      };

      // O listener entra ANTES de qualquer escrita: writeSSE é assíncrono e um job
      // rápido pode emitir (e concluir) durante o primeiro await — eventos se perderiam.
      const ouvinte = (evento: EventoTraducao) => {
        const final = evento.tipo === 'job_concluido' || evento.tipo === 'job_erro';
        escrever(evento.tipo, evento.dados, final ? () => encerrar?.() : undefined);
      };
      emissor.on('evento', ouvinte);
      stream.onAbort(() => encerrar?.());

      // Estado atual imediatamente, para a interface sincronizar ao conectar.
      const inicial = progressoAtual(db, id);
      escrever('progresso', inicial);
      if (!inicial.em_execucao && !jobEmExecucao(id)) {
        // Nenhum job ativo: nada mais virá — encerra como concluído para o cliente
        // não ficar pendurado (cobre o caso de conectar depois de um job relâmpago).
        escrever('job_concluido', inicial, () => encerrar?.());
      }

      await encerrado;
      emissor.off('evento', ouvinte);
    });
  });

  return app;
}
