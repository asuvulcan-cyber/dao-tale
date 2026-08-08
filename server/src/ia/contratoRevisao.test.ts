import { describe, expect, it } from 'vitest';
import { respostaRevisaoSchema } from './respostas.js';
import { CONTRATO_REVISAO } from './contratos.js';
import { sistemaRevisao, usuarioRevisao } from './prompts.js';

const base = {
  modelo: 'm',
  omega: 'PROMPT DA OBRA',
  glossario: [],
  vizinhasAntes: [],
  vizinhasDepois: [],
  frase: { texto_zh: '他还一直以为', texto_pt: 'Ele sempre achou', texto_pt_original_ia: null },
  pergunta: 'Sempre achou? 以为 carrega "presumir", e 一直 não é um "sempre" atemporal.',
};

describe('contrato da revisão', () => {
  it('exige resposta e aceita ausência de regra', () => {
    const r = respostaRevisaoSchema.parse({
      trecho_zh: '一直以为',
      veredito: 'escolha-legitima',
      resposta: 'Seu motivo procede: 以为 traz a crença equivocada.',
    });
    expect(r.resposta).toContain('procede');
    expect(r.secao_regra).toBeNull();
    expect(r.justificativa).toBe('');
  });

  it('trata "geral" e string vazia como ausência de regra', () => {
    expect(respostaRevisaoSchema.parse({ trecho_zh: 'z', veredito: 'correto', resposta: 'r', secao_regra: 'geral' }).secao_regra).toBeNull();
    expect(respostaRevisaoSchema.parse({ trecho_zh: 'z', veredito: 'correto', resposta: 'r', secao_regra: '  ' }).secao_regra).toBeNull();
  });

  it('rejeita resposta ausente', () => {
    expect(() => respostaRevisaoSchema.parse({ trecho_zh: 'z', veredito: 'correto' })).toThrow();
  });

  it('o schema da ferramenta pede resposta e não pede secao_regra', () => {
    expect(CONTRATO_REVISAO.schema.required).toContain('resposta');
    expect(CONTRATO_REVISAO.schema.required).not.toContain('secao_regra');
    expect(CONTRATO_REVISAO.schema.properties!.veredito.enum).toContain('escolha-legitima');
  });

  it('as instruções tratam a pergunta como premissa, não como endereço', () => {
    const sistema = sistemaRevisao(base);
    expect(sistema).toContain('premissa');
    expect(sistema).toMatch(/nunca substitua o motivo do usu[áa]rio/i);
    // A obrigação de citar regra era o que produzia justificativa sobre assunto
    // que o revisor não levantou (casos #23/#24).
    expect(sistema).not.toContain('citando a regra/seção do prompt da obra aplicável');
  });

  it('a pergunta do usuário vem com moldura', () => {
    expect(usuarioRevisao({ ...base, rotulosConhecidos: [] })).toContain('a premissa da sua análise');
  });
});
