import { describe, expect, it } from 'vitest';
import {
  PREFERENCIAS_PADRAO,
  TEMAS,
  preferenciaQueCobre,
  renderizarPreferencias,
  temasNoTexto,
  type PreferenciasEstilo,
} from '@dao-tale/shared';

const com = (o: Partial<PreferenciasEstilo>): PreferenciasEstilo => ({ ...PREFERENCIAS_PADRAO, ...o });

describe('registro de temas', () => {
  it('cobre as 9 chaves de Beta — inclusive as duas que faltavam', () => {
    const deBeta = TEMAS.filter((t) => t.dono === 'beta')
      .map((t) => t.id)
      .sort();
    expect(deBeta).toEqual([
      'capitalizacao_titulos',
      'dialogo',
      'mais_que_perfeito',
      'nomes_proprios',
      'notas_tradutor',
      'onomatopeia',
      'pensamento_marca',
      'pensamento_tempo',
      'registro',
    ]);
  });

  it('todo id de tema de Beta é uma chave real de PreferenciasEstilo', () => {
    for (const t of TEMAS.filter((x) => x.dono === 'beta')) {
      expect(Object.keys(PREFERENCIAS_PADRAO)).toContain(t.id);
    }
  });

  it('cada tema tem um dono só', () => {
    expect(new Set(TEMAS.map((t) => t.id)).size).toBe(TEMAS.length);
  });

  it('acha tema de Beta em texto corrido, com a linha e o trecho junto', () => {
    const achados = temasNoTexto('Nesta obra o diálogo usa travessão, nunca aspas.');
    expect(achados.map((a) => a.tema.id)).toContain('dialogo');
    expect(achados[0].trecho).toContain('travessão');
    expect(achados[0].linha).toBe(1);
  });

  // Um Alfa bem escrito DEVE poder entregar o tema a Beta. Isso é a partição
  // funcionando à vista, não sobreposição.
  it('remissão entre camadas não é sobreposição', () => {
    expect(temasNoTexto('Traduzir ou transliterar é decidido na Seção 5 (Nomes próprios).')).toEqual([]);
  });

  // A ressalva do doc 15 §6 CEDE ao glossário; não decide nada sobre ele. Sem esta
  // isenção o conserto da hierarquia se denunciaria em toda obra.
  it('ressalva a outra camada também não é sobreposição', () => {
    const cabecalho =
      '*(Convenções de casa desta obra. Quando conflitarem com as seções anteriores, valem estas — exceto o glossário, que é lei acima de todas as camadas.)*';
    expect(temasNoTexto(cabecalho)).toEqual([]);
  });

  // Medido contra o NUCLEO_ENXUTO real: com padrões ingênuos estas duas linhas
  // davam falso positivo em `nomes_proprios`, e nenhuma delas decide nada sobre
  // transliteração.
  it('as palavras soltas não bastam: o padrão mira a DECISÃO', () => {
    expect(temasNoTexto('Alterne apenas entre nome próprio, pronome e sujeito oculto.')).toEqual([]);
    expect(temasNoTexto('Nunca deixe a unidade transliterada.')).toEqual([]);
  });

  it('cada variante de Beta acende o seu próprio tema', () => {
    const variantes: [string, Partial<PreferenciasEstilo>][] = [
      ['dialogo', { dialogo: 'travessao' }],
      ['pensamento_marca', { pensamento_marca: 'aspas' }],
      ['pensamento_tempo', { pensamento_tempo: 'original' }],
      ['mais_que_perfeito', { mais_que_perfeito: 'permitir' }],
      ['notas_tradutor', { notas_tradutor: 'proibir' }],
      ['onomatopeia', { onomatopeia: 'manter' }],
      ['nomes_proprios', { nomes_proprios: 'pinyin' }],
      ['capitalizacao_titulos', { capitalizacao_titulos: 'titulos-maiusculos' }],
      ['registro', { registro: 'juvenil' }],
    ];
    for (const [esperado, over] of variantes) {
      const ids = new Set(temasNoTexto(renderizarPreferencias(com(over))).map((a) => a.tema.id));
      expect(ids, `variante ${esperado}`).toContain(esperado);
    }
  });
});

describe('preferenciaQueCobre — o filtro, mais conservador que o aviso', () => {
  it('mantém o que já filtrava', () => {
    expect(preferenciaQueCobre('5-mais-que-perfeito')).toBe('mais_que_perfeito');
    expect(preferenciaQueCobre('5.estilo-mais-que-perfeito')).toBe('mais_que_perfeito');
    expect(preferenciaQueCobre('2-dialogo-aspas')).toBe('dialogo');
    expect(preferenciaQueCobre('5-registro')).toBe('registro');
    expect(preferenciaQueCobre('onomatopeia')).toBe('onomatopeia');
  });

  // A assimetria é deliberada: em obras.ts o filtro DERRUBA candidatos a diretriz
  // em silêncio, e nomes próprios é o caso ambíguo — a política é de Beta, mas o
  // nome específico é do glossário. Filtrar ali descartaria candidato legítimo.
  it('NÃO filtra nomes próprios, mas o AVISO enxerga o tema', () => {
    expect(preferenciaQueCobre('3.2-nomes-proprios')).toBeNull();
    expect(temasNoTexto('Nomes próprios: mantenha em pinyin.').map((a) => a.tema.id)).toContain('nomes_proprios');
  });

  // Mesma assimetria de nomes_proprios, e pelo mesmo motivo: a política (maiúscula
  // sempre ou pela norma) é de Beta, mas se UM termo capitaliza numa frase e não
  // noutra é nota_uso do glossário. Filtrar aqui descartaria candidato legítimo.
  it('NÃO filtra capitalização de títulos, mas o AVISO enxerga o tema', () => {
    expect(preferenciaQueCobre('5-capitalizacao-titulos')).toBeNull();
    expect(preferenciaQueCobre('titulos-maiusculos')).toBeNull();
    expect(
      temasNoTexto('Capitalização de títulos: sempre em maiúscula nesta obra.').map((a) => a.tema.id),
    ).toContain('capitalizacao_titulos');
  });

  it('não filtra tema de Alfa', () => {
    expect(preferenciaQueCobre('1-prosa-nao-legenda')).toBeNull();
    expect(preferenciaQueCobre('4-sem-decalque')).toBeNull();
  });
});
