import { Type, type Schema } from '@google/genai';
import type { z } from 'zod';
import { CATEGORIAS_GLOSSARIO } from '@dao-tale/shared';
import {
  respostaContracapaSchema,
  respostaExtrairTermosSchema,
  respostaPasseEstiloSchema,
  respostaQaSchema,
  respostaRefinarPromptSchema,
  respostaRevisaoSchema,
  respostaRevisaoLiterariaSchema,
  respostaAdjudicacaoLiterariaSchema,
  respostaTraducaoSchema,
} from './respostas.js';

// Fonte única dos contratos de saída estruturada (M7 da auditoria). Cada
// contrato é declarado UMA vez: o JSON Schema (com descrições e enums que
// guiam o modelo) alimenta o tool use do Claude diretamente; o formato do
// Gemini (`paraGemini`) e a instrução textual do compat (`instrucaoJson`) são
// DERIVADOS dele. O Zod correspondente (respostas.ts) valida a fronteira —
// de propósito mais frouxo que o schema de geração (ex.: categoria é enum na
// geração, string na validação: um modelo criativo não derruba o bloco).

export interface EsquemaJson {
  type: string | string[];
  description?: string;
  enum?: string[];
  properties?: Record<string, EsquemaJson>;
  required?: string[];
  items?: EsquemaJson;
}

export interface Contrato<T extends z.ZodTypeAny = z.ZodTypeAny> {
  /** Nome da ferramenta no tool use do Claude. */
  ferramenta: string;
  descricao: string;
  /** Fonte estrutural única (formato JSON Schema). */
  schema: EsquemaJson;
  /** Validação na fronteira — todo provedor passa a resposta por aqui. */
  zod: T;
  /** Linhas extras no fim da instrução textual (dicas de caso vazio etc.). */
  notasInstrucao?: string[];
}

// ── Derivações ─────────────────────────────────────────────────────────────

/** JSON Schema → formato `Schema` do Gemini (responseSchema). */
export function paraGemini(e: EsquemaJson): Schema {
  const tipos = Array.isArray(e.type) ? e.type : [e.type];
  const nulavel = tipos.includes('null');
  const tipo = tipos.find((t) => t !== 'null') ?? 'string';
  const base: Schema = {
    ...(e.description ? { description: e.description } : {}),
    ...(nulavel ? { nullable: true } : {}),
  };
  switch (tipo) {
    case 'object':
      return {
        ...base,
        type: Type.OBJECT,
        properties: Object.fromEntries(
          Object.entries(e.properties ?? {}).map(([chave, valor]) => [chave, paraGemini(valor)]),
        ),
        ...(e.required?.length ? { required: e.required } : {}),
      };
    case 'array':
      return { ...base, type: Type.ARRAY, ...(e.items ? { items: paraGemini(e.items) } : {}) };
    case 'integer':
      return { ...base, type: Type.INTEGER };
    case 'number':
      return { ...base, type: Type.NUMBER };
    case 'boolean':
      return { ...base, type: Type.BOOLEAN };
    default:
      return { ...base, type: Type.STRING, ...(e.enum ? { enum: e.enum } : {}) };
  }
}

/** Esqueleto compacto de exemplo (instrução dos provedores compat). */
function esqueleto(e: EsquemaJson): string {
  const tipos = Array.isArray(e.type) ? e.type : [e.type];
  const nulavel = tipos.includes('null');
  const tipo = tipos.find((t) => t !== 'null') ?? 'string';
  let corpo: string;
  if (tipo === 'object') {
    corpo = `{${Object.entries(e.properties ?? {})
      .map(([chave, valor]) => `"${chave}": ${esqueleto(valor)}`)
      .join(', ')}}`;
  } else if (tipo === 'array') {
    corpo = `[${e.items ? esqueleto(e.items) : ''}]`;
  } else if (e.enum) {
    corpo = e.enum.map((v) => `"${v}"`).join(' | ');
  } else if (tipo === 'integer' || tipo === 'number') {
    corpo = `<${e.description ?? 'número'}>`;
  } else if (tipo === 'boolean') {
    corpo = 'true | false';
  } else {
    corpo = `"<${e.description ?? '…'}>"`;
  }
  return nulavel ? `${corpo} ou null` : corpo;
}

