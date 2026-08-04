import { z } from 'zod';

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
        categoria: z.string().optional(),
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
        categoria: z.string().optional(),
        contexto: z.string().optional(),
      }),
    )
    .default([]),
});

export const respostaRevisaoSchema = z.object({
  trecho_zh: z.string(),
  veredito: z.enum(['correto', 'incorreto']),
  justificativa: z.string(),
  secao_regra: z.string().default('geral'),
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
