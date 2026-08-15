import { describe, expect, it } from 'vitest';
import { CATALOGO, REPROVADAS, precisaoAferida, type EntradaCatalogo } from '@dao-tale/shared';
import { aferirCatalogo, varrerCatalogo } from './catalogoZhPt.js';

const frase = (over: Partial<Parameters<typeof varrerCatalogo>[0][number]>) => ({
  id: 1,
  ordem: 0,
  texto_zh: '',
  texto_pt: '',
  status_traducao: 'traduzida',
  ...over,
});

describe('varrerCatalogo', () => {
  it('acusa quando o gatilho está no zh E o reflexo está no pt', () => {
    const r = varrerCatalogo([
      frase({ id: 7, ordem: 3, texto_zh: '他一直在等。', texto_pt: 'Ele sempre esteve esperando.' }),
    ]);
    expect(r.violacoes).toHaveLength(1);
    expect(r.violacoes[0]).toMatchObject({ frase_id: 7, ordem: 3, entrada_id: 'particula-yizhi', gatilho_zh: '一直' });
    expect(r.violacoes[0].trecho_pt).toContain('sempre');
  });

  it('não acusa sem o gatilho no chinês — é o que a torna bilíngue', () => {
    const r = varrerCatalogo([frase({ texto_zh: '他总在等。', texto_pt: 'Ele sempre esteve esperando.' })]);
    expect(r.violacoes).toEqual([]);
  });

  it('não acusa quando o português já está certo', () => {
    const r = varrerCatalogo([frase({ texto_zh: '他一直在等。', texto_pt: 'Ele vinha esperando até então.' })]);
    expect(r.violacoes).toEqual([]);
  });

  it('só examina frase traduzida', () => {
    const r = varrerCatalogo([
      frase({ texto_zh: '他一直在等。', texto_pt: 'Ele sempre esteve esperando.', status_traducao: 'pendente' }),
    ]);
    expect(r.violacoes).toEqual([]);
    expect(r.frases_examinadas).toBe(0);
  });

  it('respeita a dispensa por trinca (frase, regra, trecho)', () => {
    const frases = [frase({ id: 7, texto_zh: '他一直在等。', texto_pt: 'Ele sempre esteve esperando.' })];
    const trecho = varrerCatalogo(frases).violacoes[0].trecho_pt;
    const r = varrerCatalogo(frases, new Set([`7|particula-yizhi|${trecho}`]));
    expect(r.violacoes).toEqual([]);
  });

  it('não usa as reprovadas', () => {
    // 都 → "todos" acusaria 31 vezes na obra real e nenhuma foi correção.
    const r = varrerCatalogo([frase({ texto_zh: '他们都来了。', texto_pt: 'Todos eles vieram.' })]);
    expect(r.violacoes).toEqual([]);
  });

  it('aceita entradas explícitas — é como a aferição mede as reprovadas', () => {
    const dou = REPROVADAS.find((e) => e.id === 'particula-dou') as EntradaCatalogo;
    const r = varrerCatalogo([frase({ texto_zh: '他们都来了。', texto_pt: 'Todos eles vieram.' })], new Set(), [dou]);
    expect(r.violacoes).toHaveLength(1);
    expect(r.violacoes[0].entrada_id).toBe('particula-dou');
  });

  it('o trecho é estável entre duas varreduras do mesmo texto', () => {
    const frases = [frase({ texto_zh: '他一直在等。', texto_pt: 'Ele sempre esteve esperando ali.' })];
    expect(varrerCatalogo(frases).violacoes[0].trecho_pt).toBe(varrerCatalogo(frases).violacoes[0].trecho_pt);
  });

  it('o trecho corta na quebra de linha quando ela está dentro da janela de contexto', () => {
    // A quebra vem logo depois do match — dentro da janela de 40 de contexto —
    // para o teste de fato exercitar o corte por `\n` e não passar por
    // construção (a janela do teste anterior deixava a quebra fora do alcance).
    const r = varrerCatalogo([frase({ texto_zh: '他一直在等。', texto_pt: 'Ele sempre\nesteve esperando.' })]);
    expect(r.violacoes[0].trecho_pt).toBe('sempre');
  });

  it('o trecho respeita o teto de 60 caracteres mesmo com um match longo', () => {
    // Entrada sintética com `evitar_pt` que casa um trecho comprido — o piso de
    // 60 só decorre de CONTEXTO=40 mais um match curto; sem TRECHO_MAX explícito
    // esta entrada furaria o teto sem nada acusar.
    const dou = REPROVADAS.find((e) => e.id === 'particula-dou') as EntradaCatalogo;
    const matchLongo = { ...dou, id: 'sintetica-match-longo', gatilho_zh: '一直', evitar_pt: /sempre[^.]*/i };
    const pt = `Ele sempre ${'x'.repeat(100)}.`;
    const r = varrerCatalogo([frase({ texto_zh: '他一直在等。', texto_pt: pt })], new Set(), [matchLongo]);
    expect(r.violacoes[0].trecho_pt.length).toBe(60);
  });

  it('uma frase que dispara duas entradas gera duas violações', () => {
    const dou = REPROVADAS.find((e) => e.id === 'particula-dou') as EntradaCatalogo;
    const yizhi = { ...dou, id: 'particula-yizhi', gatilho_zh: '一直', evitar_pt: /\bsempre\b/i };
    const r = varrerCatalogo(
      [frase({ texto_zh: '他们一直都来。', texto_pt: 'Todos eles sempre vêm.' })],
      new Set(),
      [dou, yizhi],
    );
    expect(r.violacoes.map((v) => v.entrada_id).sort()).toEqual(['particula-dou', 'particula-yizhi']);
    // Uma frase, duas violações — mas `frases_examinadas` conta frases.
    expect(r.frases_examinadas).toBe(1);
  });
});

