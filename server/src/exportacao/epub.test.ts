import { describe, expect, it } from 'vitest';
import { escaparAtributo, escaparTexto, montarEpub, nomeArquivoCapitulo, paragrafoXhtml, type DadosEpub } from './epub.js';
import { lerZip, textosDoZip } from './leitorZip.js';

// Estrutura do EPUB (doc 12 §3). A validação de conformidade completa é o
// epubcheck (doc 12 §9); aqui garantimos o que um validador não adivinha: os
// capítulos certos, na ordem certa, com o texto certo e escapado.

const GERADO_EM = new Date('2026-07-29T12:00:00.000Z');

function dados(extra: Partial<DadosEpub> = {}): DadosEpub {
  return {
    obra: {
      id: 1,
      titulo: 'A Torre de Bronze',
      titulo_original: '青铜塔',
      autor: '杀虫队队员',
      sinopse: 'Primeiro parágrafo.\n\nSegundo parágrafo & companhia.',
      tags: ['Horror', 'Mistério'],
    },
    capitulos: [
      {
        numero: 118,
        titulo: '第一百一十八章',
        titulo_pt: 'O Fim & o Começo',
        paragrafos: [
          { zh: '他说：「走。」', pt: 'Ele disse: «Vamos».' },
          { zh: '风停了。', pt: 'O vento *parou* e o **silêncio** caiu.' },
          { zh: '未traduzido', pt: '' },
        ],
      },
      {
        numero: 119,
        titulo: null,
        titulo_pt: null,
        paragrafos: [{ zh: '结束。', pt: 'Fim.' }],
      },
    ],
    geradoEm: GERADO_EM,
    ...extra,
  };
}

/** Checagem barata de XML: entidade solta e tags desbalanceadas — os dois erros
    que transformam um EPUB em arquivo rejeitado. O resto fica com o epubcheck. */
function conferirXml(nome: string, xml: string): void {
  const solta = xml.match(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/);
  expect(solta, `${nome}: & sem entidade em "${xml.slice(Math.max(0, (solta?.index ?? 0) - 40), (solta?.index ?? 0) + 40)}"`).toBeNull();

  // Em XML não existe tag vazia implícita: o que não fecha com "/>" tem de ter
  // fechamento explícito. <?xml?> e <!DOCTYPE> não casam com o padrão.
  const pilha: string[] = [];
  for (const [, fechamento, nomeTag, fim] of xml.matchAll(/<(\/?)([a-zA-Z][\w:.-]*)[^>]*?(\/?)>/g)) {
    if (fechamento === '/') {
      expect(pilha.pop(), `${nome}: fechamento inesperado de </${nomeTag}>`).toBe(nomeTag);
    } else if (fim !== '/') {
      pilha.push(nomeTag!);
    }
  }
  expect(pilha, `${nome}: tags abertas sem fechar`).toEqual([]);
}

