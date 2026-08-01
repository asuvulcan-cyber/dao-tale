# Convenção de tokens CSS — Dao Tale

Padrão único de nomenclatura para **todo** o site. Regra de ouro: **nenhum
componente usa valor hardcoded** (hex, px de cor, etc.) — sempre um token.
Direção visual: **"Tinta & Jade"** (ver o guia de identidade).

Idioma dos tokens: **português**, `kebab-case`. Prefixo por família.

## As três camadas de cor

O sistema tem três camadas. Uma camada só pode consumir a de baixo.

### 1. Pigmento — `--cor-<pigmento>[-<variação>]`

Única camada onde existe **hex literal**. É também a única que o modo escuro
redefine. Pigmentos minerais tradicionais:

| Pigmento | Token base   | Papel                         |
|----------|--------------|-------------------------------|
| 宣纸 papel | `--cor-papel` | fundo da página (viés verde)  |
| 墨 tinta  | `--cor-tinta` | texto principal               |
| 石绿 jade  | `--cor-jade`  | marca / positivo / canônico   |
| 朱砂 selo  | `--cor-selo`  | ação / erro / atenção         |
| 赭石 ocre  | `--cor-ocre`  | aviso / glossário             |
| 靛青 índigo| `--cor-indigo`| informação / edição           |

Sufixos de **variação** (mesma gramática para todos):

| Sufixo    | Significado                                    |
|-----------|------------------------------------------------|
| *(nenhum)*| tom base                                       |
| `-forte`  | mais escuro/saturado (texto sobre `-tint`)     |
| `-tint`   | fundo tênue do pigmento (chips, avisos)        |
| `-2`      | versão suave/secundária (ex.: `--cor-tinta-2`) |
| `-alto`   | superfície elevada (só `papel`: cartões)       |
| `-fundo`  | superfície recuada/hover (só `papel`)          |
| `--cor-linha` | hairline/borda (deriva de tinta+papel)     |

### 2. Semântico — `--cor-<papel-semântico>`

Alias que **aponta** para um pigmento. **É isto que os componentes usam.**
Trocar a intenção (ex.: mudar "ação" de selo p/ jade) é editar um token só.

| Token          | Aponta p/     | Uso                                  |
|----------------|---------------|--------------------------------------|
| `--cor-marca`  | jade          | logo, links, foco, seleção           |
| `--cor-acao`   | selo          | botão primário ("Traduzir")          |
| `--cor-acao-forte` | selo-forte| hover do botão primário              |
| `--cor-ok`     | jade          | sucesso, frase confirmada            |
| `--cor-aviso`  | ocre          | cota, pendências                     |
| `--cor-erro`   | selo          | falhas, 429, "precisa de regra"      |
| `--cor-info`   | índigo        | editado à mão, dicas                 |
| `--cor-gloss`  | ocre          | termos do glossário no texto         |

> Exceção consciente: um componente pode citar um **pigmento** direto quando a
> cor É a identidade (ex.: o selo `--cor-selo` no logo). Nunca hex.

## Outras famílias

| Família     | Prefixo     | Exemplos                                             |
|-------------|-------------|------------------------------------------------------|
| Tipografia  | `--fonte-`  | `--fonte-display`, `--fonte-corpo`, `--fonte-zh`, `--fonte-ui`, `--fonte-mono` |
| Tamanho txt | `--txt-`    | `--txt-cap`, `--txt-sm`, `--txt-base`, `--txt-lead`, `--txt-h3`, `--txt-h2`, `--txt-h1` |
| Espaçamento | `--esp-`    | `--esp-1`…`--esp-8` (escala 4/8/12/16/24/40/64/96px) |
| Raio        | `--raio-`   | `--raio-1`, `--raio-2`, `--raio-selo`, `--raio-pill` |
| Leitura     | `--leitor-` | `--leitor-txt-1`…`--leitor-txt-5`, `--leitor-medida-1`…`-3`, `--leitor-entrelinha` |

