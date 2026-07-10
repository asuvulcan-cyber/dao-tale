import { z } from 'zod';

// Validação das respostas estruturadas — compartilhada por todos os provedores.
// Cada provedor garante o formato pelo seu mecanismo (tool use, responseSchema),
// mas o conteúdo só entra no banco depois de passar por estes schemas.

export const respostaTraducaoSchema = z.object({
  traducoes: z.array(z.object({ ordem: z.number().int(), texto_pt: z.string() })),
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

export const respostaRevisaoSchema = z.object({
  trecho_zh: z.string(),
  veredito: z.enum(['correto', 'incorreto']),
  justificativa: z.string(),
  secao_regra: z.string().default('geral'),
  correcao_proposta: z.string().nullable().default(null),
});
