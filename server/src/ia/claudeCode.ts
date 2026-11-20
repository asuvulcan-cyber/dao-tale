import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import type { ModeloInfo, ModoThinking } from '@dao-tale/shared';
import { executavelClaudeCode, pastaContaClaudeCode } from '../config.js';
import { ErroProvedor, type ProvedorIA, type UsoChamada } from './provedor.js';
import {
  juntarPartes,
  sistemaAdjudicacaoLiterariaPartes,
  sistemaContracapaPartes,
  sistemaExtrairTermosPartes,
  sistemaPasseEstiloPartes,
  sistemaQaPartes,
  sistemaRefinarPromptPartes,
  sistemaRevisaoLiterariaPartes,
  sistemaRevisaoPartes,
  sistemaTraducaoPartes,
  usuarioAdjudicacaoLiteraria,
  usuarioContracapa,
  usuarioExtrairTermos,
  usuarioPasseEstilo,
  usuarioQa,
  usuarioRefinarPrompt,
  usuarioRevisao,
  usuarioRevisaoLiteraria,
  usuarioTraducao,
  type PartesSistema,
} from './prompts.js';
import {
  CONTRATO_ADJUDICACAO_LITERARIA,
  CONTRATO_CONTRACAPA,
  CONTRATO_EXTRAIR_TERMOS,
  CONTRATO_PASSE_ESTILO,
  CONTRATO_QA,
  CONTRATO_REFINAR_PROMPT,
  CONTRATO_REVISAO,
  CONTRATO_REVISAO_LITERARIA,
  CONTRATO_TRADUCAO,
  type Contrato,
} from './contratos.js';
import { usoDoClaude } from './uso.js';

// Motor pela assinatura (decisão de 18/11/2026): em vez da API com chave, o app
// roda o Claude Code em modo não interativo (`claude -p`), um processo por
// chamada. Os prompts e os contratos são os MESMOS do provedor `claude` — o
// prompt de sistema do app entra NO LUGAR do do Claude Code, e o JSON Schema
// que lá alimenta o tool use aqui vai em `--json-schema`, que devolve a resposta
// já validada em `structured_output`.
//
// O que fica de fora, por limitação do CLI: temperatura (a amostragem fica no
// padrão do modelo, o mesmo que `temperatura: undefined` no resto do app) e o
// teto de saída por tarefa. O cache de prompt o próprio Claude Code aplica.

/** Uma tradução de bloco no Opus passa de um minuto; dez é folga, não meta. */
const TEMPO_LIMITE_MS = 10 * 60_000;

const MODELOS: ModeloInfo[] = [
  { id: 'opus', nome: 'Claude Opus (mais recente)' },
  { id: 'sonnet', nome: 'Claude Sonnet (mais recente)' },
  { id: 'haiku', nome: 'Claude Haiku (mais recente)' },
];

/** O que interessa da saída `--output-format json` do `claude -p`. */
export interface SaidaClaudeCode {
  is_error?: boolean;
  subtype?: string;
  api_error_status?: number | null;
  stop_reason?: string | null;
  result?: string;
  structured_output?: unknown;
  usage?: unknown;
  modelUsage?: Record<string, { inputTokens?: number; outputTokens?: number }>;
}

/** Argumentos do CLI. Sem ferramentas, sem MCP, sem skills e sem configurações
 *  de projeto: o processo é só um modelo respondendo ao contrato. */
export function argumentosClaudeCode(opcoes: {
  modelo: string;
  arquivoSistema: string;
  contrato: Contrato;
  thinking?: ModoThinking;
}): string[] {
  const args = [
    '-p',
    '--model',
    opcoes.modelo,
    '--system-prompt-file',
    opcoes.arquivoSistema,
    '--json-schema',
    JSON.stringify(opcoes.contrato.schema),
    '--output-format',
    'json',
    '--tools',
    '',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--setting-sources',
    '',
    '--no-session-persistence',
  ];
  // O CLI não tem liga/desliga de raciocínio, tem esforço: o mais próximo de
  // "desligado" é o esforço baixo. `undefined` = não mandar = padrão do modelo.
  if (opcoes.thinking === 'ligado') args.push('--effort', 'high');
  if (opcoes.thinking === 'desligado') args.push('--effort', 'low');
  return args;
}

/** Ambiente do processo filho. Sem `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`,
 *  porque com elas o Claude Code cobraria a API em vez de usar a assinatura —
 *  justamente o que este provedor existe para evitar. */
export function ambienteClaudeCode(base: NodeJS.ProcessEnv, pastaConta: string | null): NodeJS.ProcessEnv {
  const env = { ...base };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  // Variáveis de uma sessão do Claude Code que tenha subido o servidor.
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  if (pastaConta) env.CLAUDE_CONFIG_DIR = pastaConta;
  return env;
}

