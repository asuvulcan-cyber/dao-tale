import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { caminhoBanco } from '../src/config.js';
import { propostaPodeIrAoStaging, validarPropostaLiteraria } from '../src/revisao/literaria.js';
import type { EntradaGlossario } from '@dao-tale/shared';

type PropostaFonte = { ordem: number; texto: string; justificativa: string };
type Frase = {
  id: number;
  ordem: number;
  paragrafo: number;
  texto_zh: string;
  texto_pt: string;
  texto_pt_original_ia: string | null;
};

const diretorio = process.argv[2];
if (!diretorio) {
  console.error('Uso: tsx server/scripts/registrar-segunda-revisao.ts DIRETORIO_PROPOSTAS');
  process.exit(2);
}

const db = new Database(caminhoBanco(), { fileMustExist: true });
db.pragma('foreign_keys = ON');
const rotulo = 'Segunda revisão integral 0–18 · tom local do original';
const criterios = [
  'O chinês é a autoridade para sentido, registro, ritmo, densidade, distância emocional e voz local.',
  'A redação em PT-BR deve ser natural e fluida, sem soar traduzida.',
  'Não simplificar, modernizar, formalizar, ornamentar ou uniformizar o tom sem evidência local no original.',
  'Comparação feita contra o texto vigente após a primeira revisão e as edições humanas; nenhuma proposta altera o publicado antes de aprovação.',
].join('\n');

const obra = db.prepare("SELECT id FROM obras WHERE titulo='O Sutra dos Mortos'").get() as { id: number } | undefined;
if (!obra) throw new Error('Obra não encontrada.');
const existente = db.prepare('SELECT id FROM revisao_literaria_lotes WHERE obra_id=? AND rotulo=?').get(obra.id, rotulo) as
  | { id: number }
  | undefined;

const glossario = db.prepare('SELECT * FROM glossario WHERE obra_id=? ORDER BY id').all(obra.id) as EntradaGlossario[];
const capitulos = db.prepare('SELECT id, numero FROM capitulos WHERE obra_id=? AND numero BETWEEN 0 AND 18 ORDER BY numero').all(obra.id) as {
  id: number;
  numero: number;
}[];
if (capitulos.length !== 19) throw new Error(`Esperados 19 capítulos (0–18), encontrados ${capitulos.length}.`);

function normalizarAspas(texto: string): string {
  return texto.replace(/[“”]/g, '"');
}

function categorias(proposta: PropostaFonte): string[] {
  const pista = `${proposta.justificativa} ${proposta.texto}`.toLowerCase();
  const resultado = new Set<string>(['fidelidade', 'naturalidade']);
  if (/tom|registro|ritmo|cadência|tique|solene|formal|repet|encadeamento/.test(pista)) resultado.add('ritmo');
  if (/termo|palavra|lexic|colocaç|idiom|calque|expressão/.test(pista)) resultado.add('lexico');
  if (/fala|diálogo|interjeição|risada|dicendi|oral|juramento/.test(pista)) resultado.add('dialogo');
  if (/aspas|itálico|pontuação|concordância|regência/.test(pista)) resultado.add('tipografia');
  if (/内息|内功|少年第|少年|gama|glossário|posto|nome próprio/.test(pista)) resultado.add('gama');
  return [...resultado];
}

const prepararFrases = db.prepare(
  'SELECT id, ordem, paragrafo, texto_zh, texto_pt, texto_pt_original_ia FROM frases WHERE capitulo_id=? ORDER BY ordem',
);
const inserirLote = db.prepare('INSERT INTO revisao_literaria_lotes (obra_id, rotulo, criterios) VALUES (?, ?, ?)');
const inserir = db.prepare(`
  INSERT INTO revisoes_literarias
    (lote_id, frase_id, texto_vigente_base, texto_revisado, justificativa, categorias)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const resultado = db.transaction(() => {
  if (existente) {
    const quantidade = (db.prepare('SELECT COUNT(*) n FROM revisoes_literarias WHERE lote_id=?').get(existente.id) as { n: number }).n;
    return { loteId: existente.id, propostas: quantidade, existente: true };
  }
  const loteId = Number(inserirLote.run(obra.id, rotulo, criterios).lastInsertRowid);
  let total = 0;
  for (const capitulo of capitulos) {
    const arquivo = path.join(diretorio, `segunda-propostas-cap${capitulo.numero}.json`);
    const propostas = JSON.parse(fs.readFileSync(arquivo, 'utf8')) as PropostaFonte[];
    const frases = prepararFrases.all(capitulo.id) as Frase[];
    const porOrdem = new Map(frases.map((frase) => [frase.ordem, frase]));
    const ordens = new Set<number>();
    for (const fonte of propostas) {
      if (ordens.has(fonte.ordem)) throw new Error(`Proposta duplicada: ${capitulo.numero}.${fonte.ordem}`);
      ordens.add(fonte.ordem);
      const frase = porOrdem.get(fonte.ordem);
      if (!frase) throw new Error(`Frase inexistente: ${capitulo.numero}.${fonte.ordem}`);
      const indice = frases.findIndex((item) => item.id === frase.id);
      const anterior = indice > 0 ? frases[indice - 1] : null;
      const inicioParagrafo = indice === 0 || anterior?.paragrafo !== frase.paragrafo;
      const textoRevisado = normalizarAspas(fonte.texto.trim());
      if (textoRevisado === frase.texto_pt) throw new Error(`Proposta sem mudança: ${capitulo.numero}.${fonte.ordem}`);
      const travas = validarPropostaLiteraria(
        {
          ...frase,
          inicio_paragrafo: inicioParagrafo,
          apos_fala_em_outro_paragrafo: Boolean(
            inicioParagrafo && anterior && /^[\s*_]*["“].*["”][\s*_]*$/su.test(anterior.texto_pt.trim()),
          ),
        },
        {
          ordem: fonte.ordem,
          texto_revisado: textoRevisado,
          justificativa: fonte.justificativa,
          categorias: categorias(fonte) as never,
          confianca: 'alta',
        },
        glossario,
      );
      const bloqueios = travas.filter((trava) => trava.gravidade === 'bloqueio');
      if (!propostaPodeIrAoStaging(travas)) {
        throw new Error(`${capitulo.numero}.${fonte.ordem} bloqueada: ${bloqueios.map((item) => item.mensagem).join(' | ')}`);
      }
      inserir.run(
        loteId,
        frase.id,
        frase.texto_pt,
        textoRevisado,
        fonte.justificativa,
        JSON.stringify(categorias(fonte)),
      );
      total += 1;
    }
  }
  return { loteId, propostas: total, existente: false };
})();

const publicadosAlterados = (db.prepare(`
  SELECT COUNT(*) n
  FROM revisoes_literarias r JOIN frases f ON f.id=r.frase_id
  WHERE r.lote_id=? AND f.texto_pt<>r.texto_vigente_base
`).get(resultado.loteId) as { n: number }).n;
const estados = db.prepare('SELECT status, COUNT(*) n FROM revisoes_literarias WHERE lote_id=? GROUP BY status').all(resultado.loteId);
console.log(JSON.stringify({ ...resultado, estados, publicadosAlterados }, null, 2));
db.close();
