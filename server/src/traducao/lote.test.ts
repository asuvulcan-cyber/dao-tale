import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProvedorId } from '@dao-tale/shared';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { reposCapitulos, reposConfig, reposLotes, reposObras } from '../db/repos.js';
import { ErroProvedor, type RequisicaoTraducaoBloco } from '../ia/provedor.js';
import { cancelarLote, iniciarLote, loteEmExecucao, retomarLote } from './lote.js';

// Bateria do orquestrador de lote (doc 09 §5): provedores-espião por id, para
// exercitar failover, paralelismo, cancelamento e retomada.

type Comportamento = (req: RequisicaoTraducaoBloco) => void; // lança para falhar
const comportamentos: Record<string, Comportamento> = {};
const chamadasPorProvedor: Record<string, number> = {};
const qaChamadas: Record<string, number> = {};
let emVooMax = 0;
let emVooAtual = 0;

vi.mock('../credenciais/index.js', () => ({
  obterChave: async () => 'chave-teste',
}));

function criarProvedorEspiao(id: string) {
  return {
    id,
    nome: id,
    precisaChave: true,
    modeloPadrao: `${id}-v1`,
    async listarModelos() {
      return [];
    },
    async testarCredencial() {
      return { ok: true, mensagem: '' };
    },
    async traduzirBloco(_chave: string | null, req: RequisicaoTraducaoBloco) {
      chamadasPorProvedor[id] = (chamadasPorProvedor[id] ?? 0) + 1;
      emVooAtual++;
      emVooMax = Math.max(emVooMax, emVooAtual);
      await new Promise((r) => setTimeout(r, 5));
      emVooAtual--;
      comportamentos[id]?.(req);
      return {
        traducoes: req.frases.map((f) => ({ ordem: f.ordem, texto_pt: `PT ${f.ordem}` })),
        termos_novos: [],
        bruta: '{}',
      };
    },
    async analisarQa(_chave: string | null, req: { pares: { ordem: number }[] }) {
      qaChamadas[id] = (qaChamadas[id] ?? 0) + 1;
      // Um apontamento no 1º par, para verificar a persistência via lote.
      return {
        apontamentos: req.pares.slice(0, 1).map((p) => ({
          ordem: p.ordem,
          tipo: 'omissao' as const,
          severidade: 'media' as const,
          trecho_zh: '',
          observacao: 'qa lote',
          sugestao: null,
        })),
        bruta: '{}',
      };
    },
    async revisarFrase() {
      throw new Error('n/a');
    },
  };
}

vi.mock('../ia/fabrica.js', () => ({
  obterProvedor: (id: string) => criarProvedorEspiao(id),
}));

let db: BancoDados;

beforeEach(() => {
  db = abrirBanco(':memory:');
  for (const k of Object.keys(comportamentos)) delete comportamentos[k];
  for (const k of Object.keys(chamadasPorProvedor)) delete chamadasPorProvedor[k];
  for (const k of Object.keys(qaChamadas)) delete qaChamadas[k];
  emVooMax = 0;
  emVooAtual = 0;
});

function criarObraComCapitulos(qtd: number, provedorPadrao: ProvedorId = 'mock') {
  const obra = reposObras.criar(db, {
    titulo: 'Obra',
    prompt_inicial: { versao: '1.0', conteudo: 'Regras.' },
  });
  reposObras.atualizar(db, obra.id, { provedor_padrao: provedorPadrao });
  reposObras.definirFase(db, obra.id, 'cruzeiro');
  for (let n = 1; n <= qtd; n++) {
    reposCapitulos.criar(db, obra.id, { numero: n, texto_origem: `第${n}章` }, [
      { texto_zh: '一。', paragrafo: 0 },
      { texto_zh: '二。', paragrafo: 0 },
    ]);
  }
  return obra;
}

