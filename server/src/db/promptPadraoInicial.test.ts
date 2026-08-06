import { describe, expect, it } from 'vitest';
import { temasNoTexto } from '@dao-tale/shared';
import {
  MARCADOR_DELTA,
  MARCADOR_PREFERENCIAS,
  NUCLEO_ENXUTO,
  PROMPT_PADRAO_INICIAL,
} from './promptPadraoInicial.js';

// Trava a regressão que produziu o sintoma de 2026-08-05: um Alfa que decide tema de
// Beta mata a chave da obra em silêncio. Não há aviso possível depois do fato — o texto
// sai errado e nada quebra.
describe('o Alfa distribuído respeita a partição', () => {
  it('o núcleo enxuto não decide nenhum tema de Beta', () => {
    const invasoes = temasNoTexto(NUCLEO_ENXUTO).filter((o) => o.tema.dono === 'beta');
    // Listar os trechos em vez de contar: quando falha, a mensagem já diz onde.
    expect(invasoes.map((o) => `L${o.linha} [${o.tema.id}] ${o.trecho}`)).toEqual([]);
  });

  it('o núcleo enxuto reserva as duas seções', () => {
    expect(NUCLEO_ENXUTO).toContain(MARCADOR_PREFERENCIAS);
    expect(NUCLEO_ENXUTO).toContain(MARCADOR_DELTA);
  });

  // O v1.0 é o que estava rodando no VPS em 2026-08-05 e produziu "está repetitivo?".
  // Este teste FIXA o defeito em vez de escondê-lo: se um dia ele passar a estar limpo,
  // alguém editou uma versão que deveria ser imutável.
  it('o v1.0 legado decide tema de Beta e não reserva a Seção 5 — por isso foi aposentado', () => {
    const invasoes = temasNoTexto(PROMPT_PADRAO_INICIAL).filter((o) => o.tema.dono === 'beta');
    expect(invasoes.length).toBeGreaterThan(0);
    expect(PROMPT_PADRAO_INICIAL).not.toContain(MARCADOR_PREFERENCIAS);
  });
});
