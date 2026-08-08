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
    expect(reposTestes.rotulosDeRegra(db, obraId).map((r) => r.rotulo)).toContain('1-prosa-nao-legenda');
    reposTestes.atualizarStatus(db, a.id, 'rejeitado', null);
    expect(reposTestes.rotulosDeRegra(db, obraId).map((r) => r.rotulo)).not.toContain('1-prosa-nao-legenda');
  });

  it('a recorrência conta a folha do fio, não a raiz', () => {
    // Raiz e folha têm rótulos DIFERENTES de propósito: numa cadeia sem
    // ramificação o número de raízes é sempre igual ao de folhas, então uma
    // fixture de rótulo único não pegaria a correlação invertida (contar raiz
    // em vez de folha). Contar raiz é a regressão que este teste existe para
    // barrar — um fio já resolvido (a folha mudou de status e saiu da lista)
    // continuaria empurrando a raiz como pendência para sempre.
    const raiz = caso('4-sem-decalque', null);
    const meio = caso(null, raiz.id);
    caso('1-prosa-nao-legenda', meio.id); // a folha do fio
    caso('1-prosa-nao-legenda', null); // caso solto, mesma regra da folha

    const recorrencias = reposTestes.recorrencias(db, obraId);
    expect(recorrencias).toEqual([{ secao_regra: '1-prosa-nao-legenda', casos: 2 }]);
    expect(recorrencias.find((r) => r.secao_regra === '4-sem-decalque')).toBeUndefined();
  });
});
