import { describe, expect, it } from 'vitest';
import { CONFIG_PADRAO, type Configuracoes } from '@dao-tale/shared';
import { resolverParContracapa } from './obras.js';

// Modelo por papel da contracapa (doc 08 §5/§11): título e sinopse são UMA
// chamada por obra — o par forte configurado aqui não pesa no custo do volume.

const config = (extra: Partial<Configuracoes> = {}): Configuracoes => ({ ...CONFIG_PADRAO, ...extra });

describe('resolverParContracapa', () => {
  it('sem provedor_detalhes, mantém o comportamento atual (obra → global)', () => {
    const c = config({ provedor_padrao: 'mock', modelo_padrao: 'mock-v1' });
    expect(resolverParContracapa(c, undefined, {})).toEqual({ provedor: 'mock', modelo: 'mock-v1' });
    expect(
      resolverParContracapa(c, { provedor_padrao: 'gemini', modelo_padrao: 'gemini-flash-latest' }, {}),
    ).toEqual({ provedor: 'gemini', modelo: 'gemini-flash-latest' });
  });

  it('provedor_detalhes vence a cadeia normal — o modelo barato da obra não é usado', () => {
    const c = config({ provedor_detalhes: 'claude', modelo_detalhes: 'claude-opus-5' });
    const obra = { provedor_padrao: 'deepseek' as const, modelo_padrao: 'deepseek-chat' };
    expect(resolverParContracapa(c, obra, {})).toEqual({ provedor: 'claude', modelo: 'claude-opus-5' });
  });

  it('provedor_detalhes sem modelo cai no padrão daquele provedor', () => {
    const c = config({ provedor_detalhes: 'claude', modelo_detalhes: '' });
    expect(resolverParContracapa(c, undefined, {}).modelo).toBe('claude-sonnet-5');
  });

  it('pedido explícito vence tudo', () => {
    const c = config({ provedor_detalhes: 'claude', modelo_detalhes: 'claude-opus-5' });
    expect(resolverParContracapa(c, undefined, { provedor: 'mock', modelo: 'mock-v1' })).toEqual({
      provedor: 'mock',
      modelo: 'mock-v1',
    });
  });

  it('nunca mistura o modelo de um provedor com outro', () => {
    // Provedor pedido na chamada, modelo só na obra (de outro provedor): o
    // modelo tem de voltar para o padrão do provedor pedido.
    const c = config({ provedor_padrao: 'gemini', modelo_padrao: 'gemini-flash-latest' });
    const obra = { provedor_padrao: 'gemini' as const, modelo_padrao: 'gemini-flash-latest' };
    expect(resolverParContracapa(c, obra, { provedor: 'claude' })).toEqual({
      provedor: 'claude',
      modelo: 'claude-sonnet-5',
    });
    // Pedido explícito de provedor_detalhes idem: modelo vazio → padrão do provedor.
    expect(resolverParContracapa(config({ provedor_detalhes: 'mock' }), obra, {})).toEqual({
      provedor: 'mock',
      modelo: 'mock-v1',
    });
  });
});
