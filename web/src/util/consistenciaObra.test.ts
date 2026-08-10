import { describe, expect, it } from 'vitest';
import { previaValida, type PreviaSubstituicao } from './consistenciaObra';

const previa = (de: string, frases = 4): PreviaSubstituicao => ({ de, frases });

describe('previaValida', () => {
  it('sem prévia nenhuma não vale nada — é o estado em que a tela abre', () => {
    expect(previaValida(null, 'Forte Dourado')).toBeNull();
    expect(previaValida(null, '')).toBeNull();
  });

  it('prévia do texto que está no campo vale, e devolve a contagem junto', () => {
    // Devolve o objeto, não `true`: quem chama escreve "N frases seriam
    // alteradas" com esse mesmo N, em vez de ir buscá-lo noutro lugar.
    const p = previa('Forte Dourado', 7);
    expect(previaValida(p, 'Forte Dourado')).toBe(p);
    expect(previaValida(p, 'Forte Dourado')?.frases).toBe(7);
  });

  it('campo EDITADO depois da prévia invalida — é o acidente que a trava existe para impedir', () => {
    // Prever "Abismo", corrigir para "abismos" e trocar em cima da contagem
    // antiga reescreveria a obra a partir de um número de outra palavra. Um
    // booleano "já previu" não distingue este caso do anterior; a comparação
    // do texto distingue.
    expect(previaValida(previa('Abismo'), 'abismos')).toBeNull();
    expect(previaValida(previa('Abismo'), 'Abismo Profundo')).toBeNull();
    // Diferença de caixa é diferença: a troca é por palavra e sensível a ela.
    expect(previaValida(previa('Abismo'), 'abismo')).toBeNull();
  });

  it('apagar o campo depois de prever invalida — vazio não é "o mesmo texto"', () => {
    expect(previaValida(previa('Forte Dourado'), '')).toBeNull();
    expect(previaValida(previa('Forte Dourado'), '   ')).toBeNull();
  });

  it('só espaço em volta não invalida: é o mesmo texto que a rota recebeu', () => {
    // A chamada manda `de.trim()`. Se a comparação não aplicasse o mesmo trim,
    // digitar um espaço ao fim desabilitaria o botão sem nada ter mudado — e o
    // revisor pediria a prévia de novo sem entender por quê.
    const p = previa('Forte Dourado');
    expect(previaValida(p, '  Forte Dourado ')).toBe(p);
  });

  it('prévia de zero frase continua VÁLIDA — quem decide o que fazer com zero é a tela', () => {
    // A validade responde "esta contagem é deste texto?", não "vale a pena
    // trocar?". Misturar as duas perguntas aqui esconderia de quem chama a
    // diferença entre "não previu" e "previu, e não há o que trocar" — que é
    // exatamente o aviso que a tela dá ao revisor.
    const p = previa('Fortaleza do Roc Dourado', 0);
    expect(previaValida(p, 'Fortaleza do Roc Dourado')).toBe(p);
  });
});