/** JSON Schema → bloco "FORMATO DA RESPOSTA" para provedores sem saída
 * estruturada garantida (compat: JSON mode + instrução no prompt). */
export function instrucaoJson(contrato: Contrato): string {
  return [
    '## FORMATO DA RESPOSTA (obrigatório)',
    'Responda APENAS com um objeto JSON válido, sem texto fora dele e sem cercas de código, no formato:',
    esqueleto(contrato.schema),
    ...(contrato.notasInstrucao ?? []),
  ].join('\n');
}

// ── Contratos ──────────────────────────────────────────────────────────────

const TERMO_NOVO: EsquemaJson = {
  type: 'object',
  properties: {
    termo_zh: { type: 'string', description: 'termo em chinês, como no original' },
    termo_pt: { type: 'string', description: 'tradução adotada' },
    categoria: {
      type: 'string',
      enum: [...CATEGORIAS_GLOSSARIO],
      description: 'categoria semântica mais específica da taxonomia fechada do Gama; não invente categorias',
    },
    contexto: {
      type: 'string',
      description:
        'descrição curta do termo em português (1 frase) para lembrança no glossário — o que é, papel na história; NÃO copie o trecho chinês',
    },
  },
  required: ['termo_zh', 'termo_pt', 'categoria'],
};

export const CONTRATO_TRADUCAO: Contrato<typeof respostaTraducaoSchema> = {
  ferramenta: 'entregar_traducoes',
  descricao: 'Entrega as traduções do bloco e os termos novos detectados.',
  zod: respostaTraducaoSchema,
  schema: {
    type: 'object',
    properties: {
      traducoes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ordem: { type: 'integer', description: 'número da frase, exatamente como recebido' },
            texto_pt: { type: 'string', description: 'tradução da frase em português brasileiro' },
          },
          required: ['ordem', 'texto_pt'],
        },
      },
      termos_novos: { type: 'array', items: TERMO_NOVO },
    },
    required: ['traducoes', 'termos_novos'],
  },
  notasInstrucao: ['Se não houver termos novos, use "termos_novos": [].'],
};

// Contracapa: dois campos de texto pronto, sem itens numerados. A numeração da
// tradução de capítulo era o que picotava a sinopse (e matava os versos); aqui
// a sinopse é UM campo, traduzida inteira e de uma vez.
export const CONTRATO_CONTRACAPA: Contrato<typeof respostaContracapaSchema> = {
  ferramenta: 'entregar_contracapa',
  descricao: 'Entrega o título e a sinopse traduzidos, prontos para a ficha da obra.',
  zod: respostaContracapaSchema,
  schema: {
    type: 'object',
    properties: {
      titulo_pt: {
        type: ['string', 'null'],
        description: 'título em português brasileiro, pronto para a ficha; null se nenhum título foi enviado',
      },
      sinopse_pt: {
        type: ['string', 'null'],
        description:
          'sinopse completa em português brasileiro, com as mesmas quebras de linha e de parágrafo do original; null se nenhuma sinopse foi enviada',
      },
    },
    required: [],
  },
  notasInstrucao: ['Use null no campo cujo texto NÃO foi enviado — não invente título nem sinopse.'],
};

export const CONTRATO_EXTRAIR_TERMOS: Contrato<typeof respostaExtrairTermosSchema> = {
  ferramenta: 'entregar_termos',
  descricao: 'Entrega os termos da frase que merecem entrar no glossário.',
  zod: respostaExtrairTermosSchema,
  schema: {
    type: 'object',
    properties: {
      termos: { type: 'array', items: TERMO_NOVO },
    },
    required: ['termos'],
  },
  notasInstrucao: ['Se não houver termos novos, use "termos": [].'],
};

