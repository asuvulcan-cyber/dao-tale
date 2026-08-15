import { describe, expect, it } from 'vitest';
import { PREFERENCIAS_PADRAO } from '@dao-tale/shared';
import { amostrarEspalhado, classificarEdicoes } from './edicoesManuais.js';

const base = { id: 1, ordem: 0, capitulo_numero: 1, texto_zh: '甲', editado_manualmente: true, origem_edicao: null };
const glossario = [
  { id: 1, obra_id: 1, termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado', categoria: 'lugar', nota: null, principal_id: null, criado_em: '' },
] as never[];

const uma = (ia: string, voce: string, extra: Record<string, unknown> = {}) =>
  classificarEdicoes([{ ...base, texto_pt_original_ia: ia, texto_pt: voce, ...extra }], glossario, PREFERENCIAS_PADRAO);

describe('classificarEdicoes', () => {
  it('aspas curvas viram tipografia', () => {
    expect(uma('ele disse ‘vá’ agora', "ele disse 'vá' agora")[0].rota).toBe('tipografia');
  });

  it('aspas CJK externas (「」) viram tipografia, não diretriz', () => {
    // Achado da revisão final: a função nasceu sem cobrir 「」『』, e `analisarEstilo`
    // trata as duas famílias (CJK e curvas) como a MESMA regra `aspas-nao-retas` —
    // deixar essa edição cair em `diretriz` violaria a proibição do refinador de
    // propor regra sobre aspas.
    expect(uma('「vamos embora」, disse ela', '"vamos embora", disse ela')[0].rota).toBe('tipografia');
  });

  it('aspas CJK internas/aninhadas (『』) viram tipografia', () => {
    expect(uma('ele citou 『o caminho』 outra vez', "ele citou 'o caminho' outra vez")[0].rota).toBe(
      'tipografia',
    );
  });

  it('marcas de título CJK (《》 e 〈〉) viram tipografia', () => {
    expect(uma('leu 《o clássico》 de novo', 'leu "o clássico" de novo')[0].rota).toBe('tipografia');
    expect(uma('citou 〈o capítulo〉 de novo', "citou 'o capítulo' de novo")[0].rota).toBe('tipografia');
  });

  it('termo do glossário fora da forma canônica vai para glossário', () => {
    const r = uma('a Fortaleza Jinpeng caiu', 'a Fortaleza do Peng Dourado caiu');
    expect(r[0].rota).toBe('glossario');
    expect(r[0].detalhe).toBe('Fortaleza do Peng Dourado');
  });

  it('mais-que-perfeito desfeito vai para chave de estilo', () => {
    const r = uma('concluindo que ele errara', 'concluindo que ele errou');
    expect(r[0].rota).toBe('chave-estilo');
  });

  it('decalque desfeito vai para núcleo', () => {
    const r = uma('a outra parte recuou', 'o inimigo recuou');
    expect(r[0].rota).toBe('nucleo');
  });

  it('demonstrativo desfeito (teste da deleção) vai para núcleo', () => {
    // Mesmo achado do decalque: `temasNoTexto` não casa "aquele" isolado (mira o
    // rótulo da regra, não a prosa) — `metricasEstilo.demonstrativos`, que o
    // portão A/B do núcleo já usa, resolve pelo mesmo caminho.
    const r = uma('aquele homem sorriu', 'o homem sorriu');
    expect(r[0].rota).toBe('nucleo');
    expect(r[0].detalhe).toBe('demonstrativos');
  });

  it('troca vocabular sem tema vira candidato a diretriz', () => {
    const r = uma('ele já é um morto', 'ele já é um cadáver');
    expect(r[0].rota).toBe('diretriz');
    expect(r[0]).toMatchObject({ de: 'morto', para: 'cadáver' });
  });

  it('CRÍTICO (achado da revisão): troca vocabular que também conserta aspas na mesma frase continua diretriz', () => {
    // "morto" -> "cadáver" é o mesmo caso de diretriz acima, mas com aspas
    // curvas na frase inteira também corrigidas para retas no mesmo golpe.
    // A violação de aspas-nao-retas REALMENTE some entre `ia` e `voce` — mas
    // ela é mecânica (qual caractere foi digitado), não uma decisão de chave,
    // e por isso fica fora de `TEMA_DA_REGRA_ESTILO`. Sem essa exclusão, o
    // scanner reivindicava a frase inteira para chave-estilo e o sinal de
    // diretriz — o que mais importa aprender aqui — desaparecia do relatório.
    const r = uma('“ele já é um morto”, disse ela', '"ele já é um cadáver", disse ela');
    expect(r[0].rota).toBe('diretriz');
  });

  it('as preferências da obra são as usadas pelo scanner, não um padrão fixo', () => {
    // Com `mais_que_perfeito: 'permitir'`, a própria obra autoriza "errara" —
    // `analisarEstilo` nem verifica a regra (`if (prefs.mais_que_perfeito ===
    // 'evitar')`), então não há violação para sumir e a edição cai em
    // diretriz. Um `PREFERENCIAS_PADRAO` fixo (que é 'evitar') erraria isto.
    const prefsPermitem = { ...PREFERENCIAS_PADRAO, mais_que_perfeito: 'permitir' as const };
    const r = classificarEdicoes(
      [{ ...base, texto_pt_original_ia: 'concluindo que ele errara', texto_pt: 'concluindo que ele errou' }],
      glossario,
      prefsPermitem,
    );
    expect(r[0].rota).toBe('diretriz');
  });

  it('glossário vence tema quando os dois casariam (caso original, não provativo por si)', () => {
    // "Fortaleza Jinpeng -> Fortaleza do Peng Dourado" casaria o tema `glossario`
    // por conter a palavra; o que interessa é QUAL termo, não que é glossário.
    // NOTA (achado da revisão): este caso sozinho não PROVA a ordem — o padrão
    // do tema `glossario` (`/gloss[áa]rio|termos? novos?/i`) nunca casa este
    // texto, então invertendo glossário e tema no código este teste continua
    // verde. O teste seguinte cria um conflito real.
    expect(uma('a Fortaleza Jinpeng caiu', 'a Fortaleza do Peng Dourado caiu')[0].detalhe).not.toBeNull();
  });

  it('glossário vence tema — conflito real: o termo do glossário contém a palavra-gatilho de um tema', () => {
    // "Registro Celestial" é um termo de glossário cujo PT contém "registro" —
    // a própria palavra-gatilho do tema `registro` (\bregistro\b). Se a ordem
    // fosse tema-antes-de-glossário, esta edição cairia em chave-estilo com
    // detalhe 'registro', não em glossário com o termo. Provado por mutação no
    // relatório da rodada de correção.
    const glossarioComConflito = [
      { id: 2, obra_id: 1, termo_zh: '天鉴', termo_pt: 'Registro Celestial', categoria: 'objeto', nota: null, principal_id: null, criado_em: '' },
    ] as never[];
    const r = classificarEdicoes(
      [{ ...base, texto_pt_original_ia: 'o Livro Celestial brilhou', texto_pt: 'o Registro Celestial brilhou' }],
      glossarioComConflito,
      PREFERENCIAS_PADRAO,
    );
    expect(r[0].rota).toBe('glossario');
    expect(r[0].detalhe).toBe('Registro Celestial');
  });

  // Achado da revisão final, provado por execução: uma frase com `一直` em que o
  // revisor trocou "sempre" por "até então" saía como `diretriz` — e `diretriz` é
  // exatamente o que `obras.ts` manda para a chamada PAGA de refinamento, que
  // propõe regra de texto para o prompt. O app detectava `一直→sempre` de graça
  // pelo catálogo e, pelo outro canal, pagava para pedir uma diretriz sobre 一直:
  // a porta que o spec §9 fecha e que a medição de 2026-08-05 mostrou sem efeito.
  describe('o que o catálogo já detecta não vira texto de prompt', () => {
    const comZh = (zh: string, ia: string, voce: string) =>
      classificarEdicoes(
        [{ ...base, texto_zh: zh, texto_pt_original_ia: ia, texto_pt: voce }],
        glossario,
        PREFERENCIAS_PADRAO,
      );

    it('o conserto de 一直 → sempre vira catalogo, não diretriz', () => {
      const r = comZh('他一直在等。', 'Ele sempre esteve esperando.', 'Ele vinha esperando até então.');
      expect(r[0].rota).toBe('catalogo');
      expect(r[0].detalhe).toBe('particula-yizhi');
    });

    it('é bilíngue: sem o gatilho no chinês, não é rota do catálogo', () => {
      // Mesmo par em português, outro original. Sem consultar o zh, esta frase
      // seria classificada igual à de cima — e o catálogo não teria como acusá-la.
      expect(comZh('他总在等。', 'Ele sempre esteve esperando.', 'Ele vinha esperando até então.')[0].rota).not.toBe(
        'catalogo',
      );
    });

    it('não é rota do catálogo se o reflexo continua lá depois da edição', () => {
      // O revisor mexeu na frase mas não desfez o "sempre": não há lição de
      // catálogo aqui, e roubar esta edição do canal certo seria pior que nada.
      expect(comZh('他一直在等。', 'Ele sempre esteve esperando.', 'Ele sempre ficou esperando.')[0].rota).not.toBe(
        'catalogo',
      );
    });

    it('o catálogo vence o scanner de estilo quando a mesma edição faz as duas coisas', () => {
      // Consertar 一直 e desfazer um mais-que-perfeito na mesma frase. Sem esta
      // ordem a edição cairia numa rota de camada, e a tela de edições manuais
      // mandaria o revisor mexer no prompt por causa de uma partícula — que é a
      // recomendação que o spec §9 proíbe.
      const r = comZh(
        '他一直在等，早已知道。',
        'Ele sempre esteve esperando, pois já soubera.',
        'Ele vinha esperando até então, pois já sabia.',
      );
      expect(r[0].rota).toBe('catalogo');
    });

    it('a rota do catálogo fica fora do refinamento pago', () => {
      // `obras.ts` filtra por `rota === 'diretriz'`; este teste é o que garante
      // que a rota nova não passa a ser incluída por engano numa mudança futura.
      const r = comZh('他一直在等。', 'Ele sempre esteve esperando.', 'Ele vinha esperando até então.');
      expect(r.filter((e) => e.rota === 'diretriz')).toHaveLength(0);
    });
  });

  // O canal do banco de testes já consumia sozinho (recorrencias filtra por
  // status); o das edições manuais nasceu sem equivalente e as mesmas candidatas
  // voltavam para sempre — 87 na obra real, contra amostra de 15 por chamada
  // paga.
  describe('edição já tratada num refinamento aceito', () => {
    it('sai da lista', () => {
      expect(uma('ele errara', 'ele errou', { edicao_tratada_texto: 'ele errou' })).toHaveLength(0);
    });

    it('volta a ser candidata quando o revisor reescreve a frase', () => {
      // A marca vale para AQUELE texto. Reescrever é lição nova sobre a mesma
      // frase, e um sinalizador booleano a silenciaria para sempre.
      const r = uma('ele errara', 'ele tinha se enganado', { edicao_tratada_texto: 'ele errou' });
      expect(r).toHaveLength(1);
    });

    it('marca nula não esconde nada — é o estado de toda frase existente', () => {
      expect(uma('ele errara', 'ele errou', { edicao_tratada_texto: null })).toHaveLength(1);
    });

    it('campo ausente também não esconde — chamadores antigos seguem valendo', () => {
      expect(uma('ele errara', 'ele errou')).toHaveLength(1);
    });
  });

  it('edição vinda de botão não entra', () => {
    expect(uma('ele errara', 'ele errou', { origem_edicao: 'revisao' })).toHaveLength(0);
    expect(uma('ele errara', 'ele errou', { origem_edicao: 'passe-estilo' })).toHaveLength(0);
  });

  it('frase sem edição ou sem original não entra', () => {
    expect(uma('igual', 'igual')).toHaveLength(0);
    expect(
      classificarEdicoes([{ ...base, texto_pt_original_ia: null, texto_pt: 'x' }], glossario, PREFERENCIAS_PADRAO),
    ).toHaveLength(0);
  });
});

describe('amostrarEspalhado', () => {
  it('lista de 100 devolve 15 cobrindo começo, meio e fim', () => {
    const lista = Array.from({ length: 100 }, (_, i) => i);
    const amostra = amostrarEspalhado(lista, 15);
    expect(amostra).toHaveLength(15);
    // Cobre as duas pontas — um recorte contíguo do fim (o bug corrigido) nunca
    // incluiria o índice 0.
    expect(amostra[0]).toBe(0);
    expect(amostra[amostra.length - 1]).toBe(99);
    // Espalhada pelo meio, não um bloco contíguo: o maior salto entre vizinhos
    // não pode ser muito maior que o passo médio (100/15 ≈ 6,7).
    const saltos = amostra.slice(1).map((v, i) => v - amostra[i]);
    expect(Math.max(...saltos)).toBeLessThanOrEqual(8);
    // Ordem original preservada (crescente).
    expect([...amostra].sort((a, b) => a - b)).toEqual(amostra);
  });

  it('lista de 10 (≤ o teto) devolve as 10 na ordem original', () => {
    const lista = Array.from({ length: 10 }, (_, i) => i);
    expect(amostrarEspalhado(lista, 15)).toEqual(lista);
  });

  it('lista vazia devolve vazia', () => {
    expect(amostrarEspalhado([], 15)).toEqual([]);
  });

  it('teto 0 ou negativo devolve vazia mesmo com lista não vazia', () => {
    expect(amostrarEspalhado([1, 2, 3], 0)).toEqual([]);
  });
});
