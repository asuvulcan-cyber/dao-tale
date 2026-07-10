import { describe, it, expect } from 'vitest';
import { segmentar } from './segmentar.js';

const textos = (entrada: string) => segmentar(entrada).frases.map((f) => f.texto_zh);

describe('segmentar — bateria do doc 05 §1', () => {
  it('pontuação forte encerra frases', () => {
    expect(textos('他说。她走了！')).toEqual(['他说。', '她走了！']);
  });

  it('diálogo com pontuação interna não é quebrado', () => {
    expect(textos('「你好。今天如何？」他问。')).toEqual(['「你好。今天如何？」他问。']);
  });

  it('duas falas com narração viram duas frases', () => {
    expect(textos('「等等！」她喊道。「别走。」')).toEqual(['「等等！」她喊道。', '「别走。」']);
  });

  it('aninhamento de aspas é uma frase só', () => {
    expect(textos('他想：『那人说过「不行」。』然后离开。')).toEqual([
      '他想：『那人说过「不行」。』然后离开。',
    ]);
  });

  it('reticências com interrogação são uma frase', () => {
    expect(textos('什么……？')).toEqual(['什么……？']);
  });

  it('reticências duplas encerram uma vez', () => {
    expect(textos('他沉默了……然后开口。')).toEqual(['他沉默了……', '然后开口。']);
  });

  it('sequência ？！ encerra no fim da sequência', () => {
    expect(textos('你说什么？！我不信。')).toEqual(['你说什么？！', '我不信。']);
  });

  it('texto sem pontuação final vira frase (títulos)', () => {
    expect(textos('第一章 十日终焉')).toEqual(['第一章 十日终焉']);
  });

  it('aspas desbalanceadas: parágrafo vira frase única com aviso', () => {
    const resultado = segmentar('「他说完就走了。没有人追。');
    expect(resultado.frases.map((f) => f.texto_zh)).toEqual(['「他说完就走了。没有人追。']);
    expect(resultado.avisos.length).toBe(1);
  });

  it('pontuação seguida de fechamento pertence à frase (「…」。)', () => {
    expect(textos('他说了「不行」。然后走了。')).toEqual(['他说了「不行」。', '然后走了。']);
  });

  it('parágrafos: frases não atravessam, índice correto, \\r\\n e linhas em branco', () => {
    const entrada = '第一段。还在第一段！\r\n\r\n第二段没有标点\n「第三段。」他说。';
    const { frases } = segmentar(entrada);
    expect(frases).toEqual([
      { texto_zh: '第一段。', paragrafo: 0 },
      { texto_zh: '还在第一段！', paragrafo: 0 },
      { texto_zh: '第二段没有标点', paragrafo: 1 },
      { texto_zh: '「第三段。」他说。', paragrafo: 2 },
    ]);
  });

  it('texto vazio ou só espaços não gera frases', () => {
    expect(textos('')).toEqual([]);
    expect(textos('  \n\n  ')).toEqual([]);
  });

  it('parênteses e títulos de obra protegem pontuação interna', () => {
    expect(textos('他看了《十日终焉。》一眼。')).toEqual(['他看了《十日终焉。》一眼。']);
    expect(textos('（真的吗？）她想。')).toEqual(['（真的吗？）她想。']);
  });
});
