import fs from 'node:fs';
import crypto from 'node:crypto';
import { avaliarExecucaoLiteraria } from '../src/revisao/literaria.js';

const [evalPath, candidatasPath, particao = 'teste'] = process.argv.slice(2);
if (!evalPath || !candidatasPath) {
  console.error('Uso: tsx server/scripts/aferir-eval-literaria.ts EVAL.json CANDIDATAS.json [teste|calibracao|todas]');
  process.exit(2);
}
const evalSerializado = fs.readFileSync(evalPath, 'utf8');
const conjunto = JSON.parse(evalSerializado);
const execucao = JSON.parse(fs.readFileSync(candidatasPath, 'utf8'));
if (conjunto.esquema !== 'dao-tale-eval-literaria-v1') throw new Error('Esquema de eval desconhecido.');
if (execucao.esquema !== 'dao-tale-candidatas-eval-literaria-v1') throw new Error('Esquema das candidatas desconhecido.');
const evalSha256 = crypto.createHash('sha256').update(evalSerializado).digest('hex');
if (execucao.eval_sha256 !== evalSha256) throw new Error('As candidatas foram geradas para outro snapshot de eval.');
if (execucao.ambiente_sha256 !== conjunto.ambiente?.sha256) throw new Error('As candidatas foram geradas em outro ambiente de prompt/Gama/contexto.');
const casos = conjunto.casos.filter((c: any) => particao === 'todas' || c.particao === particao);
const chavesEsperadas = new Set(casos.map((c: any) => `${c.capitulo}.${c.ordem}`));
const candidatas = new Map<string, string | null>();
const bloqueadas = new Set<string>();
for (const c of execucao.candidatas ?? []) {
  const chave = `${c.capitulo}.${c.ordem}`;
  if (!chavesEsperadas.has(chave)) continue;
  if (candidatas.has(chave)) throw new Error(`Caso duplicado nas candidatas: ${chave}`);
  candidatas.set(chave, c.texto_revisado ?? null);
  if (c.bloqueada) bloqueadas.add(chave);
}
const ausentes = [...chavesEsperadas].filter((chave) => !candidatas.has(chave));
if (ausentes.length) throw new Error(`Execução incompleta: faltam ${ausentes.length} caso(s), começando por ${ausentes.slice(0, 5).join(', ')}.`);
console.log(JSON.stringify({
  esquema: 'dao-tale-resultado-eval-literaria-v1',
  conjunto: evalPath,
  execucao: candidatasPath,
  particao,
  provisoria: !!conjunto.provisoria,
  metricas: avaliarExecucaoLiteraria(casos, candidatas, bloqueadas),
}, null, 2));
