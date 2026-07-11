import { EventEmitter } from 'node:events';
import type { EventoTraducao, ProgressoTraducao, ProvedorId } from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import { reposCapitulos, reposConfig, reposFrases, reposGlossario, reposObras, reposPrompts, reposTermosSugeridos } from '../db/repos.js';
import { obterProvedor } from '../ia/fabrica.js';
import { ErroProvedor, type RequisicaoTraducaoBloco } from '../ia/provedor.js';
import { obterChave } from '../credenciais/index.js';

// Orquestração da tradução em blocos (doc 05 §2).
// O estado durável é frases.status_traducao — este módulo só mantém em memória
// o que é efêmero (job em execução, emissor de eventos SSE, flag de cancelamento).

interface JobAtivo {
  cancelar: boolean;
  progresso: ProgressoTraducao;
}

const jobs = new Map<number, JobAtivo>();
const emissores = new Map<number, EventEmitter>();

const BACKOFF_MS = [2000, 4000, 8000, 16000];

export function emissorDoCapitulo(capituloId: number): EventEmitter {
  let e = emissores.get(capituloId);
  if (!e) {
    e = new EventEmitter();
    e.setMaxListeners(50);
    emissores.set(capituloId, e);
  }
  return e;
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

/**
 * Inicia (ou retoma) a tradução do capítulo. Retorna imediatamente; o processamento
 * segue em background e o progresso sai pelo emissor SSE.
 */
export async function iniciarTraducao(
  db: BancoDados,
  capituloId: number,
  opcoes: OpcoesTraducao,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (jobs.has(capituloId)) return { ok: false, erro: 'Já existe uma tradução em andamento neste capítulo.' };

  const capitulo = reposCapitulos.obter(db, capituloId);
  if (!capitulo) return { ok: false, erro: 'Capítulo não encontrado.' };
  const obra = reposObras.obter(db, capitulo.obra_id)!;
  const config = reposConfig.obterTodas(db);

  const provedorId = opcoes.provedor ?? obra.provedor_padrao ?? config.provedor_padrao;
  const provedor = obterProvedor(provedorId);
  const modelo = opcoes.modelo ?? obra.modelo_padrao ?? (config.modelo_padrao || provedor.modeloPadrao);

  const promptAtivo = reposPrompts.ativo(db, capitulo.obra_id);
  if (!promptAtivo) {
    return { ok: false, erro: 'A obra não tem prompt mãe ativo. Cadastre um na tela de Prompt mãe.' };
  }

  const chave = provedor.precisaChave ? await obterChave(provedorId) : null;
  if (provedor.precisaChave && !chave) {
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
    return { ok: false, erro: 'Nenhuma frase pendente de tradução neste capítulo.' };
  }

  // Job só de título (capítulo já concluído) não mexe no status do capítulo.
  if (pendentes.length > 0) {
    reposCapitulos.atualizar(db, capituloId, {
      status: 'traduzindo',
      provedor: provedorId,
      modelo,
      prompt_id: promptAtivo.id,
    });
  }

  const job: JobAtivo = {
    cancelar: false,
    progresso: {
      capitulo_id: capituloId,
      em_execucao: true,
      frases_total: todas.length,
      frases_prontas: todas.length - pendentes.length,
      frases_erro: 0,
      erro_fatal: null,
    },
  };
  jobs.set(capituloId, job);

  void executarJob(db, capituloId, job, { provedorId, modelo, chave, promptMae: promptAtivo.conteudo, config, traduzirTitulo });
  return { ok: true };
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
  },
): Promise<void> {
  const provedor = obterProvedor(ctx.provedorId);
  const capitulo = reposCapitulos.obter(db, capituloId)!;
  let tituloPendente = ctx.traduzirTitulo;

  try {
    // Blocos são recomputados a cada iteração a partir do banco — assim uma frase
    // marcada como erro num bloco anterior não é reprocessada dentro do mesmo job.
    for (;;) {
      if (job.cancelar) break;

      const todas = reposFrases.listarPorCapitulo(db, capituloId);
      const glossario = reposGlossario.listar(db, capitulo.obra_id);
      const pendentes = todas.filter((f) => f.status_traducao === 'pendente');
      if (pendentes.length === 0 && !tituloPendente) break;

      // Bloco pode ser vazio quando só o título falta (capítulo já traduzido):
      // as ordens-sentinela deixam a cauda com o fim do capítulo e zero "próximas".
      const bloco = pendentes.slice(0, ctx.config.tamanho_bloco);
      const primeiraOrdem = bloco[0]?.ordem ?? todas.length;
      const ultimaOrdem = bloco[bloco.length - 1]?.ordem ?? todas.length;

      // Cauda: últimas N frases traduzidas imediatamente antes do bloco.
      const caudaAnterior = todas
        .filter((f) => f.ordem < primeiraOrdem && f.status_traducao === 'traduzida')
        .slice(-ctx.config.cauda_contexto)
        .map((f) => ({ texto_zh: f.texto_zh, texto_pt: f.texto_pt }));

      // Contexto futuro: próximas N frases em chinês após o bloco.
      const proximas = todas
        .filter((f) => f.ordem > ultimaOrdem)
        .slice(0, ctx.config.cauda_contexto)
        .map((f) => f.texto_zh);

      const req: RequisicaoTraducaoBloco = {
        modelo: ctx.modelo,
        promptMae: ctx.promptMae,
        glossario,
        titulo: tituloPendente ? (capitulo.titulo ?? undefined) : undefined,
        caudaAnterior,
        frases: bloco.map((f) => ({ ordem: f.ordem, texto_zh: f.texto_zh })),
        proximas,
      };

      const resultado = await traduzirBlocoComRetry(provedor, ctx.chave, req, {
        pararNoLimite: ctx.config.parar_no_limite,
      });

      if (resultado.tipo === 'fatal') {
        job.progresso.erro_fatal = resultado.mensagem;
        emitir(capituloId, { tipo: 'job_erro', dados: { mensagem: resultado.mensagem } });
        return;
      }

      if (resultado.tipo === 'limite') {
        // Parada limpa: as frases do bloco continuam pendentes, então
        // "Retomar tradução" recomeça exatamente daqui quando a cota renovar.
        const mensagem = `${resultado.mensagem} Tradução pausada para não passar da cota gratuita — use "Retomar tradução" quando o limite renovar.`;
        job.progresso.erro_fatal = mensagem;
        emitir(capituloId, { tipo: 'job_erro', dados: { mensagem } });
        return;
      }

      if (resultado.tipo === 'transitorio-esgotado') {
        // Bloco falhou após todos os retries: marca erro e segue para o resto do capítulo.
        reposFrases.marcarErro(db, bloco.map((f) => f.id));
        job.progresso.frases_erro += bloco.length;
        emitir(capituloId, { tipo: 'progresso', dados: { ...job.progresso } });
        continue;
      }

      // Título traduzido vem como ordem -1; se o modelo não devolver, tenta no próximo bloco.
      const tituloTraduzido = resultado.resposta.traducoes.find((t) => t.ordem === -1)?.texto_pt.trim();
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
        if (faltantes.length > 0) reposFrases.marcarErro(db, faltantes.map((f) => f.id));
      })();

      const faltantes = bloco.length - traduzidasNesteBloco.size;
      job.progresso.frases_prontas += traduzidasNesteBloco.size;
      job.progresso.frases_erro += faltantes;

      const novos = reposTermosSugeridos.registrar(db, capitulo.obra_id, capituloId, resultado.resposta.termos_novos);
      if (novos > 0) emitir(capituloId, { tipo: 'termos_sugeridos', dados: { quantidade: novos } });

      emitir(capituloId, { tipo: 'progresso', dados: { ...job.progresso } });
    }

    // Capítulo completo (nada pendente/erro e não cancelado): sai de "traduzindo".
    // Só promove a partir de 'traduzindo' — não rebaixa revisado/finalizado
    // (ex.: job só de título num capítulo já concluído).
    if (!job.cancelar && reposCapitulos.obter(db, capituloId)?.status === 'traduzindo') {
      const finais = reposFrases.listarPorCapitulo(db, capituloId);
      if (finais.length > 0 && finais.every((f) => f.status_traducao === 'traduzida')) {
        reposCapitulos.atualizar(db, capituloId, { status: 'traduzido' });
      }
    }
  } finally {
    job.progresso.em_execucao = false;
    jobs.delete(capituloId);
    if (!job.progresso.erro_fatal) {
      emitir(capituloId, { tipo: 'job_concluido', dados: { ...progressoAtual(db, capituloId) } });
    }
  }
}

