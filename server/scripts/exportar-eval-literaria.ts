import fs from 'node:fs';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { normalizarPreferencias, resolverTemperatura } from '@dao-tale/shared';
import { reposConfig, reposGlossario, reposObras, reposPrompts } from '../src/db/repos.js';

const [banco, loteTexto, saida, ...opcoes] = process.argv.slice(2);
if (!banco || !loteTexto || !saida) {
  console.error('Uso: tsx server/scripts/exportar-eval-literaria.ts BANCO LOTE_ID SAIDA [--incluir-pendentes] [--negativos-por-capitulo=N]');
  process.exit(2);
}
const loteId = Number(loteTexto);
const incluirPendentes = opcoes.includes('--incluir-pendentes');
const negativoArg = opcoes.find((o) => o.startsWith('--negativos-por-capitulo='));
const negativosPorCapitulo = negativoArg ? Number(negativoArg.split('=')[1]) : 0;
if (!Number.isInteger(negativosPorCapitulo) || negativosPorCapitulo < 0 || negativosPorCapitulo > 50) {
  throw new Error('--negativos-por-capitulo deve ser inteiro entre 0 e 50.');
}
const db = new Database(banco, { readonly: true });

const lote = db.prepare('SELECT id, obra_id, rotulo, criterios, criado_em FROM revisao_literaria_lotes WHERE id=?').get(loteId) as any;
if (!lote) throw new Error(`Lote ${loteId} não encontrado.`);
const estados = incluirPendentes ? ['aprovada', 'pendente'] : ['aprovada'];
const marcadores = estados.map(() => '?').join(',');
const positivos = db.prepare(`
  SELECT c.numero capitulo, f.ordem, f.texto_zh, f.texto_pt_original_ia,
         r.texto_vigente_base vigente, r.texto_revisado referencia, r.status,
         r.justificativa, r.categorias,
         c.provedor, c.modelo, p.versao delta_versao, n.versao alfa_versao
  FROM revisoes_literarias r
  JOIN frases f ON f.id=r.frase_id
  JOIN capitulos c ON c.id=f.capitulo_id
  LEFT JOIN prompts p ON p.id=c.prompt_id
  LEFT JOIN prompt_padrao n ON n.id=c.nucleo_id
  WHERE r.lote_id=? AND r.status IN (${marcadores})
  ORDER BY c.numero, f.ordem
`).all(loteId, ...estados) as any[];

const idsPositivos = new Set(positivos.map((p) => `${p.capitulo}.${p.ordem}`));
const candidatosNegativos = negativosPorCapitulo === 0 ? [] : db.prepare(`
  SELECT c.numero capitulo, f.ordem, f.texto_zh, f.texto_pt_original_ia,
         f.texto_pt vigente, f.texto_pt referencia, 'linha-base' status,
         c.provedor, c.modelo, p.versao delta_versao, n.versao alfa_versao
  FROM frases f JOIN capitulos c ON c.id=f.capitulo_id
  LEFT JOIN prompts p ON p.id=c.prompt_id LEFT JOIN prompt_padrao n ON n.id=c.nucleo_id
  WHERE c.obra_id=? ORDER BY c.numero, f.ordem
`).all(lote.obra_id) as any[];
const porCapitulo = new Map<number, any[]>();
for (const caso of candidatosNegativos) {
  if (idsPositivos.has(`${caso.capitulo}.${caso.ordem}`)) continue;
  const lista = porCapitulo.get(caso.capitulo) ?? [];
  lista.push(caso);
  porCapitulo.set(caso.capitulo, lista);
}
const negativos = [...porCapitulo.values()].flatMap((lista) => lista
  .sort((a, b) => crypto.createHash('sha256').update(`${a.capitulo}.${a.ordem}`).digest('hex').localeCompare(
    crypto.createHash('sha256').update(`${b.capitulo}.${b.ordem}`).digest('hex'),
  ))
  .slice(0, negativosPorCapitulo));

