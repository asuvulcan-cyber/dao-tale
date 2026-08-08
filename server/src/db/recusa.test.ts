import { beforeEach, describe, expect, it } from 'vitest';
import { abrirBanco, type BancoDados } from './index.js';
import { reposCapitulos, reposFrases, reposObras, reposTestes } from './repos.js';

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

function caso(secao: string | null, pai: number | null) {
  return reposTestes.criar(db, {
    frase_id: fraseId, obra_id: obraId, caso_pai_id: pai, trecho_zh: '甲',
    pergunta: 'p', veredito: 'incorreto', resposta: 'r', justificativa: '',
    secao_regra: secao, correcao_proposta: null, trecho_pt_errado: null,
    trecho_pt_corrigido: null, motivo_rejeicao: null,
    provedor: 'mock', modelo: 'mock-v1', resposta_bruta: '{}',
  });
}

describe('recusar o veredito', () => {
  it('grava o motivo junto do status', () => {
    const c = caso('5-mais-que-perfeito', null);
    const atualizado = reposTestes.atualizarStatus(db, c.id, 'rejeitado', 'a regra citada não vale aqui');
    expect(atualizado!.status).toBe('rejeitado');
    expect(atualizado!.motivo_rejeicao).toBe('a regra citada não vale aqui');
  });

  it('caso rejeitado sai das recorrências', () => {
    const a = caso('5-mais-que-perfeito', null);
    const b = caso('5-mais-que-perfeito', null);
    expect(reposTestes.recorrencias(db, obraId)).toHaveLength(1);
    reposTestes.atualizarStatus(db, a.id, 'rejeitado', null);
    expect(reposTestes.recorrencias(db, obraId)).toHaveLength(0);
  });

  it('caso rejeitado sai dos rótulos oferecidos ao modelo', () => {
    const a = caso('1-prosa-nao-legenda', null);
    expect(reposTestes.rotulosDeRegra(db, obraId)).toContain('1-prosa-nao-legenda');
    reposTestes.atualizarStatus(db, a.id, 'rejeitado', null);
    expect(reposTestes.rotulosDeRegra(db, obraId)).not.toContain('1-prosa-nao-legenda');
  });

  it('a recorrência conta só a folha do fio', () => {
    // Uma discussão de 4 turnos sobre a mesma regra é UMA lacuna, não quatro.
    let pai: number | null = null;
    for (let i = 0; i < 4; i++) pai = caso('4-sem-decalque', pai).id;
    const outro = caso('4-sem-decalque', null);
    expect(outro).toBeTruthy();
    const r = reposTestes.recorrencias(db, obraId).find((x) => x.secao_regra === '4-sem-decalque');
    expect(r?.casos).toBe(2); // a folha do fio + o caso solto
  });
});
