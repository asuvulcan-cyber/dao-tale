import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hono } from 'hono';
import { leituraConfere, pinyinComTons, type EntradaGlossario, type SegmentoTutor } from '@dao-tale/shared';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { criarApp } from '../app.js';
import { provedorMock } from '../ia/mock.js';
import { blocoDicionario, selecionarPalavras } from '../ia/promptDicionario.js';
import { usuarioExplicarTutor } from '../ia/promptTutor.js';
import { usuarioRevisao } from '../ia/prompts.js';
import { criarBancoDicionario, Dicionario, fixarDicionario, gravarFonte } from './banco.js';
import { expandirOpcional, lerCedict, lerDcp, lerLinhaCedict, limparLatex } from './fontes.js';

// Dicionários locais (doc 30): leitura das fontes, pinyin, divisão da frase,
// conferência da leitura do tutor e o bloco que vai ao prompt.

process.env.DAO_TALE_MOCK_LATENCIA = '0';

// Trechos no formato real das fontes (copiados do CC-CEDICT de 20/11/2026 e do
// DCP), reduzidos.
const CEDICT = `# CC-CEDICT
#! date=2026-11-20T07:26:16Z
刀 刀 [Dao1] /surname Dao/
刀 刀 [dao1] /knife; blade; single-edged sword; cutlass (CL:把[ba3])/classifier for sets of one hundred sheets (of paper)/
劍 剑 [jian4] /double-edged sword/CL:口[kou3],把[ba3]/
長 长 [chang2] /length/long/
長 长 [zhang3] /chief; head/to grow/
長老 长老 [zhang3 lao3] /elder/term of respect for a Buddhist monk/
老 老 [lao3] /old/
銀行 银行 [yin2 hang2] /bank/CL:家[jia1],個|个[ge4]/
行 行 [xing2] /to walk/OK/
行 行 [hang2] /row; line/
銀 银 [yin2] /silver/
一 一 [yi1] /one/
個 个 [ge4] /individual; this; that; size/classifier for people or objects in general/
他 他 [ta1] /he or him/
走 走 [zou3] /to walk; to go/
了 了 [le5] /(modal particle intensifying preceding clause)/
了 了 [liao3] /to finish; to understand/
林 林 [Lin2] /surname Lin/
林 林 [lin2] /woods; forest/
動 动 [dong4] /to move/
的 的 [de5] /of; ~'s (possessive particle)/
`;

const DCP = String.raw`
%%%%%%%%%% 刀 %%%%%%%%%%
\begin{EntryWithPhonetic}{刀}{dao1}{2}{⼑}[HSK 3][Kangxi 18]
  \definition*{s.}{Sobrenome: Dao}
  \definition[把]{s.}{faca; espada; armas antigas, referindo"-se a ferramentas para cortar}
\end{EntryWithPhonetic}

\begin{EntryWithPhonetic}{一}{yi2}[(一 $+$ 4º tom)]{1}{⼀}[HSK 1][Kangxi 1]
  \definition{num.}{um; 1 | um (artigo)}
\end{EntryWithPhonetic}

\begin{EntryWithPhonetic}{的}{de5}{8}{⽩}[HSK 1]
  \definition{part.}{partícula que indica posse}
\end{EntryWithPhonetic}

\begin{EntryWithPhonetic}{爱好}{ai4hao4}{10,6}{⽖,⼥}[HSK 1]
  \definition[个,种]{s.}{passatempo; \emph{hobby} | 爱好 é mais usado para atividades regulares}[他的爱好是收集邮票。===Seu hobby era colecionar selos. | 我的爱好是读书。===Meu hobby é ler.]
\end{EntryWithPhonetic}

\begin{EntryWithPhonetic}{差（一）点儿}{cha4(yi4)dian3r5}{9,1,9,2}{⼯,⼀,⽕,⼉}[HSK 5]
  \definition{adv.}{quase; por pouco}
\end{EntryWithPhonetic}

\begin{EntryWithPhonetic}{伯}{bai3}{7}{⼈}
  \seeref{bo2}
\end{EntryWithPhonetic}

\begin{EntryWithPhonetic}{长老}{zhang3lao3}{4,6}{⾧,⽼}
  \definition{s.}{ancião; o mais velho de um clã ou mosteiro}
\end{EntryWithPhonetic}
`;

