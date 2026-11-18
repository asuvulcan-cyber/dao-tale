import { describe, it, expect } from 'vitest';
import { segmentarEn } from './segmentarEn.js';

const textos = (entrada: string) => segmentarEn(entrada).frases.map((f) => f.texto_zh);

// Espelha a bateria de segmentar.test.ts (mandarim), caso a caso, mais os casos
// que só o ponto ambíguo do inglês produz.
describe('segmentarEn — espelho da bateria do mandarim', () => {
  it('pontuação forte encerra frases', () => {
    expect(textos('He spoke. She left!')).toEqual(['He spoke.', 'She left!']);
  });

  it('diálogo com pontuação interna não é quebrado', () => {
    expect(textos('"Hello. How are you?" he asked.')).toEqual(['"Hello. How are you?" he asked.']);
  });

  it('duas falas com narração viram duas frases', () => {
    expect(textos('"Wait!" she shouted. "Don\'t go."')).toEqual(['"Wait!" she shouted.', '"Don\'t go."']);
  });

  it('aninhamento de aspas é uma frase só', () => {
    expect(textos('He thought: "the man said ‘no’." Then he left.')).toEqual([
      'He thought: "the man said ‘no’."',
      'Then he left.',
    ]);
  });

  it('sequência ?! encerra no fim da sequência', () => {
    expect(textos('What did you say?! I do not believe it.')).toEqual([
      'What did you say?!',
      'I do not believe it.',
    ]);
  });

  it('texto sem pontuação final vira frase (títulos)', () => {
    expect(textos('Chapter One The Bronze Tower')).toEqual(['Chapter One The Bronze Tower']);
  });

  it('pontuação seguida de fechamento pertence à frase', () => {
    expect(textos('He said "no." Then he walked away.')).toEqual(['He said "no."', 'Then he walked away.']);
  });

  it('aspas desbalanceadas: parágrafo vira frase única com aviso', () => {
    const resultado = segmentarEn('"He finished and left. Nobody followed.');
    expect(resultado.frases.map((f) => f.texto_zh)).toEqual(['"He finished and left. Nobody followed.']);
    expect(resultado.avisos.length).toBe(1);
  });

  it('parágrafos: frases não atravessam, índice correto, \\r\\n e linhas em branco', () => {
    const entrada = 'First one. Still first!\r\n\r\nSecond with no period\n"Third." he said.';
    expect(segmentarEn(entrada).frases).toEqual([
      { texto_zh: 'First one.', paragrafo: 0 },
      { texto_zh: 'Still first!', paragrafo: 0 },
      { texto_zh: 'Second with no period', paragrafo: 1 },
      { texto_zh: '"Third." he said.', paragrafo: 2 },
    ]);
  });
});

describe('segmentarEn — o ponto ambíguo', () => {
  it('abreviação conhecida não encerra frase', () => {
    expect(textos('Mr. Chen bowed to Dr. Li.')).toEqual(['Mr. Chen bowed to Dr. Li.']);
  });

  it('iniciais de nome não encerram frase', () => {
    expect(textos('J. R. R. Tolkien wrote it.')).toEqual(['J. R. R. Tolkien wrote it.']);
  });

  it('i.e. e e.g. não encerram frase', () => {
    expect(textos('The sect, i.e. the Golden Peng, refused. He left.')).toEqual([
      'The sect, i.e. the Golden Peng, refused.',
      'He left.',
    ]);
  });

  it('abreviação desconhecida seguida de minúscula não encerra frase', () => {
    expect(textos('It was approx. five miles away.')).toEqual(['It was approx. five miles away.']);
  });

  it('reticências seguidas de minúscula continuam a frase', () => {
    expect(textos('He paused... then spoke.')).toEqual(['He paused... then spoke.']);
  });

  it('reticências seguidas de maiúscula encerram', () => {
    expect(textos('He fell silent... Then he spoke.')).toEqual(['He fell silent...', 'Then he spoke.']);
  });

  it('apóstrofe de contração e de posse não delimita região', () => {
    expect(textos("Don't go. It's John's blade.")).toEqual(["Don't go.", "It's John's blade."]);
  });

  it('exclamação seguida de minúscula ainda encerra', () => {
    expect(textos('Run! he shouted.')).toEqual(['Run!', 'he shouted.']);
  });
});
