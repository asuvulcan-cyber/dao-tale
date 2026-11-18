import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

// Achado da revisão final: os testes acima abrem abrirBanco(':memory:'), que
// aplica 001..022 de UMA VEZ sobre um banco VAZIO — nenhuma linha jamais
// atravessa o INSERT … SELECT da 022. O caminho de dados só foi verificado à
// mão, uma vez, contra uma cópia que já foi apagada — e ele vai rodar de novo
// contra dev local, instâncias temporárias de outras obras e restaurações de
// backup. Este bloco aplica só até a 021 (não há função exportada para isso —
// `migrar()` em index.ts não distingue "até tal migração", então os arquivos
// são lidos e executados aqui, na mesma ordem que ela usa), grava casos como o
// app ANTIGO gravava (sem caso_pai_id/resposta/motivo_rejeicao — colunas que
// só a 022 cria), roda a 022 sozinha, e confere o que sobrou.
describe('migração 022 — caminho de dados (dados reais atravessando o INSERT … SELECT)', () => {
  const dirMigrations = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
  const numeroDaMigracao = (nome: string) => parseInt(nome.slice(0, 3), 10);
  const aplicar = (db: Database.Database, nome: string): void => {
    db.exec(fs.readFileSync(path.join(dirMigrations, nome), 'utf-8'));
  };

  it('preserva as linhas, funde resposta/justificativa e converte "geral" em NULL', () => {
    const db = new Database(':memory:');
    // As migrações 002/007/016/022 fazem rebuild de tabela (CREATE …_novo +
    // DROP + RENAME); FK fica OFF enquanto isso roda e só volta no final —
    // mesmo desenho de migrar() em index.ts, que confere foreign_key_check
    // depois de tudo aplicado, não a cada arquivo.
    db.pragma('foreign_keys = OFF');
    const arquivos = fs.readdirSync(dirMigrations).filter((f) => f.endsWith('.sql')).sort();
    for (const arquivo of arquivos) {
      if (numeroDaMigracao(arquivo) > 21) break;
      aplicar(db, arquivo);
    }
    // A 029 entra fora de ordem de propósito: ela só ALTERa `obras` e
    // `prompt_padrao`, que a 022 não toca, e sem ela o `reposObras` abaixo —
    // que é código ATUAL rodando sobre schema antigo, o desenho deste arquivo —
    // não acha `obras.idioma_origem`.
    aplicar(db, '029_idioma_origem.sql');
    db.pragma('foreign_keys = ON');

    // Obra/capítulo/frases pelo código do app — não pelas migrações: elas não
    // criam dados, só schema.
    const obraId = reposObras.criar(db, { titulo: 'Obra pré-022' }).id;
    const cap = reposCapitulos.criar(db, obraId, { numero: 1, texto_origem: '甲乙丙丁戊' }, [
      { texto_zh: '甲说。', paragrafo: 0 },
      { texto_zh: '乙说。', paragrafo: 0 },
      { texto_zh: '丙说。', paragrafo: 0 },
      { texto_zh: '丁说。', paragrafo: 0 },
      { texto_zh: '戊说。', paragrafo: 0 },
    ]);
    const frases = reposFrases.listarPorCapitulo(db, cap.id);

    // Cinco casos representativos do CONTRATO ANTIGO (pré-022): justificativa
    // é a única explicação que existia, secao_regra podia ser 'geral' (valor
    // de fuga) ou uma regra de verdade, veredito só tinha 'correto'/'incorreto'
    // (escolha-legitima é da 022 em diante), e trecho_pt_errado/corrigido (015)
    // já existiam e podiam vir preenchidos ou NULL.
    const inserirCasoAntigo = db.prepare(
      `INSERT INTO banco_testes
        (id, frase_id, obra_id, trecho_zh, pergunta, veredito, justificativa, secao_regra,
         correcao_proposta, status, provedor, modelo, resposta_bruta, trecho_pt_errado, trecho_pt_corrigido)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const casosAntigos = [
      {
        id: 101, frase: frases[0], veredito: 'correto',
        justificativa: 'Caso 1: secao_regra "geral" precisa virar NULL.',
        secao_regra: 'geral', correcao: null as string | null,
        trechoErrado: null as string | null, trechoCorrigido: null as string | null,
      },
      {
        id: 102, frase: frases[1], veredito: 'incorreto',
        justificativa: 'Caso 2: regra de verdade precisa sobreviver intacta.',
        secao_regra: '5-mais-que-perfeito', correcao: 'Ele já tinha chegado.',
        trechoErrado: null as string | null, trechoCorrigido: null as string | null,
      },
      {
        id: 103, frase: frases[2], veredito: 'correto',
        justificativa: 'Caso 3: sem regra nenhuma, só a explicação do revisor.',
        secao_regra: null as string | null, correcao: null as string | null,
        trechoErrado: null as string | null, trechoCorrigido: null as string | null,
      },
      {
        id: 104, frase: frases[3], veredito: 'incorreto',
        justificativa: 'Caso 4: veredito incorreto, o outro valor antigo do enum.',
        secao_regra: null as string | null, correcao: 'Outra correção qualquer.',
        trechoErrado: null as string | null, trechoCorrigido: null as string | null,
      },
      {
        id: 105, frase: frases[4], veredito: 'correto',
        justificativa: 'Caso 5: par cirúrgico (015) já preenchido antes da 022.',
        secao_regra: null as string | null, correcao: null as string | null,
        trechoErrado: 'olhos', trechoCorrigido: 'os olhos',
      },
    ];
    for (const c of casosAntigos) {
      inserirCasoAntigo.run(
        c.id, c.frase.id, obraId, c.frase.texto_zh, `Pergunta do caso ${c.id}`, c.veredito,
        c.justificativa, c.secao_regra, c.correcao, 'pendente', 'mock', 'mock-v1', '{}',
        c.trechoErrado, c.trechoCorrigido,
      );
    }
    expect((db.prepare('SELECT COUNT(*) n FROM banco_testes').get() as { n: number }).n).toBe(5);

    // A migração em si — sozinha, sobre dados de verdade.
    db.pragma('foreign_keys = OFF');
    aplicar(db, '022_revisao_conversa.sql');
    db.pragma('foreign_keys = ON');

    const linhas = db.prepare('SELECT * FROM banco_testes ORDER BY id').all() as Record<string, unknown>[];

    // Nenhuma linha perdida, ids preservados.
    expect(linhas.map((l) => l.id)).toEqual([101, 102, 103, 104, 105]);

    linhas.forEach((linha, i) => {
      const original = casosAntigos[i];
      // resposta = justificativa em todas — e igual ao texto antigo: "resposta
      // nasce com o valor de justificativa" (comentário da própria migração).
      expect(linha.resposta).toBe(original.justificativa);
      expect(linha.justificativa).toBe(original.justificativa);
      // caso_pai_id e motivo_rejeicao nascem NULL: a 022 não tinha de onde tirá-los.
      expect(linha.caso_pai_id).toBeNull();
      expect(linha.motivo_rejeicao).toBeNull();
      expect(linha.veredito).toBe(original.veredito);
      expect(linha.trecho_pt_errado).toBe(original.trechoErrado);
      expect(linha.trecho_pt_corrigido).toBe(original.trechoCorrigido);
    });

    // 'geral' virou NULL; a regra de verdade sobrevive com o mesmo rótulo.
    expect(linhas.find((l) => l.id === 101)!.secao_regra).toBeNull();
    expect(linhas.find((l) => l.id === 102)!.secao_regra).toBe('5-mais-que-perfeito');

    // Os três índices continuam existindo (rebuild de tabela pode esquecê-los).
    const indices = (db.pragma('index_list(banco_testes)') as { name: string }[]).map((i) => i.name);
    expect(indices).toEqual(
      expect.arrayContaining(['idx_testes_obra_status', 'idx_testes_secao', 'idx_testes_pai']),
    );

    // Integridade referencial (a auto-referência caso_pai_id → banco_testes
    // aponta para o nome FINAL) e estrutural intactas.
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);

    db.close();
  });
});
