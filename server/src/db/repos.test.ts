import { describe, expect, it } from 'vitest';
import { abrirBanco } from './index.js';
import { reposCapitulos, reposFrases, reposObras } from './repos.js';

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
