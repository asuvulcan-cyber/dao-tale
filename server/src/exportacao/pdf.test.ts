import { describe, expect, it } from 'vitest';
import { montarHtmlImpressao, pagedjsDisponivel } from './pdf.js';
import { glossarioMarkdown, agruparGlossario } from './glossarioLivro.js';
import type { EntradaGlossario } from '@dao-tale/shared';

const obra = {
  id: 1,
  titulo: 'O Sutra dos Mortos',
  titulo_original: '死人经',
  autor: 'Shi Bu Xing',
  sinopse: 'Um tomo do Cânone dos Mortos.',
  tags: [],
};

const capitulos = [
  {
    numero: 1,
    titulo: '第一章 离庄',
    titulo_pt: 'Capítulo 1: Deixando a Propriedade',
    paragrafos: [{ zh: '甲说。', pt: 'Ele disse.' }],
  },
];

const glossario = (extra: Partial<EntradaGlossario>[] = []): EntradaGlossario[] =>
  [
    { id: 1, obra_id: 1, termo_zh: '刀', termo_pt: 'sabre', categoria: 'objeto', nota: 'Um só gume.' },
    { id: 2, obra_id: 1, termo_zh: '顾慎为', termo_pt: 'Gu Shenwei', categoria: 'personagem', nota: null },
    ...extra,
  ] as EntradaGlossario[];

describe('agruparGlossario', () => {
  it('agrupa por categoria e ordena por termo em português', () => {
    const g = agruparGlossario(
      glossario([{ id: 3, obra_id: 1, termo_zh: '金鹏堡', termo_pt: 'Fortaleza Jinpeng', categoria: 'local' }]),
    );
    expect(g.map((x) => x.rotulo)).toEqual(['Personagens', 'Lugares', 'Objetos']);
  });

  it('deixa as variantes de fora: no livro só repetiriam a principal', () => {
    const g = agruparGlossario(
      glossario([
        { id: 9, obra_id: 1, termo_zh: '慎为', termo_pt: 'Shenwei', categoria: 'personagem', principal_id: 2 },
      ] as Partial<EntradaGlossario>[]),
    );
    const nomes = g.flatMap((x) => x.entradas.map((e) => e.termo_pt));
    expect(nomes).toContain('Gu Shenwei');
    expect(nomes).not.toContain('Shenwei');
  });

  it('categoria criada pelo usuário aparece com o nome dela', () => {
    const g = agruparGlossario([
      { id: 1, obra_id: 1, termo_zh: '茶', termo_pt: 'chá', categoria: 'culinaria' },
    ] as EntradaGlossario[]);
    expect(g[0].rotulo).toBe('Culinaria');
  });
});

describe('glossarioMarkdown', () => {
  it('sai vazio quando não há glossário — nada de seção órfã', () => {
    expect(glossarioMarkdown([])).toBe('');
  });

  it('lista termo, chinês e nota', () => {
    const md = glossarioMarkdown(glossario());
    expect(md).toContain('## Glossário');
    expect(md).toContain('- **sabre** (刀) — Um só gume.');
    expect(md).toContain('- **Gu Shenwei** (顾慎为)'); // sem nota, sem travessão solto
    expect(md).not.toContain('(顾慎为) —');
  });
});

