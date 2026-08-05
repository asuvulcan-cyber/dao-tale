import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { PROVEDORES_IDS, STATUS_CAPITULO, normalizarPreferencias, type EventoTraducao } from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import { reposCapitulos, reposConsistencia, reposEstiloIgnorado, reposFrases, reposGlossario, reposObras, reposPrompts, reposQa } from '../db/repos.js';
import { segmentar } from '../segmentacao/segmentar.js';
import { textoCapitulo, type FormatoTexto } from '../exportacao/texto.js';
import { varrerConsistencia } from '../traducao/consistencia.js';
import { analisarEstilo } from '../traducao/estiloViolacoes.js';
import { analisarCapitulo } from '../traducao/qa.js';
import {
  cancelarJob,
  emissorDoCapitulo,
  iniciarTraducao,
  jobEmExecucao,
  liberarEmissor,
  progressoAtual,
} from '../traducao/job.js';

const criarCapituloSchema = z.object({
  numero: z.number().int().min(0),
  titulo: z.string().optional(),
  texto_origem: z.string().min(1),
});

const atualizarCapituloSchema = z.object({
  titulo: z.string().nullable().optional(),
  titulo_pt: z.string().nullable().optional(),
  status: z.enum(STATUS_CAPITULO).optional(),
  provedor: z.enum(PROVEDORES_IDS).nullable().optional(),
  modelo: z.string().nullable().optional(),
});

