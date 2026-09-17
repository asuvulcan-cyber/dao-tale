import type { EntradaGlossario } from '@dao-tale/shared';
import { contemTermoFlexionado } from '../traducao/flexao.js';

export const CATEGORIAS_REVISAO_LITERARIA = [
  'fidelidade',
  'naturalidade',
  'coesao',
  'ritmo',
  'dialogo',
  'lexico',
  'gama',
  'tipografia',
] as const;

export type CategoriaRevisaoLiteraria = (typeof CATEGORIAS_REVISAO_LITERARIA)[number];

export interface AlvoRevisaoLiteraria {
  ordem: number;
  paragrafo: number;
  inicio_paragrafo: boolean;
  apos_fala_em_outro_paragrafo: boolean;
  texto_zh: string;
  texto_pt: string;
  texto_pt_original_ia: string | null;
  diagnostico?: { fenomenos: string[]; razoes: string[] };
}

export interface PropostaLiterariaIa {
  ordem: number;
  texto_revisado: string | null;
  justificativa: string;
  categorias: CategoriaRevisaoLiteraria[];
  confianca: 'alta' | 'media' | 'baixa';
}

export type GravidadeTravaLiteraria = 'bloqueio' | 'alerta';

export interface TravaLiteraria {
  codigo: 'ordem' | 'vazio' | 'inicio-minusculo' | 'dicendi-entre-paragrafos' | 'chines-introduzido' | 'numero-perdido' | 'nota-perdida' | 'gama' | 'extensao' | 'registro-elevado' | 'complexidade' | 'tique-repeticao' | 'passado-composto-introduzido' | 'capitalizacao-nao-diagnosticada' | 'diagnostico-nao-resolvido' | 'adjudicacao';
  gravidade: GravidadeTravaLiteraria;
  mensagem: string;
}

const HAN = /[\u3400-\u9fff]/gu;
const NUMERO = /\d+(?:[.,]\d+)*/g;
const NOTA = /\(\((.*?)\)\)/gs;
const MARCADORES_FORMAIS = /\b(?:tampouco|outrossim|doravante|quiçá|deveras|conquanto|não obstante|ademais|destarte|fitou|contemplou|permaneceu|prostr(?:o|a|ou|aram|ar|ado|ada))\b/giu;
const TIQUES = /\b(?:tornou a|passou a|pôs-se a)\b/giu;
const PASSADO_COMPOSTO = /\b(?:tinha|tinham|havia|haviam)\s+(?:sido\s+)?(?:[a-zà-úç]+(?:ado|ido)|feito|dito|visto|posto|escrito|aberto|morto|vindo)\b/giu;
const POSTOS = /\b(?:assassinos?|espadachins?|espectros?|homens? de sabre)\b/giu;

// Reconhece somente a substituição literal de formas simples por compostas.
// Não pretende inferir anterioridade do chinês ou julgar alterações mais amplas.
function trocaTemporalMecanica(base: string, revisado: string): boolean {
  const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const irregulares: Record<string, string> = {
    feito: 'fizera', dito: 'dissera', visto: 'vira', posto: 'pusera',
    escrito: 'escrevera', aberto: 'abrira', morto: 'morrera', vindo: 'viera', sido: 'fora',
  };
  let padrao = '', fim = 0;
  for (const m of revisado.matchAll(PASSADO_COMPOSTO)) {
    padrao += escapar(revisado.slice(fim, m.index));
    const palavras = m[0].toLocaleLowerCase('pt-BR').split(/\s+/u);
    // Locuções passivas e construções fora deste subconjunto ficam para julgamento.
    const participio = palavras.length === 2 ? palavras[1] : '';
    const simples = irregulares[participio] ? [irregulares[participio]]
      : participio.endsWith('ado') ? [participio.slice(0, -3) + 'ara']
        : participio.endsWith('ido') ? [participio.slice(0, -3) + 'era', participio.slice(0, -3) + 'ira'] : [];
    const plural = ['tinham', 'haviam'].includes(palavras[0]);
    // Permite locuções que já estavam presentes, sem perder o alinhamento literal.
    // No plural, “ouviram/treinaram” também podem ser pretérito perfeito.
    // Sem análise contextual não há evidência suficiente para bloquear.
    padrao += `(?:${[m[0], ...(plural ? [] : simples)].map(escapar).join('|')})`;
    fim = m.index + m[0].length;
  }
  return new RegExp(`^${padrao}${escapar(revisado.slice(fim))}$`, 'iu').test(base);
}