function montarDicionario(): Dicionario {
  const db = criarBancoDicionario(':memory:');
  const c = lerCedict(CEDICT);
  gravarFonte(db, 'cedict', c.verbetes, c.versao);
  gravarFonte(db, 'dcp', lerDcp(DCP), null);
  return new Dicionario(db);
}

const seg = (texto: string, leitura: string | null): SegmentoTutor => ({
  texto,
  leitura,
  significado: '',
  classe: '',
  nota: null,
});

describe('leitura das fontes', () => {
  it('CC-CEDICT: tradicional, classificadores e nome próprio', () => {
    const v = lerLinhaCedict('銀行 银行 [yin2 hang2] /bank/CL:家[jia1],個|个[ge4]/')!;
    expect(v).toMatchObject({
      simplificado: '银行',
      tradicional: '銀行',
      leitura: 'yín háng',
      classificadores: ['家', '个'],
    });
    expect(v.acepcoes).toEqual([{ classe: null, sentidos: ['bank'], proprio: false }]);
    expect(lerLinhaCedict('刀 刀 [Dao1] /surname Dao/')!.acepcoes[0].proprio).toBe(true);
    expect(lerLinhaCedict('# comentário')).toBeNull();
    expect(lerCedict(CEDICT).versao).toBe('2026-11-20');
  });

  it('DCP: nota da leitura, HSK, asterisco de nome próprio, exemplos e LaTeX limpo', () => {
    const vs = lerDcp(DCP);
    const um = vs.find((v) => v.simplificado === '一')!;
    expect(um).toMatchObject({ leitura: 'yí', nota: '一 + 4º tom', hsk: '1' });
    expect(um.acepcoes[0].sentidos).toEqual(['um; 1', 'um (artigo)']);

    const faca = vs.find((v) => v.simplificado === '刀')!;
    expect(faca.acepcoes.map((a) => a.proprio)).toEqual([true, false]);
    expect(faca.acepcoes[1].sentidos[0]).toBe('faca; espada; armas antigas, referindo-se a ferramentas para cortar');
    expect(faca.classificadores).toEqual(['把']);

    const hobby = vs.find((v) => v.simplificado === '爱好')!;
    expect(hobby.acepcoes[0].sentidos[0]).toBe('passatempo; hobby');
    expect(hobby.exemplos).toEqual([
      { origem: '他的爱好是收集邮票。', pt: 'Seu hobby era colecionar selos.' },
      { origem: '我的爱好是读书。', pt: 'Meu hobby é ler.' },
    ]);
  });

  it('DCP: parte opcional vira duas chaves; verbete só de remissão fica, pela leitura', () => {
    const vs = lerDcp(DCP);
    expect(vs.filter((v) => v.simplificado.startsWith('差')).map((v) => [v.simplificado, v.leitura])).toEqual([
      ['差点儿', 'chàdiǎnr'],
      ['差一点儿', 'chàyìdiǎnr'],
    ]);
    expect(vs.find((v) => v.simplificado === '伯')).toMatchObject({ leitura: 'bǎi', acepcoes: [], nota: 'ver bó' });
    expect(expandirOpcional('接电话）', 'jie1(dian4hua4)')).toEqual([{ hanzi: '接电话', pinyin: 'jie1dian4hua4' }]);
    expect(limparLatex("não só\\dots mas ``阿 + Nome'' \\{v.\\}")).toBe('não só… mas “阿 + Nome” {v.}');
  });
});

describe('pinyin', () => {
  it('numérico → com tons, pela regra de posição da marca', () => {
    expect(pinyinComTons('dao1')).toBe('dāo');
    expect(pinyinComTons('zhang3 lao3')).toBe('zhǎng lǎo');
    expect(pinyinComTons('lu:4 nu:3')).toBe('lǜ nǚ');
    expect(pinyinComTons('gou3 xiu4 hui4')).toBe('gǒu xiù huì');
    expect(pinyinComTons('da1//shan4')).toBe('dāshàn');
    expect(pinyinComTons('dian3r5')).toBe('diǎnr');
    expect(pinyinComTons('Bei3 jing1')).toBe('Běi jīng');
  });

  it('confere a leitura da IA: tom errado acusa; neutro e mudança de tom de 一/不 não', () => {
    expect(leituraConfere('zhǎnglǎo', 'zhang3 lao3', '长老')).toBe(true);
    expect(leituraConfere('chánglǎo', 'zhang3 lao3', '长老')).toBe(false);
    expect(leituraConfere('rènshí', 'ren4 shi5', '认识')).toBe(true);
    expect(leituraConfere('yí gè', 'yi1 ge4', '一个')).toBe(true);
    expect(leituraConfere('bú shì', 'bu4 shi4', '不是')).toBe(true);
    expect(leituraConfere('bǔ shì', 'bu4 shi4', '不是')).toBe(false);
    expect(leituraConfere('nǚrén', 'nu:3 ren2', '女人')).toBe(true);
    expect(leituraConfere('nürén', 'nu:3 ren2', '女人')).toBe(true);
    expect(leituraConfere('nurén', 'nu:3 ren2', '女人')).toBe(false);
    expect(leituraConfere('dao1', 'dao1', '刀')).toBe(true);
  });
});

