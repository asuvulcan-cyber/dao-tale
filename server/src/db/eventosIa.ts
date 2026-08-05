import type { PapelIa, SomaUso } from '@dao-tale/shared';
import type { BancoDados } from './index.js';
import { dataLocalHoje } from './repos.js';

// Livro-caixa das chamadas de IA (doc 11 §2): uma linha por chamada que devolveu
// `usage`. Só SQL aqui — a conversão tokens→dinheiro é de telemetria/precos.ts e
// a montagem do painel é de telemetria/painel.ts.

export interface EventoIaNovo {
  obra_id: number | null;
  capitulo_id: number | null;
  papel: PapelIa;
  provedor: string;
  /** O que foi PEDIDO — pode ser apelido ("gemini-flash-latest"). */
  modelo: string;
  /** O que ATENDEU, quando o provedor informa. A cota gratuita é por modelo
   *  concreto, então é este que cruza com o painel do provedor. */
  modelo_resolvido?: string | null;
  tokens_entrada: number | null;
  tokens_saida: number | null;
  tokens_cache_leitura: number | null;
  tokens_cache_criacao: number | null;
  custo_estimado: number | null;
}

/** Uma chamada como está gravada (usada pelo recálculo de custos). */
export interface EventoIa extends EventoIaNovo {
  id: number;
  em: string;
  data: string;
}

// Colunas de agregação: mesma forma de SomaUso em qualquer agrupamento. Somas
// tratam NULL como 0 (campo que o provedor não expôs não inventa consumo);
// `chamadas_sem_preco` é o que impede um modelo sem preço de virar US$ 0,00.
const SOMA = `
  COUNT(*)                                                  AS chamadas,
  COALESCE(SUM(tokens_entrada), 0)                           AS tokens_entrada,
  COALESCE(SUM(tokens_saida), 0)                             AS tokens_saida,
  COALESCE(SUM(tokens_cache_leitura), 0)                     AS tokens_cache_leitura,
  COALESCE(SUM(tokens_cache_criacao), 0)                     AS tokens_cache_criacao,
  COALESCE(SUM(custo_estimado), 0)                           AS custo_usd,
  SUM(CASE WHEN custo_estimado IS NULL THEN 1 ELSE 0 END)    AS chamadas_sem_preco`;

const SOMA_ZERO: SomaUso = {
  chamadas: 0,
  tokens_entrada: 0,
  tokens_saida: 0,
  tokens_cache_leitura: 0,
  tokens_cache_criacao: 0,
  custo_usd: 0,
  chamadas_sem_preco: 0,
};

export const reposEventos = {
  registrar(db: BancoDados, dados: EventoIaNovo): void {
    db.prepare(
      `INSERT INTO eventos_ia
        (data, obra_id, capitulo_id, papel, provedor, modelo, modelo_resolvido,
         tokens_entrada, tokens_saida, tokens_cache_leitura, tokens_cache_criacao, custo_estimado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      dataLocalHoje(),
      dados.obra_id,
      dados.capitulo_id,
      dados.papel,
      dados.provedor,
      dados.modelo,
      dados.modelo_resolvido ?? null,
      dados.tokens_entrada,
      dados.tokens_saida,
      dados.tokens_cache_leitura,
      dados.tokens_cache_criacao,
      dados.custo_estimado,
    );
  },

  /** Total da obra. */
  totalDaObra(db: BancoDados, obraId: number): SomaUso {
    const l = db.prepare(`SELECT ${SOMA} FROM eventos_ia WHERE obra_id = ?`).get(obraId) as SomaUso;
    return l.chamadas > 0 ? l : { ...SOMA_ZERO };
  },

  porPapel(db: BancoDados, obraId: number): (SomaUso & { papel: PapelIa })[] {
    return db
      .prepare(`SELECT papel, ${SOMA} FROM eventos_ia WHERE obra_id = ? GROUP BY papel ORDER BY custo_usd DESC, chamadas DESC`)
      .all(obraId) as (SomaUso & { papel: PapelIa })[];
  },

  porModelo(db: BancoDados, obraId: number): (SomaUso & { provedor: string; modelo: string })[] {
    return db
      .prepare(
        `SELECT provedor, modelo, ${SOMA} FROM eventos_ia WHERE obra_id = ?
         GROUP BY provedor, modelo ORDER BY custo_usd DESC, chamadas DESC`,
      )
      .all(obraId) as (SomaUso & { provedor: string; modelo: string })[];
  },

  /** Por par E papel. Granularidade obrigatória para achar o A4 da auditoria:
   * lá era a REVISÃO que pagava escrita de cache e nunca lia, no mesmo modelo em
   * que a tradução lia normalmente — agregar só por modelo esconderia o caso. */
  porModeloPapel(db: BancoDados, obraId: number): (SomaUso & { provedor: string; modelo: string; papel: PapelIa })[] {
    return db
      .prepare(
        `SELECT provedor, modelo, papel, ${SOMA} FROM eventos_ia WHERE obra_id = ?
         GROUP BY provedor, modelo, papel ORDER BY custo_usd DESC`,
      )
      .all(obraId) as (SomaUso & { provedor: string; modelo: string; papel: PapelIa })[];
  },

  /** Agregado por capítulo (só linhas atribuídas a um capítulo). */
  porCapitulo(db: BancoDados, obraId: number): Map<number, SomaUso> {
    const linhas = db
      .prepare(
        `SELECT capitulo_id, ${SOMA} FROM eventos_ia
         WHERE obra_id = ? AND capitulo_id IS NOT NULL GROUP BY capitulo_id`,
      )
      .all(obraId) as (SomaUso & { capitulo_id: number })[];
    return new Map(linhas.map(({ capitulo_id, ...soma }) => [capitulo_id, soma]));
  },

  /** Pares sem preço cadastrado — alimenta o aviso do painel. */
  semPreco(db: BancoDados, obraId: number): { provedor: string; modelo: string; chamadas: number }[] {
    return db
      .prepare(
        `SELECT provedor, modelo, COUNT(*) AS chamadas FROM eventos_ia
         WHERE obra_id = ? AND custo_estimado IS NULL
         GROUP BY provedor, modelo ORDER BY chamadas DESC`,
      )
      .all(obraId) as { provedor: string; modelo: string; chamadas: number }[];
  },

  /** Consumo de um dia local (padrão: hoje) por provedor — pergunta da cota. */
  porProvedorNoDia(db: BancoDados, data = dataLocalHoje()): (SomaUso & { provedor: string })[] {
    return db
      .prepare(`SELECT provedor, ${SOMA} FROM eventos_ia WHERE data = ? GROUP BY provedor ORDER BY custo_usd DESC`)
      .all(data) as (SomaUso & { provedor: string })[];
  },

  totalDoDia(db: BancoDados, data = dataLocalHoje()): SomaUso {
    const l = db.prepare(`SELECT ${SOMA} FROM eventos_ia WHERE data = ?`).get(data) as SomaUso;
    return l.chamadas > 0 ? l : { ...SOMA_ZERO };
  },

  /** Todas as linhas, para o recálculo de custo depois que o usuário cadastra
   * preços (o histórico não é reescrito por mudança de preço sem pedido). */
  listarTodos(db: BancoDados): EventoIa[] {
    return db.prepare('SELECT * FROM eventos_ia ORDER BY id').all() as EventoIa[];
  },

  definirCusto(db: BancoDados, id: number, custo: number | null): void {
    db.prepare('UPDATE eventos_ia SET custo_estimado = ? WHERE id = ?').run(custo, id);
  },
};
