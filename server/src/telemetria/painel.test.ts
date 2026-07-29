import { beforeEach, describe, expect, it } from 'vitest';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { reposCapitulos, reposConfig, reposFrases, reposLotes, reposObras, reposUso } from '../db/repos.js';
import { reposEventos } from '../db/eventosIa.js';
import type { UsoChamada } from '../ia/provedor.js';
import { registrarEvento, recalcularCustos } from './registrar.js';
import { telemetriaDaObra, telemetriaDoDia } from './painel.js';

// Painel de custo × qualidade (doc 11 §5). Os testes cobrem as três perguntas
// financeiras e, sobretudo, o que o painel NÃO pode fazer: exibir custo
// incompleto como se fosse total.

let db: BancoDados;

beforeEach(() => {
  db = abrirBanco(':memory:');
  // Preço só para 'claude'; 'mock' fica deliberadamente sem preço.
  reposConfig.definir(db, { precos_modelos: { 'claude:sonnet': { entrada: 3, saida: 15 } } });
});

const uso = (p: Partial<UsoChamada> = {}): UsoChamada => ({
  tokens_entrada: 1_000_000,
  tokens_saida: 0,
  tokens_cache_leitura: 0,
  tokens_cache_criacao: 0,
  ...p,
});

function obraComCapitulos(quantos: number) {
  const obra = reposObras.criar(db, { titulo: 'O', prompt_inicial: { versao: '1.0', conteudo: 'R.' } });
  const caps = [];
  for (let n = 1; n <= quantos; n++) {
    const cap = reposCapitulos.criar(db, obra.id, { numero: n, texto_origem: 'x' }, [
      { texto_zh: '甲。', paragrafo: 0 },
      { texto_zh: '乙。', paragrafo: 0 },
    ]);
    for (const f of reposFrases.listarPorCapitulo(db, cap.id)) reposFrases.aplicarTraducaoIa(db, f.id, `PT ${f.ordem}`);
    reposCapitulos.atualizar(db, cap.id, { status: 'traduzido' });
    caps.push(cap);
  }
  return { obra, caps };
}

