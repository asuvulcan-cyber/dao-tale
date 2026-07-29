import type {
  EstadoMetrica,
  SomaUso,
  TelemetriaCapitulo,
  TelemetriaDia,
  TelemetriaDiaProvedor,
  TelemetriaObra,
  VereditoCache,
  VereditoLote,
} from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import { reposEventos } from '../db/eventosIa.js';
import { dataLocalHoje, reposCapitulos, reposConfig, reposLotes, reposUso } from '../db/repos.js';
import { buscarPreco, economiaDoCache } from './precos.js';

// Montagem do painel (doc 11 §5): junta o livro-caixa (eventos_ia) com a
// qualidade JÁ COMPUTADA — edição humana e termos novos dos agregados do
// checkpoint, violações da varredura de consistência, apontamentos do QA. Nada
// de qualidade é recalculado aqui.
//
// Não existe métrica de tempo neste arquivo, de propósito: a revisão humana é
// integral em qualquer cenário, então o painel só responde dinheiro e cota
// (premissa `feedback-lote-financeiro`).

/** Custo por 1.000 frases: o normalizador que torna capítulos de tamanhos
 * diferentes comparáveis. `null` quando falta preço ou frase. */
function custoPorMilFrases(soma: SomaUso, frases: number): number | null {
  if (frases <= 0 || soma.chamadas === 0) return null;
  // Com qualquer chamada sem preço, o custo do capítulo está incompleto — dizer
  // um número aqui seria pior que dizer "não sei".
  if (soma.chamadas_sem_preco > 0) return null;
  return (soma.custo_usd / frases) * 1000;
}

const SOMA_ZERO: SomaUso = {
  chamadas: 0,
  tokens_entrada: 0,
  tokens_saida: 0,
  tokens_cache_leitura: 0,
  tokens_cache_criacao: 0,
  custo_usd: 0,
  chamadas_sem_preco: 0,
};

/** (a) O prompt caching está acertando? Em porcentagem e em dinheiro.
 *
 * `porModeloPapel` (não só por modelo) é o que dá para achar o A4: lá era a
 * revisão que pagava escrita e nunca lia, no MESMO modelo em que a tradução lia
 * normalmente — a soma por modelo daria "cache ok" e o desperdício seguiria
 * invisível. */
export function vereditoCache(
  db: BancoDados,
  porModeloPapel: (SomaUso & { provedor: string; modelo: string; papel: string })[],
): VereditoCache {
  const precos = reposConfig.obterTodas(db).precos_modelos;
  let entradaTotal = 0;
  let lidoTotal = 0;
  let economia: number | null = null;
  const escrita_perdida: VereditoCache['escrita_perdida'] = [];

  for (const m of porModeloPapel) {
    entradaTotal += m.tokens_entrada + m.tokens_cache_leitura + m.tokens_cache_criacao;
    lidoTotal += m.tokens_cache_leitura;
    const parcial = economiaDoCache(buscarPreco(precos, m.provedor, m.modelo), m.tokens_cache_leitura);
    if (parcial !== null) economia = (economia ?? 0) + parcial;
    // A4 da auditoria: paga-se a escrita (1,25×) e nunca se lê — o pior dos
    // mundos, e invisível até existir telemetria. Uma única chamada de um papel
    // sempre escreve sem ler (não houve chamada anterior para aproveitar), então
    // só acusa a partir de 2 chamadas — abaixo disso não há padrão, só estreia.
    if (m.tokens_cache_criacao > 0 && m.tokens_cache_leitura === 0 && m.chamadas >= 2) {
      escrita_perdida.push({ provedor: m.provedor, modelo: m.modelo, papel: m.papel, tokens: m.tokens_cache_criacao });
    }
  }

  if (entradaTotal === 0) {
    return {
      estado: 'amostra-insuficiente',
      acerto_pct: null,
      economia_usd: null,
      escrita_perdida,
      detalhe: 'Nenhuma chamada com consumo de entrada registrado ainda.',
    };
  }

  const acerto_pct = (lidoTotal / entradaTotal) * 100;
  // Abaixo de 20% de acerto num uso repetido, o prefixo estável não está pegando
  // (pausa maior que o TTL, sistema mudando entre chamadas, provedor sem cache).
  const estado: EstadoMetrica = acerto_pct >= 20 ? 'ok' : 'acima';
  const detalhe =
    escrita_perdida.length > 0
      ? `${acerto_pct.toFixed(1)}% da entrada veio do cache — mas ${escrita_perdida.length} par(es) pagam escrita de cache e nunca leem (A4).`
      : acerto_pct >= 20
        ? `${acerto_pct.toFixed(1)}% da entrada veio do cache.`
        : `Só ${acerto_pct.toFixed(1)}% da entrada veio do cache — o prefixo estável não está pegando.`;
  return { estado, acerto_pct, economia_usd: economia, escrita_perdida, detalhe };
}

