import type { PreferenciasEstilo } from '@dao-tale/shared';

// Contagem de violações das preferências de estilo da obra, por varredura de
// texto — sem IA, sem custo, determinística.
//
// Por que existe: no prólogo da 死人经 o mais-que-perfeito simples apareceu 9
// vezes, e a distribuição contou a história toda — ZERO nas frases 0–43, NOVE
// nas 44–75, todas dentro de uma única resposta de 32 mil tokens. Regra ambígua
// erra desde o começo, espalhado; isso era decaimento de aderência ao longo de
// uma geração longa. Sem contar e sem olhar ONDE caiu, a conclusão natural teria
// sido "a regra não está clara" — e mexer no prompt não resolveria nada.
//
// Serve para comparar com número, e não com impressão: bloco grande vs. pequeno,
// thinking ligado vs. desligado, modelo A vs. modelo B.

export interface Violacao {
  ordem: number;
  regra: string;
  trecho: string;
}

export interface RelatorioEstilo {
  frases_total: number;
  violacoes: Violacao[];
  /** Violações por terço do capítulo: expõe decaimento ao longo da geração.
   *  Concentração no fim acusa bloco grande demais, não regra mal escrita. */
  por_terco: [number, number, number];
}

/** Palavras que terminam em -ara/-era/-ira/-ora/-íra sem serem mais-que-perfeito.
 *  Lista de substantivos/adjetivos comuns — o que escapar aqui vira falso
 *  positivo visível no relatório, nunca correção automática silenciosa. */
const NAO_VERBOS = new Set([
  'agora', 'hora', 'obra', 'sombra', 'palavra', 'fora', 'pedra', 'terra', 'guerra', 'madeira',
  'maneira', 'primeira', 'beira', 'carreira', 'fronteira', 'poeira', 'caveira', 'besteira',
  'verdadeira', 'soleira', 'cara', 'clara', 'rara', 'vara', 'cera', 'fera', 'mera', 'severa',
  'mira', 'sobra', 'cobra', 'cabeceira', 'bandeira', 'inteira', 'cegueira', 'escora', 'demora',
  'aurora', 'melhora', 'senhora', 'lavoura', 'figura', 'criatura', 'espera', 'quimera', 'pantera',
  'caldeira', 'cadeira', 'barreira', 'canseira', 'maluqueira', 'brincadeira', 'companheira',
  // Curtas que o {2,} passou a alcançar: presente de -arar/-erar/-irar e nomes.
  'clara', 'chora', 'cora', 'aflora', 'ignora', 'adora', 'devora', 'implora', 'explora',
  'amara', 'avara', 'seara', 'feira', 'meira', 'peira', 'ceara', 'apara', 'jarra',
  'espera', 'prepara', 'separa', 'compara', 'repara', 'dispara', 'ampara', 'declara',
  'atira', 'retira', 'admira', 'aspira', 'respira', 'inspira', 'expira', 'suspira',
  'conspira', 'transpira', 'delira', 'gira', 'vira', 'mira', 'tira', 'para', 'hora',
  // Conjunções e advérbios em -ora, que o {2,} passou a alcançar.
  'embora', 'outrora', 'agora', 'doravante', 'penhora', 'demora', 'melhora', 'piora',
  // Árvores e plantas em -eira/-zeira: classe produtiva, então cabe uma lista.
  // "romãzeira" apareceu como violação fantasma no capítulo 3 da 死人经.
  'romãzeira', 'palmeira', 'oliveira', 'figueira', 'videira', 'macieira', 'laranjeira',
  'bananeira', 'mangueira', 'trepadeira', 'roseira', 'amoreira',
  'fileira', 'esfera',
  // Adjetivos em -ora/-eira que entram em APELIDO traduzido. Epíteto de jianghu é
  // classe produtiva aqui (Seção 5 regra 2 manda traduzi-lo), e o nome repete muito:
  // 飞鹰 → "Águia Voadora" sozinho rendeu 3 falsos positivos no cap. 4 e reaparece 19
  // vezes no 5. Falso positivo em nome próprio é o pior tipo — repete e não some.
  'voadora', 'caçadora', 'matadora', 'errante', 'guerreira', 'feiticeira', 'traiçoeira',
  'carnívora',
]);

// {2,} e não {4,}: o quantificador conta os caracteres ANTES do sufixo, então
// {4,} exigia palavra de 7 letras e deixava passar as de 6 — "achara" e "ouvira"
// escaparam da varredura do capítulo 2 justamente assim. Falso positivo aqui é
// barato (o relatório é conferido por gente); falso negativo é o que dói.
//
// O "íra" existe porque exigir as letras literais "ira" deixava escapar todo
// mais-que-perfeito de verbo com hiato — saíra, caíra, possuíra, atraíra,
// destruíra. Havia um "saíra" real no capítulo 3 da 死人经 que só a leitura
// humana pegou: o falso negativo que o comentário acima diz ser o que dói,
// acontecendo na prática.
const RE_MQP = /\b[a-zà-úâêôãõáéíóúç]{2,}(?:ara|era|ira|ora|íra)\b/gi;