export const CONTRATO_REVISAO: Contrato<typeof respostaRevisaoSchema> = {
  ferramenta: 'entregar_revisao',
  descricao: 'Entrega a análise estruturada do Protocolo de Revisão.',
  zod: respostaRevisaoSchema,
  schema: {
    type: 'object',
    properties: {
      trecho_zh: { type: 'string', description: 'trecho exato do chinês que fundamenta a análise' },
      veredito: { type: 'string', enum: ['correto', 'incorreto', 'escolha-legitima'] },
      resposta: {
        type: 'string',
        description: 'a resposta à dúvida, tratando do motivo que o usuário declarou',
      },
      justificativa: {
        type: 'string',
        description: 'só quando uma REGRA do prompt decide o caso; string vazia caso contrário',
      },
      secao_regra: {
        type: ['string', 'null'],
        description: "id curto da regra citada (ex.: '3.2-nomes-proprios'); null quando não há regra",
      },
      correcao_proposta: { type: ['string', 'null'], description: 'frase corrigida completa em PT-BR' },
      trecho_pt_errado: {
        type: ['string', 'null'],
        description: 'o MENOR trecho da tradução atual que precisa mudar, copiado LETRA POR LETRA dela',
      },
      trecho_pt_corrigido: { type: ['string', 'null'], description: 'o que esse trecho deve virar' },
    },
    required: ['trecho_zh', 'veredito', 'resposta'],
  },
  notasInstrucao: [
    'Use null em correcao_proposta quando o veredito NÃO for "incorreto".',
    'Deixe secao_regra em null e justificativa em "" quando nenhuma regra do prompt decidir o caso — é o caso mais comum.',
    'trecho_pt_errado tem de ser uma cópia EXATA de um pedaço da tradução atual (mesmos acentos, mesma pontuação, mesmas aspas), curto: só o que muda, sem a frase em volta. É por ele que a correção é aplicada, trocando apenas aquele pedaço.',
    'NÃO inclua as aspas, o travessão ou a pontuação final da frase no trecho, a menos que sejam eles o erro.',
  ],
};

export const CONTRATO_QA: Contrato<typeof respostaQaSchema> = {
  ferramenta: 'entregar_qa',
  descricao: 'Entrega os apontamentos de QA da tradução (só aponta, não reescreve).',
  zod: respostaQaSchema,
  schema: {
    type: 'object',
    properties: {
      apontamentos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ordem: { type: 'integer', description: 'número da frase apontada, como recebido' },
            tipo: {
              type: 'string',
              enum: ['glossario', 'pronome-genero', 'repeticao', 'omissao', 'outro'],
            },
            severidade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
            trecho_zh: { type: 'string', description: 'trecho do chinês que evidencia o problema' },
            observacao: { type: 'string', description: 'o problema em uma frase' },
            sugestao: { type: ['string', 'null'], description: 'tradução corrigida completa, ou null' },
          },
          required: ['ordem', 'tipo', 'observacao'],
        },
      },
    },
    required: ['apontamentos'],
  },
  notasInstrucao: ['Se a tradução estiver boa, use "apontamentos": []. NÃO reescreva a tradução — apenas aponte.'],
};

export const CONTRATO_PASSE_ESTILO: Contrato<typeof respostaPasseEstiloSchema> = {
  ferramenta: 'entregar_passe_estilo',
  descricao: 'Entrega o conserto pontual das violações de estilo apontadas.',
  zod: respostaPasseEstiloSchema,
  schema: {
    type: 'object',
    properties: {
      correcoes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ordem: { type: 'integer', description: 'número da frase, como recebido' },
            regra: { type: 'string', description: 'a violação apontada, ecoada para conferência' },
            trecho_pt_errado: {
              type: ['string', 'null'],
              description: 'o MENOR pedaço da tradução atual que muda, copiado LETRA POR LETRA e ÚNICO na frase',
            },
            trecho_pt_corrigido: { type: ['string', 'null'], description: 'o que esse pedaço deve virar' },
            descartar: { type: 'boolean', description: 'true = não há violação de verdade aqui' },
          },
          required: ['ordem'],
        },
      },
    },
    required: ['correcoes'],
  },
  notasInstrucao: [
    'Se não houver nada a consertar, use "correcoes": [].',
    'trecho_pt_errado tem de ser cópia EXATA de um pedaço do texto atual e ÚNICO na frase: se a palavra se repetir, inclua as vizinhas necessárias para desambiguar.',
    'Quando a violação apontada for falso positivo, devolva descartar: true e deixe o par em null.',
  ],
};

