import { describe, expect, it } from 'vitest';
import type { EntradaGlossario } from '@dao-tale/shared';
import { filtrarGlossarioRelevante, sistemaTraducao, usuarioTraducao } from './prompts.js';
import type { RequisicaoTraducaoBloco } from './provedor.js';

const entrada = (termo_zh: string, termo_pt: string): EntradaGlossario => ({
  id: 0,
  obra_id: 1,
  termo_zh,
  termo_pt,
  categoria: 'personagem',
  nota: null,
  origem: 'manual',
  criado_em: '',
});

describe('filtrarGlossarioRelevante', () => {
  it('mantém só os termos presentes em algum dos textos', () => {
    const glossario = [entrada('齐夏', 'Qi Xia'), entrada('终焉', 'Fim'), entrada('不存在', 'Ausente')];
    const filtrado = filtrarGlossarioRelevante(glossario, ['齐夏睁开了眼睛', undefined, '十日终焉']);
    expect(filtrado.map((e) => e.termo_pt)).toEqual(['Qi Xia', 'Fim']);
  });

  it('glossário vazio e textos vazios não quebram', () => {
    expect(filtrarGlossarioRelevante([], ['abc'])).toEqual([]);
    expect(filtrarGlossarioRelevante([entrada('齐夏', 'Qi Xia')], [])).toEqual([]);
  });
});

describe('glossário no usuário (modo relevante)', () => {
  const base: RequisicaoTraducaoBloco = {
    modelo: 'm',
    promptMae: 'Regras da obra.',
    glossario: [entrada('齐夏', 'Qi Xia')],
    caudaAnterior: [],
    frases: [{ ordem: 0, texto_zh: '齐夏睁开了眼睛。' }],
    proximas: [],
  };

  it('sem a flag, o glossário fica no sistema (cacheável por capítulo)', () => {
    expect(sistemaTraducao(base)).toContain('齐夏 → Qi Xia');
    expect(usuarioTraducao(base)).not.toContain('Qi Xia');
  });

  it('com a flag, o glossário migra para a mensagem do usuário e o sistema fica estável', () => {
    const req = { ...base, glossarioNoUsuario: true };
    const sistema = sistemaTraducao(req);
    expect(sistema).not.toContain('Qi Xia');
    expect(usuarioTraducao(req)).toContain('齐夏 → Qi Xia');
    // Sistema idêntico independentemente do glossário filtrado do bloco.
    expect(sistemaTraducao({ ...req, glossario: [] })).toBe(sistema);
  });
});