/** Verbo no mais-que-perfeito simples ("fizera")? Heurística por sufixo, com
 *  lista de exceções — pensada para ACUSAR e ser conferida, não para corrigir. */
function candidatosMaisQuePerfeito(texto: string): string[] {
  return [...texto.matchAll(RE_MQP)].map((m) => m[0]).filter((p) => !NAO_VERBOS.has(p.toLowerCase()));
}

/** Aspas de diálogo num texto cuja obra escolheu travessão, e vice-versa. */
function violacaoDialogo(texto: string, modo: PreferenciasEstilo['dialogo']): string | null {
  if (modo === 'travessao' && /"[^"]{3,}"/.test(texto)) return texto.match(/"[^"]{3,}"/)![0].slice(0, 60);
  if (modo === 'aspas' && /(^|\n)\s*—\s*\S/.test(texto)) return texto.match(/(^|\n)\s*—\s*\S.{0,40}/)![0].trim();
  return null;
}

/** Vírgula do inciso DENTRO das aspas — convenção do inglês, não do português.
 *  Em PT-BR a vírgula pertence à frase que emoldura a fala, então fica depois
 *  das aspas: `"Não há saída", disse ele.` Escapou por muito tempo porque a
 *  própria regra do prompt se contradizia (a prosa dizia "dentro", o exemplo
 *  mostrava fora), e o modelo seguia ora uma, ora outra. */
function violacaoVirgulaNaAspa(texto: string, modo: PreferenciasEstilo['dialogo']): string | null {
  if (modo !== 'aspas') return null;
  // vírgula colada no fecho das aspas seguida de verbo de elocução em minúscula
  const m = texto.match(/,"\s+[a-zà-ÿ][a-zà-ÿ]+/);
  return m ? m[0].slice(0, 40) : null;
}

/** Aspas que a regra manda converter para retas: tanto as asiáticas (「」『』)
 *  quanto as curvas tipográficas (“” ‘’). A tabela de conversão do prompt lista
 *  as duas famílias, então as duas contam. */
function violacaoAspasNaoRetas(texto: string): string | null {
  const m = texto.match(/[「」『』“”‘’][^\n]{0,40}/);
  return m ? m[0] : null;
}

/** Medidas chinesas que escaparam traduzidas como explicação literal. O caso
 * real foi 一炷香 → “tempo de queimar um bastão de incenso”, embora o Alfa peça
 * uma duração compreensível. A lista é conservadora para não acusar “qi”. */
function violacaoUnidadeChinesa(texto: string): string | null {
  const m = texto.match(/\b(?:\d+|um|uma|dois|duas|meio|meia)\s+(?:chi|cun|zhang|li|jin|liang|qian|shichen)\b|tempo de (?:queimar|uma) (?:um )?bastão de incenso/iu);
  return m?.[0] ?? null;
}

export function analisarEstilo(
  frases: { ordem: number; texto_pt: string | null }[],
  prefs: PreferenciasEstilo,
): RelatorioEstilo {
  const violacoes: Violacao[] = [];
  for (const f of frases) {
    const t = f.texto_pt ?? '';
    if (!t) continue;

    if (prefs.mais_que_perfeito === 'evitar') {
      for (const p of candidatosMaisQuePerfeito(t)) {
        violacoes.push({ ordem: f.ordem, regra: 'mais-que-perfeito', trecho: p });
      }
    }
    const dialogo = violacaoDialogo(t, prefs.dialogo);
    if (dialogo) violacoes.push({ ordem: f.ordem, regra: `dialogo-${prefs.dialogo}`, trecho: dialogo });

    const naoRetas = violacaoAspasNaoRetas(t);
    if (naoRetas) violacoes.push({ ordem: f.ordem, regra: 'aspas-nao-retas', trecho: naoRetas });

    const virgula = violacaoVirgulaNaAspa(t, prefs.dialogo);
    if (virgula) violacoes.push({ ordem: f.ordem, regra: 'virgula-dentro-da-aspa', trecho: virgula });

    const unidade = violacaoUnidadeChinesa(t);
    if (unidade) violacoes.push({ ordem: f.ordem, regra: 'unidade-chinesa', trecho: unidade });
  }

  // Terços por POSIÇÃO no capítulo, que é o eixo que revela o decaimento.
  const total = frases.length;
  const por_terco: [number, number, number] = [0, 0, 0];
  for (const v of violacoes) {
    const i = total === 0 ? 0 : Math.min(2, Math.floor((v.ordem / total) * 3));
    por_terco[i] += 1;
  }

  return { frases_total: total, violacoes, por_terco };
}