/** Saída do CLI → resposta bruta do contrato, ou erro já classificado. */
export function interpretarSaida(texto: string): { bruto: unknown; uso: UsoChamada } {
  let saida: SaidaClaudeCode;
  try {
    saida = JSON.parse(texto) as SaidaClaudeCode;
  } catch {
    throw new ErroProvedor(
      `O Claude Code respondeu fora do formato JSON: ${texto.trim().slice(0, 300)}`,
      'transitorio',
    );
  }

  if (saida.is_error) {
    const status = saida.api_error_status ?? 0;
    const detalhe = (saida.result ?? saida.subtype ?? '').trim().slice(0, 300);
    if (status === 401 || status === 403) {
      throw new ErroProvedor(
        `O Claude Code não está logado na conta do motor (${pastaContaClaudeCode() ?? 'conta padrão'}). Rode \`claude2\` e faça login.`,
        'fatal',
      );
    }
    if (status === 429) {
      throw new ErroProvedor(`Limite de uso da assinatura atingido no Claude Code. ${detalhe}`, 'limite');
    }
    if (status === 400) {
      throw new ErroProvedor(`Requisição rejeitada pelo Claude Code: ${detalhe}`, 'fatal');
    }
    throw new ErroProvedor(`Erro do Claude Code (${saida.subtype ?? status}): ${detalhe}`, 'transitorio');
  }
  if (saida.stop_reason === 'max_tokens') {
    throw new ErroProvedor('O Claude Code truncou a resposta no limite de tokens de saída.', 'truncado');
  }
  if (saida.structured_output === undefined || saida.structured_output === null) {
    throw new ErroProvedor('O modelo não devolveu a resposta estruturada esperada.', 'transitorio');
  }

  // Modelo que de fato respondeu. O Claude Code faz chamadas internas num
  // modelo menor que às vezes escrevem MAIS que a tarefa (medido: Haiku 343
  // tokens de saída contra 196 do Sonnet que traduziu) — então "o que mais
  // escreveu" erra. O `usage` do topo é só o da conversa principal: o modelo
  // que atendeu é o da linha de `modelUsage` que bate com ele.
  const uso = usoDoClaude(saida.usage);
  const principal =
    Object.entries(saida.modelUsage ?? {}).find(
      ([, m]) => m.inputTokens === uso.tokens_entrada && m.outputTokens === uso.tokens_saida,
    )?.[0] ?? null;
  return { bruto: saida.structured_output, uso: { ...uso, modelo_resolvido: principal } };
}

function executar(args: string[], entrada: string, cwd: string): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const filho = spawn(executavelClaudeCode(), args, {
      cwd,
      env: ambienteClaudeCode(process.env, pastaContaClaudeCode()),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let saida = '';
    let erro = '';
    const relogio = setTimeout(() => {
      filho.kill('SIGTERM');
      rejeitar(new ErroProvedor('O Claude Code não respondeu dentro de 10 minutos.', 'transitorio'));
    }, TEMPO_LIMITE_MS);

    filho.stdout.on('data', (pedaco) => (saida += pedaco));
    filho.stderr.on('data', (pedaco) => (erro += pedaco));
    filho.stdin.on('error', () => {
      /* o processo saiu antes de ler a entrada — o motivo chega em 'close' */
    });
    filho.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(relogio);
      rejeitar(
        e.code === 'ENOENT'
          ? new ErroProvedor(
              'Claude Code não encontrado. Instale-o ou aponte DAO_TALE_CLAUDE_BIN para o executável.',
              'fatal',
            )
          : new ErroProvedor(`Falha ao iniciar o Claude Code: ${e.message}`, 'transitorio'),
      );
    });
    filho.on('close', (codigo) => {
      clearTimeout(relogio);
      // Com erro de API o CLI sai com código ≠ 0 mas ainda imprime o JSON — é
      // ele que diz o que houve, então só a saída VAZIA é falha de processo.
      if (!saida.trim()) {
        rejeitar(
          new ErroProvedor(
            `O Claude Code saiu sem resposta (código ${codigo}): ${erro.trim().slice(0, 300)}`,
            'transitorio',
          ),
        );
      } else {
        resolver(saida);
      }
    });
    filho.stdin.end(entrada);
  });
}

/** Uma chamada completa. Roda numa pasta temporária vazia para o Claude Code
 *  não descobrir CLAUDE.md nem memória de projeto nenhum. */
