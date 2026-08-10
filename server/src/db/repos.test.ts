import { describe, expect, it } from 'vitest';
import { PREFERENCIAS_PADRAO } from '@dao-tale/shared';
import { abrirBanco } from './index.js';
import { reposCapitulos, reposFrases, reposObras } from './repos.js';
import { classificarEdicoes } from '../traducao/edicoesManuais.js';

describe('reposFrases.reabrirParaTraducao', () => {
  it('frases com erro voltam à fila em qualquer retomada (regressão)', () => {
    const db = abrirBanco(':memory:');
    const obra = reposObras.criar(db, { titulo: 'Obra' });
    const cap = reposCapitulos.criar(db, obra.id, { numero: 1, texto_origem: '甲。乙。丙。' }, [
      { texto_zh: '甲。', paragrafo: 0 },
      { texto_zh: '乙。', paragrafo: 0 },
      { texto_zh: '丙。', paragrafo: 0 },
    ]);
    const frases = reposFrases.listarPorCapitulo(db, cap.id);
    reposFrases.aplicarTraducaoIa(db, frases[0].id, 'A.');
    reposFrases.marcarErro(db, [frases[1].id]);

    // Retomada padrão (sem sobrescrever): erro → pendente; traduzida fica intacta.
    reposFrases.reabrirParaTraducao(db, cap.id, { sobrescrever: false, sobrescreverEditadas: false });
    const depois = reposFrases.listarPorCapitulo(db, cap.id);
    expect(depois.map((f) => f.status_traducao)).toEqual(['traduzida', 'pendente', 'pendente']);
    expect(depois[0].texto_pt).toBe('A.');
  });

  it('sobrescreverEditadas marca origem_edicao = retraducao na frase digitada à mão, sem apagar editado_manualmente (achado da revisão final)', () => {
    const db = abrirBanco(':memory:');
    const obra = reposObras.criar(db, { titulo: 'Obra' });
    const cap = reposCapitulos.criar(db, obra.id, { numero: 1, texto_origem: '甲。' }, [
      { texto_zh: '甲。', paragrafo: 0 },
    ]);
    const [frase] = reposFrases.listarPorCapitulo(db, cap.id);

    reposFrases.aplicarTraducaoIa(db, frase.id, 'Ele já morreu.');
    reposFrases.editarTexto(db, frase.id, 'Ele já está morto.'); // digitada à mão: origem_edicao NULL

    reposFrases.reabrirParaTraducao(db, cap.id, { sobrescrever: true, sobrescreverEditadas: true });

    const reaberta = reposFrases.obter(db, frase.id)!;
    expect(reaberta.status_traducao).toBe('pendente');
    // editado_manualmente sobrevive intocado — a métrica de edição do checkpoint
    // (doc 09 §4) lê esse fato histórico; só a origem muda, para excluir a frase
    // da mineração assim que a retradução sobrescrever o texto.
    expect(reaberta.editado_manualmente).toBe(true);
    expect(reaberta.origem_edicao).toBe('retraducao');

    // A retradução conclui: aplicarTraducaoIa preserva texto_pt_original_ia (1ª
    // passada) por COALESCE — sem o conserto, o par lido pela mineração seria
    // IA-1ª-passada -> IA-2ª-passada, sinonímia arbitrária da própria IA.
    reposFrases.aplicarTraducaoIa(db, frase.id, 'Ele já se foi.');

    const paraMineracao = reposFrases.paraMineracao(db, obra.id);
    const classificadas = classificarEdicoes(paraMineracao, [], PREFERENCIAS_PADRAO);
    expect(classificadas).toEqual([]);
  });

  it('sobrescreverEditadas NÃO troca a origem de uma frase já aprovada por botão (revisão/QA/substituição)', () => {
    const db = abrirBanco(':memory:');
    const obra = reposObras.criar(db, { titulo: 'Obra' });
    const cap = reposCapitulos.criar(db, obra.id, { numero: 1, texto_origem: '甲。' }, [
      { texto_zh: '甲。', paragrafo: 0 },
    ]);
    const [frase] = reposFrases.listarPorCapitulo(db, cap.id);
    reposFrases.aplicarTraducaoIa(db, frase.id, 'Ele já morreu.');
    reposFrases.editarTexto(db, frase.id, 'Ele já está morto.', 'revisao'); // aprovada por botão

    reposFrases.reabrirParaTraducao(db, cap.id, { sobrescrever: true, sobrescreverEditadas: true });

    // Já era excluída da mineração por outro motivo (origem não-nula); o conserto
    // não precisa — e não deve — reescrever essa proveniência mais informativa.
    expect(reposFrases.obter(db, frase.id)!.origem_edicao).toBe('revisao');
  });
});

