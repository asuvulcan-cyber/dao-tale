import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PREFERENCIAS_PADRAO } from '@dao-tale/shared';
import { reposCapitulos, reposFrases, reposObras, reposTestes } from './repos.js';
import { classificarEdicoes } from '../traducao/edicoesManuais.js';

// Mesmo problema de fundo do bloco de dados reais em migracao022.test.ts: abrir
// abrirBanco(':memory:') aplica 001..024 de UMA VEZ sobre um banco VAZIO, então o
// UPDATE ... WHERE id IN (SELECT ...) da 024 nunca encontra linha nenhuma — o
// backfill precisa de dados presentes ANTES dele rodar. Este arquivo aplica só
// até a 023, grava o estado que o app ANTIGO deixava (editado_manualmente = 1,
// origem_edicao ainda NULL porque a coluna values default, botão gravado só no
// canal próprio), roda a 024 sozinha e confere o resultado.
describe('migração 024 — backfill de origem_edicao', () => {
  const dirMigrations = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
  const numeroDaMigracao = (nome: string) => parseInt(nome.slice(0, 3), 10);
  const aplicar = (db: Database.Database, nome: string): void => {
    db.exec(fs.readFileSync(path.join(dirMigrations, nome), 'utf-8'));
  };
  const abrirAte = (numero: number): Database.Database => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    const arquivos = fs.readdirSync(dirMigrations).filter((f) => f.endsWith('.sql')).sort();
    for (const arquivo of arquivos) {
      if (numeroDaMigracao(arquivo) > numero) break;
      aplicar(db, arquivo);
    }
    db.pragma('foreign_keys = ON');
    return db;
  };

  it('recupera a origem de correções de revisão e de QA aceitas antes da coluna existir, e preserva a digitada à mão', () => {
    const db = abrirAte(23);

    const obraId = reposObras.criar(db, { titulo: 'Obra' }).id;
    const cap = reposCapitulos.criar(db, obraId, { numero: 1, texto_origem: '甲乙丙' }, [
      { texto_zh: '甲说。', paragrafo: 0 },
      { texto_zh: '乙说。', paragrafo: 0 },
      { texto_zh: '丙说。', paragrafo: 0 },
    ]);
    const [fraseRevisao, fraseQa, fraseManual] = reposFrases.listarPorCapitulo(db, cap.id);

    // As três nascem traduzidas pela IA (texto_pt_original_ia precisa existir —
    // é o que `classificarEdicoes` compara contra texto_pt para saber se algo
    // mudou; sem ele a frase é ignorada, `ia` fica nulo).
    reposFrases.aplicarTraducaoIa(db, fraseRevisao.id, 'Ele já morreu.');
    reposFrases.aplicarTraducaoIa(db, fraseQa.id, 'Ele já morreu.');
    reposFrases.aplicarTraducaoIa(db, fraseManual.id, 'Ele já se retirou.');

    // Frase A: simula o app ANTIGO aplicando uma correção do banco de testes —
    // marcava editado_manualmente e o caso como corrigido, mas não tinha coluna
    // para gravar a origem (o código atual, pós-023, já grava 'revisao' sozinho;
    // aqui reproduzimos o que ficou de ANTES dele existir).
    const caso = reposTestes.criar(db, {
      frase_id: fraseRevisao.id,
      obra_id: obraId,
      caso_pai_id: null,
      trecho_zh: '甲',
      pergunta: 'p',
      veredito: 'incorreto',
      resposta: 'r',
      justificativa: '',
      secao_regra: null,
      correcao_proposta: null,
      trecho_pt_errado: null,
      trecho_pt_corrigido: null,
      motivo_rejeicao: null,
      provedor: 'mock',
      modelo: 'mock-v1',
      resposta_bruta: '{}',
    });
    db.prepare("UPDATE frases SET texto_pt = 'Ele já está morto.', editado_manualmente = 1 WHERE id = ?").run(
      fraseRevisao.id,
    );
    db.prepare("UPDATE banco_testes SET status = 'corrigido' WHERE id = ?").run(caso.id);

    // Frase B: mesma simulação, agora pelo canal de QA (apontamento aceito).
    db.prepare(
      `INSERT INTO qa_apontamentos (capitulo_id, frase_id, tipo, severidade, observacao, sugestao, status, provedor, modelo)
       VALUES (?, ?, 'outro', 'media', 'obs', 'Ele já se foi.', 'aceito', 'mock', 'm')`,
    ).run(cap.id, fraseQa.id);
    db.prepare("UPDATE frases SET texto_pt = 'Ele já se foi.', editado_manualmente = 1 WHERE id = ?").run(
      fraseQa.id,
    );

    // Frase C: edição DIGITADA de verdade — sem caso de teste, sem apontamento de
    // QA. Precisa sobreviver ao backfill com origem_edicao ainda NULL.
    reposFrases.editarTexto(db, fraseManual.id, 'Ele já expirou.');

    // Confere o estado "sujo" antes da 024: as três estão com origem_edicao NULL.
    for (const f of [fraseRevisao, fraseQa, fraseManual]) {
      expect(reposFrases.obter(db, f.id)!.origem_edicao).toBeNull();
    }

    aplicar(db, '024_origem_edicao_retroativa.sql');

    expect(reposFrases.obter(db, fraseRevisao.id)!.origem_edicao).toBe('revisao');
    expect(reposFrases.obter(db, fraseQa.id)!.origem_edicao).toBe('qa');
    expect(reposFrases.obter(db, fraseManual.id)!.origem_edicao).toBeNull();

    // O ponto do item: sem o backfill, a frase A entraria duas vezes na mineração
    // (uma vez como caso do banco de testes, outra como "digitada à mão"). Depois
    // da 024, só a frase C — a digitada de verdade — aparece.
    const paraMineracao = reposFrases.paraMineracao(db, obraId);
    const classificadas = classificarEdicoes(paraMineracao, [], PREFERENCIAS_PADRAO);
    expect(classificadas.map((c) => c.frase_id)).toEqual([fraseManual.id]);

    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);

    db.close();
  });

  it('não sobrescreve origem_edicao já gravada corretamente (idempotência)', () => {
    const db = abrirAte(24); // banco novo, já com o backfill de fábrica
    const obraId = reposObras.criar(db, { titulo: 'Obra' }).id;
    const cap = reposCapitulos.criar(db, obraId, { numero: 1, texto_origem: '甲' }, [
      { texto_zh: '甲说。', paragrafo: 0 },
    ]);
    const [frase] = reposFrases.listarPorCapitulo(db, cap.id);
    reposFrases.editarTexto(db, frase.id, 'texto novo', 'passe-estilo');

    // Reaplicar a lógica da 024 sobre um banco onde a frase JÁ tem origem não-nula
    // não pode reverter para NULL nem trocar — o WHERE origem_edicao IS NULL
    // protege isso; roda de novo só para provar.
    db.exec(fs.readFileSync(path.join(dirMigrations, '024_origem_edicao_retroativa.sql'), 'utf-8'));
    expect(reposFrases.obter(db, frase.id)!.origem_edicao).toBe('passe-estilo');

    db.close();
  });
});