function multiconjunto(texto: string, padrao: RegExp): string[] {
  return [...texto.matchAll(padrao)].map((m) => m[0]).sort();
}

function iguais(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Barreiras conservadoras entre uma proposta da IA e o staging. Elas não tentam
 * julgar qualidade literária: só impedem regressões objetivas antes da leitura
 * humana. Alertas continuam visíveis; bloqueios não podem ser gravados.
 */
export function validarPropostaLiteraria(
  alvo: AlvoRevisaoLiteraria,
  proposta: PropostaLiterariaIa,
  glossario: EntradaGlossario[],
): TravaLiteraria[] {
  const resultado: TravaLiteraria[] = [];
  if (proposta.ordem !== alvo.ordem) {
    resultado.push({ codigo: 'ordem', gravidade: 'bloqueio', mensagem: `A resposta veio para a frase ${proposta.ordem}, não ${alvo.ordem}.` });
  }
  const revisado = proposta.texto_revisado?.trim() ?? '';
  if (!revisado) {
    if (proposta.texto_revisado !== null) {
      resultado.push({ codigo: 'vazio', gravidade: 'bloqueio', mensagem: 'A proposta substitui a frase por texto vazio.' });
    }
    return resultado;
  }

  if (alvo.inicio_paragrafo && /^\p{Ll}/u.test(revisado)) {
    resultado.push({ codigo: 'inicio-minusculo', gravidade: 'bloqueio', mensagem: 'Um novo parágrafo não pode começar com letra minúscula.' });
  }
  if (alvo.apos_fala_em_outro_paragrafo && /^(?:Disse|Gritou|Perguntou|Arriscou|Respondeu|Murmurou|Exclamou|Retrucou|Prosseguiu|Continuou|Afirmou)\b/u.test(revisado)) {
    resultado.push({ codigo: 'dicendi-entre-paragrafos', gravidade: 'bloqueio', mensagem: 'A atribuição está separada da fala por uma fronteira de parágrafo e precisa formar uma oração autônoma.' });
  }

  const hanAntes = multiconjunto(alvo.texto_pt, HAN);
  const hanDepois = multiconjunto(revisado, HAN);
  if (hanDepois.length > hanAntes.length) {
    resultado.push({ codigo: 'chines-introduzido', gravidade: 'bloqueio', mensagem: 'A revisão introduziu caracteres chineses no texto em português.' });
  }

  const numerosAntes = multiconjunto(alvo.texto_pt, NUMERO);
  const numerosDepois = multiconjunto(revisado, NUMERO);
  if (!iguais(numerosAntes, numerosDepois)) {
    resultado.push({ codigo: 'numero-perdido', gravidade: 'bloqueio', mensagem: `Números mudaram: [${numerosAntes.join(', ')}] → [${numerosDepois.join(', ')}].` });
  }

  const notasAntes = multiconjunto(alvo.texto_pt, NOTA);
  const notasDepois = multiconjunto(revisado, NOTA);
  if (!iguais(notasAntes, notasDepois)) {
    resultado.push({ codigo: 'nota-perdida', gravidade: 'bloqueio', mensagem: 'Uma nota editorial ((...)) foi alterada, removida ou inventada.' });
  }

  const presentes = glossario.filter((termo) => !termo.ambiguo && [...termo.termo_zh].length >= 2 && alvo.texto_zh.includes(termo.termo_zh));
  for (const termo of presentes) {
    if (presentes.some((outro) => outro.termo_zh !== termo.termo_zh && outro.termo_zh.includes(termo.termo_zh))) continue;
    // Entradas lexicais podem flexionar; exigir substring nelas produziria
    // falsos bloqueios. Identidades, ao contrário, têm grafia canônica.
    if ((termo.especie ?? 'identidade') !== 'identidade') continue;
    // Uma revisão local não deve ser obrigada a repetir nomes que a tradução
    // vigente verteu naturalmente por pronome ou sujeito elíptico. A trava
    // protege identidades já materializadas no PT; fidelidade ao ZH continua
    // sendo avaliada semanticamente pelo revisor/eval.
    if (contemTermoFlexionado(alvo.texto_pt, termo.termo_pt) && !contemTermoFlexionado(revisado, termo.termo_pt)) {
      resultado.push({
        codigo: 'gama',
        gravidade: 'bloqueio',
        mensagem: `O original contém ${termo.termo_zh}, mas a proposta não preserva a identidade canônica “${termo.termo_pt}”.`,
      });
    }
  }

  const base = Math.max(1, alvo.texto_pt.trim().length);
  const razao = revisado.length / base;
  if (razao < 0.55 || razao > 1.65) {
    resultado.push({ codigo: 'extensao', gravidade: 'alerta', mensagem: `A extensão mudou para ${Math.round(razao * 100)}% do texto vigente; conferir omissão ou explicação.` });
  }
  const formaisAntes = multiconjunto(alvo.texto_pt, MARCADORES_FORMAIS).length;
  const formaisDepois = multiconjunto(revisado, MARCADORES_FORMAIS).length;
  if (formaisDepois > formaisAntes) {
    resultado.push({
      codigo: 'registro-elevado',
      gravidade: alvo.diagnostico ? 'bloqueio' : 'alerta',
      mensagem: 'A candidata acrescentou marcador lexical formal ou literário; confirmar apoio no tom local do chinês.',
    });
  }
  const pontuacaoAntes = (alvo.texto_pt.match(/[;:—]/g) ?? []).length;
  const pontuacaoDepois = (revisado.match(/[;:—]/g) ?? []).length;
  if (razao > 1.2 && pontuacaoDepois > pontuacaoAntes) {
    resultado.push({ codigo: 'complexidade', gravidade: 'alerta', mensagem: 'A candidata ficou mais longa e sintaticamente mais marcada; confirmar que não houve ornamentação.' });
  }
  if (multiconjunto(revisado, TIQUES).length > multiconjunto(alvo.texto_pt, TIQUES).length) {
    resultado.push({ codigo: 'tique-repeticao', gravidade: 'alerta', mensagem: 'A candidata introduziu construção perifrástica recorrente; conferir aspecto e naturalidade no contexto.' });
  }
  if (alvo.diagnostico && multiconjunto(revisado, PASSADO_COMPOSTO).length > multiconjunto(alvo.texto_pt, PASSADO_COMPOSTO).length) {
    const diagnosticaFormaSimples = alvo.diagnostico.razoes.some(r => /mais-que-perfeito/iu.test(r));
    const mecanica = diagnosticaFormaSimples && trocaTemporalMecanica(alvo.texto_pt, revisado);
    resultado.push({
      codigo: 'passado-composto-introduzido',
      gravidade: mecanica ? 'bloqueio' : 'alerta',
      mensagem: mecanica
        ? 'A candidata apenas substituiu o mais-que-perfeito diagnosticado por formas compostas; isso não demonstra resolução do diagnóstico.'
        : 'A candidata introduziu passado composto. Conferir anterioridade e aspecto contra o chinês e o contexto; a forma, isoladamente, não demonstra erro nem correção.',
    });
  }
  const diagnosticaCapitalizacao = alvo.diagnostico?.fenomenos.includes('capitalizacao-contextual') ?? false;
  const postosAntes = multiconjunto(alvo.texto_pt, POSTOS);
  const postosDepois = multiconjunto(revisado, POSTOS);
  if (alvo.diagnostico && !diagnosticaCapitalizacao &&
      iguais(postosAntes.map((p) => p.toLocaleLowerCase('pt-BR')), postosDepois.map((p) => p.toLocaleLowerCase('pt-BR'))) &&
      !iguais(postosAntes, postosDepois)) {
    resultado.push({
      codigo: 'capitalizacao-nao-diagnosticada',
      gravidade: 'bloqueio',
      mensagem: 'O passe seletivo mudou a capitalização de um posto sem diagnóstico contextual; preservar o uso específico ou genérico da base.',
    });
  }
  const razoesPontuais = alvo.diagnostico?.razoes.filter((r) => /^(?:tinha|tinham|havia|haviam)\s+\p{L}+$/iu.test(r)) ?? [];
  if (razoesPontuais.some((r) => revisado.toLocaleLowerCase('pt-BR').includes(r.toLocaleLowerCase('pt-BR')))) {
    resultado.push({
      codigo: 'diagnostico-nao-resolvido',
      gravidade: 'bloqueio',
      mensagem: 'A candidata manteve a locução que motivou o passe seletivo; deslocá-la na frase não constitui correção.',
    });
  }
  return resultado;
}

export function propostaPodeIrAoStaging(travas: TravaLiteraria[]): boolean {
  return !travas.some((t) => t.gravidade === 'bloqueio');
}

export function distanciaNormalizada(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return 1;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const atual = [i];
    for (let j = 1; j <= b.length; j += 1) {
      atual[j] = Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    anterior = atual;
  }
  return anterior[b.length] / Math.max(a.length, b.length);
}

export interface ResultadoEvalLiteraria {
  total: number;
  referenciasPositivas: number;
  controlesNegativos: number;
  propostas: number;
  bloqueadas: number;
  coberturaReferencia: number;
  precisaoPropostas: number | null;
  correspondenciaExataReferencia: number;
  taxaCorrespondenciaExata: number;
  distanciaMediaReferencia: number | null;
  ganhoMedioReferencia: number | null;
  regressoesReferencia: number;
  falsosPositivos: number;
  taxaFalsoPositivo: number;
  omissoes: number;
}

/** Mede uma execução alternativa contra um conjunto congelado. Ausência de
 * mudança também é decisão: conta como omissão quando a referência mudou. */
export function avaliarExecucaoLiteraria(
  casos: { capitulo?: number; ordem: number; vigente: string; referencia: string }[],
  candidatas: ReadonlyMap<number | string, string | null>,
  bloqueadas: ReadonlySet<number | string> = new Set(),
): ResultadoEvalLiteraria {
  let propostas = 0;
  let falsosPositivos = 0;
  let omissoes = 0;
  let cobertas = 0;
  let correspondenciasExatas = 0;
  let regressoesReferencia = 0;
  const distancias: number[] = [];
  const ganhos: number[] = [];
  const chavesCasos = new Set<number | string>();
  const usarChaveComposta = casos.some((c) => c.capitulo != null);
  for (const caso of casos) {
    const chave = caso.capitulo == null ? caso.ordem : `${caso.capitulo}.${caso.ordem}`;
    chavesCasos.add(chave);
    // Nunca reutilize uma chave numérica entre capítulos: isso faria a saída de
    // 7.12, por exemplo, contaminar silenciosamente 12.12.
    const candidata = candidatas.get(chave) ?? (!usarChaveComposta ? candidatas.get(caso.ordem) : null) ?? null;
    const referenciaMudou = caso.referencia !== caso.vigente;
    const candidataMudou = candidata != null && candidata !== caso.vigente;
    if (candidataMudou) propostas += 1;
    if (referenciaMudou && !candidataMudou) omissoes += 1;
    if (!referenciaMudou && candidataMudou) falsosPositivos += 1;
    if (referenciaMudou && candidataMudou) {
      cobertas += 1;
    }
    if (referenciaMudou) {
      const textoAvaliado = candidataMudou ? candidata! : caso.vigente;
      const distanciaBase = distanciaNormalizada(caso.vigente, caso.referencia);
      const distanciaCandidata = distanciaNormalizada(textoAvaliado, caso.referencia);
      distancias.push(distanciaCandidata);
      if (textoAvaliado === caso.referencia) correspondenciasExatas += 1;
      if (distanciaCandidata > distanciaBase) regressoesReferencia += 1;
      ganhos.push(distanciaBase === 0 ? 0 : (distanciaBase - distanciaCandidata) / distanciaBase);
    }
  }
  const referencias = casos.filter((c) => c.referencia !== c.vigente).length;
  const controles = casos.length - referencias;
  return {
    total: casos.length,
    referenciasPositivas: referencias,
    controlesNegativos: controles,
    propostas,
    bloqueadas: [...bloqueadas].filter((chave) => chavesCasos.has(chave)).length,
    coberturaReferencia: referencias ? cobertas / referencias : 1,
    precisaoPropostas: propostas ? cobertas / propostas : null,
    correspondenciaExataReferencia: correspondenciasExatas,
    taxaCorrespondenciaExata: referencias ? correspondenciasExatas / referencias : 1,
    distanciaMediaReferencia: distancias.length ? distancias.reduce((a, b) => a + b, 0) / distancias.length : null,
    ganhoMedioReferencia: ganhos.length ? ganhos.reduce((a, b) => a + b, 0) / ganhos.length : null,
    regressoesReferencia,
    falsosPositivos,
    taxaFalsoPositivo: controles ? falsosPositivos / controles : 0,
    omissoes,
  };
}
