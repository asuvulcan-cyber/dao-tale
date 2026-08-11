import { describe, expect, it } from 'vitest';
import { CATALOGO } from '@dao-tale/shared';
import { orientacaoDaRegra, REGRA_ESTILO_ROTULO } from './rotuloRegra';

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
});
