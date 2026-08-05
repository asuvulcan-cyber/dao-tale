// Medição de tokens antes/depois do prompt em camadas (doc 08 §8).
//
// Uso:  npx tsx scripts/medir-prompt.ts [caminho-do-export.json] [numero-do-capitulo] [--real]
//
// `--real` acrescenta a conferência contra o medido (eventos_ia, doc 11 §6): as
// reduções abaixo dependiam do cache passar a acertar na revisão e na extração —
// e isso agora é verificável em vez de presumido.
//
// Lê um export dao-tale (obra real), remonta os blocos como o job faria e compara:
//   ANTES  = arquitetura anterior (revisão/extração com glossário no sistema, sem cache)
//   DEPOIS = camadas (núcleo+delta compostos; glossário filtrado na mensagem do usuário;
//            sistema estável e cacheável em todas as tarefas)
// Nada é gravado; nenhuma chamada de geração é feita.
//
// Contagem: se houver chave da Anthropic no cofre do app, usa /v1/messages/count_tokens
// (exata, gratuita); senão, estimativa local (≈1 token/caractere CJK + 1/3,8 nos demais)
// — serve como proxy relativo, que é o que a comparação precisa.

import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_PADRAO, type EntradaGlossario } from '@dao-tale/shared';
import {
  filtrarGlossarioRelevante,
  sistemaExtrairTermos,
  sistemaRevisao,
  sistemaTraducao,
  usuarioExtrairTermos,
  usuarioRevisao,
  usuarioTraducao,
} from '../src/ia/prompts.js';
import { comporPromptMae, extrairCamadas } from '../src/db/promptPadraoInicial.js';
import { obterChave } from '../src/credenciais/index.js';
import { abrirSomenteLeitura, acertoDeCache, formatarUsd, medidoPorPapel } from './medido.js';

const modoReal = process.argv.includes('--real');
const argumentos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const caminho = argumentos[0] ?? path.join(process.cwd(), '..', 'a-torre-de-bronze-backup.json');
const numeroCapitulo = argumentos[1] ? Number(argumentos[1]) : undefined;

const dados = JSON.parse(fs.readFileSync(caminho, 'utf-8'));
const promptCompletoLegado: string = dados.prompts.find((p: any) => p.ativo)!.conteudo;
const capitulo = numeroCapitulo
  ? dados.capitulos.find((c: any) => c.numero === numeroCapitulo)
  : dados.capitulos[0];
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

// Camadas do prompt real: Seção 6 vira delta; o resto faz papel de núcleo.
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

// ── Remonta os blocos do capítulo como o job faz ───────────────────────────

const frases: { ordem: number; texto_zh: string; texto_pt: string }[] = capitulo.frases.map(
  (f: any) => ({ ordem: f.ordem, texto_zh: f.texto_zh, texto_pt: f.texto_pt }),
);
const TAM = CONFIG_PADRAO.tamanho_bloco;
const CAUDA = CONFIG_PADRAO.cauda_contexto;
const blocos: (typeof frases)[] = [];
for (let i = 0; i < frases.length; i += TAM) blocos.push(frases.slice(i, i + TAM));

interface Linha {
  rotulo: string;
  sistema: number;
  usuario: number;
}

async function medirTraducao(promptMae: string): Promise<Linha[]> {
  const linhas: Linha[] = [];
  for (let b = 0; b < blocos.length; b++) {
    const bloco = blocos[b];
    const inicio = b * TAM;
    const cauda = frases.slice(Math.max(0, inicio - CAUDA), inicio).map((f) => ({ texto_zh: f.texto_zh, texto_pt: f.texto_pt }));
    const proximas = frases.slice(inicio + bloco.length, inicio + bloco.length + CAUDA).map((f) => f.texto_zh);
    const gloss = filtrarGlossarioRelevante(glossario, [
      ...bloco.map((f) => f.texto_zh),
      ...cauda.map((f) => f.texto_zh),
      ...proximas,
    ]);
    const req = {
      modelo: 'medicao',
      promptMae,
      glossario: gloss,
      glossarioNoUsuario: true,
      caudaAnterior: cauda,
      frases: bloco.map((f) => ({ ordem: f.ordem, texto_zh: f.texto_zh })),
      proximas,
    };
    linhas.push({
      rotulo: `bloco ${b + 1} (${bloco.length} frases, ${gloss.length} termos)`,
      sistema: await contar(sistemaTraducao(req)),
      usuario: await contar(usuarioTraducao(req)),
    });
  }
  return linhas;
}

