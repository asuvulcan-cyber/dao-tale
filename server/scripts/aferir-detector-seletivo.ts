import fs from 'node:fs';
import crypto from 'node:crypto';
import type { EntradaGlossario, PreferenciasEstilo } from '@dao-tale/shared';
import { detectarRevisaoSeletiva } from '../src/revisao/detectorSeletivo.js';

const [evalPath, traducaoPath, particao = 'teste', saida] = process.argv.slice(2);
if (!evalPath || !traducaoPath || !['teste', 'calibracao'].includes(particao)) {
  console.error('Uso: tsx server/scripts/aferir-detector-seletivo.ts EVAL.json TRADUCAO.json [teste|calibracao] [SAIDA.json]');
  process.exit(2);
}
const evalTexto = fs.readFileSync(evalPath, 'utf8');
const conjunto = JSON.parse(evalTexto);
const traducao = JSON.parse(fs.readFileSync(traducaoPath, 'utf8'));
const evalHash = crypto.createHash('sha256').update(evalTexto).digest('hex');
if (traducao.eval_sha256 !== evalHash || traducao.ambiente_sha256 !== conjunto.ambiente.sha256) {
  throw new Error('Tradução e conjunto de eval não pertencem ao mesmo ambiente.');
}

const frases = traducao.traducoes.map((t: any, i: number) => ({
  id: i + 1, capitulo: t.capitulo, ordem: t.ordem,
  texto_zh: conjunto.ambiente.contexto_capitulos[String(t.capitulo)]?.find((f: any) => f.ordem === t.ordem)?.texto_zh ?? '',
  texto_pt: t.texto_pt,
}));
const diagnosticos = new Map<string, any>();
for (const capitulo of [...new Set(frases.map((f: any) => f.capitulo))] as number[]) {
  const deste = frases.filter((f: any) => f.capitulo === capitulo);
  for (const d of detectarRevisaoSeletiva(
    deste,
    conjunto.ambiente.preferencias as PreferenciasEstilo,
    conjunto.ambiente.gama as EntradaGlossario[],
  )) diagnosticos.set(`${capitulo}.${d.ordem}`, { capitulo, ...d });
}

const casos = conjunto.casos.filter((c: any) => c.particao === particao);
let positivos = 0;
let controles = 0;
let verdadeiros = 0;
let falsos = 0;
for (const caso of casos) {
  const positivo = caso.status !== 'linha-base';
  const detectado = diagnosticos.has(`${caso.capitulo}.${caso.ordem}`);
  if (positivo) positivos += 1;
  else controles += 1;
  if (positivo && detectado) verdadeiros += 1;
  if (!positivo && detectado) falsos += 1;
}
const selecionadosTeste = casos.filter((c: any) => diagnosticos.has(`${c.capitulo}.${c.ordem}`));
const resultado = {
  esquema: 'dao-tale-resultado-detector-seletivo-v1',
  particao,
  casos: casos.length,
  referencias_positivas: positivos,
  controles_negativos: controles,
  selecionados_no_teste: selecionadosTeste.length,
  cobertura: positivos ? verdadeiros / positivos : 1,
  precisao_classificatoria: selecionadosTeste.length ? verdadeiros / selecionadosTeste.length : null,
  falsos_positivos: falsos,
  taxa_falso_positivo: controles ? falsos / controles : 0,
  frases_traduzidas: frases.length,
  frases_roteadas_total: diagnosticos.size,
  reducao_chamadas_potencial: frases.length ? 1 - diagnosticos.size / frases.length : 0,
  por_fenomeno: Object.fromEntries(
    [...new Set([...diagnosticos.values()].flatMap((d) => d.fenomenos))]
      .sort()
      .map((fenomeno) => [fenomeno, [...diagnosticos.values()].filter((d) => d.fenomenos.includes(fenomeno)).length]),
  ),
  diagnosticos: [...diagnosticos.values()].sort((a, b) => a.capitulo - b.capitulo || a.ordem - b.ordem),
};
if (saida) fs.writeFileSync(saida, `${JSON.stringify(resultado, null, 2)}\n`);
console.log(JSON.stringify(resultado, null, 2));
