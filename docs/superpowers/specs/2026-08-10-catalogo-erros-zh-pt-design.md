# Catálogo de erros comuns zh→pt-BR

Desenho para o pedido de 2026-08-09: *"não é só sobre esta obra, a ideia era criar tipo um
banco de dados de erros de traduções comuns desse tipo, que será útil em praticamente
todas obras futuras"* — as partículas polissêmicas sendo o primeiro lote.

A medição desloca o desenho duas vezes: o catálogo **não pode ser texto de prompt**, e
**não pode ser a tabela das nove partículas**.

## 1. As duas medições que decidem tudo

### A tabela das 9 partículas não sobrevive à evidência

O prompt *completo* (`server/src/db/promptPadraoInicial.ts:186`) traz uma tabela de nove
partículas polissêmicas com o "padrão a evitar" de cada uma. O **núcleo enxuto** — o Alfa
v3.0 ativo no VPS, 6203 chars — comprimiu as nove linhas numa única bala que nomeia as
partículas e não diz o que fazer com nenhuma.

Virei cada linha da tabela numa regra bilíngue — *se o chinês tem o gatilho **e** o
português tem o padrão a evitar, acusa* — e rodei contra a obra 1 (死人经, 561 frases
traduzidas), comparando o texto que a IA produziu com o texto final depois das correções
do revisor:

| entrada | acusa na IA | acusa no final | corrigidas | precisão |
|---|---|---|---|---|
| `一直` → "sempre" | 4 | 1 | **3** | **75%** |
| `总` → "sempre" | 12 | 11 | 1 | 8% |
| `还` → "ainda" | 34 | 33 | 1 | 3% |
| `都` → "todos" | 31 | 31 | 0 | 0% |
| `才` → "só então" | 2 | 2 | 0 | 0% |
| `又` → "de novo" | 2 | 2 | 0 | 0% |
| **total** | **85** | **80** | **5** | **6%** |

**Das 85 frases que o detector acusaria, o revisor mudou 5.** `都 → "todos"` e
`还 → "ainda"` sozinhas são 65 dos 85 alarmes, e nenhuma foi tocada: são a tradução certa
na maior parte das vezes.

Portar a tabela inteira produziria 80 falsos alarmes numa obra só, e o revisor aprenderia
a ignorar a lista — o mesmo modo de falha que a revisão do item 4 obrigou a tratar com
"dispensar tem o mesmo peso do conserto".

**Só `一直` sobrevive** — e é a partícula dos casos #23/#24, onde a mesma frase recebeu
vereditos opostos em três minutos.

### Texto no prompt já foi medido e não funcionou

A investigação de 2026-08-05 (56 alvos, 22 modelos) testou **nomear os marcadores chineses
no prompt** — 曾经, 已经, 从来, 向来 — e mediu **sem efeito** sobre a contagem de violações.
O que funcionou naquela rodada foi um **fato** (1时辰 = 2 horas), com queda de 18/20 para
8/20.

A distinção que aquela investigação isolou: *lacuna de conhecimento responde a fato no
prompt; preferência de estilo não responde.*

Este spec sai pela terceira porta: **não depender de o modelo lembrar.** Texto no prompt
pede que ele lembre; um detector confere depois. É por isso que a medição de agosto e a de
hoje não se contradizem.

## 2. O critério que governa o catálogo

**Uma entrada só existe com número.** O número é a precisão medida no corpus real:
frases acusadas no `texto_pt_original_ia` que **deixaram de ser acusadas** no `texto_pt` —
ou seja, casos em que o revisor, sem ser avisado por ninguém, corrigiu exatamente aquilo.

Corte: **precisão ≥ 50% e pelo menos 3 frases acusadas**. `一直` entra com 3/4; as cinco
reprovadas ficam entre 0% e 8%.

