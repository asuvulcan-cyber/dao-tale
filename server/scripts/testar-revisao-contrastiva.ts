// Avaliação isolada: mesma tradução pronta, revisão sem/com exemplos externos.
// DAO_TALE_BANCO=... DAO_TALE_DIR=... tsx SCRIPT ANTERIOR.json SAIDA.json [--executar]
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { obterChave } from '../src/credenciais/index.js';
import { obterProvedor } from '../src/ia/fabrica.js';
import { incluirPrincipais, filtrarGlossarioRelevante } from '../src/ia/prompts.js';
import { validarPropostaLiteraria, propostaPodeIrAoStaging } from '../src/revisao/literaria.js';
import type { ExemploContrastivo, AlvoRevisaoLiteraria } from '../src/ia/provedor.js';

const [entrada, saida] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!entrada || !saida || !process.env.DAO_TALE_BANCO) throw new Error('Informe entrada, saída e banco.');
const executar = process.argv.includes('--executar');
const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const anterior = JSON.parse(fs.readFileSync(entrada, 'utf8'));
if (anterior.esquema !== 'dao-tale-registro-pareado-v1' || hash(anterior.ambiente) !== anterior.ambiente_sha256) throw new Error('Snapshot incompatível.');
const db = new Database(process.env.DAO_TALE_BANCO, { readonly: true, fileMustExist: true });
// Dois exemplos curtos por capítulo, ordenados; capítulos-alvo nunca entram.
const exemplos: ExemploContrastivo[] = [20, 21, 22].flatMap(capitulo => {
  const linhas = db.prepare(`SELECT c.numero capitulo,f.ordem,f.texto_zh,
    r.texto_vigente_base texto_rejeitado,f.texto_pt texto_aprovado,r.justificativa,r.categorias
    FROM frases f JOIN capitulos c ON c.id=f.capitulo_id
    JOIN revisoes_literarias r ON r.frase_id=f.id
    WHERE c.obra_id=1 AND c.numero=? AND r.status='aprovada'
    AND f.texto_pt=r.texto_revisado AND r.texto_vigente_base<>r.texto_revisado
    AND length(f.texto_pt) BETWEEN 80 AND 350 AND r.categorias LIKE '%naturalidade%'
    ORDER BY f.ordem,r.id LIMIT 2`).all(capitulo) as (Omit<ExemploContrastivo, 'categorias'> & { categorias: string })[];
  return linhas.map(l => ({ ...l, categorias: JSON.parse(l.categorias) }));
});
if (exemplos.length !== 6) throw new Error('Exemplos insuficientes.');
const blocos = anterior.ambiente.blocos.map((b: any) => {
  const base = anterior.resultados.find((r: any) => r.capitulo === b.capitulo && r.variante === 'base' && r.completo);
  if (!base || exemplos.some(e => e.capitulo === b.capitulo)) throw new Error('Base ausente ou vazamento de exemplos.');
  const linhas = db.prepare('SELECT f.ordem,f.paragrafo FROM frases f JOIN capitulos c ON c.id=f.capitulo_id WHERE c.obra_id=1 AND c.numero=? ORDER BY f.ordem').all(b.capitulo) as {ordem:number;paragrafo:number}[];
  const converter = (f: any, texto: string): AlvoRevisaoLiteraria => {
    const i = linhas.findIndex(l => l.ordem === f.ordem);
    if (i < 0) throw new Error('Frase ausente.');
    return { ordem: f.ordem, paragrafo: linhas[i].paragrafo,
      inicio_paragrafo: i === 0 || linhas[i-1].paragrafo !== linhas[i].paragrafo,
      apos_fala_em_outro_paragrafo: false, texto_zh: f.texto_zh, texto_pt: texto, texto_pt_original_ia: texto };
  };
  return { capitulo: b.capitulo,
    alvos: b.bloco.map((f: any) => converter(f, base.resposta.traducoes.find((t: any) => t.ordem === f.ordem).texto_pt)),
    contextoAntes: b.cauda.map((f: any) => converter(f, f.texto_pt_original_ia)),
    contextoDepois: b.proximas.map((f: any) => converter(f, f.texto_pt_original_ia)),
    referencias: b.bloco.map((f: any) => ({ordem:f.ordem,texto_pt:f.texto_pt})) };
});
db.close();
const ambiente = { origem_sha256: anterior.ambiente_sha256, modelo: 'gemini-3.8-flash', temperatura: 0.3,
  foco: 'tom-naturalidade' as const, omega: anterior.ambiente.omega, gama: anterior.ambiente.gama, exemplos, blocos };
const resultados: unknown[] = [];
const doc = () => ({ esquema: 'dao-tale-revisao-contrastiva-v1', ambiente_sha256: hash(ambiente), ambiente, resultados,
  aviso: 'Exploratório; vinte frases conhecidas, uma geração por condição. Nenhuma promoção automática.' });
fs.writeFileSync(saida, JSON.stringify(doc(), null, 2), { flag: 'wx', mode: 0o600 });
if (executar) {
  const chave = await obterChave('gemini');
  if (!chave) throw new Error('Chave ausente.');
  const provedor = obterProvedor('gemini');
  for (const [i,b] of blocos.entries()) for (const memoria of i === 0 ? [false,true] : [true,false]) {
    const glossario = incluirPrincipais(filtrarGlossarioRelevante(ambiente.gama, [...b.contextoAntes,...b.alvos,...b.contextoDepois].map((f: AlvoRevisaoLiteraria) => f.texto_zh)), ambiente.gama);
    const resposta = await provedor.revisarLiterariamente(chave, { modelo: ambiente.modelo, temperatura: ambiente.temperatura,
      foco: ambiente.foco, omega: ambiente.omega, glossario, exemplosContrastivos: memoria ? exemplos : [],
      contextoAntes:b.contextoAntes,alvos:b.alvos,contextoDepois:b.contextoDepois });
    const validacoes = b.alvos.map((a: AlvoRevisaoLiteraria) => {
      const encontradas = resposta.propostas.filter(p => p.ordem === a.ordem);
      if (encontradas.length !== 1) return {ordem:a.ordem,bloqueada:true,motivo:'ausente-ou-duplicada'};
      const p = encontradas[0];
      const travas = p.texto_revisado && p.texto_revisado !== a.texto_pt ? validarPropostaLiteraria(a,p,glossario) : [];
      return {ordem:a.ordem,bloqueada:!propostaPodeIrAoStaging(travas),travas};
    });
    resultados.push({capitulo:b.capitulo,memoria,resposta,validacoes});
    fs.writeFileSync(saida, JSON.stringify(doc(), null, 2));
    console.log(JSON.stringify({capitulo:b.capitulo,memoria,uso:resposta.uso}));
  }
}
console.log(JSON.stringify({saida,resultados:resultados.length,ambiente_sha256:hash(ambiente)}));
