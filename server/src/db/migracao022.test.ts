import { describe, expect, it } from 'vitest';
import { abrirBanco } from './index.js';
import { reposCapitulos, reposFrases, reposObras, reposTestes } from './repos.js';

describe('migração 022', () => {
  it('cria as colunas do fio, da resposta e da recusa', () => {
    const db = abrirBanco(':memory:');
    const colunas = (db.pragma('table_info(banco_testes)') as { name: string }[]).map((c) => c.name);
    for (const nova of ['caso_pai_id', 'resposta', 'motivo_rejeicao']) {
      expect(colunas).toContain(nova);
    }
  });

  it('aceita o veredito escolha-legitima e o status rejeitado', () => {
    const db = abrirBanco(':memory:');
    const obraId = reposObras.criar(db, { titulo: 'Obra' }).id;
    const cap = reposCapitulos.criar(db, obraId, { numero: 1, texto_origem: '甲说。' }, [
      { texto_zh: '甲说。', paragrafo: 0 },
    ]);
    const fraseId = reposFrases.listarPorCapitulo(db, cap.id)[0].id;
    // Insere com ids VÁLIDOS: com frase_id nulo, o NOT NULL pode disparar antes do
    // CHECK e o teste passaria mesmo com o CHECK antigo — verde pelo motivo errado.
    expect(() =>
      db
        .prepare(
          `INSERT INTO banco_testes (frase_id, obra_id, trecho_zh, pergunta, veredito,
             resposta, justificativa, status, provedor, modelo, resposta_bruta)
           VALUES (?, ?, 'z', 'p', 'escolha-legitima', 'r', '', 'rejeitado', 'mock', 'm', '{}')`,
        )
        .run(fraseId, obraId),
    ).not.toThrow();
  });

  it('continua recusando veredito e status fora do enum', () => {
    const db = abrirBanco(':memory:');
    const obraId = reposObras.criar(db, { titulo: 'Obra' }).id;
    const cap = reposCapitulos.criar(db, obraId, { numero: 1, texto_origem: '甲说。' }, [
      { texto_zh: '甲说。', paragrafo: 0 },
    ]);
    const fraseId = reposFrases.listarPorCapitulo(db, cap.id)[0].id;
    // O rebuild não pode ter afrouxado o CHECK para "qualquer texto".
    expect(() =>
      db
        .prepare(
          `INSERT INTO banco_testes (frase_id, obra_id, trecho_zh, pergunta, veredito,
             resposta, justificativa, status, provedor, modelo, resposta_bruta)
           VALUES (?, ?, 'z', 'p', 'talvez', 'r', '', 'pendente', 'mock', 'm', '{}')`,
        )
        .run(fraseId, obraId),
    ).toThrowError(/CHECK/);
  });

  it('preserva os índices da tabela original', () => {
    const db = abrirBanco(':memory:');
    const indices = (db.pragma('index_list(banco_testes)') as { name: string }[]).map((i) => i.name);
    expect(indices).toContain('idx_testes_obra_status');
    expect(indices).toContain('idx_testes_secao');
    expect(indices).toContain('idx_testes_pai');
  });

  it('escolha-legitima nasce confirmado, como correto', () => {
    // Só 'incorreto' abre pendência: o terceiro veredito diz que não há o que
    // fazer, e nascer 'pendente' o faria contar como lacuna sistemática.
    const db = abrirBanco(':memory:');
    const obraId = reposObras.criar(db, { titulo: 'Obra' }).id;
    const cap = reposCapitulos.criar(db, obraId, { numero: 1, texto_origem: '甲说。' }, [
      { texto_zh: '甲说。', paragrafo: 0 },
    ]);
    const fraseId = reposFrases.listarPorCapitulo(db, cap.id)[0].id;
    const comum = {
      frase_id: fraseId, obra_id: obraId, caso_pai_id: null, trecho_zh: '甲', pergunta: 'p',
      resposta: 'r', justificativa: '', secao_regra: null, correcao_proposta: null,
      trecho_pt_errado: null, trecho_pt_corrigido: null, motivo_rejeicao: null,
      provedor: 'mock', modelo: 'mock-v1', resposta_bruta: '{}',
    } as const;
    expect(reposTestes.criar(db, { ...comum, veredito: 'escolha-legitima' }).status).toBe('confirmado');
    expect(reposTestes.criar(db, { ...comum, veredito: 'correto' }).status).toBe('confirmado');
    expect(reposTestes.criar(db, { ...comum, veredito: 'incorreto' }).status).toBe('pendente');
  });
});
