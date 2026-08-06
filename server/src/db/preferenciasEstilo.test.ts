import { describe, expect, it } from 'vitest';
import {
  PREFERENCIAS_PADRAO,
  REGISTROS_PREDEFINIDOS,
  ROTULOS_PREFERENCIAS,
  descreverMudancas,
  normalizarPreferencias,
  preferenciasSaoPadrao,
  renderizarPreferencias,
  type PreferenciasEstilo,
} from '@dao-tale/shared';
import { MARCADOR_DELTA, MARCADOR_PREFERENCIAS, NUCLEO_ENXUTO, comporOmega } from './promptPadraoInicial.js';

const com = (p: Partial<PreferenciasEstilo>): PreferenciasEstilo => ({ ...PREFERENCIAS_PADRAO, ...p });

describe('normalizarPreferencias', () => {
  it('NULL, JSON inválido e objeto vazio caem nos padrões (= comportamento de hoje)', () => {
    for (const bruto of [null, undefined, '', 'não é json', '{}', {}, 42]) {
      expect(normalizarPreferencias(bruto)).toEqual(PREFERENCIAS_PADRAO);
    }
  });

  it('aceita JSON parcial e ignora valor desconhecido, sem nunca deixar chave em branco', () => {
    const p = normalizarPreferencias('{"dialogo":"travessao","onomatopeia":"inventada"}');
    expect(p.dialogo).toBe('travessao');
    expect(p.onomatopeia).toBe('adaptar');
    expect(p.pensamento_marca).toBe('italico');
  });

  it('registro aceita texto livre (público-alvo próprio da obra)', () => {
    expect(normalizarPreferencias({ registro: '  leitores de wuxia clássico  ' }).registro).toBe(
      'leitores de wuxia clássico',
    );
    expect(normalizarPreferencias({ registro: '   ' }).registro).toBe('jovem-adulto');
  });
});

describe('renderizarPreferencias', () => {
  it('é determinística — pré-requisito do prompt caching', () => {
    const p = com({ dialogo: 'travessao' });
    expect(renderizarPreferencias(p)).toBe(renderizarPreferencias({ ...p }));
  });

  // O princípio "default = comportamento de hoje" vale para as convenções
  // (diálogo, pensamento, notas, onomatopeia). O registro é a exceção
  // deliberada: o texto antigo descrevia a CAUDA do público (30–40) como se
  // fosse o alvo, e isso puxava a prosa para um registro mais formal do que o
  // gênero pede. Corrigir um erro de fato não é mudar de comportamento à toa.
  it('o padrão reproduz as regras que o núcleo antigo dava', () => {
    const texto = renderizarPreferencias(PREFERENCIAS_PADRAO);
    expect(texto).toContain('aspas duplas retas');
    expect(texto).toContain('"Não há saída", disse ele.');
    expect(texto).toContain('sempre em *itálico*');
    expect(texto).toContain('sempre no **presente**');
    expect(texto).toContain('Nunca a forma simples');
    expect(texto).toContain('permitidas no formato `((texto))`');
    expect(texto).toContain('adapte para o equivalente sonoro natural do PT-BR');
    expect(texto).toContain('leitor de webnovel');
    expect(preferenciasSaoPadrao(PREFERENCIAS_PADRAO)).toBe(true);
  });

  it('o modo travessão troca o bloco INTEIRO, incluindo as aspas asiáticas', () => {
    const texto = renderizarPreferencias(com({ dialogo: 'travessao' }));
    expect(texto).toContain('— Não há saída — disse ele.');
    expect(texto).toContain('— Não há saída — disse ele —, e você sabe.');
    expect(texto).toContain('— Não há saída. — Ele deu de ombros.');
    // A regra-mestra da maiúscula/minúscula e o mapeamento de 「」 vêm juntos.
    expect(texto).toContain('minúscula depois do travessão = verbo de elocução');
    expect(texto).toContain('「」 que marca fala → travessão');
    // E nada do modo aspas sobra.
    expect(texto).not.toContain('"Não há saída", disse ele.');
  });

  it('pensamento é independente do diálogo: marca e tempo combinam livremente', () => {
    const italicoOriginal = renderizarPreferencias(com({ dialogo: 'travessao', pensamento_tempo: 'original' }));
    expect(italicoOriginal).toContain('sempre em *itálico*');
    expect(italicoOriginal).toContain('mantendo o **tempo verbal do original**');

    const aspas = renderizarPreferencias(com({ pensamento_marca: 'aspas' }));
    expect(aspas).toContain('`"Não há saída", pensou ele.`');
    expect(aspas).not.toContain('*Não há saída*, pensou ele.');
  });

  it('dá ao "evitar" um gatilho do lado do chinês, não só do português', () => {
    // Medido no capítulo 3 da 死人经: frase com marcador de anterioridade no ZH
    // violava a 41% contra 13% nas demais. O passo 1 só dizia "quando um advérbio
    // já marcar", que é julgamento sobre o PT pronto — e falhava justo ali.
    const texto = renderizarPreferencias(com({ mais_que_perfeito: 'evitar' }));
    for (const marcador of ['曾经', '已经', '从来', '向来', '从小', '自幼', '早已']) {
      expect(texto).toContain(marcador);
    }
    expect(texto).toContain('nunca se importou');
  });

  it('as demais chaves invertem o texto que emitem', () => {
    expect(renderizarPreferencias(com({ mais_que_perfeito: 'permitir' }))).toContain('as três formas estão liberadas');
    expect(renderizarPreferencias(com({ notas_tradutor: 'proibir' }))).toContain('**Notas do tradutor:** proibidas');
    expect(renderizarPreferencias(com({ onomatopeia: 'manter' }))).toContain('transliterado em pinyin');
    expect(renderizarPreferencias(com({ registro: 'juvenil' }))).toContain('público juvenil');
    expect(renderizarPreferencias(com({ registro: 'quem gosta de xianxia' }))).toContain(
      'prosa para quem gosta de xianxia.',
    );
  });
});

