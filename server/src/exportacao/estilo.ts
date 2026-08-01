import { FONTES, PIGMENTOS_CLARO, PIGMENTOS_ESCURO, type Pigmentos } from '@dao-tale/shared';

// Folha de estilo do EPUB (doc 12 §6). O e-reader não tem Tailwind nem
// estilos.css, então declaramos a camada de pigmento a partir de
// shared/src/pigmentos.ts e usamos SÓ var(--cor-…) nas regras — a mesma gramática
// de docs/tokens-css.md. Nenhum hex escrito aqui.

function bloco(pigmentos: Pigmentos): string {
  return Object.entries(pigmentos)
    .map(([nome, valor]) => `  --cor-${nome}: ${valor};`)
    .join('\n');
}

export function cssEpub(): string {
  return `/* Dao Tale — Tinta & Jade (docs/tokens-css.md). Gerado por exportacao/estilo.ts. */
:root {
${bloco(PIGMENTOS_CLARO)}
  --fonte-display: ${FONTES.display};
  --fonte-corpo: ${FONTES.corpo};
  --fonte-zh: ${FONTES.zh};
}

/* Leitores que respeitam o tema do sistema trocam só a camada de pigmento. */
@media (prefers-color-scheme: dark) {
  :root {
${bloco(PIGMENTOS_ESCURO)}
  }
}

body {
  background: var(--cor-papel);
  color: var(--cor-tinta);
  font-family: var(--fonte-corpo);
  line-height: 1.7;
  margin: 0 5%;
  text-align: left;
  widows: 2;
  orphans: 2;
}

h1 {
  font-family: var(--fonte-display);
  font-size: 1.5em;
  font-weight: 600;
  line-height: 1.3;
  margin: 2.5em 0 0.2em;
  page-break-before: always;
  break-before: page;
}

/* Filete de jade sob o título do capítulo: a assinatura da identidade. */
h1 + .ornamento {
  border-top: 1px solid var(--cor-jade);
  margin: 0 0 2em;
  width: 3em;
}

/* Parágrafo separado por respiro, sem recuo — convenção de tradução PT-BR e a
   mesma escolha da "folha contínua" da bancada. */
p {
  margin: 0 0 0.9em;
  text-indent: 0;
}

em { font-style: italic; }
strong { font-weight: 600; }

/* Chinês como apoio no modo bilíngue e no rosto (docs/tokens-css.md §5). */
.zh {
  color: var(--cor-tinta-2);
  font-family: var(--fonte-zh);
  font-size: 0.92em;
  margin: 0 0 0.25em;
}

.rosto { margin-top: 20%; text-align: center; }
.rosto h1 {
  font-size: 2em;
  margin: 0 0 0.3em;
  page-break-before: auto;
  break-before: auto;
}
.rosto .autor { color: var(--cor-tinta-2); font-size: 1.05em; margin: 0 0 2em; }
.rosto .selo {
  color: var(--cor-selo);
  font-family: var(--fonte-zh);
  font-size: 1.6em;
  margin: 0 0 1em;
}
.sinopse {
  border-top: 1px solid var(--cor-linha);
  color: var(--cor-tinta-2);
  font-size: 0.95em;
  margin: 2em auto 0;
  padding-top: 1.2em;
  text-align: left;
}

.capa { margin: 0; padding: 0; text-align: center; }
.capa img { max-height: 100%; max-width: 100%; }

/* Sumário por classe, não por seletor de namespace (epub|type exigiria
   @namespace e nem todo leitor resolve). */
.sumario ol { list-style: none; padding-left: 0; }
.sumario li { margin: 0.4em 0; }
.sumario a { color: var(--cor-jade-forte); text-decoration: none; }
.sumario .pendente { color: var(--cor-tinta-2); }

.creditos {
  border-top: 1px solid var(--cor-linha);
  color: var(--cor-tinta-2);
  font-size: 0.85em;
  margin-top: 3em;
  padding-top: 1em;
}
`;
}
