import { beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { reposCapitulos, reposConfig, reposFrases, reposObras } from '../db/repos.js';
import { ErroProvedor, type RequisicaoTraducaoBloco, type RespostaTraducaoBloco } from '../ia/provedor.js';
import { USO_VAZIO } from '../ia/uso.js';
import {
  _backoffsParaTeste,
  cancelarJob,
  iniciarTraducao,
  jobEmExecucao,
  traduzirBlocoComRetry,
  type ResultadoJob,
} from './job.js';

// Bateria do pipeline (M8 da auditoria): provedor-espião programável — cada
// teste define o comportamento por chamada e inspeciona as requisições.

const requisicoes: RequisicaoTraducaoBloco[] = [];
let comportamento: (req: RequisicaoTraducaoBloco, chamada: number) => RespostaTraducaoBloco;

const respostaPadrao = (req: RequisicaoTraducaoBloco): RespostaTraducaoBloco => ({
  traducoes: req.frases.map((f) => ({ ordem: f.ordem, texto_pt: `PT ${f.ordem}` })),
  termos_novos: [],
  bruta: '{}',
  uso: USO_VAZIO,
});

// Chave assíncrona: reabre a janela da corrida C1 (checagem → await → registro)
// que o teste da largada exercita.
vi.mock('../credenciais/index.js', () => ({
  obterChave: async () => {
    await new Promise((r) => setTimeout(r, 5));
    return 'chave-teste';
  },
}));

vi.mock('../ia/fabrica.js', () => ({
  obterProvedor: () => ({
    id: 'mock',
    nome: 'Espião',
    precisaChave: true,
    modeloPadrao: 'espiao-v1',
    async listarModelos() {
      return [];
    },
    async testarCredencial() {
      return { ok: true, mensagem: '' };
    },
    async traduzirBloco(_chave: string | null, req: RequisicaoTraducaoBloco) {
      requisicoes.push(structuredClone(req));
      return comportamento(req, requisicoes.length);
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
  comportamento = (req) => respostaPadrao(req);
  _backoffsParaTeste([1, 1], [1, 1]);
});

function criarCapitulo(frases: string[], opcoes?: { glossario?: { termo_zh: string; termo_pt: string }[] }) {
  const obra = reposObras.criar(db, {
    titulo: 'Teste',
    prompt_inicial: { versao: '1.0', conteudo: 'Regras.' },
    glossario_inicial: opcoes?.glossario?.map((g) => ({ ...g, categoria: 'personagem' })),
  });
  const capitulo = reposCapitulos.criar(
    db,
    obra.id,
    { numero: 1, texto_origem: '(origem)' },
    frases.map((texto_zh, i) => ({ texto_zh, paragrafo: i < 2 ? 0 : 1 })),
  );
  return { obra, capitulo };
}

async function esperarJob(capituloId: number): Promise<void> {
  for (let i = 0; i < 400 && jobEmExecucao(capituloId); i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  expect(jobEmExecucao(capituloId)).toBe(false);
}

describe('termos adotados realimentados entre blocos', () => {
  it('bloco seguinte recebe o termo adotado; termos do glossário não duplicam', async () => {
    const { capitulo } = criarCapitulo(
      ['归墟在等待。', '齐夏醒了。', '归墟又出现了。', '齐夏走向归墟。'],
      { glossario: [{ termo_zh: '齐夏', termo_pt: 'Qi Xia' }] },
    );
    reposConfig.definir(db, { tamanho_bloco: 2, cauda_contexto: 1 });
    comportamento = (req, chamada) => ({
      ...respostaPadrao(req),
      // O 1º bloco "descobre" dois termos: um inédito e um que já está no
      // glossário do banco (com outra tradução).
      termos_novos:
        chamada === 1
          ? [
              { termo_zh: '归墟', termo_pt: 'Abismo do Retorno' },
              { termo_zh: '齐夏', termo_pt: 'Qi Xia Divergente' },
            ]
          : [],
    });

    const inicio = await iniciarTraducao(db, capitulo.id, { provedor: 'mock' });
    expect(inicio.ok).toBe(true);
    await esperarJob(capitulo.id);

    expect(requisicoes).toHaveLength(2);
    expect(requisicoes[0].termosAdotados).toEqual([]);
    // 2º bloco: o termo inédito do 1º bloco viaja como adotado; o termo que já
    // está no glossário do banco fica de fora (o glossário tem precedência).
    expect(requisicoes[1].termosAdotados).toEqual([{ termo_zh: '归墟', termo_pt: 'Abismo do Retorno' }]);
  });
});

describe('largada do job (C1)', () => {
  it('duas chamadas próximas iniciam UM job só', async () => {
    const { capitulo } = criarCapitulo(['一。', '二。']);
    const [a, b] = await Promise.all([
      iniciarTraducao(db, capitulo.id, { provedor: 'mock' }),
      iniciarTraducao(db, capitulo.id, { provedor: 'mock' }),
    ]);
    await esperarJob(capitulo.id);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    // Um job só: nenhuma frase foi traduzida (e paga) duas vezes.
    expect(requisicoes).toHaveLength(1);
  });
});

describe('desfechos do job', () => {
  it('erro fatal para o job e o capítulo não fica preso em "traduzindo" (M6)', async () => {
    const { capitulo } = criarCapitulo(['一。', '二。', '三。', '四。']);
    reposConfig.definir(db, { tamanho_bloco: 2 });
    comportamento = (req, chamada) => {
      if (chamada === 2) throw new ErroProvedor('chave revogada', 'fatal');
      return respostaPadrao(req);
    };
    const desfechos: ResultadoJob[] = [];
    await iniciarTraducao(db, capitulo.id, { provedor: 'mock' }, (r) => desfechos.push(r));
    await esperarJob(capitulo.id);

    expect(desfechos).toEqual([{ tipo: 'fatal', mensagem: 'chave revogada' }]);
    // 1º bloco traduzido, resto pendente → 'parcial', nunca 'traduzindo'.
    expect(reposCapitulos.obter(db, capitulo.id)?.status).toBe('parcial');
    const frases = reposFrases.listarPorCapitulo(db, capitulo.id);
    expect(frases.filter((f) => f.status_traducao === 'traduzida')).toHaveLength(2);
    expect(frases.filter((f) => f.status_traducao === 'pendente')).toHaveLength(2);
  });

  it('bloco com erro transitório esgotado marca erro e o job continua (retomada retraduz)', async () => {
    const { capitulo } = criarCapitulo(['一。', '二。', '三。', '四。']);
    reposConfig.definir(db, { tamanho_bloco: 2 });
    comportamento = (req, chamada) => {
      // O 1º bloco falha em todas as tentativas (1 + 2 retries); o 2º passa.
      if (requisicoes[chamada - 1].frases[0]?.ordem === 0) throw new ErroProvedor('timeout', 'transitorio');
      return respostaPadrao(req);
    };
    const desfechos: ResultadoJob[] = [];
    await iniciarTraducao(db, capitulo.id, { provedor: 'mock' }, (r) => desfechos.push(r));
    await esperarJob(capitulo.id);

    expect(desfechos).toEqual([{ tipo: 'parcial', frases_erro: 2 }]);
    const frases = reposFrases.listarPorCapitulo(db, capitulo.id);
    expect(frases.filter((f) => f.status_traducao === 'erro')).toHaveLength(2);
    expect(frases.filter((f) => f.status_traducao === 'traduzida')).toHaveLength(2);
    expect(reposCapitulos.obter(db, capitulo.id)?.status).toBe('parcial');

    // Retomada: frases em erro voltam à fila e o capítulo completa.
    comportamento = (req) => respostaPadrao(req);
    await iniciarTraducao(db, capitulo.id, { provedor: 'mock' });
    await esperarJob(capitulo.id);
    expect(reposCapitulos.obter(db, capitulo.id)?.status).toBe('traduzido');
  });

  it('limite com parar_no_limite pausa limpo: frases seguem pendentes', async () => {
    const { capitulo } = criarCapitulo(['一。', '二。']);
    reposConfig.definir(db, { parar_no_limite: true });
    comportamento = () => {
      throw new ErroProvedor('429', 'limite');
    };
    const desfechos: ResultadoJob[] = [];
    await iniciarTraducao(db, capitulo.id, { provedor: 'mock' }, (r) => desfechos.push(r));
    await esperarJob(capitulo.id);

    expect(desfechos[0]?.tipo).toBe('limite');
    const frases = reposFrases.listarPorCapitulo(db, capitulo.id);
    expect(frases.every((f) => f.status_traducao === 'pendente')).toBe(true);
    // Nada traduzido ainda → volta a rascunho, não fica em 'traduzindo'.
    expect(reposCapitulos.obter(db, capitulo.id)?.status).toBe('rascunho');
  });

  it('cancelamento no meio deixa estado coerente', async () => {
    const { capitulo } = criarCapitulo(['一。', '二。', '三。', '四。']);
    reposConfig.definir(db, { tamanho_bloco: 2 });
    comportamento = (req) => {
      // Cancela "pelo usuário" durante o 1º bloco: o job persiste o bloco e para.
      cancelarJob(capitulo.id);
      return respostaPadrao(req);
    };
    const desfechos: ResultadoJob[] = [];
    await iniciarTraducao(db, capitulo.id, { provedor: 'mock' }, (r) => desfechos.push(r));
    await esperarJob(capitulo.id);

    expect(desfechos).toEqual([{ tipo: 'cancelado' }]);
    expect(requisicoes).toHaveLength(1);
    expect(reposCapitulos.obter(db, capitulo.id)?.status).toBe('parcial');
  });
});

describe('truncamento (A1)', () => {
  it('resposta truncada divide o bloco ao meio em vez de repetir a chamada', async () => {
    const { capitulo } = criarCapitulo(['一。', '二。', '三。', '四。']);
    reposConfig.definir(db, { tamanho_bloco: 60 });
    comportamento = (req) => {
      if (req.frases.length > 2) throw new ErroProvedor('truncado', 'truncado');
      return respostaPadrao(req);
    };
    await iniciarTraducao(db, capitulo.id, { provedor: 'mock' });
    await esperarJob(capitulo.id);

    // 1ª chamada (4 frases) trunca → blocos de 2 dali em diante.
    expect(requisicoes.map((r) => r.frases.length)).toEqual([4, 2, 2]);
    expect(reposCapitulos.obter(db, capitulo.id)?.status).toBe('traduzido');
  });

  it('frase única que trunca vira erro, sem laço infinito', async () => {
    const { capitulo } = criarCapitulo(['一。', '二。']);
    reposConfig.definir(db, { tamanho_bloco: 1 });
    comportamento = (req, chamada) => {
      if (chamada === 1) throw new ErroProvedor('truncado', 'truncado');
      return respostaPadrao(req);
    };
    await iniciarTraducao(db, capitulo.id, { provedor: 'mock' });
    await esperarJob(capitulo.id);

    const frases = reposFrases.listarPorCapitulo(db, capitulo.id);
    expect(frases.filter((f) => f.status_traducao === 'erro')).toHaveLength(1);
    expect(frases.filter((f) => f.status_traducao === 'traduzida')).toHaveLength(1);
  });
});

describe('traduzirBlocoComRetry (M1)', () => {
  const req = { modelo: 'm', promptMae: 'p', glossario: [], caudaAnterior: [], frases: [], proximas: [] };
  const provedorQueFalha = (erros: ErroProvedor[], resposta?: RespostaTraducaoBloco) => {
    let chamada = 0;
    return {
      async traduzirBloco() {
        chamada++;
        if (chamada <= erros.length) throw erros[chamada - 1];
        if (!resposta) throw new Error('sem resposta programada');
        return resposta;
      },
    } as unknown as Parameters<typeof traduzirBlocoComRetry>[0];
  };

  it('transitório: tenta de novo e devolve ok', async () => {
    const ok: RespostaTraducaoBloco = { traducoes: [], termos_novos: [], bruta: '{}', uso: USO_VAZIO };
    const r = await traduzirBlocoComRetry(
      provedorQueFalha([new ErroProvedor('rede', 'transitorio')], ok),
      null,
      req,
      { pararNoLimite: false, backoffMs: [1, 1] },
    );
    expect(r.tipo).toBe('ok');
  });

  it('429 sem parar_no_limite usa backoff próprio e, esgotado, pausa como limite (não erro)', async () => {
    const tentativas: number[] = [];
    const r = await traduzirBlocoComRetry(
      provedorQueFalha([
        new ErroProvedor('429', 'limite'),
        new ErroProvedor('429', 'limite'),
        new ErroProvedor('429', 'limite'),
      ]),
      null,
      req,
      { pararNoLimite: false, backoffLimiteMs: [1, 1], aoTentar: () => tentativas.push(1) },
    );
    expect(r.tipo).toBe('limite');
    expect(tentativas).toHaveLength(3); // 1 original + 2 esperas longas
  });

  it('respeita Retry-After do provedor', async () => {
    const inicio = Date.now();
    const ok: RespostaTraducaoBloco = { traducoes: [], termos_novos: [], bruta: '{}', uso: USO_VAZIO };
    const r = await traduzirBlocoComRetry(
      provedorQueFalha([new ErroProvedor('429', 'limite', { retryAfterMs: 50 })], ok),
      null,
      req,
      { pararNoLimite: false, backoffLimiteMs: [5000] },
    );
    expect(r.tipo).toBe('ok');
    // Esperou o Retry-After (50 ms), não o backoff padrão (5 s).
    expect(Date.now() - inicio).toBeLessThan(3000);
  });

  it('cancelamento interrompe a espera do backoff', async () => {
    let cancelado = false;
    setTimeout(() => (cancelado = true), 20);
    const r = await traduzirBlocoComRetry(
      provedorQueFalha([new ErroProvedor('429', 'limite')]),
      null,
      req,
      { pararNoLimite: false, backoffLimiteMs: [60_000], cancelado: () => cancelado },
    );
    expect(r.tipo).toBe('cancelado');
  });
});