describe('montarEpub', () => {
  it('monta o container OCF na ordem e com os arquivos esperados', () => {
    const entradas = lerZip(montarEpub(dados()));
    expect(entradas[0]!.nome).toBe('mimetype');
    expect(entradas[0]!.metodo).toBe(0);
    expect(entradas[0]!.conteudo.toString()).toBe('application/epub+zip');
    expect(entradas.map((e) => e.nome)).toEqual([
      'mimetype',
      'META-INF/container.xml',
      'OEBPS/conteudo.opf',
      'OEBPS/estilo.css',
      'OEBPS/nav.xhtml',
      'OEBPS/toc.ncx',
      'OEBPS/rosto.xhtml',
      'OEBPS/cap-0118.xhtml',
      'OEBPS/cap-0119.xhtml',
    ]);
  });

  it('aponta o container para o OPF e declara os metadados da obra', () => {
    const arquivos = textosDoZip(montarEpub(dados()));
    expect(arquivos.get('META-INF/container.xml')).toContain('full-path="OEBPS/conteudo.opf"');

    const opf = arquivos.get('OEBPS/conteudo.opf')!;
    expect(opf).toContain('<dc:title>A Torre de Bronze</dc:title>');
    expect(opf).toContain('<dc:language>pt-BR</dc:language>');
    expect(opf).toContain('<dc:creator id="autor">杀虫队队员</dc:creator>');
    expect(opf).toContain('<dc:source>青铜塔</dc:source>');
    expect(opf).toContain('<dc:subject>Horror</dc:subject>');
    expect(opf).toContain('<dc:subject>Mistério</dc:subject>');
    expect(opf).toContain('role" scheme="marc:relators">trl</meta>');
    expect(opf).toContain('<meta property="dcterms:modified">2026-07-29T12:00:00Z</meta>');
    expect(opf).toMatch(/<dc:identifier id="livro-id">urn:uuid:[0-9a-f-]{36}<\/dc:identifier>/);
    // A sinopse (com &) vai escapada para o dc:description.
    expect(opf).toContain('Segundo parágrafo &amp; companhia.');
  });

  it('lista os capítulos no manifest e no spine, em ordem numérica', () => {
    const opf = textosDoZip(montarEpub(dados()))!.get('OEBPS/conteudo.opf')!;
    expect(opf).toContain('<item id="cap-118" href="cap-0118.xhtml" media-type="application/xhtml+xml"/>');
    expect(opf).toContain('<item id="cap-119" href="cap-0119.xhtml" media-type="application/xhtml+xml"/>');
    const espinha = [...opf.matchAll(/<itemref idref="([^"]+)"\/>/g)].map((m) => m[1]);
    expect(espinha).toEqual(['rosto', 'nav', 'cap-118', 'cap-119']);
  });

  it('ordena capítulos fora de ordem pela numeração real', () => {
    const fora = dados();
    fora.capitulos = [fora.capitulos[1]!, fora.capitulos[0]!];
    const nomes = lerZip(montarEpub(fora))
      .map((e) => e.nome)
      .filter((n) => n.includes('cap-'));
    expect(nomes).toEqual(['OEBPS/cap-0118.xhtml', 'OEBPS/cap-0119.xhtml']);
  });

  it('escreve o capítulo com cabeçalho, formatação inline e sem parágrafo vazio', () => {
    const cap = textosDoZip(montarEpub(dados())).get('OEBPS/cap-0118.xhtml')!;
    expect(cap).toContain('<h1>Capítulo 118 — O Fim &amp; o Começo</h1>');
    expect(cap).toContain('<p class="zh">第一百一十八章</p>');
    expect(cap).toContain('<p>Ele disse: «Vamos».</p>');
    expect(cap).toContain('<p>O vento <em>parou</em> e o <strong>silêncio</strong> caiu.</p>');
    // O parágrafo sem tradução não gera <p> vazio.
    expect(cap.match(/<p>/g)).toHaveLength(2);
    // Sem titulo_pt nem titulo, o cabeçalho cai para só o número.
    expect(textosDoZip(montarEpub(dados())).get('OEBPS/cap-0119.xhtml')).toContain('<h1>Capítulo 119</h1>');
  });

  it('não repete o título chinês quando o capítulo não tem título em português', () => {
    const semPt = dados();
    semPt.capitulos = [{ ...semPt.capitulos[0]!, titulo_pt: null }];
    const cap = textosDoZip(montarEpub(semPt)).get('OEBPS/cap-0118.xhtml')!;
    // O h1 já É o título original; uma linha .zh igual seria eco.
    expect(cap).toContain('<h1>Capítulo 118 — 第一百一十八章</h1>');
    expect(cap).not.toContain('class="zh"');
  });

  it('gera sumário (nav e ncx) apontando para todos os capítulos', () => {
    const arquivos = textosDoZip(montarEpub(dados()));
    const nav = arquivos.get('OEBPS/nav.xhtml')!;
    expect(nav).toContain('<a href="cap-0118.xhtml">Capítulo 118 — O Fim &amp; o Começo</a>');
    expect(nav).toContain('<a href="cap-0119.xhtml">Capítulo 119</a>');
    expect(nav).toContain('epub:type="landmarks"');
    const ncx = arquivos.get('OEBPS/toc.ncx')!;
    expect(ncx).toContain('<content src="cap-0118.xhtml"/>');
    expect(ncx).toContain('<content src="cap-0119.xhtml"/>');
    expect(ncx).toContain('name="dtb:uid"');
  });

  it('inclui a capa como imagem, página e cover-image quando existe', () => {
    const comCapa = montarEpub(dados({ capa: { dados: Buffer.from('bytes-da-capa'), mime: 'image/webp' } }));
    const entradas = lerZip(comCapa);
    const imagem = entradas.find((e) => e.nome === 'OEBPS/capa.webp');
    expect(imagem?.conteudo.toString()).toBe('bytes-da-capa');
    expect(imagem?.metodo).toBe(0); // imagem já comprimida entra STORED
    const opf = textosDoZip(comCapa).get('OEBPS/conteudo.opf')!;
    expect(opf).toContain('properties="cover-image"');
    expect(opf).toContain('<meta name="cover" content="capa-imagem"/>');
    expect(opf.indexOf('<itemref idref="capa"/>')).toBeLessThan(opf.indexOf('<itemref idref="rosto"/>'));
  });

  it('ignora capa de mime desconhecido em vez de gerar manifest quebrado', () => {
    const arquivos = textosDoZip(montarEpub(dados({ capa: { dados: Buffer.from('x'), mime: 'image/tiff' } })));
    expect([...arquivos.keys()].some((n) => n.startsWith('OEBPS/capa'))).toBe(false);
    expect(arquivos.get('OEBPS/conteudo.opf')).not.toContain('cover-image');
  });

  it('produz XML sem entidade solta nem tag desbalanceada', () => {
    for (const [nome, texto] of textosDoZip(montarEpub(dados()))) {
      if (nome.endsWith('.xhtml') || nome.endsWith('.opf') || nome.endsWith('.ncx') || nome.endsWith('.xml')) {
        conferirXml(nome, texto);
      }
    }
  });

  it('mantém o mesmo identificador para o mesmo escopo e muda quando o escopo muda', () => {
    const idDe = (epub: Buffer) =>
      textosDoZip(epub).get('OEBPS/conteudo.opf')!.match(/urn:uuid:([0-9a-f-]{36})/)![1];
    const completo = dados();
    const parcial = dados();
    parcial.capitulos = [parcial.capitulos[0]!];
    expect(idDe(montarEpub(completo))).toBe(idDe(montarEpub(dados())));
    expect(idDe(montarEpub(parcial))).not.toBe(idDe(montarEpub(completo)));
  });

  it('recusa montar livro sem capítulo', () => {
    expect(() => montarEpub(dados({ capitulos: [] }))).toThrow(/sem capítulos/);
  });
});

describe('auxiliares do EPUB', () => {
  it('escapa o que quebra XML, mas deixa a aspa no texto corrido', () => {
    // Diálogo de romance é cheio de aspas: escapá-las no conteúdo só suja o XHTML.
    expect(escaparTexto('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d "e"');
    expect(escaparAtributo('capa "1".webp')).toBe('capa &quot;1&quot;.webp');
  });

  it('converte formatação inline depois de escapar', () => {
    expect(paragrafoXhtml('*a & b* normal **c<d**')).toBe('<em>a &amp; b</em> normal <strong>c&lt;d</strong>');
    // Asterisco solto não é marcador: fica no texto.
    expect(paragrafoXhtml('3 * 4 = 12')).toBe('3 * 4 = 12');
  });

  it('zero-pada o nome do arquivo pela numeração real', () => {
    expect(nomeArquivoCapitulo(7)).toBe('cap-0007.xhtml');
    expect(nomeArquivoCapitulo(118)).toBe('cap-0118.xhtml');
    expect(nomeArquivoCapitulo(1204)).toBe('cap-1204.xhtml');
  });
});
