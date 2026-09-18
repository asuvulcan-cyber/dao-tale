import { describe, expect, it } from 'vitest';
import { detectarSinaisBilingues } from './sinaisBilingues.js';

const casos = [
  ['origem-funcionarios', '他是官宦之后。', 'Era de linhagem nobre.', 'Era descendente de funcionários.'],
  ['possessao-causa-morte', '中邪的遥奴死了。', 'Sucumbiu à possessão demoníaca.', 'Yao Nu, que estava possuído, morreu.'],
  ['assassinato-tentativa', '他们搞暗杀。', 'Eles tentaram um assassinato.', 'Eles cometeram um assassinato.'],
  ['frequencia-intensificada', '他频繁洗手。', 'Lavava as mãos a todo instante.', 'Lavava as mãos com frequência.'],
  ['diferenca-intensificada', '他成了另类。', 'Virou uma aberração.', 'Era alguém diferente.'],
  ['medo-registro', '他们有一丝畏惧。', 'Demonstravam um lampejo de temor.', 'Demonstravam um pouco de medo.'],
  ['impulso-imagem', '心里有一种冲动。', 'Um impulso tomou-lhe o peito.', 'Teve vontade de sair.'],
  ['acao-chicote', '开始执行鞭刑。', 'Deram início aos chicotes.', 'Começaram a chicotear.'],
];
describe('sinais bilíngues de calibração', () => {
  it.each(casos)('exige as duas evidências para %s', (id, zh, pt, bom) => {
    expect(detectarSinaisBilingues(zh, pt).map(s=>s.id)).toContain(id);
    expect(detectarSinaisBilingues('甲', pt)).toEqual([]);
    expect(detectarSinaisBilingues(zh, bom)).toEqual([]);
    // Sem regex global: repetir a chamada não alterna o resultado.
    expect(detectarSinaisBilingues(zh, pt).map(s=>s.id)).toContain(id);
  });
  it('não proíbe tentativa quando o chinês também descreve uma tentativa', () => {
    expect(detectarSinaisBilingues('试图暗杀', 'Tentaram um assassinato.')).toEqual([]);
  });
});
