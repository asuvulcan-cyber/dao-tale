import { describe, expect, it } from 'vitest';
import { USO_VAZIO, estimarTokens, usoDoClaude, usoDoCompat, usoDoGemini } from './uso.js';

// Conversão do `usage` de cada API para o contrato único (doc 11 §1). O que estes
// testes protegem é a comparabilidade entre provedores: a Anthropic já separa o
// cache da entrada, o Gemini e os compatíveis somam o cache no prompt — sem a
// subtração, o mesmo capítulo pareceria mais caro fora da Anthropic e a métrica
// de acerto de cache daria ~0%.

describe('usoDoClaude', () => {
  it('lê os quatro campos como vêm (a Anthropic já exclui o cache da entrada)', () => {
    expect(
      usoDoClaude({
        input_tokens: 120,
        output_tokens: 800,
        cache_read_input_tokens: 4000,
        cache_creation_input_tokens: 0,
      }),
    ).toEqual({
      tokens_entrada: 120,
      tokens_saida: 800,
      tokens_cache_leitura: 4000,
      tokens_cache_criacao: 0,
    });
  });

  it('campo ausente vira null, não 0', () => {
    const uso = usoDoClaude({ input_tokens: 10, output_tokens: 20 });
    expect(uso.tokens_cache_leitura).toBeNull();
    expect(uso.tokens_cache_criacao).toBeNull();
  });
});

describe('usoDoGemini', () => {
  it('desconta o cache do prompt e soma os tokens de raciocínio na saída', () => {
    // O thinking é cobrado como saída: escondê-lo tornaria invisível a economia
    // do thinkingBudget: 0 (doc 05).
    expect(
      usoDoGemini({
        promptTokenCount: 5000,
        cachedContentTokenCount: 4200,
        candidatesTokenCount: 700,
        thoughtsTokenCount: 300,
      }),
    ).toEqual({
      tokens_entrada: 800,
      tokens_saida: 1000,
      tokens_cache_leitura: 4200,
      tokens_cache_criacao: null,
    });
  });

  it('sem cache no payload, o prompt inteiro é entrada paga', () => {
    const uso = usoDoGemini({ promptTokenCount: 5000, candidatesTokenCount: 700 });
    expect(uso.tokens_entrada).toBe(5000);
    expect(uso.tokens_saida).toBe(700);
    expect(uso.tokens_cache_leitura).toBeNull();
  });

  it('payload inconsistente (cache maior que o prompt) não vira entrada negativa', () => {
    expect(usoDoGemini({ promptTokenCount: 100, cachedContentTokenCount: 900 }).tokens_entrada).toBe(0);
  });
});

describe('usoDoCompat', () => {
  it('convenção OpenAI: desconta prompt_tokens_details.cached_tokens', () => {
    expect(
      usoDoCompat({
        prompt_tokens: 3000,
        completion_tokens: 500,
        prompt_tokens_details: { cached_tokens: 2400 },
      }),
    ).toEqual({
      tokens_entrada: 600,
      tokens_saida: 500,
      tokens_cache_leitura: 2400,
      tokens_cache_criacao: null,
    });
  });

  it('DeepSeek: o "miss" já É a entrada paga a preço cheio', () => {
    const uso = usoDoCompat({
      prompt_tokens: 3000,
      completion_tokens: 500,
      prompt_cache_hit_tokens: 2400,
      prompt_cache_miss_tokens: 600,
    });
    expect(uso.tokens_entrada).toBe(600);
    expect(uso.tokens_cache_leitura).toBe(2400);
  });

  it('gateway que repassa escrita de cache (OpenRouter sobre a Anthropic)', () => {
    expect(usoDoCompat({ prompt_tokens: 900, cache_creation_input_tokens: 4000 }).tokens_cache_criacao).toBe(4000);
  });
});

describe('robustez', () => {
  it('payload lixo, vazio ou nulo devolve tudo null', () => {
    for (const lixo of [undefined, null, 'erro', 42, {}, { input_tokens: 'muitos' }, { promptTokenCount: -5 }]) {
      expect(usoDoClaude(lixo)).toEqual(USO_VAZIO);
      expect(usoDoGemini(lixo)).toEqual(USO_VAZIO);
      expect(usoDoCompat(lixo)).toEqual(USO_VAZIO);
    }
  });
});

describe('estimarTokens', () => {
  it('conta ~1 token por caractere CJK e ~1/3,8 nos demais', () => {
    expect(estimarTokens('十日终焉')).toBe(4);
    expect(estimarTokens('')).toBe(0);
    // Texto latino é bem mais barato por caractere que o chinês.
    expect(estimarTokens('a'.repeat(38))).toBe(10);
  });
});

describe('modelo resolvido', () => {
  it('guarda o modelo que ATENDEU quando o provedor informa', () => {
    // "gemini-flash-latest" é apelido; a cota gratuita do Google é por modelo
    // concreto (3.5 Flash: 20 req/dia). Sem isto, o consumo do app não cruza
    // com o painel do provedor.
    const u = usoDoGemini({ promptTokenCount: 100, candidatesTokenCount: 50 }, 'gemini-3.5-flash');
    expect(u.modelo_resolvido).toBe('gemini-3.5-flash');
  });

  it('não inventa o campo quando o provedor não informa', () => {
    const u = usoDoGemini({ promptTokenCount: 100, candidatesTokenCount: 50 });
    expect('modelo_resolvido' in u).toBe(false);
  });
});
