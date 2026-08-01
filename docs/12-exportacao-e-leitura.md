# 12 — Exportação EPUB/MD e modo leitura

Passo 6 do plano da Nave Mãe. **Objetivo único: o texto sair da bancada.** Hoje a obra
traduzida só existe dentro do editor (uma oficina) ou em downloads capítulo a capítulo.
Este passo entrega o produto final em duas formas: um **livro** (`.epub`, `.md`) e um
**leitor** dentro do app.

Passo quase todo **sem IA**: exportação e leitura apenas leem frases já traduzidas. Nenhuma
rota nova chama provedor; o risco de cota é zero por construção (nenhum `import` de `ia/`
nos módulos novos — isso é verificável no diff).

> ⚠️ Regra de trabalho (igual aos Passos 4 e 5): **nunca** rodar teste/e2e contra
> `~/.local/share/dao-tale`. Toda verificação manual usa `DAO_TALE_DIR` numa pasta
> descartável, populada com o export real de 十日终焉 (capítulos 118/119).

---

## 1. Ponto de partida (verificado no código)

| Já existe | Onde |
|---|---|
| Download por capítulo em `txt` / `md` / `bilingue`, remontando parágrafos por `frases.paragrafo` | `server/src/rotas/capitulos.ts:106` |
| Export/import JSON da obra inteira (`dao-tale-export` v1) | `server/src/db/portabilidade.ts` |
| Metadados de obra: `titulo`, `titulo_original`, `sinopse`, `tags`, `capa` (BLOB + mime) | migração 003, `GET /obras/:id/capa` |
| Numeração real dos capítulos (118, 119…) e status por capítulo | `capitulos.numero`, `capitulos.status` |
| Sistema de tokens "Tinta & Jade" | `web/src/estilos.css`, `docs/tokens-css.md` |

| Não existe | Consequência para este passo |
|---|---|
| Nenhuma lib de zip/epub no projeto | decisão §2 |
| Nenhum campo de **autor** na obra | migração 011 (§4) |
| Nenhuma página read-only de leitura | §7 |
| `epubcheck` / java / leitor de EPUB na máquina | validação §9 (resolvido com JRE portátil, sem instalar nada no sistema) |

---

## 2. Decisão: montar o ZIP à mão (sem dependência nova)

Escolhido: **`node:zlib` + escritor de ZIP próprio** (`server/src/exportacao/zip.ts`, ~130
linhas), não `jszip`/`archiver`.

Por quê:

1. **O OCF exige um ZIP peculiar**: a primeira entrada tem de ser `mimetype`, **STORED**
   (sem compressão), sem extra field, de modo que o arquivo tenha
   `application/epub+zip` literalmente no offset 38 (30 do cabeçalho local + 8 do nome). Toda lib exige configuração especial para isso e
   nenhuma garante ausência de extra fields — é justamente a parte que se quer controlar.
2. **Escala do problema é pequena**: um EPUB desta obra é texto + uma capa (< 5 MB). Não há
   necessidade de streaming, zip64 ou multi-thread — o que justificaria uma lib.
3. **Custo de dependência**: o projeto é local e fecha `allowScripts` explicitamente no
   `package.json`; entrar com árvore nova de deps para escrever 4 headers binários é caro
   no lado errado.
4. **Testabilidade**: o teste lê o ZIP de volta com `zlib.inflateRawSync` + CRC-32 próprio
   (implementação independente do escritor) e a validação manual usa `python3 -m zipfile` e
   `unzip -t` — três leitores externos ao nosso código (§9).

Risco assumido: formato binário escrito à mão pode ter erro silencioso. Mitigação = os três
leitores independentes acima; sem eles, a decisão seria pela lib.

O escritor cobre só o que o OCF usa: método 0 (stored) e 8 (deflate), sem criptografia, sem
zip64, datas fixas em UTC (saída determinística ⇒ dois exports iguais dão bytes iguais, o
que o teste usa).

## 3. Estrutura do EPUB gerado

EPUB **3.3**, com `toc.ncx` de cortesia (leitores antigos de Kobo/Kindle ainda o preferem; a
spec 3 permite).

