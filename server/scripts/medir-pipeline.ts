// Medição de custo do pipeline em fases (doc 09 §12).
//
// Uso:  npx tsx scripts/medir-pipeline.ts [caminho-do-export.json] [numero-do-capitulo]
//
// A pergunta que este script responde (premissa do doc 09 §1): a passada de QA
// custa quanto por capítulo, e o lote compensa em dinheiro? A revisão humana é
// integral nos dois cenários, então tempo humano NÃO entra na conta — só tokens,
// custo de cache e cota gratuita.
//
// Mede três coisas, sem gravar nada e sem chamadas de geração:
//   1. TRADUÇÃO por capítulo (linha de base — o lote não muda o custo por token).
//   2. QA por capítulo (custo NOVO, opt-in) — overhead em % sobre a tradução.
//   3. Projeção da 2ª passagem (análise de referentes, Etapa 5) — 1 chamada barata.
// E quantifica o desperdício que a Etapa 0 elimina (A1/M1) em cenário.
//
// Contagem: usa count_tokens da Anthropic se houver chave; senão estimativa local.

import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_PADRAO, type EntradaGlossario } from '@dao-tale/shared';
import {
  filtrarGlossarioRelevante,
  incluirPrincipais,
  sistemaQa,
  sistemaTraducao,
  usuarioQa,
  usuarioTraducao,
} from '../src/ia/prompts.js';
import { comporPromptMae, extrairCamadas } from '../src/db/promptPadraoInicial.js';
import { obterChave } from '../src/credenciais/index.js';

const caminho = process.argv[2] ?? path.join(process.cwd(), '..', 'dez-dias-ate-o-fim-backup.json');
const numeroCapitulo = process.argv[3] ? Number(process.argv[3]) : undefined;

const dados = JSON.parse(fs.readFileSync(caminho, 'utf-8'));
const promptCompletoLegado: string = dados.prompts.find((p: any) => p.ativo)!.conteudo;
const capitulo = numeroCapitulo
  ? dados.capitulos.find((c: any) => c.numero === numeroCapitulo)
  : dados.capitulos.find((c: any) => c.frases?.some((f: any) => f.texto_pt)) ?? dados.capitulos[0];
if (!capitulo) throw new Error('Capítulo não encontrado no export.');

const glossario: EntradaGlossario[] = dados.glossario.map((g: any, i: number) => ({
  id: i + 1,
  obra_id: 1,
  termo_zh: g.termo_zh,
  termo_pt: g.termo_pt,
  categoria: g.categoria,
  nota: g.nota,
  origem: g.origem,
  principal_id: null,
  criado_em: g.criado_em,
}));

const camadas = extrairCamadas(promptCompletoLegado);
const promptComposto = camadas ? comporPromptMae(camadas.nucleo, camadas.delta) : promptCompletoLegado;

// ── Contagem de tokens ─────────────────────────────────────────────────────

function estimar(texto: string): number {
  let cjk = 0;
  for (const ch of texto) if (/[　-鿿＀-￯]/.test(ch)) cjk++;
  return Math.round(cjk + (texto.length - cjk) / 3.8);
}

let contar: (texto: string) => Promise<number> = async (t) => estimar(t);
let metodo = 'estimativa local (≈1 tok/char CJK + 1/3,8 demais)';

const chave = await obterChave('claude').catch(() => null);
if (chave) {
  metodo = 'count_tokens da Anthropic (exato para o Claude)';
  contar = async (texto: string) => {
    const r = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
      method: 'POST',
      headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-5', messages: [{ role: 'user', content: texto }] }),
    });
    if (!r.ok) throw new Error(`count_tokens ${r.status}: ${await r.text()}`);
    return ((await r.json()) as { input_tokens: number }).input_tokens;
  };
}

// ── Blocos do capítulo ─────────────────────────────────────────────────────

const frases: { ordem: number; texto_zh: string; texto_pt: string }[] = capitulo.frases.map((f: any) => ({
  ordem: f.ordem,
  texto_zh: f.texto_zh,
  texto_pt: f.texto_pt,
}));
const traduzidas = frases.filter((f) => f.texto_pt);
const TAM = CONFIG_PADRAO.tamanho_bloco;
const CAUDA = CONFIG_PADRAO.cauda_contexto;

interface Linha {
  sistema: number;
  usuario: number;
}

// Custo de entrada efetivo numa sequência de N chamadas com sistema estável:
// a 1ª paga escrita de cache (1,25×), as demais leem (0,1×); usuário sempre 1×.
function custoSequencia(linhas: Linha[]): number {
  let total = 0;
  linhas.forEach((l, i) => {
    total += l.sistema * (i === 0 ? 1.25 : 0.1) + l.usuario;
  });
  return Math.round(total);
}

