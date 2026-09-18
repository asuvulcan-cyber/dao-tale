import type { EntradaGlossario, PreferenciasEstilo } from '@dao-tale/shared';
import { analisarEstilo } from '../traducao/estiloViolacoes.js';
import { varrerCatalogo } from '../traducao/catalogoZhPt.js';
import { contemTermoFlexionado } from '../traducao/flexao.js';
import { detectarSinaisBilingues } from './sinaisBilingues.js';

export type FenomenoSeletivo =
  | 'regra-deterministica' | 'gama' | 'literalidade' | 'registro'
  | 'ritmo' | 'complexidade' | 'capitalizacao-contextual' | 'sentido-contextual';

export interface FraseDetectorSeletivo {
  id: number;
  ordem: number;
  texto_zh: string;
  texto_pt: string;
}

export interface DiagnosticoSeletivo {
  ordem: number;
  prioridade: 'alta' | 'media';
  foco: 'fidelidade' | 'tom-naturalidade';
  fenomenos: FenomenoSeletivo[];
  razoes: string[];
}

const REGISTRO_SUSPEITO = /\b(?:nutrindo|alimentando|tais relatos|desferiu|permaneceu|contemplou|fitou|tragicamente|inequívoc[oa]s?|doravante|deveras|destarte|outrossim|quiçá|mirrada?|esquálid[oa]s?|bradou|insuflou|altivez|ermos?|paragens?|candura|vazão|impotência|obstinação|evocá-las?)\b/giu;
// Anterioridade composta isolada não demonstra defeito de ritmo.
const PERIFRASES = /\b(?:tornou a|passou a|pôs-se a)\b/giu;
const LITERALISMOS = /\b(?:kowtow|hehei|temporada fraca|personagem de mito|neste mundo|de forma alguma|ao alcance (?:da|de sua) visão|cama (?:aquecida )?de terra|tendo levado a melhor com a língua|pretensões indevidas|tomou a iniciativa de|tom (?:dele|dela|de \p{L}+) era afirmativo|não era,? porém,? pequena|perfeito ignorante|sem paradeiro|tinha pouca garantia|bastasse passar|dessem para ser alavancad[oa]s?|se dedicavam a aguardar|rebeldes à disciplina|fera jovem ainda presa à infância|com gesto brusco|à maneira da|respiração interna em desvio|local muito bem oculto|grandes desgraças)\b/giu;
const POSTO_CAPITALIZADO = /\b(?:Assassinos?|Espadachins?|Espectros?|Homens? de Sabre)\b/gu;

function adicionar(
  mapa: Map<number, DiagnosticoSeletivo>, ordem: number, foco: DiagnosticoSeletivo['foco'],
  fenomeno: FenomenoSeletivo, razao: string, prioridade: DiagnosticoSeletivo['prioridade'] = 'media',
): void {
  const atual = mapa.get(ordem) ?? { ordem, foco, prioridade, fenomenos: [], razoes: [] };
  if (!atual.fenomenos.includes(fenomeno)) atual.fenomenos.push(fenomeno);
  if (!atual.razoes.includes(razao)) atual.razoes.push(razao);
  if (foco === 'fidelidade') atual.foco = 'fidelidade';
  if (prioridade === 'alta') atual.prioridade = 'alta';
  mapa.set(ordem, atual);
}

/** Triagem conservadora: acusa para revisão; nunca reescreve nem publica. */
export function detectarRevisaoSeletiva(
  frases: FraseDetectorSeletivo[], prefs: PreferenciasEstilo, glossario: EntradaGlossario[],
): DiagnosticoSeletivo[] {
  const mapa = new Map<number, DiagnosticoSeletivo>();
  const porOrdem = new Map(frases.map((f) => [f.ordem, f]));

  for (const v of analisarEstilo(frases, prefs).violacoes) {
    // Continua no relatório de estilo, mas não paga revisão literária por aspas.
    if (v.regra === 'aspas-nao-retas') continue;
    adicionar(mapa, v.ordem, 'tom-naturalidade', 'regra-deterministica', `${v.regra}: ${v.trecho}`, 'alta');
  }
  for (const v of varrerCatalogo(frases.map((f) => ({ ...f, status_traducao: 'traduzida' }))).violacoes) {
    adicionar(mapa, v.ordem, 'fidelidade', 'regra-deterministica', `${v.entrada_id}: ${v.trecho_pt}`, 'alta');
  }

  for (const frase of frases) {
    for (const sinal of detectarSinaisBilingues(frase.texto_zh, frase.texto_pt)) {
      adicionar(mapa, frase.ordem, 'fidelidade', 'sentido-contextual', `${sinal.id}: ${sinal.razao}`);
    }
    const repeticao = frase.texto_pt.match(/\bcarne em carne viva\b/iu);
    if (repeticao) adicionar(mapa, frase.ordem, 'tom-naturalidade', 'literalidade', `Conferir repetição lexical “${repeticao[0]}”; pode ser redundância, não substituir automaticamente.`);
    const presentes = glossario.filter((g) => !g.ambiguo && [...g.termo_zh].length >= 2 && frase.texto_zh.includes(g.termo_zh));
    for (const termo of presentes) {
      if (presentes.some((outro) => outro.termo_zh !== termo.termo_zh && outro.termo_zh.includes(termo.termo_zh))) continue;
      if ((termo.especie ?? 'identidade') !== 'identidade') continue;
      if (!contemTermoFlexionado(frase.texto_pt, termo.termo_pt)) {
        adicionar(mapa, frase.ordem, 'fidelidade', 'gama', `Confirmar ausência de “${termo.termo_pt}” para ${termo.termo_zh}.`, 'alta');
      }
    }
    for (const m of frase.texto_pt.matchAll(LITERALISMOS)) adicionar(mapa, frase.ordem, 'tom-naturalidade', 'literalidade', m[0]);
    for (const m of frase.texto_pt.matchAll(REGISTRO_SUSPEITO)) adicionar(mapa, frase.ordem, 'tom-naturalidade', 'registro', m[0]);
    for (const m of frase.texto_pt.matchAll(PERIFRASES)) adicionar(mapa, frase.ordem, 'tom-naturalidade', 'ritmo', m[0]);
    for (const m of frase.texto_pt.matchAll(POSTO_CAPITALIZADO)) adicionar(mapa, frase.ordem, 'fidelidade', 'capitalizacao-contextual', `Confirmar se “${m[0]}” é posto/título neste contexto.`);
    const marcas = (frase.texto_pt.match(/[;:—]/g) ?? []).length;
    if (frase.texto_pt.length >= 260 || (frase.texto_pt.length >= 190 && marcas >= 3)) {
      adicionar(mapa, frase.ordem, 'tom-naturalidade', 'complexidade', `${frase.texto_pt.length} caracteres e ${marcas} marcas sintáticas.`);
    }
  }

  return [...mapa.values()]
    .filter((d) => porOrdem.has(d.ordem))
    // Comprimento isolado não demonstra defeito. Nos evals cegos, esses alvos
    // consumiram revisão e induziram paráfrases/capitalizações sem ganho. A
    // complexidade só reforça outro sinal concreto de literalidade, registro etc.
    // Capitalização isolada é ambígua (inclusive quando o Gama autoriza um posto).
    // Serve de contexto quando outro sinal já exige revisão, não de gatilho pago.
    .filter((d) => d.fenomenos.some((f) => f !== 'complexidade' && f !== 'capitalizacao-contextual'))
    .sort((a, b) => a.ordem - b.ordem);
}