```
mimetype                    ← STORED, primeira entrada
META-INF/container.xml
OEBPS/conteudo.opf          ← package: metadata, manifest, spine
OEBPS/nav.xhtml             ← nav EPUB3 (toc + landmarks) e sumário legível
OEBPS/toc.ncx               ← compatibilidade EPUB2
OEBPS/estilo.css            ← tipografia Tinta & Jade (§6)
OEBPS/rosto.xhtml           ← título, título original, autor, sinopse
OEBPS/capa.xhtml + capa.<ext>  ← só quando a obra tem capa
OEBPS/cap-0118.xhtml        ← um por capítulo, nome pela numeração REAL, zero-padded
OEBPS/cap-0119.xhtml
```

Cada `cap-NNNN.xhtml`: `<h1>` com `Capítulo <numero> — <titulo_pt>` (cai para `titulo` se não
houver `titulo_pt`, e para só o número se não houver nenhum) e um `<p>` por parágrafo,
remontado das frases com o mesmo agrupamento por `frases.paragrafo` que o download por
capítulo já usa. O `*itálico*` / `**negrito**` que a IA produz (hoje só renderizado no editor
por `TextoRico.tsx`) vira `<em>`/`<strong>` — mesma gramática, um conversor só, compartilhado
com o modo leitura. O escape de conteúdo cobre `&`, `<` e `>` — a **aspa fica literal**: o
diálogo do romance é cheio delas e `&quot;` só sujaria o XHTML (só o valor de atributo escapa
aspa, em `escaparAtributo`). Quando o capítulo não tem `titulo_pt`, o `<h1>` já É o título
original e a linha `.zh` é omitida, para não ecoar o mesmo texto duas vezes.

O `padding` do nome (`cap-0118`) existe para que a ordem alfabética dos arquivos coincida com
a numérica — a ordem que vale é a do `spine`, mas isso ajuda quem abre o zip na mão.

## 4. Metadados: falta `autor` (migração 011)

O EPUB precisa de autor para não aparecer como "Unknown" na estante do leitor, e a obra não
tem esse campo. Migração mínima:

```sql
-- 011_obra_autor.sql
ALTER TABLE obras ADD COLUMN autor TEXT;
```

Entra em `Obra` (shared), no `PUT /obras/:id`, no formulário da ficha (`DetalhesObra`) e no
export JSON com `.default(null)` — mesma convenção de compatibilidade dos campos da 003.

Mapa para o OPF:

| Metadado EPUB | Origem |
|---|---|
| `dc:identifier` | `urn:uuid:<uuid v4 determinístico por obra+escopo>` |
| `dc:title` | `obra.titulo` (PT) |
| `dc:creator` | `obra.autor` (omitido se nulo) |
| `dc:contributor` (`role: trl`) | `"Dao Tale (tradução assistida)"` |
| `dc:language` | `pt-BR` |
| `dc:description` | `obra.sinopse` |
| `dc:source` | `obra.titulo_original` (zh) |
| `dc:subject` | uma por `obra.tags[]` |
| `meta dcterms:modified` | agora, em UTC |
| `<meta name="cover">` + `properties="cover-image"` | `obras.capa` / `capa_mime` |

## 5. Rotas novas (duas, ambas GET, ambas read-only)

```
GET /api/obras/:id/epub?status=traduzido,revisado,finalizado&de=118&ate=140&numeros=118,119
GET /api/obras/:id/markdown?<mesmos filtros>&formato=pt|bilingue
```

Seleção de escopo, avaliada em cima da **numeração real**:

| Parâmetro | Significado | Padrão |
|---|---|---|
| `status` | lista de status aceitos | `traduzido,revisado,finalizado` |
| `de` / `ate` | intervalo inclusivo por `numero` | sem limite |
| `numeros` | lista explícita; quando presente, vence `de`/`ate` | — |

Regras: capítulos ordenados por `numero`; parágrafo sem nenhuma frase traduzida é omitido (não
gera `<p>` vazio); se o escopo resultar em zero capítulos → `400 escopo-vazio` dizendo quantos
capítulos a obra tem **e qual filtro descartou tudo** (`status: …; intervalo: 500 a fim`) — os
enganos comuns são pedir uma faixa inexistente ou `traduzido` numa obra já toda `finalizado`.

`Content-Disposition: attachment; filename="<slug do título>-118-119.epub"` — o sufixo é o
intervalo realmente incluído, então dois exports diferentes não se sobrescrevem na pasta de
downloads.

