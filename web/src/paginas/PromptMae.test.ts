import { describe, expect, it } from 'vitest';
import {
  MARCADOR_PREFERENCIAS,
  MARCADOR_PREFERENCIAS_COMPACTAS,
  MARCADOR_PREFERENCIAS_COMPACTAS_V2,
  MARCADOR_PREFERENCIAS_COMPACTAS_V3,
} from '@dao-tale/shared';
import { nucleoAceitaPreferencias } from './PromptMae';

describe('nucleoAceitaPreferencias', () => {
  it.each([
    MARCADOR_PREFERENCIAS,
    MARCADOR_PREFERENCIAS_COMPACTAS,
    MARCADOR_PREFERENCIAS_COMPACTAS_V2,
    MARCADOR_PREFERENCIAS_COMPACTAS_V3,
  ])('reconhece o marcador Beta %s', (marcador) => {
    expect(nucleoAceitaPreferencias(`núcleo\n${marcador}\nfim`)).toBe(true);
  });

  it('rejeita núcleo sem ponto de inserção do Beta', () => {
    expect(nucleoAceitaPreferencias('núcleo legado sem marcador')).toBe(false);
  });
});
