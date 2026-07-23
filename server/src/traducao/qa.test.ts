import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequisicaoQa } from '../ia/provedor.js';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { reposCapitulos, reposConfig, reposFrases, reposObras, reposQa } from '../db/repos.js';
import { analisarCapitulo, resolverParQa } from './qa.js';

// Bateria do QA (doc 09 §6): provedor-espião que devolve apontamentos
// programados, para verificar persistência, regra do par igual e triagem.

let apontamentosResposta: any[] = [];
const reqRecebidas: RequisicaoQa[] = [];

vi.mock('../credenciais/index.js', () => ({ obterChave: async () => 'chave' }));

vi.mock('../ia/fabrica.js', () => ({
  obterProvedor: (id: string) => ({
    id,
    nome: id,
    precisaChave: true,
    modeloPadrao: `${id}-v1`,
    async analisarQa(_chave: string | null, req: RequisicaoQa) {
      reqRecebidas.push(req);
      return { apontamentos: apontamentosResposta, bruta: '{}' };
    },
  }),
}));

let db: BancoDados;

beforeEach(() => {
  db = abrirBanco(':memory:');
  apontamentosResposta = [];
  reqRecebidas.length = 0;
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
