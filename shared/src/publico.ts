import type { StatusCapitulo } from './index.js';

// Vitrine pública (doc 14). Estes tipos existem SEPARADOS de `Obra`, `Capitulo`
// e `Frase` de propósito, e a tentação de reaproveitar aqueles deve ser
// resistida: eles carregam provedor, modelo, temperatura, thinking, fase de
// tradução, ids internos e o texto de origem. Um campo novo acrescentado lá
// vazaria aqui sem ninguém perceber. O que a vitrine devolve é o que está
// escrito abaixo, e nada mais — a lista é auditável de uma olhada.

/** Único status que vai para a rua. Não é `STATUS_LEGIVEIS` (que inclui
 *  'traduzido' e 'revisado'): 'finalizado' é o que o usuário marca depois de
 *  passar o olho, e publicar é justamente afirmar "isto está pronto". */
export const STATUS_PUBLICO: StatusCapitulo = 'finalizado';

export interface ObraPublica {
  id: number;
  titulo: string;
  titulo_original: string | null;
  autor: string | null;
  sinopse: string | null;
  tags: string[];
  tem_capa: boolean;
  /** Quantos capítulos estão publicados — nunca o total da obra, que revelaria
   *  quanto material inédito existe na bancada. */
  capitulos_publicos: number;
}

export interface CapituloPublico {
  numero: number;
  /** Título em português. O original em chinês fica na bancada. */
  titulo: string | null;
}

export interface CapituloPublicoDetalhe extends CapituloPublico {
  /** Parágrafos já remontados e prontos para render. Só português: sem frases,
   *  sem ids, sem status, sem o texto de origem. */
  paragrafos: string[];
}
