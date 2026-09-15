// Auditoria somente de leitura da evolução literária por capítulo.
// Uso: node server/scripts/auditar-qualidade-historica.mjs BANCO [SAIDA.json]

import fs from 'node:fs';
import Database from 'better-sqlite3';

const [banco, saida] = process.argv.slice(2);
if (!banco) {
  console.error('Uso: node server/scripts/auditar-qualidade-historica.mjs BANCO [SAIDA.json]');
  process.exit(2);
}

const db = new Database(banco, { readonly: true, fileMustExist: true });

function distancia(a, b) {
  const x = [...(a ?? '')];
  const y = [...(b ?? '')];
  if (!x.length) return y.length;
  if (!y.length) return x.length;
  let anterior = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const atual = [i];
    for (let j = 1; j <= y.length; j++) {
      atual[j] = Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    anterior = atual;
  }
  return anterior[y.length];
}

const palavrasFormais = /\b(?:contudo|todavia|entretanto|ademais|outrossim|destarte|conquanto|porquanto|quiçá|deveras|doravante|não obstante)\b/giu;
const tinhaPart = /\b(?:tinha|tinham|havia|haviam)\s+(?:\p{L}+(?:ado|ido)|feito|dito|visto|posto|escrito|aberto|morto|preso)\b/giu;
const perifrases = /\b(?:tornou|começou|passou|pôs-se|veio)\s+a\s+\p{L}+/giu;
const contar = (texto, re) => [...texto.matchAll(re)].length;
const palavras = (texto) => texto.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
const taxa = (n, d, escala = 100) => d ? Number((n * escala / d).toFixed(2)) : 0;
const naoMqp = new Set([
  'agora','embora','outrora','hora','senhora','primeira','inteira','maneira','beira','poeira','bandeira','madeira','fronteira','dianteira','carreira','cadeira','esteira','liteira','soleira','barreira','figueira','romãzeira',
  'voadora','ameaçadora','protetora','promissora','perturbadora','lutadora','interesseira','grosseira','estrangeira','esmagadora','assustadora','carnívora','verdadeira','severa','sincera','clara','rara','fera','mera','esfera','véspera','têmpora','sujeira','besteira','mentira','máscara','espera','adora','separa','dispara','demora','mira','tira','vira','para',
]);
function contarMqpSuspeito(texto) {
  return (texto.match(/\b\p{L}{2,}(?:ara|era|ira|ora|íra)\b/giu) ?? [])
    .filter((p) => !naoMqp.has(p.toLocaleLowerCase('pt-BR'))).length;
}

const capitulos = db.prepare(`
  SELECT c.id, c.numero, c.criado_em, c.atualizado_em, c.provedor, c.modelo,
         p.versao delta_versao, n.versao alfa_versao
  FROM capitulos c
  LEFT JOIN prompts p ON p.id=c.prompt_id
  LEFT JOIN prompt_padrao n ON n.id=c.nucleo_id
  WHERE c.obra_id=1 ORDER BY c.numero
`).all();
const frasesStmt = db.prepare(`
  SELECT id, texto_pt_original_ia original, texto_pt vigente, editado_manualmente
  FROM frases WHERE capitulo_id=? ORDER BY ordem
`);
const categoriasStmt = db.prepare(`
  SELECT r.categorias FROM revisoes_literarias r
  JOIN frases f ON f.id=r.frase_id
  WHERE f.capitulo_id=? AND r.status='aprovada'
`);
const eventosStmt = db.prepare(`
  SELECT papel, COUNT(*) n, SUM(COALESCE(tokens_entrada,0)) entrada,
         SUM(COALESCE(tokens_saida,0)) saida
  FROM eventos_ia WHERE capitulo_id=? GROUP BY papel
`);

const linhas = capitulos.map((capitulo) => {
  const frases = frasesStmt.all(capitulo.id);
  const comparaveis = frases.filter((f) => f.original != null && f.original !== '');
  const textoOriginal = comparaveis.map((f) => f.original).join('\n');
  const textoVigente = comparaveis.map((f) => f.vigente).join('\n');
  const charsBase = Math.max(1, [...textoOriginal].length, [...textoVigente].length);
  const cats = {};
  for (const linha of categoriasStmt.all(capitulo.id)) {
    let lista = [];
    try { lista = JSON.parse(linha.categorias); } catch { /* dado histórico inválido fica fora */ }
    for (const categoria of lista) cats[categoria] = (cats[categoria] ?? 0) + 1;
  }
  const totalPalavras = palavras(textoVigente);
  return {
    capitulo: capitulo.numero,
    criado_em: capitulo.criado_em,
    atualizado_em: capitulo.atualizado_em,
    traducao: { provedor: capitulo.provedor, modelo: capitulo.modelo, alfa: capitulo.alfa_versao, delta: capitulo.delta_versao },
    frases: frases.length,
    frases_com_primeira_ia: comparaveis.length,
    editadas_marcadas: frases.filter((f) => f.editado_manualmente).length,
    primeira_ia_diferente_do_vigente: comparaveis.filter((f) => f.original.trim() !== f.vigente.trim()).length,
    edicao_humana_pct: taxa(comparaveis.filter((f) => f.original.trim() !== f.vigente.trim()).length, comparaveis.length),
    distancia_normalizada_primeira_ia_vigente: Number((distancia(textoOriginal, textoVigente) / charsBase).toFixed(4)),
    palavras_vigentes: totalPalavras,
    marcadores_por_mil_palavras: {
      lexico_formal: taxa(contar(textoVigente, palavrasFormais), totalPalavras, 1000),
      mais_que_perfeito_suspeito: taxa(contarMqpSuspeito(textoVigente), totalPalavras, 1000),
      tinha_mais_participio: taxa(contar(textoVigente, tinhaPart), totalPalavras, 1000),
      perifrases_inicio_aspectual: taxa(contar(textoVigente, perifrases), totalPalavras, 1000),
    },
    revisoes_literarias_aprovadas: categoriasStmt.all(capitulo.id).length,
    categorias_revisao: cats,
    eventos_ia: eventosStmt.all(capitulo.id),
  };
});

const documento = {
  esquema: 'dao-tale-auditoria-qualidade-historica-v1',
  somente_leitura: true,
  gerado_em: new Date().toISOString(),
  observacoes: [
    'Distância textual mede magnitude de intervenção, não qualidade por si só.',
    'Marcadores são alarmes comparáveis, não erros automáticos; o chinês decide o tom local.',
    'Edição humana é texto vigente diferente da primeira saída da IA entre frases comparáveis.',
  ],
  capitulos: linhas,
};
const serializado = JSON.stringify(documento, null, 2) + '\n';
if (saida) fs.writeFileSync(saida, serializado);
else process.stdout.write(serializado);
db.close();