describe('agregação por obra e capítulo', () => {
  it('soma tokens e custo por capítulo e por papel', () => {
    const { obra, caps } = obraComCapitulos(1);
    registrarEvento(db, {
      obra_id: obra.id,
      capitulo_id: caps[0].id,
      papel: 'traducao',
      provedor: 'claude',
      modelo: 'sonnet',
      uso: uso({ tokens_saida: 100_000 }),
    });
    registrarEvento(db, {
      obra_id: obra.id,
      capitulo_id: caps[0].id,
      papel: 'qa',
      provedor: 'claude',
      modelo: 'sonnet',
      uso: uso(),
    });

    const t = telemetriaDaObra(db, obra.id);
    expect(t.total.chamadas).toBe(2);
    expect(t.total.tokens_entrada).toBe(2_000_000);
    // 2 × US$ 3 de entrada + US$ 1,50 de saída (100k a 15/1M)
    expect(t.total.custo_usd).toBeCloseTo(7.5, 10);
    expect(t.por_papel.map((p) => p.papel).sort()).toEqual(['qa', 'traducao']);
    expect(t.capitulos[0].chamadas).toBe(2);
    // 2 frases no capítulo → US$/1k frases = custo × 500
    expect(t.capitulos[0].custo_por_mil_frases).toBeCloseTo(7.5 * 500, 6);
  });

  it('qualidade vem dos agregados existentes, não é recalculada', () => {
    const { obra, caps } = obraComCapitulos(1);
    const frases = reposFrases.listarPorCapitulo(db, caps[0].id);
    reposFrases.editarTexto(db, frases[0].id, 'editada à mão');
    reposCapitulos.definirConsistencia(db, caps[0].id, 4);

    const cap = telemetriaDaObra(db, obra.id).capitulos[0];
    expect(cap.frases_total).toBe(2);
    expect(cap.frases_editadas).toBe(1);
    expect(cap.consistencia_violacoes).toBe(4);
    expect(cap.qa_pendentes).toBe(0);
  });

  it('capítulo sem nenhuma chamada aparece zerado, não desaparece', () => {
    const { obra } = obraComCapitulos(2);
    const t = telemetriaDaObra(db, obra.id);
    expect(t.capitulos).toHaveLength(2);
    expect(t.capitulos[0].chamadas).toBe(0);
    expect(t.capitulos[0].custo_por_mil_frases).toBeNull();
  });

  it('chamada sem preço não vira US$ 0,00: conta em sem_preco e anula o US$/1k', () => {
    const { obra, caps } = obraComCapitulos(1);
    registrarEvento(db, {
      obra_id: obra.id,
      capitulo_id: caps[0].id,
      papel: 'traducao',
      provedor: 'mock',
      modelo: 'mock-v1',
      uso: uso(),
    });
    const t = telemetriaDaObra(db, obra.id);
    expect(t.total.chamadas_sem_preco).toBe(1);
    expect(t.sem_preco).toEqual([{ provedor: 'mock', modelo: 'mock-v1', chamadas: 1 }]);
    expect(t.capitulos[0].custo_por_mil_frases).toBeNull();
  });

  it('apagar o capítulo não apaga o gasto da obra (livro-caixa)', () => {
    const { obra, caps } = obraComCapitulos(1);
    registrarEvento(db, {
      obra_id: obra.id,
      capitulo_id: caps[0].id,
      papel: 'traducao',
      provedor: 'claude',
      modelo: 'sonnet',
      uso: uso(),
    });
    reposCapitulos.excluir(db, caps[0].id);
    const t = telemetriaDaObra(db, obra.id);
    expect(t.total.chamadas).toBe(1);
    expect(t.total.custo_usd).toBeCloseTo(3, 10);
    expect(t.capitulos).toHaveLength(0);
  });
});

describe('(a) veredicto do cache', () => {
  it('mede o acerto em % e a economia em dinheiro', () => {
    const { obra, caps } = obraComCapitulos(1);
    registrarEvento(db, {
      obra_id: obra.id,
      capitulo_id: caps[0].id,
      papel: 'traducao',
      provedor: 'claude',
      modelo: 'sonnet',
      uso: uso({ tokens_entrada: 200_000, tokens_cache_leitura: 800_000 }),
    });
    const { cache } = telemetriaDaObra(db, obra.id);
    expect(cache.acerto_pct).toBeCloseTo(80, 6);
    expect(cache.estado).toBe('ok');
    // 800k lidos: teriam custado US$ 2,40, custaram US$ 0,24.
    expect(cache.economia_usd).toBeCloseTo(2.16, 10);
  });

  // Este é O caso do A4 da auditoria, e a razão de a detecção ser por PAPEL e não
  // por modelo: a revisão pagava escrita de cache e nunca lia, no MESMO modelo em
  // que a tradução lia normalmente. Agregado por modelo, o desperdício
  // desapareceria dentro de um "cache ok".
  it('acusa escrita de cache perdida (A4) mesmo quando outro papel no mesmo modelo lê bem', () => {
    const { obra, caps } = obraComCapitulos(1);
    for (let i = 0; i < 2; i++) {
      registrarEvento(db, {
        obra_id: obra.id,
        capitulo_id: caps[0].id,
        papel: 'traducao',
        provedor: 'claude',
        modelo: 'sonnet',
        uso: uso({ tokens_entrada: 10_000, tokens_cache_leitura: 900_000 }),
      });
      registrarEvento(db, {
        obra_id: obra.id,
        capitulo_id: caps[0].id,
        papel: 'revisao',
        provedor: 'claude',
        modelo: 'sonnet',
        uso: uso({ tokens_entrada: 10_000, tokens_cache_criacao: 500_000 }),
      });
    }
    const { cache } = telemetriaDaObra(db, obra.id);
    expect(cache.escrita_perdida).toEqual([
      { provedor: 'claude', modelo: 'sonnet', papel: 'revisao', tokens: 1_000_000 },
    ]);
    expect(cache.detalhe).toMatch(/escrita de cache/i);
    // O acerto global segue alto por causa da tradução — é justamente por isso
    // que o alerta por papel precisa existir.
    expect(cache.acerto_pct).toBeGreaterThan(50);
  });

  it('uma única chamada de um papel não é acusada: estreia sempre escreve sem ler', () => {
    const { obra, caps } = obraComCapitulos(1);
    registrarEvento(db, {
      obra_id: obra.id,
      capitulo_id: caps[0].id,
      papel: 'extracao',
      provedor: 'claude',
      modelo: 'sonnet',
      uso: uso({ tokens_entrada: 500, tokens_cache_criacao: 400_000 }),
    });
    expect(telemetriaDaObra(db, obra.id).cache.escrita_perdida).toEqual([]);
  });

  it('sem chamadas, amostra insuficiente em vez de 0%', () => {
    const { obra } = obraComCapitulos(1);
    const { cache } = telemetriaDaObra(db, obra.id);
    expect(cache.estado).toBe('amostra-insuficiente');
    expect(cache.acerto_pct).toBeNull();
  });
});

