import { EventEmitter } from 'node:events';
import type { EventoTraducao, ProgressoTraducao, ProvedorId } from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import { reposCapitulos, reposConfig, reposFrases, reposGlossario, reposObras, reposPrompts, reposTermosSugeridos, reposUso } from '../db/repos.js';
import { obterProvedor } from '../ia/fabrica.js';
import { ErroProvedor } from '../ia/provedor.js';
import { obterChave } from '../credenciais/index.js';
import { montarBloco } from './bloco.js';
import { varrerConsistencia } from './consistencia.js';
import { registrarEvento } from '../telemetria/registrar.js';

// Orquestração da tradução em blocos (doc 05 §2, fases no doc 09).
// O estado durável é frases.status_traducao — este módulo só mantém em memória
// o que é efêmero (job em execução, emissor de eventos SSE, flag de cancelamento).

interface JobAtivo {
  cancelar: boolean;
  progresso: ProgressoTraducao;
}

const jobs = new Map<number, JobAtivo>();
const emissores = new Map<number, EventEmitter>();

const BACKOFF_MS = [2000, 4000, 8000, 16000];
// M1: limite de requisições renova por minuto — esperas de segundos quase
// nunca bastam num 429 e cada tentativa paga conta contra a cota.
const BACKOFF_LIMITE_MS = [30_000, 60_000, 120_000];

// Somente para testes: encurta as esperas do retry sem expor os backoffs na config.
let backoffTeste: { transitorio?: number[]; limite?: number[] } = {};
export function _backoffsParaTeste(transitorio?: number[], limite?: number[]): void {
  backoffTeste = { transitorio, limite };
}

export function emissorDoCapitulo(capituloId: number): EventEmitter {
  let e = emissores.get(capituloId);
  if (!e) {
    e = new EventEmitter();
    e.setMaxListeners(50);
    emissores.set(capituloId, e);
  }
  return e;
}

/** B1: descarta o emissor quando ninguém mais escuta (jobs e SSE encerrados).
 * Com um ouvinte ativo o emissor fica — remover trocaria o objeto que um SSE
 * aberto ainda referencia e os eventos seguintes se perderiam. */
export function liberarEmissor(capituloId: number): void {
  const e = emissores.get(capituloId);
  if (e && e.listenerCount('evento') === 0) emissores.delete(capituloId);
}

function emitir(capituloId: number, evento: EventoTraducao): void {
  emissorDoCapitulo(capituloId).emit('evento', evento);
}

export function progressoAtual(db: BancoDados, capituloId: number): ProgressoTraducao {
  const ativo = jobs.get(capituloId);
  if (ativo) return ativo.progresso;
  const frases = reposFrases.listarPorCapitulo(db, capituloId);
  return {
    capitulo_id: capituloId,
    em_execucao: false,
    frases_total: frases.length,
    frases_prontas: frases.filter((f) => f.status_traducao === 'traduzida').length,
    frases_erro: frases.filter((f) => f.status_traducao === 'erro').length,
    erro_fatal: null,
    em_voo: null,
  };
}

export function jobEmExecucao(capituloId: number): boolean {
  return jobs.has(capituloId);
}

export function cancelarJob(capituloId: number): boolean {
  const job = jobs.get(capituloId);
  if (!job) return false;
  job.cancelar = true;
  return true;
}

export interface OpcoesTraducao {
  provedor?: ProvedorId;
  modelo?: string;
  sobrescrever?: boolean;
  sobrescrever_editadas?: boolean;
}

/** Desfecho classificado do job — consumido pelo orquestrador de lote (doc 09 §5). */
export type ResultadoJob =
  | { tipo: 'concluido' }
  | { tipo: 'parcial'; frases_erro: number }
  | { tipo: 'cancelado' }
  | { tipo: 'fatal'; mensagem: string }
  | { tipo: 'limite'; mensagem: string };

/**
 * Inicia (ou retoma) a tradução do capítulo. Retorna imediatamente; o processamento
 * segue em background e o progresso sai pelo emissor SSE.
 */
