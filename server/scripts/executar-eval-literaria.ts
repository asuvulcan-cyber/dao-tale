import fs from 'node:fs';
import crypto from 'node:crypto';
import type { EntradaGlossario, ProvedorId } from '@dao-tale/shared';
import type { ExemploContrastivo } from '../src/ia/provedor.js';
import { obterChave } from '../src/credenciais/index.js';
import { obterProvedor } from '../src/ia/fabrica.js';
import { filtrarGlossarioRelevante, incluirPrincipais } from '../src/ia/prompts.js';
import { propostaPodeIrAoStaging, validarPropostaLiteraria } from '../src/revisao/literaria.js';
import { selecionarMemoriaContrastiva } from '../src/revisao/memoriaContrastiva.js';

type CasoEval = {
  capitulo: number;
  ordem: number;
  texto_zh: string;
  texto_pt_original_ia: string | null;
  vigente: string;
  referencia: string;
  particao: 'teste' | 'calibracao';
  diagnostico?: { fenomenos: string[]; razoes: string[] };
};

const args = process.argv.slice(2);
const [evalPath, provedorTexto, modelo, saida] = args.filter((a) => !a.startsWith('--'));
const particaoArg = args.find((a) => a.startsWith('--particao='));
const particao = (particaoArg?.split('=')[1] ?? 'teste') as 'teste' | 'calibracao' | 'todas';
const focoArg = args.find((a) => a.startsWith('--foco='));
const foco = (focoArg?.split('=')[1] ?? 'integral') as 'integral' | 'fidelidade' | 'tom-naturalidade' | 'seletiva';
const memoriaArg = args.find((a) => a.startsWith('--memoria='));
const limiteMemoria = memoriaArg ? Number(memoriaArg.split('=')[1]) : 0;
const permitirProvisorio = args.includes('--permitir-provisorio');
if (!evalPath || !provedorTexto || !modelo || !saida || !['teste', 'calibracao', 'todas'].includes(particao) || !['integral', 'fidelidade', 'tom-naturalidade', 'seletiva'].includes(foco) || !Number.isInteger(limiteMemoria) || limiteMemoria < 0 || limiteMemoria > 6) {
  console.error('Uso: tsx server/scripts/executar-eval-literaria.ts EVAL.json PROVEDOR MODELO SAIDA.json [--particao=teste|calibracao|todas] [--foco=integral|fidelidade|tom-naturalidade|seletiva] [--memoria=0..6] [--permitir-provisorio]');
  process.exit(2);
}

const evalSerializado = fs.readFileSync(evalPath, 'utf8');
const conjunto = JSON.parse(evalSerializado);
const evalSha256 = crypto.createHash('sha256').update(evalSerializado).digest('hex');
if (conjunto.esquema !== 'dao-tale-eval-literaria-v1') throw new Error('Esquema de eval desconhecido.');
if (!conjunto.ambiente?.omega || !Array.isArray(conjunto.ambiente?.gama) || !conjunto.ambiente?.contexto_capitulos) {
  throw new Error('O eval não congela ambiente, Gama e contexto; regenere-o com o exportador atual.');
}
const { sha256: hashAmbiente, ...ambienteBase } = conjunto.ambiente;
const hashCalculado = crypto.createHash('sha256').update(JSON.stringify(ambienteBase)).digest('hex');
if (hashAmbiente !== hashCalculado) throw new Error('O ambiente congelado do eval foi alterado ou corrompido.');
if (conjunto.provisoria && !permitirProvisorio) {
  throw new Error('O eval é provisório. Use --permitir-provisorio apenas para calibração; ele não pode promover modelo.');
}
const casos = (conjunto.casos as CasoEval[]).filter((c) => particao === 'todas' || c.particao === particao);
const memoria = (conjunto.ambiente.memoria_contrastiva ?? []) as ExemploContrastivo[];
const particaoPorCapitulo = new Map<number, string>();
for (const caso of conjunto.casos as CasoEval[]) {
  const anterior = particaoPorCapitulo.get(caso.capitulo);
  if (anterior && anterior !== caso.particao) throw new Error(`O capítulo ${caso.capitulo} foi dividido entre partições.`);
  particaoPorCapitulo.set(caso.capitulo, caso.particao);
}
if (memoria.some((e) => particaoPorCapitulo.get(e.capitulo) !== 'calibracao')) {
  throw new Error('A memória contrastiva contém caso fora da partição de calibração.');
}
const chaves = new Set<string>();
for (const caso of casos) {
  const chave = `${caso.capitulo}.${caso.ordem}`;
  if (chaves.has(chave)) throw new Error(`Caso duplicado no eval: ${chave}`);
  chaves.add(chave);
}

