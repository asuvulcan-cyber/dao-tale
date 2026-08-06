import { describe, expect, it } from 'vitest';
import type { EntradaGlossario } from '@dao-tale/shared';
import {
  filtrarGlossarioRelevante,
  incluirPrincipais,
  sistemaContracapa,
  sistemaContracapaPartes,
  sistemaExtrairTermos,
  sistemaRevisao,
  sistemaTraducao,
  sistemaTraducaoPartes,
  usuarioContracapa,
  usuarioExtrairTermos,
  usuarioRevisao,
  usuarioTraducao,
} from './prompts.js';
import { PROMPT_CONTRACAPA } from './promptContracapa.js';
import type {
  RequisicaoContracapa,
  RequisicaoExtrairTermos,
  RequisicaoRevisao,
  RequisicaoTraducaoBloco,
} from './provedor.js';

const entrada = (termo_zh: string, termo_pt: string): EntradaGlossario => ({
  id: 0,
  obra_id: 1,
  termo_zh,
  termo_pt,
  categoria: 'personagem',
  nota: null,
  origem: 'manual',
  principal_id: null,
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
    omega: 'Regras da obra.',
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

describe('sistema em duas partes (doc 08 §3)', () => {
  it('a base é o prompt mãe composto e as partes juntas reproduzem o sistema inteiro', () => {
    const req: RequisicaoTraducaoBloco = {
      modelo: 'm',
      omega: 'Núcleo + delta compostos.',
      glossario: [],
      glossarioNoUsuario: true,
      caudaAnterior: [],
      frases: [{ ordem: 0, texto_zh: '甲。' }],
      proximas: [],
    };
    const partes = sistemaTraducaoPartes(req);
    expect(partes.base).toBe('Núcleo + delta compostos.');
    expect(`${partes.base}\n\n${partes.operacional}`).toBe(sistemaTraducao(req));
  });
});

describe('revisão com glossário no usuário (A4 da auditoria)', () => {
  const base: RequisicaoRevisao = {
    modelo: 'm',
    omega: 'Regras.',
    glossario: [entrada('齐夏', 'Qi Xia')],
    vizinhasAntes: [],
    vizinhasDepois: [],
    frase: { texto_zh: '齐夏睁开了眼睛。', texto_pt: 'Qi Xia abriu os olhos.', texto_pt_original_ia: null },
    pergunta: 'Está correto?',
  };

  it('sem a flag, o glossário fica no sistema (comportamento legado)', () => {
    expect(sistemaRevisao(base)).toContain('齐夏 → Qi Xia');
    expect(usuarioRevisao(base)).not.toContain('齐夏 → Qi Xia');
  });

  it('com a flag, o glossário migra para o usuário e o sistema fica idêntico entre frases', () => {
    const req = { ...base, glossarioNoUsuario: true };
    const sistema = sistemaRevisao(req);
    expect(sistema).not.toContain('齐夏 → Qi Xia');
    expect(usuarioRevisao(req)).toContain('齐夏 → Qi Xia');
    expect(sistemaRevisao({ ...req, glossario: [] })).toBe(sistema);
  });
});

describe('extração de termos com glossário no usuário (M2 da auditoria)', () => {
  const base: RequisicaoExtrairTermos = {
    modelo: 'm',
    omega: 'Regras.',
    glossario: [entrada('齐夏', 'Qi Xia')],
    frase: { texto_zh: '齐夏进入了归墟。', texto_pt: 'Qi Xia entrou no Abismo.' },
  };

  it('com a flag, os termos já catalogados vão na mensagem do usuário e o sistema fica estável', () => {
    const req = { ...base, glossarioNoUsuario: true };
    const sistema = sistemaExtrairTermos(req);
    expect(sistema).not.toContain('齐夏 → Qi Xia');
    const usuario = usuarioExtrairTermos(req);
    expect(usuario).toContain('NÃO repetir');
    expect(usuario).toContain('齐夏 → Qi Xia');
    expect(usuario.indexOf('齐夏 → Qi Xia')).toBeLessThan(usuario.indexOf('ZH: '));
    expect(sistemaExtrairTermos({ ...req, glossario: [] })).toBe(sistema);
  });

  it('sem a flag, mantém o comportamento legado (glossário inteiro no sistema)', () => {
    expect(sistemaExtrairTermos(base)).toContain('齐夏 → Qi Xia');
    expect(usuarioExtrairTermos(base)).toBe('ZH: 齐夏进入了归墟。\nPT: Qi Xia entrou no Abismo.');
  });
});

describe('termos adotados no capítulo', () => {
  it('entram na mensagem do usuário, antes das frases, e não mudam o sistema', () => {
    const req: RequisicaoTraducaoBloco = {
      modelo: 'm',
      omega: 'Regras.',
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

describe('variantes de termo no glossário', () => {
  const canonica: EntradaGlossario = { ...entrada('林芊', 'Lin Qian'), id: 1 };
  const variante: EntradaGlossario = { ...entrada('芊芊', 'Qianqian'), id: 2, principal_id: 1 };

  it('a formatação anota a variante apontando para a canônica', () => {
    const sistema = sistemaTraducao({ omega: 'Regras.', glossario: [canonica, variante] });
    expect(sistema).toContain('芊芊 → Qianqian');
    expect(sistema).toContain('variante de Lin Qian (林芊)');
  });

  it('incluirPrincipais traz a canônica quando só a variante entrou no trecho', () => {
    const sel = incluirPrincipais([variante], [canonica, variante]);
    expect(sel.map((e) => e.id).sort()).toEqual([1, 2]);
  });

  it('incluirPrincipais não duplica se a canônica já estava', () => {
    expect(incluirPrincipais([canonica, variante], [canonica, variante])).toHaveLength(2);
  });
});

describe('contracapa (título/sinopse de obra)', () => {
  const versos = '一座青铜塔，半张无名图。\n登尽千层阶，望断百重云。\n\n很少见的一部传统武侠小说。';
  const req: RequisicaoContracapa = {
    modelo: 'm',
    tituloZh: '死人经',
    sinopseZh: versos,
    glossario: [entrada('齐夏', 'Qi Xia')],
  };

  it('a base é o prompt de contracapa, não o prompt mãe de capítulo', () => {
    const partes = sistemaContracapaPartes(req);
    expect(partes.base).toBe(PROMPT_CONTRACAPA.trim());
    expect(`${partes.base}\n\n${partes.operacional}`).toBe(sistemaContracapa(req));
    // O prompt mãe nem é aceito na requisição: nada da obra entra aqui além do glossário.
    expect(partes.base).not.toContain('Regras da obra');
  });

  it('autoriza localizar chengyu/termo cultural e proíbe nota, alternativa e resumo', () => {
    const sistema = sistemaContracapa(req);
    expect(sistema).toContain('成语');
    expect(sistema).toContain('AUTORIZADO');
    expect(sistema).toContain('FIEL, MAS NATURAL');
    expect(sistema).toMatch(/nota do tradutor/i);
    expect(sistema).toMatch(/alternativas/i);
    expect(sistema).toContain('sem resumir, cortar ou omitir nada');
    // Nada de item numerado: a instrução de capítulo não pode vazar para cá.
    expect(sistema).not.toContain('Traduza cada frase numerada');
  });

  it('a sinopse vai inteira, com as quebras de verso e de parágrafo preservadas', () => {
    const usuario = usuarioContracapa(req);
    expect(usuario).toContain('### Título da obra (chinês):\n死人经');
    expect(usuario).toContain(`### Sinopse da obra (chinês, completa):\n${versos}`);
    expect(usuario).not.toMatch(/\[\d\]/);
    expect(usuario).not.toContain('parágrafo 1 de');
  });

  it('só o campo enviado aparece — sem sinopse, o texto não a menciona', () => {
    const usuario = usuarioContracapa({ ...req, sinopseZh: undefined });
    expect(usuario).toContain('死人经');
    expect(usuario).not.toContain('Sinopse da obra');
  });

  it('glossário filtrado vai na mensagem do usuário e o sistema fica estável', () => {
    const comFlag = { ...req, glossarioNoUsuario: true };
    const sistema = sistemaContracapa(comFlag);
    expect(sistema).not.toContain('齐夏 → Qi Xia');
    expect(usuarioContracapa(comFlag)).toContain('齐夏 → Qi Xia');
    expect(sistemaContracapa({ ...comFlag, glossario: [] })).toBe(sistema);
    // Sem a flag, o glossário inteiro fica no sistema (comportamento legado).
    expect(sistemaContracapa(req)).toContain('齐夏 → Qi Xia');
  });
});
