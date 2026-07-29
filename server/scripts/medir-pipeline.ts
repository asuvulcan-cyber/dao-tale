// Medição de custo do pipeline em fases (doc 09 §12).
//
// Uso:  npx tsx scripts/medir-pipeline.ts [caminho-do-export.json] [numero-do-capitulo] [--real]
//
// `--real` acrescenta a CONFERÊNCIA contra o que foi medido de verdade
// (eventos_ia, doc 11): as projeções abaixo passam a ser conferíveis em vez de
// aceitas por fé. Abre o banco somente para leitura.
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
import { abrirSomenteLeitura, acertoDeCache, formatarUsd, medidoPorPapel } from './medido.js';

const modoReal = process.argv.includes('--real');
const argumentos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const caminho = argumentos[0] ?? path.join(process.cwd(), '..', 'dez-dias-ate-o-fim-backup.json');
const numeroCapitulo = argumentos[1] ? Number(argumentos[1]) : undefined;

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

// ── Conferência contra o medido (doc 11 §6) ────────────────────────────────
// Tudo acima é ESTIMATIVA (proxy local ou count_tokens sobre o texto montado).
// Daqui para baixo é MEDIDO: o que os provedores reportaram e foi gravado.

if (modoReal) {
  const db = abrirSomenteLeitura();
  if (db) {
    const linhas = medidoPorPapel(db, capitulo.numero);
    console.log(`\n${'='.repeat(72)}`);
    console.log(`CONFERÊNCIA CONTRA O MEDIDO — capítulo ${capitulo.numero} (eventos_ia, somente leitura)`);
    if (linhas.length === 0) {
      console.log('  Nenhuma chamada registrada para este capítulo ainda.');
    } else {
      for (const l of linhas) {
        const entradaTotal = l.tokens_entrada + l.tokens_cache_leitura + l.tokens_cache_criacao;
        const acerto = acertoDeCache(l);
        console.log(
          `  ${l.papel.padEnd(12)} ${String(l.chamadas).padStart(3)} chamada(s) · entrada ${entradaTotal} tok ` +
            `(cache lido ${l.tokens_cache_leitura}${acerto !== null ? `, ${acerto.toFixed(0)}% de acerto` : ''}) · ` +
            `saída ${l.tokens_saida} tok · ${formatarUsd(l.custo_usd, l.chamadas_sem_preco)}`,
        );
      }

      const medTrad = linhas.find((l) => l.papel === 'traducao');
      const medQa = linhas.find((l) => l.papel === 'qa');
      if (medTrad) {
        const entradaMedida = medTrad.tokens_entrada + medTrad.tokens_cache_leitura + medTrad.tokens_cache_criacao;
        const desvio = (100 * (entradaMedida - custoTrad)) / custoTrad;
        console.log(
          `\n  Tradução: estimado ${custoTrad} tok (ponderado por cache) vs. medido ${entradaMedida} tok de entrada ` +
            `→ ${desvio >= 0 ? '+' : ''}${desvio.toFixed(0)}% de desvio da estimativa.`,
        );
      }
      if (medTrad && medQa) {
        const entradaTrad = medTrad.tokens_entrada + medTrad.tokens_cache_leitura + medTrad.tokens_cache_criacao;
        const entradaQa = medQa.tokens_entrada + medQa.tokens_cache_leitura + medQa.tokens_cache_criacao;
        const overheadMedido = (100 * entradaQa) / entradaTrad;
        console.log(
          `  QA: overhead projetado +${((100 * custoQa) / custoTrad).toFixed(0)}% (doc 09 §15) vs. MEDIDO ` +
            `+${overheadMedido.toFixed(0)}% sobre a tradução deste capítulo.`,
        );
      } else if (!medQa) {
        console.log('\n  QA nunca rodou neste capítulo — o +140% do doc 09 §15 segue sendo projeção.');
      }
      console.log(
        '  2ª passagem: segue PROJEÇÃO — a Etapa 5 não existe, não há nada medido para conferir.',
      );
    }
    db.close();
  }
} else {
  console.log('\n(rode com --real para conferir estes números contra o que foi medido de verdade — doc 11 §6)');
}
