import { CATALOGO, TEMAS, temasNoTexto, trechoQueMudou, type Camada, type EntradaGlossario, type PreferenciasEstilo } from '@dao-tale/shared';
import { contemTermoFlexionado } from './flexao.js';
import { analisarEstilo } from './estiloViolacoes.js';
import { metricasEstilo } from '../ia/metricasEstilo.js';

// O que o revisor corrige à mão é o sinal mais forte que o app tem — e o menos
// lido. Na 死人经 foram 146 edições contra 25 casos no banco de testes. Mas a
// maior parte NÃO vira regra nova: é chave de estilo que o modelo desobedeceu,
// termo de glossário que derivou, ou tipografia. Classificar antes de propor é o
// que impede o refinamento de receber material que ele é proibido de usar.

export type RotaEdicao = 'tipografia' | 'glossario' | 'catalogo' | 'chave-estilo' | 'nucleo' | 'diretriz';

export interface EdicaoClassificada {
  frase_id: number;
  ordem: number;
  capitulo_numero: number;
  texto_zh: string;
  ia: string;
  voce: string;
  de: string;
  para: string;
  rota: RotaEdicao;
  /** Termo do glossário, ou id do tema — o que explica a rota. */
  detalhe: string | null;
}

/** Tira do texto o que é decisão de tipografia, não de tradução.
 *
 * Cobre também as aspas CJK (achado da revisão final): `analisarEstilo` trata
 * `「」『』` e as aspas curvas `“”‘’` como a MESMA regra (`aspas-nao-retas` — ver o
 * comentário de `violacaoAspasNaoRetas` em estiloViolacoes.ts, "tanto as
 * asiáticas quanto as curvas"). Sem `「」『』` aqui, uma edição que troca só o
 * CARACTERE da aspas ("「vamos embora」" -> "\"vamos embora\"") caía em `diretriz`
 * e ocupava uma vaga da chamada paga de refinamento — que é proibido de propor
 * regra sobre aspas. `「」` e `《》` são as marcas EXTERNAS (par de `“”`); `『』` e
 * `〈〉` são as INTERNAS/aninhadas (par de `‘’`), mesma convenção tipográfica
 * chinesa de marca dupla/simples. */
