import type {
  CheckpointObra,
  Configuracoes,
  FaseTraducao,
  MetricaCheckpoint,
  StatusCapitulo,
} from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import { reposCapitulos, reposFrases, reposGlossario } from '../db/repos.js';
import { varrerConsistencia } from './consistencia.js';

// Checkpoint de estabilidade (doc 09 §4): decide, por taxas medidas nos dados
// reais, se a obra pode entrar em cruzeiro — nunca por número fixo de capítulos.

export interface CapituloCheckpoint {
  id: number;
  numero: number;
  status: StatusCapitulo;
  frases_total: number;
  frases_editadas: number;
  termos_sugeridos: number;
  /** Violações de consistência do glossário (só calculado na janela da métrica 1). */
  violacoes?: number;
}

const PRONTO: StatusCapitulo[] = ['traduzido', 'revisado', 'finalizado'];
const REVISADO: StatusCapitulo[] = ['revisado', 'finalizado'];

/** Últimos `janela` capítulos (por número desc) cujo status está no conjunto. */
function janela(caps: CapituloCheckpoint[], status: StatusCapitulo[], tamanho: number): CapituloCheckpoint[] {
  return caps
    .filter((c) => status.includes(c.status))
    .sort((a, b) => b.numero - a.numero)
    .slice(0, tamanho);
}

function taxaPor100(numerador: number, frases: number): number {
  return frases > 0 ? (numerador / frases) * 100 : 0;
}

/** Monta uma métrica: amostra insuficiente se a janela não encheu; senão
 * compara a taxa medida ao limiar. */
function metrica(
  chave: MetricaCheckpoint['chave'],
  rotulo: string,
  amostra: CapituloCheckpoint[],
  janelaAlvo: number,
  valor: number | null,
  limiar: number,
  bloqueia: boolean,
  unidade: string,
): MetricaCheckpoint {
  if (amostra.length < janelaAlvo) {
    return {
      chave,
      rotulo,
      valor,
      limiar,
      bloqueia,
      estado: 'amostra-insuficiente',
      detalhe: `Amostra insuficiente: ${amostra.length}/${janelaAlvo} capítulos no estado exigido.`,
    };
  }
  const acima = valor != null && valor > limiar;
  return {
    chave,
    rotulo,
    valor,
    limiar,
    bloqueia,
    estado: acima ? 'acima' : 'ok',
    detalhe: acima
      ? `${valor!.toFixed(1)}${unidade} — acima do limite de ${limiar}${unidade}.`
      : `${(valor ?? 0).toFixed(1)}${unidade} — dentro do limite de ${limiar}${unidade}.`,
  };
}

/** Cálculo puro do checkpoint a partir dos dados já coletados (testável). */
export function montarCheckpoint(
  obraId: number,
  fase: FaseTraducao,
  caps: CapituloCheckpoint[],
  config: Pick<
    Configuracoes,
    'checkpoint_janela' | 'checkpoint_termos_max' | 'checkpoint_edicao_max' | 'checkpoint_violacoes_max'
  >,
): CheckpointObra {
  const alvo = Math.max(1, config.checkpoint_janela);

  const janelaPronto = janela(caps, PRONTO, alvo);
  const janelaRevisado = janela(caps, REVISADO, alvo);

  // Métrica 1 — termos novos /100 frases (capítulos prontos).
  const frasesPronto = janelaPronto.reduce((s, c) => s + c.frases_total, 0);
  const termos = janelaPronto.reduce((s, c) => s + c.termos_sugeridos, 0);
  const mTermos = metrica(
    'termos',
    'Termos novos por 100 frases',
    janelaPronto,
    alvo,
    janelaPronto.length ? taxaPor100(termos, frasesPronto) : null,
    config.checkpoint_termos_max,
    true,
    '',
  );

  // Métrica 2 — edição humana % (capítulos revisados).
  const frasesRevisado = janelaRevisado.reduce((s, c) => s + c.frases_total, 0);
  const editadas = janelaRevisado.reduce((s, c) => s + c.frases_editadas, 0);
  const mEdicao = metrica(
    'edicao',
    'Frases editadas à mão',
    janelaRevisado,
    alvo,
    janelaRevisado.length ? taxaPor100(editadas, frasesRevisado) : null,
    config.checkpoint_edicao_max,
    true,
    '%',
  );

  // Métrica 3 — violações de consistência /100 frases (mesma janela da 1).
  const temViolacoes = janelaPronto.every((c) => c.violacoes != null);
  const violacoes = janelaPronto.reduce((s, c) => s + (c.violacoes ?? 0), 0);
  const mViolacoes = metrica(
    'violacoes',
    'Violações de glossário por 100 frases',
    janelaPronto,
    alvo,
    janelaPronto.length && temViolacoes ? taxaPor100(violacoes, frasesPronto) : null,
    config.checkpoint_violacoes_max,
    config.checkpoint_violacoes_max > 0, // 0 = só informativa
    '',
  );

  const metricas = [mTermos, mEdicao, mViolacoes];
  const aprovado = metricas
    .filter((m) => m.bloqueia)
    .every((m) => m.estado === 'ok');

  return {
    obra_id: obraId,
    fase,
    janela_capitulos: janelaPronto.map((c) => c.numero),
    janela_alvo: alvo,
    metricas,
    aprovado,
  };
}

/** Coleta os dados da obra e calcula o checkpoint. A varredura de consistência
 * (métrica 3) roda só nos capítulos da janela — barata mesmo em obra grande. */
export function checkpointDaObra(db: BancoDados, obraId: number, fase: FaseTraducao, config: Configuracoes): CheckpointObra {
  const agregados = reposCapitulos.agregadosCheckpoint(db, obraId);
  const caps: CapituloCheckpoint[] = agregados.map((a) => ({ ...a }));

  // Só a janela da métrica 1 precisa de consistência — evita varrer a obra toda.
  const alvo = Math.max(1, config.checkpoint_janela);
  const naJanela = new Set(janela(caps, PRONTO, alvo).map((c) => c.id));
  if (naJanela.size > 0) {
    const glossario = reposGlossario.listar(db, obraId);
    for (const c of caps) {
      if (!naJanela.has(c.id)) continue;
      c.violacoes = varrerConsistencia(reposFrases.listarPorCapitulo(db, c.id), glossario).violacoes.length;
    }
  }

  return montarCheckpoint(obraId, fase, caps, config);
}