type ResultadoBloco =
  | { tipo: 'ok'; resposta: Awaited<ReturnType<import('../ia/provedor.js').ProvedorIA['traduzirBloco']>> }
  | { tipo: 'transitorio-esgotado'; mensagem: string }
  | { tipo: 'limite'; mensagem: string }
  | { tipo: 'fatal'; mensagem: string };

async function traduzirBlocoComRetry(
  provedor: import('../ia/provedor.js').ProvedorIA,
  chave: string | null,
  req: RequisicaoTraducaoBloco,
  opcoes: { pararNoLimite: boolean },
): Promise<ResultadoBloco> {
  let ultimoErro = '';
  for (let tentativa = 0; tentativa <= BACKOFF_MS.length; tentativa++) {
    try {
      const resposta = await provedor.traduzirBloco(chave, req);
      return { tipo: 'ok', resposta };
    } catch (e) {
      const erro = e instanceof ErroProvedor ? e : new ErroProvedor(String((e as Error).message ?? e), 'transitorio');
      if (erro.tipo === 'fatal') return { tipo: 'fatal', mensagem: erro.message };
      if (erro.tipo === 'limite' && opcoes.pararNoLimite) return { tipo: 'limite', mensagem: erro.message };
      ultimoErro = erro.message;
      if (tentativa < BACKOFF_MS.length) {
        await new Promise((r) => setTimeout(r, BACKOFF_MS[tentativa]));
      }
    }
  }
  return { tipo: 'transitorio-esgotado', mensagem: ultimoErro };
}