async function chamar<T extends z.ZodTypeAny>(
  contrato: Contrato<T>,
  partes: PartesSistema,
  usuario: string,
  req: { modelo: string; thinking?: ModoThinking },
  tarefa: string,
): Promise<{ dados: z.infer<T>; bruta: string; uso: UsoChamada }> {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'dao-tale-cc-'));
  try {
    const arquivoSistema = path.join(pasta, 'sistema.txt');
    fs.writeFileSync(arquivoSistema, juntarPartes(partes));
    const args = argumentosClaudeCode({ modelo: req.modelo, arquivoSistema, contrato, thinking: req.thinking });
    const { bruto, uso } = interpretarSaida(await executar(args, usuario, pasta));
    try {
      return { dados: contrato.zod.parse(bruto), bruta: JSON.stringify(bruto), uso };
    } catch (e) {
      if (e instanceof z.ZodError) {
        throw new ErroProvedor(`Resposta do modelo fora do contrato de ${tarefa}.`, 'transitorio');
      }
      throw e;
    }
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}

export const provedorClaudeCode: ProvedorIA = {
  id: 'claude-code',
  nome: 'Claude Code (assinatura)',
  precisaChave: false,
  // A conta do motor é Pro: o Sonnet rende mais no limite de uso que o Opus.
  modeloPadrao: 'sonnet',

  async listarModelos(): Promise<ModeloInfo[]> {
    return MODELOS;
  },

  async testarCredencial() {
    try {
      const texto = await executar(['auth', 'status'], '', os.tmpdir());
      const estado = JSON.parse(texto) as { loggedIn?: boolean; authMethod?: string; subscriptionType?: string };
      if (!estado.loggedIn) {
        return { ok: false, mensagem: 'O Claude Code não está logado na conta do motor. Rode `claude2` e faça login.' };
      }
      if (estado.authMethod !== 'claude.ai') {
        return { ok: false, mensagem: `O Claude Code está logado por ${estado.authMethod}, não pela assinatura.` };
      }
      return {
        ok: true,
        mensagem: `Claude Code logado pela assinatura (${estado.subscriptionType ?? 'plano desconhecido'}).`,
      };
    } catch (e) {
      return { ok: false, mensagem: (e as Error).message };
    }
  },

  async traduzirBloco(_chave, req) {
    const r = await chamar(CONTRATO_TRADUCAO, sistemaTraducaoPartes(req), usuarioTraducao(req), req, 'tradução');
    return { ...r.dados, bruta: r.bruta, uso: r.uso };
  },

  async traduzirContracapa(_chave, req) {
    const r = await chamar(
      CONTRATO_CONTRACAPA,
      sistemaContracapaPartes(req),
      usuarioContracapa(req),
      req,
      'contracapa',
    );
    return { ...r.dados, bruta: r.bruta, uso: r.uso };
  },

  async revisarFrase(_chave, req) {
    const r = await chamar(
      CONTRATO_REVISAO,
      sistemaRevisaoPartes(req),
      usuarioRevisao(req),
      req,
      'Protocolo de Revisão',
    );
    return { ...r.dados, bruta: r.bruta, uso: r.uso };
  },

  async extrairTermos(_chave, req) {
    const r = await chamar(
      CONTRATO_EXTRAIR_TERMOS,
      sistemaExtrairTermosPartes(req),
      usuarioExtrairTermos(req),
      req,
      'extração de termos',
    );
    return { ...r.dados, bruta: r.bruta, uso: r.uso };
  },

  async refinarPrompt(_chave, req) {
    const r = await chamar(
      CONTRATO_REFINAR_PROMPT,
      sistemaRefinarPromptPartes(req),
      usuarioRefinarPrompt(req),
      req,
      'refinamento do prompt',
    );
    return { ...r.dados, bruta: r.bruta, uso: r.uso };
  },

  async analisarQa(_chave, req) {
    const r = await chamar(CONTRATO_QA, sistemaQaPartes(req), usuarioQa(req), req, 'QA');
    return { ...r.dados, bruta: r.bruta, uso: r.uso };
  },

  async passeEstilo(_chave, req) {
    const r = await chamar(
      CONTRATO_PASSE_ESTILO,
      sistemaPasseEstiloPartes(req),
      usuarioPasseEstilo(req),
      req,
      'passe de estilo',
    );
    return { ...r.dados, bruta: r.bruta, uso: r.uso };
  },

  async revisarLiterariamente(_chave, req) {
    const r = await chamar(
      CONTRATO_REVISAO_LITERARIA,
      sistemaRevisaoLiterariaPartes(req),
      usuarioRevisaoLiteraria(req),
      req,
      'revisão literária',
    );
    return { ...r.dados, bruta: r.bruta, uso: r.uso };
  },

  async adjudicarRevisaoLiteraria(_chave, req) {
    const r = await chamar(
      CONTRATO_ADJUDICACAO_LITERARIA,
      sistemaAdjudicacaoLiterariaPartes(req),
      usuarioAdjudicacaoLiteraria(req),
      req,
      'adjudicação literária',
    );
    return { ...r.dados, bruta: r.bruta, uso: r.uso };
  },
};
