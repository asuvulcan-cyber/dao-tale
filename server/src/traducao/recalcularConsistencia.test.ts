import { beforeEach, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { reposCapitulos, reposFrases, reposGlossario, reposObras } from '../db/repos.js';
import { criarApp } from '../app.js';
import { recalcularConsistenciaDaObra } from './consistencia.js';

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
});

// Prova pela HTTP (não só pela função direta) que as sete rotas do glossário
// disparam o recálculo — é o buraco de verdade: o job só reexaminava capítulo
// por capítulo, nada reexaminava a obra quando o glossário mudava por curadoria.
describe('gatilho nas rotas de glossário (curadoria.ts)', () => {
  let app: Hono;

  beforeEach(() => {
    app = criarApp(db);
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

  it('substituir zera a contagem que ele acabou de consertar', async () => {
    // substituir altera as FRASES, não o glossário — e é justamente a ação que
    // resolve as violações. Sem recalcular, o selo continuaria acusando.
    const g = await (
      await app.request(`/api/obras/${obraId}/glossario`, {
        method: 'POST',
        body: JSON.stringify({ termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado', categoria: 'lugar' }),
        headers: { 'content-type': 'application/json' },
      })
    ).json();
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(1);

    await app.request(`/api/glossario/${g.id}/substituir`, {
      method: 'POST',
      body: JSON.stringify({ de: 'Fortaleza Jinpeng', previa: false }),
      headers: { 'content-type': 'application/json' },
    });
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(0);
  });

  it('prévia do substituir não recalcula nem grava', async () => {
    const g = await (
      await app.request(`/api/obras/${obraId}/glossario`, {
        method: 'POST',
        body: JSON.stringify({ termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado', categoria: 'lugar' }),
        headers: { 'content-type': 'application/json' },
      })
    ).json();
    const antes = reposFrases.listarPorCapitulo(db, capId)[0].texto_pt;

    await app.request(`/api/glossario/${g.id}/substituir`, {
      method: 'POST',
      body: JSON.stringify({ de: 'Fortaleza Jinpeng', previa: true }),
      headers: { 'content-type': 'application/json' },
    });
    // Prévia não grava nada; recalcular ali seria trabalho jogado fora.
    expect(reposFrases.listarPorCapitulo(db, capId)[0].texto_pt).toBe(antes);
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(1);
  });

  it('importar CSV recalcula uma vez, e a contagem fica certa', async () => {
    // O laço da importação não pode recalcular por termo — seriam N varreduras
    // da obra inteira numa ação só.
    const csv = 'termo_zh,termo_pt,categoria\n金鹏堡,Fortaleza do Peng Dourado,lugar\n飞鹰,Águia Voadora,pessoa\n';
    const r = await app.request(`/api/obras/${obraId}/glossario/importar`, {
      method: 'POST',
      body: JSON.stringify({ csv }),
      headers: { 'content-type': 'application/json' },
    });
    expect(r.status).toBe(200);
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(1);
  });
});