export const CONTRATO_REVISAO_LITERARIA: Contrato<typeof respostaRevisaoLiterariaSchema> = {
  ferramenta: 'entregar_revisao_literaria',
  descricao: 'Entrega propostas literárias por frase, sem aplicar nenhuma alteração.',
  zod: respostaRevisaoLiterariaSchema,
  schema: {
    type: 'object',
    properties: {
      propostas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ordem: { type: 'integer', description: 'número da frase exatamente como recebido' },
            texto_revisado: { type: ['string', 'null'], description: 'frase completa revisada; null se o texto vigente já estiver bom' },
            justificativa: { type: 'string', description: 'problema concreto e efeito da correção, em uma frase curta' },
            categorias: { type: 'array', items: { type: 'string', enum: ['fidelidade', 'naturalidade', 'coesao', 'ritmo', 'dialogo', 'lexico', 'gama', 'tipografia'] } },
            confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] },
          },
          required: ['ordem', 'texto_revisado', 'justificativa', 'categorias', 'confianca'],
        },
      },
    },
    required: ['propostas'],
  },
  notasInstrucao: [
    'Devolva exatamente uma decisão para cada frase-alvo.',
    'Use texto_revisado: null quando não houver ganho claro; não reescreva só para variar.',
    'Não inclua frases marcadas como contexto.',
  ],
};

export const CONTRATO_ADJUDICACAO_LITERARIA: Contrato<typeof respostaAdjudicacaoLiterariaSchema> = {
  ferramenta: 'entregar_adjudicacao_literaria',
  descricao: 'Compara texto vigente e candidato contra o chinês e julga se houve ganho real.',
  zod: respostaAdjudicacaoLiterariaSchema,
  schema: {
    type: 'object',
    properties: {
      julgamentos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ordem: { type: 'integer', description: 'número da frase exatamente como recebido' },
            veredito: { type: 'string', enum: ['melhora', 'equivalente', 'regressao', 'incerto'] },
            justificativa: { type: 'string', description: 'comparação concreta entre vigente e candidato, ancorada no chinês' },
            riscos: { type: 'array', items: { type: 'string', enum: ['omissao', 'invencao', 'gama', 'registro', 'truncamento', 'dialogo', 'ritmo', 'nenhum'] } },
          },
          required: ['ordem', 'veredito', 'justificativa', 'riscos'],
        },
      },
    },
    required: ['julgamentos'],
  },
  notasInstrucao: ['Devolva exatamente um julgamento para cada comparação.', 'Use equivalente quando a mudança apenas troca uma formulação boa por outra igualmente boa.'],
};

export const CONTRATO_REFINAR_PROMPT: Contrato<typeof respostaRefinarPromptSchema> = {
  ferramenta: 'entregar_propostas',
  descricao: 'Entrega as propostas de refinamento das diretrizes da obra.',
  zod: respostaRefinarPromptSchema,
  schema: {
    type: 'object',
    properties: {
      propostas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            camada: {
              type: 'string',
              enum: ['alfa', 'beta', 'gama', 'delta', 'nenhuma'],
              description: 'camada proprietária da correção; só delta entra nas diretrizes da obra',
            },
            secao_regra: { type: 'string', description: 'identificador dos casos que motivaram a proposta' },
            regra_proposta: { type: 'string', description: 'texto pronto para entrar nas diretrizes da obra' },
            justificativa: { type: 'string', description: 'uma frase ligando a regra aos casos' },
          },
          required: ['camada', 'secao_regra', 'regra_proposta', 'justificativa'],
        },
      },
    },
    required: ['propostas'],
  },
  notasInstrucao: ['Se nada sustentar regra nova, use "propostas": [].'],
};