const N_AMOSTRA = 10;
const amostra = frases.filter((f) => f.texto_pt).slice(0, N_AMOSTRA);

async function medirRevisao(depois: boolean): Promise<Linha[]> {
  const linhas: Linha[] = [];
  for (const f of amostra) {
    const idx = frases.findIndex((x) => x.ordem === f.ordem);
    const antes = frases.slice(Math.max(0, idx - 3), idx).map((x) => ({ texto_zh: x.texto_zh, texto_pt: x.texto_pt }));
    const depois3 = frases.slice(idx + 1, idx + 4).map((x) => ({ texto_zh: x.texto_zh, texto_pt: x.texto_pt }));
    const gloss = filtrarGlossarioRelevante(glossario, [f.texto_zh, ...antes.map((x) => x.texto_zh), ...depois3.map((x) => x.texto_zh)]);
    const req = {
      modelo: 'medicao',
      promptMae: depois ? promptComposto : promptCompletoLegado,
      glossario: gloss,
      glossarioNoUsuario: depois,
      vizinhasAntes: antes,
      vizinhasDepois: depois3,
      frase: { texto_zh: f.texto_zh, texto_pt: f.texto_pt, texto_pt_original_ia: null },
      pergunta: 'Essa escolha de tradução está correta?',
    };
    linhas.push({ rotulo: `frase ${f.ordem}`, sistema: await contar(sistemaRevisao(req)), usuario: await contar(usuarioRevisao(req)) });
  }
  return linhas;
}

async function medirExtracao(depois: boolean): Promise<Linha[]> {
  const linhas: Linha[] = [];
  for (const f of amostra) {
    const gloss = depois ? filtrarGlossarioRelevante(glossario, [f.texto_zh]) : glossario;
    const req = {
      modelo: 'medicao',
      promptMae: depois ? promptComposto : promptCompletoLegado,
      glossario: gloss,
      glossarioNoUsuario: depois,
      frase: { texto_zh: f.texto_zh, texto_pt: f.texto_pt },
    };
    linhas.push({ rotulo: `frase ${f.ordem}`, sistema: await contar(sistemaExtrairTermos(req)), usuario: await contar(usuarioExtrairTermos(req)) });
  }
  return linhas;
}

// Custo de entrada efetivo numa sequência de N chamadas com sistema idêntico:
// com cache, a 1ª paga escrita (1,25×) e as demais leem (0,1×); sem cache (ou
// com sistema mudando a cada chamada), todas pagam 1× — e quando há
// cache_control marcado num sistema que nunca repete, pagam 1,25× (o caso da
// revisão antiga, A4). Usuário sempre 1×.
function custoSequencia(linhas: Linha[], cache: 'estavel' | 'sem-cache' | 'escrita-perdida'): number {
  let total = 0;
  linhas.forEach((l, i) => {
    const fator = cache === 'estavel' ? (i === 0 ? 1.25 : 0.1) : cache === 'escrita-perdida' ? 1.25 : 1;
    total += l.sistema * fator + l.usuario;
  });
  return Math.round(total);
}

const soma = (linhas: Linha[], campo: 'sistema' | 'usuario') => linhas.reduce((s, l) => s + l[campo], 0);

console.log(`Medição — capítulo ${capitulo.numero} (${frases.length} frases, glossário com ${glossario.length} termos)`);
console.log(`Método de contagem: ${metodo}\n`);

const tradAntes = await medirTraducao(promptCompletoLegado);
const tradDepois = await medirTraducao(promptComposto);
console.log('TRADUÇÃO (por bloco; sistema já era estável e cacheável nas duas arquiteturas)');
for (let i = 0; i < tradAntes.length; i++) {
  console.log(
    `  ${tradAntes[i].rotulo}: sistema ${tradAntes[i].sistema} → ${tradDepois[i].sistema} tok · usuário ${tradAntes[i].usuario} → ${tradDepois[i].usuario} tok`,
  );
}
console.log(
  `  custo efetivo do capítulo (cache estável): ${custoSequencia(tradAntes, 'estavel')} → ${custoSequencia(tradDepois, 'estavel')} tokens\n`,
);