describe('aferirCatalogo', () => {
  // Sintética e DIFERENTE da única entrada real de CATALOGO (id, gatilho_zh e
  // evitar_pt não coincidem com 'particula-yizhi'). Se `aferirCatalogo` alguma
  // hora passar a ignorar o parâmetro `entradas` e usar CATALOGO por dentro,
  // nada aqui bate com '甲甲'/'xyzzy' e a contagem muda — com uma entrada
  // sintética igual à real (mesmo id, mesmo gatilho, mesmo padrão) essa troca
  // fica indistinguível e nenhum teste acusa.
  const entrada = {
    id: 'teste-sintetico',
    titulo: 't',
    gatilho_zh: '甲甲',
    evitar_pt: /\bxyzzy\b/i,
    certo: 'c',
    aferido: { obra_id: 0, acusadas: 0, corrigidas: 0, em: '2026-01-01' },
  };

  /** `origem_edicao: null` é o caso que a aferição sabe ler — texto digitado
   *  pelo revisor. Quem testa o conserto vindo de botão passa a origem. */
  const af = (
    texto_zh: string,
    texto_pt_original_ia: string | null,
    texto_pt: string,
    origem_edicao: string | null = null,
  ) => ({ texto_zh, texto_pt_original_ia, texto_pt, origem_edicao });

  it('mede a precisão por frase, não por subtração de agregados', () => {
    const frases = [
      // 3 acusadas na IA e consertadas pelo revisor
      ...[1, 2, 3].map(() => af('甲甲', 'xyzzy', 'outra coisa')),
      // 1 acusada na IA e mantida
      af('甲甲', 'xyzzy', 'xyzzy'),
    ];
    const [linha] = aferirCatalogo(frases, [entrada]);
    expect(linha).toMatchObject({ acusadas: 4, corrigidas: 3, restantes: 1, novas: 0, assistidas: 0 });
    expect(linha.precisao).toBeCloseTo(0.75);
  });

  it('conta separadamente a violação que APARECEU na revisão', () => {
    // A subtração de agregados esconderia este caso: uma some, outra nasce, e o
    // total não muda. É por isso que a conta é por frase.
    const frases = [af('甲甲', 'xyzzy', 'outra coisa'), af('甲甲', 'outra coisa', 'xyzzy')];
    const [linha] = aferirCatalogo(frases, [entrada]);
    expect(linha).toMatchObject({ acusadas: 1, corrigidas: 1, novas: 1 });
    // `novas` não entra no denominador — a precisão é sobre `acusadas` (1), não
    // sobre o total de frases (2). Sem esta linha, um denominador errado
    // (frases.length em vez de acusadas) passa por construção neste caso.
    expect(linha.precisao).toBeCloseTo(1);
  });

  it('ignora frase sem texto original da IA — não há o que comparar', () => {
    const [linha] = aferirCatalogo([af('甲甲', null, 'xyzzy')], [entrada]);
    expect(linha).toMatchObject({ acusadas: 0, corrigidas: 0, novas: 0, precisao: 0 });
  });

  it('não acusa quando o reflexo está no pt mas o gatilho não está no zh', () => {
    // A checagem bilíngue: `texto_pt_original_ia` tem o reflexo, mas o zh não
    // tem o gatilho. Sem o `includes(gatilho_zh)` dentro de `aferirCatalogo`,
    // esta frase entraria como acusada — e a aferição deixaria de ser bilíngue,
    // a mesma propriedade que distingue `varrerCatalogo` de `analisarEstilo`.
    const [linha] = aferirCatalogo([af('nada a ver aqui', 'xyzzy', 'xyzzy')], [entrada]);
    expect(linha).toMatchObject({ acusadas: 0, restantes: 0, corrigidas: 0, novas: 0, precisao: 0 });
  });

  it('a aferição confirma os números gravados no catálogo em produção', () => {
    // Guarda contra o `aferido` virar folclore: reproduz a conta com um corpus
    // sintético do tamanho declarado. Tudo com `origem_edicao: null` porque as
    // 561 frases da obra 1 são anteriores ao passe de estilo existir — o número
    // gravado no `aferido` é de correção digitada, e assim continua sendo lido.
    const alvo = CATALOGO[0];
    const frases = [
      ...Array.from({ length: alvo.aferido.corrigidas }, () => af(alvo.gatilho_zh, 'sempre', 'até então')),
      ...Array.from({ length: alvo.aferido.acusadas - alvo.aferido.corrigidas }, () =>
        af(alvo.gatilho_zh, 'sempre', 'sempre'),
      ),
    ];
    const [linha] = aferirCatalogo(frases, [alvo]);
    expect(linha.precisao).toBeCloseTo(precisaoAferida(alvo.aferido));
    expect(linha.assistidas).toBe(0);
  });

  // O defeito que a revisão final provou por execução: `editarTexto(...,
  // 'passe-estilo')` muda `texto_pt` e PRESERVA `texto_pt_original_ia`, então o
  // conserto que o próprio app propôs voltava como numerador da precisão do
  // próprio catálogo — a mesma obra saía de {acusadas 4, corrigidas 3} para
  // {acusadas 4, corrigidas 4} depois de um passe, sem ninguém mudar de ideia.
  describe('frase consertada por botão do app fica FORA da medição', () => {
    it('o conserto do passe de estilo não faz a precisão subir', () => {
      const frases = [
        // Digitadas pelo revisor: 1 corrigida em 3 acusadas = 33%.
        af('甲甲', 'xyzzy', 'outra coisa'),
        af('甲甲', 'xyzzy', 'xyzzy'),
        af('甲甲', 'xyzzy', 'xyzzy'),
        // Consertada pelo passe. Contada, a precisão viraria 2/4 = 50% e a
        // entrada passaria a se justificar com o próprio trabalho do app.
        af('甲甲', 'xyzzy', 'outra coisa', 'passe-estilo'),
      ];
      const [linha] = aferirCatalogo(frases, [entrada]);
      expect(linha).toMatchObject({ acusadas: 3, corrigidas: 1, restantes: 2, assistidas: 1 });
      expect(linha.precisao).toBeCloseTo(1 / 3);
    });

    it('a assistida sai do denominador junto — não vira "não corrigida"', () => {
      // Uma digitada e corrigida, uma assistida e corrigida. Contar a assistida
      // só em `acusadas` (o conserto que a revisão propôs) daria 1/2 = 50%:
      // afundaria uma entrada JUSTAMENTE porque ela funcionou. Excluir a frase
      // inteira é o único tratamento que não escolhe um lado.
      const frases = [af('甲甲', 'xyzzy', 'outra coisa'), af('甲甲', 'xyzzy', 'outra coisa', 'passe-estilo')];
      const [linha] = aferirCatalogo(frases, [entrada]);
      expect(linha).toMatchObject({ acusadas: 1, corrigidas: 1, assistidas: 1 });
      expect(linha.precisao).toBeCloseTo(1);
    });

    it('vale para qualquer origem, não só o passe — e também quando o botão NÃO consertou', () => {
      // `revisao`, `qa`, `substituicao`, `retraducao`: em todas o revisor foi
      // avisado ou o texto foi mexido por outro canal, e o que ele faria sozinho
      // é inobservável. A que continua acusada também sai: ela não é prova de
      // que ele deixaria passar.
      const frases = [
        af('甲甲', 'xyzzy', 'outra coisa', 'revisao'),
        af('甲甲', 'xyzzy', 'outra coisa', 'qa'),
        af('甲甲', 'xyzzy', 'xyzzy', 'substituicao'),
      ];
      const [linha] = aferirCatalogo(frases, [entrada]);
      expect(linha).toMatchObject({ acusadas: 0, corrigidas: 0, restantes: 0, novas: 0, assistidas: 3, precisao: 0 });
    });

    it('só entra em `assistidas` a frase que a entrada acusava na IA', () => {
      // A frase que o botão editou sem nunca ter sido acusada não é amostra
      // perdida desta entrada — contá-la faria `assistidas` medir o uso do
      // passe, não o buraco que ele abre nesta medição.
      const [linha] = aferirCatalogo([af('甲甲', 'outra coisa', 'outra coisa', 'passe-estilo')], [entrada]);
      expect(linha).toMatchObject({ acusadas: 0, assistidas: 0 });
    });
  });
});