const glossarioTodo = conjunto.ambiente.gama as EntradaGlossario[];
const provedorId = provedorTexto as ProvedorId;
const provedor = obterProvedor(provedorId);
const chave = provedor.precisaChave ? await obterChave(provedorId) : null;
if (provedor.precisaChave && !chave) throw new Error(`Nenhuma chave configurada para ${provedor.nome}.`);

let candidatas: any[] = [];
let erros: { capitulo: number; inicio: number; mensagem: string }[] = [];
let memoriaPorBloco: { capitulo: number; inicio: number; exemplos: { capitulo: number; ordem: number }[] }[] = [];
const uso = { chamadas: 0, tokens_entrada: 0, tokens_saida: 0, tokens_cache_leitura: 0, tokens_cache_criacao: 0 };
// Retomada progressiva: uma execução interrompida não paga outra vez pelos
// blocos já persistidos. O arquivo só é aceito quando pertence exatamente ao
// mesmo eval, ambiente, partição, provedor e modelo.
if (fs.existsSync(saida)) {
  const anterior = JSON.parse(fs.readFileSync(saida, 'utf8'));
  if (
    anterior.esquema !== 'dao-tale-candidatas-eval-literaria-v1' ||
    anterior.eval_sha256 !== evalSha256 || anterior.ambiente_sha256 !== hashAmbiente ||
    anterior.particao !== particao || anterior.provedor !== provedorId || anterior.modelo !== modelo ||
    (anterior.foco ?? 'integral') !== foco || (anterior.limite_memoria ?? 0) !== limiteMemoria
  ) throw new Error('O arquivo de saída existente pertence a outra execução; escolha outro caminho.');
  candidatas = anterior.candidatas ?? [];
  erros = anterior.erros ?? [];
  memoriaPorBloco = anterior.memoria_por_bloco ?? [];
  for (const campo of Object.keys(uso) as (keyof typeof uso)[]) uso[campo] = anterior.uso?.[campo] ?? 0;

  // Registros sintéticos criados quando a chamada inteira falha não representam
  // decisões do modelo e devem ser repetidos na retomada. Já bloqueios produzidos
  // por uma resposta válida (por exemplo, item ausente/duplicado) permanecem como
  // resultado observável do eval.
  if (erros.length > 0) {
    candidatas = candidatas.filter((c) => !c.travas?.includes('falha-da-chamada'));
    erros = [];
  }
}
const documento = () => ({
  esquema: 'dao-tale-candidatas-eval-literaria-v1',
  eval: evalPath,
  eval_sha256: evalSha256,
  ambiente_sha256: hashAmbiente,
  eval_provisorio: !!conjunto.provisoria,
  particao,
  provedor: provedorId,
  modelo,
  foco,
  limite_memoria: limiteMemoria,
  gerado_em: new Date().toISOString(),
  completo: candidatas.length === casos.length && erros.length === 0,
  uso,
  erros,
  memoria_por_bloco: memoriaPorBloco,
  candidatas: [...candidatas].sort((a, b) => a.capitulo - b.capitulo || a.ordem - b.ordem),
});
const salvar = () => fs.writeFileSync(saida, JSON.stringify(documento(), null, 2) + '\n');

