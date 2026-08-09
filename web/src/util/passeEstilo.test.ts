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

  it('descarte (trecho_pt_errado null) casa por posição — é o único desempate que sobra', () => {
    // `respostaPasseEstiloSchema` OBRIGA o par a ser null quando descartar=true,
    // então não existe texto para ancorar. Sem o desempate por posição, o grupo
    // "a IA acha que não é violação" ficava sem botão de dispensar em toda frase
    // com duas violações da mesma regra — que é o caso comum, não o exótico.
    const primeira = violacao(7, 'mais-que-perfeito', 'errara');
    const segunda = violacao(7, 'mais-que-perfeito', 'fizera');
    const descarte = correcao(7, 'mais-que-perfeito', null);
    expect(violacaoDaCorrecao([primeira, segunda], descarte, 0)).toBe(primeira);
    expect(violacaoDaCorrecao([primeira, segunda], descarte, 1)).toBe(segunda);
  });

  it('empate sem âncora no trecho cai na posição, não em null', () => {
    // A IA parafraseou ao copiar o trecho. Escolher por posição e mostrar o alvo
    // no botão é melhor que sumir com o botão: some o alerta que o revisor vê.
    const violacoes = [violacao(7, 'mais-que-perfeito', 'errara'), violacao(7, 'mais-que-perfeito', 'fizera')];
    expect(violacaoDaCorrecao(violacoes, correcao(7, 'mais-que-perfeito', 'parafraseou tudo'), 1)).toBe(violacoes[1]);
  });

  it('ocorrência além do fim da lista grampeia na última', () => {
    // Acontece entre um clique e o outro: dispensar a primeira encolhe a
    // varredura, e a correção de índice 1 passa a ver uma lista de um item só.
    const so = violacao(7, 'mais-que-perfeito', 'fizera');
    expect(violacaoDaCorrecao([so], correcao(7, 'mais-que-perfeito', null), 5)).toBe(so);
  });

  it('frase sem violação na varredura devolve null', () => {
    // Acontece de verdade: aplicar uma correção muda o texto e a varredura é
    // refeita, então a lista some debaixo de uma proposta ainda na tela.
    expect(violacaoDaCorrecao([violacao(1, 'mais-que-perfeito', 'errara')], correcao(5, 'mais-que-perfeito', 'x'))).toBeNull();
  });
});
