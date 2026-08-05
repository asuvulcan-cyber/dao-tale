import { analisarEstilo } from './src/traducao/estiloViolacoes.js';
import { readFileSync, readdirSync } from 'node:fs';
const SP = '/tmp/claude-1000/-home-asuvn-dev-dao-tale/028f7441-9ba9-4fb7-93fc-dbd669ffc5c6/scratchpad';
const prefs: any = { dialogo: 'aspas', mais_que_perfeito: 'evitar', pensamento_marca: 'italico',
  pensamento_tempo: 'original', notas_tradutor: 'permitir', onomatopeia: 'adaptar', registro: 'jovem-adulto' };
const conta = (t: string) => analisarEstilo(t.split('\n\n').map((x, ordem) => ({ ordem, texto_pt: x })), prefs).violacoes;

const linhas: any[] = [];
for (const arq of readdirSync(SP).filter((f) => f.startsWith('todos-lote')).sort()) {
  for (const r of JSON.parse(readFileSync(`${SP}/${arq}`, 'utf8'))) {
    if (!r.ok) { linhas.push({ m: `${r._provedor}/${r._modelo}`, v: null, erro: (r.erro || '').slice(0, 60) }); continue; }
    const v = conta(r.texto_pt);
    linhas.push({ m: `${r._provedor}/${r._modelo}`, v: v.length, pal: v.map((x: any) => x.trecho).join(','), ms: r.ms, chars: r.texto_pt.length });
  }
}
linhas.sort((a, b) => (a.v ?? 99) - (b.v ?? 99));
console.log('modelo'.padEnd(46), 'viol', 'chars', 'palavras / erro');
for (const l of linhas) {
  console.log(l.m.padEnd(46), String(l.v ?? 'ERRO').padStart(4), String(l.chars ?? '').padStart(5), ' ', l.pal ?? l.erro);
}
console.log(`\n${linhas.length} alvos | ok=${linhas.filter((l) => l.v !== null).length} | baseline flash (cru IA) = 8`);