O piso de amostra não é detalhe: sem ele, uma entrada com uma única ocorrência corrigida
entra com 100% de "precisão" e o critério deixa de ser critério. Três é baixo e ainda
assim exclui o acidente de uma ocorrência só — e o `aferido` grava os números crus, então
quem reavaliar depois vê a amostra, não só a taxa.

O critério é conservador na direção certa. Ele subestima: o revisor pode ter deixado
passar um erro real por não notar. Nunca superestima — uma correção que ele fez é uma
correção que ele quis.

**As reprovadas são registradas, não apagadas**, com a medição ao lado. Sem isso alguém
reprõe `都 → todos` de boa-fé em três meses, e a medição é refeita do zero.

## 3. O catálogo é dado

Arquivo novo em `shared/`, no formato do registro de temas que já existe
(`shared/src/temasDoPrompt.ts`), porque a mesma entrada é lida pelo servidor (detector) e
pelo front (explicação na tela):

```ts
export interface EntradaCatalogo {
  /** kebab-case estável; vira o `regra` da violação. */
  id: string;
  /** O gatilho no ORIGINAL. A regra só dispara quando ele está no chinês. */
  gatilho_zh: string;
  /** O reflexo errado no português. */
  evitar_pt: RegExp;
  /** O que é certo, em uma frase. Entregue no ponto do uso, não no prompt. */
  certo: string;
  /** Sem isto a entrada não pode estar em CATALOGO. */
  aferido: { obra_id: number; acusadas: number; corrigidas: number; em: string };
}

export const CATALOGO: readonly EntradaCatalogo[];
/** Medidas e reprovadas — ficam para ninguém repropor de boa-fé. */
export const REPROVADAS: readonly (EntradaCatalogo & { motivo: string })[];
```

`CATALOGO` nasce com **uma** entrada:

```ts
{
  id: 'particula-yizhi',
  gatilho_zh: '一直',
  evitar_pt: /\bsempre\b/i,
  certo: 'Continuidade ininterrupta até aquele momento — "até então", "vinha …ndo". '
       + '"Sempre" é a glosa de 总, que é impressão abstrata; confundir os dois foi o '
       + 'que produziu vereditos opostos na mesma frase (casos #23/#24).',
  aferido: { obra_id: 1, acusadas: 4, corrigidas: 3, em: '2026-08-10' },
}
```

## 4. O detector é bilíngue — e isso é novo aqui

`analisarEstilo` (`server/src/traducao/estiloViolacoes.ts:104`) recebe
`{ ordem, texto_pt }[]`: **nunca vê o chinês**. Não há como expressar nele "一直 virou
sempre".

`varrerConsistencia` (`server/src/traducao/consistencia.ts:34`) é bilíngue e é o molde:
função pura sobre uma lista de frases, com um `Set` de dispensas.

```ts
export interface ViolacaoCatalogo {
  frase_id: number;
  ordem: number;
  entrada_id: string;
  gatilho_zh: string;
  /** O trecho do PT que disparou, com contexto ao redor — é o que a tela destaca. */
  trecho_pt: string;
}

export function varrerCatalogo(
  frases: { id: number; ordem: number; texto_zh: string; texto_pt: string; status_traducao: string }[],
  ignoradas: ReadonlySet<string>,
): { violacoes: ViolacaoCatalogo[]; frases_examinadas: number };
```

Só examina frase `traduzida`. As dispensas usam a mesma tabela `estilo_ignorado` e a mesma
trinca `(frase_id, regra, trecho)` — o `regra` é o `entrada_id`. Nenhuma migração: a
tabela já é genérica por regra.

## 5. Onde o achado aparece: em nenhuma tela nova

As violações do catálogo entram na **mesma lista** que `GET /capitulos/:id/estilo` já
devolve, marcadas pela `regra` (que é o `entrada_id`), e são consertáveis pelo **passe de
estilo** que o item 3 construiu. O revisor já tem a tela, o botão de dispensar e o fluxo
de aprovação.

