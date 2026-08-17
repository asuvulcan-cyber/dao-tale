import { describe, expect, it } from 'vitest';
import { capturaDaSelecao } from './captura';

describe('capturaDaSelecao', () => {
  it('aparo normal vira captura com o texto aparado', () => {
    expect(capturaDaSelecao('zh', '  金鹏堡  ')).toEqual({ lado: 'zh', trecho: '金鹏堡' });
    expect(capturaDaSelecao('pt', ' Fortaleza do Peng Dourado ')).toEqual({
      lado: 'pt',
      trecho: 'Fortaleza do Peng Dourado',
    });
  });

  it('seleção vazia dá null', () => {
    expect(capturaDaSelecao('zh', '')).toBeNull();
  });

  it('seleção só de espaço dá null', () => {
    expect(capturaDaSelecao('pt', '   ')).toBeNull();
    expect(capturaDaSelecao('pt', '\n\t ')).toBeNull();
  });

  // O teto é escrito aqui como número literal (não importado de uma constante
  // do módulo): se a implementação mudar o teto sem querer, um import
  // compartilhado mudaria dos dois lados e o teste continuaria mudo.
  it('trecho no teto (60 caracteres) ainda vira captura', () => {
    const trecho = 'a'.repeat(60);
    expect(capturaDaSelecao('pt', trecho)).toEqual({ lado: 'pt', trecho });
  });

  it('trecho acima do teto (61 caracteres) dá null — a frase inteira selecionada sem querer', () => {
    expect(capturaDaSelecao('pt', 'a'.repeat(61))).toBeNull();
  });

  it('teto conta o trecho aparado, não o bruto com espaços ao redor', () => {
    // 60 caracteres úteis cercados de espaço: apara para 60 e passa; sem o
    // aparo-antes-de-medir isto falharia por 2 caracteres de espaço que não
    // fazem parte do termo.
    const util = 'a'.repeat(60);
    expect(capturaDaSelecao('zh', ` ${util} `)).toEqual({ lado: 'zh', trecho: util });
  });
});
