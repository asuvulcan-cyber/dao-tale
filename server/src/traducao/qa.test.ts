import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequisicaoQa } from '../ia/provedor.js';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { reposCapitulos, reposConfig, reposFrases, reposObras, reposQa, reposUso } from '../db/repos.js';
import { reposEventos } from '../db/eventosIa.js';
import { _backoffQaTeste, analisarCapitulo, resolverParQa } from './qa.js';
import { ErroProvedor } from '../ia/provedor.js';

// Bateria do QA (doc 09 §6): provedor-espião que devolve apontamentos
// programados, para verificar persistência, regra do par igual e triagem.

let apontamentosResposta: any[] = [];
const reqRecebidas: RequisicaoQa[] = [];
/** Falhas programadas: a n-ésima chamada lança o erro posto aqui. */
let falharNaChamada: { n: number; erro: Error } | null = null;
let chamadas = 0;

vi.mock('../credenciais/index.js', () => ({ obterChave: async () => 'chave' }));

vi.mock('../ia/fabrica.js', () => ({
  obterProvedor: (id: string) => ({
    id,
    nome: id,
    precisaChave: true,
    modeloPadrao: `${id}-v1`,
    async analisarQa(_chave: string | null, req: RequisicaoQa) {
      chamadas++;
      if (falharNaChamada && chamadas >= falharNaChamada.n) throw falharNaChamada.erro;
      reqRecebidas.push(req);
      return {
        apontamentos: apontamentosResposta,
        bruta: '{}',
        // Consumo típico de um bloco de QA: entrada dobrada (zh + pt).
        uso: { tokens_entrada: 1_000_000, tokens_saida: 40_000, tokens_cache_leitura: 0, tokens_cache_criacao: 0 },
      };
    },
  }),
}));

let db: BancoDados;

beforeEach(() => {
  db = abrirBanco(':memory:');
  apontamentosResposta = [];
  reqRecebidas.length = 0;
  falharNaChamada = null;
  chamadas = 0;
  _backoffQaTeste([1, 1, 1]); // esperas de 1 ms: o teste mede comportamento, não relógio
});

function capituloTraduzido() {
  const obra = reposObras.criar(db, { titulo: 'O', prompt_inicial: { versao: '1.0', conteudo: 'R.' } });
  const cap = reposCapitulos.criar(db, obra.id, { numero: 1, texto_origem: 'x' }, [
    { texto_zh: '甲。', paragrafo: 0 },
    { texto_zh: '乙。', paragrafo: 0 },
  ]);
  const frases = reposFrases.listarPorCapitulo(db, cap.id);
  for (const f of frases) reposFrases.aplicarTraducaoIa(db, f.id, `PT ${f.ordem}`);
  // Capítulo traduzido pelo 'mock' (par do tradutor).
  reposCapitulos.atualizar(db, cap.id, { status: 'traduzido', provedor: 'mock', modelo: 'mock-v1' });
  return { obra, cap, frases: reposFrases.listarPorCapitulo(db, cap.id) };
}

describe('resolverParQa', () => {
  it('usa provedor_qa quando definido', () => {
    const par = resolverParQa({ ...reposConfig.obterTodas(db), provedor_qa: 'gemini', modelo_qa: 'g' });
    expect(par).toEqual({ provedor: 'gemini', modelo: 'g' });
  });
  it('cai no par da revisão quando não há provedor_qa', () => {
    const par = resolverParQa({ ...reposConfig.obterTodas(db), provedor_revisao: 'deepseek', modelo_revisao: 'd' });
    expect(par).toEqual({ provedor: 'deepseek', modelo: 'd' });
  });
  it('null quando nada configurado', () => {
    expect(resolverParQa(reposConfig.obterTodas(db))).toBeNull();
  });
});

