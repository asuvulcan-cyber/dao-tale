import fs from 'node:fs';
import crypto from 'node:crypto';

const [snapshotPath, traducaoBasePath, snapshotSaida, traducaoSaida, ...revisoesPaths] = process.argv.slice(2);
if (!snapshotPath || !traducaoBasePath || !snapshotSaida || !traducaoSaida) {
  console.error('Uso: node server/scripts/preparar-eval-multipasse.mjs SNAPSHOT.json TRADUCAO_BASE.json SNAPSHOT_SAIDA.json TRADUCAO_SAIDA.json [REVISAO_1.json ...]');
  process.exit(2);
}

const ler = (caminho) => JSON.parse(fs.readFileSync(caminho, 'utf8'));
const snapshotSerializado = fs.readFileSync(snapshotPath, 'utf8');
const snapshot = JSON.parse(snapshotSerializado);
const base = ler(traducaoBasePath);
if (snapshot.esquema !== 'dao-tale-eval-literaria-v1') throw new Error('Snapshot literário incompatível.');
if (base.esquema !== 'dao-tale-candidatas-eval-traducao-v1') throw new Error('Tradução-base incompatível.');

const chave = (x) => `${x.capitulo}.${x.ordem}`;
const textosBase = new Map(base.traducoes.filter((x) => typeof x.texto_pt === 'string').map((x) => [chave(x), x.texto_pt]));
const textosAtuais = new Map(textosBase);
const uso = { ...(base.uso ?? {}) };

for (const caminho of revisoesPaths) {
  const revisao = ler(caminho);
  if (revisao.esquema !== 'dao-tale-candidatas-eval-literaria-v1' || !revisao.completo) {
    throw new Error(`Revisão incompleta ou incompatível: ${caminho}`);
  }
  for (const candidata of revisao.candidatas) {
    if (!candidata.bloqueada && typeof candidata.texto_revisado === 'string' && candidata.texto_revisado.trim()) {
      textosAtuais.set(chave(candidata), candidata.texto_revisado);
    }
  }
  for (const campo of ['chamadas', 'tokens_entrada', 'tokens_saida', 'tokens_cache_leitura', 'tokens_cache_criacao']) {
    uso[campo] = (uso[campo] ?? 0) + (revisao.uso?.[campo] ?? 0);
  }
}

const derivado = structuredClone(snapshot);
for (const [capitulo, frases] of Object.entries(derivado.ambiente.contexto_capitulos)) {
  for (const frase of frases) {
    const k = `${capitulo}.${frase.ordem}`;
    if (textosAtuais.has(k)) frase.texto_pt = textosAtuais.get(k);
    if (textosBase.has(k)) frase.texto_pt_original_ia = textosBase.get(k);
  }
}
for (const caso of derivado.casos) {
  const k = chave(caso);
  if (textosAtuais.has(k)) caso.vigente = textosAtuais.get(k);
  if (textosBase.has(k)) caso.texto_pt_original_ia = textosBase.get(k);
}
derivado.gerado_em = new Date().toISOString();
derivado.aviso = `Snapshot derivado em sombra de ${traducaoBasePath}; passes: ${revisoesPaths.join(', ') || '(nenhum)'}.`;
const { sha256: _hashAnterior, ...ambienteSemHash } = derivado.ambiente;
derivado.ambiente.sha256 = crypto.createHash('sha256').update(JSON.stringify(ambienteSemHash)).digest('hex');
fs.writeFileSync(snapshotSaida, `${JSON.stringify(derivado, null, 2)}\n`);

const composta = {
  ...base,
  eval_sha256: crypto.createHash('sha256').update(snapshotSerializado).digest('hex'),
  ambiente_sha256: snapshot.ambiente.sha256,
  gerado_em: new Date().toISOString(),
  completo: true,
  modelo: `${base.modelo}+${revisoesPaths.map((p) => ler(p).foco ?? 'integral').join('+') || 'base'}`,
  uso,
  erros: [],
  traducoes: base.traducoes.map((item) => ({ ...item, texto_pt: textosAtuais.get(chave(item)) ?? item.texto_pt })),
};
fs.writeFileSync(traducaoSaida, `${JSON.stringify(composta, null, 2)}\n`);
console.log(JSON.stringify({ snapshot: snapshotSaida, traducao: traducaoSaida, passes: revisoesPaths.length, textos_alterados: [...textosAtuais].filter(([k, v]) => v !== textosBase.get(k)).length }));
