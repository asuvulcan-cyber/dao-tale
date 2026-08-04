import { describe, expect, it } from 'vitest';
import { aplicarCorrecao } from '@dao-tale/shared';

// Os dois casos abaixo aconteceram de verdade na 死人经 e destruíram texto: a
// correção substituía a frase INTEIRA pela proposta do modelo.

describe('aplicarCorrecao', () => {
  it('preserva as aspas de diálogo ao corrigir só o miolo da fala', () => {
    const atual = '"Matem, porra! Matem todo mundo agora! Só quero as cabeças — nada de deixar corpo inteiro!"';
    const r = aplicarCorrecao(atual, {
      trecho_pt_errado: 'nada de deixar corpo inteiro',
      trecho_pt_corrigido: 'não quero corpo inteiro nenhum',
      // A proposta do modelo veio SEM as aspas: é ela que apagava a marcação.
      correcao_proposta: 'Matem, porra! Matem todo mundo agora! Só quero as cabeças — não quero corpo inteiro nenhum!',
    });
    expect(r.tipo).toBe('cirurgica');
    expect(r.tipo === 'cirurgica' && r.texto).toBe(
      '"Matem, porra! Matem todo mundo agora! Só quero as cabeças — não quero corpo inteiro nenhum!"',
    );
  });

  it('preserva as orações que a proposta encurtada tinha apagado', () => {
    const atual =
      'Na mente de Shangguan Fa havia apenas uma impressão vaga. Aquele homem certamente morreria sob as lâminas ' +
      'da Fortaleza Jinpeng. Se conseguira fazer o Rei Incomparável decepar a mão do próprio filho, sua morte já ' +
      'podia ser considerada valiosa.';
    const r = aplicarCorrecao(atual, {
      trecho_pt_errado: 'Se conseguira fazer',
      trecho_pt_corrigido: 'Se tinha conseguido fazer',
      correcao_proposta:
        'Se tinha conseguido fazer o Rei Incomparável decepar a mão do próprio filho, sua morte já podia ser considerada valiosa.',
    });
    expect(r.tipo).toBe('cirurgica');
    expect(r.tipo === 'cirurgica' && r.texto).toContain('Na mente de Shangguan Fa');
    expect(r.tipo === 'cirurgica' && r.texto).toContain('Fortaleza Jinpeng');
    expect(r.tipo === 'cirurgica' && r.texto).toContain('Se tinha conseguido fazer');
  });

  it('cai para a frase inteira quando o trecho não ancora no texto atual', () => {
    const r = aplicarCorrecao('Ele cumprira a promessa.', {
      trecho_pt_errado: 'ele parafraseou isto aqui',
      trecho_pt_corrigido: 'qualquer coisa',
      correcao_proposta: 'Ele tinha cumprido a promessa.',
    });
    expect(r).toEqual({ tipo: 'frase-inteira', texto: 'Ele tinha cumprido a promessa.', encurtaMuito: false });
  });

  it('cai para a frase inteira quando o trecho é ambíguo (aparece duas vezes)', () => {
    const atual = 'Ele partira. Depois ele partira de novo.';
    const r = aplicarCorrecao(atual, {
      trecho_pt_errado: 'partira',
      trecho_pt_corrigido: 'tinha partido',
      correcao_proposta: 'Ele tinha partido. Depois ele tinha partido de novo.',
    });
    expect(r.tipo).toBe('frase-inteira');
  });

  it('marca encurtaMuito quando a reserva também parece só um trecho', () => {
    const atual =
      'Na mente dele havia uma impressão vaga. Aquele homem morreria sob as lâminas da fortaleza. Se tinha ' +
      'conseguido, sua morte valera a pena.';
    const r = aplicarCorrecao(atual, { correcao_proposta: 'Se tinha conseguido, sua morte valeu a pena.' });
    expect(r).toMatchObject({ tipo: 'frase-inteira', encurtaMuito: true });
  });

  it('sem nada aplicável, não inventa texto', () => {
    expect(aplicarCorrecao('Qualquer frase.', { correcao_proposta: null }).tipo).toBe('impossivel');
  });
});