describe('composição com preferências', () => {
  it('o núcleo enxuto rende as duas seções na ordem 5 → 6, sem marcador sobrando', () => {
    const texto = comporOmega(NUCLEO_ENXUTO, 'Lin Feng fala em gírias.', PREFERENCIAS_PADRAO);
    expect(texto).not.toContain(MARCADOR_PREFERENCIAS);
    expect(texto).not.toContain(MARCADOR_DELTA);
    expect(texto.indexOf('## 5. PREFERÊNCIAS')).toBeGreaterThan(texto.indexOf('## 4. SEM DECALQUE'));
    expect(texto.indexOf('## 6. DIRETRIZES')).toBeGreaterThan(texto.indexOf('## 5. PREFERÊNCIAS'));
    expect(texto).toContain('Lin Feng fala em gírias.');
  });

  it('sem delta, não sobra separador nem seção vazia no fim', () => {
    const texto = comporOmega(NUCLEO_ENXUTO, '', PREFERENCIAS_PADRAO);
    expect(texto).not.toContain('## 6.');
    expect(texto).not.toContain('\n\n\n');
    expect(texto.trimEnd().endsWith('---')).toBe(false);
    expect(texto).toContain('## 5. PREFERÊNCIAS');
  });

  it('preferências ausentes = padrões (chamada antiga de dois argumentos)', () => {
    expect(comporOmega(NUCLEO_ENXUTO, 'x')).toBe(comporOmega(NUCLEO_ENXUTO, 'x', PREFERENCIAS_PADRAO));
  });

  it('núcleo SEM o marcador de preferências ignora as chaves — é o que torna a volta atrás segura', () => {
    const antigo = `# Núcleo antigo\n\nRegras no corpo.\n\n${MARCADOR_DELTA}\n\n## 7. PROIBIÇÕES`;
    const texto = comporOmega(antigo, 'Delta.', com({ dialogo: 'travessao' }));
    expect(texto).not.toContain('## 5. PREFERÊNCIAS');
    expect(texto).not.toContain('travessão');
    expect(texto).toContain('## 6. DIRETRIZES');
  });

  it('trocar uma chave muda os bytes do prompt (é isso que a versão nova registra)', () => {
    const aspas = comporOmega(NUCLEO_ENXUTO, 'd', PREFERENCIAS_PADRAO);
    const travessao = comporOmega(NUCLEO_ENXUTO, 'd', com({ dialogo: 'travessao' }));
    expect(travessao).not.toBe(aspas);
  });
});

