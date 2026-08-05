import type { UsoChamada } from './provedor.js';

// Conversão do payload de `usage` de cada API para o contrato único UsoChamada
// (doc 11 §1). Funções puras, sem rede — o formato de cada provedor entra como
// `unknown` e sai normalizado.
//
// O detalhe que faz os provedores serem comparáveis: a Anthropic devolve
// `input_tokens` JÁ EXCLUINDO o que veio do cache; o Gemini e os compatíveis com
// OpenAI devolvem o prompt INCLUINDO o cache. Sem subtrair, o mesmo capítulo
// pareceria mais caro no Gemini e a métrica de acerto de cache daria ~0%.

export const USO_VAZIO: UsoChamada = {
  tokens_entrada: null,
  tokens_saida: null,
  tokens_cache_leitura: null,
  tokens_cache_criacao: null,
};

/** Campo numérico de payload não confiável: só número finito e não-negativo
 * conta; qualquer outra coisa é `null` ("a API não informou"), nunca 0. */
function num(valor: unknown): number | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0) return null;
  return valor;
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
}

/** Soma tratando `null` como ausente: null + null = null (não 0). */
function somar(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return a + b;
}

/** Entrada paga a preço cheio quando o provedor informa o prompt COM o cache
 * dentro. Nunca negativa (payload inconsistente não vira dívida). */
function descontarCache(prompt: number | null, cache: number | null): number | null {
  if (prompt === null) return null;
  return Math.max(0, prompt - (cache ?? 0));
}

/** `message.usage` da Anthropic — o único formato que já separa cache de entrada. */
export function usoDoClaude(usage: unknown): UsoChamada {
  const u = objeto(usage);
  return {
    tokens_entrada: num(u.input_tokens),
    tokens_saida: num(u.output_tokens),
    tokens_cache_leitura: num(u.cache_read_input_tokens),
    tokens_cache_criacao: num(u.cache_creation_input_tokens),
  };
}

/** `usageMetadata` do Gemini. `thoughtsTokenCount` entra na SAÍDA porque é
 * cobrado como saída — é o desperdício que o `thinkingBudget: 0` combate
 * (doc 05); esconder aqui tornaria a economia invisível no painel. */
export function usoDoGemini(meta: unknown, modeloResolvido?: string | null): UsoChamada {
  const m = objeto(meta);
  const cache = num(m.cachedContentTokenCount);
  return {
    // Só entra quando o provedor informa: ausente ≠ null, e a maioria não diz.
    ...(modeloResolvido ? { modelo_resolvido: modeloResolvido } : {}),
    tokens_entrada: descontarCache(num(m.promptTokenCount), cache),
    tokens_saida: somar(num(m.candidatesTokenCount), num(m.thoughtsTokenCount)),
    tokens_cache_leitura: cache,
    // O Gemini não distingue escrita de cache no usage da geração.
    tokens_cache_criacao: null,
  };
}

/** `usage` das APIs compatíveis com OpenAI (DeepSeek, OpenRouter, Groq, Mistral).
 * O cache aparece em `prompt_tokens_details.cached_tokens` na convenção da
 * OpenAI e em `prompt_cache_hit_tokens`/`prompt_cache_miss_tokens` no DeepSeek —
 * quando vem o "miss", ele já É a entrada paga a preço cheio. */
export function usoDoCompat(usage: unknown): UsoChamada {
  const u = objeto(usage);
  const detalhes = objeto(u.prompt_tokens_details);
  const cache = num(detalhes.cached_tokens) ?? num(u.prompt_cache_hit_tokens);
  const miss = num(u.prompt_cache_miss_tokens);
  return {
    tokens_entrada: miss ?? descontarCache(num(u.prompt_tokens), cache),
    tokens_saida: num(u.completion_tokens),
    tokens_cache_leitura: cache,
    // Repassado por gateways que embrulham a Anthropic (OpenRouter); ausente nos demais.
    tokens_cache_criacao: num(u.cache_creation_input_tokens),
  };
}

/** Proxy local de contagem (≈1 token por caractere CJK + 1/3,8 nos demais) —
 * mesmo estimador dos scripts de medição. Só o provedor simulado usa isto;
 * provedor real sempre reporta o número dele. */
export function estimarTokens(texto: string): number {
  let cjk = 0;
  for (const ch of texto) if (/[　-鿿＀-￯]/.test(ch)) cjk++;
  return Math.round(cjk + (texto.length - cjk) / 3.8);
}
