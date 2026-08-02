import { describe, expect, it } from 'vitest';
import {
  PREFERENCIAS_PADRAO,
  descreverMudancas,
  normalizarPreferencias,
  preferenciasSaoPadrao,
  renderizarPreferencias,
  type PreferenciasEstilo,
} from '@dao-tale/shared';
import { MARCADOR_DELTA, MARCADOR_PREFERENCIAS, NUCLEO_ENXUTO, comporPromptMae } from './promptPadraoInicial.js';

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

  it('o padrão reproduz as regras que o núcleo antigo dava', () => {
    const texto = renderizarPreferencias(PREFERENCIAS_PADRAO);
    expect(texto).toContain('aspas duplas retas');
    expect(texto).toContain('"Não há saída", disse ele.');
    expect(texto).toContain('sempre em *itálico*');
    expect(texto).toContain('sempre no **presente**');
    expect(texto).toContain('evite a forma simples ("fizera")');
    expect(texto).toContain('permitidas no formato `((texto))`');
    expect(texto).toContain('adapte para o equivalente sonoro natural do PT-BR');
    expect(texto).toContain('jovem adulto (até 30–40 anos)');
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

  it('as demais chaves invertem o texto que emitem', () => {
    expect(renderizarPreferencias(com({ mais_que_perfeito: 'permitir' }))).toContain('é permitida quando o ritmo pedir');
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
    const texto = comporPromptMae(NUCLEO_ENXUTO, 'Lin Feng fala em gírias.', PREFERENCIAS_PADRAO);
    expect(texto).not.toContain(MARCADOR_PREFERENCIAS);
    expect(texto).not.toContain(MARCADOR_DELTA);
    expect(texto.indexOf('## 5. PREFERÊNCIAS')).toBeGreaterThan(texto.indexOf('## 4. SEM DECALQUE'));
    expect(texto.indexOf('## 6. DIRETRIZES')).toBeGreaterThan(texto.indexOf('## 5. PREFERÊNCIAS'));
    expect(texto).toContain('Lin Feng fala em gírias.');
  });

  it('sem delta, não sobra separador nem seção vazia no fim', () => {
    const texto = comporPromptMae(NUCLEO_ENXUTO, '', PREFERENCIAS_PADRAO);
    expect(texto).not.toContain('## 6.');
    expect(texto).not.toContain('\n\n\n');
    expect(texto.trimEnd().endsWith('---')).toBe(false);
    expect(texto).toContain('## 5. PREFERÊNCIAS');
  });

  it('preferências ausentes = padrões (chamada antiga de dois argumentos)', () => {
    expect(comporPromptMae(NUCLEO_ENXUTO, 'x')).toBe(comporPromptMae(NUCLEO_ENXUTO, 'x', PREFERENCIAS_PADRAO));
  });

  it('núcleo SEM o marcador de preferências ignora as chaves — é o que torna a volta atrás segura', () => {
    const antigo = `# Núcleo antigo\n\nRegras no corpo.\n\n${MARCADOR_DELTA}\n\n## 7. PROIBIÇÕES`;
    const texto = comporPromptMae(antigo, 'Delta.', com({ dialogo: 'travessao' }));
    expect(texto).not.toContain('## 5. PREFERÊNCIAS');
    expect(texto).not.toContain('travessão');
    expect(texto).toContain('## 6. DIRETRIZES');
  });

  it('trocar uma chave muda os bytes do prompt (é isso que a versão nova registra)', () => {
    const aspas = comporPromptMae(NUCLEO_ENXUTO, 'd', PREFERENCIAS_PADRAO);
    const travessao = comporPromptMae(NUCLEO_ENXUTO, 'd', com({ dialogo: 'travessao' }));
    expect(travessao).not.toBe(aspas);
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
      'Registro / público-alvo: jovem adulto (30–40) → quem gosta de xianxia',
    ]);
  });
});
