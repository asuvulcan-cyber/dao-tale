import { describe, expect, it } from 'vitest';
import { respostaPasseEstiloSchema } from './respostas.js';
import { CONTRATO_PASSE_ESTILO } from './contratos.js';
import { sistemaPasseEstilo, usuarioPasseEstilo } from './prompts.js';

const req = {
  modelo: 'm',
  omega: 'PROMPT DA OBRA',
  alvos: [
    { ordem: 12, texto_pt: 'concluindo que ele errara.', violacoes: [{ regra: 'mais-que-perfeito', trecho: 'errara' }] },
  ],
  vizinhas: [{ ordem: 11, texto_pt: 'O senhor não lhe deu chance.' }],
};

describe('contrato do passe de estilo', () => {
  it('aceita correção com par cirúrgico', () => {
    const r = respostaPasseEstiloSchema.parse({
      correcoes: [
        { ordem: 12, regra: 'mais-que-perfeito', trecho_pt_errado: 'errara', trecho_pt_corrigido: 'errou' },
      ],
    });
    expect(r.correcoes[0].descartar).toBe(false);
  });

  it('aceita descarte sem par — o scanner é heurístico e erra', () => {
    const r = respostaPasseEstiloSchema.parse({
      correcoes: [{ ordem: 3, regra: 'mais-que-perfeito', descartar: true }],
    });
    expect(r.correcoes[0].descartar).toBe(true);
    expect(r.correcoes[0].trecho_pt_errado).toBeNull();
  });

  it('recusa correção sem par quando não é descarte', () => {
    expect(() =>
      respostaPasseEstiloSchema.parse({ correcoes: [{ ordem: 3, regra: 'mais-que-perfeito' }] }),
    ).toThrow();
  });

  it('lista vazia é resposta válida', () => {
    expect(respostaPasseEstiloSchema.parse({}).correcoes).toEqual([]);
  });

  it('as instruções proíbem tocar em mais que a violação', () => {
    const s = sistemaPasseEstilo(req);
    expect(s).toMatch(/apenas a viola[çc][ãa]o/i);
    expect(s).toMatch(/n[ãa]o retraduza/i);
    // Sem isto o modelo devolve um trecho que aparece duas vezes na frase e
    // aplicarCorrecao cai no caminho da frase inteira.
    expect(s).toMatch(/[úu]nico na frase/i);
  });

  it('a mensagem traz a frase, a regra e o trecho acusado', () => {
    const u = usuarioPasseEstilo(req);
    expect(u).toContain('[12]');
    expect(u).toContain('concluindo que ele errara.');
    expect(u).toContain('mais-que-perfeito');
    expect(u).toContain('errara');
  });
});