describe('reposFrases.substituirTermo (A3 — fronteira de palavra)', () => {
  it('troca a palavra isolada e não corrompe a mesma sequência dentro de outra palavra', () => {
    const db = abrirBanco(':memory:');
    const obra = reposObras.criar(db, { titulo: 'Obra' });
    const cap = reposCapitulos.criar(db, obra.id, { numero: 1, texto_origem: '甲。乙。丙。' }, [
      { texto_zh: '甲。', paragrafo: 0 },
      { texto_zh: '乙。', paragrafo: 0 },
      { texto_zh: '丙。', paragrafo: 0 },
    ]);
    const frases = reposFrases.listarPorCapitulo(db, cap.id);
    reposFrases.aplicarTraducaoIa(db, frases[0].id, 'Rio corre.');
    reposFrases.aplicarTraducaoIa(db, frases[1].id, 'Riordan chegou.'); // "Rio" DENTRO de palavra
    reposFrases.aplicarTraducaoIa(db, frases[2].id, 'Rio de Janeiro.');

    // Prévia conta as frases realmente afetadas por palavra (não a de "Riordan").
    const previa = reposFrases.substituirTermo(db, { obraId: obra.id, de: 'Rio', para: 'Rios', previa: true });
    expect(previa.frases).toBe(2);

    // Aplicação bate com a prévia e preserva "Riordan".
    const aplicado = reposFrases.substituirTermo(db, { obraId: obra.id, de: 'Rio', para: 'Rios' });
    expect(aplicado.frases).toBe(2);
    const depois = reposFrases.listarPorCapitulo(db, cap.id);
    expect(depois.map((f) => f.texto_pt)).toEqual(['Rios corre.', 'Riordan chegou.', 'Rios de Janeiro.']);
    // As trocadas ficam marcadas como edição manual; a intacta, não.
    expect(depois.map((f) => f.editado_manualmente)).toEqual([true, false, true]);
  });
});

describe('reposFrases.reverterParaIa zera origem_edicao junto (achado da revisão final)', () => {
  it('reverter uma frase aprovada por botão limpa editado_manualmente E origem_edicao', () => {
    const db = abrirBanco(':memory:');
    const obra = reposObras.criar(db, { titulo: 'Obra' });
    const cap = reposCapitulos.criar(db, obra.id, { numero: 1, texto_origem: '甲。' }, [
      { texto_zh: '甲。', paragrafo: 0 },
    ]);
    const [frase] = reposFrases.listarPorCapitulo(db, cap.id);
    reposFrases.aplicarTraducaoIa(db, frase.id, 'Texto da IA.');
    reposFrases.editarTexto(db, frase.id, 'Texto aprovado num botão.', 'revisao');
    expect(reposFrases.obter(db, frase.id)!.origem_edicao).toBe('revisao');

    const revertida = reposFrases.reverterParaIa(db, frase.id)!;
    expect(revertida.texto_pt).toBe('Texto da IA.');
    expect(revertida.editado_manualmente).toBe(false);
    // Sem isto, a frase ficava sem edição nenhuma mas ainda carregando a origem
    // antiga — um estado que não corresponde a nada real, e que (se um botão
    // futuro reaplicasse editado_manualmente sem passar origem) poderia deixar
    // a origem velha grudada numa edição nova e diferente.
    expect(revertida.origem_edicao).toBeNull();
  });
});

