import { Hono } from 'hono';
import { z } from 'zod';
import { normalizarPreferencias, PROVEDORES_IDS, resolverTemperatura, type ProvedorId } from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import { reposRevisaoLiteraria } from '../db/revisaoLiteraria.js';
import { reposCapitulos, reposConfig, reposFrases, reposGlossario, reposObras, reposPrompts, reposUso } from '../db/repos.js';
import { obterProvedor } from '../ia/fabrica.js';
import { ErroProvedor } from '../ia/provedor.js';
import { filtrarGlossarioRelevante, incluirPrincipais } from '../ia/prompts.js';
import { obterChave } from '../credenciais/index.js';
import { registrarEvento } from '../telemetria/registrar.js';
import { propostaPodeIrAoStaging, validarPropostaLiteraria } from '../revisao/literaria.js';
import { detectarRevisaoSeletiva } from '../revisao/detectorSeletivo.js';
import { resolverParQa } from '../traducao/qa.js';
import { lerJson } from './json.js';

const JANELA_CONTEXTO_LITERARIO = 8;

const propostaSchema = z.object({
  frase_id: z.number().int().positive(),
  texto_revisado: z.string().min(1),
  justificativa: z.string().nullable().optional(),
  categorias: z.array(z.string().min(1).max(60)).max(12).default([]),
});