describe('dicionário montado', () => {
  let d: Dicionario;
  beforeEach(() => {
    d = montarDicionario();
  });

  it('busca pela forma simplificada ou tradicional, DCP primeiro', () => {
    expect(d.buscar('刀').map((v) => v.fonte)).toEqual(['dcp', 'cedict', 'cedict']);
    expect(d.buscar('銀行').map((v) => v.simplificado)).toEqual(['银行']);
    expect(d.estado().fontes.map((f) => [f.id, f.total])).toEqual([
      ['dcp', 8],
      ['cedict', 21],
    ]);
  });

  it('divide a frase em palavras, e termo do glossário entra inteiro', () => {
    expect(d.palavrasDaFrase('长老走了。他的刀！').map((p) => p.texto)).toEqual(['长老', '走', '了', '他', '的', '刀']);
    const glossario = [
      { termo_zh: '林动', termo_pt: 'Lin Dong', categoria: 'personagem', ambiguo: false },
    ] as EntradaGlossario[];
    const palavras = d.palavrasDaFrase('林动走了', glossario);
    expect(palavras.map((p) => p.texto)).toEqual(['林动', '走', '了']);
    expect(palavras[0].glossario).toEqual({ termo_pt: 'Lin Dong', categoria: 'personagem' });
    // ambíguo não se impõe: o dicionário divide
    expect(d.palavrasDaFrase('林动', [{ ...glossario[0], ambiguo: true }]).map((p) => p.texto)).toEqual(['林', '动']);
  });

  it('confere os segmentos do tutor, inclusive o que não é verbete inteiro', () => {
    const divergencias = d.conferirSegmentos([
      seg('长老', 'chánglǎo'),
      seg('银行', 'yínxíng'),
      seg('一个', 'yí gè'),
      seg('走了', 'zǒu le'),
      seg('走了', 'zǒu liǎo'),
      seg('走了', 'zóu le'),
      seg('。', null),
      seg('叒', 'ruò'), // fora do dicionário: não dá para conferir, não acusa
    ]);
    expect(divergencias.map((x) => [x.indice, x.leituras_dicionario])).toEqual([
      [0, ['zhǎnglǎo']],
      [1, ['yínháng']],
      [5, ['zǒule', 'zǒuliǎo']],
    ]);
  });

  it('bloco do tutor: DCP e CC-CEDICT por leitura, sem sobrenome e sem termo do glossário', () => {
    const glossario = [
      { termo_zh: '林动', termo_pt: 'Lin Dong', categoria: 'personagem', ambiguo: false },
    ] as EntradaGlossario[];
    const palavras = selecionarPalavras(d.palavrasDaFrase('林动拔刀', glossario), 'tutor');
    const bloco = blocoDicionario(palavras, 'tutor').join('\n');
    expect(bloco).toContain('## DICIONÁRIO (DCP e CC-CEDICT)');
    expect(bloco).toContain('- 刀: dāo — PT: faca; espada · EN: knife; blade');
    expect(bloco).not.toMatch(/sobrenome|surname/i);
    expect(bloco).not.toContain('林动');
    expect(bloco).toContain('剑 é a espada reta');
  });

  it('bloco da revisão: só CC-CEDICT, sem palavra básica, a menos que a pergunta fale dela', () => {
    const palavras = d.palavrasDaFrase('他的刀');
    const bloco = blocoDicionario(selecionarPalavras(palavras, 'revisao'), 'revisao').join('\n');
    expect(bloco).toContain('## DICIONÁRIO (CC-CEDICT)');
    expect(bloco).toContain('- 刀: dāo — knife; blade');
    expect(bloco).not.toContain('PT:');
    expect(bloco).not.toContain('- 的');
    expect(selecionarPalavras(palavras, 'revisao', 'o 的 aqui é posse?').map((p) => p.texto)).toContain('的');
    expect(blocoDicionario([], 'revisao')).toEqual([]);
  });
});