/** (b) O lote compensou em dinheiro? Compara US$/1k frases entre os grupos. */
export function vereditoLote(capitulos: TelemetriaCapitulo[]): VereditoLote {
  const medir = (grupo: TelemetriaCapitulo[]) => {
    const comCusto = grupo.filter((c) => c.custo_por_mil_frases !== null);
    return {
      capitulos: comCusto.length,
      custo_por_mil_frases: comCusto.length
        ? comCusto.reduce((s, c) => s + (c.custo_por_mil_frases ?? 0), 0) / comCusto.length
        : null,
    };
  };
  const lote = medir(capitulos.filter((c) => c.em_lote));
  const sequencial = medir(capitulos.filter((c) => !c.em_lote));

  if (lote.custo_por_mil_frases === null || sequencial.custo_por_mil_frases === null) {
    const faltando = lote.custo_por_mil_frases === null ? 'em lote' : 'sequenciais';
    return {
      estado: 'amostra-insuficiente',
      lote,
      sequencial,
      diferenca_pct: null,
      detalhe: `Sem capítulos ${faltando} com custo conhecido — a comparação exige os dois grupos (e preço cadastrado).`,
    };
  }

  const diferenca_pct = ((lote.custo_por_mil_frases - sequencial.custo_por_mil_frases) / sequencial.custo_por_mil_frases) * 100;
  return {
    estado: diferenca_pct <= 0 ? 'ok' : 'acima',
    lote,
    sequencial,
    diferenca_pct,
    detalhe:
      diferenca_pct <= 0
        ? `O lote saiu ${Math.abs(diferenca_pct).toFixed(1)}% mais barato por frase que a tradução sequencial.`
        : `O lote saiu ${diferenca_pct.toFixed(1)}% mais CARO por frase que a tradução sequencial.`,
  };
}

export function telemetriaDaObra(db: BancoDados, obraId: number): TelemetriaObra {
  const config = reposConfig.obterTodas(db);
  const porCapitulo = reposEventos.porCapitulo(db, obraId);
  const emLote = new Set(reposLotes.capituloIdsEmLote(db, obraId));

  // Qualidade: dos mesmos agregados que o checkpoint (doc 09 §4) usa.
  const agregados = new Map(reposCapitulos.agregadosCheckpoint(db, obraId).map((a) => [a.id, a]));
  const capitulos: TelemetriaCapitulo[] = reposCapitulos.listar(db, obraId).map((c) => {
    const soma = porCapitulo.get(c.id) ?? { ...SOMA_ZERO };
    const agregado = agregados.get(c.id);
    return {
      ...soma,
      capitulo_id: c.id,
      numero: c.numero,
      titulo_pt: c.titulo_pt,
      status: c.status,
      em_lote: emLote.has(c.id),
      frases_total: c.frases_total,
      frases_editadas: agregado?.frases_editadas ?? 0,
      termos_sugeridos: agregado?.termos_sugeridos ?? 0,
      consistencia_violacoes: c.consistencia_violacoes,
      qa_pendentes: c.qa_pendentes,
      custo_por_mil_frases: custoPorMilFrases(soma, c.frases_total),
    };
  });

  return {
    obra_id: obraId,
    total: reposEventos.totalDaObra(db, obraId),
    por_papel: reposEventos.porPapel(db, obraId),
    por_modelo: reposEventos.porModelo(db, obraId),
    capitulos,
    cache: vereditoCache(db, reposEventos.porModeloPapel(db, obraId)),
    lote: vereditoLote(capitulos),
    sem_preco: reposEventos.semPreco(db, obraId),
    taxa_usd_brl: config.taxa_usd_brl,
  };
}

/** (c) O dia de hoje: dinheiro e cota lado a lado, por provedor. A coluna
 * `tentativas` vem de `uso_ia` (conta retries e falhas, que é o que o provedor
 * debita); a diferença contra `chamadas` é o desperdício. */
export function telemetriaDoDia(db: BancoDados, data = dataLocalHoje()): TelemetriaDia {
  const config = reposConfig.obterTodas(db);
  const eventos = reposEventos.porProvedorNoDia(db, data);
  const tentativasPorProvedor = new Map<string, number>();
  for (const u of reposUso.hoje(db)) {
    tentativasPorProvedor.set(u.provedor, (tentativasPorProvedor.get(u.provedor) ?? 0) + u.requisicoes);
  }

  // Um provedor pode aparecer só em uso_ia (todas as chamadas falharam) — e
  // justamente esse caso é o que mais interessa ver.
  const ids = new Set<string>([...eventos.map((e) => e.provedor), ...tentativasPorProvedor.keys()]);
  const provedores: TelemetriaDiaProvedor[] = [...ids]
    .map((provedor) => {
      const soma = eventos.find((e) => e.provedor === provedor) ?? { ...SOMA_ZERO };
      const tentativas = tentativasPorProvedor.get(provedor) ?? 0;
      const cota_diaria = config.cotas_diarias[provedor] ?? 0;
      return {
        ...soma,
        provedor,
        tentativas,
        cota_diaria,
        pct_cota: cota_diaria > 0 ? Math.min(100, (tentativas / cota_diaria) * 100) : null,
      };
    })
    .sort((a, b) => b.custo_usd - a.custo_usd || b.tentativas - a.tentativas);

  return {
    data,
    provedores,
    total: reposEventos.totalDoDia(db, data),
    tentativas: [...tentativasPorProvedor.values()].reduce((s, n) => s + n, 0),
    taxa_usd_brl: config.taxa_usd_brl,
  };
}
