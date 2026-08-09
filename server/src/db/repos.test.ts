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
