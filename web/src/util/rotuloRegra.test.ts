import { describe, expect, it } from 'vitest';
import { CATALOGO, type EntradaCatalogo } from '@dao-tale/shared';
import { comporRotulos, orientacaoDaRegra, REGRA_ESTILO_ROTULO } from './rotuloRegra';

// orientacaoDaRegra já é testada a fundo em server/src/db/catalogoErros.test.ts
// (casamento por id, null fora do catálogo, os pisos). Aqui o alvo é só este
// módulo: que REGRA_ESTILO_ROTULO nomeia toda entrada do catálogo (a falha
// silenciosa que a Task 6 existe para fechar) e que a reexportação chega
// íntegra a quem importa só daqui.
describe('rótulos de regra', () => {
  it('toda entrada do catálogo tem rótulo — nada de id cru na tela', () => {
    for (const e of CATALOGO) expect(REGRA_ESTILO_ROTULO[e.id]).toBe(e.titulo);
  });

  it('as regras de estilo continuam nomeadas', () => {
    expect(REGRA_ESTILO_ROTULO['mais-que-perfeito']).toBe('Mais-que-perfeito simples');
  });

  it('a orientação sai só para regra do catálogo', () => {
    expect(orientacaoDaRegra(CATALOGO[0].id)).toBe(CATALOGO[0].certo);
    expect(orientacaoDaRegra('mais-que-perfeito')).toBeNull();
  });

  it('numa colisão de id, o catálogo vence — senão o rótulo diverge da orientação', () => {
    // Com os ids reais não há colisão, então a precedência do spread passa
    // verde nos dois sentidos. A entrada sintética é o que a torna verificável:
    // a orientação logo abaixo do rótulo casa por id direto no catálogo, e um
    // rótulo de estilo por cima dela seria a divergência silenciosa que este
    // módulo existe para impedir.
    const colidente = { ...CATALOGO[0], id: 'mais-que-perfeito', titulo: 'Do catálogo' } as EntradaCatalogo;
    const mapa = comporRotulos({ 'mais-que-perfeito': 'De estilo' }, [colidente]);
    expect(mapa['mais-que-perfeito']).toBe('Do catálogo');
  });
});
