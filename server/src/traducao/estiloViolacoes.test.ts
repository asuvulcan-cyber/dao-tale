import { describe, expect, it } from 'vitest';
import { PREFERENCIAS_PADRAO } from '@dao-tale/shared';
import { analisarEstilo } from './estiloViolacoes.js';

const frases = (textos: string[]) => textos.map((texto_pt, ordem) => ({ ordem, texto_pt }));

describe('analisarEstilo', () => {
  it('usa fronteiras Unicode completas, sem recortar palavras em letras acentuadas', () => {
    const r = analisarEstilo(frases(['Na terceira câmara, a operação e a aceleração causaram uma impressão assustadora.', 'Ele deu uma lição, sem consideração especial.']), { ...PREFERENCIAS_PADRAO, mais_que_perfeito:'evitar' });
    expect(r.violacoes).toEqual([]);
    expect(analisarEstilo(frases(['Andou um li.']), PREFERENCIAS_PADRAO).violacoes[0].regra).toBe('unidade-chinesa');
  });
  it('acusa mais-que-perfeito simples quando a obra pediu para evitar', () => {
    const r = analisarEstilo(frases(['Ele cumprira a promessa.', 'Ele tinha cumprido a promessa.']), {
      ...PREFERENCIAS_PADRAO,
      mais_que_perfeito: 'evitar',
    });
    expect(r.violacoes).toHaveLength(1);
    expect(r.violacoes[0]).toMatchObject({ ordem: 0, regra: 'mais-que-perfeito', trecho: 'cumprira' });
  });

  it('não acusa nada quando a obra permite a forma simples', () => {
    const r = analisarEstilo(frases(['Ele cumprira a promessa.']), {
      ...PREFERENCIAS_PADRAO,
      mais_que_perfeito: 'permitir',
    });
    expect(r.violacoes).toHaveLength(0);
  });

  it('não confunde substantivo terminado em -eira/-ora com verbo', () => {
    const r = analisarEstilo(
      frases(['Que besteira, disse a senhora na cadeira de madeira, agora mesmo, com a bandeira inteira.']),
      { ...PREFERENCIAS_PADRAO, mais_que_perfeito: 'evitar' },
    );
    expect(r.violacoes).toHaveLength(0);
  });

  it('não confunde fileira, esfera ou carnívora com mais-que-perfeito', () => {
    const r = analisarEstilo(frases(['A fileira cercava a esfera carnívora.']), {
      ...PREFERENCIAS_PADRAO,
      mais_que_perfeito: 'evitar',
    });
    expect(r.violacoes).toHaveLength(0);
  });

  it('acusa mais-que-perfeito de verbo com hiato, que o sufixo sem acento deixava passar', () => {
    // Um "saíra" real passou batido no capítulo 3 da 死人经: a alternação exigia
    // as letras "ira" e a forma traz "íra".
    const r = analisarEstilo(frases(['A cabeça saíra.', 'Ele caíra ali.', 'Possuíra o livro.']), {
      ...PREFERENCIAS_PADRAO,
      mais_que_perfeito: 'evitar',
    });
    expect(r.violacoes.map((v) => v.trecho)).toEqual(['saíra', 'caíra', 'Possuíra']);
  });

  it('não confunde nome de árvore em -eira com verbo', () => {
    const r = analisarEstilo(frases(['A romãzeira ao lado da palmeira e da figueira.']), {
      ...PREFERENCIAS_PADRAO,
      mais_que_perfeito: 'evitar',
    });
    expect(r.violacoes).toHaveLength(0);
  });

  it('acusa travessão numa obra configurada com aspas', () => {
    const r = analisarEstilo(frases(['— Matem todos!']), { ...PREFERENCIAS_PADRAO, dialogo: 'aspas' });
    expect(r.violacoes.map((v) => v.regra)).toContain('dialogo-aspas');
  });

  it('acusa aspas não convertidas, asiáticas ou curvas', () => {
    for (const texto of ['「不可能」, disse ele.', 'Chamavam-no de ‘Sabre Celeste’.', 'Ele disse “nome”.']) {
      const r = analisarEstilo(frases([texto]), PREFERENCIAS_PADRAO);
      expect(r.violacoes.map((v) => v.regra)).toContain('aspas-nao-retas');
    }
  });

  it('não acusa aspas retas, que são a forma pedida', () => {
    const r = analisarEstilo(frases(['Ele disse "nome" e depois \'outro\'.']), PREFERENCIAS_PADRAO);
    expect(r.violacoes).toHaveLength(0);
  });

  it('mostra a concentração por terço — o que separa regra ruim de bloco grande', () => {
    // O padrão real do prólogo da 死人经: limpo no começo, sujo no fim. Regra mal
    // escrita erraria espalhado; isto é decaimento ao longo da mesma resposta.
    const textos = Array.from({ length: 30 }, (_, i) => (i >= 20 ? 'Ele escapara dali.' : 'Ele tinha escapado dali.'));
    const r = analisarEstilo(frases(textos), { ...PREFERENCIAS_PADRAO, mais_que_perfeito: 'evitar' });
    expect(r.por_terco[0]).toBe(0);
    expect(r.por_terco[1]).toBe(0);
    expect(r.por_terco[2]).toBe(10);
  });
});

