import { beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { reposCapitulos, reposConfig, reposObras } from '../db/repos.js';
import type { RequisicaoTraducaoBloco } from '../ia/provedor.js';
import { iniciarTraducao, jobEmExecucao } from './job.js';

// Provedor espião: registra cada requisição enviada pelo job, para verificar a
// realimentação dos termos adotados entre blocos do mesmo capítulo.

const requisicoes: RequisicaoTraducaoBloco[] = [];

vi.mock('../ia/fabrica.js', () => ({
  obterProvedor: () => ({
    id: 'mock',
    nome: 'Espião',
    precisaChave: false,
    modeloPadrao: 'espiao-v1',
    async listarModelos() {
      return [];
    },
    async testarCredencial() {
      return { ok: true, mensagem: '' };
    },
    async traduzirBloco(_chave: string | null, req: RequisicaoTraducaoBloco) {
      requisicoes.push(structuredClone(req));
      return {
        traducoes: req.frases.map((f) => ({ ordem: f.ordem, texto_pt: `PT ${f.ordem}` })),
        // O 1º bloco "descobre" dois termos: um inédito e um que já está no
        // glossário do banco (com outra tradução).
        termos_novos:
          requisicoes.length === 1
            ? [
                { termo_zh: '归墟', termo_pt: 'Abismo do Retorno' },
                { termo_zh: '齐夏', termo_pt: 'Qi Xia Divergente' },
              ]
            : [],
        bruta: '{}',
      };
    },
    async revisarFrase() {
      throw new Error('não usado neste teste');
    },
  }),
}));

let db: BancoDados;

beforeEach(() => {
  db = abrirBanco(':memory:');
  requisicoes.length = 0;
});

async function esperarJob(capituloId: number): Promise<void> {
  for (let i = 0; i < 200 && jobEmExecucao(capituloId); i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  expect(jobEmExecucao(capituloId)).toBe(false);
}

describe('termos adotados realimentados entre blocos', () => {
  it('bloco seguinte recebe o termo adotado; termos do glossário não duplicam', async () => {
    const obra = reposObras.criar(db, {
      titulo: 'Teste',
      prompt_inicial: { versao: '1.0', conteudo: 'Regras.' },
      glossario_inicial: [{ termo_zh: '齐夏', termo_pt: 'Qi Xia', categoria: 'personagem' }],
    });
    const capitulo = reposCapitulos.criar(
      db,
      obra.id,
      { numero: 1, texto_origem: '(origem)' },
      [
        { texto_zh: '归墟在等待。', paragrafo: 0 },
        { texto_zh: '齐夏醒了。', paragrafo: 0 },
        { texto_zh: '归墟又出现了。', paragrafo: 1 },
        { texto_zh: '齐夏走向归墟。', paragrafo: 1 },
      ],
    );
    reposConfig.definir(db, { tamanho_bloco: 2, cauda_contexto: 1 });

    const inicio = await iniciarTraducao(db, capitulo.id, { provedor: 'mock' });
    expect(inicio.ok).toBe(true);
    await esperarJob(capitulo.id);

    expect(requisicoes).toHaveLength(2);
    // 1º bloco: nada adotado ainda.
    expect(requisicoes[0].termosAdotados).toEqual([]);
    // 2º bloco: o termo inédito do 1º bloco viaja como adotado; o termo que já
    // está no glossário do banco fica de fora (o glossário tem precedência).
    expect(requisicoes[1].termosAdotados).toEqual([{ termo_zh: '归墟', termo_pt: 'Abismo do Retorno' }]);
  });
});
