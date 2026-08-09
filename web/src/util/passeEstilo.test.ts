import { describe, expect, it } from 'vitest';
import { violacaoDaCorrecao, type ViolacaoEstilo } from './passeEstilo';

const violacao = (ordem: number, regra: string, trecho: string): ViolacaoEstilo => ({
  frase_id: 100 + ordem,
  ordem,
  regra,
  trecho,
});

const correcao = (ordem: number, regra: string, trecho_pt_errado: string | null) => ({
  ordem,
  regra,
  trecho_pt_errado,
});

describe('violacaoDaCorrecao', () => {
  it('casa pela frase quando ela só tem uma violação, mesmo com a regra em branco', () => {
    // O schema do provedor aceita `regra: ''` — um modelo que não ecoa a regra
    // não pode custar ao revisor o botão Dispensar.
    const v = violacao(4, 'mais-que-perfeito', 'errara');
    expect(violacaoDaCorrecao([v, violacao(9, 'aspas-nao-retas', '“')], correcao(4, '', 'errara o'))).toBe(v);
  });

  it('escolhe pela regra quando a frase tem violações de regras diferentes', () => {
    const mqp = violacao(2, 'mais-que-perfeito', 'fizera');
    const aspas = violacao(2, 'aspas-nao-retas', '“');
    expect(violacaoDaCorrecao([mqp, aspas], correcao(2, 'aspas-nao-retas', '“Vamos'))).toBe(aspas);
  });

  it('desempata pelo trecho quando a frase repete a mesma regra', () => {
    const primeira = violacao(7, 'mais-que-perfeito', 'errara');
    const segunda = violacao(7, 'mais-que-perfeito', 'fizera');
    // O par cirúrgico da IA amplia o trecho para desambiguar ("depois fizera
    // pior"); o de-para tem de enxergar o trecho do scanner dentro dele.
    expect(violacaoDaCorrecao([primeira, segunda], correcao(7, 'mais-que-perfeito', 'depois fizera pior'))).toBe(
      segunda,
    );
  });

  it('não adivinha: empate sem âncora no trecho devolve null', () => {
    // Duas da mesma regra e um trecho que não contém nenhuma das duas. Chutar a
    // primeira dispensaria a violação errada — e em silêncio.
    const violacoes = [violacao(7, 'mais-que-perfeito', 'errara'), violacao(7, 'mais-que-perfeito', 'fizera')];
    expect(violacaoDaCorrecao(violacoes, correcao(7, 'mais-que-perfeito', 'parafraseou tudo'))).toBeNull();
  });

  it('frase sem violação na varredura devolve null', () => {
    // Acontece de verdade: aplicar uma correção muda o texto e a varredura é
    // refeita, então a lista some debaixo de uma proposta ainda na tela.
    expect(violacaoDaCorrecao([violacao(1, 'mais-que-perfeito', 'errara')], correcao(5, 'mais-que-perfeito', 'x'))).toBeNull();
  });
});