const traduzirSchema = z.object({
  provedor: z.enum(PROVEDORES_IDS).optional(),
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

  // Varredura de estilo do capítulo (sem IA, sem custo): conta violações das
  // preferências da obra e mostra a concentração por terço. O terço é o que
  // separa "a regra está mal escrita" de "o bloco é grande demais" — no prólogo
  // da 死人经 as 9 ocorrências estavam TODAS no fim de uma resposta única.
  app.get('/capitulos/:id/estilo', (c) => {
    const id = Number(c.req.param('id'));
    const capitulo = reposCapitulos.obter(db, id);
    if (!capitulo) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Capítulo não encontrado.' } }, 404);
    const prompt = reposPrompts.ativo(db, capitulo.obra_id);
    const prefs = normalizarPreferencias(prompt?.preferencias);
    const frases = reposFrases.listarPorCapitulo(db, id);
    const relatorio = analisarEstilo(frases, prefs);

    // A varredura trabalha por `ordem` (é o eixo do `por_terco`); a tela precisa
    // do id para pular até a frase e para dispensar. O de-para é aqui, e não
    // dentro de analisarEstilo, que segue puro para as medições e comparações.
    const idPorOrdem = new Map(frases.map((f) => [f.ordem, f.id]));
    const ignoradas = reposEstiloIgnorado.doCapitulo(db, id);
    const visiveis = relatorio.violacoes
      .map((v) => ({ ...v, frase_id: idPorOrdem.get(v.ordem) ?? null }))
      .filter((v) => v.frase_id == null || !ignoradas.has(`${v.frase_id}|${v.regra}|${v.trecho}`));

    // `por_terco` é recontado sobre o que sobrou: se contasse o dispensado, o
    // gráfico diria uma coisa e a lista outra.
    const por_terco: [number, number, number] = [0, 0, 0];
    for (const v of visiveis) {
      const i = frases.length === 0 ? 0 : Math.min(2, Math.floor((v.ordem / frases.length) * 3));
      por_terco[i] += 1;
    }
    return c.json({ ...relatorio, violacoes: visiveis, por_terco, ignoradas: ignoradas.size });
  });

  // Ignorar um alerta de estilo: some da lista e da contagem, sem tocar no
  // texto. Por TRINCA (frase, regra, trecho).
  app.post('/frases/:id/estilo/dispensar', async (c) => {
    const corpo = z
      .object({ regra: z.string().min(1), trecho: z.string().min(1), desfazer: z.boolean().optional() })
      .safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const fraseId = Number(c.req.param('id'));
    if (!reposFrases.obter(db, fraseId))
      return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Frase não encontrada.' } }, 404);
    const { regra, trecho, desfazer } = corpo.data;
    if (desfazer) reposEstiloIgnorado.restaurar(db, fraseId, regra, trecho);
    else reposEstiloIgnorado.dispensar(db, fraseId, regra, trecho);
    return c.json({ ok: true });
  });

  // Dispensar uma ocorrência: "já conferi, aqui está certo". Por PAR
  // (frase, termo) — não desliga o termo na obra inteira.
  app.post('/frases/:id/consistencia/dispensar', async (c) => {
    const corpo = z.object({ termo_zh: z.string().min(1), desfazer: z.boolean().optional() }).safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const fraseId = Number(c.req.param('id'));
    const frase = reposFrases.obter(db, fraseId);
    if (!frase) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Frase não encontrada.' } }, 404);
    if (corpo.data.desfazer) reposConsistencia.restaurar(db, fraseId, corpo.data.termo_zh);
    else reposConsistencia.dispensar(db, fraseId, corpo.data.termo_zh);
    return c.json({ ok: true });
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

  // ── Download do capítulo traduzido (produto final do fluxo) ──────────────
  // A remontagem do texto vive em exportacao/texto.ts, compartilhada com o EPUB
  // e o Markdown da obra inteira (doc 12 §5).

  app.get('/capitulos/:id/baixar', (c) => {
    const id = Number(c.req.param('id'));
    const capitulo = reposCapitulos.obter(db, id);
    if (!capitulo) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Capítulo não encontrado.' } }, 404);
    const param = c.req.query('formato');
    const formato: FormatoTexto = param === 'bilingue' ? 'bilingue' : param === 'md' ? 'md' : 'txt';

    const conteudo = textoCapitulo(capitulo, reposFrases.listarPorCapitulo(db, id), formato);

    const sufixo = formato === 'bilingue' ? '-bilingue' : '';
    const extensao = formato === 'md' ? 'md' : 'txt';
    return c.body(conteudo, 200, {
      'Content-Type': formato === 'md' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="capitulo-${capitulo.numero}${sufixo}.${extensao}"`,
    });
  });

  // ── Varredura reversa de consistência do glossário (doc 05 §4.2) ────────
  // A heurística está em traducao/consistencia.ts (reutilizada pelo checkpoint
  // e pela varredura automática ao concluir capítulo, doc 09 §3).

  app.get('/capitulos/:id/consistencia', (c) => {
    const id = Number(c.req.param('id'));
    const capitulo = reposCapitulos.obter(db, id);
    if (!capitulo) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Capítulo não encontrado.' } }, 404);
    const resultado = varrerConsistencia(
      reposFrases.listarPorCapitulo(db, id),
      reposGlossario.listar(db, capitulo.obra_id),
      reposConsistencia.ignoradasDoCapitulo(db, id),
    );
    // Mantém o badge da lista em dia quando a varredura é disparada à mão.
    reposCapitulos.definirConsistencia(db, id, resultado.violacoes.length);
    return c.json(resultado);
  });

  // ── QA por segunda IA (doc 09 §6) ─────────────────────────────────────────

  app.get('/capitulos/:id/qa', (c) => {
    const id = Number(c.req.param('id'));
    const capitulo = reposCapitulos.obter(db, id);
    if (!capitulo) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Capítulo não encontrado.' } }, 404);
    return c.json({ qa_em: capitulo.qa_em, apontamentos: reposQa.listar(db, id) });
  });

  app.post('/capitulos/:id/qa', async (c) => {
    const id = Number(c.req.param('id'));
    const forcar = c.req.query('forcar') === '1';
    try {
      const r = await analisarCapitulo(db, id, { forcar });
      if (!r.ok) {
        const status = r.codigo === 'par-igual' ? 409 : r.codigo === 'provedor' ? 502 : 400;
        return c.json({ erro: { codigo: r.codigo ?? 'qa', mensagem: r.erro } }, status);
      }
      return c.json({ ok: true, apontamentos: r.apontamentos, qa: reposQa.listar(db, id) });
    } catch (e) {
      // Sem este catch, uma exceção do provedor subia para o Hono e o cliente
      // ficava pendurado até o timeout dele — foi o que aconteceu na primeira
      // execução real da QA, com 4 minutos de espera e resposta vazia.
      return c.json({ erro: { codigo: 'qa', mensagem: `Falha na QA: ${(e as Error).message}` } }, 502);
    }
  });

  app.put('/qa/:id', async (c) => {
    const id = Number(c.req.param('id'));
    const corpo = z
      .object({ status: z.enum(['aceito', 'descartado']) })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const a = reposQa.definirStatus(db, id, corpo.data.status);
    if (!a) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Apontamento não encontrado.' } }, 404);
    return c.json(a);
  });

  app.post('/qa/:id/aplicar', (c) => {
    const r = reposQa.aplicarSugestao(db, Number(c.req.param('id')));
    if (r === undefined) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Apontamento não encontrado.' } }, 404);
    if (r === 'sem-sugestao') {
      return c.json({ erro: { codigo: 'sem-sugestao', mensagem: 'Este apontamento não traz uma sugestão aplicável.' } }, 400);
    }
    return c.json(r);
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
      liberarEmissor(id); // B1: sem ouvintes e sem job, o emissor não precisa viver para sempre
    });
  });

  return app;
}
