import { beforeEach, describe, expect, it } from 'vitest';
import { preferenciaQueCobre } from '@dao-tale/shared';
import { abrirBanco, type BancoDados } from './index.js';
import { reposCapitulos, reposFrases, reposObras, reposTestes } from './repos.js';
import { unificarRotulosDeRegra } from './rotulosRegra.js';

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

function caso(secao: string): void {
  reposTestes.criar(db, {
    frase_id: fraseId,
    obra_id: obraId,
    caso_pai_id: null,
    trecho_zh: '测试',
    pergunta: 'p',
    veredito: 'incorreto',
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
}

const rotulos = (): string[] =>
  (db.prepare('SELECT secao_regra FROM banco_testes ORDER BY id').all() as { secao_regra: string }[]).map(
    (l) => l.secao_regra,
  );

describe('convergência do rótulo na gravação', () => {
  it('reusa a grafia que a obra já usa em vez de criar variação nova', () => {
    caso('5-mais-que-perfeito');
    caso('5.estilo-mais-que-perfeito'); // o modelo inventou outra grafia
    caso('mais-que-perfeito');
    expect(rotulos()).toEqual(['5-mais-que-perfeito', '5-mais-que-perfeito', '5-mais-que-perfeito']);
  });

  it('não funde regras diferentes só por serem da mesma seção', () => {
    caso('5-mais-que-perfeito');
    caso('5-registro');
    expect(rotulos()).toEqual(['5-mais-que-perfeito', '5-registro']);
  });

  it('não vaza rótulo entre obras', () => {
    caso('5-mais-que-perfeito');
    const outra = reposObras.criar(db, { titulo: 'Outra' }).id;
    const cap = reposCapitulos.criar(db, outra, { numero: 1, texto_origem: '乙说。' }, [
      { texto_zh: '乙说。', paragrafo: 0 },
    ]);
    reposTestes.criar(db, {
      frase_id: reposFrases.listarPorCapitulo(db, cap.id)[0].id,
      obra_id: outra,
      caso_pai_id: null,
      trecho_zh: '测试',
      pergunta: 'p',
      veredito: 'incorreto',
      resposta: '',
      justificativa: 'j',
      secao_regra: '5.mais-que-perfeito',
      correcao_proposta: 'x',
      trecho_pt_errado: null,
      trecho_pt_corrigido: null,
      motivo_rejeicao: null,
      provedor: 'mock',
      modelo: 'mock-v1',
      resposta_bruta: '{}',
    });
    // A outra obra guarda a grafia DELA — a convergência é por obra.
    expect(rotulos()).toEqual(['5-mais-que-perfeito', '5.mais-que-perfeito']);
  });
});

describe('unificarRotulosDeRegra (dados já gravados)', () => {
  it('unifica na grafia mais frequente e é idempotente', () => {
    // Grava por baixo da convergência, como as linhas antigas do banco real.
    const cru = db.prepare(
      `INSERT INTO banco_testes (frase_id, obra_id, trecho_zh, pergunta, veredito, justificativa, secao_regra, status, provedor, modelo, resposta_bruta)
       VALUES (?, ?, '测试', 'p', 'incorreto', 'j', ?, 'corrigido', 'mock', 'mock-v1', '{}')`,
    );
    for (const r of ['5-mais-que-perfeito', '5-mais-que-perfeito', '5.mais-que-perfeito', 'mais-que-perfeito'])
      cru.run(fraseId, obraId, r);
    db.prepare("UPDATE configuracoes SET valor = '0' WHERE chave = 'rotulos_regra_unificados'").run();

    expect(unificarRotulosDeRegra(db)).toBe(2);
    expect(new Set(rotulos())).toEqual(new Set(['5-mais-que-perfeito']));

    db.prepare("UPDATE configuracoes SET valor = '0' WHERE chave = 'rotulos_regra_unificados'").run();
    expect(unificarRotulosDeRegra(db)).toBe(0);
  });
});

describe('preferenciaQueCobre', () => {
  it('reconhece as recorrências que são CHAVE e não viram diretriz', () => {
    expect(preferenciaQueCobre('5-mais-que-perfeito')).toBe('mais_que_perfeito');
    expect(preferenciaQueCobre('5.estilo-mais-que-perfeito')).toBe('mais_que_perfeito');
    expect(preferenciaQueCobre('2-dialogo-aspas')).toBe('dialogo');
    expect(preferenciaQueCobre('5-registro')).toBe('registro');
    expect(preferenciaQueCobre('onomatopeia')).toBe('onomatopeia');
  });

  it('deixa passar o que é lacuna de diretriz de verdade', () => {
    expect(preferenciaQueCobre('1-prosa-nao-legenda')).toBeNull();
    expect(preferenciaQueCobre('4-sem-decalque')).toBeNull();
    expect(preferenciaQueCobre('3.2-nomes-proprios')).toBeNull();
  });
});