export function rotasRevisaoLiteraria(db: BancoDados): Hono {
  const app = new Hono();

  app.get('/capitulos/:id/revisoes-literarias', (c) => {
    return c.json(reposRevisaoLiteraria.listarPorCapitulo(db, Number(c.req.param('id'))));
  });

  app.post('/obras/:id/revisoes-literarias/lotes', async (c) => {
    const corpo = z
      .object({ rotulo: z.string().min(1).max(120), criterios: z.string().nullable().optional() })
      .safeParse(await lerJson(c));
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const obraId = Number(c.req.param('id'));
    const obra = db.prepare('SELECT 1 FROM obras WHERE id=?').get(obraId);
    if (!obra) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    const id = reposRevisaoLiteraria.criarLote(db, { obraId, ...corpo.data });
    return c.json({ id }, 201);
  });

  app.post('/revisoes-literarias/lotes/:id/propostas', async (c) => {
    const corpo = propostaSchema.safeParse(await lerJson(c));
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const loteId = Number(c.req.param('id'));
    const pertence = db
      .prepare(
        `SELECT 1 FROM revisao_literaria_lotes l
         JOIN capitulos c ON c.obra_id=l.obra_id
         JOIN frases f ON f.capitulo_id=c.id
         WHERE l.id=? AND f.id=?`,
      )
      .get(loteId, corpo.data.frase_id);
    if (!pertence) {
      return c.json({ erro: { codigo: 'escopo-invalido', mensagem: 'A frase não pertence à obra deste lote.' } }, 400);
    }
    try {
      return c.json(
        reposRevisaoLiteraria.propor(db, {
          loteId,
          fraseId: corpo.data.frase_id,
          textoRevisado: corpo.data.texto_revisado,
          justificativa: corpo.data.justificativa,
          categorias: corpo.data.categorias,
        }),
        201,
      );
    } catch (e) {
      if (e instanceof Error && e.message.includes('UNIQUE')) {
        return c.json({ erro: { codigo: 'proposta-duplicada', mensagem: 'Já existe proposta para esta frase no lote.' } }, 409);
      }
      throw e;
    }
  });

  app.put('/revisoes-literarias/:id', async (c) => {
    const corpo = propostaSchema.omit({ frase_id: true }).safeParse(await lerJson(c));
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const revisao = reposRevisaoLiteraria.editarProposta(db, Number(c.req.param('id')), {
      textoRevisado: corpo.data.texto_revisado,
      justificativa: corpo.data.justificativa,
      categorias: corpo.data.categorias,
    });
    if (!revisao) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Revisão não encontrada.' } }, 404);
    return c.json(revisao);
  });

  app.post('/revisoes-literarias/:id/decisao', async (c) => {
    const corpo = z.object({ decisao: z.enum(['aprovar', 'rejeitar']) }).safeParse(await lerJson(c));
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const revisao = reposRevisaoLiteraria.decidir(db, Number(c.req.param('id')), corpo.data.decisao);
    if (!revisao) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Revisão não encontrada.' } }, 404);
    if (revisao === 'conflito') {
      return c.json(
        { erro: { codigo: 'texto-alterado', mensagem: 'O texto vigente mudou depois da proposta. Atualize a proposta antes de aprovar.' } },
        409,
      );
    }
    return c.json(revisao);
  });

  app.post('/capitulos/:id/revisao-literaria/sombra', async (c) => {
    const corpo = z.object({
      inicio: z.number().int().min(0),
      quantidade: z.number().int().min(1).max(12).default(6),
      provedor: z.enum(PROVEDORES_IDS).optional(),
      modelo: z.string().min(1).max(160).optional(),
      adjudicar: z.boolean().default(true),
      seletiva: z.boolean().default(false),
      lote_id: z.number().int().positive().optional(),
    }).safeParse(await lerJson(c));
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);

    const capituloId = Number(c.req.param('id'));
    const capitulo = reposCapitulos.obter(db, capituloId);
    if (!capitulo) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Capítulo não encontrado.' } }, 404);
    const obra = reposObras.obter(db, capitulo.obra_id)!;
    const config = reposConfig.obterTodas(db);
    const provedorId = (corpo.data.provedor ?? (config.provedor_revisao || capitulo.provedor || obra.provedor_padrao || config.provedor_padrao)) as ProvedorId;
    const provedor = obterProvedor(provedorId);
    const modelo = corpo.data.modelo ?? (corpo.data.provedor ? provedor.modeloPadrao : config.modelo_revisao || capitulo.modelo || obra.modelo_padrao || config.modelo_padrao || provedor.modeloPadrao);
    const parQa = corpo.data.adjudicar ? resolverParQa(config) : null;
    if (corpo.data.adjudicar && !parQa) {
      return c.json({ erro: { codigo: 'sem-adjudicador', mensagem: 'Configure um provedor/modelo de QA diferente para adjudicar a revisão literária, ou rode explicitamente com adjudicar=false.' } }, 400);
    }
    if (parQa && parQa.provedor === provedorId && parQa.modelo === modelo) {
      return c.json({ erro: { codigo: 'adjudicador-igual', mensagem: 'O adjudicador deve usar outro provedor/modelo para oferecer pontos cegos independentes.' } }, 400);
    }
    const omega = reposPrompts.composto(db, capitulo.obra_id);
    if (!omega) return c.json({ erro: { codigo: 'sem-prompt', mensagem: 'A obra não tem prompt composto ativo.' } }, 400);

    const todas = reposFrases.listarPorCapitulo(db, capituloId).filter((f) => f.texto_pt.trim());
    const inicioIndice = todas.findIndex((f) => f.ordem >= corpo.data.inicio);
    if (inicioIndice < 0) return c.json({ erro: { codigo: 'sem-frases', mensagem: 'Não há frase traduzida a partir dessa ordem.' } }, 400);
    const janela = todas.slice(inicioIndice, inicioIndice + corpo.data.quantidade);
    const glossarioTodo = reposGlossario.listar(db, capitulo.obra_id);
    const diagnosticos = corpo.data.seletiva
      ? detectarRevisaoSeletiva(janela, normalizarPreferencias(reposPrompts.ativo(db, capitulo.obra_id)?.preferencias), glossarioTodo)
      : [];
    const diagnosticoPorOrdem = new Map(diagnosticos.map((d) => [d.ordem, d]));
    const selecionadas = corpo.data.seletiva ? janela.filter((f) => diagnosticoPorOrdem.has(f.ordem)) : janela;
    if (selecionadas.length === 0) {
      return c.json({ lote_id: null, gravadas: [], bloqueadas: [], sem_mudanca: [], respostas_inesperadas: [], adjudicador: null, detector: { examinadas: janela.length, selecionadas: 0, diagnosticos } });
    }
    const indicePorOrdem = new Map(todas.map((f, i) => [f.ordem, i]));
    const converter = (f: (typeof todas)[number]) => {
      const indice = indicePorOrdem.get(f.ordem)!;
      const anterior = todas[indice - 1];
      const inicioParagrafo = !anterior || anterior.paragrafo !== f.paragrafo;
      return {
        ordem: f.ordem, paragrafo: f.paragrafo, inicio_paragrafo: inicioParagrafo,
        apos_fala_em_outro_paragrafo: Boolean(inicioParagrafo && anterior && /^[\s*_]*["“].*["”][\s*_]*$/su.test(anterior.texto_pt.trim())),
        texto_zh: f.texto_zh, texto_pt: f.texto_pt, texto_pt_original_ia: f.texto_pt_original_ia,
        diagnostico: diagnosticoPorOrdem.get(f.ordem),
      };
    };
    const alvos = selecionadas.map(converter);
    const textosZh = selecionadas.map((f) => f.texto_zh);
    const glossario = config.glossario_relevante
      ? incluirPrincipais(filtrarGlossarioRelevante(glossarioTodo, textosZh), glossarioTodo)
      : glossarioTodo;
    const primeiroIndice = indicePorOrdem.get(selecionadas[0].ordem)!;
    const ultimoIndice = indicePorOrdem.get(selecionadas.at(-1)!.ordem)!;
    const chave = provedor.precisaChave ? await obterChave(provedorId) : null;
    if (provedor.precisaChave && !chave) return c.json({ erro: { codigo: 'sem-chave', mensagem: `Nenhuma chave configurada para ${provedor.nome}.` } }, 400);

    reposUso.registrar(db, provedorId, modelo);
    let resposta;
    try {
      resposta = await provedor.revisarLiterariamente(chave, {
        modelo,
        foco: corpo.data.seletiva ? 'seletiva' : 'integral',
        temperatura: resolverTemperatura(config.temperaturas, 'revisao', obra.temperatura),
        omega: omega.texto,
        glossario,
        contextoAntes: todas.slice(Math.max(0, primeiroIndice - JANELA_CONTEXTO_LITERARIO), primeiroIndice).map(converter),
        alvos,
        contextoDepois: todas.slice(ultimoIndice + 1, ultimoIndice + 1 + JANELA_CONTEXTO_LITERARIO).map(converter),
      });
    } catch (e) {
      const mensagem = e instanceof ErroProvedor ? e.message : `Falha na revisão literária: ${(e as Error).message}`;
      return c.json({ erro: { codigo: 'revisao-literaria', mensagem } }, 502);
    }
    registrarEvento(db, { obra_id: obra.id, capitulo_id: capituloId, papel: 'revisao', provedor: provedorId, modelo, uso: resposta.uso });

    const contagemPorOrdem = new Map<number, number>();
    for (const p of resposta.propostas) contagemPorOrdem.set(p.ordem, (contagemPorOrdem.get(p.ordem) ?? 0) + 1);
    const porOrdem = new Map(resposta.propostas.map((p) => [p.ordem, p]));
    const ordensAlvo = new Set(alvos.map((a) => a.ordem));
    const respostasInesperadas = resposta.propostas.filter((p) => !ordensAlvo.has(p.ordem)).map((p) => p.ordem);
    const julgamentoPorOrdem = new Map<number, Awaited<ReturnType<typeof provedor.adjudicarRevisaoLiteraria>>['julgamentos'][number]>();
    if (parQa) {
      const provedorQa = obterProvedor(parQa.provedor);
      const chaveQa = provedorQa.precisaChave ? await obterChave(parQa.provedor) : null;
      if (provedorQa.precisaChave && !chaveQa) return c.json({ erro: { codigo: 'sem-chave-qa', mensagem: `Nenhuma chave configurada para ${provedorQa.nome}.` } }, 400);
      const comparacoes = alvos.flatMap((alvo) => {
        const p = porOrdem.get(alvo.ordem);
        return p?.texto_revisado && p.texto_revisado.trim() !== alvo.texto_pt.trim()
          ? [{ ordem: alvo.ordem, texto_zh: alvo.texto_zh, texto_vigente: alvo.texto_pt, texto_candidato: p.texto_revisado }]
          : [];
      });
      if (comparacoes.length) {
        reposUso.registrar(db, parQa.provedor, parQa.modelo);
        let respostaQa;
        try {
          respostaQa = await provedorQa.adjudicarRevisaoLiteraria(chaveQa, {
            modelo: parQa.modelo,
            temperatura: resolverTemperatura(config.temperaturas, 'qa', obra.temperatura),
            omega: omega.texto,
            glossario,
            contextoAntes: todas.slice(Math.max(0, primeiroIndice - JANELA_CONTEXTO_LITERARIO), primeiroIndice).map((f) => ({ ordem: f.ordem, texto_pt: f.texto_pt })),
            comparacoes,
            contextoDepois: todas.slice(ultimoIndice + 1, ultimoIndice + 1 + JANELA_CONTEXTO_LITERARIO).map((f) => ({ ordem: f.ordem, texto_pt: f.texto_pt })),
          });
        } catch (e) {
          const mensagem = e instanceof ErroProvedor ? e.message : `Falha na adjudicação literária: ${(e as Error).message}`;
          return c.json({ erro: { codigo: 'adjudicacao-literaria', mensagem } }, 502);
        }
        registrarEvento(db, { obra_id: obra.id, capitulo_id: capituloId, papel: 'qa', provedor: parQa.provedor, modelo: parQa.modelo, uso: respostaQa.uso });
        for (const julgamento of respostaQa.julgamentos) julgamentoPorOrdem.set(julgamento.ordem, julgamento);
      }
    }
    const loteExistente = corpo.data.lote_id == null
      ? undefined
      : db.prepare('SELECT id, obra_id, rotulo FROM revisao_literaria_lotes WHERE id=?').get(corpo.data.lote_id) as
          | { id: number; obra_id: number; rotulo: string }
          | undefined;
    if (corpo.data.lote_id != null && (!loteExistente || loteExistente.obra_id !== obra.id)) {
      return c.json({ erro: { codigo: 'lote-invalido', mensagem: 'O lote de revisão não pertence a esta obra.' } }, 400);
    }
    const rotulo = loteExistente?.rotulo ?? `Sombra literária ${corpo.data.seletiva ? 'seletiva' : 'integral'} · cap. ${capitulo.numero} · ${provedorId}/${modelo} · ${new Date().toISOString()}`;
    const loteId = loteExistente?.id ?? reposRevisaoLiteraria.criarLote(db, {
      obraId: obra.id,
      rotulo,
      criterios: `Pipeline ${corpo.data.seletiva ? 'seletivo diagnosticado' : 'integral'} em sombra; Alfa/Beta/Gama/Delta compostos vigentes; nenhuma aplicação automática.`,
    });
    const gravadas = [];
    const bloqueadas = [];
    const semMudanca = [];
    for (const [indice, alvo] of alvos.entries()) {
      const proposta = porOrdem.get(alvo.ordem);
      const quantidadeRespostas = contagemPorOrdem.get(alvo.ordem) ?? 0;
      if (!proposta || quantidadeRespostas !== 1) {
        const mensagem = quantidadeRespostas === 0 ? 'O modelo omitiu a decisão desta frase.' : `O modelo devolveu ${quantidadeRespostas} decisões para a mesma frase.`;
        bloqueadas.push({ ordem: alvo.ordem, travas: [{ codigo: 'ordem', gravidade: 'bloqueio', mensagem }] });
        continue;
      }
      if (proposta.texto_revisado == null || proposta.texto_revisado.trim() === alvo.texto_pt.trim()) {
        semMudanca.push(alvo.ordem);
        continue;
      }
      const travas = validarPropostaLiteraria(alvo, proposta, glossario);
      if (parQa) {
        const julgamento = julgamentoPorOrdem.get(alvo.ordem);
        if (!julgamento) {
          travas.push({ codigo: 'adjudicacao', gravidade: 'bloqueio', mensagem: 'O adjudicador omitiu esta comparação.' });
        } else if (julgamento.veredito === 'regressao') {
          travas.push({ codigo: 'adjudicacao', gravidade: 'bloqueio', mensagem: `Regressão segundo o adjudicador: ${julgamento.justificativa}` });
        } else if (julgamento.veredito !== 'melhora') {
          travas.push({ codigo: 'adjudicacao', gravidade: 'alerta', mensagem: `${julgamento.veredito}: ${julgamento.justificativa}` });
        }
      }
      if (!propostaPodeIrAoStaging(travas)) {
        bloqueadas.push({ ordem: alvo.ordem, travas });
        continue;
      }
      gravadas.push(reposRevisaoLiteraria.propor(db, {
        loteId,
        fraseId: selecionadas[indice].id,
        textoRevisado: proposta.texto_revisado,
        justificativa: proposta.justificativa,
        categorias: [...proposta.categorias, `sombra:${provedorId}/${modelo}`, ...travas.map((t) => `alerta:${t.codigo}`)],
      }));
    }
    return c.json({ lote_id: loteId, rotulo, gravadas, bloqueadas, sem_mudanca: semMudanca, respostas_inesperadas: respostasInesperadas, adjudicador: parQa, detector: corpo.data.seletiva ? { examinadas: janela.length, selecionadas: selecionadas.length, diagnosticos } : null });
  });

  return app;
}