Refatoração que evita duplicação, em duas camadas:

- `shared/src/livro.ts` — `remontarParagrafos`, `cabecalhoPt`, `filtrarPorEscopo` e
  `STATUS_LEGIVEIS`. São regras que **três** alvos precisam iguais: EPUB, Markdown e modo
  leitura. O painel de exportação conta os capítulos com a mesma `filtrarPorEscopo` que a rota
  aplica, então o que a tela promete é o que entra no arquivo.
- `server/src/exportacao/texto.ts` — só a formatação dos três formatos do download por
  capítulo, que saiu de `rotas/capitulos.ts`. Comportamento idêntico (os testes do download
  seguem sendo o contrato).

`shared/src/inline.ts` fecha o mesmo padrão para `*itálico*`/`**negrito**`: um conversor,
consumido pelo editor (`TextoRico.tsx`), pelo leitor e pelo XHTML do EPUB.

> Armadilha encontrada: `shared/src/index.ts` faz `export * from './livro.js'`, então `livro.ts`
> só pode importar **tipos** de `index.js` — um import de valor fecha o ciclo em runtime e a
> constante chega `undefined` no bundle (não no teste). Por isso `STATUS_LEGIVEIS` mora em
> `livro.ts`, não em `index.ts`.

## 6. Estilo do EPUB e a regra "nada hardcoded"

O EPUB é um alvo de renderização **fora** do app: não há Tailwind nem `estilos.css`. Para não
espalhar hex pelo servidor, a camada de pigmento vira dado:

- `shared/src/pigmentos.ts` — os hexes claro/escuro em um objeto, **fonte única**;
- `server/src/exportacao/estilo.ts` gera `estilo.css` do EPUB declarando `--cor-*` a partir
  desse objeto e usando **só `var(--cor-…)`** nas regras (mesma gramática do doc `tokens-css`),
  com `@media (prefers-color-scheme: dark)` para leitores que respeitam tema;
- **teste anti-drift**: todo hex de `pigmentos.ts` tem de aparecer em `web/src/estilos.css`.
  Assim o dia em que alguém mudar o jade no CSS e esquecer o EPUB (ou vice-versa) o teste
  aponta. (Unificar o consumo do CSS web a partir do TS ficaria para um passo de build
  próprio; fora do escopo aqui.)

Tipografia do miolo: `--fonte-corpo` (serifada) para o texto, `--fonte-zh` no chinês do rosto,
medida controlada pelo leitor, entrelinha 1.7, parágrafos separados por respiro (sem recuo —
convenção de tradução PT, mesma escolha da folha contínua da bancada).

O modo leitura ganhou uma família própria de tokens (`--leitor-txt-1..5`, `--leitor-medida-1..3`,
`--leitor-entrelinha`, registrada em `docs/tokens-css.md`): os controles `A−/A+` e `largura`
trocam **qual token** o componente usa, em vez de escrever px.

Capa em WebP: é tipo de mídia do núcleo do EPUB 3.3 e o epubcheck aceita, mas leitores antigos
podem não renderizar. Quem quiser compatibilidade máxima sobe a capa em JPEG/PNG pela ficha —
o EPUB usa os bytes originais, sem reconverter (nenhuma dependência de imagem no projeto).

## 7. Modo leitura

Rota **fora** da casca de trabalho: `/ler/:obraId/:numero?` (`/ler/:obraId` cai no primeiro
capítulo legível). Não é filha de `ObraLayout` — nenhuma aba de bancada, nenhum botão que
escreve no banco. Read-only de verdade: a página só faz `GET`.

Dados: nenhuma rota nova. `GET /obras/:id/capitulos` (já traz `numero`, `titulo_pt`, `status`)
para o sumário e o mapa `numero → id`; `GET /capitulos/:id` para o texto. Capítulo fora do
escopo legível aparece no sumário esmaecido com nota "ainda não traduzido".

Barra única e discreta (a bancada usa barra dupla; o leitor não é bancada): ‹ voltar à obra ·
título do capítulo · `☰` sumário · `A− A+` · largura · `中` bilíngue · tema. Todas as
preferências em `localStorage` (`dao-tale-leitor-*`), porque são do leitor, não da obra.

