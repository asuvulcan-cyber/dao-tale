import { beforeEach, describe, expect, it } from 'vitest';
import { abrirBanco, type BancoDados } from './index.js';
import { reposCapitulos, reposFrases, reposObras, reposTestes } from './repos.js';

let db: BancoDados;
let fraseId: number;

beforeEach(() => {
  db = abrirBanco(':memory:');
  const obraId = reposObras.criar(db, { titulo: 'Obra' }).id;
  const cap = reposCapitulos.criar(db, obraId, { numero: 1, texto_origem: '甲说。' }, [
    { texto_zh: '甲说。', paragrafo: 0 },
  ]);
  fraseId = reposFrases.listarPorCapitulo(db, cap.id)[0].id;
});

describe('migração 023', () => {
  it('aceita o papel estilo em eventos_ia', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO eventos_ia (data, papel, provedor, modelo) VALUES ('2026-08-09','estilo','mock','m')`,
        )
        .run(),
    ).not.toThrow();
  });

  it('continua recusando papel fora do enum', () => {
    // O rebuild não pode ter afrouxado o CHECK para "qualquer texto".
    expect(() =>
      db
        .prepare(
          `INSERT INTO eventos_ia (data, papel, provedor, modelo) VALUES ('2026-08-09','inventado','mock','m')`,
        )
        .run(),
    ).toThrowError(/CHECK/);
  });

  it('frases ganham origem_edicao, nula por padrão', () => {
    const colunas = (db.pragma('table_info(frases)') as { name: string }[]).map((c) => c.name);
    expect(colunas).toContain('origem_edicao');
    expect(reposFrases.obter(db, fraseId)!.origem_edicao).toBeNull();
  });

  it('editarTexto sem origem deixa NULL — é edição manual', () => {
    reposFrases.editarTexto(db, fraseId, 'texto novo');
    const f = reposFrases.obter(db, fraseId)!;
    expect(f.editado_manualmente).toBe(true);
    expect(f.origem_edicao).toBeNull();
  });

  it('editarTexto com origem grava a origem', () => {
    reposFrases.editarTexto(db, fraseId, 'texto novo', 'passe-estilo');
    expect(reposFrases.obter(db, fraseId)!.origem_edicao).toBe('passe-estilo');
  });

  it('aplicar correção da revisão grava origem revisao', () => {
    // É o que tira a frase da mineração de edições manuais: aceitar uma proposta
    // da revisão é decisão registrada em outro canal, e recontá-la como "o que
    // você mudou à mão" ensinaria a mesma lição duas vezes.
    reposFrases.editarTexto(db, fraseId, 'concluindo que ele errara.');
    const caso = reposTestes.criar(db, {
      frase_id: fraseId,
      obra_id: reposCapitulos.obter(db, reposFrases.obter(db, fraseId)!.capitulo_id)!.obra_id,
      caso_pai_id: null,
      trecho_zh: '甲',
      pergunta: 'p',
      veredito: 'incorreto',
      resposta: 'r',
      justificativa: '',
      secao_regra: null,
      correcao_proposta: null,
      trecho_pt_errado: 'errara',
      trecho_pt_corrigido: 'errou',
      motivo_rejeicao: null,
      provedor: 'mock',
      modelo: 'mock-v1',
      resposta_bruta: '{}',
    });
    reposTestes.aplicarCorrecao(db, caso.id);
    const f = reposFrases.obter(db, fraseId)!;
    expect(f.texto_pt).toContain('errou');
    expect(f.origem_edicao).toBe('revisao');
  });
});