async function medirTraducao(promptMae: string): Promise<Linha[]> {
  const linhas: Linha[] = [];
  for (let i = 0; i < frases.length; i += TAM) {
    const bloco = frases.slice(i, i + TAM);
    const cauda = frases.slice(Math.max(0, i - CAUDA), i).map((f) => ({ texto_zh: f.texto_zh, texto_pt: f.texto_pt }));
    const proximas = frases.slice(i + bloco.length, i + bloco.length + CAUDA).map((f) => f.texto_zh);
    const gloss = incluirPrincipais(
      filtrarGlossarioRelevante(glossario, [...bloco.map((f) => f.texto_zh), ...cauda.map((f) => f.texto_zh), ...proximas]),
      glossario,
    );
    const req = {
      modelo: 'medicao',
      promptMae,
      glossario: gloss,
      glossarioNoUsuario: true,
      caudaAnterior: cauda,
      frases: bloco.map((f) => ({ ordem: f.ordem, texto_zh: f.texto_zh })),
      proximas,
    };
    linhas.push({ sistema: await contar(sistemaTraducao(req)), usuario: await contar(usuarioTraducao(req)) });
  }
  return linhas;
}

async function medirQa(promptMae: string): Promise<Linha[]> {
  const linhas: Linha[] = [];
  for (let i = 0; i < traduzidas.length; i += TAM) {
    const pares = traduzidas.slice(i, i + TAM).map((f) => ({ ordem: f.ordem, texto_zh: f.texto_zh, texto_pt: f.texto_pt }));
    const cauda = traduzidas.slice(Math.max(0, i - CAUDA), i).map((f) => ({ ordem: f.ordem, texto_zh: f.texto_zh, texto_pt: f.texto_pt }));
    const gloss = incluirPrincipais(filtrarGlossarioRelevante(glossario, pares.map((p) => p.texto_zh)), glossario);
    const req = {
      modelo: 'medicao',
      promptMae,
      glossario: gloss,
      glossarioNoUsuario: true,
      caudaAnterior: cauda,
      pares,
    };
    linhas.push({ sistema: await contar(sistemaQa(req)), usuario: await contar(usuarioQa(req)) });
  }
  return linhas;
}

// ── Relatório ──────────────────────────────────────────────────────────────

console.log(`Medição do pipeline — capítulo ${capitulo.numero} (${frases.length} frases, ${traduzidas.length} traduzidas, glossário ${glossario.length} termos)`);
console.log(`Método de contagem: ${metodo}\n`);

const trad = await medirTraducao(promptComposto);
const custoTrad = custoSequencia(trad);
console.log(`TRADUÇÃO: ${trad.length} bloco(s) · custo efetivo do capítulo (cache estável): ${custoTrad} tokens`);
console.log('  (o lote não muda este número — ele muda quando o cache fica quente entre capítulos e ao surfar cota grátis)\n');

const qa = await medirQa(promptComposto);
const custoQa = custoSequencia(qa);
console.log(`QA por 2ª IA (opt-in): ${qa.length} bloco(s) de pares zh+pt · custo efetivo: ${custoQa} tokens`);
console.log(`  overhead sobre a tradução: +${((100 * custoQa) / custoTrad).toFixed(0)}% no capítulo (só quando ligado)\n`);

// Projeção da 2ª passagem (Etapa 5): 1 chamada barata por capítulo — sistema
// (núcleo+delta+instrução curta) + todo o chinês do capítulo uma vez, saída
// minúscula. Aproximação: sistema da tradução (1×) + zh do capítulo (1×).
const zhCapitulo = frases.map((f) => f.texto_zh).join('\n');
const custoDuasPassagens = Math.round(trad[0].sistema * 1.25 + (await contar(zhCapitulo)));
console.log(`2ª PASSAGEM (projeção, Etapa 5): ~${custoDuasPassagens} tokens/capítulo (1 chamada barata de referentes/gênero)`);
console.log(`  overhead projetado: +${((100 * custoDuasPassagens) / custoTrad).toFixed(0)}% — decidir a Etapa 5 com este número\n`);

// Desperdício que a Etapa 0 elimina (cenário, não custo por capítulo):
const blocoMedio = trad.length ? Math.round(trad.reduce((s, l) => s + l.sistema + l.usuario, 0) / trad.length) : 0;
console.log('DESPERDÍCIO EVITADO PELA ETAPA 0 (cenários da auditoria):');
console.log(`  A1 (truncamento): um bloco grande fadado a truncar custava até 5 chamadas pagas de entrada`);
console.log(`     (~${blocoMedio} tok/chamada) antes de falhar sem causa — agora divide o bloco e não repete.`);
console.log(`  M1 (429): retries de 2–16 s quase nunca renovavam a cota e cada um contava contra ela — agora`);
console.log(`     espera 30/60/120 s (ou o Retry-After), poupando as tentativas inúteis.`);
console.log(`\nLeitura: a tradução em lote não fica mais cara por token; o QA é uma compra separada (~+${((100 * custoQa) / custoTrad).toFixed(0)}%),`);
console.log(`ligável por capítulo. O ganho financeiro do lote vem de (a) cache quente entre capítulos emendados e`);
console.log(`(b) surfar as cotas gratuitas via cadeia de failover ordenada por custo — ambos fora da métrica por token.`);