describe('(b) veredicto do lote', () => {
  function gastar(obraId: number, capituloId: number, entrada: number) {
    registrarEvento(db, {
      obra_id: obraId,
      capitulo_id: capituloId,
      papel: 'traducao',
      provedor: 'claude',
      modelo: 'sonnet',
      uso: uso({ tokens_entrada: entrada }),
    });
  }

  it('compara US$/1k frases entre capítulos de lote e sequenciais', () => {
    const { obra, caps } = obraComCapitulos(2);
    const lote = reposLotes.criar(db, obra.id, [caps[0].id], false);
    expect(lote.capitulos).toHaveLength(1);
    gastar(obra.id, caps[0].id, 500_000); // em lote: metade do custo
    gastar(obra.id, caps[1].id, 1_000_000); // sequencial

    const { lote: veredito } = telemetriaDaObra(db, obra.id);
    expect(veredito.lote.capitulos).toBe(1);
    expect(veredito.sequencial.capitulos).toBe(1);
    expect(veredito.diferenca_pct).toBeCloseTo(-50, 6);
    expect(veredito.estado).toBe('ok');
    expect(veredito.detalhe).toMatch(/mais barato/);
  });

  it('lote mais caro é dito com essas palavras (a premissa é financeira)', () => {
    const { obra, caps } = obraComCapitulos(2);
    reposLotes.criar(db, obra.id, [caps[0].id], false);
    gastar(obra.id, caps[0].id, 2_000_000);
    gastar(obra.id, caps[1].id, 1_000_000);
    const { lote } = telemetriaDaObra(db, obra.id);
    expect(lote.diferenca_pct).toBeCloseTo(100, 6);
    expect(lote.estado).toBe('acima');
    expect(lote.detalhe).toMatch(/mais CARO/);
  });

  it('só um dos grupos com custo conhecido = amostra insuficiente', () => {
    const { obra, caps } = obraComCapitulos(2);
    gastar(obra.id, caps[0].id, 1_000_000);
    gastar(obra.id, caps[1].id, 1_000_000);
    const { lote } = telemetriaDaObra(db, obra.id);
    expect(lote.estado).toBe('amostra-insuficiente');
    expect(lote.diferenca_pct).toBeNull();
    expect(lote.detalhe).toMatch(/em lote/);
  });
});

