import { remontarParagrafos, STATUS_PUBLICO, type CapituloPublico, type CapituloPublicoDetalhe, type Frase, type ObraPublica } from '@dao-tale/shared';
import type { BancoDados } from './index.js';

// Consultas da vitrine pública (doc 14). Vivem em arquivo próprio, longe do
// `repos.ts`, por um motivo de segurança e não de organização: aqui é a única
// porta que responde sem sessão, e ela precisa caber inteira numa tela para
// poder ser conferida. Nenhuma função daqui aceita "traga tudo" — cada uma
// carrega `publica = 1` e `status = 'finalizado'` no próprio SQL.
//
// Regra de ouro: NUNCA usar `SELECT *` nem as colunas do repositório principal.
// Uma coluna nova em `obras` (chave, custo, nota interna) apareceria de graça.

/** Filtro repetido em toda consulta. Escrito uma vez, mas conferido no SQL de
 *  cada função — a duplicação é intencional: um JOIN esquecido é justamente o
 *  tipo de erro que "reaproveitar o filtro" esconde. */
const SO_PUBLICAS = `o.publica = 1`;
const SO_FINALIZADOS = `c.status = '${STATUS_PUBLICO}'`;

export const reposPublico = {
  /** Obras publicadas que têm ao menos um capítulo finalizado. Uma obra marcada
   *  como pública mas ainda sem capítulo pronto não aparece: a vitrine mostra
   *  leitura, não promessa. */
  obras(db: BancoDados): ObraPublica[] {
    const linhas = db
      .prepare(
        `SELECT o.id, o.titulo, o.titulo_original, o.autor, o.sinopse, o.tags,
                (o.capa IS NOT NULL) AS tem_capa,
                (SELECT COUNT(*) FROM capitulos c WHERE c.obra_id = o.id AND ${SO_FINALIZADOS}) AS capitulos_publicos
           FROM obras o
          WHERE ${SO_PUBLICAS}
            AND EXISTS (SELECT 1 FROM capitulos c WHERE c.obra_id = o.id AND ${SO_FINALIZADOS})
          ORDER BY o.titulo COLLATE NOCASE`,
      )
      .all() as any[];
    return linhas.map(paraObraPublica);
  },

  obra(db: BancoDados, id: number): ObraPublica | undefined {
    const linha = db
      .prepare(
        `SELECT o.id, o.titulo, o.titulo_original, o.autor, o.sinopse, o.tags,
                (o.capa IS NOT NULL) AS tem_capa,
                (SELECT COUNT(*) FROM capitulos c WHERE c.obra_id = o.id AND ${SO_FINALIZADOS}) AS capitulos_publicos
           FROM obras o
          WHERE o.id = ? AND ${SO_PUBLICAS}
            AND EXISTS (SELECT 1 FROM capitulos c WHERE c.obra_id = o.id AND ${SO_FINALIZADOS})`,
      )
      .get(id) as any;
    return linha ? paraObraPublica(linha) : undefined;
  },

  /** Capa de obra pública. Separada da rota autenticada porque aquela serve
   *  qualquer obra pelo id. */
  capa(db: BancoDados, id: number): { capa: Buffer; mime: string } | undefined {
    const linha = db
      .prepare(
        `SELECT o.capa, o.capa_mime AS mime FROM obras o
          WHERE o.id = ? AND ${SO_PUBLICAS} AND o.capa IS NOT NULL AND o.capa_mime IS NOT NULL`,
      )
      .get(id) as { capa: Buffer; mime: string } | undefined;
    return linha ?? undefined;
  },

  /** Sumário: só a numeração e o título em português. Nada de status, contagem
   *  de frases ou apontamentos de QA — o visitante não precisa saber que existe
   *  uma bancada do outro lado. */
  capitulos(db: BancoDados, obraId: number): CapituloPublico[] {
    return db
      .prepare(
        `SELECT c.numero, c.titulo_pt AS titulo
           FROM capitulos c JOIN obras o ON o.id = c.obra_id
          WHERE c.obra_id = ? AND ${SO_PUBLICAS} AND ${SO_FINALIZADOS}
          ORDER BY c.numero`,
      )
      .all(obraId) as CapituloPublico[];
  },

  /** Um capítulo, endereçado por NÚMERO dentro da obra — nunca por id interno.
   *  Assim não existe URL que dependa de adivinhar chave primária, e o id de um
   *  capítulo privado não é sequer um parâmetro aceito. */
  capitulo(db: BancoDados, obraId: number, numero: number): CapituloPublicoDetalhe | undefined {
    const cap = db
      .prepare(
        `SELECT c.id, c.numero, c.titulo_pt AS titulo
           FROM capitulos c JOIN obras o ON o.id = c.obra_id
          WHERE c.obra_id = ? AND c.numero = ? AND ${SO_PUBLICAS} AND ${SO_FINALIZADOS}`,
      )
      .get(obraId, numero) as { id: number; numero: number; titulo: string | null } | undefined;
    if (!cap) return undefined;

    const frases = db
      .prepare(
        `SELECT ordem, paragrafo, '' AS texto_zh, texto_pt
           FROM frases WHERE capitulo_id = ? ORDER BY ordem`,
      )
      .all(cap.id) as Frase[];

    // Remonta aqui, no servidor: o cliente público recebe texto pronto, não a
    // estrutura de frases (que é o material de trabalho da bancada).
    const paragrafos = remontarParagrafos(frases)
      .map((p) => p.pt.trim())
      .filter((p) => p !== '');

    return { numero: cap.numero, titulo: cap.titulo, paragrafos };
  },
};

function paraObraPublica(linha: any): ObraPublica {
  return {
    id: linha.id,
    titulo: linha.titulo,
    titulo_original: linha.titulo_original,
    autor: linha.autor,
    sinopse: linha.sinopse,
    tags: JSON.parse((linha.tags as string) || '[]'),
    tem_capa: !!linha.tem_capa,
    capitulos_publicos: linha.capitulos_publicos,
  };
}