describe('rotas com dicionário', () => {
  let db: BancoDados;
  let app: Hono;
  const json = async (r: Response) => (await r.json()) as any;
  const chamar = (metodo: string, rota: string, corpo?: unknown) =>
    app.request(rota, {
      method: metodo,
      headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });

  let frases: { id: number; texto_zh: string }[];

  beforeEach(async () => {
    fixarDicionario(montarDicionario());
    db = abrirBanco(':memory:');
    app = criarApp(db);
    const obra = await json(
      await chamar('POST', '/api/obras', {
        titulo: 'Obra',
        prompt_inicial: { versao: '1.0', conteudo: 'Traduza com fidelidade.' },
        glossario_inicial: [{ termo_zh: '林动', termo_pt: 'Lin Dong', categoria: 'personagem' }],
      }),
    );
    const criado = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 1, texto_origem: '林动拔刀。长老走了。' }),
    );
    frases = (await json(await chamar('GET', `/api/capitulos/${criado.capitulo.id}`))).frases;
  });

  afterEach(() => {
    fixarDicionario(undefined);
    vi.restoreAllMocks();
  });

  it('palavras da frase com verbetes e o termo do glossário marcado', async () => {
    const r = await json(await chamar('GET', `/api/frases/${frases[0].id}/dicionario`));
    expect(r.instalado).toBe(true);
    expect(r.palavras.map((p: any) => p.texto)).toEqual(['林动', '拔', '刀']);
    expect(r.palavras[0].glossario.termo_pt).toBe('Lin Dong');
    expect(r.palavras[2].verbetes[0].fonte).toBe('dcp');
    const busca = await json(await chamar('GET', `/api/dicionario/busca?termo=${encodeURIComponent('長老')}`));
    expect(busca.verbetes.map((v: any) => v.leitura)).toEqual(['zhǎng lǎo']);
  });

  it('sem dicionário instalado, tudo responde e nada quebra', async () => {
    fixarDicionario(null);
    expect(await json(await chamar('GET', '/api/dicionario'))).toEqual({ instalado: false, fontes: [] });
    expect((await json(await chamar('GET', `/api/frases/${frases[0].id}/dicionario`))).palavras).toEqual([]);
    const espiao = vi.spyOn(provedorMock, 'explicarFraseTutor');
    const estado = await json(await chamar('POST', `/api/frases/${frases[1].id}/tutor/explicar`, {}));
    expect(espiao.mock.calls[0][1].dicionario).toBeUndefined();
    expect(estado.divergencias).toEqual([]);
  });

  it('tutor: verbetes vão ao prompt e a leitura divergente volta no estado', async () => {
    const espiao = vi.spyOn(provedorMock, 'explicarFraseTutor');
    // o simulado dá "pīn1", "pīn2"… — nenhuma bate com o dicionário
    const estado = await json(await chamar('POST', `/api/frases/${frases[1].id}/tutor/explicar`, {}));
    const req = espiao.mock.calls[0][1];
    expect(req.dicionario!.map((p) => p.texto)).toEqual(['长老', '走', '了']);
    expect(usuarioExplicarTutor(req)).toContain('- 长老: zhǎnglǎo — PT: ancião');
    expect(estado.divergencias.map((x: any) => x.texto)).toEqual(['长', '老', '走', '了']);

    // reabrir confere de novo, sem chamar o provedor
    const reaberto = await json(await chamar('GET', `/api/frases/${frases[1].id}/tutor`));
    expect(reaberto.divergencias).toHaveLength(4);
    expect(espiao).toHaveBeenCalledTimes(1);
  });

  it('revisão: verbetes do CC-CEDICT vão ao prompt; o termo do glossário não', async () => {
    const espiao = vi.spyOn(provedorMock, 'revisarFrase');
    await chamar('POST', `/api/frases/${frases[0].id}/revisar`, { pergunta: 'O 刀 é espada?', provedor: 'mock' });
    const req = espiao.mock.calls[0][1];
    expect(req.dicionario!.map((p) => p.texto)).toEqual(['刀']);
    const mensagem = usuarioRevisao(req);
    expect(mensagem).toContain('- 刀: dāo — knife; blade');
    expect(mensagem).not.toContain('PT: faca');
  });
});
