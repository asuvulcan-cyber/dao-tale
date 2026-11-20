// As checagens de partição (doc 15 §7). AVISO, NUNCA BLOQUEIO: o dono é o dono e às
// vezes quer mesmo a exceção — o que não pode é a sobreposição acontecer sem ele ver.
//
// Toda mensagem carrega o TRECHO que casou. Sem ele o aviso vira acusação abstrata que
// se aprende a ignorar; com ele, o julgamento é de um olhar. Falso positivo custa um
// aviso descartável, que é o preço certo de reconhecer tema em texto livre.

import { temasNoTexto, type Camada } from '@dao-tale/shared';
import {
  MARCADOR_DELTA,
  MARCADOR_PREFERENCIAS,
  MARCADOR_PREFERENCIAS_COMPACTAS,
  MARCADOR_PREFERENCIAS_COMPACTAS_V2,
  MARCADOR_PREFERENCIAS_COMPACTAS_V3,
  MARCADOR_PREFERENCIAS_COMPACTAS_V4,
} from '../db/promptPadraoInicial.js';

export interface AvisoCamada {
  tema: string;
  titulo: string;
  /** A camada que DEVERIA decidir este tema. */
  dono: Camada;
  mensagem: string;
  /** 0 quando o aviso é sobre o texto inteiro, não sobre uma linha. */
  linha: number;
  trecho: string;
}

const NOME_CAMADA: Record<Camada, string> = { alfa: 'Alfa', beta: 'Beta', delta: 'Delta' };

/** Temas que o texto menciona mas não são da camada em que ele está.
    Um aviso por tema — repetir a mesma acusação cinco vezes some com o sinal. */
export function avisosDaCamada(texto: string, camada: Camada): AvisoCamada[] {
  const vistos = new Set<string>();
  return temasNoTexto(texto)
    .filter((o) => o.tema.dono !== camada && !vistos.has(o.tema.id) && vistos.add(o.tema.id))
    .map((o) => ({
      tema: o.tema.id,
      titulo: o.tema.titulo,
      dono: o.tema.dono,
      mensagem: `Isto é tema de ${NOME_CAMADA[o.tema.dono]} — ${o.tema.resolucao}.`,
      linha: o.linha,
      trecho: o.trecho,
    }));
}

/**
 * Avisos de um Alfa novo: tema de outra camada, e marcador perdido.
 *
 * O marcador ausente é o defeito que produziu o sintoma de 2026-08-05. Um Alfa sem
 * `{{PREFERENCIAS_OBRA}}` faz a composição descartar as chaves EM SILÊNCIO: a obra tem
 * `pensamento_tempo: "original"` gravado e recebe "sempre no presente" do núcleo. Nada
 * quebra, nada avisa, e o texto sai errado por meses.
 */
export function avisosDeAlfa(conteudo: string): AvisoCamada[] {
  const avisos = avisosDaCamada(conteudo, 'alfa');
  if (
    !conteudo.includes(MARCADOR_PREFERENCIAS) &&
    !conteudo.includes(MARCADOR_PREFERENCIAS_COMPACTAS) &&
    !conteudo.includes(MARCADOR_PREFERENCIAS_COMPACTAS_V2) &&
    !conteudo.includes(MARCADOR_PREFERENCIAS_COMPACTAS_V3) &&
    !conteudo.includes(MARCADOR_PREFERENCIAS_COMPACTAS_V4)
  ) {
    avisos.push({
      tema: 'marcador_preferencias',
      titulo: 'Marcador de preferências ausente',
      dono: 'beta',
      mensagem: `Sem um marcador de preferências reconhecido, as preferências de estilo das obras serão ignoradas em silêncio ao compor o Ômega.`,
      linha: 0,
      trecho: '',
    });
  }
  if (!conteudo.includes(MARCADOR_DELTA)) {
    avisos.push({
      tema: 'marcador_delta',
      titulo: 'Marcador do delta ausente',
      dono: 'delta',
      mensagem: `Sem ${MARCADOR_DELTA}, as diretrizes de cada obra são anexadas no fim, fora da posição prevista.`,
      linha: 0,
      trecho: '',
    });
  }
  return avisos;
}