export async function iniciarTraducao(
  db: BancoDados,
  capituloId: number,
  opcoes: OpcoesTraducao,
  /** Interno (lote): chamado uma única vez quando o job termina. */
  aoTerminar?: (resultado: ResultadoJob) => void,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (jobs.has(capituloId)) return { ok: false, erro: 'Já existe uma tradução em andamento neste capítulo.' };

  const capitulo = reposCapitulos.obter(db, capituloId);
  if (!capitulo) return { ok: false, erro: 'Capítulo não encontrado.' };
  const obra = reposObras.obter(db, capitulo.obra_id)!;
  const config = reposConfig.obterTodas(db);

  const provedorId = opcoes.provedor ?? obra.provedor_padrao ?? config.provedor_padrao;
  const provedor = obterProvedor(provedorId);
  const modelo = opcoes.modelo ?? obra.modelo_padrao ?? (config.modelo_padrao || provedor.modeloPadrao);

  // Obra sem prompt próprio adota um delta vazio na hora; o texto enviado é a
  // composição núcleo ativo + delta da obra (doc 08 §3).
  const prompt = reposPrompts.composto(db, capitulo.obra_id);
  if (!prompt) {
    return { ok: false, erro: 'A obra não tem prompt mãe ativo e não há prompt padrão ativo. Cadastre um na tela de Prompt mãe.' };
  }

  // C1: reserva o capítulo ANTES do primeiro await. Sem isso, duas requisições
  // próximas (duplo clique, duas abas) passavam ambas pela checagem do topo e
  // o capítulo era traduzido — e pago — duas vezes.
  const job: JobAtivo = {
    cancelar: false,
    progresso: {
      capitulo_id: capituloId,
      em_execucao: true,
      frases_total: 0,
      frases_prontas: 0,
      frases_erro: 0,
      erro_fatal: null,
      em_voo: null,
    },
  };
  jobs.set(capituloId, job);

  try {
    const chave = provedor.precisaChave ? await obterChave(provedorId) : null;
    if (provedor.precisaChave && !chave) {
      jobs.delete(capituloId);
      return { ok: false, erro: `Nenhuma chave de API configurada para ${provedor.nome}. Cadastre em Configurações.` };
    }

    reposFrases.reabrirParaTraducao(db, capituloId, {
      sobrescrever: opcoes.sobrescrever ?? false,
      sobrescreverEditadas: opcoes.sobrescrever_editadas ?? false,
    });

    // Título ainda em chinês (ou retradução completa): traduz junto com o 1º bloco.
    const traduzirTitulo = !!capitulo.titulo && (!capitulo.titulo_pt || (opcoes.sobrescrever ?? false));

    const todas = reposFrases.listarPorCapitulo(db, capituloId);
    const pendentes = todas.filter((f) => f.status_traducao !== 'traduzida');
    if (pendentes.length === 0 && !traduzirTitulo) {
      jobs.delete(capituloId);
      return { ok: false, erro: 'Nenhuma frase pendente de tradução neste capítulo.' };
    }

    // Job só de título (capítulo já concluído) não mexe no status do capítulo.
    if (pendentes.length > 0) {
      reposCapitulos.atualizar(db, capituloId, {
        status: 'traduzindo',
        provedor: provedorId,
        modelo,
        prompt_id: prompt.prompt.id,
        // Proveniência do par de camadas: qual núcleo compôs o prompt deste job.
        nucleo_id: prompt.nucleo?.id ?? null,
      });
    }

    job.progresso.frases_total = todas.length;
    job.progresso.frases_prontas = todas.length - pendentes.length;

    void executarJob(db, capituloId, job, {
      provedorId,
      modelo,
      chave,
      promptMae: prompt.texto,
      config,
      traduzirTitulo,
      aoTerminar,
    });
    return { ok: true };
  } catch (e) {
    jobs.delete(capituloId);
    throw e;
  }
}

