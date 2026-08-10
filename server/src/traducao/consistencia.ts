import type { EntradaGlossario, Frase } from '@dao-tale/shared';
import { contemTermoFlexionado } from './flexao.js';
import type { BancoDados } from '../db/index.js';
import { reposCapitulos, reposConsistencia, reposFrases, reposGlossario } from '../db/repos.js';

// Varredura reversa de consistência do glossário (doc 05 §4.2, D5): para cada
// termo do glossário presente no chinês de uma frase traduzida, a tradução PT
// deve conter o termo canônico. Função pura, sem IA — usada pela rota manual e
// pela varredura automática ao concluir o capítulo (doc 09 §3).

export interface ViolacaoConsistencia {
  frase_id: number;
  ordem: number;
  termo_zh: string;
  termo_pt: string;
  texto_zh: string;
  texto_pt: string;
}

export interface ResultadoConsistencia {
  ocorrencias: number;
  violacoes: ViolacaoConsistencia[];
  termos_curtos_ignorados: number;
}

const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

/** Pares (frase, termo) que o revisor já conferiu e dispensou. */
export type ChaveIgnorada = `${number}|${string}`;
export const chaveIgnorada = (fraseId: number, termoZh: string): ChaveIgnorada => `${fraseId}|${termoZh}`;

export function varrerConsistencia(
  frases: Frase[],
  glossario: EntradaGlossario[],
  ignoradas: ReadonlySet<string> = new Set(),
): ResultadoConsistencia {
  // Dois filtros contra falso positivo: termos de 1 caractere (aparecem dentro
  // de dezenas de palavras comuns) e um termo que é parte de outro termo mais
  // longo também presente na frase (coberto pelo mais longo).
  const curtos = new Set(glossario.filter((g) => [...g.termo_zh].length < 2).map((g) => g.termo_zh));
  const utilizaveis = glossario.filter((g) => !curtos.has(g.termo_zh));

  const violacoes: ViolacaoConsistencia[] = [];
  let ocorrencias = 0;

  for (const f of frases) {
    if (f.status_traducao !== 'traduzida') continue;
    const presentes = utilizaveis.filter((g) => f.texto_zh.includes(g.termo_zh));
    for (const g of presentes) {
      if (presentes.some((outro) => outro.termo_zh !== g.termo_zh && outro.termo_zh.includes(g.termo_zh))) continue;
      ocorrencias++;
      // Dispensada pelo revisor: nem toda ausência é erro. Quando o referente
      // já está estabelecido, o português omite em vez de repetir.
      if (ignoradas.has(chaveIgnorada(f.id, g.termo_zh))) continue;
      if (!contemTermoFlexionado(f.texto_pt, g.termo_pt)) {
        violacoes.push({
          frase_id: f.id,
          ordem: f.ordem,
          termo_zh: g.termo_zh,
          termo_pt: g.termo_pt,
          texto_zh: f.texto_zh,
          texto_pt: f.texto_pt,
        });
      }
    }
  }

  return { ocorrencias, violacoes, termos_curtos_ignorados: curtos.size };
}

/**
 * Recalcula `capitulos.consistencia_violacoes` de todos os capítulos da obra.
 *
 * Sem isto, o número exibido responde a uma pergunta feita ANTES de o glossário
 * mudar: cadastra-se um termo e os capítulos seguem mostrando o "0 violações"
 * calculado quando o termo não existia. Zero calculado cedo demais é pior que
 * nenhum número, porque parece resposta.
 *
 * Custa 10–38 ms na obra inteira (medido: 561 frases, glossário de 57 a 1500
 * termos), então recalcular vale mais que inventar um estado "precisa reconferir".
 * Respeita as dispensas do revisor.
 *
 * Fica neste módulo (e não em `repos.ts`, ao lado de `definirConsistencia`)
 * porque importar `db/repos.js` aqui não fecha ciclo algum: nada em `db/`
 * importa deste arquivo (só testes o fazem, e testes não contam para o grafo
 * de módulos em produção) — conferido por varredura estática do grafo de
 * imports antes de escrever isto, e reconfirmado pelo typecheck. `varrerConsistencia`
 * acima continua pura e sem tocar banco; só esta função nova, que orquestra
 * banco + varredura, ganha a dependência.
 */
export function recalcularConsistenciaDaObra(db: BancoDados, obraId: number): void {
  const frases = reposFrases.listarPorObra(db, obraId);
  const glossario = reposGlossario.listar(db, obraId);
  const ignoradas = reposConsistencia.ignoradasDaObra(db, obraId);
  const porCapitulo = new Map<number, typeof frases>();
  for (const f of frases) porCapitulo.set(f.capitulo_id, [...(porCapitulo.get(f.capitulo_id) ?? []), f]);
  for (const [capituloId, doCapitulo] of porCapitulo) {
    const r = varrerConsistencia(doCapitulo, glossario, ignoradas);
    reposCapitulos.definirConsistencia(db, capituloId, r.violacoes.length);
  }
}
