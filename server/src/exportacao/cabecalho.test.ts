import { describe, expect, it } from 'vitest';
import { cabecalhoPt, tituloSeAnuncia } from '@dao-tale/shared';

const cap = (numero: number, titulo_pt: string | null, titulo: string | null = null) => ({ numero, titulo, titulo_pt });

// O chinês carrega a designação dentro do próprio título (第一章 = "capítulo
// um"), e traduzi-la é o certo. Só que o aplicativo prefixa a numeração dele por
// cima: na obra real saía "Capítulo 1 — Capítulo 1: Deixando a Propriedade".

describe('cabecalhoPt', () => {
  it('não duplica quando o título já se anuncia', () => {
    expect(cabecalhoPt(cap(1, 'Capítulo 1: Deixando a Propriedade'))).toBe('Capítulo 1: Deixando a Propriedade');
    expect(cabecalhoPt(cap(0, 'Prólogo: Os Dois Preceitos do Assassino'))).toBe(
      'Prólogo: Os Dois Preceitos do Assassino',
    );
  });

  it('prefixa normalmente quando o título é só o nome', () => {
    expect(cabecalhoPt(cap(118, 'A Torre de Bronze'))).toBe('Capítulo 118 — A Torre de Bronze');
  });

  it('sem título traduzido, usa o chinês; sem nenhum, só o número', () => {
    expect(cabecalhoPt(cap(3, null, '离庄'))).toBe('Capítulo 3 — 离庄');
    expect(cabecalhoPt(cap(3, null, null))).toBe('Capítulo 3');
  });

  it('não confunde título literário que começa com "Capítulo"', () => {
    // Sem número depois de "Capítulo", a numeração do app continua valendo.
    expect(cabecalhoPt(cap(7, 'Capítulo do Sangue'))).toBe('Capítulo 7 — Capítulo do Sangue');
  });
});

describe('tituloSeAnuncia', () => {
  it('aceita as formas que o modelo devolve de fato', () => {
    for (const t of ['Capítulo 1: X', 'capítulo 12 — X', 'Cap. 4 · X', 'Capítulo IV: X', 'Prólogo', 'Epílogo — X', 'Interlúdio'])
      expect(tituloSeAnuncia(t)).toBe(true);
  });

  it('recusa nome comum', () => {
    for (const t of ['A Torre de Bronze', 'Capítulo do Sangue', 'O Sabre e a Lança']) expect(tituloSeAnuncia(t)).toBe(false);
  });
});