const normalizarTipografia = (t: string) =>
  t
    .replace(/[‘’‛『』〈〉]/g, "'")
    .replace(/[“”‟「」《》]/g, '"')
    .replace(/…/g, '...')
    .replace(/[–—]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** O registro `TEMAS` é a fonte de verdade de quem é dono de cada tema — nunca
 *  mapear tema->rota na mão aqui, ou as duas cópias divergem cedo ou tarde. */
const rotaDaCamada = (dono: Camada): RotaEdicao => (dono === 'alfa' ? 'nucleo' : 'chave-estilo');

/** Rota de um id de tema, consultando o registro. `null` se o id não existir
 *  nele (não deveria acontecer para os ids usados abaixo — é uma rede de
 *  segurança, não um caminho esperado). */
function rotaDoTemaId(temaId: string): RotaEdicao | null {
  const tema = TEMAS.find((t) => t.id === temaId);
  return tema ? rotaDaCamada(tema.dono) : null;
}

/**
 * Regra do scanner `analisarEstilo` -> id do tema que a possui, SÓ para as
 * regras cuja correspondência é uma DECISÃO de estilo (qual convenção usar),
 * não um deslize mecânico de pontuação.
 *
 * `mais-que-perfeito` e a convenção estrutural do diálogo (`dialogo-aspas` /
 * `dialogo-travessao` — o modelo usou aspas onde a obra pediu travessão, ou
 * vice-versa) são escolhas que a chave de estilo decide.
 *
 * `aspas-nao-retas` (qual CARACTERE de aspas foi usado — curva ou reta) e
 * `virgula-dentro-da-aspa` (onde cai a vírgula do inciso) ficam DE FORA de
 * propósito. Achado da revisão: uma edição que troca "morto" por "cadáver" E
 * conserta aspas curvas na MESMA frase tinha as duas violações somadas — a
 * de aspas sumia (o revisor converteu o caractere) e o roteador atribuía a
 * frase INTEIRA a chave-estilo, engolindo o sinal de diretriz, que é o que
 * mais importa. A causa raiz: essas duas regras são mecânicas — qual símbolo
 * foi digitado — não uma decisão sobre qual convenção seguir; a diferença já
 * tem outro lar (a rota `tipografia`, mais acima) para o caso em que ISSO é a
 * única coisa que mudou. Deixá-las aqui faria o scanner reivindicar de novo,
 * por um caminho mais fraco, uma edição cujo conteúdo real é outra coisa.
 */
const TEMA_DA_REGRA_ESTILO: Record<string, string> = {
  'mais-que-perfeito': 'mais_que_perfeito',
  'dialogo-aspas': 'dialogo',
  'dialogo-travessao': 'dialogo',
};

/**
 * Fallback por SCANNER quando `temasNoTexto` não casa o par `de`/`para`.
 *
 * `temasNoTexto` mira TEXTO CORRIDO de regra de prompt — "mais-que-perfeito",
 * "anterioridade", `fizera`, `dissera` para o tema de Beta; "decalque",
 * "chengyu", 对方, 开口 para o de Alfa. É reconhecimento da POLÍTICA sendo
 * enunciada num rótulo ou numa seção do prompt, não da violação ocorrendo na
 * PROSA traduzida. "errara" -> "errou" e "a outra parte" -> "o inimigo" nunca
 * vão casar esses padrões, e não devem: afrouxá-los para alcançar isto
 * reabriria o falso positivo já medido (doc no topo de `temasDoPrompt.ts`) —
 * regra explícita do projeto, não afrouxar o registro.
 *
 * Em vez de mexer no padrão, este módulo faz a MESMA pergunta por outro
 * caminho, com os scanners determinísticos que o app já tem para cada camada:
 *   - `analisarEstilo` (scanner de preferências de estilo, doc 09) — POR
 *     REGRA, não pelo total: cada regra que aparecia em `ia` e sumiu em `voce`
 *     é examinada por si (ver `TEMA_DA_REGRA_ESTILO`), nunca a contagem
 *     agregada — contar o total confundia "uma violação sumiu" com "esta
 *     frase tem menos problemas no total", que são perguntas diferentes.
 *   - `metricasEstilo` (contador do portão A/B do núcleo, doc 08 §12), para
 *     os alvos de Alfa que o núcleo já nomeia e conta: decalque ("a outra
 *     parte", "abriu a boca") e demonstrativos (aquele/esse/este — o teste da
 *     deleção).
 * A pergunta é sempre a mesma: a violação existia na frase da IA e sumiu na
 * do revisor? Se sim, a rota é da camada dona daquele tema — consultada no
 * registro `TEMAS`, nunca copiada à mão.
 *
 * ORDEM determinística quando mais de uma regra some na mesma frase: a ordem
 * em que o próprio `analisarEstilo` verifica (mais-que-perfeito, diálogo,
 * aspas não retas, vírgula na aspa — é a ordem em que a função empilha
 * `violacoes`, não uma ordem inventada aqui), e só then decalque e
 * demonstrativos. Continua sendo uma heurística: se a mesma frase corrigir
 * DUAS violações de camadas diferentes de verdade, só a primeira na ordem
 * acima decide — o caso é raro (violações múltiplas na mesma frase corrigidas
 * juntas) e não há sinal melhor sem inspecionar o texto por posição.
 */
function rotaPorScanner(
  ia: string,
  voce: string,
  prefs: PreferenciasEstilo,
): { rota: RotaEdicao; detalhe: string } | null {
  const antes = analisarEstilo([{ ordem: 0, texto_pt: ia }], prefs).violacoes;
  const depoisRegras = new Set(analisarEstilo([{ ordem: 0, texto_pt: voce }], prefs).violacoes.map((v) => v.regra));

  const regrasVistas = new Set<string>();
  for (const v of antes) {
    if (regrasVistas.has(v.regra)) continue; // já julgamos esta regra (pode repetir várias vezes na frase)
    regrasVistas.add(v.regra);
    if (depoisRegras.has(v.regra)) continue; // não sumiu: ainda está lá depois da edição

    const temaId = TEMA_DA_REGRA_ESTILO[v.regra];
    if (!temaId) continue; // regra sem tema dono óbvio (aspas-nao-retas, virgula-dentro-da-aspa) — ver comentário do mapa
    const rota = rotaDoTemaId(temaId);
    if (rota) return { rota, detalhe: temaId };
  }

  if (metricasEstilo(ia).decalques > 0 && metricasEstilo(voce).decalques === 0) {
    const rota = rotaDoTemaId('decalque');
    if (rota) return { rota, detalhe: 'decalque' };
  }

  if (metricasEstilo(ia).demonstrativos > 0 && metricasEstilo(voce).demonstrativos === 0) {
    const rota = rotaDoTemaId('demonstrativos');
    if (rota) return { rota, detalhe: 'demonstrativos' };
  }

  return null;
}

/** A entrada do catálogo que esta edição consertou, se houver.
 *
 * Bilíngue como o detector: pergunta pelo gatilho no ORIGINAL, e não só pelo
 * reflexo no português. Sem isso, "sempre → até então" numa frase de 总 (onde
 * "sempre" é o acerto) seria lida como lição de 一直.
 *
 * A condição é a mesma da aferição — acusada no texto da IA, não acusada no
 * texto final —, e é de propósito: o que a aferição conta como prova de que a
 * regra vale é exatamente o que aqui deixa de virar pedido de prompt. */
function entradaConsertada(zh: string, ia: string, voce: string): string | null {
  for (const e of CATALOGO) {
    if (!zh.includes(e.gatilho_zh)) continue;
    if (e.evitar_pt.test(ia) && !e.evitar_pt.test(voce)) return e.id;
  }
  return null;
}

export function classificarEdicoes(
  frases: {
    id: number;
    ordem: number;
    capitulo_numero: number;
    texto_zh: string;
    texto_pt_original_ia: string | null;
    texto_pt: string;
    editado_manualmente: boolean;
    origem_edicao: string | null;
  }[],
  glossario: EntradaGlossario[],
  prefs: PreferenciasEstilo,
): EdicaoClassificada[] {
  const saida: EdicaoClassificada[] = [];
  for (const f of frases) {
    // Só edição DIGITADA pelo revisor. O que veio de botão (ou de substituição em
    // lote — Task 6, achado da revisão da Task 2) já é decisão registrada em outro
    // canal, e recontá-la ensinaria a mesma lição várias vezes.
    if (!f.editado_manualmente || f.origem_edicao !== null) continue;
    const ia = f.texto_pt_original_ia;
    if (!ia || ia === f.texto_pt) continue;

    const { de, para } = trechoQueMudou(ia, f.texto_pt);
    const comum = {
      frase_id: f.id,
      ordem: f.ordem,
      capitulo_numero: f.capitulo_numero,
      texto_zh: f.texto_zh,
      ia,
      voce: f.texto_pt,
      de,
      para,
    };

    if (normalizarTipografia(ia) === normalizarTipografia(f.texto_pt)) {
      saida.push({ ...comum, rota: 'tipografia', detalhe: null });
      continue;
    }

    // Glossário ANTES de tema: o tema `glossario` casaria por conter a palavra, mas
    // o que interessa é QUAL termo derivou.
    const termo = glossario.find(
      (g) => !contemTermoFlexionado(ia, g.termo_pt) && contemTermoFlexionado(f.texto_pt, g.termo_pt),
    );
    if (termo) {
      saida.push({ ...comum, rota: 'glossario', detalhe: termo.termo_pt });
      continue;
    }

    const tema = temasNoTexto(`${de}\n${para}`)[0]?.tema;
    if (tema) {
      saida.push({ ...comum, rota: rotaDaCamada(tema.dono), detalhe: tema.id });
      continue;
    }

    // O catálogo ANTES dos scanners de camada: o que ele já detecta de graça não
    // pode virar pedido de texto de prompt. Uma edição que conserta `一直 → sempre`
    // e de quebra desfaz um mais-que-perfeito cairia numa rota de camada, e a
    // tela mandaria o revisor mexer no prompt por causa de uma partícula — o que
    // o spec §9 proíbe e a medição de 2026-08-05 mostrou sem efeito. Depois de
    // tipografia, glossário e tema porque esses três são AÇÕES mais específicas
    // (trocar uma aspa, ajustar um termo), não conselhos sobre o prompt.
    const doCatalogo = entradaConsertada(f.texto_zh, ia, f.texto_pt);
    if (doCatalogo) {
      saida.push({ ...comum, rota: 'catalogo', detalhe: doCatalogo });
      continue;
    }

    // `temasNoTexto` mira o texto CORRIDO da regra de prompt, e o par `de`/`para`
    // isolado não casa esses padrões mesmo quando a violação é real (ver
    // comentário de `rotaPorScanner`). Pergunta pelos scanners determinísticos de
    // cada camada, pela mesma decisão por outro caminho, antes de render-se a
    // "diretriz".
    const porScanner = rotaPorScanner(ia, f.texto_pt, prefs);
    if (porScanner) {
      saida.push({ ...comum, rota: porScanner.rota, detalhe: porScanner.detalhe });
      continue;
    }

    saida.push({ ...comum, rota: 'diretriz', detalhe: null });
  }
  return saida;
}

/**
 * Amostra até `maximo` itens ESPALHADOS pela lista (índices igualmente
 * distribuídos do começo ao fim), preservando a ordem original — em vez de um
 * trecho contíguo de uma ponta.
 *
 * Existe porque `paraMineracao` ordena as frases por POSIÇÃO NO LIVRO
 * (capítulo, ordem), não por quando a edição foi feita — a tabela `frases` não
 * tem carimbo de tempo de edição, então "as N mais recentes" não é uma amostra
 * realizável a partir deste schema (achado da revisão da rodada 1). Um
 * `slice(-N)` pegaria só o fim do livro: se o revisor termina os capítulos
 * 1–20 e depois volta ao capítulo 3 para corrigir mais frases, essas correções
 * frescas ficam de fora sempre que o capítulo 20 já tiver N edições da mesma
 * rota. Espalhar é também MELHOR para o propósito, não só um remendo: a
 * instrução do sistema em `sistemaRefinarPromptPartes` diz que uma correção
 * isolada é gosto e só vira regra quando o mesmo tipo se repete — uma amostra
 * espalhada pela obra evidencia repetição ao longo do livro inteiro; um bloco
 * do último capítulo só mostra o último capítulo.
 */
export function amostrarEspalhado<T>(lista: T[], maximo: number): T[] {
  if (maximo <= 0 || lista.length === 0) return [];
  if (lista.length <= maximo) return lista;
  if (maximo === 1) return [lista[Math.floor((lista.length - 1) / 2)]];
  // Índices igualmente espaçados entre o primeiro (0) e o último (length-1),
  // arredondados — cobre as duas pontas e distribui o resto pelo meio. O Set
  // deduplica o raro empate de arredondamento quando `maximo` está muito perto
  // de `lista.length`.
  const indices = new Set<number>();
  for (let i = 0; i < maximo; i++) {
    indices.add(Math.round((i * (lista.length - 1)) / (maximo - 1)));
  }
  return [...indices].map((i) => lista[i]);
}
