import fs from 'node:fs';
import crypto from 'node:crypto';

const [evalPath, traducaoPath, detectorPath, saida] = process.argv.slice(2);
if (!evalPath || !traducaoPath || !detectorPath || !saida) {
  console.error('Uso: node server/scripts/preparar-eval-seletivo.mjs EVAL.json TRADUCAO.json DETECTOR.json SAIDA.json');
  process.exit(2);
}
const ler = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const conjunto = ler(evalPath);
const traducao = ler(traducaoPath);
const detector = ler(detectorPath);
if (detector.esquema !== 'dao-tale-resultado-detector-seletivo-v1') throw new Error('Resultado de detector incompatível.');
const textos = new Map(traducao.traducoes.map((t) => [`${t.capitulo}.${t.ordem}`, t.texto_pt]));
const diagnosticos = new Map(detector.diagnosticos.map((d) => [`${d.capitulo}.${d.ordem}`, d]));
const derivado = structuredClone(conjunto);

for (const [capitulo, frases] of Object.entries(derivado.ambiente.contexto_capitulos)) {
  for (const frase of frases) {
    const texto = textos.get(`${capitulo}.${frase.ordem}`);
    if (texto != null) {
      frase.texto_pt = texto;
      frase.texto_pt_original_ia = texto;
    }
  }
}
derivado.casos = derivado.casos.flatMap((caso) => {
  if (caso.particao !== detector.particao) return [caso];
  const chave = `${caso.capitulo}.${caso.ordem}`;
  const diagnostico = diagnosticos.get(chave);
  if (!diagnostico) return [];
  const texto = textos.get(chave);
  if (texto == null) throw new Error(`Tradução ausente para caso selecionado ${chave}.`);
  return [{
    ...caso,
    vigente: texto,
    texto_pt_original_ia: texto,
    diagnostico: { fenomenos: diagnostico.fenomenos, razoes: diagnostico.razoes },
  }];
});
derivado.gerado_em = new Date().toISOString();
derivado.aviso = `Eval seletivo derivado de ${evalPath}; somente casos ${detector.particao} acusados por ${detectorPath}.`;
const { sha256: _anterior, ...ambienteSemHash } = derivado.ambiente;
derivado.ambiente.sha256 = crypto.createHash('sha256').update(JSON.stringify(ambienteSemHash)).digest('hex');
const serializado = `${JSON.stringify(derivado, null, 2)}\n`;
fs.writeFileSync(saida, serializado);
console.log(JSON.stringify({
  saida,
  casos: derivado.casos.length,
  casos_seletivos: derivado.casos.filter((c) => c.particao === detector.particao).length,
  sha256: crypto.createHash('sha256').update(serializado).digest('hex'),
}));
