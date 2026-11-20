import type { ProvedorId } from '@dao-tale/shared';
import type { ProvedorIA } from './provedor.js';
import { provedorClaude } from './claude.js';
import { provedorClaudeCode } from './claudeCode.js';
import { provedorGemini } from './gemini.js';
import { provedorMock } from './mock.js';
import { criarProvedorCompat } from './compat.js';

// Modelos que não servem para tradução literária: sem geração de texto de
// conversa (áudio, imagem, embeddings, moderação…) ou especializados em código.
const NAO_TEXTO =
  /whisper|tts|audio|image|imagen|embed|moderation|guard|safety|ocr|transcri|voxtral|compound|rerank|vl\b|coder|codestral|[-_/]code\b|allam|orpheus|canopylabs|omni|poolside|laguna/i;

// Pequenos/nicho demais para o contrato JSON + tradução literária (falharam nos
// testes reais: nemotron-nano, lfm 1.2b, llama 3b…). Lookbehind protege "gemini"
// de casar com "mini"; "minimax" idem via lookahead. Tamanhos de 1 dígito (-1b a
// -9b) caem; -20b/-26b/-80b/-405b passam.
const PEQUENO_DEMAIS = /nano|tiny|dolphin|(?<![a-z])mini(?!max)|-[1-9](\.\d)?b\b/i;

// Adicionar um provedor novo = criar o arquivo (ou usar criarProvedorCompat) e registrar aqui.
const provedores: Record<string, ProvedorIA> = {
  'claude-code': provedorClaudeCode,
  claude: provedorClaude,
  gemini: provedorGemini,
  deepseek: criarProvedorCompat({
    id: 'deepseek',
    nome: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    modeloPadrao: 'deepseek-v4-flash',
  }),
  openrouter: criarProvedorCompat({
    id: 'openrouter',
    nome: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    modeloPadrao: 'qwen/qwen3-next-80b-a3b-instruct:free',
    cabecalhos: { 'HTTP-Referer': 'http://localhost', 'X-Title': 'Dao Tale' },
    // Modelos de raciocínio (gpt-oss etc.) esgotam tetos baixos antes da resposta final.
    maxTokens: 16384,
    // Catálogo com centenas de entradas → curadoria dura (testes reais de jul/2026):
    // gratuitos de texto com tamanho decente, apelidos ~vendor/…-latest e as famílias
    // pagas fortes em chinês. Qualquer outro id continua utilizável digitando no campo.
    filtrarModelo: (id) => {
      if (NAO_TEXTO.test(id)) return false;
      if (id.startsWith('~')) return true; // apelidos sempre-atuais (claude, gemini, kimi…)
      if (id.endsWith(':free')) return !PEQUENO_DEMAIS.test(id);
      // Pagos: só o topo atual de cada família forte em chinês (sem variantes de
      // visão "…v", thinking ou gerações superadas).
      return /^(deepseek\/deepseek-v4-(flash|pro)$|qwen\/qwen3(\.\d+)?-max(-preview)?$|z-ai\/glm-(4\.[7-9]|[5-9])(\.\d+)?(-turbo|-flash|-air)?$|moonshotai\/kimi-k(2\.[5-9]|[3-9])(\.\d+)?$|minimax\/minimax-m(2\.[5-9]|[3-9])(\.\d+)?$)/.test(id);
    },
  }),
  groq: criarProvedorCompat({
    id: 'groq',
    nome: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    modeloPadrao: 'llama-3.3-70b-versatile',
    filtrarModelo: (id) => !NAO_TEXTO.test(id) && !PEQUENO_DEMAIS.test(id),
  }),
  mistral: criarProvedorCompat({
    id: 'mistral',
    nome: 'Mistral (La Plateforme)',
    baseUrl: 'https://api.mistral.ai/v1',
    modeloPadrao: 'mistral-small-latest',
    // O catálogo repete cada família em dezenas de versões datadas e inclui
    // variantes de código (devstral, vibe-cli), raciocínio (magistral) e edge
    // (ministral): para tradução, só os apelidos -latest das famílias de texto.
    filtrarModelo: (id) =>
      /-latest$/.test(id) &&
      !NAO_TEXTO.test(id) &&
      !/devstral|magistral|ministral|leanstral|vibe|tiny|nemo/.test(id),
  }),
  mock: provedorMock,
};

export function obterProvedor(id: ProvedorId): ProvedorIA {
  const p = provedores[id];
  if (!p) throw new Error(`Provedor de IA desconhecido ou ainda não suportado: ${id}`);
  return p;
}

export function listarProvedores(): ProvedorIA[] {
  return Object.values(provedores);
}