describe('recall do mais-que-perfeito', () => {
  it('pega as formas de 6 letras que o quantificador antigo deixava passar', () => {
    // "achara" e "ouvira" escaparam da varredura real do capítulo 2: o {4,}
    // exigia 4 caracteres ANTES do sufixo, ou seja, palavra de 7+ letras.
    const r = analisarEstilo(frases(['Ele nunca achara isso.', 'Já ouvira falar dela.']), {
      ...PREFERENCIAS_PADRAO,
      mais_que_perfeito: 'evitar',
    });
    expect(r.violacoes.map((v) => v.trecho)).toEqual(['achara', 'ouvira']);
  });

  it('continua sem acusar as curtas que não são verbo', () => {
    const r = analisarEstilo(
      frases(['Para na hora, espera, prepara e admira a cadeira clara de madeira.']),
      { ...PREFERENCIAS_PADRAO, mais_que_perfeito: 'evitar' },
    );
    expect(r.violacoes).toEqual([]);
  });
});

describe('vírgula do inciso', () => {
  it('acusa a vírgula DENTRO das aspas (convenção do inglês)', () => {
    const r = analisarEstilo(frases(['"Os da família Gu devem voltar," disse o homem de preto.']), {
      ...PREFERENCIAS_PADRAO,
      dialogo: 'aspas',
    });
    expect(r.violacoes.map((v) => v.regra)).toContain('virgula-dentro-da-aspa');
  });

  it('aceita a forma portuguesa, com a vírgula depois das aspas', () => {
    const r = analisarEstilo(frases(['"Os da família Gu devem voltar", disse o homem de preto.']), {
      ...PREFERENCIAS_PADRAO,
      dialogo: 'aspas',
    });
    expect(r.violacoes).toEqual([]);
  });

  it('não acusa ponto de interrogação, que fica dentro por pertencer à fala', () => {
    const r = analisarEstilo(frases(['"Quem está aí?" perguntou ela.']), { ...PREFERENCIAS_PADRAO, dialogo: 'aspas' });
    expect(r.violacoes).toEqual([]);
  });

  it('não se aplica ao modo travessão', () => {
    const r = analisarEstilo(frases(['"algo," disse ele.']), { ...PREFERENCIAS_PADRAO, dialogo: 'travessao' });
    expect(r.violacoes.map((v) => v.regra)).not.toContain('virgula-dentro-da-aspa');
  });
});

describe('unidades chinesas literais', () => {
  it('acusa transliteração e a explicação literal do bastão de incenso', () => {
    const r = analisarEstilo(
      frases(['Esperou dois shichen.', 'Só depois do tempo de queimar um bastão de incenso ele acordou.']),
      PREFERENCIAS_PADRAO,
    );
    expect(r.violacoes.filter((v) => v.regra === 'unidade-chinesa')).toHaveLength(2);
  });

  it('aceita a conversão para duração brasileira', () => {
    expect(analisarEstilo(frases(['Cerca de meia hora depois, ele acordou.']), PREFERENCIAS_PADRAO).violacoes).toEqual([]);
  });
});
