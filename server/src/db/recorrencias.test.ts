import { beforeEach, describe, expect, it } from 'vitest';
import { normalizarSecaoRegra } from '@dao-tale/shared';
import { abrirBanco, type BancoDados } from './index.js';
import { reposCapitulos, reposFrases, reposObras, reposTestes } from './repos.js';

// O refinamento de prompt só dispara com 2+ casos na MESMA regra. Duas coisas o
// mantinham cego na prática, e as duas aconteceram na 死人经:
//   1. só contava 'pendente'/'regra-nova-necessaria' — mas quem corrige pelo
//      editor gera 'corrigido', que é a evidência mais forte que existe;
//   2. agrupava pelo rótulo cru, e o modelo devolve uma variação nova a cada
//      chamada para a mesma regra.

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

function caso(secao: string, status: 'pendente' | 'corrigido' | 'confirmado' | 'regra-nova-necessaria'): void {
  const c = reposTestes.criar(db, {
    frase_id: fraseId,
    obra_id: obraId,
    caso_pai_id: null,
    trecho_zh: '测试',
    pergunta: 'p',
    veredito: status === 'confirmado' ? 'correto' : 'incorreto',
    resposta: '',
    justificativa: 'j',
    secao_regra: secao,
    correcao_proposta: 'x',
    trecho_pt_errado: null,
    trecho_pt_corrigido: null,
    motivo_rejeicao: null,
    provedor: 'mock',
    modelo: 'mock-v1',
    resposta_bruta: '{}',
  });
  if (c.status !== status) reposTestes.atualizarStatus(db, c.id, status);
}

describe('normalizarSecaoRegra', () => {
  it('colapsa as variações reais que o modelo inventou para a mesma regra', () => {
    const rotulos = ['5-mais-que-perfeito', '5.mais-que-perfeito', '5.estilo-mais-que-perfeito', 'mais-que-perfeito'];
    const normalizados = new Set(rotulos.map(normalizarSecaoRegra));
    expect(normalizados.size).toBe(1);
  });

  it('não funde regras que são de fato diferentes', () => {
    expect(normalizarSecaoRegra('1-prosa-nao-legenda')).not.toBe(normalizarSecaoRegra('4-sem-decalque'));
    expect(normalizarSecaoRegra('5-registro')).not.toBe(normalizarSecaoRegra('5-mais-que-perfeito'));
  });
});

describe('recorrencias', () => {
  it('conta os corrigidos: é o erro que o humano validou ao aplicar', () => {
    caso('5-mais-que-perfeito', 'corrigido');
    caso('5-mais-que-perfeito', 'corrigido');
    const r = reposTestes.recorrencias(db, obraId);
    expect(r).toEqual([{ secao_regra: '5-mais-que-perfeito', casos: 2 }]);
  });

  it('agrupa as variações do mesmo rótulo — o caso que travava a 死人经', () => {
    caso('5-mais-que-perfeito', 'corrigido');
    caso('5.mais-que-perfeito', 'corrigido');
    caso('5.estilo-mais-que-perfeito', 'corrigido');
    caso('mais-que-perfeito', 'pendente');
    const r = reposTestes.recorrencias(db, obraId);
    expect(r).toHaveLength(1);
    expect(r[0].casos).toBe(4);
    // Devolve o rótulo mais frequente, que é o que a busca por seção encontra.
    expect(r[0].secao_regra).toBe('5-mais-que-perfeito');
  });

  it('ignora os confirmados: ali a IA disse que estava certo', () => {
    caso('5-registro', 'confirmado');
    caso('5-registro', 'confirmado');
    expect(reposTestes.recorrencias(db, obraId)).toEqual([]);
  });

  it('exige 2 na mesma regra — um caso isolado não é lacuna sistemática', () => {
    caso('5-registro', 'corrigido');
    caso('4-sem-decalque', 'corrigido');
    expect(reposTestes.recorrencias(db, obraId)).toEqual([]);
  });

  it('devolve os rótulos já usados, para a revisão reaproveitar em vez de inventar', () => {
    caso('5-mais-que-perfeito', 'corrigido');
    caso('5-mais-que-perfeito', 'corrigido');
    caso('4-sem-decalque', 'pendente');
    caso('geral', 'pendente');
    const rotulos = reposTestes.rotulosDeRegra(db, obraId);
    expect(rotulos[0]).toBe('5-mais-que-perfeito'); // mais frequente primeiro
    expect(rotulos).toContain('4-sem-decalque');
    expect(rotulos).not.toContain('geral'); // 'geral' não identifica regra nenhuma
  });
});