async function esperarLote(obraId: number): Promise<void> {
  for (let i = 0; i < 600 && loteEmExecucao(obraId); i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  expect(loteEmExecucao(obraId)).toBe(false);
}

describe('lote — caminho feliz', () => {
  it('traduz todos os capítulos e encerra concluído', async () => {
    const obra = criarObraComCapitulos(3);
    const r = iniciarLote(db, obra.id, {});
    expect(r.ok).toBe(true);
    await esperarLote(obra.id);

    const lote = reposLotes.atual(db, obra.id)!;
    expect(lote.status).toBe('concluido');
    expect(lote.capitulos.every((c) => c.status === 'concluido')).toBe(true);
    for (const cap of reposCapitulos.listar(db, obra.id)) {
      expect(cap.status).toBe('traduzido');
    }
  });
});

describe('lote — paralelismo', () => {
  it('respeita lote_paralelo (no máximo N capítulos em voo)', async () => {
    const obra = criarObraComCapitulos(5);
    reposConfig.definir(db, { lote_paralelo: 2 });
    iniciarLote(db, obra.id, {});
    await esperarLote(obra.id);
    expect(emVooMax).toBeLessThanOrEqual(2);
    expect(emVooMax).toBeGreaterThan(1); // de fato houve paralelismo
  });
});

describe('lote — failover', () => {
  it('quando o par padrão falha (fatal), o próximo par da cadeia assume', async () => {
    const obra = criarObraComCapitulos(2);
    // Padrão 'mock' sempre falha; failover para 'deepseek' que funciona.
    comportamentos['mock'] = () => {
      throw new ErroProvedor('sem crédito', 'fatal');
    };
    reposConfig.definir(db, { lote_paralelo: 1, failover: [{ provedor: 'deepseek', modelo: 'd1' }] });
    iniciarLote(db, obra.id, {});
    await esperarLote(obra.id);

    const lote = reposLotes.atual(db, obra.id)!;
    expect(lote.status).toBe('concluido');
    expect(lote.capitulos.every((c) => c.status === 'concluido')).toBe(true);
    // Cada capítulo tentou os dois pares; o deepseek concluiu.
    for (const cap of lote.capitulos) {
      expect(cap.provedores_tentados.map((p) => p.provedor)).toEqual(['mock', 'deepseek']);
    }
    expect(chamadasPorProvedor['deepseek']).toBeGreaterThan(0);
  });

  it('cadeia esgotada deixa o item em erro e o lote segue', async () => {
    const obra = criarObraComCapitulos(2);
    comportamentos['mock'] = () => {
      throw new ErroProvedor('sem crédito', 'fatal');
    };
    // Sem failover: a cadeia tem só o par padrão.
    iniciarLote(db, obra.id, {});
    await esperarLote(obra.id);

    const lote = reposLotes.atual(db, obra.id)!;
    expect(lote.status).toBe('concluido'); // o lote termina, mesmo com itens em erro
    expect(lote.capitulos.every((c) => c.status === 'erro')).toBe(true);
  });
});

describe('lote — QA automática', () => {
  it('roda QA ao concluir cada capítulo quando o par difere do tradutor', async () => {
    const obra = criarObraComCapitulos(2); // tradutor: mock
    reposConfig.definir(db, { lote_paralelo: 1, provedor_qa: 'gemini', modelo_qa: 'g' });
    const r = iniciarLote(db, obra.id, { qaAutomatica: true });
    expect(r.ok).toBe(true);
    await esperarLote(obra.id);

    const lote = reposLotes.atual(db, obra.id)!;
    expect(lote.status).toBe('concluido');
    expect(lote.capitulos.every((c) => c.status === 'concluido')).toBe(true);
    // O QA (gemini) rodou em cada capítulo e gravou apontamentos.
    expect(qaChamadas['gemini']).toBeGreaterThanOrEqual(2);
    for (const cap of reposCapitulos.listar(db, obra.id)) {
      expect(cap.qa_em).not.toBeNull();
      expect(cap.qa_pendentes).toBeGreaterThan(0);
    }
  });

  it('pula o QA (sem derrubar o lote) quando o par de QA é igual ao tradutor', async () => {
    const obra = criarObraComCapitulos(1); // tradutor: mock
    reposConfig.definir(db, { lote_paralelo: 1, provedor_qa: 'mock', modelo_qa: 'mock-v1' });
    iniciarLote(db, obra.id, { qaAutomatica: true });
    await esperarLote(obra.id);

    const lote = reposLotes.atual(db, obra.id)!;
    expect(lote.status).toBe('concluido');
    expect(lote.capitulos[0].status).toBe('concluido');
    expect(qaChamadas['mock'] ?? 0).toBe(0); // QA pulado (par igual)
  });
});

describe('lote — cancelamento', () => {
  it('cancelar interrompe e encerra como cancelado', async () => {
    const obra = criarObraComCapitulos(6);
    reposConfig.definir(db, { lote_paralelo: 1 });
    iniciarLote(db, obra.id, {});
    // Cancela quase imediatamente (durante o 1º capítulo).
    await new Promise((r) => setTimeout(r, 8));
    expect(cancelarLote(db, obra.id)).toBe(true);
    await esperarLote(obra.id);

    const lote = reposLotes.atual(db, obra.id)!;
    expect(lote.status).toBe('cancelado');
    // Sobrou capítulo na fila que virou cancelado (não foi tudo traduzido).
    expect(lote.capitulos.some((c) => c.status === 'cancelado')).toBe(true);
  });
});

describe('lote — retomada', () => {
  it('retomar reprocessa só os itens não concluídos', async () => {
    const obra = criarObraComCapitulos(3);
    // Simula um lote interrompido: 1 concluído, 2 na fila.
    const lote = reposLotes.criar(db, obra.id, reposCapitulos.listar(db, obra.id).map((c) => c.id), false);
    const caps = lote.capitulos;
    reposLotes.definirStatusCapitulo(db, lote.id, caps[0].capitulo_id, 'concluido');
    // O capítulo 1 já está "traduzido" de fato? Não; forçamos o status do lote.
    reposLotes.encerrar(db, lote.id, 'interrompido');

    const r = retomarLote(db, obra.id);
    expect(r.ok).toBe(true);
    await esperarLote(obra.id);

    const final = reposLotes.atual(db, obra.id)!;
    expect(final.status).toBe('concluido');
    // O capítulo já concluído não foi re-traduzido.
    expect(chamadasPorProvedor['mock']).toBe(2); // só os 2 pendentes
  });
});

describe('lote — guardas', () => {
  it('recusa lote em obra em calibração', () => {
    const obra = criarObraComCapitulos(1);
    reposObras.definirFase(db, obra.id, 'calibracao');
    const r = iniciarLote(db, obra.id, {});
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('calibração');
  });

  it('recusa segundo lote enquanto um está ativo', async () => {
    const obra = criarObraComCapitulos(3);
    reposConfig.definir(db, { lote_paralelo: 1 });
    iniciarLote(db, obra.id, {});
    const r2 = iniciarLote(db, obra.id, {});
    expect(r2.ok).toBe(false);
    await esperarLote(obra.id);
  });
});