describe('(c) dia: dinheiro e cota lado a lado', () => {
  it('tentativas (uso_ia) contra chamadas faturadas revelam o desperdício', () => {
    const { obra, caps } = obraComCapitulos(1);
    // Três tentativas contadas na cota, uma só chegou a devolver usage
    // (as outras foram 429/truncamento): a diferença é o desperdício.
    reposUso.registrar(db, 'claude', 'sonnet');
    reposUso.registrar(db, 'claude', 'sonnet');
    reposUso.registrar(db, 'claude', 'sonnet');
    registrarEvento(db, {
      obra_id: obra.id,
      capitulo_id: caps[0].id,
      papel: 'traducao',
      provedor: 'claude',
      modelo: 'sonnet',
      uso: uso(),
    });
    reposConfig.definir(db, { cotas_diarias: { claude: 10 } });

    const dia = telemetriaDoDia(db);
    const claude = dia.provedores.find((p) => p.provedor === 'claude')!;
    expect(claude.tentativas).toBe(3);
    expect(claude.chamadas).toBe(1);
    expect(claude.pct_cota).toBeCloseTo(30, 6);
    expect(dia.total.custo_usd).toBeCloseTo(3, 10);
  });

  it('provedor cujas chamadas todas falharam ainda aparece (é o caso que mais importa)', () => {
    reposUso.registrar(db, 'gemini', 'gemini-flash-latest');
    const dia = telemetriaDoDia(db);
    const gemini = dia.provedores.find((p) => p.provedor === 'gemini')!;
    expect(gemini.tentativas).toBe(1);
    expect(gemini.chamadas).toBe(0);
  });

  it('sem cota configurada, não inventa porcentagem', () => {
    reposUso.registrar(db, 'mistral', 'mistral-small-latest');
    const dia = telemetriaDoDia(db);
    expect(dia.provedores.find((p) => p.provedor === 'mistral')!.pct_cota).toBeNull();
  });
});

describe('recalcularCustos', () => {
  it('preenche o custo do histórico depois de cadastrar o preço', () => {
    const { obra, caps } = obraComCapitulos(1);
    registrarEvento(db, {
      obra_id: obra.id,
      capitulo_id: caps[0].id,
      papel: 'traducao',
      provedor: 'deepseek',
      modelo: 'deepseek-v4-flash',
      uso: uso(),
    });
    expect(telemetriaDaObra(db, obra.id).total.chamadas_sem_preco).toBe(1);

    reposConfig.definir(db, {
      precos_modelos: { 'claude:sonnet': { entrada: 3, saida: 15 }, 'deepseek:*': { entrada: 0.28, saida: 0.42 } },
    });
    const r = recalcularCustos(db);
    expect(r).toEqual({ atualizados: 1, total: 1 });

    const t = telemetriaDaObra(db, obra.id);
    expect(t.total.chamadas_sem_preco).toBe(0);
    expect(t.total.custo_usd).toBeCloseTo(0.28, 10);
  });

  it('rodar de novo sem mudar preço não mexe em nada', () => {
    const { obra, caps } = obraComCapitulos(1);
    registrarEvento(db, {
      obra_id: obra.id,
      capitulo_id: caps[0].id,
      papel: 'traducao',
      provedor: 'claude',
      modelo: 'sonnet',
      uso: uso(),
    });
    expect(recalcularCustos(db)).toEqual({ atualizados: 0, total: 1 });
  });

  it('remover o preço volta o custo a desconhecido (não a zero)', () => {
    const { obra, caps } = obraComCapitulos(1);
    registrarEvento(db, {
      obra_id: obra.id,
      capitulo_id: caps[0].id,
      papel: 'traducao',
      provedor: 'claude',
      modelo: 'sonnet',
      uso: uso(),
    });
    reposConfig.definir(db, { precos_modelos: {} });
    recalcularCustos(db);
    expect(reposEventos.listarTodos(db)[0].custo_estimado).toBeNull();
    expect(telemetriaDaObra(db, obra.id).total.chamadas_sem_preco).toBe(1);
  });
});
