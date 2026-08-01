import { describe, expect, it } from 'vitest';
import { crc32, montarZip } from './zip.js';
import { lerZip } from './leitorZip.js';

// O escritor de ZIP é feito à mão (doc 12 §2), então cada teste RELÊ o arquivo
// com o leitor inverso (leitorZip.ts): diretório central → inflate → CRC.

describe('montarZip', () => {
  it('preserva ordem, nomes e conteúdo de entradas comprimidas e cruas', () => {
    const texto = 'linha de texto repetida '.repeat(50);
    const zip = montarZip([
      { nome: 'mimetype', dados: 'application/epub+zip', comprimir: false },
      { nome: 'OEBPS/a.xhtml', dados: texto },
      { nome: 'OEBPS/imagem.bin', dados: Buffer.from([0, 1, 2, 253, 254, 255]), comprimir: false },
    ]);

    const entradas = lerZip(zip);
    expect(entradas.map((e) => e.nome)).toEqual(['mimetype', 'OEBPS/a.xhtml', 'OEBPS/imagem.bin']);
    expect(entradas[1]!.conteudo.toString('utf8')).toBe(texto);
    expect(entradas[1]!.metodo).toBe(8); // texto repetitivo comprime
    expect([...entradas[2]!.conteudo]).toEqual([0, 1, 2, 253, 254, 255]);
    expect(entradas[2]!.metodo).toBe(0);
  });

  it('põe a primeira entrada sem compressão no offset que o OCF exige', () => {
    const zip = montarZip([{ nome: 'mimetype', dados: 'application/epub+zip', comprimir: false }]);
    // Regra do OCF: cabeçalho local (30) + nome "mimetype" (8) → o media type
    // fica literalmente nos 20 bytes a partir do offset 38.
    expect(zip.subarray(30, 38).toString('ascii')).toBe('mimetype');
    expect(zip.subarray(38, 58).toString('ascii')).toBe('application/epub+zip');
    const [entrada] = lerZip(zip);
    expect(entrada!.offsetLocal).toBe(0);
    expect(entrada!.metodo).toBe(0);
  });

  it('volta para STORED quando o deflate engordaria a entrada', () => {
    // Sequência sem repetição: o deflate sai maior que o cru.
    const ruido = Buffer.from(Array.from({ length: 256 }, (_, i) => (i * 37 + 11) % 256));
    const [entrada] = lerZip(montarZip([{ nome: 'ruido.bin', dados: ruido }]));
    expect(entrada!.metodo).toBe(0);
    expect(entrada!.conteudo.equals(ruido)).toBe(true);
  });

  it('escreve texto UTF-8 sem corromper acentos e chinês', () => {
    const conteudo = 'Capítulo 118 — 十日终焉 «prova»';
    const [entrada] = lerZip(montarZip([{ nome: 'a.txt', dados: conteudo }]));
    expect(entrada!.conteudo.toString('utf8')).toBe(conteudo);
  });

  it('é determinístico: mesmas entradas, bytes iguais', () => {
    const entradas = [{ nome: 'a.txt', dados: 'igual' }];
    expect(montarZip(entradas).equals(montarZip(entradas))).toBe(true);
  });

  it('recusa nome de entrada não-ASCII (exigiria a flag de UTF-8)', () => {
    expect(() => montarZip([{ nome: 'capítulo.xhtml', dados: 'x' }])).toThrow(/ASCII/);
  });

  it('crc32 bate com o vetor de referência', () => {
    // Vetor clássico: CRC-32 de "123456789" = 0xCBF43926.
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });
});