// Doc 15 §6. O Alfa declara "o glossário é lei", e os cabeçalhos de Beta e Delta se
// diziam superiores a "todas as seções anteriores" / "as demais" — o que inclui a seção
// do glossário. Não era hipótese: `nomes_proprios: mesclar` manda pessoa "sempre em
// pinyin", e um nome catalogado em forma traduzida punha as duas regras em guerra.
describe('hierarquia: o glossário é lei acima das três camadas', () => {
  it('os cabeçalhos de Beta e Delta se autolimitam', () => {
    const texto = comporOmega(NUCLEO_ENXUTO, 'Lin Feng fala em gírias.', PREFERENCIAS_PADRAO);
    const beta = texto.slice(texto.indexOf('## 5. PREFERÊNCIAS'), texto.indexOf('## 6. DIRETRIZES'));
    const delta = texto.slice(texto.indexOf('## 6. DIRETRIZES'));
    expect(beta).toContain('exceto o glossário, que é lei acima de todas as camadas');
    expect(delta).toContain('exceto o glossário, que é lei acima de todas as camadas');
  });

  // Sem número de seção: a composição aceita Alfas arbitrários, inclusive editados pelo
  // usuário, e nada garante que o glossário seja a Seção 2 neles.
  it('a exceção não cita número de seção', () => {
    const texto = comporOmega(NUCLEO_ENXUTO, 'Delta.', PREFERENCIAS_PADRAO);
    expect(texto).not.toContain('exceto o glossário (Seção');
  });

  it('vale também com o delta vazio — Beta sozinho não pode derrubar o glossário', () => {
    const texto = comporOmega(NUCLEO_ENXUTO, '', PREFERENCIAS_PADRAO);
    expect(texto).toContain('exceto o glossário, que é lei acima de todas as camadas');
  });
});

describe('anterioridade: procedimento em vez de proibição', () => {
  // A redação antiga era negativa ("evite a forma simples") e enterrava a melhor
  // saída no meio da frase. Deu 11,7% de violação no capítulo 2 da 死人经, toda em
  // trecho denso de anterioridade — e converter tudo para "tinha + particípio"
  // empilharia perífrase, produzindo prosa pior que a violação.
  it('põe o perfeito simples em PRIMEIRO, antes da perífrase', () => {
    const texto = renderizarPreferencias(PREFERENCIAS_PADRAO);
    const perfeito = texto.indexOf('Perfeito simples');
    const perifrase = texto.indexOf('"tinha" ou "havia"');
    const proibicao = texto.indexOf('Nunca a forma simples');
    expect(perfeito).toBeGreaterThan(-1);
    expect(perfeito).toBeLessThan(perifrase);
    expect(perifrase).toBeLessThan(proibicao);
  });

  it('oferece os DOIS auxiliares e avisa do empilhamento', () => {
    const texto = renderizarPreferencias(PREFERENCIAS_PADRAO);
    expect(texto).toContain('havia');
    expect(texto).toMatch(/alterne os dois auxiliares/i);
    expect(texto).toMatch(/denso em passado anterior/i);
  });

  it('permitir libera as três formas sem virar vale-tudo', () => {
    const texto = renderizarPreferencias(com({ mais_que_perfeito: 'permitir' }));
    expect(texto).toContain('as três formas estão liberadas');
    expect(texto).toMatch(/sem empilhar/i);
  });
});

describe('registro: o público real de webnovel', () => {
  it('descreve o NÚCLEO da faixa, não o limite superior', () => {
    const texto = renderizarPreferencias(PREFERENCIAS_PADRAO);
    expect(texto).toContain('18 a 25');
    // O texto antigo dizia "até 30–40 anos", tratando a cauda como alvo.
    expect(texto).not.toContain('30–40');
  });

  it('manda preservar termo de gênero e proíbe simplificar', () => {
    const texto = renderizarPreferencias(PREFERENCIAS_PADRAO);
    expect(texto).toContain('jianghu');
    expect(texto).toMatch(/n[ãa]o simplifique/i);
  });

  it('troca "sem gíria datada" por um critério verificável', () => {
    const texto = renderizarPreferencias(PREFERENCIAS_PADRAO);
    expect(texto).not.toContain('gíria datada');
    // Procedimento: só onde o original é gíria; na dúvida, a forma neutra.
    expect(texto).toMatch(/na d[úu]vida.*neutra/i);
  });
});

