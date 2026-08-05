import { analisarEstilo } from './src/traducao/estiloViolacoes.js';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
const SP = '/tmp/claude-1000/-home-asuvn-dev-dao-tale/028f7441-9ba9-4fb7-93fc-dbd669ffc5c6/scratchpad';
const prefs: any = { dialogo: 'aspas', mais_que_perfeito: 'evitar', pensamento_marca: 'italico',
  pensamento_tempo: 'original', notas_tradutor: 'permitir', onomatopeia: 'adaptar', registro: 'jovem-adulto' };
const mqp = (t: string) => analisarEstilo(t.split('\n\n').map((x, ordem) => ({ ordem, texto_pt: x })), prefs)
  .violacoes.filter((v: any) => v.regra === 'mais-que-perfeito');

function carrega(prefixo: string) {
  const m = new Map<string, any>();
  for (const arq of readdirSync(SP).filter((f) => f.startsWith(prefixo))) {
    for (const r of JSON.parse(readFileSync(`${SP}/${arq}`, 'utf8'))) {
      if (r.ok) m.set(`${r._provedor}/${r._modelo}`, r.texto_pt);
    }
  }
  return m;
}
const A = carrega('todos-lote'), B = carrega('depois-lote');
const comuns = [...A.keys()].filter((k) => B.has(k)).sort();
console.log('modelo'.padEnd(44), ' MQP a→d | dissera a→d | "meia hora" a→d');
let da = 0, dd = 0, ha = 0, hd = 0, va = 0, vd = 0;
for (const k of comuns) {
  const a = A.get(k)!, b = B.get(k)!;
  const pa = mqp(a).map((v: any) => v.trecho.toLowerCase()), pb = mqp(b).map((v: any) => v.trecho.toLowerCase());
  const dA = pa.includes('dissera'), dB = pb.includes('dissera');
  const hA = /eia hora/.test(a), hB = /eia hora/.test(b);
  va += pa.length; vd += pb.length; da += +dA; dd += +dB; ha += +hA; hd += +hB;
  console.log(k.padEnd(44), String(pa.length).padStart(4), '→', String(pb.length).padStart(2), '  |',
    (dA ? 'sim' : ' — '), '→', (dB ? 'sim' : ' — '), '   |', (hA ? 'sim' : ' — '), '→', (hB ? 'sim' : ' — '));
}
const n = comuns.length;
console.log(`\n${n} modelos em ambas as rodadas`);
console.log(`mais-que-perfeito total : ${va} → ${vd}`);
console.log(`produziram "dissera"    : ${da}/${n} → ${dd}/${n}`);
console.log(`erraram 半个时辰 ("meia hora"): ${ha}/${n} → ${hd}/${n}`);
