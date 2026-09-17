import { describe, expect, it } from 'vitest';
import { sistemaAdjudicacaoLiteraria, sistemaRevisaoLiteraria, usuarioAdjudicacaoLiteraria, usuarioRevisaoLiteraria } from './prompts.js';
import { provedorMock } from './mock.js';

const req = {
  modelo: 'mock-v1',
  omega: 'ALFA + BETA + DELTA',
  glossario: [],
  contextoAntes: [{ ordem: 0, paragrafo: 1, inicio_paragrafo: true, apos_fala_em_outro_paragrafo: false, texto_zh: '前', texto_pt: 'Antes.', texto_pt_original_ia: 'Antes IA.' }],
  alvos: [{ ordem: 1, paragrafo: 2, inicio_paragrafo: true, apos_fala_em_outro_paragrafo: false, texto_zh: 'MOCK_REVISAR中', texto_pt: 'Texto.', texto_pt_original_ia: 'Texto IA.' }],
  contextoDepois: [{ ordem: 2, paragrafo: 2, inicio_paragrafo: false, apos_fala_em_outro_paragrafo: false, texto_zh: '后', texto_pt: 'Depois.', texto_pt_original_ia: null }],
};

describe('prompt da revisão literária em sombra', () => {
  it('é conservador e distingue contexto de alvo', () => {
    const sistema = sistemaRevisaoLiteraria(req);
    expect(sistema).toContain('não fragmente a prosa');
    expect(sistema).toContain('devolva null');
    expect(sistema).toContain('Checklist por alvo');
    expect(sistema).toContain('tom LOCAL');
    expect(sistema).toContain('não soe traduzido');
    expect(sistema).toContain('Mudança de registro sem evidência local é regressão');
    expect(sistema).toContain('nada será publicado automaticamente');
    const usuario = usuarioRevisaoLiteraria(req);
    expect(usuario).toContain('Contexto anterior — não propor mudanças');
    expect(usuario).not.toContain('IA original: Antes IA.');
    expect(usuario).toContain('### Frases-alvo');
    expect(usuario).toContain('IA original: Texto IA.');
    expect(usuario).toContain('[1 §2 início]');
    expect(usuario).toContain('Contexto posterior — não propor mudanças');
  });

  it('o provedor alternativo respeita uma decisão por alvo', async () => {
    const resposta = await provedorMock.revisarLiterariamente(null, req);
    expect(resposta.propostas).toHaveLength(1);
    expect(resposta.propostas[0]).toMatchObject({ ordem: 1, confianca: 'alta' });
  });

  it('separa fidelidade de tom e naturalidade em passes curtos', () => {
    const fidelidade = sistemaRevisaoLiteraria({ ...req, foco: 'fidelidade' as const });
    expect(fidelidade).toContain('ESCOPO DESTE PASSE: FIDELIDADE');
    expect(fidelidade).toContain('Não faça polimento estilístico');
    const tom = sistemaRevisaoLiteraria({ ...req, foco: 'tom-naturalidade' as const });
    expect(tom).toContain('ESCOPO DESTE PASSE: TOM LOCAL E NATURALIDADE');
    expect(tom).toContain('sentido da versão recebida como já verificado');
  });

  it('mostra memória contrastiva como critério, sem confundi-la com regra global', () => {
    const usuario = usuarioRevisaoLiteraria({
      ...req,
      exemplosContrastivos: [{
        capitulo: 3, ordem: 9, texto_zh: '甲', texto_rejeitado: 'Ele permaneceu imóvel.',
        texto_aprovado: 'Ele ficou imóvel.', justificativa: 'Registro desnecessariamente elevado.',
        categorias: ['naturalidade', 'lexico'],
      }],
    });
    expect(usuario).toContain('imite o critério, não a redação');
    expect(usuario).toContain('REJEITADO: Ele permaneceu imóvel.');
    expect(usuario).toContain('APROVADO: Ele ficou imóvel.');
  });

  it('mostra o diagnóstico seletivo como suspeita, não como ordem de reescrita', () => {
    const seletiva = { ...req, foco: 'seletiva' as const, alvos: [{
      ...req.alvos[0], diagnostico: { fenomenos: ['registro'], razoes: ['termo formal suspeito'] },
    }] };
    expect(sistemaRevisaoLiteraria(seletiva)).toContain('suspeitas, não ordens de substituição');
    expect(sistemaRevisaoLiteraria(seletiva)).toContain('devolva null diante de falso positivo');
    expect(sistemaRevisaoLiteraria(seletiva)).toContain('altere o menor trecho suficiente');
    expect(sistemaRevisaoLiteraria(seletiva)).toContain('Nunca substitua mecanicamente mais-que-perfeito simples');
    expect(sistemaRevisaoLiteraria(seletiva)).toContain('Isso não proíbe passado composto');
    expect(sistemaRevisaoLiteraria(seletiva)).toContain('Não transforme um fato anterior em simultâneo');
    expect(usuarioRevisaoLiteraria(seletiva)).toContain('DIAGNÓSTICO: registro');
    expect(usuarioRevisaoLiteraria(seletiva)).toContain('termo formal suspeito');
  });

  it('o adjudicador vê vigente e candidato e não recebe instrução para reescrever', () => {
    const adjudicacao = {
      modelo: 'mock-juiz', omega: req.omega, glossario: [],
      contextoAntes: [{ ordem: 0, texto_pt: 'Antes.' }],
      comparacoes: [{ ordem: 1, texto_zh: '中', texto_vigente: 'Texto.', texto_candidato: 'Texto melhor.' }],
      contextoDepois: [{ ordem: 2, texto_pt: 'Depois.' }],
    };
    expect(sistemaAdjudicacaoLiteraria(adjudicacao)).toContain('Não reescreva nenhum texto');
    expect(sistemaAdjudicacaoLiteraria(adjudicacao)).toContain('normalização de tom');
    const usuario = usuarioAdjudicacaoLiteraria(adjudicacao);
    expect(usuario).toContain('VIGENTE: Texto.');
    expect(usuario).toContain('CANDIDATO: Texto melhor.');
  });
});
