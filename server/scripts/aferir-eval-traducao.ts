import fs from 'node:fs';
import crypto from 'node:crypto';
import { distanciaNormalizada } from '../src/revisao/literaria.js';

const [evalPath, candidatasPath, particao = 'teste'] = process.argv.slice(2);
if (!evalPath || !candidatasPath) {
  console.error('Uso: tsx server/scripts/aferir-eval-traducao.ts EVAL.json CANDIDATAS.json [teste|calibracao]');
  process.exit(2);
}
const evalTexto = fs.readFileSync(evalPath, 'utf8');
const conjunto = JSON.parse(evalTexto);
const execucao = JSON.parse(fs.readFileSync(candidatasPath, 'utf8'));
if (execucao.esquema !== 'dao-tale-candidatas-eval-traducao-v1') throw new Error('Execução de tradução desconhecida.');
if (execucao.eval_sha256 !== crypto.createHash('sha256').update(evalTexto).digest('hex')) throw new Error('Execução pertence a outro eval.');
if (execucao.ambiente_sha256 !== conjunto.ambiente.sha256) throw new Error('Execução pertence a outro ambiente.');
const casos = conjunto.casos.filter((c: any) => c.particao === particao);
const traducoes = new Map(execucao.traducoes.map((t: any) => [`${t.capitulo}.${t.ordem}`, t.texto_pt]));
let ausentes = 0, exatas = 0, superaOriginal = 0, empataOriginal = 0, pioraOriginal = 0;
let distanciaCandidata = 0, distanciaOriginal = 0, distanciaVigente = 0;
for (const caso of casos) {
  const candidata = traducoes.get(`${caso.capitulo}.${caso.ordem}`) as string | null | undefined;
  const original = caso.texto_pt_original_ia ?? '';
  const dOriginal = distanciaNormalizada(original, caso.referencia);
  const dVigente = distanciaNormalizada(caso.vigente, caso.referencia);
  if (!candidata) { ausentes += 1; distanciaCandidata += 1; }
  else {
    const d = distanciaNormalizada(candidata, caso.referencia); distanciaCandidata += d;
    if (candidata.trim() === caso.referencia.trim()) exatas += 1;
    if (d + 0.01 < dOriginal) superaOriginal += 1;
    else if (dOriginal + 0.01 < d) pioraOriginal += 1;
    else empataOriginal += 1;
  }
  distanciaOriginal += dOriginal; distanciaVigente += dVigente;
}
const n = Math.max(1, casos.length);
console.log(JSON.stringify({
  esquema: 'dao-tale-resultado-eval-traducao-v1', particao, casos: casos.length, ausentes, exatas,
  distancia_media_ao_final: { primeira_ia_historica: distanciaOriginal / n, texto_vigente_base: distanciaVigente / n, candidata: distanciaCandidata / n },
  contra_primeira_ia: { supera: superaOriginal, empata: empataOriginal, piora: pioraOriginal, taxa_supera: superaOriginal / n },
  uso: execucao.uso,
}, null, 2));
