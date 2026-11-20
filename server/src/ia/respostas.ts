import { z } from 'zod';
import { CATEGORIAS_GLOSSARIO } from '@dao-tale/shared';

const categoriaGlossarioAutomaticaSchema = z.enum(CATEGORIAS_GLOSSARIO);

// Validação das respostas estruturadas — compartilhada por todos os provedores.
// Cada provedor garante o formato pelo seu mecanismo (tool use, responseSchema),
// mas o conteúdo só entra no banco depois de passar por estes schemas.

export const respostaTraducaoSchema = z.object({
  // coerce: modelos sem saída estruturada nativa às vezes devolvem o número como string.
  traducoes: z.array(z.object({ ordem: z.coerce.number().int(), texto_pt: z.string() })),
  termos_novos: z
    .array(
      z.object({
        termo_zh: z.string(),
        termo_pt: z.string(),
        categoria: categoriaGlossarioAutomaticaSchema.optional(),
        contexto: z.string().optional(),
      }),
    )
    .default([]),
});

export const respostaExtrairTermosSchema = z.object({
  termos: z
    .array(
      z.object({
        termo_zh: z.string(),
        termo_pt: z.string(),
        categoria: categoriaGlossarioAutomaticaSchema.optional(),
        contexto: z.string().optional(),
      }),
    )
    .default([]),
});

export const respostaRevisaoSchema = z.object({
  trecho_zh: z.string(),
  veredito: z.enum(['correto', 'incorreto', 'escolha-legitima']),
  // O texto que trata do motivo declarado na pergunta. Obrigatório: era a
  // ausência dele que fazia a justificativa virar sobre outro assunto.
  // .min(1): resposta é hoje o ÚNICO texto que a gaveta mostra — justificativa
  // foi esvaziada por contrato. Os provedores "compat" (deepseek, openrouter,
  // groq, mistral) não têm schema forçado pela API, só instrução em prosa:
  // sem o mínimo, "resposta": "" passa o zod inteiro e produz um turno em
  // branco na tela, sem nenhuma indicação de que algo falhou. Vazio é falha
  // do modelo — tem de virar erro visível (ErroProvedor, ver contratos.ts),
  // não silêncio.
  resposta: z.string().min(1),
  // '' quando nenhuma regra decide o caso. Par natural de secao_regra.
  justificativa: z.string().default(''),
  // 'geral' era o valor de fuga do contrato antigo e virava recorrência falsa:
  // três dúvidas sem relação contadas como uma lacuna sistemática.
  secao_regra: z
    .string()
    .nullable()
    .default(null)
    .transform((s) => {
      const t = s?.trim();
      return t && t.toLowerCase() !== 'geral' ? t : null;
    }),
  correcao_proposta: z.string().nullable().default(null),
  // Par cirúrgico: o menor trecho do PT que muda, e o que ele vira. Permite
  // trocar SÓ o que está errado, preservando pontuação, aspas e o resto da
  // frase — a substituição pela frase inteira já apagou orações e aspas de
  // diálogo em casos reais. Nulo quando o modelo não coopera: aí vale o
  // caminho antigo, com aviso.
  trecho_pt_errado: z.string().nullable().default(null),
  trecho_pt_corrigido: z.string().nullable().default(null),
});

// Contracapa (título/sinopse da ficha): campos prontos, sem numeração e sem
// termos_novos — o que volta daqui é escrito direto na ficha da obra. Nulo é
// resposta legítima: a rota pode ter enviado só o título ou só a sinopse.
export const respostaContracapaSchema = z.object({
  titulo_pt: z.string().nullable().default(null),
  sinopse_pt: z.string().nullable().default(null),
});

export const respostaRefinarPromptSchema = z.object({
  propostas: z
    .array(
      z.object({
        camada: z.enum(['alfa', 'beta', 'gama', 'delta', 'nenhuma']),
        secao_regra: z.string(),
        regra_proposta: z.string(),
        justificativa: z.string(),
      }),
    )
    .default([]),
});

