import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cabecalhoPt, type EntradaGlossario } from '@dao-tale/shared';
import { escaparAtributo, escaparTexto, paragrafoXhtml, type CapituloEpub, type ObraEpub } from './epub.js';
import { cssEpub } from './estilo.js';
import { agruparGlossario, TITULO_GLOSSARIO } from './glossarioLivro.js';

// Livro para PDF (doc 12 §5). Não geramos o PDF aqui: entregamos um HTML
// ÚNICO e autocontido que já vem paginado, e o navegador imprime.
//
// Por que assim, e não com um gerador de PDF no servidor:
//  • O motor de tipografia do navegador é melhor do que qualquer coisa que a
//    gente escreveria à mão — justificação, hifenização, controle de viúvas e
//    órfãs saem de graça e certos.
//  • Nenhuma dependência de binário externo: um PDF que dependesse do Chromium
//    instalado quebraria no modo hospedado, que é justamente onde o usuário
//    abriria pelo celular.
//  • O arquivo funciona offline e é arquivável: abre daqui a dez anos.
//
// O Paged.js (MIT, embutido em vendor/) traz o que o Chrome não implementa das
// CSS Paged Media: número de página, título corrente no topo e sumário com o
// número da página em que o capítulo começa. Sem ele o PDF sairia sem paginação
// — que é exatamente o que separa "texto impresso" de "livro".

const dirVendor = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vendor');

let pagedjsCache: string | null = null;

function pagedjs(): string {
  pagedjsCache ??= fs.readFileSync(path.join(dirVendor, 'pagedjs.min.js'), 'utf-8');
  return pagedjsCache;
}

export interface DadosPdf {
  obra: ObraEpub;
  capitulos: CapituloEpub[];
  glossario?: EntradaGlossario[];
  capa?: { dados: Buffer; mime: string };
}

/** CSS de página: só o que é específico de mídia paginada. O resto da
 *  identidade vem de `cssEpub()`, a mesma folha do EPUB. */
