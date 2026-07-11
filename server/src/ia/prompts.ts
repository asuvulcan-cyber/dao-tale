import type { EntradaGlossario } from '@dao-tale/shared';
import type { RequisicaoRevisao, RequisicaoTraducaoBloco } from './provedor.js';

// Montagem dos textos de sistema e usuário — compartilhada por todos os provedores.
// O bloco de sistema é idêntico em todas as chamadas de um capítulo (pré-requisito do prompt caching).

function formatarGlossario(glossario: EntradaGlossario[]): string {
  if (glossario.length === 0) return '(glossário ainda vazio)';
  return glossario
    .map((e) => `${e.termo_zh} → ${e.termo_pt} [${e.categoria}]${e.nota ? ` — ${e.nota}` : ''}`)
    .join('\n');
}

export function sistemaTraducao(promptMae: string, glossario: EntradaGlossario[]): string {
  return [
    promptMae.trim(),
    '',
    '## GLOSSÁRIO DA OBRA (uso obrigatório e consistente)',
    formatarGlossario(glossario),
    '',
    '## INSTRUÇÕES OPERACIONAIS DO APLICATIVO',
    'Você receberá frases numeradas em chinês para traduzir ao português brasileiro, seguindo integralmente as regras acima.',
    'Traduza cada frase numerada mantendo o número. Não traduza o contexto marcado como "já traduzido" nem o marcado como "contexto futuro".',
    'Se encontrar termos novos relevantes (nomes próprios, técnicas, lugares, títulos) que NÃO estão no glossário, liste-os em termos_novos com a tradução que você adotou.',
    'Responda exclusivamente pela ferramenta/formato estruturado fornecido.',
  ].join('\n');
}

export function usuarioTraducao(req: RequisicaoTraducaoBloco): string {
  const partes: string[] = [];
  if (req.caudaAnterior.length > 0) {
    partes.push('### Contexto anterior (já traduzido — não retraduzir):');
    for (const f of req.caudaAnterior) partes.push(`ZH: ${f.texto_zh}\nPT: ${f.texto_pt}`);
    partes.push('');
  }
  partes.push('### Frases a traduzir:');
  if (req.titulo) partes.push(`[-1] ${req.titulo} (título do capítulo — traduza como título)`);
  for (const f of req.frases) partes.push(`[${f.ordem}] ${f.texto_zh}`);
  if (req.proximas.length > 0) {
    partes.push('');
    partes.push('### Contexto futuro (apenas referência — não traduzir):');
    for (const zh of req.proximas) partes.push(zh);
  }
  return partes.join('\n');
}

export function sistemaRevisao(promptMae: string, glossario: EntradaGlossario[]): string {
  return [
    promptMae.trim(),
    '',
    '## GLOSSÁRIO DA OBRA',
    formatarGlossario(glossario),
    '',
    '## PROTOCOLO DE REVISÃO (instruções do aplicativo)',
    'Você é o revisor da tradução acima descrita. O usuário questionará uma escolha de tradução de UMA frase específica.',
    'Avalie a tradução questionada contra o texto-fonte chinês, as regras do prompt da obra e o glossário.',
    'Responda exclusivamente pelo formato estruturado, preenchendo:',
    '- trecho_zh: o trecho EXATO do chinês que fundamenta sua análise;',
    '- veredito: "correto" se a tradução atual está adequada, "incorreto" se precisa de correção;',
    '- justificativa: explicação objetiva citando a regra/seção do prompt da obra aplicável;',
    '- secao_regra: identificador curto e estável da seção/regra citada (ex.: "3.2-nomes-proprios"); use "geral" se nenhuma regra específica se aplica;',
    '- correcao_proposta: a frase COMPLETA corrigida em PT-BR se veredito for "incorreto"; null se "correto".',
  ].join('\n');
}

export function usuarioRevisao(req: RequisicaoRevisao): string {
  const partes: string[] = [];
  if (req.vizinhasAntes.length > 0) {
    partes.push('### Frases anteriores (contexto):');
    for (const f of req.vizinhasAntes) partes.push(`ZH: ${f.texto_zh}\nPT: ${f.texto_pt || '(sem tradução)'}`);
    partes.push('');
  }
  partes.push('### FRASE QUESTIONADA:');
  partes.push(`ZH: ${req.frase.texto_zh}`);
  partes.push(`PT atual: ${req.frase.texto_pt || '(sem tradução)'}`);
  if (req.frase.texto_pt_original_ia && req.frase.texto_pt_original_ia !== req.frase.texto_pt) {
    partes.push(`PT original da IA (antes de edições): ${req.frase.texto_pt_original_ia}`);
  }
  partes.push('');
  if (req.vizinhasDepois.length > 0) {
    partes.push('### Frases seguintes (contexto):');
    for (const f of req.vizinhasDepois) partes.push(`ZH: ${f.texto_zh}\nPT: ${f.texto_pt || '(sem tradução)'}`);
    partes.push('');
  }
  partes.push('### PERGUNTA DO USUÁRIO:');
  partes.push(req.pergunta);
  return partes.join('\n');
}

// JSON Schemas da saída estruturada (tool use / responseSchema)

export const SCHEMA_TRADUCAO = {
  type: 'object' as const,
  properties: {
    traducoes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ordem: { type: 'integer', description: 'Número da frase, exatamente como recebido' },
          texto_pt: { type: 'string', description: 'Tradução da frase em português brasileiro' },
        },
        required: ['ordem', 'texto_pt'],
      },
    },
    termos_novos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          termo_zh: { type: 'string' },
          termo_pt: { type: 'string' },
          categoria: {
            type: 'string',
            enum: ['local', 'poder-habilidade', 'entidade', 'titulo-cargo', 'personagem', 'outro'],
          },
          contexto: { type: 'string', description: 'Frase ou trecho onde o termo apareceu' },
        },
        required: ['termo_zh', 'termo_pt'],
      },
    },
  },
  required: ['traducoes', 'termos_novos'],
};

export const SCHEMA_REVISAO = {
  type: 'object' as const,
  properties: {
    trecho_zh: { type: 'string' },
    veredito: { type: 'string', enum: ['correto', 'incorreto'] },
    justificativa: { type: 'string' },
    secao_regra: { type: 'string' },
    correcao_proposta: { type: ['string', 'null'] },
  },
  required: ['trecho_zh', 'veredito', 'justificativa', 'secao_regra'],
};
