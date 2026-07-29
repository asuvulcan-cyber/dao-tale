import { describe, expect, it } from 'vitest';
import type { PrecosModelos } from '@dao-tale/shared';
import { USO_VAZIO } from '../ia/uso.js';
import { buscarPreco, calcularCusto, economiaDoCache } from './precos.js';

// Conversão tokens → dinheiro (doc 11 §3). O que estes testes protegem é a
// distinção entre "grátis" e "não sei o preço": um modelo sem preço cadastrado
// jamais pode aparecer como US$ 0,00.

const PRECOS: PrecosModelos = {
  'claude:claude-sonnet-5': { entrada: 3, saida: 15 },
  'gemini:*': { entrada: 0, saida: 0 },
  'groq:llama-3.3-70b-versatile': { entrada: 0.59, saida: 0.79, cache_leitura: 0, cache_criacao: 0 },
};

describe('buscarPreco', () => {
  it('chave exata vence', () => {
    expect(buscarPreco(PRECOS, 'claude', 'claude-sonnet-5')).toEqual({ entrada: 3, saida: 15 });
  });

  it('cai no curinga do provedor', () => {
    expect(buscarPreco(PRECOS, 'gemini', 'gemini-flash-latest')).toEqual({ entrada: 0, saida: 0 });
  });

  it('modelo desconhecido não tem preço (não é zero)', () => {
    expect(buscarPreco(PRECOS, 'deepseek', 'deepseek-v4-flash')).toBeNull();
    expect(buscarPreco(PRECOS, 'claude', 'claude-opus-5')).toBeNull();
  });
});

describe('calcularCusto', () => {
  it('aplica os padrões de cache: leitura 0,1× e escrita 1,25× a entrada', () => {
    const custo = calcularCusto(PRECOS['claude:claude-sonnet-5'], {
      tokens_entrada: 1_000_000,
      tokens_saida: 1_000_000,
      tokens_cache_leitura: 1_000_000,
      tokens_cache_criacao: 1_000_000,
    });
    // 3 (entrada) + 15 (saída) + 0,3 (leitura) + 3,75 (escrita)
    expect(custo).toBeCloseTo(22.05, 10);
  });

  it('preço de cache explícito vence os padrões (faixa gratuita do Groq)', () => {
    const custo = calcularCusto(PRECOS['groq:llama-3.3-70b-versatile'], {
      tokens_entrada: 0,
      tokens_saida: 0,
      tokens_cache_leitura: 1_000_000,
      tokens_cache_criacao: 1_000_000,
    });
    expect(custo).toBe(0);
  });

  it('sem preço cadastrado, o custo é desconhecido — nunca 0', () => {
    expect(
      calcularCusto(null, { tokens_entrada: 999_999, tokens_saida: 999_999, tokens_cache_leitura: 0, tokens_cache_criacao: 0 }),
    ).toBeNull();
  });

  it('preço 0 explícito (faixa gratuita) custa 0, medido', () => {
    expect(calcularCusto(PRECOS['gemini:*'], { ...USO_VAZIO, tokens_entrada: 50_000, tokens_saida: 2_000 })).toBe(0);
  });

  it('provedor que não reportou nada: nada medido, nada a faturar', () => {
    expect(calcularCusto(PRECOS['claude:claude-sonnet-5'], USO_VAZIO)).toBeNull();
  });

  it('campo nulo isolado conta como 0, sem contaminar o resto', () => {
    const custo = calcularCusto(PRECOS['claude:claude-sonnet-5'], {
      tokens_entrada: 1_000_000,
      tokens_saida: null,
      tokens_cache_leitura: null,
      tokens_cache_criacao: null,
    });
    expect(custo).toBeCloseTo(3, 10);
  });
});

describe('economiaDoCache', () => {
  it('mede em dinheiro o que o cache poupou (entrada cheia − leitura)', () => {
    // 1M lidos no Sonnet 5: teriam custado US$ 3, custaram US$ 0,30.
    expect(economiaDoCache(PRECOS['claude:claude-sonnet-5'], 1_000_000)).toBeCloseTo(2.7, 10);
  });

  it('sem preço, não há economia calculável', () => {
    expect(economiaDoCache(null, 1_000_000)).toBeNull();
  });
});
