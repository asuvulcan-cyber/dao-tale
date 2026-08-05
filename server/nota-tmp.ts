import { analisarEstilo } from './src/traducao/estiloViolacoes.js';
import { readFileSync, readdirSync } from 'node:fs';
const SP = '/tmp/claude-1000/-home-asuvn-dev-dao-tale/028f7441-9ba9-4fb7-93fc-dbd669ffc5c6/scratchpad';
const prefs: any = { dialogo: 'aspas', mais_que_perfeito: 'evitar', pensamento_marca: 'italico',
  pensamento_tempo: 'original', notas_tradutor: 'permitir', onomatopeia: 'adaptar', registro: 'jovem-adulto' };
const analisa = (t: string) => analisarEstilo(t.split('\n\n').map((x, ordem) => ({ ordem, texto_pt: x })), prefs).violacoes;

const linhas: any[] = [];
for (const arq of readdirSync(SP).filter((f) => f.startsWith('todos-lote')).sort()) {
  for (const r of JSON.parse(readFileSync(`${SP}/${arq}`, 'utf8'))) {
    const nome = `${r._provedor}/${r._modelo}`;
    if (!r.ok) { linhas.push({ nome, erro: (r.erro || '').slice(0, 55) }); continue; }
    const v = analisa(r.texto_pt);
    const mqp = v.filter((x: any) => x.regra === 'mais-que-perfeito');
    linhas.push({ nome, mqp: mqp.length, outras: v.length - mqp.length,
      pal: mqp.map((x: any) => x.trecho).join(' '), chars: r.texto_pt.length });
  }
}
const ok = linhas.filter((l) => l.mqp !== undefined).sort((a, b) => a.mqp - b.mqp);
console.log('modelo'.padEnd(46), 'MQP', 'outras', 'chars', ' formas simples');
for (const l of ok) console.log(l.nome.padEnd(46), String(l.mqp).padStart(3), String(l.outras).padStart(6), String(l.chars).padStart(6), ' ', l.pal);
console.log('\n--- sem resposta ---');
for (const l of linhas.filter((x) => x.erro)) console.log(l.nome.padEnd(46), l.erro);
const comDissera = ok.filter((l) => / ?dissera ?/i.test(' ' + l.pal + ' ')).length;
console.log(`\n${ok.length} responderam | ZERO violações: ${ok.filter((l) => l.mqp === 0).length}`);
console.log(`produziram "dissera" (palavra que o prompt PROÍBE por nome): ${comDissera}/${ok.length}`);
