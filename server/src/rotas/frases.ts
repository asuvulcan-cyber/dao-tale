import { Hono } from 'hono';
import { z } from 'zod';
import { PROVEDORES_IDS, type ProvedorId } from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import { reposCapitulos, reposConfig, reposFrases, reposGlossario, reposObras, reposPrompts, reposTermosSugeridos, reposTestes, reposUso } from '../db/repos.js';
import { obterProvedor } from '../ia/fabrica.js';
import { filtrarGlossarioRelevante, incluirPrincipais } from '../ia/prompts.js';
import { ErroProvedor } from '../ia/provedor.js';
import { obterChave } from '../credenciais/index.js';

const editarFraseSchema = z.object({ texto_pt: z.string() });

const revisarSchema = z.object({
  pergunta: z.string().min(1),
  provedor: z.enum(PROVEDORES_IDS).optional(),
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

  // ── Correção rápida de termo: troca em lote nas traduções ───────────────
  // previa=true só conta; sem ela, aplica e devolve o total afetado.

  app.post('/obras/:obraId/substituir', async (c) => {
    const corpo = z
      .object({
        de: z.string().min(1).max(80),
        para: z.string().max(160),
        capitulo_id: z.number().int().optional(),
        previa: z.boolean().default(false),
      })
      .refine((d) => d.de !== d.para, { message: 'Os textos "de" e "para" precisam ser diferentes.' })
      .safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);

    const obraId = Number(c.req.param('obraId'));
    if (!reposObras.obter(db, obraId)) {
      return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    }
    const opcoes = { obraId, capituloId: corpo.data.capitulo_id, de: corpo.data.de, para: corpo.data.para };
    const afetadas = corpo.data.previa
      ? reposFrases.contarTermo(db, opcoes)
      : reposFrases.substituirTermo(db, opcoes);
    return c.json(afetadas);
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

    const promptAtivo = reposPrompts.ativoOuAdotado(db, obra.id);
    if (!promptAtivo) {
      return c.json({ erro: { codigo: 'sem-prompt', mensagem: 'A obra não tem prompt mãe ativo e não há prompt padrão ativo.' } }, 400);
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

    const vizinhasAntes = vizinhas((o) => o < frase.ordem, true);
    const vizinhasDepois = vizinhas((o) => o > frase.ordem, false);
    const glossarioTodo = reposGlossario.listar(db, obra.id);
    const glossario = config.glossario_relevante
      ? incluirPrincipais(
          filtrarGlossarioRelevante(glossarioTodo, [
            frase.texto_zh,
            corpo.data.pergunta,
            ...vizinhasAntes.map((v) => v.texto_zh),
            ...vizinhasDepois.map((v) => v.texto_zh),
          ]),
          glossarioTodo,
        )
      : glossarioTodo;

    try {
      reposUso.registrar(db, provedorId, modelo);
      const resposta = await provedor.revisarFrase(chave, {
        modelo,
        promptMae: promptAtivo.conteudo,
        glossario,
        vizinhasAntes,
        vizinhasDepois,
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

  // ── Curadoria: extrair termos desta frase para o glossário ──────────────
  // Varredura exaustiva (pega o que o termos_novos da tradução deixou passar);
  // filtra o que já está no glossário ou já é sugestão pendente.

  app.post('/frases/:id/sugerir-termos', async (c) => {
    const corpo = z
      .object({ provedor: z.enum(PROVEDORES_IDS).optional(), modelo: z.string().optional() })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);

    const frase = reposFrases.obter(db, Number(c.req.param('id')));
    if (!frase) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Frase não encontrada.' } }, 404);

    const capitulo = reposCapitulos.obter(db, frase.capitulo_id)!;
    const obra = reposObras.obter(db, capitulo.obra_id)!;
    const config = reposConfig.obterTodas(db);

    const promptAtivo = reposPrompts.ativoOuAdotado(db, obra.id);
    if (!promptAtivo) {
      return c.json({ erro: { codigo: 'sem-prompt', mensagem: 'A obra não tem prompt mãe ativo e não há prompt padrão ativo.' } }, 400);
    }

    const provedorId: ProvedorId =
      corpo.data.provedor ?? (capitulo.provedor as ProvedorId | null) ?? obra.provedor_padrao ?? config.provedor_padrao;
    const provedor = obterProvedor(provedorId);
    const modelo = corpo.data.modelo ?? capitulo.modelo ?? obra.modelo_padrao ?? (config.modelo_padrao || provedor.modeloPadrao);
    const chave = provedor.precisaChave ? await obterChave(provedorId) : null;
    if (provedor.precisaChave && !chave) {
      return c.json({ erro: { codigo: 'sem-chave', mensagem: `Nenhuma chave de API configurada para ${provedor.nome}.` } }, 400);
    }

    try {
      reposUso.registrar(db, provedorId, modelo);
      const resposta = await provedor.extrairTermos(chave, {
        modelo,
        promptMae: promptAtivo.conteudo,
        glossario: reposGlossario.listar(db, obra.id),
        frase: { texto_zh: frase.texto_zh, texto_pt: frase.texto_pt },
      });
      // Rede de segurança: descarta o que já está catalogado ou já é sugestão
      // pendente (o modelo pode repetir apesar da instrução).
      const pendentes = new Set(reposTermosSugeridos.listar(db, obra.id, 'pendente').map((s) => s.termo_zh));
      const termos = resposta.termos.filter(
        (t) => t.termo_zh && t.termo_pt && !reposGlossario.existeTermo(db, obra.id, t.termo_zh) && !pendentes.has(t.termo_zh),
      );
      return c.json({ termos });
    } catch (e) {
      const mensagem = e instanceof ErroProvedor ? e.message : `Falha ao extrair termos: ${(e as Error).message}`;
      return c.json({ erro: { codigo: 'extracao', mensagem } }, 502);
    }
  });

  return app;
}
