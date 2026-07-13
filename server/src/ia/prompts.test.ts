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

describe('termos adotados no capítulo', () => {
  it('entram na mensagem do usuário, antes das frases, e não mudam o sistema', () => {
    const req: RequisicaoTraducaoBloco = {
      modelo: 'm',
      promptMae: 'Regras.',
      glossario: [],
      glossarioNoUsuario: true,
      termosAdotados: [{ termo_zh: '归墟', termo_pt: 'Abismo do Retorno' }],
      caudaAnterior: [],
      frases: [{ ordem: 5, texto_zh: '归墟在等待。' }],
      proximas: [],
    };
    const usuario = usuarioTraducao(req);
    expect(usuario).toContain('Termos já adotados neste capítulo');
    expect(usuario).toContain('归墟 → Abismo do Retorno');
    expect(usuario.indexOf('归墟 → Abismo do Retorno')).toBeLessThan(usuario.indexOf('### Frases a traduzir:'));
    const { termosAdotados: _ignorado, ...semTermos } = req;
    expect(sistemaTraducao(req)).toBe(sistemaTraducao(semTermos));
  });
});

describe('modo detalhes (título/sinopse de obra)', () => {
  const req: RequisicaoTraducaoBloco = {
    modelo: 'm',
    promptMae: 'Regras da obra.',
    modo: 'detalhes',
    glossario: [],
    caudaAnterior: [],
    frases: [
      { ordem: 0, texto_zh: '十日终焉', rotulo: 'título da obra' },
      { ordem: 1, texto_zh: '他醒来了。世界变了。', rotulo: 'sinopse da obra' },
    ],
    proximas: [],
  };

  it('instruções mandam traduzir o item inteiro, não frase a frase', () => {
    const sistema = sistemaTraducao(req);
    expect(sistema).toContain('POR COMPLETO');
    expect(sistema).toContain('Não resuma, não corte e não omita nada.');
    expect(sistema).not.toContain('Traduza cada frase numerada');
  });

  it('rótulo fica fora do texto-fonte, em linha própria', () => {
    const usuario = usuarioTraducao(req);
    expect(usuario).toContain('### Itens a traduzir:');
    expect(usuario).toContain('[0] (título da obra)\n十日终焉');
    expect(usuario).toContain('[1] (sinopse da obra)\n他醒来了。世界变了。');
  });
});
