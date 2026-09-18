// Reproduz triagem local em snapshot conhecido; sem credenciais, banco ou API.
// tsx SCRIPT DIAGNOSTICADA.json SAIDA.json
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { PREFERENCIAS_PADRAO } from '@dao-tale/shared';
import { detectarRevisaoSeletiva } from '../src/revisao/detectorSeletivo.js';
import { analisarEstilo } from '../src/traducao/estiloViolacoes.js';

const [entrada, saida] = process.argv.slice(2);
if (!entrada || !saida) throw new Error('Informe snapshot e saída exclusiva.');
const texto = fs.readFileSync(entrada, 'utf8');
const d = JSON.parse(texto);
const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
if (d.esquema !== 'dao-tale-revisao-diagnosticada-v1' || hash(d.ambiente) !== d.ambiente_sha256) throw new Error('Snapshot incompatível.');
// Preferências explícitas e constantes nas medições antes/depois. Não inferir
// silenciosamente as preferências históricas a partir do texto do Omega.
const prefs = { ...PREFERENCIAS_PADRAO, mais_que_perfeito: 'evitar' as const, dialogo: 'aspas' as const };
const casos = d.ambiente.blocos.flatMap((b: any) => {
  const frases = b.alvos.map((a: any) => ({id:a.ordem+1,ordem:a.ordem,texto_zh:a.texto_zh,texto_pt:a.texto_pt}));
  const detectados = detectarRevisaoSeletiva(frases,prefs,d.ambiente.gama);
  const estilo = analisarEstilo(frases,prefs);
  return b.alvos.map((a: any) => ({capitulo:b.capitulo,ordem:a.ordem,
    referencia:d.ambiente.diagnosticos[`${b.capitulo}.${a.ordem}`] ?? null,
    detectado:detectados.find(v=>v.ordem===a.ordem) ?? null,
    tipografia:estilo.violacoes.filter(v=>v.ordem===a.ordem && v.regra==='aspas-nao-retas')}));
});
const positivos=casos.filter((c:any)=>c.referencia), controles=casos.filter((c:any)=>!c.referencia);
const encontrados=positivos.filter((c:any)=>c.detectado), falsos=controles.filter((c:any)=>c.detectado);
const referenciasAprovadas = d.ambiente.blocos.map((b: any) => {
  const frases = b.alvos.map((a: any) => {
    const referencia = b.referencias.find((r: any) => r.ordem === a.ordem);
    if (!referencia) throw new Error('Referência aprovada ausente.');
    return {id:a.ordem+1,ordem:a.ordem,texto_zh:a.texto_zh,texto_pt:referencia.texto_pt};
  });
  return {capitulo:b.capitulo,frases:frases.length,diagnosticos:detectarRevisaoSeletiva(frases,prefs,d.ambiente.gama)};
});
const resultado={esquema:'dao-tale-triagem-diagnosticada-v1',origem_sha256:hash(d),preferencias:prefs,
  aviso:'Amostra conhecida de calibração. Seleção de frase não comprova diagnóstico correto, nem mede detecção autônoma de sentido.',
  resumo:{total:casos.length,positivos:positivos.length,controles:controles.length,encontrados:encontrados.length,
    falsos_positivos:falsos.length,omitidos:positivos.length-encontrados.length},casos,referencias_aprovadas:referenciasAprovadas};
fs.writeFileSync(saida,JSON.stringify(resultado,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify(resultado,null,2));
