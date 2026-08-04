import crypto from 'node:crypto';
import { agruparGlossario, TITULO_GLOSSARIO } from './glossarioLivro.js';
import { cabecalhoPt, partirInline, type EntradaGlossario, type ParagrafoRemontado } from '@dao-tale/shared';
import { cssEpub } from './estilo.js';
import { montarZip, type EntradaZip } from './zip.js';

// EPUB 3.3 da obra inteira (doc 12 §3). Zero IA: só lê frases já traduzidas.
// Acompanha um toc.ncx de cortesia — a spec 3 o permite e leitores antigos
// (Kobo/Kindle mais velhos) ainda o preferem.

const DIR = 'OEBPS';
const NS_OPF = 'http://www.idpf.org/2007/opf';
const NS_DC = 'http://purl.org/dc/elements/1.1/';
const NS_XHTML = 'http://www.w3.org/1999/xhtml';
const NS_OPS = 'http://www.idpf.org/2007/ops';
const NS_NCX = 'http://www.daisy.org/z3986/2005/ncx/';

export interface CapituloEpub {
  numero: number;
  titulo: string | null;
  titulo_pt: string | null;
  paragrafos: ParagrafoRemontado[];
}

export interface ObraEpub {
  id: number;
  titulo: string;
  titulo_original: string | null;
  autor: string | null;
  sinopse: string | null;
  tags: string[];
}

export interface DadosEpub {
  obra: ObraEpub;
  capitulos: CapituloEpub[];
  /** Apêndice de glossário; vazio = o livro sai sem ele. */
  glossario?: EntradaGlossario[];
  capa?: { dados: Buffer; mime: string };
  /** Injetável para o teste: é a única parte não determinística (dcterms:modified). */
  geradoEm?: Date;
}

const EXTENSAO_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

/** Escape de conteúdo de texto. A aspa NÃO entra: dentro de um elemento ela é
    caractere comum, e escapá-la encheria o diálogo do romance de &quot;. */
