// Revalidação offline: nenhuma credencial, banco ou chamada de provedor.
// tsx SCRIPT SNAPSHOT.json SAIDA.json
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { validarPropostaLiteraria, propostaPodeIrAoStaging } from '../src/revisao/literaria.js';
import { conferirSinaisDiagnosticados } from '../src/revisao/sinaisBilingues.js';

const [entrada,saida] = process.argv.slice(2);
if (!entrada || !saida) throw new Error('Informe snapshot e saída exclusiva.');
const serializado = fs.readFileSync(entrada,'utf8');
const d = JSON.parse(serializado);
const hash = (x:string) => createHash('sha256').update(x).digest('hex');
if(d.esquema!=='dao-tale-revisao-diagnosticada-v1' || hash(JSON.stringify(d.ambiente))!==d.ambiente_sha256) throw new Error('Snapshot incompatível.');
const casos = d.resultados.flatMap((r:any)=>{
  const b = d.ambiente.blocos.find((b:any)=>b.capitulo===r.capitulo);
  if(!b) throw new Error('Bloco ausente.');
  return b.alvos.map((a:any)=>{
    const propostas = r.resposta.propostas.filter((p:any)=>p.ordem===a.ordem);
    if(propostas.length!==1) throw new Error('Decisão ausente ou duplicada.');
    const p=propostas[0], mudou=p.texto_revisado!=null && p.texto_revisado.trim()!==a.texto_pt.trim();
    const travas=mudou ? validarPropostaLiteraria(a,p,d.ambiente.gama):[];
    return {capitulo:b.capitulo,ordem:a.ordem,mudou,
      antes:r.validacoes.find((v:any)=>v.ordem===a.ordem),travas,
      elegivel_para_staging:mudou && propostaPodeIrAoStaging(travas),
      verificacoes:conferirSinaisDiagnosticados(a.texto_zh,p.texto_revisado??a.texto_pt,a.diagnostico?.razoes??[])};
  });
});
const resultado={esquema:'dao-tale-revalidacao-diagnosticos-v1',origem_sha256:hash(serializado),
  aviso:'Elegibilidade para staging não é aprovação. Ausência de sinal não comprova resolução; verificadores cobrem apenas padrões conhecidos.',
  resumo:{casos:casos.length,propostas:casos.filter((c:any)=>c.mudou).length,
    bloqueadas:casos.filter((c:any)=>c.travas.some((t:any)=>t.gravidade==='bloqueio')).length,
    com_sinal_persistente:casos.filter((c:any)=>c.verificacoes.some((v:any)=>v.estado==='sinal-persiste')).length},casos};
fs.writeFileSync(saida,JSON.stringify(resultado,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify(resultado,null,2));