Uma adição no contrato do passe: `alvos[].texto_zh`. Para consertar `一直 → sempre` o
modelo precisa ver o original; hoje ele recebe só o português e adivinharia. E o bloco
operacional ganha uma linha: quando a violação vier do catálogo, **o chinês é o árbitro**,
e o `certo` da entrada vai junto como orientação daquela violação.

É aqui que o texto do catálogo é entregue: **no ponto do uso**, para a frase em questão,
em vez de em toda chamada de tradução.

## 6. A aferição é ferramenta, não evento

Script `server/scripts/aferir-catalogo.ts`, no formato dos que já existem em
`server/scripts/`: recebe uma obra, roda a conta da §1 para cada entrada de `CATALOGO` e
de `REPROVADAS`, e imprime a tabela. É o que responde "esta regra merece existir?" sem
opinião.

E um teste que **falha se alguma entrada de `CATALOGO` não tiver `aferido`, ou tiver
precisão abaixo de 50%**. É o que impede a lista de crescer por intuição — inclusive a
minha.

## 7. Testes

1. **Detector acusa o par certo**: chinês com `一直` e português com "sempre" → uma
   violação com `entrada_id: 'particula-yizhi'`.
2. **Detector não acusa sem o gatilho**: português com "sempre" e chinês sem `一直` → zero.
3. **Detector não acusa sem o reflexo**: chinês com `一直` e português com "até então" →
   zero.
4. **Só frase traduzida**: frase pendente não é examinada.
5. **Dispensa respeitada**: a trinca dispensada some da varredura.
6. **Guarda do catálogo**: um teste percorre `CATALOGO` e falha se alguma entrada não
   tiver `aferido` ou tiver `corrigidas / acusadas < 0.5`.
7. **As reprovadas não vazam**: nenhum `id` de `REPROVADAS` aparece em `CATALOGO`, e
   `varrerCatalogo` não usa `REPROVADAS`.
8. **Integração na rota de estilo**: um capítulo com uma frase `一直 → sempre` traz a
   violação do catálogo junto das de estilo, na mesma lista.
9. **O passe recebe o chinês**: `alvos[].texto_zh` chega ao provedor preenchido, e o
   `certo` da entrada vai na mensagem quando a violação é do catálogo.
10. **Aferição sobre corpus sintético**: uma obra com 4 frases acusadas na IA e 3
    corrigidas devolve precisão 0.75.

## 8. Riscos

**A entrada única parece pouco.** É pouco, e é honesto: é o que a evidência sustenta hoje.
O catálogo cresce quando o corpus crescer — cada obra nova roda a aferição e as entradas
candidatas se provam ou não. O valor desta entrega não é o tamanho da lista; é o
**mecanismo que impede a lista de crescer errado**, que é precisamente o que faltou quando
a tabela das nove foi escrita.

**A precisão medida é do passado.** `一直 → sempre` tem 75% em 561 frases de uma obra, com
n=4. É amostra pequena. Mitigação: o `aferido` grava a obra e a data, e a aferição é
rerodável; quando a segunda obra existir, o número é refeito e a entrada pode cair.

**Falso positivo custa confiança.** Uma entrada ruim no meio de uma lista curta pesa mais
que numa lista longa. O corte de 50% e o teste-guarda existem para isso, e a dispensa por
trinca — que já existe — dá a saída caso a caso.

## 9. Não-objetivos

- **Não restaura a tabela no núcleo Alfa.** Nem a das nove, nem uma reduzida. A medição de
  agosto mediu texto de marcador no prompt como sem efeito, e o enxuto cortou a tabela por
  tokens. O `certo` de cada entrada é entregue no ponto do uso.
- **Não corta versão nova de Alfa.** Nenhum texto de prompt de tradução muda.
- **Não usa IA para detectar.** O detector é determinístico e roda de graça; a IA entra só
  no passe, que já existe, quando o revisor pede o conserto.
- **Não cria tela nova nem migração.** A lista, a dispensa e a tabela `estilo_ignorado` já
  existem e são genéricas por regra.
