// Perfil de idioma de origem — a metade de SERVIDOR. A metade pura (rótulos,
// casamento de termo, remontagem de parágrafo) vive em
// shared/src/idiomaOrigem.ts, porque a interface também precisa dela. As duas
// juntas são o perfil, e a regra é que nenhuma decisão de idioma more fora delas.
//
// O teste da arquitetura: somar um terceiro idioma deve ser escrever um perfil
// puro em shared e um perfil de servidor aqui — não caçar `if` pelo código.

import {
  PERFIL_INGLES,
  PERFIL_MANDARIM,
  IDIOMA_ORIGEM_PADRAO,
  ehIdiomaOrigem,
  type IdiomaOrigem,
  type PerfilIdioma,
} from '@dao-tale/shared';
import { segmentar } from '../segmentacao/segmentar.js';
import { segmentarEn } from '../segmentacao/segmentarEn.js';
import type { ResultadoSegmentacao } from '../segmentacao/segmentar.js';

/** Quais varreduras EXISTEM neste idioma. A distinção que importa: `false` aqui
 *  não é "o detector falhou" nem "deu zero" — é "esta varredura não existe para
 *  esta origem", e a tela deve dizer isso em vez de mostrar resultado vazio. */
export interface DetectoresDoIdioma {
  /** Catálogo de erros com gatilho no original. Só existe com aferição medida
   *  em corpus real (ver shared/src/catalogoErros.ts), e o corpus é por idioma. */
  catalogo: boolean;
  /** Pares original↔PT de superintensificação (revisao/sinaisBilingues.ts). */
  sinaisBilingues: boolean;
  /** Unidade de medida da origem que ficou sem converter no português. Não é
   *  privilégio do mandarim: o inglês tem pés, milhas e libras pelo mesmo motivo.
   *
   *  `regra` vem do perfil, e não de um literal no detector, porque ela é metade
   *  da chave de dispensa gravada em `estilo_ignorado`: trocar o id do mandarim
   *  por um nome genérico órfãos toda dispensa que o revisor já deu. */
  unidadesDaOrigem: { padrao: RegExp; regra: string } | null;
  /** Escrita da origem vazada para o texto em português. Só faz sentido quando
   *  as escritas diferem — entre inglês e português não há o que detectar. */
  escritaVazada: RegExp | null;
}

export interface PerfilServidor extends PerfilIdioma {
  segmentar(texto: string): ResultadoSegmentacao;
  detectores: DetectoresDoIdioma;
  /** Como o provedor Simulado inventa um termo a partir do original. Sem isto,
   *  o caminho de teste sem chave de API não produz nada útil fora do mandarim. */
  extrairTermoSimulado(texto: string, quantos: number): string[];
}

// ── Mandarim ───────────────────────────────────────────────────────────────

/** Medidas chinesas que escaparam traduzidas como explicação literal. O caso
 *  real foi 一炷香 → "tempo de queimar um bastão de incenso", embora o Alfa peça
 *  uma duração compreensível. A lista é conservadora para não acusar "qi". */
const UNIDADES_ZH =
  /(?<!\p{L})(?:\d+|um|uma|dois|duas|meio|meia)\s+(?:chi|cun|zhang|li|jin|liang|qian|shichen)(?!\p{L})|tempo de (?:queimar|uma) (?:um )?bastão de incenso/iu;

/** Faixa Han em versão global — `multiconjunto` em revisao/literaria.ts conta
 *  ocorrências, e para isso o `g` é obrigatório. Separada da `FAIXA_HAN` de
 *  shared de propósito: regex global guarda `lastIndex`, e compartilhar a mesma
 *  instância entre `.test()` e `.matchAll()` daria resultado alternado. */
const HAN_GLOBAL = /[㐀-鿿]/gu;

export const PERFIL_SERVIDOR_MANDARIM: PerfilServidor = {
  ...PERFIL_MANDARIM,
  segmentar,
  detectores: {
    catalogo: true,
    sinaisBilingues: true,
    unidadesDaOrigem: { padrao: UNIDADES_ZH, regra: 'unidade-chinesa' },
    escritaVazada: HAN_GLOBAL,
  },
  // Determinístico: os N primeiros caracteres Han. Ignora pontuação e latim,
  // que não são termo de glossário.
  extrairTermoSimulado: (texto, quantos) => [...texto].filter((c) => /[㐀-鿿]/u.test(c)).slice(0, quantos),
};

// ── Inglês ─────────────────────────────────────────────────────────────────

/** Unidades imperiais que ficaram sem converter. Mesma regra do Alfa que vale
 *  para o mandarim: o leitor brasileiro recebe grandeza compreensível, não a
 *  palavra estrangeira.
 *
 *  Ao contrário da mandarim, esta NÃO exige numeral antes. Aquela exige porque
 *  `li` também é palavra portuguesa ("eu li o livro") — sem o numeral ela
 *  acusaria meio capítulo. Nenhuma destas é palavra do português, então a
 *  própria unidade basta e o detector pega "algumas miles adiante", que a
 *  exigência de numeral deixaria passar. `acre` fica de fora justamente por ser
 *  a exceção: é palavra portuguesa, e ainda por cima nome de estado. */
const UNIDADES_EN =
  /(?<!\p{L})(?:feet|foot|inch|inches|mile|miles|yard|yards|pound|pounds|ounce|ounces|gallon|gallons)(?!\p{L})|(?<!\p{L})\d+\s*(?:°\s*F|graus\s+Fahrenheit|Fahrenheit)(?!\p{L})/iu;

export const PERFIL_SERVIDOR_INGLES: PerfilServidor = {
  ...PERFIL_INGLES,
  segmentar: segmentarEn,
  detectores: {
    // Nenhum dos dois tem corpus inglês medido ainda. É `false` explícito, com
    // lugar reservado: quando houver capítulos traduzidos,
    // server/scripts/aferir-catalogo.ts mede e isto vira `true`.
    catalogo: false,
    sinaisBilingues: false,
    unidadesDaOrigem: { padrao: UNIDADES_EN, regra: 'unidade-inglesa' },
    // Inglês e português dividem o alfabeto latino: não há escrita a vazar.
    escritaVazada: null,
  },
  // Por PALAVRA, não por caractere: um recorte de 2 caracteres do inglês é um
  // pedaço de palavra, não um termo.
  extrairTermoSimulado: (texto, quantos) => (texto.match(/\p{L}+/gu) ?? []).slice(0, quantos),
};

// ── Registro ───────────────────────────────────────────────────────────────

export const PERFIS_SERVIDOR: Record<IdiomaOrigem, PerfilServidor> = {
  zh: PERFIL_SERVIDOR_MANDARIM,
  en: PERFIL_SERVIDOR_INGLES,
};

/** Perfil de servidor, tolerante a valor solto vindo do banco: o que não for
 *  reconhecido cai no mandarim, que é o idioma de toda obra anterior aos perfis. */
export function perfilServidorDe(idioma: string | null | undefined): PerfilServidor {
  return ehIdiomaOrigem(idioma) ? PERFIS_SERVIDOR[idioma] : PERFIS_SERVIDOR[IDIOMA_ORIGEM_PADRAO];
}