describe('nomes próprios (sentido vs som)', () => {
  // O critério não é gosto: 中原 é 中(centro)+原(planície) e os caracteres
  // DESCREVEM o lugar; 疏勒 é transcrição fonética de Kashgar e os caracteres
  // foram escolhidos pelo som. "Planícies Centrais" e "Shule" na mesma obra são
  // a mesma regra aplicada duas vezes, não incoerência.
  it('mesclar é o padrão e ensina o eixo com os dois casos', () => {
    expect(PREFERENCIAS_PADRAO.nomes_proprios).toBe('mesclar');
    const texto = renderizarPreferencias(PREFERENCIAS_PADRAO);
    expect(texto).toContain('中原');
    expect(texto).toContain('疏勒');
    expect(texto).toContain('Planícies Centrais');
    expect(texto).toContain('Shule');
  });

  it('mesclar cobre as nuances que o eixo sozinho não resolve', () => {
    const texto = renderizarPreferencias(PREFERENCIAS_PADRAO);
    expect(texto).toContain('Tie Xin'); // pessoa: pinyin mesmo tendo sentido
    expect(texto).toContain('Templo Shaolin'); // híbrido com classificador
    expect(texto).toContain('jianghu'); // termo de gênero consagrado
  });

  it('pessoa fica em pinyin nos três modos — em português não se traduz nome de gente', () => {
    for (const modo of ['mesclar', 'traduzir', 'pinyin'] as const) {
      const texto = renderizarPreferencias(com({ nomes_proprios: modo }));
      expect(texto.toLowerCase()).toMatch(/pessoa|nome de (gente|pessoa)/);
    }
  });

  it('modo pinyin preserva título e cargo traduzidos', () => {
    const texto = renderizarPreferencias(com({ nomes_proprios: 'pinyin' }));
    expect(texto).toContain('Zhongyuan');
    expect(texto).toContain('título e cargo');
  });

  it('modo traduzir não manda inventar sentido em transcrição fonética', () => {
    const texto = renderizarPreferencias(com({ nomes_proprios: 'traduzir' }));
    expect(texto).toContain('Não invente significado');
  });

  it('valor desconhecido cai no padrão, como as outras chaves', () => {
    expect(normalizarPreferencias('{"nomes_proprios":"chute"}').nomes_proprios).toBe('mesclar');
  });
});

describe('descreverMudancas', () => {
  it('resume só o que mudou, para virar nota de versão', () => {
    expect(descreverMudancas(PREFERENCIAS_PADRAO, PREFERENCIAS_PADRAO)).toEqual([]);
    expect(descreverMudancas(PREFERENCIAS_PADRAO, com({ dialogo: 'travessao', onomatopeia: 'manter' }))).toEqual([
      'Diálogo: aspas duplas → travessão',
      'Onomatopeias: adaptar ao PT-BR → manter em pinyin',
    ]);
    expect(descreverMudancas(PREFERENCIAS_PADRAO, com({ registro: 'quem gosta de xianxia' }))).toEqual([
      'Registro / público-alvo: leitor de webnovel (18–25) → quem gosta de xianxia',
    ]);
  });
});

describe('rótulo da tela x texto da regra', () => {
  it('o rótulo do registro descreve o mesmo público que a regra manda ao prompt', () => {
    // O rótulo dizia "jovem adulto (30–40)" enquanto a regra já falava em 18–25:
    // o seletor mentia sobre o que a opção faz. Mesma classe de defeito das
    // contradições prosa-x-exemplo, só que entre interface e comportamento.
    const rotulo = ROTULOS_PREFERENCIAS.registro.opcoes['jovem-adulto'];
    const regra = REGISTROS_PREDEFINIDOS['jovem-adulto'];
    expect(rotulo).toContain('18');
    expect(regra).toContain('18 a 25');
    expect(rotulo).not.toContain('30');
  });

  it('toda opção do registro tem rótulo e texto de regra', () => {
    for (const chave of Object.keys(ROTULOS_PREFERENCIAS.registro.opcoes)) {
      expect(REGISTROS_PREDEFINIDOS[chave], `sem regra para "${chave}"`).toBeTruthy();
    }
  });
});