describe('analisarCapitulo', () => {
  it('recusa quando não há par de QA configurado', async () => {
    const { cap } = capituloTraduzido();
    const r = await analisarCapitulo(db, cap.id);
    expect(r).toMatchObject({ ok: false, codigo: 'sem-par' });
  });

  it('recusa quando o par de QA é igual ao tradutor (sem forçar)', async () => {
    const { cap } = capituloTraduzido();
    reposConfig.definir(db, { provedor_qa: 'mock', modelo_qa: 'mock-v1' });
    const r = await analisarCapitulo(db, cap.id);
    expect(r).toMatchObject({ ok: false, codigo: 'par-igual' });
  });

  it('força a QA com par igual quando forcar=true', async () => {
    const { cap } = capituloTraduzido();
    reposConfig.definir(db, { provedor_qa: 'mock', modelo_qa: 'mock-v1' });
    const r = await analisarCapitulo(db, cap.id, { forcar: true });
    expect(r.ok).toBe(true);
  });

  it('persiste apontamentos resolvendo ordem→frase_id e marca qa_em', async () => {
    const { cap, frases } = capituloTraduzido();
    reposConfig.definir(db, { provedor_qa: 'gemini', modelo_qa: 'g' });
    apontamentosResposta = [
      { ordem: frases[1].ordem, tipo: 'omissao', severidade: 'alta', trecho_zh: '乙', observacao: 'faltou', sugestao: 'PT corrigido' },
    ];
    const r = await analisarCapitulo(db, cap.id);
    expect(r).toMatchObject({ ok: true, apontamentos: 1 });

    const lista = reposQa.listar(db, cap.id);
    expect(lista).toHaveLength(1);
    expect(lista[0].frase_id).toBe(frases[1].id);
    expect(lista[0].tipo).toBe('omissao');
    expect(reposCapitulos.obter(db, cap.id)?.qa_em).not.toBeNull();
    // O QA não escreve na frase — só aponta.
    expect(reposFrases.obter(db, frases[1].id)?.texto_pt).toBe('PT 1');
  });

  // Doc 11 §4: o QA é a compra separada mais cara do pipeline (~+140% projetado
  // no doc 09 §15). Cada bloco tem de entrar no livro-caixa com o papel certo,
  // senão o custo do QA volta a ser invisível.
  it('grava o consumo de cada bloco no livro-caixa, com papel "qa"', async () => {
    const { obra, cap } = capituloTraduzido();
    reposConfig.definir(db, {
      provedor_qa: 'gemini',
      modelo_qa: 'g',
      precos_modelos: { 'gemini:g': { entrada: 3, saida: 15 } },
    });
    apontamentosResposta = [];
    await analisarCapitulo(db, cap.id);

    const eventos = reposEventos.listarTodos(db);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      papel: 'qa',
      provedor: 'gemini',
      modelo: 'g',
      obra_id: obra.id,
      capitulo_id: cap.id,
      tokens_entrada: 1_000_000,
    });
    // US$ 3 de entrada + US$ 0,60 de saída (40k a 15/1M).
    expect(eventos[0].custo_estimado).toBeCloseTo(3.6, 10);
  });

  // O QA consome cota do provedor como qualquer outra chamada. Antes do doc 11
  // ele não era contado em uso_ia, então o indicador de cota subestimava o
  // consumo — e o painel exibia "faturadas > tentativas", que é impossível.
  it('conta cada bloco de QA na cota diária (tentativas >= chamadas faturadas)', async () => {
    const { cap } = capituloTraduzido();
    reposConfig.definir(db, { provedor_qa: 'gemini', modelo_qa: 'g' });
    await analisarCapitulo(db, cap.id);

    const tentativas = reposUso.hoje(db).find((u) => u.provedor === 'gemini' && u.modelo === 'g');
    expect(tentativas?.requisicoes).toBe(1);
    expect(tentativas!.requisicoes).toBeGreaterThanOrEqual(reposEventos.listarTodos(db).length);
  });

  it('nova passada substitui os pendentes, mas preserva os já triados', async () => {
    const { cap, frases } = capituloTraduzido();
    reposConfig.definir(db, { provedor_qa: 'gemini', modelo_qa: 'g' });
    apontamentosResposta = [{ ordem: frases[0].ordem, tipo: 'outro', severidade: 'baixa', trecho_zh: '', observacao: 'a', sugestao: null }];
    await analisarCapitulo(db, cap.id);
    const primeiro = reposQa.listar(db, cap.id)[0];
    reposQa.definirStatus(db, primeiro.id, 'descartado'); // triado pelo humano

    apontamentosResposta = [{ ordem: frases[1].ordem, tipo: 'repeticao', severidade: 'media', trecho_zh: '', observacao: 'b', sugestao: null }];
    await analisarCapitulo(db, cap.id);

    const lista = reposQa.listar(db, cap.id);
    // O descartado (histórico) fica; o novo pendente entra; nenhum pendente órfão.
    expect(lista.map((a) => a.status).sort()).toEqual(['descartado', 'pendente']);
  });

  it('aplicarSugestao escreve a frase e marca editado_manualmente (M3)', async () => {
    const { cap, frases } = capituloTraduzido();
    reposConfig.definir(db, { provedor_qa: 'gemini', modelo_qa: 'g' });
    apontamentosResposta = [
      { ordem: frases[0].ordem, tipo: 'glossario', severidade: 'alta', trecho_zh: '甲', observacao: 'x', sugestao: 'Tradução corrigida' },
    ];
    await analisarCapitulo(db, cap.id);
    const ap = reposQa.listar(db, cap.id)[0];

    const r = reposQa.aplicarSugestao(db, ap.id);
    expect(r).not.toBe('sem-sugestao');
    const frase = reposFrases.obter(db, frases[0].id)!;
    expect(frase.texto_pt).toBe('Tradução corrigida');
    expect(frase.editado_manualmente).toBe(true);
    expect(reposQa.obter(db, ap.id)?.status).toBe('aceito');
  });

  it('filtra o glossário por bloco no modo relevante', async () => {
    const { cap } = capituloTraduzido();
    reposConfig.definir(db, { provedor_qa: 'gemini', modelo_qa: 'g', glossario_relevante: true });
    await analisarCapitulo(db, cap.id);
    expect(reqRecebidas[0].glossarioNoUsuario).toBe(true);
  });
});

describe('resiliência da QA — a falha da primeira execução real', () => {
  it('erro do provedor não deixa a rota sem resposta: volta ok:false com motivo', async () => {
    const { cap } = capituloTraduzido();
    reposConfig.definir(db, { provedor_qa: 'gemini', modelo_qa: 'g' });
    // O que aconteceu de verdade: o Gemini devolveu JSON que o parser recusou.
    falharNaChamada = { n: 1, erro: new ErroProvedor('O modelo não devolveu a resposta estruturada esperada.', 'transitorio') };

    const r = await analisarCapitulo(db, cap.id, {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.codigo).toBe('provedor');
      expect(r.erro).toContain('não devolveu a resposta estruturada');
    }
  });

  it('erro fatal desiste na hora, sem gastar as esperas', async () => {
    const { cap } = capituloTraduzido();
    reposConfig.definir(db, { provedor_qa: 'gemini', modelo_qa: 'g' });
    falharNaChamada = { n: 1, erro: new ErroProvedor('Chave inválida.', 'fatal') };

    const antes = Date.now();
    const r = await analisarCapitulo(db, cap.id, {});
    expect(r.ok).toBe(false);
    // Fatal não melhora esperando: nada de backoff.
    expect(Date.now() - antes).toBeLessThan(1500);
  });
});
