import { beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { reposCapitulos, reposFrases, reposObras, reposTestes } from '../db/repos.js';
import { criarApp } from '../app.js';
import { provedorMock } from '../ia/mock.js';
import type { RequisicaoRefinarPrompt } from '../ia/provedor.js';
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

  it('só a rota diretriz vai ao refinador', async () => {
    // Uma edição de tipografia e uma de vocabulário na mesma obra: só a segunda
    // pode chegar à chamada paga.
    const cap = reposCapitulos.criar(db, obraId, { numero: 2, texto_origem: '乙说。丙说。' }, [
      { texto_zh: '乙说。', paragrafo: 0 },
      { texto_zh: '丙说。', paragrafo: 0 },
    ]);
    const [f1, f2] = reposFrases.listarPorCapitulo(db, cap.id);
    // Tipografia: só o caractere da aspa muda.
    reposFrases.aplicarTraducaoIa(db, f1.id, 'ele disse ‘vá’ agora');
    reposFrases.editarTexto(db, f1.id, "ele disse 'vá' agora");
    // Vocabulário sem tema/glossário: candidata a diretriz.
    reposFrases.aplicarTraducaoIa(db, f2.id, 'ele já é um morto');
    reposFrases.editarTexto(db, f2.id, 'ele já é um cadáver');

    const todas = await (await app.request(`/api/obras/${obraId}/edicoes-manuais`)).json();
    expect(todas.map((e: { rota: string }) => e.rota).sort()).toEqual(['diretriz', 'tipografia']);
  });
});

// Achado da revisão da rodada 1: o teste acima chama `GET /edicoes-manuais`,
// que é DELIBERADAMENTE não filtrada (a tela precisa ver o quadro inteiro) —
// então ele não protege o `.filter((e) => e.rota === 'diretriz')` nem o teto
// dentro da rota `POST .../sugerir-refinamento`. Alguém podia trocar `===` por
// `!==`, ou apagar o filtro/teto inteiros, que a suíte continuava verde. Este
// bloco inspeciona o `RequisicaoRefinarPrompt` que de fato chega ao provedor.
describe('o que chega ao provedor (trava de rota do refinamento)', () => {
  it('só edições de rota diretriz entram em req.edicoes, até um teto de 15', async () => {
    // Recorrência que libera a chamada paga (mesmo padrão dos testes acima).
    caso('1-prosa-nao-legenda', null);
    caso('1-prosa-nao-legenda', null);

    // 20 candidatas a diretriz — acima do teto de 15, para o mesmo teste também
    // provar o corte — mais uma de tipografia e uma de chave-estilo, que têm
    // dono em outra camada e NUNCA podem chegar ao provedor.
    const N_DIRETRIZ = 20;
    const textosZh = ['甲。', '乙。', ...Array.from({ length: N_DIRETRIZ }, (_, i) => `frase${i}。`)];
    const cap = reposCapitulos.criar(
      db,
      obraId,
      { numero: 9, texto_origem: textosZh.join('\n') },
      textosZh.map((texto_zh) => ({ texto_zh, paragrafo: 0 })),
    );
    const frases = reposFrases.listarPorCapitulo(db, cap.id);

    // Rota tipografia: só o caractere da aspa muda.
    reposFrases.aplicarTraducaoIa(db, frases[0].id, 'ele disse ‘vá’ agora');
    reposFrases.editarTexto(db, frases[0].id, "ele disse 'vá' agora");
    // Rota chave-estilo: mais-que-perfeito desfeito (dono é Beta).
    reposFrases.aplicarTraducaoIa(db, frases[1].id, 'concluindo que ele errara');
    reposFrases.editarTexto(db, frases[1].id, 'concluindo que ele errou');
    // Rota diretriz: vocabulário sem tema/glossário — a única elegível.
    for (let i = 0; i < N_DIRETRIZ; i++) {
      reposFrases.aplicarTraducaoIa(db, frases[2 + i].id, 'ele já é um morto');
      reposFrases.editarTexto(db, frases[2 + i].id, 'ele já é um cadáver');
    }

    const spy = vi.spyOn(provedorMock, 'refinarPrompt');
    try {
      const r = await app.request(`/api/obras/${obraId}/prompts/sugerir-refinamento`, { method: 'POST' });
      expect(r.status).toBe(200);
      expect(spy).toHaveBeenCalledTimes(1);
      const reqEnviado = spy.mock.calls[0][1] as RequisicaoRefinarPrompt;

      // Teto: 20 edições candidatas, só 15 chegam ao provedor.
      expect(reqEnviado.edicoes).toHaveLength(15);
      // Rota: nenhuma das 15 é a de tipografia ou a de chave-estilo — só a
      // classificada como diretriz (identificada aqui pelo próprio conteúdo,
      // já que o payload não carrega o campo `rota`).
      expect(reqEnviado.edicoes!.every((e) => e.ia === 'ele já é um morto' && e.voce === 'ele já é um cadáver')).toBe(
        true,
      );
    } finally {
      spy.mockRestore();
    }
  });
});

