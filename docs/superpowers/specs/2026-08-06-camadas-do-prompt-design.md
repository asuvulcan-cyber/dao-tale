# Camadas do prompt — desenho validado

> Spec derivado de [`docs/15-camadas-do-prompt.md`](../../15-camadas-do-prompt.md), que é o
> diagnóstico medido em 2026-08-05. Este documento fecha o desenho; o plano de execução
> fica em `docs/superpowers/plans/2026-08-06-camadas-do-prompt.md`.
>
> Decisões aprovadas pelo dono em 2026-08-06.

---

## 1. Problema

Três camadas de prompt (universal, preferências de estilo, diretrizes da obra) são
compostas numa string só e enviadas à IA. A regra que as governa é uma **partição por
tema**: cada tema pertence a exatamente uma camada. Quando duas camadas falam do mesmo
tema, quem decide é o modelo — e a decisão muda a cada chamada.

Nada no sistema hoje verifica a partição. Quatro buracos, todos confirmados no código:

1. O Delta que o usuário digita nunca é conferido. `preferenciaQueCobre` só é chamada em
   [`obras.ts:414-416`](../../../server/src/rotas/obras.ts#L414-L416), sobre recorrências
   do banco de testes.
2. Um Alfa novo pode reintroduzir tema de Beta e matar a chave em silêncio.
3. Ninguém olha o composto pronto — o único lugar onde as três camadas se encontram.
4. Nenhum teste garante que o Alfa distribuído no código não fale de tema de Beta.

E há um conflito de precedência **declarado**, não hipotético (§4 abaixo).

## 2. Nomes — aprovado

| Nome | O que é | A pergunta que responde |
|---|---|---|
| **Alfa** | universal zh→pt-BR | *como se traduz do chinês sem decalque?* |
| **Beta** | preferências de estilo (chaves) | *quais convenções de casa esta obra segue?* |
| **Delta** | diretrizes da obra (texto livre) | *o que só existe nesta obra?* |
| **Ômega** | o composto que vai para a IA | — é a soma, não uma camada |

**Por que letras gregas e não nomes descritivos.** Foi a descritividade que produziu a
bagunça atual: *núcleo*, *prompt padrão*, *prompt padrão global*, *prompt universal* são
todos corretos, e por isso todos intercambiáveis — cada um convidava um sinônimo. Um
rótulo arbitrário não tem sinônimo. Não pode derivar porque não significa nada sozinho.

**Por que não há Gama.** Não porque γ venha antes de δ, mas porque **α, β, δ ocupam
posições numa escala de especificidade e γ é uma posição livre entre camadas**. Se um dia
aparecer uma quarta entrada — preferências de coleção compartilhadas por um grupo de
obras, por exemplo — ela tem casa, no ponto certo da escala. Ômega nunca poderá ser
camada: é a última letra, não há nada depois dela para ser mais específico. O buraco em γ
é encaixe reservado, não cicatriz.

**Por que Delta continua Delta.** O nome está gravado em `prompts.tipo = 'delta'` e no
marcador `{{DELTA_OBRA}}`, que vive **dentro de cada versão de núcleo já existente**.
Versões são imutáveis: renomear quebraria os núcleos antigos. Restrição do dono, e
"delta" já significa o que a camada é — o incremento.

### 2.1 O vocabulário chega ao código

Decisão aprovada: sim. Motivo — hoje **"prompt mãe" tem dois significados**, e o §3 do doc
15 não viu isso:

- o tipo `PromptMae` ([`repos.ts:51`](../../../server/src/db/repos.ts#L51)) é a **linha
  versionada de Delta+Beta** de uma obra;
- o campo `req.promptMae` nos cinco provedores
  ([`provedor.ts:38`](../../../server/src/ia/provedor.ts#L38) e adiante) é a **string
  composta** — o Ômega.

Mesmo nome, duas camadas diferentes do próprio diagrama. Parar o vocabulário na
documentação faria a skill ensinar um nome que o código contradiz.

O rename é code-only: `promptMae` não existe em coluna de banco nem no JSON de export.
`{{DELTA_OBRA}}` e `prompts.tipo` **não são tocados**.

| De | Para |
|---|---|
| `comporPromptMae` | `comporOmega` |
| `promptMae` (campo dos provedores) | `omega` |
| `PromptMae` (tipo da linha) | `VersaoDelta` |

## 3. Instâncias — aprovado

Decisão: **(a) uma instância só, no VPS.** O VPS é bancada e vitrine; o local vira clone
descartável restaurado de backup, somente leitura, nunca gravado.

O argumento decisivo não é economia de dor, é um invariante: **duas instâncias quebram a
identidade de versão.** O app se apoia em versões imutáveis, e `comporOmega` é
determinístico de propósito, para que a mesma versão produza os mesmos bytes (prompt
caching). Com dois bancos numerando sozinhos, "v5.0" deixa de identificar bytes — existem
duas v5.0 diferentes agora mesmo, e foi isso que o dono sentiu como *"repetitivo"*.
Nenhum aviso pega isso depois do fato, porque não há o que comparar: o número é igual.

Custos aceitos, declarados:

- **Chave de API em arquivo.** [`credenciais/index.ts:25`](../../../server/src/credenciais/index.ts#L25)
  prefere o keyring do SO e cai para arquivo quando não há Secret Service. Num VPS
  headless isso é sempre o arquivo — no VPS compartilhado com o bot do dono.
- **Trabalhar exige rede.** Offline deixa de ser possível na bancada.

Ganho que o diagnóstico não contabilizou: job longo no VPS não depende da máquina do dono
ficar acordada.

## 4. O conflito de precedência, e por que ele é menor do que o diagnóstico diz

O topo do Alfa declara ([`promptPadraoInicial.ts:239`](../../../server/src/db/promptPadraoInicial.ts#L239)):

> **Hierarquia, em caso de conflito:** Glossário > Conteúdo > Forma natural. O glossário é lei.

Mas os cabeçalhos das outras duas camadas se declaram superiores a tudo que veio antes:

- Beta ([`preferenciasEstilo.ts:267`](../../../shared/src/preferenciasEstilo.ts#L267)):
  *"quando conflitarem com as seções anteriores, valem estas"*
- Delta ([`promptPadraoInicial.ts:38`](../../../server/src/db/promptPadraoInicial.ts#L38)):
  *"precedência sobre as demais"*

A Seção 2 (glossário é lei) **é** uma seção anterior. Formalmente, uma chave de Beta
derruba o glossário — e não é hipótese: `nomes_proprios: mesclar` diz *"Pessoa: **sempre**
em pinyin"* ([`preferenciasEstilo.ts:233`](../../../shared/src/preferenciasEstilo.ts#L233)).
Um nome de pessoa catalogado em forma traduzida põe as duas regras em guerra, e quem
decide é o modelo.

**Correção do diagnóstico:** o doc 15 pede "uma linha em cada cabeçalho", nos três. São
**dois**. O cabeçalho do Alfa é a vítima, não a causa: ele já diz a coisa certa. Quem cria
o conflito são os dois cabeçalhos subordinados que se declaram superiores sem exceção.

Isso importa muito na prática, porque os dois que precisam mudar são exatamente os dois
**gerados em tempo de composição** por `renderizarPreferencias` e `comporOmega` — código,
não conteúdo de versão. A linha do Alfa vive **dentro** de versão imutável: mudá-la exigiria
cortar um núcleo novo e o dono teria de ativá-lo à mão.

Conserto: cada cabeçalho subordinado passa a se autolimitar —

> *(… valem estas — **exceto o glossário, que é lei acima de todas as camadas**.)*

Sem número de seção de propósito: `comporOmega` compõe com Alfas arbitrários, inclusive
editados pelo usuário, e nada garante que o glossário seja a Seção 2 neles. O conceito é
inequívoco; o número não é.

Consequência aceita: muda os bytes do Ômega de todas as obras de uma vez, sem bump de
versão. Isso é precedente estabelecido — `renderizarPreferencias` já evoluiu em código
antes ([`preferenciasEstilo.ts:299-301`](../../../shared/src/preferenciasEstilo.ts#L299-L301)).
Custo real: uma chamada fria de prompt cache por obra, uma vez.

Não se corta versão nova de Alfa agora. Quando uma for cortada por outro motivo, a linha
do Alfa ganha a mesma explicitação.

## 5. Registro de temas

Peça central. Uma tabela em código — tema → camada dona → como reconhecê-lo em texto.
`preferenciaQueCobre` é a versão embrionária: 6 temas, por regex sobre o **rótulo** da
regra. Generalizar para reconhecer tema em **texto corrido** de qualquer camada.

```ts
export type Camada = 'alfa' | 'beta' | 'delta';

export interface Tema {
  id: string;          // para Beta, é a chave de PreferenciasEstilo
  dono: Camada;
  titulo: string;      // nome curto, para a mensagem
  resolucao: string;   // "resolve-se pela chave Diálogo", para a mensagem
  padrao: RegExp;      // reconhece o tema em texto corrido
  filtravel: boolean;  // ver 5.1
}
```

Cobre as 8 chaves de Beta e os temas de Alfa (glossário, unidades de medida,
demonstrativos, decalque, chengyu, partículas polissêmicas) — o relatório do Ômega precisa
dos dois lados para apontar sobreposição.

### 5.1 Duas funções, uma tabela

O registro embrionário tem um buraco que o diagnóstico não viu: cobre 6 temas, mas Beta
tem 8 chaves. Fora ficaram `pensamento_tempo` (engolida pelo regex `/pensamento/`, que
devolve o rótulo errado, `pensamento_marca`) e **`nomes_proprios`** — a única chave que
entra em guerra declarada com o glossário. E não é esquecimento:
[`rotulosRegra.test.ts:114`](../../../server/src/db/rotulosRegra.test.ts#L114) *afirma* que
`'3.2-nomes-proprios'` devolve `null`.

A afirmação está certa para o uso que ela tem, e errada como regra geral. Em
[`obras.ts:414-416`](../../../server/src/rotas/obras.ts#L414-L416) `preferenciaQueCobre` é
um **filtro**: derruba candidatos a diretriz nova antes de gastar a chamada paga. Nomes
próprios é caso genuinamente ambíguo — a *política* (traduzir ou transliterar) é chave de
Beta, mas o tratamento de *um nome específico* é glossário. Filtrar ali descartaria
candidato legítimo em silêncio.

Então: **uma tabela, duas leituras.**

| Função | Papel | Severidade | Cobertura |
|---|---|---|---|
| `preferenciaQueCobre(rotulo)` | filtro que economiza chamada paga | derruba em silêncio | só temas `filtravel: true` |
| `temasNoTexto(texto)` | aviso ao dono | mostra e deixa passar | todos os temas |

`nomes_proprios` entra na tabela com `filtravel: false`: aparece no aviso, nunca no filtro.
O comportamento de `obras.ts` não muda, e o teste existente continua verde com um
comentário que explica *por quê*, em vez de registrar um buraco.

`pensamento_tempo` ganha entrada própria. Como as duas chaves de pensamento são
filtráveis, o filtro não muda de comportamento — só passa a devolver o rótulo verdadeiro.

## 6. As três checagens

Aviso, **nunca bloqueio**: o dono às vezes quer mesmo a exceção. O que não pode é a
sobreposição acontecer sem ele ver. Toda mensagem mostra o **trecho que casou**, para que
o julgamento seja de um olhar.

| Onde | O que faz |
|---|---|
| Ao salvar o **Delta** | "isto é tema de Beta — resolve-se pela chave X", com o trecho |
| Ao criar um **Alfa** | "esta versão fala de tema de Beta" e "perdeu o marcador `{{PREFERENCIAS_OBRA}}`" |
| Sobre o **Ômega** | relatório: temas presentes, dono de cada um, sobreposições |
| Teste | o Alfa distribuído no código não menciona nenhum tema de Beta |

Falso positivo custa um aviso descartável — é o preço certo para regex sobre texto livre,
desde que o trecho apareça junto.

### 6.1 Remissão entre camadas não é sobreposição

Medido em 2026-08-06 contra o `NUCLEO_ENXUTO` real. Com padrões ingênuos, 6 dos 8 temas de
Beta dão **zero** ocorrência no Alfa — ele está limpo, como o doc 15 §5 afirmava. Mas
`nomes_proprios` dava três, e as três eram falso positivo de espécies diferentes:

| Linha do Alfa | Por que casou | Por que não é sobreposição |
|---|---|---|
| *"Alterne apenas entre nome próprio, pronome e sujeito oculto"* | as palavras "nome próprio" | é a regra de **variação elegante**, tema de Alfa |
| *"Traduzir ou transliterar é decidido na Seção 5 (Nomes próprios)"* | idem | é uma **remissão**: o Alfa entrega o tema a Beta |
| *"Nunca deixe a unidade transliterada"* | `/translitera/` | é **unidade de medida**, tema de Alfa |

Duas consequências de desenho:

1. **Os padrões miram a decisão, não o vocabulário.** `nomes_proprios` reconhece
   `nomes? pr[óo]prios? *[—:]`, `(?:em|para) pinyin`, `pinyin, sem` — as formas em que a
   *política* é enunciada — e não a mera presença das palavras.
2. **Remissão é isenta.** Um Alfa bem escrito **deve** dizer "isto se decide na Seção 5":
   é a partição funcionando à vista. Linha que casa com
   `/decidid[oa] n[ao] Se[çc][ãa]o \d|ver (?:a )?Se[çc][ãa]o \d|Se[çc][ãa]o \d \(/i` não
   gera aviso.

Com as duas regras, o Alfa distribuído fica limpo nos 8 temas, e cada variante de Beta
acende o seu — validado nos dois sentidos antes de este plano ser escrito.

## 7. Fora de escopo

- Renomear Delta, `prompts.tipo` ou `{{DELTA_OBRA}}` (restrição do dono).
- Cortar versão nova de Alfa (§4).
- Bloquear qualquer coisa. Todas as checagens são aviso.
- Idempotência de `importarObra`: era o pré-requisito da opção (b) do §8, descartada.

## 8. Sequência

1. Hierarquia do glossário (§4) — dois cabeçalhos, vale para tudo, independe do resto
2. Vocabulário Ômega no código (§2.1) — antes do código novo, para nascer com o nome certo
3. Registro de temas (§5)
4. As três checagens e o teste (§6)
5. A skill `camadas-do-prompt` — a disciplina que precisa sobreviver ao chat
6. Instância única no VPS (§3) — operacional, exige as mãos do dono
