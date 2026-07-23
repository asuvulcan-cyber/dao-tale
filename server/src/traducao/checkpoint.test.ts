import { describe, expect, it } from 'vitest';
import { CONFIG_PADRAO, type StatusCapitulo } from '@dao-tale/shared';
import { montarCheckpoint, type CapituloCheckpoint } from './checkpoint.js';

const cfg = {
  checkpoint_janela: CONFIG_PADRAO.checkpoint_janela, // 3
  checkpoint_termos_max: CONFIG_PADRAO.checkpoint_termos_max, // 2
  checkpoint_edicao_max: CONFIG_PADRAO.checkpoint_edicao_max, // 10
  checkpoint_violacoes_max: CONFIG_PADRAO.checkpoint_violacoes_max, // 0
};

const cap = (
  numero: number,
  status: StatusCapitulo,
  extra: Partial<CapituloCheckpoint> = {},
): CapituloCheckpoint => ({
  id: numero,
  numero,
  status,
  frases_total: 100,
  frases_editadas: 0,
  termos_sugeridos: 0,
  violacoes: 0,
  ...extra,
});

const metrica = (r: ReturnType<typeof montarCheckpoint>, chave: string) =>
  r.metricas.find((m) => m.chave === chave)!;

describe('montarCheckpoint', () => {
  it('amostra insuficiente enquanto a janela não enche', () => {
    const r = montarCheckpoint(1, 'calibracao', [cap(1, 'traduzido'), cap(2, 'traduzido')], cfg);
    expect(metrica(r, 'termos').estado).toBe('amostra-insuficiente');
    expect(r.aprovado).toBe(false);
  });

  it('aprova quando termos e edição estão dentro dos limites', () => {
    const caps = [
      cap(1, 'revisado', { termos_sugeridos: 1, frases_editadas: 5 }),
      cap(2, 'revisado', { termos_sugeridos: 1, frases_editadas: 4 }),
      cap(3, 'revisado', { termos_sugeridos: 1, frases_editadas: 6 }),
    ];
    const r = montarCheckpoint(1, 'calibracao', caps, cfg);
    // 3 termos / 300 frases * 100 = 1,0 ≤ 2 ; 15 editadas / 300 * 100 = 5% ≤ 10
    expect(metrica(r, 'termos').estado).toBe('ok');
    expect(metrica(r, 'edicao').estado).toBe('ok');
    expect(r.aprovado).toBe(true);
  });

  it('reprova quando a taxa de termos novos passa do limite', () => {
    const caps = [
      cap(1, 'traduzido', { termos_sugeridos: 5 }),
      cap(2, 'traduzido', { termos_sugeridos: 4 }),
      cap(3, 'traduzido', { termos_sugeridos: 6 }),
    ];
    const r = montarCheckpoint(1, 'calibracao', caps, cfg);
    // 15 / 300 * 100 = 5,0 > 2
    expect(metrica(r, 'termos').estado).toBe('acima');
    expect(r.aprovado).toBe(false);
  });

  it('a métrica de edição só olha capítulos revisados/finalizados', () => {
    // 3 traduzidos (não revisados) com muita edição não deveriam nem ter amostra.
    const caps = [
      cap(1, 'traduzido', { frases_editadas: 90 }),
      cap(2, 'traduzido', { frases_editadas: 90 }),
      cap(3, 'traduzido', { frases_editadas: 90 }),
    ];
    const r = montarCheckpoint(1, 'calibracao', caps, cfg);
    expect(metrica(r, 'edicao').estado).toBe('amostra-insuficiente');
    // termos ok (0) mas edição sem amostra ⇒ não aprova.
    expect(r.aprovado).toBe(false);
  });

  it('usa os capítulos mais recentes (maior número) na janela', () => {
    const caps = [
      cap(1, 'traduzido', { termos_sugeridos: 20 }), // antigo e ruim, fora da janela
      cap(2, 'traduzido', { termos_sugeridos: 20 }),
      cap(10, 'traduzido', { termos_sugeridos: 1 }),
      cap(11, 'traduzido', { termos_sugeridos: 1 }),
      cap(12, 'traduzido', { termos_sugeridos: 1 }),
    ];
    const r = montarCheckpoint(1, 'calibracao', caps, cfg);
    expect(r.janela_capitulos).toEqual([12, 11, 10]);
    expect(metrica(r, 'termos').estado).toBe('ok');
  });

  it('violações são informativas por padrão (limiar 0 não bloqueia)', () => {
    const caps = [
      cap(1, 'traduzido', { violacoes: 5 }),
      cap(2, 'traduzido', { violacoes: 5 }),
      cap(3, 'traduzido', { violacoes: 5 }),
    ];
    const r = montarCheckpoint(1, 'calibracao', caps, cfg);
    const v = metrica(r, 'violacoes');
    expect(v.bloqueia).toBe(false);
    expect(v.valor).toBeCloseTo(5); // 15/300*100
    // termos e edição definem a aprovação; violações não bloqueiam.
    expect(r.aprovado).toBe(false); // edição sem amostra (não revisados)
  });

  it('com limiar de violações > 0, ela passa a bloquear', () => {
    const caps = [
      cap(1, 'revisado', { violacoes: 3 }),
      cap(2, 'revisado', { violacoes: 3 }),
      cap(3, 'revisado', { violacoes: 3 }),
    ];
    const r = montarCheckpoint(1, 'calibracao', caps, { ...cfg, checkpoint_violacoes_max: 1 });
    const v = metrica(r, 'violacoes');
    expect(v.bloqueia).toBe(true);
    expect(v.estado).toBe('acima'); // 3/100*100 = 3 > 1
    expect(r.aprovado).toBe(false);
  });
});