describe('reposFrases.substituirTermo grava origem_edicao (achado da revisão da Task 2, consertado na Task 6)', () => {
  it('frases trocadas em lote não entram em classificarEdicoes — só a edição digitada entra', () => {
    const db = abrirBanco(':memory:');
    const obra = reposObras.criar(db, { titulo: 'Obra' });
    const cap = reposCapitulos.criar(db, obra.id, { numero: 1, texto_origem: '甲。乙。丙。' }, [
      { texto_zh: '甲。', paragrafo: 0 },
      { texto_zh: '乙。', paragrafo: 0 },
      { texto_zh: '丙。', paragrafo: 0 },
    ]);
    const frases = reposFrases.listarPorCapitulo(db, cap.id);
    reposFrases.aplicarTraducaoIa(db, frases[0].id, 'Rio corre.');
    reposFrases.aplicarTraducaoIa(db, frases[1].id, 'Rio seca.');
    reposFrases.aplicarTraducaoIa(db, frases[2].id, 'Ele já é um morto.');

    // Substituição em lote: dezenas de frases mudam pela MESMA regra — não é o
    // revisor digitando dezenas de correções independentes, e não pode parecer uma.
    reposFrases.substituirTermo(db, { obraId: obra.id, de: 'Rio', para: 'Rios' });
    // Edição de verdade, digitada à mão: continua sem origem, e É o sinal que
    // classificarEdicoes deve ler.
    reposFrases.editarTexto(db, frases[2].id, 'Ele já é um cadáver.');

    const depois = reposFrases.listarPorCapitulo(db, cap.id);
    expect(depois[0].origem_edicao).toBe('substituicao');
    expect(depois[1].origem_edicao).toBe('substituicao');
    expect(depois[2].origem_edicao).toBeNull();

    const classificadas = classificarEdicoes(
      depois.map((f) => ({
        id: f.id,
        ordem: f.ordem,
        capitulo_numero: cap.numero,
        texto_zh: f.texto_zh,
        texto_pt_original_ia: f.texto_pt_original_ia,
        texto_pt: f.texto_pt,
        editado_manualmente: f.editado_manualmente,
        origem_edicao: f.origem_edicao,
      })),
      [],
      PREFERENCIAS_PADRAO,
    );

    // Só a edição digitada (terceira frase) entra; as duas trocadas em lote, não —
    // mesmo tendo editado_manualmente = 1 e texto_pt diferente do da IA.
    expect(classificadas).toHaveLength(1);
    expect(classificadas[0].frase_id).toBe(frases[2].id);
  });
});

describe('reposFrases.substituirTermoGlossario grava origem_edicao (rodada de correção 1 — a irmã de substituirTermo não tinha teste)', () => {
  it('frases trocadas em lote pelo glossário não entram em classificarEdicoes — só a edição digitada entra', () => {
    const db = abrirBanco(':memory:');
    const obra = reposObras.criar(db, { titulo: 'Obra' });
    const cap = reposCapitulos.criar(db, obra.id, { numero: 1, texto_origem: '金鹏堡。金鹏堡。丙。' }, [
      { texto_zh: '金鹏堡。', paragrafo: 0 },
      { texto_zh: '金鹏堡。', paragrafo: 0 },
      { texto_zh: '丙。', paragrafo: 0 },
    ]);
    const frases = reposFrases.listarPorCapitulo(db, cap.id);
    reposFrases.aplicarTraducaoIa(db, frases[0].id, 'A Fortaleza Jinpeng caiu.');
    reposFrases.aplicarTraducaoIa(db, frases[1].id, 'A Fortaleza Jinpeng resistiu.');
    reposFrases.aplicarTraducaoIa(db, frases[2].id, 'Ele já é um morto.');

    // Substituição em lote pelo termo do glossário: mesma regra, dezenas de frases.
    reposFrases.substituirTermoGlossario(db, {
      obraId: obra.id,
      termoZh: '金鹏堡',
      de: 'Fortaleza Jinpeng',
      para: 'Fortaleza do Peng Dourado',
      previa: false,
    });
    // Edição de verdade, digitada à mão.
    reposFrases.editarTexto(db, frases[2].id, 'Ele já é um cadáver.');

    const depois = reposFrases.listarPorCapitulo(db, cap.id);
    expect(depois[0].origem_edicao).toBe('substituicao');
    expect(depois[1].origem_edicao).toBe('substituicao');
    expect(depois[2].origem_edicao).toBeNull();

    const classificadas = classificarEdicoes(
      depois.map((f) => ({
        id: f.id,
        ordem: f.ordem,
        capitulo_numero: cap.numero,
        texto_zh: f.texto_zh,
        texto_pt_original_ia: f.texto_pt_original_ia,
        texto_pt: f.texto_pt,
        editado_manualmente: f.editado_manualmente,
        origem_edicao: f.origem_edicao,
      })),
      [],
      PREFERENCIAS_PADRAO,
    );

    expect(classificadas).toHaveLength(1);
    expect(classificadas[0].frase_id).toBe(frases[2].id);
  });
});
