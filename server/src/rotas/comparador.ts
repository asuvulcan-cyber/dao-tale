import { Hono } from 'hono';
import { z } from 'zod';
import { PROVEDORES_IDS } from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import { reposConfig, reposGlossario, reposObras, reposPrompts, reposUso } from '../db/repos.js';
import { obterProvedor } from '../ia/fabrica.js';
import { filtrarGlossarioRelevante } from '../ia/prompts.js';
import { ErroProvedor, type RequisicaoTraducaoBloco } from '../ia/provedor.js';
import { obterChave } from '../credenciais/index.js';
import { segmentar } from '../segmentacao/segmentar.js';

// Comparador de modelos: o mesmo trecho passa por vários provedores/modelos em
// paralelo, com o prompt mãe e o glossário reais da obra — para escolher modelo
// e conferir se cada chave funciona. Nada é persistido além do contador de uso.

const compararSchema = z.object({
  texto_zh: z.string().trim().min(1).max(6000),
  alvos: z
    .array(z.object({ provedor: z.enum(PROVEDORES_IDS), modelo: z.string().max(120).optional() }))
    .min(1)
    .max(8),
});

export interface ResultadoComparacao {
  provedor: string;
  modelo: string;
  ok: boolean;
  texto_pt?: string;
  erro?: string;
  ms: number;
}

const MAX_FRASES = 60;

export function rotasComparador(db: BancoDados): Hono {
  const app = new Hono();

  app.post('/obras/:obraId/comparar', async (c) => {
    const corpo = compararSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);

    const obraId = Number(c.req.param('obraId'));
    const obra = reposObras.obter(db, obraId);
    if (!obra) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);

    const promptAtivo = reposPrompts.ativo(db, obraId);
    if (!promptAtivo) {
      return c.json({ erro: { codigo: 'sem-prompt', mensagem: 'A obra não tem prompt mãe ativo.' } }, 400);
    }

    const { frases } = segmentar(corpo.data.texto_zh);
    if (frases.length === 0) {
      return c.json({ erro: { codigo: 'texto-vazio', mensagem: 'Nenhuma frase reconhecida no texto.' } }, 400);
    }
    if (frases.length > MAX_FRASES) {
      return c.json(
        { erro: { codigo: 'texto-longo', mensagem: `Trecho longo demais para comparação (${frases.length} frases; máximo ${MAX_FRASES}). Use um trecho menor.` } },
        400,
      );
    }

    const config = reposConfig.obterTodas(db);
    const glossarioTodo = reposGlossario.listar(db, obraId);
    const glossario = config.glossario_relevante
      ? filtrarGlossarioRelevante(glossarioTodo, [corpo.data.texto_zh])
      : glossarioTodo;

    const base: Omit<RequisicaoTraducaoBloco, 'modelo'> = {
      promptMae: promptAtivo.conteudo,
      glossario,
      glossarioNoUsuario: config.glossario_relevante,
      caudaAnterior: [],
      frases: frases.map((f, i) => ({ ordem: i, texto_zh: f.texto_zh })),
      proximas: [],
    };

    const resultados = await Promise.all(
      corpo.data.alvos.map(async (alvo): Promise<ResultadoComparacao> => {
        const inicio = Date.now();
        try {
          const provedor = obterProvedor(alvo.provedor);
          const modelo = alvo.modelo?.trim() || provedor.modeloPadrao;
          const chave = provedor.precisaChave ? await obterChave(alvo.provedor) : null;
          if (provedor.precisaChave && !chave) {
            return { provedor: alvo.provedor, modelo, ok: false, erro: 'Nenhuma chave de API configurada.', ms: 0 };
          }
          reposUso.registrar(db, alvo.provedor, modelo);
          const resposta = await provedor.traduzirBloco(chave, { ...base, modelo });
          // Reconstrói parágrafos: frases do mesmo parágrafo juntas, parágrafos separados.
          const porOrdem = new Map(resposta.traducoes.map((t) => [t.ordem, t.texto_pt.trim()]));
          const paragrafos = new Map<number, string[]>();
          frases.forEach((f, i) => {
            const lista = paragrafos.get(f.paragrafo) ?? [];
            lista.push(porOrdem.get(i) ?? '⟨sem tradução⟩');
            paragrafos.set(f.paragrafo, lista);
          });
          const texto_pt = [...paragrafos.values()].map((l) => l.join(' ')).join('\n\n');
          return { provedor: alvo.provedor, modelo, ok: true, texto_pt, ms: Date.now() - inicio };
        } catch (e) {
          const mensagem = e instanceof ErroProvedor ? e.message : String((e as Error).message ?? e);
          return {
            provedor: alvo.provedor,
            modelo: alvo.modelo?.trim() || '(padrão)',
            ok: false,
            erro: mensagem,
            ms: Date.now() - inicio,
          };
        }
      }),
    );

    return c.json({ frases_total: frases.length, resultados });
  });

  return app;
}
