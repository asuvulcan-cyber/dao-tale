import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOGO } from '@dao-tale/shared';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { criarApp } from '../app.js';
import { reposFrases } from '../db/repos.js';
import { provedorMock } from '../ia/mock.js';
import type { Hono } from 'hono';

// O catálogo de erros zh→pt-BR entra pela lista de estilo que já existe: mesma
// rota, mesma forma de violação, mesma dispensa por trinca, mesmo passe. Sem
// isso o achado exigiria tela nova, tabela nova e um segundo botão de conserto —
// e o revisor teria duas listas para ler em vez de uma.

process.env.DAO_TALE_MOCK_LATENCIA = '0';
process.env.DAO_TALE_DIR = '/tmp/dao-tale-teste';

let db: BancoDados;
let app: Hono;

const json = async (resposta: Response) => (await resposta.json()) as any;

async function chamar(metodo: string, rota: string, corpo?: unknown): Promise<Response> {
  return await app.request(rota, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
}

/** Cria um capítulo e grava as traduções pelo repositório. Direto, e não pelo
 *  PATCH da tela: o detector do catálogo só examina frase `traduzida`, e editar
 *  o texto à mão não muda o status — um capítulo semeado por PATCH nunca
 *  acusaria nada, e o teste passaria (ou falharia) pelo motivo errado. */
async function capituloCom(
  obraId: number,
  numero: number,
  frases: { zh: string; pt: string }[],
): Promise<{ capId: number; ids: number[] }> {
  const criado = await json(
    await chamar('POST', `/api/obras/${obraId}/capitulos`, {
      numero,
      texto_origem: frases.map((f) => f.zh).join(''),
    }),
  );
  const capId = criado.capitulo.id as number;
  const doBanco = (await json(await chamar('GET', `/api/capitulos/${capId}`))).frases as any[];
  expect(doBanco).toHaveLength(frases.length);
  doBanco.forEach((f, i) => reposFrases.aplicarTraducaoIa(db, f.id, frases[i].pt));
  return { capId, ids: doBanco.map((f) => f.id) };
}

// 一直 no chinês + "sempre" no português: a única entrada aferida do catálogo.
const ALVO_CATALOGO = { zh: '他一直在等。', pt: 'Ele sempre esteve esperando.' };
// Aspas curvas: violação de `analisarEstilo`, que nunca vê o chinês.
const ALVO_ESTILO = { zh: '她笑了。', pt: '“Vamos”, disse ela.' };
// As DUAS varreduras na mesma frase: 一直 + "sempre" (catálogo) e aspas curvas
// (estilo). É o único cenário em que a ordem DENTRO da frase existe, e sem ele
// o `sort` por `ordem` esconde qualquer divergência entre as duas rotas.
const ALVO_DOS_DOIS = { zh: '他一直在等。', pt: 'Ele sempre esperou, “assim mesmo”.' };
const LIMPA = { zh: '天黑了。', pt: 'A noite caiu.' };

const CERTO_YIZHI = CATALOGO.find((e) => e.id === 'particula-yizhi')!.certo;

describe('catálogo na rota de estilo', () => {
  let obraId: number;
  let capId: number;
  let fraseCatalogoId: number;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    db = abrirBanco(':memory:');
    app = criarApp(db);
    obraId = (await json(await chamar('POST', '/api/obras', { titulo: 'Catálogo' }))).id;
    // Frase 0 acusa pelo catálogo, frase 1 acusa pelo estilo: as duas varreduras
    // no mesmo capítulo, em ordens conhecidas.
    const cap = await capituloCom(obraId, 1, [ALVO_CATALOGO, ALVO_ESTILO]);
    capId = cap.capId;
    fraseCatalogoId = cap.ids[0];
  });

  it('a violação do catálogo vem na mesma lista das de estilo', async () => {
    const r = await json(await chamar('GET', `/api/capitulos/${capId}/estilo`));
    const regras = r.violacoes.map((v: any) => v.regra);
    expect(regras).toContain('particula-yizhi');
    expect(regras).toContain('aspas-nao-retas');

    // Na MESMA forma das de estilo — é o que faz a tela e a dispensa existirem
    // sem alteração: sem `frase_id` a tela não pula para a frase nem dispensa,
    // e sem `trecho` não há trinca.
    const doCatalogo = r.violacoes.find((v: any) => v.regra === 'particula-yizhi');
    expect(doCatalogo.frase_id).toBe(fraseCatalogoId);
    expect(doCatalogo.ordem).toBe(0);
    expect(doCatalogo.trecho).toContain('sempre');
  });

  it('a lista sai em ordem de frase, não com o catálogo grampeado no fim', async () => {
    const r = await json(await chamar('GET', `/api/capitulos/${capId}/estilo`));
    expect(r.violacoes).toHaveLength(2);
    // O revisor lê na ordem do capítulo: concatenar as duas varreduras sem
    // ordenar poria a frase 1 (estilo) antes da frase 0 (catálogo).
    expect(r.violacoes.map((v: any) => v.ordem)).toEqual([0, 1]);
    expect(r.violacoes[0].regra).toBe('particula-yizhi');
  });

  it('por_terco conta as do catálogo', async () => {
    // Três frases, só a primeira acusa (e só pelo catálogo): o terço 0 tem de
    // registrar a violação que nenhuma varredura de estilo veria.
    const { capId: cap } = await capituloCom(obraId, 2, [ALVO_CATALOGO, LIMPA, LIMPA]);
    const r = await json(await chamar('GET', `/api/capitulos/${cap}/estilo`));
    expect(r.violacoes).toHaveLength(1);
    expect(r.por_terco).toEqual([1, 0, 0]);
  });

  it('dispensar a violação do catálogo tira ela da lista', async () => {
    const antes = await json(await chamar('GET', `/api/capitulos/${capId}/estilo`));
    const alvo = antes.violacoes.find((v: any) => v.regra === 'particula-yizhi');
    expect(alvo).toBeTruthy();

    const d = await chamar('POST', `/api/frases/${alvo.frase_id}/estilo/dispensar`, {
      regra: alvo.regra,
      trecho: alvo.trecho,
    });
    expect(d.status).toBe(200);

    const depois = await json(await chamar('GET', `/api/capitulos/${capId}/estilo`));
    expect(depois.violacoes.map((v: any) => v.regra)).not.toContain('particula-yizhi');
    // A de estilo continua: a trinca dispensa UMA violação, não a lista.
    expect(depois.violacoes.map((v: any) => v.regra)).toContain('aspas-nao-retas');
    expect(depois.ignoradas).toBe(1);
    expect(depois.por_terco).toEqual([0, 1, 0]);
  });

  it('o passe manda o chinês e a orientação do catálogo', async () => {
    const spy = vi.spyOn(provedorMock, 'passeEstilo');
    const r = await chamar('POST', `/api/capitulos/${capId}/estilo/passe`);
    expect(r.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    const req = spy.mock.calls[0][1];
    // Na ordem do capítulo, e não com o catálogo depois do estilo: as vizinhas
    // que acompanham o pedido só fazem sentido ao lado do alvo certo.
    expect(req.alvos.map((a) => a.ordem)).toEqual([0, 1]);

    const alvoCatalogo = req.alvos.find((a) => a.ordem === 0)!;
    // Sem o chinês, consertar `一直 → sempre` é adivinhar qual dos dois sentidos
    // a frase tinha — este é o campo que a Task 3 abriu para o catálogo.
    expect(alvoCatalogo.texto_zh).toContain('一直');
    expect(alvoCatalogo.violacoes).toEqual([
      { regra: 'particula-yizhi', trecho: expect.stringContaining('sempre'), orientacao: CERTO_YIZHI },
    ]);

    // Estilo puro não tem orientação: quem sabe o que é certo é a entrada do
    // catálogo, e o scanner de estilo não sabe.
    const alvoEstilo = req.alvos.find((a) => a.ordem === 1)!;
    expect(alvoEstilo.texto_zh).toBe('她笑了。');
    expect(alvoEstilo.violacoes[0].regra).toBe('aspas-nao-retas');
    expect(alvoEstilo.violacoes[0].orientacao).toBeUndefined();
  });

  it('capítulo em que só o catálogo acusa vale a chamada do passe', async () => {
    // A guarda "sem violação não gasta chamada" olhava só a varredura de estilo:
    // um capítulo com uma violação do catálogo e mais nada saía sem passe.
    const { capId: cap } = await capituloCom(obraId, 3, [ALVO_CATALOGO, LIMPA]);
    const spy = vi.spyOn(provedorMock, 'passeEstilo');
    const r = await chamar('POST', `/api/capitulos/${cap}/estilo/passe`);
    expect(r.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    const { correcoes } = await json(r);
    expect(correcoes.map((c: any) => c.regra)).toEqual(['particula-yizhi']);
  });

  // ── A ordem DENTRO da frase ───────────────────────────────────────────────
  // O front casa a enésima correção do passe com a enésima violação da lista
  // quando a `regra` não desempata (web/src/util/passeEstilo.ts), e esse caminho
  // é obrigatório no descarte, que vem sem `trecho_pt_errado`. Lista e passe
  // divergirem na ordem faz o botão Dispensar tirar o alerta ERRADO, sem sinal
  // nenhum — daí estes dois testes serem sobre sequência, e não sobre conteúdo.

  it('a lista e o passe entregam a mesma sequência dentro da frase acusada pelas duas varreduras', async () => {
    const { capId: cap } = await capituloCom(obraId, 5, [ALVO_DOS_DOIS, LIMPA]);

    const lista = await json(await chamar('GET', `/api/capitulos/${cap}/estilo`));
    const daLista = lista.violacoes.filter((v: any) => v.ordem === 0).map((v: any) => [v.regra, v.trecho]);
    // Com uma violação só a igualdade seria trivial: o valor deste teste está
    // em a frase acusar pelas DUAS varreduras.
    expect(daLista).toHaveLength(2);

    const spy = vi.spyOn(provedorMock, 'passeEstilo');
    expect((await chamar('POST', `/api/capitulos/${cap}/estilo/passe`)).status).toBe(200);
    const alvo = spy.mock.calls[0][1].alvos.find((a) => a.ordem === 0)!;
    const doPasse = alvo.violacoes.map((v) => [v.regra, v.trecho]);

    // Item a item, regra E trecho: é o par que o de-para do front usa.
    expect(doPasse).toEqual(daLista);
  });

  it('dentro da mesma frase, as de estilo vêm antes das do catálogo', async () => {
    // O desempate é arbitrário; o que não é arbitrário é ele estar fixado num
    // lugar só e pinado aqui — é isso que impede as duas rotas de derivarem.
    const { capId: cap } = await capituloCom(obraId, 6, [ALVO_DOS_DOIS, LIMPA]);
    const lista = await json(await chamar('GET', `/api/capitulos/${cap}/estilo`));
    expect(lista.violacoes.map((v: any) => v.regra)).toEqual(['aspas-nao-retas', 'particula-yizhi']);
  });

  // ── As vizinhas que acompanham o pedido ───────────────────────────────────
  // `vizinhas` sai de `alvos`, não da varredura de estilo. Montá-la só das de
  // estilo é invisível na resposta (o mock nem lê o campo) e custa nos dois
  // sentidos: alvo do catálogo sem contexto nenhum, ou a própria frase do
  // catálogo indo junto marcada como "não corrija".

  it('a frase acusada só pelo catálogo leva as suas vizinhas', async () => {
    const { capId: cap } = await capituloCom(obraId, 7, [ALVO_CATALOGO, LIMPA]);
    const spy = vi.spyOn(provedorMock, 'passeEstilo');
    expect((await chamar('POST', `/api/capitulos/${cap}/estilo/passe`)).status).toBe(200);
    const req = spy.mock.calls[0][1];
    expect(req.alvos.map((a) => a.ordem)).toEqual([0]);
    // Sem isto o modelo recebe a frase do catálogo sem nada em volta.
    expect(req.vizinhas.map((v) => v.ordem)).toEqual([1]);
  });

  it('a frase do catálogo nunca vai junto como vizinha do alvo ao lado', async () => {
    // Frase 0 catálogo, frase 1 estilo: as duas são alvo. Se `alvos` não
    // contasse a do catálogo, ela voltaria na lista de vizinhas — mandada duas
    // vezes na mesma chamada paga, com a instrução "NÃO corrija" ao lado da
    // instrução para corrigi-la.
    const { capId: cap } = await capituloCom(obraId, 8, [ALVO_CATALOGO, ALVO_ESTILO, LIMPA]);
    const spy = vi.spyOn(provedorMock, 'passeEstilo');
    expect((await chamar('POST', `/api/capitulos/${cap}/estilo/passe`)).status).toBe(200);
    const req = spy.mock.calls[0][1];
    expect(req.alvos.map((a) => a.ordem)).toEqual([0, 1]);
    expect(req.vizinhas.map((v) => v.ordem)).toEqual([2]);
    const ordensDeAlvo = new Set(req.alvos.map((a) => a.ordem));
    expect(req.vizinhas.filter((v) => ordensDeAlvo.has(v.ordem))).toEqual([]);
  });

  it('o passe não repropõe a violação do catálogo já dispensada', async () => {
    const { capId: cap, ids } = await capituloCom(obraId, 4, [ALVO_CATALOGO, LIMPA]);
    const antes = await json(await chamar('GET', `/api/capitulos/${cap}/estilo`));
    const alvo = antes.violacoes[0];
    await chamar('POST', `/api/frases/${ids[0]}/estilo/dispensar`, { regra: alvo.regra, trecho: alvo.trecho });

    const spy = vi.spyOn(provedorMock, 'passeEstilo');
    const r = await chamar('POST', `/api/capitulos/${cap}/estilo/passe`);
    expect(r.status).toBe(200);
    // Nem a chamada: pagar para consertar o que o revisor acabou de dispensar
    // é o pior desfecho possível.
    expect(spy).not.toHaveBeenCalled();
    expect((await json(r)).correcoes).toHaveLength(0);
  });
});