async function executarJob(
  db: BancoDados,
  capituloId: number,
  job: JobAtivo,
  ctx: {
    provedorId: ProvedorId;
    modelo: string;
    chave: string | null;
    promptMae: string;
    config: ReturnType<typeof reposConfig.obterTodas>;
    traduzirTitulo: boolean;
    aoTerminar?: (resultado: ResultadoJob) => void;
  },
): Promise<void> {
  const provedor = obterProvedor(ctx.provedorId);
  const capitulo = reposCapitulos.obter(db, capituloId)!;
  let tituloPendente = ctx.traduzirTitulo;
  let desfecho: ResultadoJob | null = null;

  // Termos que a IA adotou nos blocos anteriores deste job (zh → pt). Sem isso,
  // um termo novo do bloco 1 era retraduzido do zero no bloco 5 — mesma palavra,
  // traduções diferentes dentro do capítulo. O glossário do banco tem precedência.
  const termosAdotados = new Map<string, string>();

  // A1: encolhe quando o provedor trunca a resposta — repetir o mesmo bloco
  // pagaria a mesma chamada fadada a falhar.
  let tamanhoBloco = ctx.config.tamanho_bloco;

  try {
    // Blocos são recomputados a cada iteração a partir do banco — assim uma frase
    // marcada como erro num bloco anterior não é reprocessada dentro do mesmo job.
    for (;;) {
      if (job.cancelar) break;

      const todas = reposFrases.listarPorCapitulo(db, capituloId);
      const glossario = reposGlossario.listar(db, capitulo.obra_id);
      if (!todas.some((f) => f.status_traducao === 'pendente') && !tituloPendente) break;

      const { bloco, primeiraOrdem, ultimaOrdem, req } = montarBloco({
        todas,
        glossario,
        termosAdotados,
        titulo: tituloPendente ? (capitulo.titulo ?? undefined) : undefined,
        modelo: ctx.modelo,
        promptMae: ctx.promptMae,
        tamanhoBloco,
        caudaContexto: ctx.config.cauda_contexto,
        glossarioRelevante: ctx.config.glossario_relevante,
      });

      // Anuncia o bloco em voo antes da chamada: a interface mostra "traduzindo
      // frases X–Y" em vez de ficar parada até a resposta do provedor.
      if (bloco.length > 0) {
        job.progresso.em_voo = { de: primeiraOrdem, ate: ultimaOrdem };
        emitir(capituloId, { tipo: 'progresso', dados: { ...job.progresso } });
      }

      const resultado = await traduzirBlocoComRetry(provedor, ctx.chave, req, {
        pararNoLimite: ctx.config.parar_no_limite,
        cancelado: () => job.cancelar,
        // Cada tentativa real conta contra a cota diária do provedor (retries inclusive).
        aoTentar: () => reposUso.registrar(db, ctx.provedorId, ctx.modelo),
      });
      job.progresso.em_voo = null;

      if (resultado.tipo === 'cancelado') break;

      if (resultado.tipo === 'truncado') {
        if (bloco.length === 0) break; // job só de título: uma tentativa, sem laço
        if (bloco.length === 1) {
          // Uma única frase que ainda estoura a saída: erro real, com motivo (D6).
          console.warn(`[traducao] capítulo ${capituloId}, frase ${primeiraOrdem}: ${resultado.mensagem}`);
          reposFrases.marcarErro(db, bloco.map((f) => f.id));
          job.progresso.frases_erro += 1;
          emitir(capituloId, { tipo: 'progresso', dados: { ...job.progresso } });
          continue;
        }
        // A1: divide o bloco ao meio e segue — o tamanho reduzido vale até o
        // fim do job (capítulo de frases longas tende a truncar de novo).
        tamanhoBloco = Math.max(1, Math.floor(bloco.length / 2));
        console.warn(`[traducao] capítulo ${capituloId}: resposta truncada; bloco reduzido para ${tamanhoBloco} frases.`);
        continue;
      }

      if (resultado.tipo === 'fatal') {
        job.progresso.erro_fatal = resultado.mensagem;
        desfecho = { tipo: 'fatal', mensagem: resultado.mensagem };
        emitir(capituloId, { tipo: 'job_erro', dados: { mensagem: resultado.mensagem, tipo: 'fatal' } });
        return;
      }

      if (resultado.tipo === 'limite') {
        // Parada limpa: as frases do bloco continuam pendentes, então
        // "Retomar tradução" recomeça exatamente daqui quando a cota renovar.
        const mensagem = `${resultado.mensagem} Tradução pausada — o que já foi traduzido está salvo; use "Retomar tradução" quando o limite renovar.`;
        job.progresso.erro_fatal = mensagem;
        desfecho = { tipo: 'limite', mensagem: resultado.mensagem };
        emitir(capituloId, { tipo: 'job_erro', dados: { mensagem, tipo: 'limite' } });
        return;
      }

      if (resultado.tipo === 'transitorio-esgotado') {
        // Bloco falhou após todos os retries: marca erro e segue para o resto do capítulo.
        reposFrases.marcarErro(db, bloco.map((f) => f.id));
        job.progresso.frases_erro += bloco.length;
        emitir(capituloId, { tipo: 'progresso', dados: { ...job.progresso } });
        continue;
      }

      // Consumo real da chamada (doc 11 §4), gravado antes de persistir a
      // tradução: o que foi pago fica no livro-caixa mesmo se o resto falhar.
      registrarEvento(db, {
        obra_id: capitulo.obra_id,
        capitulo_id: capituloId,
        papel: 'traducao',
        provedor: ctx.provedorId,
        modelo: ctx.modelo,
        uso: resultado.resposta.uso,
      });

      // Título traduzido vem como ordem -1; se o modelo não devolver, tenta no próximo bloco.
      // Num job só de título (bloco vazio), qualquer tradução retornada só pode
      // ser o título — alguns modelos ignoram a convenção do -1.
      const tituloTraduzido =
        resultado.resposta.traducoes.find((t) => t.ordem === -1)?.texto_pt.trim() ??
        (bloco.length === 0 ? resultado.resposta.traducoes[0]?.texto_pt.trim() : undefined);
      if (tituloPendente && tituloTraduzido) {
        reposCapitulos.atualizar(db, capituloId, { titulo_pt: tituloTraduzido });
        tituloPendente = false;
      }

      if (bloco.length === 0) {
        // Job só de título: uma única tentativa, com ou sem sucesso (evita laço infinito).
        emitir(capituloId, { tipo: 'progresso', dados: { ...job.progresso } });
        break;
      }

      // Sucesso: valida ordens e persiste (doc 05 §2 — faltantes viram erro, excedentes são descartados).
      const porOrdem = new Map(bloco.map((f) => [f.ordem, f]));
      const traduzidasNesteBloco = new Set<number>();
      db.transaction(() => {
        for (const t of resultado.resposta.traducoes) {
          const frase = porOrdem.get(t.ordem);
          if (!frase || !t.texto_pt.trim()) continue;
          reposFrases.aplicarTraducaoIa(db, frase.id, t.texto_pt.trim());
          traduzidasNesteBloco.add(t.ordem);
        }
        const faltantes = bloco.filter((f) => !traduzidasNesteBloco.has(f.ordem));
        if (faltantes.length > 0) {
          // D6: motivo em log — ajuda a diagnosticar truncamento e modelos rebeldes.
          console.warn(
            `[traducao] capítulo ${capituloId}: ${faltantes.length} frase(s) sem tradução na resposta (ordens ${faltantes.map((f) => f.ordem).join(', ')}).`,
          );
          reposFrases.marcarErro(db, faltantes.map((f) => f.id));
        }
      })();

      const faltantes = bloco.length - traduzidasNesteBloco.size;
      job.progresso.frases_prontas += traduzidasNesteBloco.size;
      job.progresso.frases_erro += faltantes;

      // Primeira adoção vence: se o mesmo termo reaparecer com outra tradução,
      // mantém a que os blocos anteriores já usaram.
      for (const t of resultado.resposta.termos_novos) {
        if (t.termo_zh && t.termo_pt && !termosAdotados.has(t.termo_zh)) {
          termosAdotados.set(t.termo_zh, t.termo_pt);
        }
      }

      const novos = reposTermosSugeridos.registrar(db, capitulo.obra_id, capituloId, resultado.resposta.termos_novos);
      if (novos > 0) emitir(capituloId, { tipo: 'termos_sugeridos', dados: { quantidade: novos } });

      emitir(capituloId, { tipo: 'progresso', dados: { ...job.progresso } });
    }
  } catch (e) {
    // C2: sem este catch, qualquer exceção fora do funil de retry virava
    // unhandled rejection e derrubava o processo Node inteiro no meio do job.
    const mensagem = `Erro inesperado durante a tradução: ${String((e as Error).message ?? e)}`;
    console.error(`[traducao] capítulo ${capituloId}:`, e);
    job.progresso.erro_fatal = mensagem;
    desfecho = { tipo: 'fatal', mensagem };
    emitir(capituloId, { tipo: 'job_erro', dados: { mensagem, tipo: 'fatal' } });
  } finally {
    // M6: o capítulo nunca fica preso em 'traduzindo' sem job — completo vira
    // 'traduzido'; incompleto (erro/cancelado/limite) vira 'parcial' se algo
    // foi traduzido, senão volta a 'rascunho'. Job só de título não passa por
    // aqui com status 'traduzindo', então não rebaixa revisado/finalizado.
    if (reposCapitulos.obter(db, capituloId)?.status === 'traduzindo') {
      const finais = reposFrases.listarPorCapitulo(db, capituloId);
      const prontas = finais.filter((f) => f.status_traducao === 'traduzida').length;
      const status =
        finais.length > 0 && prontas === finais.length ? 'traduzido' : prontas > 0 ? 'parcial' : 'rascunho';
      reposCapitulos.atualizar(db, capituloId, { status });

      // D5: varredura local de consistência ao concluir (grátis, sem IA) — o
      // resultado vira badge na lista de capítulos e alimenta a métrica 3 do
      // checkpoint. Nunca derruba o job.
      if (prontas > 0) {
        try {
          const violacoes = varrerConsistencia(finais, reposGlossario.listar(db, capitulo.obra_id)).violacoes.length;
          reposCapitulos.definirConsistencia(db, capituloId, violacoes);
        } catch (e) {
          console.warn(`[traducao] capítulo ${capituloId}: varredura de consistência falhou:`, e);
        }
      }
    }

    job.progresso.em_execucao = false;
    jobs.delete(capituloId);
    if (!desfecho) {
      desfecho = job.cancelar
        ? { tipo: 'cancelado' }
        : job.progresso.frases_erro > 0
          ? { tipo: 'parcial', frases_erro: job.progresso.frases_erro }
          : { tipo: 'concluido' };
    }
    if (!job.progresso.erro_fatal) {
      emitir(capituloId, { tipo: 'job_concluido', dados: { ...progressoAtual(db, capituloId) } });
    }
    liberarEmissor(capituloId);
    ctx.aoTerminar?.(desfecho);
  }
}

