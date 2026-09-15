import { describe, expect, it } from 'vitest';
import type { EntradaGlossario } from '@dao-tale/shared';
import { avaliarExecucaoLiteraria, propostaPodeIrAoStaging, validarPropostaLiteraria } from './literaria.js';

const termo = (parcial: Partial<EntradaGlossario>): EntradaGlossario => ({
  id: 1, obra_id: 1, termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado', categoria: 'lugar',
  nota: null, origem: 'manual', principal_id: null, especie: 'identidade', nota_uso: null,
  ambiguo: false, termo_pai_id: null, criado_em: '', ...parcial,
});

const alvo = {
  ordem: 3,
  paragrafo: 2,
  inicio_paragrafo: false,
  apos_fala_em_outro_paragrafo: false,
  texto_zh: '他在金鹏堡等了三天。',
  texto_pt: 'Ele esperou 3 dias na Fortaleza do Peng Dourado. ((calendário local))',
  texto_pt_original_ia: null,
};

describe('travas da revisão literária em sombra', () => {
  it('aceita reescrita fiel que preserva número, nota e Gama', () => {
    const travas = validarPropostaLiteraria(alvo, {
      ordem: 3, texto_revisado: 'Na Fortaleza do Peng Dourado, ele esperou por 3 dias. ((calendário local))',
      justificativa: 'ordem natural', categorias: ['naturalidade'], confianca: 'alta',
    }, [termo({})]);
    expect(travas).toEqual([]);
    expect(propostaPodeIrAoStaging(travas)).toBe(true);
  });

  it('bloqueia perda objetiva sem confundir alerta de extensão com bloqueio', () => {
    const travas = validarPropostaLiteraria(alvo, {
      ordem: 3, texto_revisado: 'Ele esperou em outro lugar.', justificativa: '', categorias: [], confianca: 'baixa',
    }, [termo({})]);
    expect(travas.map((t) => t.codigo)).toEqual(expect.arrayContaining(['numero-perdido', 'nota-perdida', 'gama', 'extensao']));
    expect(propostaPodeIrAoStaging(travas)).toBe(false);
  });

  it('não força equivalência fixa para entrada contextual/ambígua', () => {
    const travas = validarPropostaLiteraria({ ...alvo, texto_zh: '内息乱了。', texto_pt: 'A respiração interna se desregulou.' }, {
      ordem: 3, texto_revisado: 'A circulação interna se desregulou.', justificativa: '', categorias: ['gama'], confianca: 'alta',
    }, [termo({ termo_zh: '内息', termo_pt: 'fluxo interno', ambiguo: true })]);
    expect(travas.some((t) => t.codigo === 'gama')).toBe(false);
  });

  it('aceita flexão portuguesa de uma identidade do Gama', () => {
    const travas = validarPropostaLiteraria({ ...alvo, texto_zh: '历代独步王。', texto_pt: 'Os Reis Incomparáveis de outras gerações.' }, {
      ordem: 3, texto_revisado: 'Os Reis Incomparáveis das gerações passadas.', justificativa: '', categorias: ['gama'], confianca: 'alta',
    }, [termo({ termo_zh: '独步王', termo_pt: 'Rei Incomparável' })]);
    expect(travas.some((t) => t.codigo === 'gama')).toBe(false);
  });

  it('não força repetir nome próprio que a base já resolveu por pronome', () => {
    const travas = validarPropostaLiteraria({ ...alvo, texto_zh: '顾慎为看着他。', texto_pt: 'Ele o observou.' }, {
      ordem: 3, texto_revisado: 'Continuou observando-o.', justificativa: '', categorias: ['naturalidade'], confianca: 'alta',
    }, [termo({ termo_zh: '顾慎为', termo_pt: 'Gu Shenwei', categoria: 'pessoa' })]);
    expect(travas.some((t) => t.codigo === 'gama')).toBe(false);
  });

  it('bloqueia dicendi dependente separado da fala por novo parágrafo', () => {
    const contexto = { ...alvo, inicio_paragrafo: true, apos_fala_em_outro_paragrafo: true, texto_pt: 'disse o garoto.' };
    const minusculo = validarPropostaLiteraria(contexto, {
      ordem: 3, texto_revisado: 'disse o garoto.', justificativa: '', categorias: ['dialogo'], confianca: 'alta',
    }, []);
    expect(minusculo.map((t) => t.codigo)).toEqual(expect.arrayContaining(['inicio-minusculo']));
    const invertido = validarPropostaLiteraria(contexto, {
      ordem: 3, texto_revisado: 'Disse o garoto.', justificativa: '', categorias: ['dialogo'], confianca: 'alta',
    }, []);
    expect(invertido.map((t) => t.codigo)).toEqual(expect.arrayContaining(['dicendi-entre-paragrafos']));
    const autonomo = validarPropostaLiteraria(contexto, {
      ordem: 3, texto_revisado: 'O garoto disse aquilo.', justificativa: '', categorias: ['dialogo'], confianca: 'alta',
    }, []);
    expect(autonomo.some((t) => t.codigo === 'inicio-minusculo' || t.codigo === 'dicendi-entre-paragrafos')).toBe(false);
  });

  it('alerta elevação, complexidade e tique sem bloquear automaticamente', () => {
    const travas = validarPropostaLiteraria({ ...alvo, texto_pt: 'Ele olhou e começou a correr.' }, {
      ordem: 3,
      texto_revisado: 'Não obstante, contemplou o horizonte; então tornou a correr com grande determinação.',
      justificativa: '', categorias: ['ritmo'], confianca: 'media',
    }, []);
    expect(travas.map((t) => t.codigo)).toEqual(expect.arrayContaining(['registro-elevado', 'complexidade', 'tique-repeticao']));
    expect(propostaPodeIrAoStaging(travas)).toBe(true);
  });

  it('bloqueia passado composto novo no passe seletivo', () => {
    const seletivo = { ...alvo, texto_pt: 'Ele ouvira a voz, mas nunca vira o homem.', diagnostico: { fenomenos: ['regra-deterministica'], razoes: ['mais-que-perfeito: ouvira'] } };
    const travas = validarPropostaLiteraria(seletivo, {
      ordem: 3,
      texto_revisado: 'Ele tinha ouvido a voz, mas nunca tinha visto o homem.',
      justificativa: 'troca de tempo verbal', categorias: ['naturalidade'], confianca: 'media',
    }, []);
    expect(travas.map((t) => t.codigo)).toContain('passado-composto-introduzido');
    expect(propostaPodeIrAoStaging(travas)).toBe(false);
  });

  it('bloqueia capitalização oportunista de posto fora do diagnóstico', () => {
    const seletivo = { ...alvo, texto_pt: 'Ele queria ser assassino.', diagnostico: { fenomenos: ['literalidade'], razoes: ['expressão literal'] } };
    const travas = validarPropostaLiteraria(seletivo, {
      ordem: 3, texto_revisado: 'Ele queria ser Assassino.', justificativa: '', categorias: ['gama'], confianca: 'media',
    }, []);
    expect(travas.map((t) => t.codigo)).toContain('capitalizacao-nao-diagnosticada');
    expect(propostaPodeIrAoStaging(travas)).toBe(false);
  });

  it('bloqueia rearranjo que mantém a locução diagnosticada', () => {
    const seletivo = { ...alvo, texto_pt: 'Ele tinha decidido havia muito tempo.', diagnostico: { fenomenos: ['ritmo'], razoes: ['tinha decidido'] } };
    const travas = validarPropostaLiteraria(seletivo, {
      ordem: 3, texto_revisado: 'Havia muito tempo que ele tinha decidido.', justificativa: '', categorias: ['ritmo'], confianca: 'media',
    }, []);
    expect(travas.map((t) => t.codigo)).toContain('diagnostico-nao-resolvido');
    expect(propostaPodeIrAoStaging(travas)).toBe(false);
  });

  it('bloqueia elevação lexical nova no passe seletivo', () => {
    const seletivo = { ...alvo, texto_pt: 'Eu me ajoelho diante dele.', diagnostico: { fenomenos: ['literalidade'], razoes: ['kowtow'] } };
    const travas = validarPropostaLiteraria(seletivo, {
      ordem: 3, texto_revisado: 'Eu me prostro diante dele.', justificativa: '', categorias: ['lexico'], confianca: 'media',
    }, []);
    expect(travas.map((t) => t.codigo)).toContain('registro-elevado');
    expect(propostaPodeIrAoStaging(travas)).toBe(false);
  });
});

