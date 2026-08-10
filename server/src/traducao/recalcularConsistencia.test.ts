import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hono } from 'hono';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { reposCapitulos, reposFrases, reposGlossario, reposObras, recalcularConsistenciaDaObra } from '../db/repos.js';
import { criarApp } from '../app.js';
// Namespace do módulo, só para o `vi.spyOn` da segunda `describe` — a função
// mora em `repos.ts` (correção da revisão: movida de `consistencia.ts` para
// não arrastar `better-sqlite3` para dentro de um módulo puro, ver repos.ts).
import * as repos from '../db/repos.js';

// Mesmo padrão de app.test.ts / consistenciaObra.test.ts: modo local (sem
// DAO_TALE_MODO=hospedado) deixa `exigirSessao` como passa-direto, e o
// diretório de dados isolado evita que o teste toque no banco real do usuário.
process.env.DAO_TALE_MOCK_LATENCIA = '0';
process.env.DAO_TALE_DIR = '/tmp/dao-tale-teste';

let db: BancoDados;
let obraId: number;
let capId: number;

beforeEach(() => {
  db = abrirBanco(':memory:');
  obraId = reposObras.criar(db, { titulo: 'Obra' }).id;
  const cap = reposCapitulos.criar(db, obraId, { numero: 1, texto_origem: '金鹏堡很大。' }, [
    { texto_zh: '金鹏堡很大。', paragrafo: 0 },
  ]);
  capId = cap.id;
  const frase = reposFrases.listarPorCapitulo(db, capId)[0];
  // Traduzida SEM o termo canônico — é o estado que o glossário novo vai acusar.
  reposFrases.editarTexto(db, frase.id, 'A Fortaleza Jinpeng é grande.');
  // Não há helper `marcarTraduzida` em reposFrases — o UPDATE direto reproduz o
  // que `aplicarTraducaoIa` faria ao status_traducao, sem depender de IA no teste.
  db.prepare("UPDATE frases SET status_traducao = 'traduzida' WHERE id = ?").run(frase.id);
});