export type ResultadoBloco =
  | { tipo: 'ok'; resposta: Awaited<ReturnType<import('../ia/provedor.js').ProvedorIA['traduzirBloco']>> }
  | { tipo: 'transitorio-esgotado'; mensagem: string }
  | { tipo: 'limite'; mensagem: string }
  | { tipo: 'fatal'; mensagem: string }
  | { tipo: 'truncado'; mensagem: string }
  | { tipo: 'cancelado' };

/** Espera em fatias curtas para o cancelamento não ficar preso num backoff longo. */
async function esperar(ms: number, cancelado?: () => boolean): Promise<void> {
  const FATIA = 500;
  for (let restante = ms; restante > 0; restante -= FATIA) {
    if (cancelado?.()) return;
    await new Promise((r) => setTimeout(r, Math.min(FATIA, restante)));
  }
}

export async function traduzirBlocoComRetry(
  provedor: import('../ia/provedor.js').ProvedorIA,
  chave: string | null,
  req: import('../ia/provedor.js').RequisicaoTraducaoBloco,
  opcoes: {
    pararNoLimite: boolean;
    aoTentar?: () => void;
    cancelado?: () => boolean;
    /** Overrides para testes (padrões: BACKOFF_MS / BACKOFF_LIMITE_MS). */
    backoffMs?: number[];
    backoffLimiteMs?: number[];
  },
): Promise<ResultadoBloco> {
  const backoff = opcoes.backoffMs ?? backoffTeste.transitorio ?? BACKOFF_MS;
  const backoffLimite = opcoes.backoffLimiteMs ?? backoffTeste.limite ?? BACKOFF_LIMITE_MS;
  let tentativa = 0;
  let tentativaLimite = 0;
  for (;;) {
    if (opcoes.cancelado?.()) return { tipo: 'cancelado' };
    try {
      opcoes.aoTentar?.();
      const resposta = await provedor.traduzirBloco(chave, req);
      return { tipo: 'ok', resposta };
    } catch (e) {
      const erro = e instanceof ErroProvedor ? e : new ErroProvedor(String((e as Error).message ?? e), 'transitorio');
      if (erro.tipo === 'fatal') return { tipo: 'fatal', mensagem: erro.message };
      if (erro.tipo === 'truncado') return { tipo: 'truncado', mensagem: erro.message };
      if (erro.tipo === 'limite') {
        if (opcoes.pararNoLimite) return { tipo: 'limite', mensagem: erro.message };
        // M1: backoff próprio do 429 (respeitando Retry-After quando vier).
        // Esgotar as esperas longas indica cota diária, não RPM — pausa limpa
        // em vez de marcar as frases como erro.
        if (tentativaLimite >= backoffLimite.length) {
          return { tipo: 'limite', mensagem: `${erro.message} As esperas longas não bastaram — o limite parece ser a cota diária.` };
        }
        await esperar(erro.retryAfterMs ?? backoffLimite[tentativaLimite], opcoes.cancelado);
        tentativaLimite++;
        continue;
      }
      if (tentativa >= backoff.length) return { tipo: 'transitorio-esgotado', mensagem: erro.message };
      await esperar(backoff[tentativa], opcoes.cancelado);
      tentativa++;
    }
  }
}