describe('eval literária congelada', () => {
  it('mede cobertura, omissão, falso positivo e distância da referência', () => {
    const resultado = avaliarExecucaoLiteraria([
      { ordem: 1, vigente: 'A.', referencia: 'B.' },
      { ordem: 2, vigente: 'C.', referencia: 'D.' },
      { ordem: 3, vigente: 'E.', referencia: 'E.' },
    ], new Map([[1, 'B.'], [2, null], [3, 'F.']]), new Set([3]));
    expect(resultado).toMatchObject({
      total: 3,
      referenciasPositivas: 2,
      controlesNegativos: 1,
      propostas: 2,
      bloqueadas: 1,
      coberturaReferencia: 0.5,
      precisaoPropostas: 0.5,
      correspondenciaExataReferencia: 1,
      taxaCorrespondenciaExata: 0.5,
      regressoesReferencia: 0,
      falsosPositivos: 1,
      taxaFalsoPositivo: 1,
      omissoes: 1,
    });
    expect(resultado.distanciaMediaReferencia).toBe(0.25);
    expect(resultado.ganhoMedioReferencia).toBe(0.5);
  });

  it('não deixa uma candidata numérica vazar entre capítulos', () => {
    const resultado = avaliarExecucaoLiteraria([
      { capitulo: 7, ordem: 12, vigente: 'A.', referencia: 'B.' },
      { capitulo: 12, ordem: 12, vigente: 'C.', referencia: 'D.' },
    ], new Map<number | string, string | null>([[12, 'B.'], ['7.12', 'B.']]), new Set<number | string>(['7.12', '12.12', '18.12']));
    expect(resultado).toMatchObject({ coberturaReferencia: 0.5, omissoes: 1, bloqueadas: 2 });
  });

  it('expõe regressão quando a candidata se afasta da referência', () => {
    const resultado = avaliarExecucaoLiteraria([
      { ordem: 1, vigente: 'O garoto correu.', referencia: 'O garoto fugiu.' },
    ], new Map([[1, 'Uma sentença totalmente diferente e muito mais longa.']]));
    expect(resultado.regressoesReferencia).toBe(1);
    expect(resultado.ganhoMedioReferencia).toBeLessThan(0);
  });
});
