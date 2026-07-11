import { Hono } from 'hono';
import { z } from 'zod';
import type { ProvedorId } from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import { reposCapitulos, reposConfig, reposFrases, reposGlossario, reposObras, reposPrompts, reposTestes, reposUso } from '../db/repos.js';
import { obterProvedor } from '../ia/fabrica.js';
import { ErroProvedor } from '../ia/provedor.js';
import { obterChave } from '../credenciais/index.js';

const editarFraseSchema = z.object({ texto_pt: z.string() });

const revisarSchema = z.object({
  pergunta: z.string().min(1),
  provedor: z.enum(['claude', 'gemini', 'mock']).optional(),
  modelo: z.string().optional(),
});

export function rotasFrases(db: BancoDados): Hono {
  const app = new Hono();

  app.patch('/frases/:id', async (c) => {
    const corpo = editarFraseSchema.safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const frase = reposFrases.editarTexto(db, Number(c.req.param('id')), corpo.data.texto_pt);
    if (!frase) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Frase não encontrada.' } }, 404);
    return c.json(frase);
  });

  app.post('/frases/:id/reverter-ia', (c) => {
    const frase = reposFrases.reverterParaIa(db, Number(c.req.param('id')));
    if (!frase) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Frase não encontrada.' } }, 404);
    return c.json(frase);
  });

  // Histórico do Protocolo de Revisão desta frase (casos do banco de testes).
  app.get('/frases/:id/testes', (c) => {
    const frase = reposFrases.obter(db, Number(c.req.param('id')));
    if (!frase) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Frase não encontrada.' } }, 404);
    return c.json(reposTestes.listarPorFrase(db, frase.id));
  });

  // ── Correção de segmentação: mesclar / dividir (Fase 2) ─────────────────

  app.post('/frases/mesclar', async (c) => {
    const corpo = z
      .object({ frase_ids: z.array(z.number().int()).min(2) })
      .safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const resultado = reposFrases.mesclar(db, corpo.data.frase_ids);
    if (resultado === 'invalido') {
      return c.json(
        { erro: { codigo: 'mescla-invalida', mensagem: 'As frases precisam existir, ser do mesmo capítulo e adjacentes.' } },
        400,
      );
    }
    return c.json(resultado);
  });

  app.post('/frases/:id/dividir', async (c) => {
    const corpo = z
      .object({
        texto_zh_1: z.string(),
        texto_zh_2: z.string(),
        texto_pt_1: z.string().default(''),
        texto_pt_2: z.string().default(''),
      })
      .safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const resultado = reposFrases.dividir(db, Number(c.req.param('id')), corpo.data);
    if (resultado === undefined) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Frase não encontrada.' } }, 404);
    if (resultado === 'invalido') {
      return c.json(
        { erro: { codigo: 'divisao-invalida', mensagem: 'As duas metades precisam reconstituir exatamente o texto chinês original, sem partes vazias.' } },
        400,
      );
    }
    return c.json(resultado);
  });

  // ── Protocolo de Revisão (doc 05 §3) ────────────────────────────────────

  app.post('/frases/:id/revisar', async (c) => {
    const corpo = revisarSchema.safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);

    const frase = reposFrases.obter(db, Number(c.req.param('id')));
    if (!frase) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Frase não encontrada.' } }, 404);

    const capitulo = reposCapitulos.obter(db, frase.capitulo_id)!;
    const obra = reposObras.obter(db, capitulo.obra_id)!;
    const config = reposConfig.obterTodas(db);

    const promptAtivo = reposPrompts.ativo(db, obra.id);
    if (!promptAtivo) {
      return c.json({ erro: { codigo: 'sem-prompt', mensagem: 'A obra não tem prompt mãe ativo.' } }, 400);
    }

    const provedorId: ProvedorId =
      corpo.data.provedor ?? (capitulo.provedor as ProvedorId | null) ?? obra.provedor_padrao ?? config.provedor_padrao;
    const provedor = obterProvedor(provedorId);
    const modelo = corpo.data.modelo ?? capitulo.modelo ?? obra.modelo_padrao ?? (config.modelo_padrao || provedor.modeloPadrao);
    const chave = provedor.precisaChave ? await obterChave(provedorId) : null;
    if (provedor.precisaChave && !chave) {
      return c.json({ erro: { codigo: 'sem-chave', mensagem: `Nenhuma chave de API configurada para ${provedor.nome}.` } }, 400);
    }

    const todas = reposFrases.listarPorCapitulo(db, frase.capitulo_id);
    const n = config.vizinhas_revisao;
    const vizinhas = (filtro: (o: number) => boolean, ultimas: boolean) => {
      const lista = todas.filter((f) => filtro(f.ordem)).map((f) => ({ texto_zh: f.texto_zh, texto_pt: f.texto_pt }));
      return ultimas ? lista.slice(-n) : lista.slice(0, n);
    };

    try {
      reposUso.registrar(db, provedorId, modelo);
      const resposta = await provedor.revisarFrase(chave, {
        modelo,
        promptMae: promptAtivo.conteudo,
        glossario: reposGlossario.listar(db, obra.id),
        vizinhasAntes: vizinhas((o) => o < frase.ordem, true),
        vizinhasDepois: vizinhas((o) => o > frase.ordem, false),
        frase: {
          texto_zh: frase.texto_zh,
          texto_pt: frase.texto_pt,
          texto_pt_original_ia: frase.texto_pt_original_ia,
        },
        pergunta: corpo.data.pergunta,
      });

      const caso = reposTestes.criar(db, {
        frase_id: frase.id,
        obra_id: obra.id,
        trecho_zh: resposta.trecho_zh,
        pergunta: corpo.data.pergunta,
        veredito: resposta.veredito,
        justificativa: resposta.justificativa,
        secao_regra: resposta.secao_regra,
        correcao_proposta: resposta.correcao_proposta,
        provedor: provedorId,
        modelo,
        resposta_bruta: resposta.bruta,
      });

      return c.json({ revisao: resposta, caso });
    } catch (e) {
      const mensagem = e instanceof ErroProvedor ? e.message : `Falha na revisão: ${(e as Error).message}`;
      return c.json({ erro: { codigo: 'revisao', mensagem } }, 502);
    }
  });

  return app;
}
