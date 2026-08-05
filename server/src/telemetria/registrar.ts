import type { PapelIa } from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import { reposEventos } from '../db/eventosIa.js';
import { reposConfig } from '../db/repos.js';
import type { UsoChamada } from '../ia/provedor.js';
import { USO_VAZIO } from '../ia/uso.js';
import { buscarPreco, calcularCusto } from './precos.js';

// Ponto de entrada único da telemetria (doc 11 §2): resolve o preço, calcula o
// custo e grava a linha. Todos os sete pontos de chamada passam por aqui.

export interface DadosEvento {
  obra_id: number | null;
  capitulo_id: number | null;
  papel: PapelIa;
  provedor: string;
  modelo: string;
  uso: UsoChamada;
}

/**
 * Grava o consumo real de uma chamada. **Nunca lança**: telemetria é
 * contabilidade, não o trabalho — perder uma linha é aceitável, derrubar um job
 * de tradução no meio (C2 da auditoria) não é.
 */
export function registrarEvento(db: BancoDados, dados: DadosEvento): void {
  try {
    // Provedor que não reportou consumo ainda gerou uma chamada: a linha entra
    // com tokens nulos em vez de desaparecer do livro-caixa.
    const uso = dados.uso ?? USO_VAZIO;
    const precos = reposConfig.obterTodas(db).precos_modelos;
    const preco = buscarPreco(precos, dados.provedor, dados.modelo);
    reposEventos.registrar(db, {
      obra_id: dados.obra_id,
      capitulo_id: dados.capitulo_id,
      papel: dados.papel,
      provedor: dados.provedor,
      modelo: dados.modelo,
      tokens_entrada: uso.tokens_entrada,
      tokens_saida: uso.tokens_saida,
      tokens_cache_leitura: uso.tokens_cache_leitura,
      tokens_cache_criacao: uso.tokens_cache_criacao,
      // Apelido pedido vs modelo que atendeu: sem isto não dá para cruzar o
      // consumo com o painel do provedor, onde a cota é POR MODELO.
      modelo_resolvido: uso.modelo_resolvido ?? null,
      custo_estimado: calcularCusto(preco, uso),
    });
  } catch (e) {
    console.warn('[telemetria] falha ao registrar consumo da IA:', (e as Error).message);
  }
}

/** Recalcula o custo de todo o histórico com a tabela de preços vigente — para
 * quando o usuário cadastra preços depois de já ter rodado. Explícito de
 * propósito: gravar preço novo não reescreve o passado sozinho. */
export function recalcularCustos(db: BancoDados): { atualizados: number; total: number } {
  const precos = reposConfig.obterTodas(db).precos_modelos;
  const eventos = reposEventos.listarTodos(db);
  let atualizados = 0;
  db.transaction(() => {
    for (const ev of eventos) {
      const novo = calcularCusto(buscarPreco(precos, ev.provedor, ev.modelo), ev);
      // Comparação tolerante a ponto flutuante: só grava o que de fato mudou.
      const igual =
        (novo === null && ev.custo_estimado === null) ||
        (novo !== null && ev.custo_estimado !== null && Math.abs(novo - ev.custo_estimado) < 1e-12);
      if (igual) continue;
      reposEventos.definirCusto(db, ev.id, novo);
      atualizados++;
    }
  })();
  return { atualizados, total: eventos.length };
}