// Achado da revisão final: os dois `return 409` liam SÓ o banco de testes,
// mesmo a chamada usando dois canais (`casos` do banco de testes e `edicoes`
// da mineração manual). Na 死人经 real eram 146 edições manuais contra 25 casos
// — o canal escasso era o único capaz de abrir o portão, e "Incluir no próximo
// refinamento" caía numa parede que nem mencionava as 37 candidatas.
describe('edições manuais liberam a chamada mesmo sem recorrência no banco de testes', () => {
  it('nenhuma recorrência, mas uma edição diretriz: a chamada segue (casos vazio, edicoes preenchido)', async () => {
    reposFrases.aplicarTraducaoIa(db, fraseId, 'ele já é um morto');
    reposFrases.editarTexto(db, fraseId, 'ele já é um cadáver');

    const spy = vi.spyOn(provedorMock, 'refinarPrompt');
    try {
      const r = await app.request(`/api/obras/${obraId}/prompts/sugerir-refinamento`, { method: 'POST' });
      expect(r.status).toBe(200);
      const reqEnviado = spy.mock.calls[0][1] as RequisicaoRefinarPrompt;
      expect(reqEnviado.casos).toEqual([]);
      expect(reqEnviado.edicoes).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('recorrência só de camada dona (núcleo) + edição diretriz: a chamada segue mesmo assim', async () => {
    // Sozinha, esta recorrência dispararia o 409 so-camadas-donas de antes —
    // 4-sem-decalque é tema de Alfa, nenhuma delas "é da obra".
    caso('4-sem-decalque', null);
    caso('4-sem-decalque', null);

    const cap = reposCapitulos.criar(db, obraId, { numero: 2, texto_origem: '乙说。' }, [
      { texto_zh: '乙说。', paragrafo: 0 },
    ]);
    const [f2] = reposFrases.listarPorCapitulo(db, cap.id);
    reposFrases.aplicarTraducaoIa(db, f2.id, 'ele já é um morto');
    reposFrases.editarTexto(db, f2.id, 'ele já é um cadáver');

    const r = await app.request(`/api/obras/${obraId}/prompts/sugerir-refinamento`, { method: 'POST' });
    expect(r.status).toBe(200);
  });

  it('nem recorrência nem edição manual: o 409 sem-recorrencias diz que os DOIS canais estão vazios', async () => {
    const r = await app.request(`/api/obras/${obraId}/prompts/sugerir-refinamento`, { method: 'POST' });
    expect(r.status).toBe(409);
    const corpo = await r.json();
    expect(corpo.erro.codigo).toBe('sem-recorrencias');
    expect(corpo.erro.mensagem).toMatch(/edi[çc][ãa]o manual/i);
  });

  it('recorrência só de camada dona (núcleo), SEM edição manual: o 409 so-camadas-donas diz que as edições também não bastam', async () => {
    caso('4-sem-decalque', null);
    caso('4-sem-decalque', null);
    const r = await app.request(`/api/obras/${obraId}/prompts/sugerir-refinamento`, { method: 'POST' });
    expect(r.status).toBe(409);
    const corpo = await r.json();
    expect(corpo.erro.codigo).toBe('so-camadas-donas');
    expect(corpo.erro.mensagem).toMatch(/edi[çc][ãa]o manual/i);
  });
});
