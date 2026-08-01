import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PIGMENTOS_CLARO, PIGMENTOS_ESCURO } from '@dao-tale/shared';
import { describe, expect, it } from 'vitest';
import { cssEpub } from './estilo.js';

// Guarda da regra de ouro (docs/tokens-css.md): o EPUB é outro alvo de renderização,
// mas a paleta é a MESMA. Se alguém mudar um pigmento em estilos.css e esquecer
// shared/src/pigmentos.ts (ou o contrário), estes testes acusam.

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const estilosCss = fs.readFileSync(path.join(raiz, 'web/src/estilos.css'), 'utf8');

describe('paleta do EPUB', () => {
  it('todo hex de pigmentos.ts existe em web/src/estilos.css', () => {
    const ausentes: string[] = [];
    for (const [tema, pigmentos] of [
      ['claro', PIGMENTOS_CLARO],
      ['escuro', PIGMENTOS_ESCURO],
    ] as const) {
      for (const [nome, hex] of Object.entries(pigmentos)) {
        if (!estilosCss.includes(hex)) ausentes.push(`${tema}/${nome} (${hex})`);
      }
    }
    expect(ausentes, 'pigmentos que sumiram de estilos.css').toEqual([]);
  });

  it('o CSS do EPUB não escreve nenhum hex fora da camada de pigmento', () => {
    const css = cssEpub();
    const declaracoes = css
      .split('\n')
      .filter((l) => l.includes('#') && !l.trim().startsWith('--cor-'))
      .map((l) => l.trim());
    expect(declaracoes, 'linhas com hex fora de --cor-*').toEqual([]);
  });

  it('declara as duas camadas e usa var() nas regras', () => {
    const css = cssEpub();
    expect(css).toContain(`--cor-tinta: ${PIGMENTOS_CLARO.tinta};`);
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(`--cor-tinta: ${PIGMENTOS_ESCURO.tinta};`);
    expect(css).toContain('color: var(--cor-tinta)');
    expect(css).toContain('font-family: var(--fonte-corpo)');
  });
});