> A família `--leitor-` existe porque o modo leitura (doc 12 §7) deixa o **leitor** escolher
> corpo e medida: os controles `A−/A+` e `largura` trocam qual token o componente usa
> (`var(--leitor-txt-4)`), em vez de calcular px. O EPUB é o mesmo sistema em outro alvo:
> `shared/src/pigmentos.ts` leva a camada de pigmento para fora do navegador.

## Ponte com o Tailwind v4

Em `estilos.css`, cada token vira utilitário via `@theme inline`, e o **nome do
utilitário = nome do token sem o prefixo**:

```css
@theme inline {
  --color-papel: var(--cor-papel);   /* → bg-papel, text-papel     */
  --color-acao:  var(--cor-acao);    /* → bg-acao, text-acao        */
  --color-jade:  var(--cor-jade);    /* → bg-jade, border-jade      */
  --font-display: var(--fonte-display); /* → font-display           */
}
```

Assim `bg-acao` / `text-tinta` / `border-linha` respondem ao tema em runtime
(a media query e o `data-theme` trocam só a camada `--cor-*`).

## Modo claro/escuro

- Padrão: segue o SO (`prefers-color-scheme`).
- Override manual: atributo `data-theme="dark|light"` no `<html>` (vence a media query nos dois sentidos).
- **Só a camada pigmento** (`--cor-*` base) é redefinida por tema. Semânticos,
  fontes, espaçamentos e raios nunca mudam entre temas.

## O estilo Dao Tale — componentes padrão (§5)

Além dos tokens, o site inteiro monta a interface com **estas peças** (classes
em `estilos.css` + componentes em `App.tsx`). Nada de estilo ad hoc por página.

| Peça | Classe/Componente | Uso |
|------|-------------------|-----|
| Cartão | `.cartao` | qualquer superfície de conteúdo sobre o papel |
| Campo | `.entrada` | input, select, textarea — todos os formulários |
| Botão primário | `<Botao>` (selo sólido) | UMA ação principal por tela |
| Ferramenta | `.ferramenta` (pílula) | ações secundárias em barras |
| Segmentado | `.seg` | grupos exclusivos (modos, filtros) |
| Etiqueta | `<Etiqueta>` | status/metadado pequeno |
| Aviso | `<Aviso>` | feedback ok/info/erro |
| Estado da frase | `.frase-lava--*` + `.chip-estado` | opção B aprovada: lavagem de fundo esmaecendo + filete esquerdo + chip |
| Termo do glossário | `.termo-gloss` | sublinhado pontilhado estilo link |

Princípios de composição (a "cara" Dao Tale):
- **Barra dupla** em telas de trabalho: barra 1 = *onde estou* (contexto, navegação ‹ ›, status); barra 2 = *como vejo / o que faço* (modos, ferramentas, UMA ação primária). Ações raras vão para o menu `⋯`.
- **Folha contínua**: conteúdo textual em UMA superfície, parágrafos separados por respiro — não uma pilha de cartões com moldura.
- **Texto de origem (zh) é apoio**: `--cor-tinta-2`; o português é o protagonista.
- Título de página em `--fonte-display`; rótulos de UI em `--fonte-ui`; números em `--fonte-mono` com `tabular-nums`.

## Regras rápidas (checklist ao escrever componente)

1. Precisa de cor? Use um **semântico** (`--cor-acao`), não um pigmento cru.
2. Nunca escreva hex/rgb num componente. Se falta um token, crie na camada certa.
3. Borda = `--cor-linha`. Texto suave = `--cor-tinta-2`. Superfície de cartão = `--cor-papel-alto`.
4. Ao migrar páginas legadas (classes `stone-*`/`red-*`…), troque por utilitários semânticos.
5. Formulário? `.entrada`. Superfície? `.cartao`. Barra de ferramentas? `.ferramenta`/`.seg`.