| Recurso | Comportamento |
|---|---|
| Navegação | ‹ anterior / próximo › + setas ←/→ do teclado; sumário em gaveta |
| Tamanho de fonte | 5 passos (`--leitor-txt-1..5`), padrão no 3; persistido |
| Largura da medida | 3 passos (54 / 64 / 76ch); persistido |
| Bilíngue `中` | por parágrafo: zh em `--cor-tinta-2` acima do PT — mesma remontagem do download `bilingue`, agora na tela |
| Tema | reaproveita o `BotaoTema` de `App.tsx` (extraído para reuso) |
| Glossário | **não** marca termos: no leitor o texto é o protagonista, sem pontilhado |

Não faz (de propósito): edição, atalho para traduzir, progresso de leitura persistido,
paginação simulada. Rolagem contínua por capítulo.

## 8. Faseamento e testes

| Fase | Entrega | Testes |
|---|---|---|
| **1** | `exportacao/texto.ts` (extração) + `zip.ts` + `epub.ts` + `markdown.ts`; migração 011 + `autor` na ficha | leitor de zip independente (mimetype STORED, media type no offset 38, CRC ok); OPF/nav com todos os capítulos na ordem numérica; escape XML; itálico/negrito → `<em>`/`<strong>`; anti-drift de pigmentos |
| **2** | rotas `GET /obras/:id/epub` e `/markdown` + entrada na UI (diálogo de escopo em Capítulos e `⋯` da estante) | filtros `status`/`de`/`ate`/`numeros`; `400 escopo-vazio`; `Content-Type`/`filename`; capa presente/ausente |
| **3** | modo leitura (rota, layout, controles, bilíngue) | typecheck web + conferência em tela (§10) + roteiro manual no doc 07 |
| **4** | docs 04/07/tokens, validação do EPUB gerado (§9), commit único | suite inteira verde |

Saldo: **224 testes** (177 antes + 47 novos), `DAO_TALE_DIR` preservado como estava.

Meta dura cumprida: os **177 testes anteriores** seguem passando, com `DAO_TALE_DIR` preservado
como está em `app.test.ts`.

## 9. Validação do EPUB — feito

A máquina não tinha `epubcheck`, java nem leitor de EPUB. Em vez de instalar pacote no sistema,
baixamos um **JRE portátil (Temurin 21) e o `epubcheck` 5.2.1 no scratchpad** — nada fora dali.

Resultado sobre o EPUB da obra real (十日终焉, capítulos 118 e 119, capa WebP de 866 KB):

```
Validando usando as regras da versão EPUB 3.3.
Nenhum erro ou advertência detectados.
Mensagens: 0 erros fatais / 0 erros / 0 advertências / 0 informações
```

Checagens independentes que acompanham (todas OK): `python3 -m zipfile -t` e `unzip -t`
(CRCs), primeira entrada `mimetype` com `compress_type == ZIP_STORED` e `application/epub+zip`
no offset 38, e `xmllint --noout` em `container.xml`, `conteudo.opf`, `nav.xhtml`, `toc.ncx` e
em cada `cap-*.xhtml`.

O que a validação **não** cobre: como o texto fica no e-reader de verdade. O arquivo gerado
está pronto para abrir no leitor do usuário — é o único passo que depende dele.

## 10. O que a verificação em tela pegou

O modo leitura foi conferido no navegador (claro, escuro, bilíngue, sumário) e três defeitos
reais apareceram só aí — ficam registrados porque são o tipo de coisa que teste de servidor
nunca acusa:

1. `useEffect(() => localStorage.setItem(...), [x])` devolve valor: o React tenta chamá-lo como
   cleanup e a página inteira morre com *"destroy is not a function"*. Efeito de uma linha
   sempre em bloco.
2. `.leitor-folha p:last-child { margin-bottom: 0 }` zerava **todos** os respiros, porque cada
   `<p>` é filho único do seu bloco. O espaçamento passou para o bloco
   (`.leitor-bloco + .leitor-bloco`), que também mantém zh e pt juntos no modo bilíngue.
3. Com a lista de capítulos ainda carregando, a tela anunciava "nenhum capítulo pronto para
   leitura" — susto gratuito para quem tem a obra traduzida. Agora distingue carregando de vazio.
