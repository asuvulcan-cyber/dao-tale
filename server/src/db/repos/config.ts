import type {
  Configuracoes,
  ParProvedor,
  PrecoModelo,
  PrecosModelos,
  ProvedorId,
  TemperaturasPapel,
} from '@dao-tale/shared';
import { CONFIG_PADRAO, normalizarTemperaturas } from '@dao-tale/shared';
import type { BancoDados } from '../index.js';

export const reposConfig = {
  obterTodas(db: BancoDados): Configuracoes {
    const linhas = db.prepare('SELECT chave, valor FROM configuracoes').all() as {
      chave: string;
      valor: string;
    }[];
    const mapa = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
    return {
      provedor_padrao: (mapa.provedor_padrao as Configuracoes['provedor_padrao']) ?? CONFIG_PADRAO.provedor_padrao,
      modelo_padrao: mapa.modelo_padrao ?? CONFIG_PADRAO.modelo_padrao,
      tamanho_bloco: numeroConfig(mapa.tamanho_bloco, CONFIG_PADRAO.tamanho_bloco),
      vizinhas_revisao: numeroConfig(mapa.vizinhas_revisao, CONFIG_PADRAO.vizinhas_revisao),
      cauda_contexto: numeroConfig(mapa.cauda_contexto, CONFIG_PADRAO.cauda_contexto),
      parar_no_limite: mapa.parar_no_limite ? mapa.parar_no_limite === 'true' : CONFIG_PADRAO.parar_no_limite,
      glossario_relevante: mapa.glossario_relevante
        ? mapa.glossario_relevante === 'true'
        : CONFIG_PADRAO.glossario_relevante,
      provedor_revisao: (mapa.provedor_revisao as Configuracoes['provedor_revisao']) ?? CONFIG_PADRAO.provedor_revisao,
      modelo_revisao: mapa.modelo_revisao ?? CONFIG_PADRAO.modelo_revisao,
      provedor_detalhes:
        (mapa.provedor_detalhes as Configuracoes['provedor_detalhes']) ?? CONFIG_PADRAO.provedor_detalhes,
      modelo_detalhes: mapa.modelo_detalhes ?? CONFIG_PADRAO.modelo_detalhes,
      temperaturas: lerTemperaturas(mapa),
      cotas_diarias: lerCotasDiarias(mapa),
      checkpoint_janela: numeroConfig(mapa.checkpoint_janela, CONFIG_PADRAO.checkpoint_janela),
      checkpoint_termos_max: numeroConfig(mapa.checkpoint_termos_max, CONFIG_PADRAO.checkpoint_termos_max),
      checkpoint_edicao_max: numeroConfig(mapa.checkpoint_edicao_max, CONFIG_PADRAO.checkpoint_edicao_max),
      checkpoint_violacoes_max: numeroConfig(mapa.checkpoint_violacoes_max, CONFIG_PADRAO.checkpoint_violacoes_max),
      lote_paralelo: numeroConfig(mapa.lote_paralelo, CONFIG_PADRAO.lote_paralelo),
      failover: lerFailover(mapa),
      provedor_qa: (mapa.provedor_qa as Configuracoes['provedor_qa']) ?? CONFIG_PADRAO.provedor_qa,
      modelo_qa: mapa.modelo_qa ?? CONFIG_PADRAO.modelo_qa,
      qa_automatica: mapa.qa_automatica ? mapa.qa_automatica === 'true' : CONFIG_PADRAO.qa_automatica,
      precos_modelos: lerPrecos(mapa),
      taxa_usd_brl: numeroConfig(mapa.taxa_usd_brl, CONFIG_PADRAO.taxa_usd_brl),
    };
  },

  definir(db: BancoDados, valores: Partial<Configuracoes>): Configuracoes {
    const stmt = db.prepare(
      'INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor',
    );
    db.transaction(() => {
      for (const [chave, valor] of Object.entries(valores)) {
        if (valor === undefined) continue;
        stmt.run(chave, typeof valor === 'object' ? JSON.stringify(valor) : String(valor));
      }
    })();
    return this.obterTodas(db);
  },
};

/** Config numérica com guarda de NaN (B9): valor corrompido cai no padrão. */
function numeroConfig(valor: string | undefined, padrao: number): number {
  if (valor === undefined || valor === '') return padrao;
  const n = Number(valor);
  return Number.isFinite(n) ? n : padrao;
}

function lerFailover(mapa: Record<string, string>): ParProvedor[] {
  if (!mapa.failover) return [...CONFIG_PADRAO.failover];
  try {
    const lista = JSON.parse(mapa.failover);
    if (!Array.isArray(lista)) return [];
    return lista
      .filter((p) => p && typeof p.provedor === 'string')
      .map((p) => ({ provedor: p.provedor as ProvedorId, modelo: typeof p.modelo === 'string' ? p.modelo : '' }));
  } catch {
    return [];
  }
}

function lerPrecos(mapa: Record<string, string>): PrecosModelos {
  if (!mapa.precos_modelos) return { ...CONFIG_PADRAO.precos_modelos };
  try {
    const bruto = JSON.parse(mapa.precos_modelos) as Record<string, unknown>;
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return {};
    const precos: PrecosModelos = {};
    for (const [chave, valor] of Object.entries(bruto)) {
      const p = valor as Partial<PrecoModelo> | null;
      if (!p || typeof p !== 'object') continue;
      if (!Number.isFinite(p.entrada) || !Number.isFinite(p.saida)) continue;
      precos[chave] = {
        entrada: p.entrada!,
        saida: p.saida!,
        ...(Number.isFinite(p.cache_leitura) ? { cache_leitura: p.cache_leitura! } : {}),
        ...(Number.isFinite(p.cache_criacao) ? { cache_criacao: p.cache_criacao! } : {}),
      };
    }
    return precos;
  } catch {
    return { ...CONFIG_PADRAO.precos_modelos };
  }
}

function lerTemperaturas(mapa: Record<string, string>): TemperaturasPapel {
  if (!mapa.temperaturas) return { ...CONFIG_PADRAO.temperaturas };
  try {
    return normalizarTemperaturas(JSON.parse(mapa.temperaturas));
  } catch {
    return { ...CONFIG_PADRAO.temperaturas };
  }
}

function lerCotasDiarias(mapa: Record<string, string>): Record<string, number> {
  if (mapa.cotas_diarias) {
    try {
      return JSON.parse(mapa.cotas_diarias) as Record<string, number>;
    } catch {
      // Valor corrompido: cai para os padrões ou chaves antigas abaixo.
    }
  }
  const cotas = { ...CONFIG_PADRAO.cotas_diarias };
  if (mapa.cota_diaria_gemini !== undefined) cotas.gemini = Number(mapa.cota_diaria_gemini);
  if (mapa.cota_diaria_claude !== undefined) cotas.claude = Number(mapa.cota_diaria_claude);
  return cotas;
}