const revAntes = await medirRevisao(false);
const revDepois = await medirRevisao(true);
console.log(`REVISÃO (${N_AMOSTRA} revisões seguidas na mesma obra)`);
console.log(`  sistema médio: ${Math.round(soma(revAntes, 'sistema') / revAntes.length)} → ${Math.round(soma(revDepois, 'sistema') / revDepois.length)} tok · usuário médio: ${Math.round(soma(revAntes, 'usuario') / revAntes.length)} → ${Math.round(soma(revDepois, 'usuario') / revDepois.length)} tok`);
const custoRevAntes = custoSequencia(revAntes, 'escrita-perdida');
const custoRevDepois = custoSequencia(revDepois, 'estavel');
console.log(`  custo efetivo ANTES (sistema muda por frase; escrita de cache perdida, A4): ${custoRevAntes} tokens`);
console.log(`  custo efetivo DEPOIS (sistema estável; 1ª escreve, demais leem):           ${custoRevDepois} tokens`);
console.log(`  redução: ${(100 * (1 - custoRevDepois / custoRevAntes)).toFixed(1)}%\n`);

const extAntes = await medirExtracao(false);
const extDepois = await medirExtracao(true);
console.log(`EXTRAÇÃO DE TERMOS (${N_AMOSTRA} frases de curadoria seguidas)`);
console.log(`  sistema médio: ${Math.round(soma(extAntes, 'sistema') / extAntes.length)} → ${Math.round(soma(extDepois, 'sistema') / extDepois.length)} tok · usuário médio: ${Math.round(soma(extAntes, 'usuario') / extAntes.length)} → ${Math.round(soma(extDepois, 'usuario') / extDepois.length)} tok`);
const custoExtAntes = custoSequencia(extAntes, 'sem-cache');
const custoExtDepois = custoSequencia(extDepois, 'estavel');
console.log(`  custo efetivo ANTES (glossário inteiro no sistema, sem cache, M2): ${custoExtAntes} tokens`);
console.log(`  custo efetivo DEPOIS (só termos da frase; sistema cacheado):       ${custoExtDepois} tokens`);
console.log(`  redução: ${(100 * (1 - custoExtDepois / custoExtAntes)).toFixed(1)}%`);

// ── Conferência contra o medido (doc 11 §6) ────────────────────────────────
// As reduções acima são ESTIMATIVA: elas valem porque o sistema passou a ser
// estável e cacheável na revisão e na extração. Se o cache não estiver
// acertando de verdade nesses papéis, a economia não existe — e é exatamente
// isso que a conferência mostra.

if (modoReal) {
  const db = abrirSomenteLeitura();
  if (db) {
    const linhas = medidoPorPapel(db);
    console.log(`\n${'='.repeat(72)}`);
    console.log('CONFERÊNCIA CONTRA O MEDIDO (eventos_ia, todos os capítulos, somente leitura)');
    if (linhas.length === 0) {
      console.log('  Nenhuma chamada registrada ainda.');
    } else {
      for (const l of linhas) {
        const acerto = acertoDeCache(l);
        console.log(
          `  ${l.papel.padEnd(12)} ${String(l.chamadas).padStart(4)} chamada(s) · ` +
            `acerto de cache ${acerto === null ? 'n/d' : `${acerto.toFixed(0)}%`} · ` +
            `escrita de cache ${l.tokens_cache_criacao} tok · ${formatarUsd(l.custo_usd, l.chamadas_sem_preco)}`,
        );
      }
      for (const papel of ['revisao', 'extracao']) {
        const l = linhas.find((x) => x.papel === papel);
        if (!l) {
          console.log(`\n  ${papel}: nenhuma chamada medida — a redução do doc 08 segue sendo estimativa.`);
          continue;
        }
        const acerto = acertoDeCache(l);
        const rotulo = papel === 'revisao' ? 'revisão (−68% estimado)' : 'extração (−82% estimado)';
        if (l.chamadas < 2) {
          // Uma chamada só sempre escreve sem ler: não houve anterior para
          // aproveitar. Não é sintoma de nada — é amostra de tamanho 1.
          console.log(
            `\n  ${rotulo}: só ${l.chamadas} chamada medida — amostra insuficiente para julgar o cache ` +
              '(a estreia de um prefixo sempre escreve sem ler).',
          );
        } else if (acerto === null || acerto < 20) {
          console.log(
            `\n  ${rotulo}: acerto de cache MEDIDO em ${acerto === null ? 'n/d' : `${acerto.toFixed(0)}%`} em ` +
              `${l.chamadas} chamadas — a economia estimada NÃO está se realizando; investigue o prefixo estável.`,
          );
        } else {
          console.log(
            `\n  ${rotulo}: acerto de cache MEDIDO em ${acerto.toFixed(0)}% em ${l.chamadas} chamadas — ` +
              'o mecanismo que sustenta a redução está funcionando.',
          );
        }
      }
    }
    db.close();
  }
} else {
  console.log('\n(rode com --real para conferir estes números contra o que foi medido de verdade — doc 11 §6)');
}
