// Snapshot anterior -> avaliação diagnosticada. Sem acesso ao banco.
// tsx SCRIPT CONTRASTIVA.json SAIDA.json [--executar]
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { obterChave } from '../src/credenciais/index.js';
import { obterProvedor } from '../src/ia/fabrica.js';
import { incluirPrincipais, filtrarGlossarioRelevante } from '../src/ia/prompts.js';
import { validarPropostaLiteraria, propostaPodeIrAoStaging } from '../src/revisao/literaria.js';
import type { AlvoRevisaoLiteraria } from '../src/ia/provedor.js';

const [entrada, saida] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!entrada || !saida) throw new Error('Informe snapshot e saída exclusiva.');
const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const anterior = JSON.parse(fs.readFileSync(entrada, 'utf8'));
if (anterior.esquema !== 'dao-tale-revisao-contrastiva-v1' || hash(anterior.ambiente) !== anterior.ambiente_sha256) throw new Error('Snapshot incompatível.');
// Diagnósticos editoriais do assistente, não de um detector automático.
// Não fornecem a referência aprovada nem uma redação substituta ao modelo.
const diagnosticos: Record<string, {fenomenos: string[]; razoes: string[]}> = {
  '23.30': {fenomenos:['registro','naturalidade','intensidade'],razoes:['Verificar exagero em “exibia uma infinidade” para 许多 e a construção “a carne em carne viva”; a repetição “soltou/soltaram” torna a ação pouco natural. Preservar a imagem corporal do chinês.']},
  '23.35': {fenomenos:['registro','imagem-acrescentada'],razoes:['“Um impulso ... tomou-lhe o peito” eleva a dicção e acrescenta uma imagem à vontade de virar e fugir. Preservar a reação física das pernas e o impulso.']},
  '23.36': {fenomenos:['fidelidade','comparacao'],razoes:['官宦之后 indica descendência de funcionários do governo, não necessariamente nobreza. 鬼神一样的传说 compara a tortura a lendas de fantasmas/deuses; não afirma que a tortura seja uma dessas lendas.']},
  '23.39': {fenomenos:['naturalidade','registro','intensidade'],razoes:['“Deram início aos chicotes” não exprime naturalmente a ação de chicotear. Verificar “se compadeceria”, “berro estridente”, “gritos dilacerantes se mesclaram”, sem elevar a dicção ou intensificar o sofrimento além do original. Preservar a comparação com o porco.']},
  '24.41': {fenomenos:['registro'],razoes:['“Um lampejo de temor” é uma escolha rebuscada para 一丝畏惧. Manter pequena intensidade de medo e não reescrever o restante por preferência.']},
  '24.42': {fenomenos:['fidelidade','registro','tempo'],razoes:['“Estrato”, “tarefas servis” elevam a narração neutra; “aberração” intensifica 另类. 没欺负过 refere-se ao que ele não fez até então, não apenas a um hábito atual. Preservar a posição social e a ausência de traição.']},
  '24.44': {fenomenos:['registro','intensidade'],razoes:['Verificar “a todo instante” diante de 频繁 e a naturalidade de “espinha ereta”. Não transformar o hábito de lavar as mãos em compulsão ou ato involuntário. Preservar os demais comportamentos.']},
  '24.47': {fenomenos:['fidelidade','referente'],razoes:['O original descreve Yao Nu como possuído quando morreu; não atribui a morte à possessão, como faz “sucumbiu”. 搞暗杀 remete ao assassinato realizado, não apenas tentado. Verificar de quem Qi Nu e Xie Nu pretendiam expulsar o mal. Não propor alteração isolada das aspas.']},
  '24.49': {fenomenos:['registro','tempo'],razoes:['“Fora”, “treinara com afinco”, “paradeiro desconhecido”, “depositar todas as esperanças” e “cultivo convencional” tornam a narração desnecessariamente formal. Preservar a cronologia, a duração e a intensidade do treino; não substituir tempos mecanicamente.']},
};
const ambiente = { ...anterior.ambiente, origem_sha256: anterior.ambiente_sha256, foco:'seletiva' as const,
  origem_diagnosticos:'editorial-assistente', diagnosticos,
  blocos: anterior.ambiente.blocos.map((b: any) => ({...b,alvos:b.alvos.map((a: AlvoRevisaoLiteraria) => ({...a,
    diagnostico:diagnosticos[`${b.capitulo}.${a.ordem}`] ?? {fenomenos:[],razoes:['Controle sem problema diagnosticado: preservar literalmente, devolvendo null.']} }))})) };
if (ambiente.blocos.length !== 2 || ambiente.blocos.some((b: any) => b.alvos.length !== 10 || ambiente.exemplos.some((e: any) => e.capitulo === b.capitulo))) throw new Error('Amostra inesperada ou vazamento.');
const resultados: unknown[] = [];
const doc = () => ({esquema:'dao-tale-revisao-diagnosticada-v1',ambiente_sha256:hash(ambiente),ambiente,resultados,
  aviso:'Diagnósticos editoriais conhecidos; mede correção condicionada à triagem, não capacidade de detectar erros autonomamente.'});
fs.writeFileSync(saida,JSON.stringify(doc(),null,2),{flag:'wx',mode:0o600});
if (process.argv.includes('--executar')) {
  const chave = await obterChave('gemini');
  if (!chave) throw new Error('Chave ausente.');
  const provedor = obterProvedor('gemini');
  for (const b of ambiente.blocos) {
    const glossario = incluirPrincipais(filtrarGlossarioRelevante(ambiente.gama,[...b.contextoAntes,...b.alvos,...b.contextoDepois].map((f: AlvoRevisaoLiteraria)=>f.texto_zh)),ambiente.gama);
    const resposta = await provedor.revisarLiterariamente(chave,{modelo:ambiente.modelo,temperatura:ambiente.temperatura,
      foco:ambiente.foco,omega:ambiente.omega,glossario,exemplosContrastivos:ambiente.exemplos,
      alvos:b.alvos,contextoAntes:b.contextoAntes,contextoDepois:b.contextoDepois});
    const normalizarAspas = (s: string) => s.replace(/[“”]/g,'"').replace(/[‘’]/g,"'");
    const validacoes = b.alvos.map((a: AlvoRevisaoLiteraria)=>{
      const ps=resposta.propostas.filter(p=>p.ordem===a.ordem);
      if(ps.length!==1) return {ordem:a.ordem,bloqueada:true,motivo:'ausente-ou-duplicada'};
      const p=ps[0], alterada=!!p.texto_revisado && p.texto_revisado!==a.texto_pt;
      const soAspas=alterada && normalizarAspas(p.texto_revisado!)===normalizarAspas(a.texto_pt);
      const controle=!(a.diagnostico?.fenomenos.length);
      const travas=alterada ? validarPropostaLiteraria(a,p,glossario):[];
      return {ordem:a.ordem,alterada,soAspas,controle,controleAlterado:controle&&alterada,
        bloqueada:!propostaPodeIrAoStaging(travas),travas};
    });
    const extras=resposta.propostas.filter(p=>!b.alvos.some((a: AlvoRevisaoLiteraria)=>a.ordem===p.ordem)).map(p=>p.ordem);
    resultados.push({capitulo:b.capitulo,resposta,validacoes,ordens_extras:extras});
    fs.writeFileSync(saida,JSON.stringify(doc(),null,2));
    console.log(JSON.stringify({capitulo:b.capitulo,uso:resposta.uso,validacoes,extras}));
  }
}
console.log(JSON.stringify({saida,resultados:resultados.length,ambiente_sha256:hash(ambiente)}));
