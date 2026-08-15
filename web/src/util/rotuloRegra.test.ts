import { describe, expect, it } from 'vitest';
import { CATALOGO, type EntradaCatalogo } from '@dao-tale/shared';
import { comporRotulos, DE_ESTILO, orientacaoDaRegra, REGRA_ESTILO_ROTULO } from './rotuloRegra';

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

  it('numa colisão de id, o catálogo vence — em qualquer das regras de estilo', () => {
    // Com os ids reais não há colisão, então a precedência do spread passa
    // verde nos dois sentidos. A entrada sintética é o que a torna verificável:
    // a orientação logo abaixo do rótulo casa por id direto no catálogo, e um
    // rótulo de estilo por cima dela seria a divergência silenciosa que este
    // módulo existe para impedir.
    //
    // Percorre as CINCO: pinar só uma deixaria a inversão passar verde para as
    // outras quatro, que é o mesmo buraco em tamanho menor.
    const idsDeEstilo = [
      'mais-que-perfeito',
      'aspas-nao-retas',
      'virgula-dentro-da-aspa',
      'dialogo-aspas',
      'dialogo-travessao',
    ];
    for (const id of idsDeEstilo) {
      const colidente = { ...CATALOGO[0], id, titulo: 'Do catálogo' } as EntradaCatalogo;
      const mapa = comporRotulos({ [id]: 'De estilo' }, [colidente]);
      expect(mapa[id], `colisão em ${id}`).toBe('Do catálogo');
    }
  });

  it('as cinco regras de estilo do mapa são exatamente as que a varredura emite', () => {
    // A lista acima é cópia manual; se `DE_ESTILO` ganhar ou perder uma regra,
    // a cobertura da colisão silenciosamente deixa de valer para ela.
    expect(Object.keys(DE_ESTILO).sort()).toEqual([
      'aspas-nao-retas',
      'dialogo-aspas',
      'dialogo-travessao',
      'mais-que-perfeito',
      'virgula-dentro-da-aspa',
    ]);
  });
});
