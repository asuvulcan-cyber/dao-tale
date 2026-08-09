import { PREFERENCIAS_PADRAO, temasNoTexto, trechoQueMudou, type EntradaGlossario } from '@dao-tale/shared';
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
 *   - chave-estilo (mais-que-perfeito): `analisarEstilo`, o scanner de
 *     preferências de estilo (doc 09).
 *   - núcleo (decalque nomeado: "a outra parte", "abriu a boca"):
 *     `metricasEstilo`, o contador do portão A/B do núcleo (doc 08 §12).
 * A pergunta é sempre a mesma: a violação existia na frase da IA e sumiu na
 * do revisor? Se sim, a rota é da camada dona daquele scanner.
 */
function rotaPorScanner(ia: string, voce: string): { rota: RotaEdicao; detalhe: string } | null {
  const antesMqp = analisarEstilo([{ ordem: 0, texto_pt: ia }], PREFERENCIAS_PADRAO).violacoes.length;
  const depoisMqp = analisarEstilo([{ ordem: 0, texto_pt: voce }], PREFERENCIAS_PADRAO).violacoes.length;
  if (antesMqp > 0 && depoisMqp === 0) return { rota: 'chave-estilo', detalhe: 'mais_que_perfeito' };

  const antesDecalque = metricasEstilo(ia).decalques;
  const depoisDecalque = metricasEstilo(voce).decalques;
  if (antesDecalque > 0 && depoisDecalque === 0) return { rota: 'nucleo', detalhe: 'decalque' };

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
      saida.push({
        ...comum,
        rota: tema.dono === 'alfa' ? 'nucleo' : 'chave-estilo',
        detalhe: tema.id,
      });
      continue;
    }

    // `temasNoTexto` mira o texto CORRIDO da regra de prompt, e o par `de`/`para`
    // isolado não casa esses padrões mesmo quando a violação é real (ver
    // comentário de `rotaPorScanner`). Pergunta pelos scanners determinísticos de
    // cada camada, pela mesma decisão por outro caminho, antes de render-se a
    // "diretriz".
    const porScanner = rotaPorScanner(ia, f.texto_pt);
    if (porScanner) {
      saida.push({ ...comum, rota: porScanner.rota, detalhe: porScanner.detalhe });
      continue;
    }

    saida.push({ ...comum, rota: 'diretriz', detalhe: null });
  }
  return saida;
}