describe('montarHtmlImpressao', () => {
  it('embute o Paged.js: o arquivo tem de funcionar offline', () => {
    expect(pagedjsDisponivel()).toBe(true);
    const html = montarHtmlImpressao({ obra, capitulos, glossario: glossario() });
    expect(html).toContain('Paged.js');
    // Nenhuma referência externa: nem script, nem CSS, nem fonte de fora.
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+href=/);
  });

  it('traz numeração de página e título corrente pelas CSS Paged Media', () => {
    const html = montarHtmlImpressao({ obra, capitulos });
    expect(html).toContain('@bottom-center');
    expect(html).toContain('counter(page)');
    expect(html).toContain('string-set: capitulo-corrente');
  });

  it('sumário aponta para os capítulos com número de página', () => {
    const html = montarHtmlImpressao({ obra, capitulos, glossario: glossario() });
    expect(html).toContain('href="#cap-1"');
    expect(html).toContain('target-counter(attr(href), page)');
    expect(html).toContain('href="#glossario"');
  });

  it('sem glossário, o sumário não ganha item morto', () => {
    const html = montarHtmlImpressao({ obra, capitulos, glossario: [] });
    expect(html).not.toContain('href="#glossario"');
  });

  it('capa vai embutida como data URI', () => {
    const html = montarHtmlImpressao({
      obra,
      capitulos,
      capa: { dados: Buffer.from([1, 2, 3]), mime: 'image/png' },
    });
    expect(html).toContain('src="data:image/png;base64,AQID"');
  });

  it('escapa o título da obra dentro do CSS do título corrente', () => {
    const html = montarHtmlImpressao({ obra: { ...obra, titulo: 'Aspas "perigosas"' }, capitulos });
    expect(html).toContain('content: "Aspas \\"perigosas\\""');
  });

  it('avisa quando a paginação terminou — imprimir antes sai truncado', () => {
    const html = montarHtmlImpressao({ obra, capitulos });
    // O gancho documentado do Paged.js; sem ele o usuário não tem como saber a hora.
    expect(html).toContain('window.PagedConfig');
    expect(html).toContain('after:');
    // `auto: true` é obrigatório: o Paged.js só usa os padrões dele quando
    // window.PagedConfig NÃO existe. Declarar o objeto sem `auto` desliga a
    // paginação inteira — aconteceu, e o livro saiu com 2 páginas vazias.
    expect(html).toMatch(/auto:\s*true/);
    expect(html).toContain('data-pronto');
    // E o gancho precisa vir ANTES do Paged.js, senão ele não é lido.
    expect(html.indexOf('window.PagedConfig')).toBeLessThan(html.indexOf('Paged.js v'));
  });

  it('só usa tokens de pigmento que a folha do EPUB declara', () => {
    const html = montarHtmlImpressao({ obra, capitulos });
    const usados = [...html.matchAll(/var\(--cor-([a-z0-9-]+)\)/g)].map((m) => m[1]);
    const declarados = new Set(['papel', 'papel-alto', 'papel-fundo', 'tinta', 'tinta-2', 'linha', 'jade', 'jade-forte', 'selo']);
    expect([...new Set(usados)].filter((t) => !declarados.has(t))).toEqual([]);
  });

  it('não deixa crase entrar no CSS/JS embutidos — quebra o template literal', () => {
    // Aconteceu três vezes ao editar este arquivo: uma crase num comentário
    // dentro do template fecha a string e o módulo para de compilar. O teste
    // não impede o erro, mas o denuncia junto do resto em vez de só no tsc.
    const html = montarHtmlImpressao({ obra, capitulos });
    const entreStyle = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    const entreScript = html.slice(html.indexOf('window.PagedConfig'), html.indexOf('Paged.js v'));
    expect(entreStyle).not.toContain('`');
    expect(entreScript).not.toContain('`');
  });

  it('tira o aviso do documento antes de paginar e o devolve depois', () => {
    const html = montarHtmlImpressao({ obra, capitulos });
    // Passar `content` como elemento NÃO serve: o Paged.js deixa o original no
    // DOM, o conteúdo aparece duas vezes e o texto sai cortado nas margens.
    expect(html).not.toContain("content: document.getElementById");
    expect(html).toContain('before: function');
    expect(html).toContain('avisoGuardado.remove()');
    expect(html).toContain('insertBefore(avisoGuardado');
  });

  it('não põe página nomeada no h1: isso separa o título do texto', () => {
    const html = montarHtmlImpressao({ obra, capitulos });
    expect(html).not.toContain('page: capitulo-abertura');
    expect(html).toContain('break-after: avoid');
  });

  it('recusa livro sem capítulo em vez de gerar arquivo vazio', () => {
    expect(() => montarHtmlImpressao({ obra, capitulos: [] })).toThrow();
  });
});
