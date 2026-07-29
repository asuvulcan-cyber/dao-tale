import type { ApontamentoQa, Configuracoes, ParProvedor, ProvedorId } from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import { reposCapitulos, reposConfig, reposFrases, reposGlossario, reposPrompts, reposQa, reposUso } from '../db/repos.js';
import { obterProvedor } from '../ia/fabrica.js';
import { filtrarGlossarioRelevante, incluirPrincipais } from '../ia/prompts.js';
import type { ParParaQa, RequisicaoQa } from '../ia/provedor.js';
import { obterChave } from '../credenciais/index.js';
import { registrarEvento } from '../telemetria/registrar.js';

// Passada de QA por segunda IA (doc 09 §6). A IA só aponta; nada é escrito nas
// frases sem decisão humana. Roda sob demanda (rota) ou ao fim de um capítulo
// do lote quando qa_automatica está ligada.

export type ResultadoQa =
  | { ok: true; apontamentos: number }
  | { ok: false; erro: string; codigo?: 'par-igual' | 'sem-par' | 'sem-frases' };

/** Par do QA: provedor_qa → par da revisão (doc 08 §5) → nada. Modelo resolvido. */
export function resolverParQa(config: Configuracoes): ParProvedor | null {
  const provedor: ProvedorId | '' = config.provedor_qa || config.provedor_revisao;
  if (!provedor) return null;
  const modelo =
    (config.provedor_qa ? config.modelo_qa : config.modelo_revisao) || obterProvedor(provedor).modeloPadrao;
  return { provedor, modelo };
}

const mesmoPar = (a: ParProvedor, b: { provedor: string | null; modelo: string | null }) =>
  a.provedor === b.provedor && a.modelo === b.modelo;

/** Roda a QA de um capítulo já traduzido. `forcar` ignora a regra do par igual
 * ao tradutor (para quem só tem uma chave). */
export async function analisarCapitulo(
  db: BancoDados,
  capituloId: number,
  opcoes: { forcar?: boolean } = {},
): Promise<ResultadoQa> {
  const capitulo = reposCapitulos.obter(db, capituloId);
  if (!capitulo) return { ok: false, erro: 'Capítulo não encontrado.' };

  const config = reposConfig.obterTodas(db);
  const par = resolverParQa(config);
  if (!par) {
    return {
      ok: false,
      codigo: 'sem-par',
      erro: 'Configure um provedor/modelo de QA (ou de revisão) em Configurações para rodar o QA.',
    };
  }
  // QA deve usar par diferente do tradutor (pontos cegos diferentes, doc 09 §6).
  if (!opcoes.forcar && mesmoPar(par, { provedor: capitulo.provedor, modelo: capitulo.modelo })) {
    return {
      ok: false,
      codigo: 'par-igual',
      erro: 'O QA usaria o mesmo modelo que traduziu o capítulo. Escolha outro par de QA ou force explicitamente.',
    };
  }

  const provedor = obterProvedor(par.provedor);
  const chave = provedor.precisaChave ? await obterChave(par.provedor) : null;
  if (provedor.precisaChave && !chave) {
    return { ok: false, erro: `Nenhuma chave de API configurada para ${provedor.nome} (QA).` };
  }

  const prompt = reposPrompts.composto(db, capitulo.obra_id);
  if (!prompt) return { ok: false, erro: 'A obra não tem prompt mãe ativo.' };

  const todas = reposFrases.listarPorCapitulo(db, capituloId);
  const traduzidas = todas.filter((f) => f.status_traducao === 'traduzida' && f.texto_pt.trim());
  if (traduzidas.length === 0) return { ok: false, codigo: 'sem-frases', erro: 'Nenhuma frase traduzida para auditar.' };

  const glossario = reposGlossario.listar(db, capitulo.obra_id);
  const porOrdem = new Map(todas.map((f) => [f.ordem, f]));

  const bloco = Math.max(1, config.tamanho_bloco);
  const cauda = Math.max(0, config.cauda_contexto);
  const coletados: Omit<ApontamentoQa, 'id' | 'capitulo_id' | 'status' | 'provedor' | 'modelo' | 'criado_em'>[] = [];

  for (let i = 0; i < traduzidas.length; i += bloco) {
    const pares: ParParaQa[] = traduzidas
      .slice(i, i + bloco)
      .map((f) => ({ ordem: f.ordem, texto_zh: f.texto_zh, texto_pt: f.texto_pt }));
    const caudaAnterior: ParParaQa[] = traduzidas
      .slice(Math.max(0, i - cauda), i)
      .map((f) => ({ ordem: f.ordem, texto_zh: f.texto_zh, texto_pt: f.texto_pt }));

    const glossarioDoBloco = config.glossario_relevante
      ? incluirPrincipais(
          filtrarGlossarioRelevante(glossario, pares.map((p) => p.texto_zh)),
          glossario,
        )
      : glossario;

    const req: RequisicaoQa = {
      modelo: par.modelo,
      promptMae: prompt.texto,
      glossario: glossarioDoBloco,
      glossarioNoUsuario: config.glossario_relevante,
      caudaAnterior,
      pares,
    };

    // Cada bloco de QA é uma requisição que o provedor debita da cota diária —
    // faltava contá-la (o indicador de cota subestimava o consumo quando o QA
    // rodava). Contada ANTES da chamada, como nos outros papéis.
    reposUso.registrar(db, par.provedor, par.modelo);
    const resposta = await provedor.analisarQa(chave, req);
    // Doc 11 §4: o QA é a compra separada mais cara do pipeline (~+140% projetado
    // no doc 09 §15) — cada bloco entra no livro-caixa para o número virar real.
    registrarEvento(db, {
      obra_id: capitulo.obra_id,
      capitulo_id: capituloId,
      papel: 'qa',
      provedor: par.provedor,
      modelo: par.modelo,
      uso: resposta.uso,
    });
    for (const a of resposta.apontamentos) {
      const frase = porOrdem.get(a.ordem);
      coletados.push({
        frase_id: frase?.id ?? null,
        tipo: a.tipo,
        severidade: a.severidade,
        trecho_zh: a.trecho_zh || null,
        observacao: a.observacao,
        sugestao: a.sugestao,
      });
    }
  }

  const n = reposQa.substituirPendentes(db, capituloId, par.provedor, par.modelo, coletados);
  return { ok: true, apontamentos: n };
}
