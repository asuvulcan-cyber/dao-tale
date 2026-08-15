import { describe, expect, it } from 'vitest';
import { CHANGELOG, marcarPublicadas, type EntradaChangelog } from './changelog';

const entrada = (em: string, titulo = 't'): EntradaChangelog => ({ em, titulo, itens: ['x'] });

describe('CHANGELOG', () => {
  it('sai em ordem decrescente de data — a entrega nova vem primeiro', () => {
    const datas = CHANGELOG.map((e) => e.em);
    expect([...datas].sort().reverse()).toEqual(datas);
  });

  it('toda entrada tem data ISO curta, título e pelo menos um item', () => {
    for (const e of CHANGELOG) {
      expect(e.em, `${e.titulo}: data fora do formato`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.titulo.trim(), 'entrada sem título').not.toBe('');
      expect(e.itens.length, `${e.titulo}: sem itens`).toBeGreaterThan(0);
      for (const i of e.itens) expect(i.trim(), `${e.titulo}: item vazio`).not.toBe('');
    }
  });

  it('nenhuma entrada é datada no futuro em relação à mais recente', () => {
    // Guarda contra erro de digitação de ano (2027 em vez de 2026), que jogaria
    // a entrada para o topo e a marcaria como não publicada para sempre.
    const [maisNova] = CHANGELOG;
    expect(maisNova.em <= new Date().toISOString().slice(0, 10)).toBe(true);
  });
});

describe('marcarPublicadas', () => {
  it('entrega anterior ao deploy está publicada; posterior, não', () => {
    const r = marcarPublicadas([entrada('2026-08-20'), entrada('2026-08-01')], {
      commit: 'abc1234',
      publicado_em: '2026-08-15T17:20:04.000Z',
    });
    expect(r.map((x) => x.publicada)).toEqual([false, true]);
  });

  it('entrega do MESMO dia do deploy conta como publicada', () => {
    // A comparação é por dia: um deploy às 17h de uma entrega da manhã é o caso
    // comum, e marcá-la como pendente mandaria o revisor procurar por que a
    // função "não subiu".
    const r = marcarPublicadas([entrada('2026-08-15')], {
      commit: 'abc1234',
      publicado_em: '2026-08-15T00:01:00.000Z',
    });
    expect(r[0].publicada).toBe(true);
  });

  it('sem carimbo, não afirma nada — `null`, não `false`', () => {
    // Em desenvolvimento não existe VERSAO.json. Chutar `true` mostraria como no
    // ar o que só existe no laptop; chutar `false` diria que nada está no ar.
    // As duas mentiras são piores que admitir que não se sabe.
    const r = marcarPublicadas([entrada('2026-08-01'), entrada('2026-08-20')], {
      commit: null,
      publicado_em: null,
    });
    expect(r.map((x) => x.publicada)).toEqual([null, null]);
  });

  it('preserva a ordem e o conteúdo das entradas', () => {
    const entradas = [entrada('2026-08-20', 'nova'), entrada('2026-08-01', 'velha')];
    const r = marcarPublicadas(entradas, { commit: null, publicado_em: null });
    expect(r.map((x) => x.entrada.titulo)).toEqual(['nova', 'velha']);
  });
});