function cssPaginado(obra: ObraEpub): string {
  const titulo = obra.titulo.replace(/"/g, '\\"');
  return `
@page {
  size: 148mm 210mm; /* A5 — proporção de livro, não de folha de escritório */
  margin: 16mm 15mm 18mm;

  @bottom-center {
    content: counter(page);
    font-family: var(--fonte-corpo);
    font-size: 9pt;
    color: var(--cor-tinta-2);
  }
}

/* Página de abertura de capítulo não leva título corrente nem número: é a
   convenção do livro impresso. */
@page capitulo-abertura {
  @top-center { content: none; }
  @bottom-center { content: counter(page); }
}

@page :left {
  @top-center {
    content: "${titulo}";
    font-family: var(--fonte-corpo);
    font-size: 8.5pt;
    font-style: italic;
    color: var(--cor-tinta-2);
  }
}

@page :right {
  @top-center {
    content: string(capitulo-corrente);
    font-family: var(--fonte-corpo);
    font-size: 8.5pt;
    font-style: italic;
    color: var(--cor-tinta-2);
  }
}

/* Capa e rosto sem nada em volta. */
@page sem-ornamento {
  @top-center { content: none; }
  @bottom-center { content: none; }
}
.capa, .rosto { page: sem-ornamento; }

body {
  font-size: 10.5pt;
  line-height: 1.5;
  /* Justificado com hifenização: sem hífen, o justificado abre buracos. */
  text-align: justify;
  hyphens: auto;
  -webkit-hyphens: auto;
}

p { orphans: 2; widows: 2; }

h1 {
  string-set: capitulo-corrente content(text);
  page: capitulo-abertura;
  break-before: page;
  margin-top: 6mm;
}
/* O primeiro h1 do livro não força página nova (já está numa). */
.capa + .rosto h1, .rosto h1 { break-before: avoid; }

.capa { text-align: center; }
.capa img { max-width: 100%; max-height: 92vh; }

/* Sumário com linha de condução até o número da página. */
.sumario ol { list-style: none; padding: 0; }
.sumario li { margin: 0 0 0.35em; }
.sumario a { text-decoration: none; color: inherit; }
.sumario a::after {
  content: leader('.') target-counter(attr(href), page);
  color: var(--cor-tinta-2);
}
.sumario h1 { break-before: avoid; }

/* Glossário: duas colunas aproveitam melhor a página de consulta. */
.glossario { columns: 2; column-gap: 8mm; }
.glossario dt { break-after: avoid; }
.glossario dd { break-before: avoid; margin-bottom: 0.4em; }

/* Aviso da tela — some na impressão. Enquanto pagina fica âmbar; ao terminar,
   vira verde: é o sinal de que já dá para imprimir. */
.instrucao {
  background: var(--cor-papel-fundo);
  border: 1px solid var(--cor-linha);
  border-left: 4px solid var(--cor-selo);
  border-radius: 4px;
  margin: 0 0 8mm;
  padding: 10px 14px;
  text-align: left;
}
.instrucao[data-pronto] { border-left-color: var(--cor-jade); }
.instrucao p { margin: 0; }
@media print { .instrucao { display: none; } }
`;
}

function capituloHtml(cap: CapituloEpub): string {
  const cabecalho = cabecalhoPt(cap);
  const paragrafos = cap.paragrafos
    .filter((p) => p.pt)
    .map((p) => `<p>${paragrafoXhtml(p.pt)}</p>`)
    .join('\n');
  const original = cap.titulo && cap.titulo_pt ? `<p class="zh">${escaparTexto(cap.titulo)}</p>\n` : '';
  return `<section id="cap-${cap.numero}">
<h1>${escaparTexto(cabecalho)}</h1>
<div class="ornamento"></div>
${original}${paragrafos}
</section>`;
}

function glossarioHtml(entradas: EntradaGlossario[]): string {
  const grupos = agruparGlossario(entradas);
  if (grupos.length === 0) return '';
  const secoes = grupos
    .map((g) => {
      const itens = g.entradas
        .map(
          (e) =>
            `<dt>${escaparTexto(e.termo_pt)} <span class="zh">${escaparTexto(e.termo_zh)}</span></dt>` +
            `<dd>${e.nota ? escaparTexto(e.nota) : ''}</dd>`,
        )
        .join('\n');
      return `<h2>${escaparTexto(g.rotulo)}</h2>\n<dl class="glossario">\n${itens}\n</dl>`;
    })
    .join('\n');
  return `<section id="glossario">
<h1>${escaparTexto(TITULO_GLOSSARIO)}</h1>
<div class="ornamento"></div>
${secoes}
</section>`;
}

export function montarHtmlImpressao(dados: DadosPdf): string {
  if (dados.capitulos.length === 0) throw new Error('Livro sem capítulos.');
  const capitulos = [...dados.capitulos].sort((a, b) => a.numero - b.numero);
  const glossario = dados.glossario ?? [];
  const { obra } = dados;

  const capa = dados.capa
    ? `<section class="capa"><img src="data:${dados.capa.mime};base64,${dados.capa.dados.toString('base64')}" alt="Capa"/></section>`
    : '';

  const sinopse = obra.sinopse
    ? `<div class="sinopse">${obra.sinopse
        .split(/\n{2,}|\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p>${escaparTexto(p)}</p>`)
        .join('\n')}</div>`
    : '';

  const itensSumario = capitulos
    .map((c) => `<li><a href="#cap-${c.numero}">${escaparTexto(cabecalhoPt(c))}</a></li>`)
    .join('\n');
  const itemGlossario = glossario.length > 0 ? `<li><a href="#glossario">${escaparTexto(TITULO_GLOSSARIO)}</a></li>` : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>${escaparTexto(obra.titulo)}</title>
<style>
${cssEpub()}
${cssPaginado(obra)}
</style>
</head>
<body>
<div class="instrucao" id="aviso">
<p id="estado"><strong>Paginando o livro…</strong> Não imprima ainda — a numeração e os títulos
correntes são calculados agora, e imprimir no meio sai incompleto.</p>
</div>
${capa}
<section class="rosto">
<h1>${escaparTexto(obra.titulo)}</h1>
${obra.titulo_original ? `<p class="selo">${escaparTexto(obra.titulo_original)}</p>` : ''}
${obra.autor ? `<p class="autor">${escaparTexto(obra.autor)}</p>` : ''}
${sinopse}
</section>
<nav class="sumario">
<h1>Sumário</h1>
<ol>
${itensSumario}
${itemGlossario}
</ol>
</nav>
${capitulos.map(capituloHtml).join('\n')}
${glossarioHtml(glossario)}
<script>
// PagedConfig.after é o gancho documentado do Paged.js: roda quando TODAS as
// páginas terminaram de fluir. Sem um sinal visível, o usuário imprime no meio
// da paginação e leva um PDF truncado — foi o que aconteceu no primeiro teste
// desta funcionalidade, com 2 páginas no lugar de 17.
window.PagedConfig = {
  // OBRIGATÓRIO. O Paged.js faz window.PagedConfig || {auto:true,...}: se o
  // objeto existe, o padrão inteiro é descartado, e sem auto a paginação
  // simplesmente não roda. Omitir isto entrega um livro de 2 páginas em branco.
  auto: true,
  after: () => {
    const paginas = document.querySelectorAll('.pagedjs_page').length;
    const estado = document.getElementById('estado');
    if (estado) {
      estado.innerHTML =
        '<strong>Pronto — ' + paginas + ' páginas.</strong> Agora use <strong>Ctrl+P</strong> → destino ' +
        '<strong>Salvar como PDF</strong>. Nas opções, deixe “Margens: padrão” e <strong>desmarque</strong> ' +
        '“Cabeçalhos e rodapés” (a numeração e os títulos correntes já estão na página). ' +
        'Este aviso não sai no papel.';
    }
    document.getElementById('aviso')?.setAttribute('data-pronto', '1');
    document.title = document.title + ' — ' + paginas + ' páginas';
  },
};
</script>
<script>${pagedjs()}</script>
</body>
</html>
`;
}

/** Só para o teste de fumaça da rota: confirma que o vendor está no lugar. */
export function pagedjsDisponivel(): boolean {
  try {
    return pagedjs().length > 1000;
  } catch {
    return false;
  }
}

export { escaparAtributo };