const porCapitulo = new Map<number, CasoEval[]>();
for (const caso of casos) porCapitulo.set(caso.capitulo, [...(porCapitulo.get(caso.capitulo) ?? []), caso]);
const jaProcessadas = new Set(candidatas.map((c) => `${c.capitulo}.${c.ordem}`));
for (const [capitulo, casosCapitulo] of [...porCapitulo].sort((a, b) => a[0] - b[0])) {
  const todas = (conjunto.ambiente.contexto_capitulos[String(capitulo)] ?? []) as {
    capitulo: number; ordem: number; paragrafo?: number; texto_zh: string; texto_pt: string; texto_pt_original_ia: string | null;
  }[];
  const porOrdem = new Map(todas.map((f, i) => [f.ordem, { f, i }]));
  for (let deslocamento = 0; deslocamento < casosCapitulo.length; deslocamento += 6) {
    const bloco = casosCapitulo.slice(deslocamento, deslocamento + 6);
    if (bloco.every((caso) => jaProcessadas.has(`${capitulo}.${caso.ordem}`))) continue;
    const alvos = bloco.map((caso) => {
      const encontrada = porOrdem.get(caso.ordem);
      if (!encontrada) throw new Error(`Frase ${capitulo}.${caso.ordem} não existe no banco.`);
      // O vigente congelado no eval é a entrada, ainda que o banco tenha mudado:
      // assim uma execução permanece reproduzível e conflitos ficam explícitos.
      const anterior = todas[encontrada.i - 1];
      const paragrafo = encontrada.f.paragrafo ?? caso.ordem;
      const inicioParagrafo = !anterior || anterior.paragrafo !== paragrafo;
      return { ordem: caso.ordem, paragrafo, inicio_paragrafo: inicioParagrafo, apos_fala_em_outro_paragrafo: Boolean(inicioParagrafo && anterior && /^[\s*_]*["“].*["”][\s*_]*$/su.test(anterior.texto_pt.trim())), texto_zh: caso.texto_zh, texto_pt: caso.vigente, texto_pt_original_ia: caso.texto_pt_original_ia, diagnostico: caso.diagnostico };
    });
    const primeiro = porOrdem.get(bloco[0].ordem)!.i;
    const ultimo = porOrdem.get(bloco.at(-1)!.ordem)!.i;
    const converter = (f: (typeof todas)[number]) => {
      const indice = porOrdem.get(f.ordem)!.i;
      const anterior = todas[indice - 1];
      const paragrafo = f.paragrafo ?? f.ordem;
      const inicioParagrafo = !anterior || anterior.paragrafo !== paragrafo;
      return { ordem: f.ordem, paragrafo, inicio_paragrafo: inicioParagrafo, apos_fala_em_outro_paragrafo: Boolean(inicioParagrafo && anterior && /^[\s*_]*["“].*["”][\s*_]*$/su.test(anterior.texto_pt.trim())), texto_zh: f.texto_zh, texto_pt: f.texto_pt, texto_pt_original_ia: f.texto_pt_original_ia };
    };
    const glossarioFiltrado = incluirPrincipais(filtrarGlossarioRelevante(glossarioTodo, alvos.map((a) => a.texto_zh)), glossarioTodo);
    const glossario = conjunto.ambiente.glossario_relevante ? glossarioFiltrado : glossarioTodo;
    const exemplosContrastivos = selecionarMemoriaContrastiva(alvos, memoria, glossario, limiteMemoria);
    memoriaPorBloco = memoriaPorBloco.filter((m) => m.capitulo !== capitulo || m.inicio !== bloco[0].ordem);
    memoriaPorBloco.push({
      capitulo,
      inicio: bloco[0].ordem,
      exemplos: exemplosContrastivos.map((e) => ({ capitulo: e.capitulo, ordem: e.ordem })),
    });
    try {
      const resposta = await provedor.revisarLiterariamente(chave, {
        modelo,
        foco,
        temperatura: conjunto.ambiente.temperatura_revisao,
        omega: conjunto.ambiente.omega,
        glossario,
        exemplosContrastivos,
        contextoAntes: todas.slice(Math.max(0, primeiro - 8), primeiro).map(converter),
        alvos,
        contextoDepois: todas.slice(ultimo + 1, ultimo + 9).map(converter),
      });
      uso.chamadas += 1;
      for (const campo of ['tokens_entrada', 'tokens_saida', 'tokens_cache_leitura', 'tokens_cache_criacao'] as const) {
        uso[campo] += resposta.uso[campo] ?? 0;
      }
      const contagem = new Map<number, number>();
      for (const p of resposta.propostas) contagem.set(p.ordem, (contagem.get(p.ordem) ?? 0) + 1);
      const propostas = new Map(resposta.propostas.map((p) => [p.ordem, p]));
      for (const alvo of alvos) {
        const proposta = propostas.get(alvo.ordem);
        if (!proposta || contagem.get(alvo.ordem) !== 1) {
          candidatas.push({ capitulo, ordem: alvo.ordem, texto_revisado: null, bloqueada: true, travas: ['resposta-ausente-ou-duplicada'] });
          continue;
        }
        if (proposta.texto_revisado == null || proposta.texto_revisado.trim() === alvo.texto_pt.trim()) {
          candidatas.push({ capitulo, ordem: alvo.ordem, texto_revisado: null, bloqueada: false, travas: [] });
          continue;
        }
        const travas = validarPropostaLiteraria(alvo, proposta, glossario);
        const bloqueada = !propostaPodeIrAoStaging(travas);
        candidatas.push({
          capitulo,
          ordem: alvo.ordem,
          texto_revisado: bloqueada ? null : proposta.texto_revisado,
          bloqueada,
          travas,
          justificativa: proposta.justificativa,
          categorias: proposta.categorias,
          confianca: proposta.confianca,
        });
      }
    } catch (e) {
      erros.push({ capitulo, inicio: bloco[0].ordem, mensagem: (e as Error).message });
      for (const alvo of alvos) candidatas.push({ capitulo, ordem: alvo.ordem, texto_revisado: null, bloqueada: true, travas: ['falha-da-chamada'] });
    }
    salvar();
  }
}
salvar();
console.log(JSON.stringify({ saida, casos: casos.length, candidatas: candidatas.length, completo: documento().completo, uso, erros: erros.length }));
