import { filtrarPorEscopo, type StatusCapitulo } from '@dao-tale/shared';
import { describe, expect, it } from 'vitest';
import { lerEscopo, nomeArquivo } from './escopo.js';
import { montarMarkdown } from './markdown.js';
import { remontarParagrafos } from '@dao-tale/shared';
import { textoCapitulo } from './texto.js';
import type { CapituloEpub, ObraEpub } from './epub.js';

// Escopo da exportação (doc 12 §5): tudo avaliado sobre a numeração real.

const capitulos: { numero: number; status: StatusCapitulo }[] = [
  { numero: 117, status: 'rascunho' },
  { numero: 118, status: 'finalizado' },
  { numero: 119, status: 'traduzido' },
  { numero: 120, status: 'parcial' },
  { numero: 121, status: 'revisado' },
];

const escopoOu = (consulta: Record<string, string | undefined>) => {
  const r = lerEscopo(consulta);
  if ('erro' in r) throw new Error(`escopo inválido: ${r.erro}`);
  return r;
};

describe('lerEscopo', () => {
  it('sem parâmetros, só capítulos prontos para leitura', () => {
    expect(escopoOu({}).status).toEqual(['traduzido', 'revisado', 'finalizado']);
  });

  it('aceita lista de status e recusa status inventado', () => {
    expect(escopoOu({ status: 'traduzido, parcial' }).status).toEqual(['traduzido', 'parcial']);
    expect(lerEscopo({ status: 'quase-pronto' })).toEqual({ erro: 'Status desconhecido: "quase-pronto".' });
  });

  it('lê intervalo e recusa intervalo invertido ou não numérico', () => {
    expect(escopoOu({ de: '118', ate: '120' })).toMatchObject({ de: 118, ate: 120 });
    expect(lerEscopo({ de: '120', ate: '118' })).toMatchObject({ erro: expect.stringContaining('invertido') });
    expect(lerEscopo({ de: 'cento e dezoito' })).toMatchObject({ erro: expect.stringContaining('"de"') });
  });

  it('lê lista explícita de números e recusa item inválido', () => {
    expect(escopoOu({ numeros: '118, 121' }).numeros).toEqual([118, 121]);
    expect(lerEscopo({ numeros: '118,x' })).toMatchObject({ erro: expect.stringContaining('inválido') });
  });
});

describe('filtrarPorEscopo', () => {
  it('padrão exclui rascunho, parcial e traduzindo', () => {
    expect(filtrarPorEscopo(capitulos, escopoOu({})).map((c) => c.numero)).toEqual([118, 119, 121]);
  });

  it('intervalo é inclusivo e respeita o status', () => {
    expect(filtrarPorEscopo(capitulos, escopoOu({ de: '119', ate: '121' })).map((c) => c.numero)).toEqual([119, 121]);
  });

  it('lista explícita vence o intervalo', () => {
    const escopo = escopoOu({ numeros: '121', de: '118', ate: '119' });
    expect(filtrarPorEscopo(capitulos, escopo).map((c) => c.numero)).toEqual([121]);
  });

  it('ordena pela numeração real, não pela ordem de entrada', () => {
    const bagunçado = [capitulos[4]!, capitulos[1]!, capitulos[2]!];
    expect(filtrarPorEscopo(bagunçado, escopoOu({})).map((c) => c.numero)).toEqual([118, 119, 121]);
  });

  it('status ampliado inclui os parciais', () => {
    const escopo = escopoOu({ status: 'parcial,rascunho' });
    expect(filtrarPorEscopo(capitulos, escopo).map((c) => c.numero)).toEqual([117, 120]);
  });
});

describe('nomeArquivo', () => {
  const obra = { titulo: 'A Torre de Bronze' } as ObraEpub;
  const cap = (numero: number) => ({ numero }) as CapituloEpub;

  it('usa slug do título e a faixa realmente incluída', () => {
    expect(nomeArquivo(obra, [cap(118), cap(119)], 'epub')).toBe('a-torre-de-bronze-118-119.epub');
    expect(nomeArquivo(obra, [cap(118)], 'md')).toBe('a-torre-de-bronze-118.md');
  });

  it('título só com caracteres não-latinos cai para "obra"', () => {
    expect(nomeArquivo({ titulo: '十日终焉' } as ObraEpub, [cap(1)], 'epub')).toBe('obra-1.epub');
  });
});

describe('remontagem de texto', () => {
  const frases = [
    { paragrafo: 0, texto_zh: '他说：', texto_pt: 'Ele disse:' },
    { paragrafo: 0, texto_zh: '「走。」', texto_pt: '«Vamos».' },
    { paragrafo: 1, texto_zh: '风停了。', texto_pt: '' },
  ] as any[];

  it('agrupa por parágrafo colando o zh e separando o pt por espaço', () => {
    expect(remontarParagrafos(frases)).toEqual([
      { zh: '他说：「走。」', pt: 'Ele disse: «Vamos».' },
      { zh: '风停了。', pt: '' },
    ]);
  });

  it('formatos do download por capítulo seguem iguais depois da extração', () => {
    const cap = { numero: 118, titulo: '第一章', titulo_pt: 'Um' };
    expect(textoCapitulo(cap, frases, 'txt')).toBe('Capítulo 118 — Um\n\nEle disse: «Vamos».');
    expect(textoCapitulo(cap, frases, 'md')).toBe('# Capítulo 118 — Um\n\nEle disse: «Vamos».');
    expect(textoCapitulo(cap, frases, 'bilingue')).toBe(
      '第一章\nCapítulo 118 — Um\n\n他说：「走。」\nEle disse: «Vamos».\n\n风停了。\n(pendente de tradução)',
    );
  });
});

describe('montarMarkdown', () => {
  const obra: ObraEpub = {
    id: 1,
    titulo: 'A Torre de Bronze',
    titulo_original: '青铜塔',
    autor: '杀虫队队员',
    sinopse: 'Uma sinopse.',
    tags: ['Horror'],
  };
  const capitulos: CapituloEpub[] = [
    { numero: 119, titulo: null, titulo_pt: 'Dois', paragrafos: [{ zh: '二。', pt: 'Dois.' }] },
    {
      numero: 118,
      titulo: '第一章',
      titulo_pt: 'Um',
      paragrafos: [
        { zh: '一。', pt: 'Um.' },
        { zh: '未译。', pt: '' },
      ],
    },
  ];

  it('concatena a obra em ordem numérica com ficha no topo', () => {
    const md = montarMarkdown(obra, capitulos);
    expect(md).toContain('# A Torre de Bronze');
    expect(md).toContain('**Autor:** 杀虫队队员');
    expect(md).toContain('> Uma sinopse.');
    expect(md.indexOf('## Capítulo 118 — Um')).toBeLessThan(md.indexOf('## Capítulo 119 — Dois'));
    // Parágrafo sem tradução não entra na versão PT.
    expect(md).not.toContain('未译。');
  });

  it('no formato bilíngue traz o chinês e marca o pendente', () => {
    const md = montarMarkdown(obra, capitulos, 'bilingue');
    expect(md).toContain('一。\n\nUm.');
    expect(md).toContain('未译。\n\n*(pendente de tradução)*');
  });
});
