import { beforeEach, describe, expect, it } from 'vitest';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { reposCapitulos, reposFrases, reposObras, reposTestes } from '../db/repos.js';
import { criarApp } from '../app.js';
import type { Hono } from 'hono';

// Doc 15 §7: a partição por tema diz que cada assunto pertence a UMA camada.
// A rota de refinamento já filtrava recorrência de chave de Beta (vira toggle,
// não texto); faltava o ramo de Alfa — recorrência de tema do núcleo não pode
// virar diretriz de obra, senão a sobreposição que a partição existe para
// impedir entra pela porta do refinamento.

process.env.DAO_TALE_MOCK_LATENCIA = '0';
process.env.DAO_TALE_DIR = '/tmp/dao-tale-teste-refino-camada';

let db: BancoDados;
let app: Hono;
let obraId: number;
let fraseId: number;

beforeEach(() => {
  db = abrirBanco(':memory:');
  app = criarApp(db);
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

describe('roteamento do refino por camada', () => {
  it('recorrência de tema do núcleo não vira diretriz de obra', async () => {
    // 4-sem-decalque é tema de Alfa. Hoje passa direto e viraria regra no Delta.
    caso('4-sem-decalque', null);
    caso('4-sem-decalque', null);
    const r = await app.request(`/api/obras/${obraId}/prompts/sugerir-refinamento`, { method: 'POST' });
    expect(r.status).toBe(409);
    const corpo = await r.json();
    expect(corpo.erro.codigo).toBe('so-camadas-donas');
    expect(corpo.erro.mensagem).toMatch(/n[úu]cleo/i);
  });

  it('recorrência sem tema segue para a chamada paga', async () => {
    caso('1-prosa-nao-legenda', null);
    caso('1-prosa-nao-legenda', null);
    const r = await app.request(`/api/obras/${obraId}/prompts/sugerir-refinamento`, { method: 'POST' });
    expect(r.status).toBe(200);
  });
});
