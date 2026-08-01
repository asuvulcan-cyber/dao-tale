import { describe, expect, it } from 'vitest';
import { criarLimitador } from './limite.js';

// Doc 13 §3: o que se protege aqui é a cota de API — quem adivinhar a senha
// gasta dinheiro real.

const opcoes = { janelaMs: 1000, maxPorIp: 3, maxGlobal: 5, atrasoPorFalhaMs: 100, atrasoMaxMs: 250 };

describe('freio do login', () => {
  it('libera enquanto está abaixo do teto e bloqueia ao atingir', () => {
    const l = criarLimitador(opcoes);
    for (let i = 0; i < 3; i++) {
      expect(l.checar('1.1.1.1').permitido).toBe(true);
      l.registrarFalha('1.1.1.1');
    }
    const v = l.checar('1.1.1.1');
    expect(v.permitido).toBe(false);
    expect(v.motivo).toBe('ip');
    expect(v.esperar_s).toBeGreaterThan(0);
  });

  it('o atraso cresce com as falhas e tem teto', () => {
    const l = criarLimitador(opcoes);
    expect(l.atrasoMs('1.1.1.1')).toBe(0);
    l.registrarFalha('1.1.1.1');
    expect(l.atrasoMs('1.1.1.1')).toBe(100);
    l.registrarFalha('1.1.1.1');
    l.registrarFalha('1.1.1.1');
    expect(l.atrasoMs('1.1.1.1')).toBe(250);
  });

  it('bloqueio é por IP: o vizinho não paga a conta', () => {
    const l = criarLimitador(opcoes);
    for (let i = 0; i < 3; i++) l.registrarFalha('1.1.1.1');
    expect(l.checar('1.1.1.1').permitido).toBe(false);
    expect(l.checar('2.2.2.2').permitido).toBe(true);
  });

  it('acerto zera o contador daquele IP', () => {
    const l = criarLimitador(opcoes);
    l.registrarFalha('1.1.1.1');
    l.registrarFalha('1.1.1.1');
    l.registrarSucesso('1.1.1.1');
    expect(l.atrasoMs('1.1.1.1')).toBe(0);
    expect(l.checar('1.1.1.1').permitido).toBe(true);
  });

  it('a janela expira e libera de novo', () => {
    const l = criarLimitador(opcoes);
    const t0 = Date.now();
    for (let i = 0; i < 3; i++) l.registrarFalha('1.1.1.1', t0);
    expect(l.checar('1.1.1.1', t0).permitido).toBe(false);
    expect(l.checar('1.1.1.1', t0 + 1001).permitido).toBe(true);
  });

  it('teto global cobre chute distribuído entre muitos IPs', () => {
    const l = criarLimitador(opcoes);
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) l.registrarFalha(`10.0.0.${i}`, t0);
    const v = l.checar('10.0.0.99', t0);
    expect(v.permitido).toBe(false);
    expect(v.motivo).toBe('global');
  });
});
