import { TEMAS, temasNoTexto, trechoQueMudou, type Camada, type EntradaGlossario, type PreferenciasEstilo } from '@dao-tale/shared';
import { contemTermoFlexionado } from './flexao.js';
import { analisarEstilo } from './estiloViolacoes.js';
import { metricasEstilo } from '../ia/metricasEstilo.js';

// O que o revisor corrige à mão é o sinal mais forte que o app tem — e o menos
// lido. Na 死人经 foram 146 edições contra 25 casos no banco de testes. Mas a
// maior parte NÃO vira regra nova: é chave de estilo que o modelo desobedeceu,
// termo de glossário que derivou, ou tipografia. Classificar antes de propor é o
// que impede o refinamento de receber material que ele é proibido de usar.

export type RotaEdicao = 'tipografia' | 'glossario' | 'chave-estilo' | 'nucleo' | 'diretriz';

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

/** Tira do texto o que é decisão de tipografia, não de tradução. */
const normalizarTipografia = (t: string) =>
  t
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
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