const casos = [...positivos, ...negativos].map((caso) => {
  // Capítulo inteiro fica em uma partição: dividir por frase vazaria voz,
  // continuidade e construções vizinhas da calibração para o teste.
  const balde = Number.parseInt(crypto.createHash('sha256').update(`capitulo:${caso.capitulo}`).digest('hex').slice(0, 8), 16) % 5;
  return { ...caso, particao: balde === 0 ? 'teste' : 'calibracao' };
});
for (const caso of casos) {
  try {
    caso.categorias = JSON.parse(caso.categorias ?? '[]');
  } catch {
    caso.categorias = [];
  }
}
const linhasMemoria = db.prepare(`
  SELECT c.numero capitulo, f.ordem, f.texto_zh,
         r.texto_vigente_base texto_rejeitado, r.texto_revisado texto_aprovado,
         r.justificativa, r.categorias
  FROM revisoes_literarias r
  JOIN revisao_literaria_lotes l ON l.id=r.lote_id
  JOIN frases f ON f.id=r.frase_id
  JOIN capitulos c ON c.id=f.capitulo_id
  WHERE l.obra_id=? AND r.status='aprovada' AND r.texto_vigente_base<>r.texto_revisado
  ORDER BY r.criado_em, c.numero, f.ordem
`).all(lote.obra_id) as any[];
const memoriaPorFrase = new Map<string, any>();
for (const exemplo of linhasMemoria) {
  const balde = Number.parseInt(crypto.createHash('sha256').update(`capitulo:${exemplo.capitulo}`).digest('hex').slice(0, 8), 16) % 5;
  if (balde === 0) continue;
  try {
    exemplo.categorias = JSON.parse(exemplo.categorias ?? '[]');
  } catch {
    exemplo.categorias = [];
  }
  const chave = `${exemplo.capitulo}.${exemplo.ordem}`;
  const anterior = memoriaPorFrase.get(chave);
  if (!anterior) {
    memoriaPorFrase.set(chave, exemplo);
    continue;
  }
  anterior.texto_aprovado = exemplo.texto_aprovado;
  anterior.justificativa = exemplo.justificativa ?? anterior.justificativa;
  anterior.categorias = [...new Set([...anterior.categorias, ...exemplo.categorias])];
}
const memoriaAprovada = [...memoriaPorFrase.values()].filter((e) => e.texto_rejeitado !== e.texto_aprovado);
const omega = reposPrompts.composto(db, lote.obra_id);
const obra = reposObras.obter(db, lote.obra_id);
if (!omega || !obra) throw new Error('Não foi possível congelar o prompt composto da obra.');
const config = reposConfig.obterTodas(db);
const capitulos = [...new Set(casos.map((c) => c.capitulo))].sort((a, b) => a - b);
const contexto = db.prepare(`
  SELECT c.numero capitulo, f.ordem, f.texto_zh, f.texto_pt,
         f.texto_pt_original_ia
  FROM frases f JOIN capitulos c ON c.id=f.capitulo_id
  WHERE c.obra_id=? AND c.numero=? AND f.texto_pt<>''
  ORDER BY f.ordem
`);
const ambienteBase = {
  omega: omega.texto,
  alfa: omega.nucleo ? { id: omega.nucleo.id, versao: omega.nucleo.versao } : null,
  delta: { id: omega.prompt.id, versao: omega.prompt.versao },
  temperatura_revisao: resolverTemperatura(config.temperaturas, 'revisao', obra.temperatura),
  temperatura_traducao: resolverTemperatura(config.temperaturas, 'traducao', obra.temperatura),
  thinking_traducao: obra.thinking ?? null,
  preferencias: normalizarPreferencias(reposPrompts.ativo(db, lote.obra_id)?.preferencias),
  glossario_relevante: config.glossario_relevante,
  gama: reposGlossario.listar(db, lote.obra_id),
  memoria_contrastiva: memoriaAprovada,
  contexto_capitulos: Object.fromEntries(capitulos.map((capitulo) => [String(capitulo), contexto.all(lote.obra_id, capitulo)])),
};
const ambiente = {
  ...ambienteBase,
  sha256: crypto.createHash('sha256').update(JSON.stringify(ambienteBase)).digest('hex'),
};
db.close();
const documento = {
  esquema: 'dao-tale-eval-literaria-v1',
  gerado_em: new Date().toISOString(),
  provisoria: incluirPendentes,
  aviso: incluirPendentes ? 'Referências pendentes ainda não foram aprovadas; não usar como teste final nem para promover modelo.' : null,
  lote,
  ambiente,
  politica_particao: 'SHA-256("capitulo:" + capítulo) módulo 5; capítulos inteiros ficam em uma só partição. Controles negativos são amostrados deterministicamente em cada capítulo e nunca sobrepõem referências positivas.',
  casos,
};
const serializado = JSON.stringify(documento, null, 2) + '\n';
fs.writeFileSync(saida, serializado);
console.log(JSON.stringify({
  saida,
  casos: casos.length,
  positivos: positivos.length,
  negativos: negativos.length,
  calibracao: casos.filter((c) => c.particao === 'calibracao').length,
  teste: casos.filter((c) => c.particao === 'teste').length,
  sha256: crypto.createHash('sha256').update(serializado).digest('hex'),
  provisoria: incluirPendentes,
}));