export function escaparTexto(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escape para valor de atributo — aí a aspa precisa virar entidade. */
export function escaparAtributo(texto: string): string {
  return escaparTexto(texto).replace(/"/g, '&quot;');
}

/** Parágrafo traduzido → XHTML: os marcadores inline da IA viram <em> e <strong>.
    O escape vem antes da conversão — escapar não introduz asteriscos. */
export function paragrafoXhtml(texto: string): string {
  return partirInline(texto)
    .map((s) => {
      const corpo = escaparTexto(s.texto);
      if (s.tipo === 'negrito') return `<strong>${corpo}</strong>`;
      if (s.tipo === 'italico') return `<em>${corpo}</em>`;
      return corpo;
    })
    .join('');
}

/** Identificador estável da obra: mesmo escopo exportado duas vezes = mesmo id
    (o leitor reconhece a atualização em vez de criar um livro novo na estante). */
function uuidObra(obra: ObraEpub, capitulos: CapituloEpub[]): string {
  const NAMESPACE = Buffer.from('6f5a2b1c0d3e4f709a8b1c2d3e4f5a6b', 'hex');
  const nome = `dao-tale:obra:${obra.id}:${obra.titulo}:${capitulos.map((c) => c.numero).join(',')}`;
  const h = crypto.createHash('sha1').update(Buffer.concat([NAMESPACE, Buffer.from(nome, 'utf8')])).digest();
  h[6] = (h[6]! & 0x0f) | 0x50; // versão 5
  h[8] = (h[8]! & 0x3f) | 0x80; // variante RFC 4122
  const hex = h.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function nomeArquivoCapitulo(numero: number): string {
  // Zero-padded para a ordem alfabética dos arquivos coincidir com a numérica —
  // a ordem que vale é a do spine, mas isso ajuda quem abre o zip na mão.
  return `cap-${String(numero).padStart(4, '0')}.xhtml`;
}

function paginaXhtml(titulo: string, corpo: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="${NS_XHTML}" xmlns:epub="${NS_OPS}" xml:lang="pt-BR" lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>${escaparTexto(titulo)}</title>
<link rel="stylesheet" type="text/css" href="estilo.css"/>
</head>
<body>
${corpo}
</body>
</html>
`;
}

function capituloXhtml(cap: CapituloEpub): string {
  const cabecalho = cabecalhoPt(cap);
  const paragrafos = cap.paragrafos
    .filter((p) => p.pt)
    .map((p) => `<p>${paragrafoXhtml(p.pt)}</p>`)
    .join('\n');
  // Só repete o título chinês quando o h1 está em português; sem titulo_pt o
  // cabeçalho já É o título original e a linha zh seria eco.
  const original = cap.titulo && cap.titulo_pt ? `<p class="zh">${escaparTexto(cap.titulo)}</p>\n` : '';
  return paginaXhtml(
    cabecalho,
    `<h1>${escaparTexto(cabecalho)}</h1>
<div class="ornamento"></div>
${original}${paragrafos}`,
  );
}

function rostoXhtml(obra: ObraEpub): string {
  const partes = [`<div class="rosto">`, `<p class="selo">道</p>`, `<h1>${escaparTexto(obra.titulo)}</h1>`];
  if (obra.titulo_original) partes.push(`<p class="zh">${escaparTexto(obra.titulo_original)}</p>`);
  if (obra.autor) partes.push(`<p class="autor">${escaparTexto(obra.autor)}</p>`);
  if (obra.sinopse) {
    const paragrafos = obra.sinopse
      .split(/\n{2,}|\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escaparTexto(p)}</p>`)
      .join('\n');
    partes.push(`<div class="sinopse">\n${paragrafos}\n</div>`);
  }
  partes.push(
    `<p class="creditos">Tradução assistida por IA e revisada à mão no Dao Tale.</p>`,
    `</div>`,
  );
  return paginaXhtml(obra.titulo, partes.join('\n'));
}

function glossarioXhtml(entradas: EntradaGlossario[]): string {
  const secoes = agruparGlossario(entradas)
    .map((g) => {
      const itens = g.entradas
        .map(
          (e) =>
            `<dt>${escaparTexto(e.termo_pt)} <span class="zh">${escaparTexto(e.termo_zh)}</span></dt>` +
            (e.nota ? `\n<dd>${escaparTexto(e.nota)}</dd>` : '<dd></dd>'),
        )
        .join('\n');
      return `<h2>${escaparTexto(g.rotulo)}</h2>\n<dl class="glossario">\n${itens}\n</dl>`;
    })
    .join('\n');
  return paginaXhtml(
    TITULO_GLOSSARIO,
    `<h1>${escaparTexto(TITULO_GLOSSARIO)}</h1>\n<div class="ornamento"></div>\n${secoes}`,
  );
}

function capaXhtml(arquivo: string): string {
  return paginaXhtml('Capa', `<div class="capa"><img src="${escaparAtributo(arquivo)}" alt="Capa"/></div>`);
}

function navXhtml(obra: ObraEpub, capitulos: CapituloEpub[], temCapa: boolean, temGlossario = false): string {
  const itens = capitulos
    .map((c) => `<li><a href="${nomeArquivoCapitulo(c.numero)}">${escaparTexto(cabecalhoPt(c))}</a></li>`)
    .join('\n');
  const primeiro = capitulos[0] ? nomeArquivoCapitulo(capitulos[0].numero) : 'rosto.xhtml';
  return paginaXhtml(
    'Sumário',
    `<nav epub:type="toc" id="toc" class="sumario">
<h1>Sumário</h1>
<ol>
<li><a href="rosto.xhtml">${escaparTexto(obra.titulo)}</a></li>
${itens}
${temGlossario ? `<li><a href="glossario.xhtml">${escaparTexto(TITULO_GLOSSARIO)}</a></li>` : ''}
</ol>
</nav>
<nav epub:type="landmarks" id="landmarks" hidden="hidden">
<h2>Marcos</h2>
<ol>
${temCapa ? '<li><a epub:type="cover" href="capa.xhtml">Capa</a></li>\n' : ''}<li><a epub:type="toc" href="nav.xhtml">Sumário</a></li>
<li><a epub:type="bodymatter" href="${primeiro}">Início do texto</a></li>
</ol>
</nav>`,
  );
}

function ncx(obra: ObraEpub, capitulos: CapituloEpub[], uuid: string): string {
  const pontos = capitulos
    .map(
      (c, i) => `<navPoint id="np-${c.numero}" playOrder="${i + 2}">
<navLabel><text>${escaparTexto(cabecalhoPt(c))}</text></navLabel>
<content src="${nomeArquivoCapitulo(c.numero)}"/>
</navPoint>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="${NS_NCX}" version="2005-1" xml:lang="pt-BR">
<head>
<meta name="dtb:uid" content="urn:uuid:${uuid}"/>
<meta name="dtb:depth" content="1"/>
<meta name="dtb:totalPageCount" content="0"/>
<meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>${escaparTexto(obra.titulo)}</text></docTitle>
<navMap>
<navPoint id="np-rosto" playOrder="1">
<navLabel><text>${escaparTexto(obra.titulo)}</text></navLabel>
<content src="rosto.xhtml"/>
</navPoint>
${pontos}
</navMap>
</ncx>
`;
}

function opf(dados: DadosEpub, uuid: string, arquivoCapa: string | null): string {
  const temGlossario = (dados.glossario ?? []).length > 0;
  const { obra, capitulos } = dados;
  const modificado = (dados.geradoEm ?? new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z');

  const metadados = [
    `<dc:identifier id="livro-id">urn:uuid:${uuid}</dc:identifier>`,
    `<dc:title>${escaparTexto(obra.titulo)}</dc:title>`,
    `<dc:language>pt-BR</dc:language>`,
    `<meta property="dcterms:modified">${modificado}</meta>`,
  ];
  if (obra.autor) {
    metadados.push(
      `<dc:creator id="autor">${escaparTexto(obra.autor)}</dc:creator>`,
      `<meta refines="#autor" property="role" scheme="marc:relators">aut</meta>`,
    );
  }
  metadados.push(
    `<dc:contributor id="tradutor">Dao Tale (tradução assistida)</dc:contributor>`,
    `<meta refines="#tradutor" property="role" scheme="marc:relators">trl</meta>`,
  );
  if (obra.sinopse) metadados.push(`<dc:description>${escaparTexto(obra.sinopse)}</dc:description>`);
  if (obra.titulo_original) metadados.push(`<dc:source>${escaparTexto(obra.titulo_original)}</dc:source>`);
  for (const tag of obra.tags) metadados.push(`<dc:subject>${escaparTexto(tag)}</dc:subject>`);
  // meta legado do OPF 2: é assim que leitores antigos acham a capa.
  if (arquivoCapa) metadados.push(`<meta name="cover" content="capa-imagem"/>`);

  const itens = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `<item id="estilo" href="estilo.css" media-type="text/css"/>`,
    `<item id="rosto" href="rosto.xhtml" media-type="application/xhtml+xml"/>`,
    ...(temGlossario
      ? [`<item id="glossario" href="glossario.xhtml" media-type="application/xhtml+xml"/>`]
      : []),
  ];
  if (arquivoCapa && dados.capa) {
    itens.push(
      `<item id="capa-imagem" href="${escaparAtributo(arquivoCapa)}" media-type="${dados.capa.mime}" properties="cover-image"/>`,
      `<item id="capa" href="capa.xhtml" media-type="application/xhtml+xml"/>`,
    );
  }
  for (const c of capitulos) {
    itens.push(
      `<item id="cap-${c.numero}" href="${nomeArquivoCapitulo(c.numero)}" media-type="application/xhtml+xml"/>`,
    );
  }

  const espinha = [
    ...(arquivoCapa ? [`<itemref idref="capa"/>`] : []),
    `<itemref idref="rosto"/>`,
    `<itemref idref="nav"/>`,
    ...capitulos.map((c) => `<itemref idref="cap-${c.numero}"/>`),
    // Glossário fecha o livro: é apêndice de consulta, não leitura corrida.
    ...(temGlossario ? [`<itemref idref="glossario"/>`] : []),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="${NS_OPF}" version="3.0" unique-identifier="livro-id" xml:lang="pt-BR">
<metadata xmlns:dc="${NS_DC}">
${metadados.join('\n')}
</metadata>
<manifest>
${itens.join('\n')}
</manifest>
<spine toc="ncx">
${espinha.join('\n')}
</spine>
</package>
`;
}

/** Monta o .epub completo. Lança se não houver capítulo nenhum (a rota trata isso antes). */
export function montarEpub(dados: DadosEpub): Buffer {
  if (dados.capitulos.length === 0) throw new Error('EPUB sem capítulos.');
  const capitulos = [...dados.capitulos].sort((a, b) => a.numero - b.numero);
  const uuid = uuidObra(dados.obra, capitulos);
  const extensao = dados.capa ? EXTENSAO_POR_MIME[dados.capa.mime] : undefined;
  const arquivoCapa = dados.capa && extensao ? `capa.${extensao}` : null;
  const glossario = dados.glossario ?? [];
  const temGlossario = glossario.length > 0;

  const entradas: EntradaZip[] = [
    // Exigência do OCF: primeira entrada, sem compressão, sem extra field.
    { nome: 'mimetype', dados: 'application/epub+zip', comprimir: false },
    {
      nome: 'META-INF/container.xml',
      dados: `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
<rootfiles>
<rootfile full-path="${DIR}/conteudo.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>
`,
    },
    { nome: `${DIR}/conteudo.opf`, dados: opf({ ...dados, capitulos, glossario }, uuid, arquivoCapa) },
    { nome: `${DIR}/estilo.css`, dados: cssEpub() },
    { nome: `${DIR}/nav.xhtml`, dados: navXhtml(dados.obra, capitulos, !!arquivoCapa, temGlossario) },
    { nome: `${DIR}/toc.ncx`, dados: ncx(dados.obra, capitulos, uuid) },
    { nome: `${DIR}/rosto.xhtml`, dados: rostoXhtml(dados.obra) },
    ...(temGlossario ? [{ nome: `${DIR}/glossario.xhtml`, dados: glossarioXhtml(glossario) }] : []),
  ];
  if (arquivoCapa && dados.capa) {
    entradas.push(
      { nome: `${DIR}/capa.xhtml`, dados: capaXhtml(arquivoCapa) },
      // Imagem já comprimida: STORED evita gastar CPU para engordar o arquivo.
      { nome: `${DIR}/${arquivoCapa}`, dados: dados.capa.dados, comprimir: false },
    );
  }
  for (const c of capitulos) {
    entradas.push({ nome: `${DIR}/${nomeArquivoCapitulo(c.numero)}`, dados: capituloXhtml(c) });
  }

  return montarZip(entradas);
}