// QA por segunda IA (doc 09 §6): apontamentos por frase — a IA só aponta, nunca
// reescreve. Validação frouxa de propósito (tipo/severidade coeridos): um modelo
// criativo com um rótulo fora do enum não deve derrubar o bloco inteiro.
export const respostaQaSchema = z.object({
  apontamentos: z
    .array(
      z.object({
        ordem: z.coerce.number().int(),
        tipo: z
          .enum(['glossario', 'pronome-genero', 'repeticao', 'omissao', 'outro'])
          .catch('outro'),
        severidade: z.enum(['alta', 'media', 'baixa']).catch('media'),
        trecho_zh: z.string().default(''),
        observacao: z.string(),
        sugestao: z.string().nullable().default(null),
      }),
    )
    .default([]),
});

// Passe de estilo: a IA propõe o conserto SÓ das violações que o scanner acusou.
// `descartar` existe porque o scanner é heurístico por sufixo — "romãzeira",
// "Voadora" e "prepara" já apareceram como falso positivo. Dar ao modelo uma saída
// honesta é melhor que forçá-lo a inventar correção para o que está certo.
export const respostaPasseEstiloSchema = z.object({
  correcoes: z
    .array(
      z
        .object({
          ordem: z.coerce.number().int(),
          regra: z.string().default(''),
          trecho_pt_errado: z.string().nullable().default(null),
          trecho_pt_corrigido: z.string().nullable().default(null),
          descartar: z.boolean().default(false),
        })
        .refine((c) => c.descartar || (!!c.trecho_pt_errado && c.trecho_pt_corrigido != null), {
          message: 'correção sem par cirúrgico só é válida quando descartar = true',
        }),
    )
    .default([]),
});

export const respostaRevisaoLiterariaSchema = z.object({
  propostas: z.array(z.object({
    ordem: z.coerce.number().int(),
    texto_revisado: z.string().nullable().default(null),
    justificativa: z.string().default(''),
    categorias: z.array(z.enum(['fidelidade', 'naturalidade', 'coesao', 'ritmo', 'dialogo', 'lexico', 'gama', 'tipografia'])).default([]),
    confianca: z.enum(['alta', 'media', 'baixa']).catch('baixa'),
  })).default([]),
});

export const respostaAdjudicacaoLiterariaSchema = z.object({
  julgamentos: z.array(z.object({
    ordem: z.coerce.number().int(),
    veredito: z.enum(['melhora', 'equivalente', 'regressao', 'incerto']),
    justificativa: z.string().min(1),
    riscos: z.array(z.enum(['omissao', 'invencao', 'gama', 'registro', 'truncamento', 'dialogo', 'ritmo', 'nenhum'])).default([]),
  })).default([]),
});

// ── Tutor de idioma (doc 29) ───────────────────────────────────────────────
// Frouxo de propósito onde o modelo varia sem dano (classe livre, nota/leitura
// nulas ou ausentes); firme onde a tela depende (texto do segmento, tradução).

export const respostaExplicacaoTutorSchema = z.object({
  segmentos: z
    .array(
      z.object({
        texto: z.string().min(1),
        leitura: z.string().nullable().default(null),
        significado: z.string().default(''),
        classe: z.string().default(''),
        nota: z.string().nullable().default(null),
      }),
    )
    .min(1),
  estrutura: z.string().min(1),
  literal: z.string().default(''),
  traducao: z.string().min(1),
  armadilhas: z.array(z.string()).default([]),
});

export const respostaCorrecaoTutorSchema = z.object({
  veredito: z.enum(['certo', 'quase', 'errado']),
  acertos: z.string().default(''),
  problemas: z
    .array(
      z.object({
        trecho: z.string().default(''),
        // Tipo fora da lista vira 'sentido' em vez de derrubar a correção inteira.
        tipo: z
          .enum(['sentido', 'omissao', 'acrescimo', 'gramatica', 'naturalidade', 'glossario', 'estilo'])
          .catch('sentido'),
        explicacao: z.string().min(1),
        sugestao: z.string().default(''),
      }),
    )
    .default([]),
  versao_corrigida: z.string().min(1),
  palavras_para_estudar: z
    .array(z.object({ texto: z.string().min(1), leitura: z.string().nullable().default(null), significado: z.string() }))
    .default([]),
});
