import { beforeEach, describe, expect, it } from 'vitest';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { reposCapitulos, reposFrases, reposObras, reposTestes } from '../db/repos.js';
import { montarTurnos, TETO_TURNOS } from './frases.js';

let db: BancoDados;
let obraId: number;
let fraseId: number;

beforeEach(() => {
  db = abrirBanco(':memory:');
  obraId = reposObras.criar(db, { titulo: 'Obra' }).id;
  const cap = reposCapitulos.criar(db, obraId, { numero: 1, texto_origem: '甲说。' }, [
    { texto_zh: '甲说。', paragrafo: 0 },
  ]);
  fraseId = reposFrases.listarPorCapitulo(db, cap.id)[0].id;
});

function caso(pergunta: string, pai: number | null) {
  return reposTestes.criar(db, {
    frase_id: fraseId,
    obra_id: obraId,
    caso_pai_id: pai,
    trecho_zh: '甲',
    pergunta,
    veredito: 'incorreto',
    resposta: `resposta de ${pergunta}`,
    justificativa: '',
    secao_regra: null,
    correcao_proposta: null,
    trecho_pt_errado: null,
    trecho_pt_corrigido: null,
    motivo_rejeicao: null,
    provedor: 'mock',
    modelo: 'mock-v1',
    resposta_bruta: '{}',
  });
}

describe('fio de réplicas', () => {
  it('devolve a cadeia da raiz até a folha', () => {
    const a = caso('primeira', null);
    const b = caso('segunda', a.id);
    const c = caso('terceira', b.id);
    expect(reposTestes.fio(db, c.id).map((x) => x.pergunta)).toEqual(['primeira', 'segunda', 'terceira']);
  });

  it('sabe quem tem filho', () => {
    const a = caso('primeira', null);
    const b = caso('segunda', a.id);
    expect(reposTestes.temFilho(db, a.id)).toBe(true);
    expect(reposTestes.temFilho(db, b.id)).toBe(false);
  });

  it('apagar a raiz leva o fio inteiro (ON DELETE CASCADE)', () => {
    const a = caso('primeira', null);
    const b = caso('segunda', a.id);
    db.prepare('DELETE FROM banco_testes WHERE id = ?').run(a.id);
    expect(reposTestes.obter(db, b.id)).toBeUndefined();
  });
});

describe('turnos enviados ao modelo', () => {
  it('converte o fio em turnos, do mais antigo ao mais recente', () => {
    const a = caso('primeira', null);
    const b = caso('segunda', a.id);
    const turnos = montarTurnos(reposTestes.fio(db, b.id));
    expect(turnos.map((t) => t.pergunta)).toEqual(['primeira', 'segunda']);
    expect(turnos[0].resposta).toBe('resposta de primeira');
    expect(turnos[0].recusado).toBe(false);
  });

  it('acima do teto mantém o primeiro turno e os mais recentes', () => {
    let pai: number | null = null;
    for (let i = 1; i <= 9; i++) pai = caso(`p${i}`, pai).id;
    const turnos = montarTurnos(reposTestes.fio(db, pai!));
    expect(turnos).toHaveLength(TETO_TURNOS);
    // O primeiro fixa a dúvida; os demais são os mais recentes.
    expect(turnos[0].pergunta).toBe('p1');
    expect(turnos.at(-1)!.pergunta).toBe('p9');
  });
});