describe('recalcularConsistenciaDaObra', () => {
  it('cadastrar um termo que falta em frases antigas muda a contagem do capítulo', () => {
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBeNull();
    reposGlossario.criar(db, obraId, { termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado', categoria: 'lugar' });
    recalcularConsistenciaDaObra(db, obraId);
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(1);
  });

  it('apagar o termo devolve a contagem a zero', () => {
    const g = reposGlossario.criar(db, obraId, { termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado', categoria: 'lugar' });
    if (g === 'duplicado') throw new Error('inesperado: termo duplicado no teste');
    recalcularConsistenciaDaObra(db, obraId);
    // `reposGlossario` não tem `.apagar` — o nome real é `.excluir` (repos.ts).
    reposGlossario.excluir(db, g.id);
    recalcularConsistenciaDaObra(db, obraId);
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(0);
  });

  it('respeita a dispensa do revisor', () => {
    // Dispensa registrada não volta a contar só porque o glossário mudou em outro ponto.
    const g = reposGlossario.criar(db, obraId, { termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado', categoria: 'lugar' });
    expect(g).toBeTruthy();
    const frase = reposFrases.listarPorCapitulo(db, capId)[0];
    db.prepare('INSERT INTO consistencia_ignorada (frase_id, termo_zh) VALUES (?, ?)').run(frase.id, '金鹏堡');
    recalcularConsistenciaDaObra(db, obraId);
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(0);
  });

  // Achado da revisão final (item 3): capítulo 100% pendente não tem UMA linha
  // de português para a varredura conferir. Gravar 0 diria "varrido e limpo";
  // NULL é o valor que já significava "nunca varrido", e docs/11 e a Telemetria
  // mostram "—" só para NULL — um 0 forjado apagaria essa distinção.
  it('capítulo nunca traduzido continua NULL depois do recálculo, não vira 0', () => {
    const capPendente = reposCapitulos.criar(db, obraId, { numero: 2, texto_origem: '金鹏堡很美。' }, [
      { texto_zh: '金鹏堡很美。', paragrafo: 0 },
    ]);
    // Nenhuma frase deste capítulo foi traduzida — status_traducao continua 'pendente'.
    expect(reposCapitulos.obter(db, capPendente.id)!.consistencia_violacoes).toBeNull();

    reposGlossario.criar(db, obraId, { termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado', categoria: 'lugar' });
    recalcularConsistenciaDaObra(db, obraId);

    // O capítulo TRADUZIDO (capId, do beforeEach) recebe a contagem de verdade...
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(1);
    // ...e o capítulo pendente segue NULL — "nunca varrido", não "varrido e limpo".
    expect(reposCapitulos.obter(db, capPendente.id)!.consistencia_violacoes).toBeNull();
  });
});

// Prova pela HTTP (não só pela função direta) que as sete rotas do glossário
// disparam o recálculo — é o buraco de verdade: o job só reexaminava capítulo
// por capítulo, nada reexaminava a obra quando o glossário mudava por curadoria.
describe('gatilho nas rotas de glossário (curadoria.ts)', () => {
  let app: Hono;

  beforeEach(() => {
    app = criarApp(db);
  });

  // Achado da revisão: um teste de estado final não distingue "recalculou e deu
  // igual" de "não recalculou" — vi.spyOn NA MESMA função importada por
  // curadoria.ts (via o namespace `repos`, não uma cópia) prova a INVOCAÇÃO, não
  // só o resultado. Restaura depois de cada teste para os spies não vazarem
  // contagem de um `it` para o outro.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cadastrar termo pela rota já deixa a contagem do capítulo em dia', async () => {
    // É o buraco que esta tarefa fecha: antes, o capítulo seguia com o número
    // calculado quando o termo não existia.
    await app.request(`/api/obras/${obraId}/glossario`, {
      method: 'POST',
      body: JSON.stringify({ termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado', categoria: 'lugar' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(1);
  });

  it('substituir zera a contagem que ele acabou de consertar, chamando o recálculo exatamente uma vez', async () => {
    // substituir altera as FRASES, não o glossário — e é justamente a ação que
    // resolve as violações. Sem recalcular, o selo continuaria acusando.
    const spy = vi.spyOn(repos, 'recalcularConsistenciaDaObra');
    const g = await (
      await app.request(`/api/obras/${obraId}/glossario`, {
        method: 'POST',
        body: JSON.stringify({ termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado', categoria: 'lugar' }),
        headers: { 'content-type': 'application/json' },
      })
    ).json();
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(1);
    // Zera a contagem do POST acima (já coberto pelo 1º teste) para isolar
    // só a chamada que `substituir` faz.
    spy.mockClear();

    await app.request(`/api/glossario/${g.id}/substituir`, {
      method: 'POST',
      body: JSON.stringify({ de: 'Fortaleza Jinpeng', previa: false }),
      headers: { 'content-type': 'application/json' },
    });
    // Com previa=false a guarda deixa passar de qualquer jeito — é o teste de
    // PRÉVIA abaixo que precisa pegar a mutação de remover a guarda.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(0);
  });

  it('prévia do substituir não recalcula nem grava — zero chamadas, não só "mesmo resultado"', async () => {
    // Achado da revisão: um teste que só olha `consistencia_violacoes` no final
    // não distingue "não recalculou" de "recalculou e deu o mesmo número" (a
    // prévia não grava, então varrer de novo daria o mesmo 1 de qualquer jeito).
    // Contar invocações do spy é o que de fato prova a guarda.
    const spy = vi.spyOn(repos, 'recalcularConsistenciaDaObra');
    const g = await (
      await app.request(`/api/obras/${obraId}/glossario`, {
        method: 'POST',
        body: JSON.stringify({ termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado', categoria: 'lugar' }),
        headers: { 'content-type': 'application/json' },
      })
    ).json();
    const antes = reposFrases.listarPorCapitulo(db, capId)[0].texto_pt;
    spy.mockClear();

    await app.request(`/api/glossario/${g.id}/substituir`, {
      method: 'POST',
      body: JSON.stringify({ de: 'Fortaleza Jinpeng', previa: true }),
      headers: { 'content-type': 'application/json' },
    });
    expect(spy).toHaveBeenCalledTimes(0);
    // Prévia não grava nada; recalcular ali seria trabalho jogado fora.
    expect(reposFrases.listarPorCapitulo(db, capId)[0].texto_pt).toBe(antes);
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(1);
  });

  it('importar CSV recalcula uma vez, não por termo — 3 termos, 1 chamada', async () => {
    // O laço da importação não pode recalcular por termo — seriam N varreduras
    // da obra inteira numa ação só. Estado final (violações == 1) não prova isso:
    // 3 chamadas ao fim de cada iteração dariam o mesmo número. Só contar
    // invocações do spy separa "uma varredura" de "uma por termo".
    const spy = vi.spyOn(repos, 'recalcularConsistenciaDaObra');
    const csv =
      'termo_zh,termo_pt,categoria\n' +
      '金鹏堡,Fortaleza do Peng Dourado,lugar\n' +
      '飞鹰,Águia Voadora,pessoa\n' +
      '幽泉谷,Vale da Fonte Sombria,lugar\n';
    const r = await app.request(`/api/obras/${obraId}/glossario/importar`, {
      method: 'POST',
      body: JSON.stringify({ csv }),
      headers: { 'content-type': 'application/json' },
    });
    expect(r.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(1);
  });
});

// Achado da revisão da Task 4: o gatilho cobria as sete rotas do GLOSSÁRIO e
// esquecia a dispensa — que também muda a contagem, porque a varredura exclui
// os pares dispensados. A tela nova nunca mentia (a rota da obra calcula ao
// vivo), mas o selo da lista de capítulos seguia acusando o alerta que o revisor
// tinha acabado de dispensar.
describe('gatilho na dispensa de consistência (capitulos.ts)', () => {
  let app: Hono;
  let fraseId: number;

  beforeEach(async () => {
    app = criarApp(db);
    fraseId = reposFrases.listarPorCapitulo(db, capId)[0].id;
    // O termo que a frase viola: sem ele não há contagem que a dispensa mude.
    await app.request(`/api/obras/${obraId}/glossario`, {
      method: 'POST',
      body: JSON.stringify({ termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado', categoria: 'lugar' }),
      headers: { 'content-type': 'application/json' },
    });
  });

  const dispensar = (corpo: Record<string, unknown>) =>
    app.request(`/api/frases/${fraseId}/consistencia/dispensar`, {
      method: 'POST',
      body: JSON.stringify(corpo),
      headers: { 'content-type': 'application/json' },
    });

  it('dispensar derruba o selo do capítulo', async () => {
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(1);
    const r = await dispensar({ termo_zh: '金鹏堡' });
    expect(r.status).toBe(200);
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(0);
  });

  it('desfazer devolve o selo — o caminho de volta muda a contagem tanto quanto o de ida', async () => {
    await dispensar({ termo_zh: '金鹏堡' });
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(0);
    const r = await dispensar({ termo_zh: '金鹏堡', desfazer: true });
    expect(r.status).toBe(200);
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(1);
  });
});

// Achado da revisão final (item 1): POST /obras/:obraId/substituir é a rota
// IRMÃ de POST /glossario/:id/substituir (é a correção rápida disparada do
// EditorCapitulo, não da tela de curadoria) — faz o mesmo UPDATE em lote em
// `frases.texto_pt`, mas tinha ficado fora do gatilho. Sem isto, o texto ficava
// certo e GET /obras/:id/consistencia já devolvia `por_termo: []`, enquanto o
// selo em `capitulos.consistencia_violacoes` continuava acusando — duas telas
// do mesmo app discordando sobre o mesmo número.
describe('gatilho na rota irmã (frases.ts: POST /obras/:obraId/substituir)', () => {
  let app: Hono;

  beforeEach(async () => {
    app = criarApp(db);
    // O termo entra DEPOIS da frase já traduzida (mesmo cenário do topo do
    // arquivo): a frase usa "Fortaleza Jinpeng", que não é a forma canônica.
    await app.request(`/api/obras/${obraId}/glossario`, {
      method: 'POST',
      body: JSON.stringify({ termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado', categoria: 'lugar' }),
      headers: { 'content-type': 'application/json' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('previa=true não recalcula — zero chamadas', async () => {
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(1);
    const spy = vi.spyOn(repos, 'recalcularConsistenciaDaObra');

    await app.request(`/api/obras/${obraId}/substituir`, {
      method: 'POST',
      body: JSON.stringify({ de: 'Fortaleza Jinpeng', para: 'Fortaleza do Peng Dourado', previa: true }),
      headers: { 'content-type': 'application/json' },
    });

    expect(spy).toHaveBeenCalledTimes(0);
    // Prévia não grava: o selo segue acusando a violação que ainda existe.
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(1);
  });

  it('previa=false recalcula exatamente uma vez, e o selo do capítulo zera junto com a tela da obra', async () => {
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(1);
    const spy = vi.spyOn(repos, 'recalcularConsistenciaDaObra');

    const r = await app.request(`/api/obras/${obraId}/substituir`, {
      method: 'POST',
      body: JSON.stringify({ de: 'Fortaleza Jinpeng', para: 'Fortaleza do Peng Dourado', previa: false }),
      headers: { 'content-type': 'application/json' },
    });

    expect(r.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    // É o defeito verificado pelo revisor: as duas telas precisam concordar.
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(0);
    const { por_termo } = await (await app.request(`/api/obras/${obraId}/consistencia`)).json();
    expect(por_termo).toEqual([]);
  });
});
