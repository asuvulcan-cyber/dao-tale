import fs from 'node:fs';
import type { EntradaGlossario } from '@dao-tale/shared';
import type { AlvoRevisaoLiteraria, ExemploContrastivo } from '../src/ia/provedor.js';
import { filtrarGlossarioRelevante, incluirPrincipais } from '../src/ia/prompts.js';
import { selecionarMemoriaContrastiva } from '../src/revisao/memoriaContrastiva.js';

const [evalPath, particao = 'teste', limiteTexto = '4'] = process.argv.slice(2);
const limite = Number(limiteTexto);
if (!evalPath || !Number.isInteger(limite) || limite < 1 || limite > 6) {
  console.error('Uso: tsx server/scripts/inspecionar-memoria-eval.ts EVAL.json [teste|calibracao] [LIMITE]');
  process.exit(2);
}
const conjunto = JSON.parse(fs.readFileSync(evalPath, 'utf8'));
const memoria = conjunto.ambiente.memoria_contrastiva as ExemploContrastivo[];
const gama = conjunto.ambiente.gama as EntradaGlossario[];
const casos = conjunto.casos.filter((c: any) => c.particao === particao);
const porCapitulo = new Map<number, any[]>();
for (const caso of casos) porCapitulo.set(caso.capitulo, [...(porCapitulo.get(caso.capitulo) ?? []), caso]);

const resultado = [];
for (const [capitulo, lista] of [...porCapitulo].sort((a, b) => a[0] - b[0])) {
  for (let i = 0; i < lista.length; i += 6) {
    const bloco = lista.slice(i, i + 6);
    const alvos: AlvoRevisaoLiteraria[] = bloco.map((c: any) => ({
      ordem: c.ordem, paragrafo: c.ordem, inicio_paragrafo: true,
      apos_fala_em_outro_paragrafo: false, texto_zh: c.texto_zh,
      texto_pt: c.vigente, texto_pt_original_ia: c.texto_pt_original_ia,
    }));
    const filtrado = incluirPrincipais(filtrarGlossarioRelevante(gama, alvos.map((a) => a.texto_zh)), gama);
    resultado.push({
      capitulo,
      inicio: bloco[0].ordem,
      exemplos: selecionarMemoriaContrastiva(alvos, memoria, filtrado, limite),
    });
  }
}
console.log(JSON.stringify(resultado, null, 2));
