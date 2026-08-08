# Revisão como conversa

Desenho para os itens 1 e 2 do relato de 2026-08-08: o Protocolo de Revisão responde
com rigidez e ignora o motivo declarado da dúvida; e não há como replicar nem recusar.

A auditoria do banco em produção acoplou a este trabalho duas coisas que pareciam
separadas — os rótulos de regra e o roteamento do refino do prompt. Elas entram aqui
porque compartilham a mesma causa: **o rótulo de regra não carrega a camada a que
pertence**, e sem isso cada consumidor redescobre o assunto por conta própria.

Fora do escopo, com spec próprio: aprender com as edições manuais (item 3) e a
varredura de consistência na obra inteira (item 4).

## 1. A evidência

Casos **#23** e **#24** do banco de testes da 死人经 (`obra_id 1`), mesma frase (`362`,
cap. 6, ordem 20), 3 minutos de diferença, mesmo modelo (`deepseek-v4-pro`).

O original: `他还一直以为金鹏堡纵横西域无人敢碰呢`

**#23** — a pergunta declarava dois motivos: 以为 carrega "acreditar erroneamente /
presumir", e 一直 ali é continuidade *até aquele momento*, não um "sempre" atemporal.
A resposta parafraseou os dois motivos na `justificativa` e então virou a chave no meio
da frase — *"**Conforme a regra 5-mais-que-perfeito**, para marcar a anterioridade…"* —
e propôs `Ele sempre achou` → `Ele sempre tinha achado`. Consertou o tempo verbal e
manteve intactas as duas palavras questionadas. Veredito: **incorreto**.

**#24** — a réplica dizia, literalmente, *"aqui não entra a regra do mais que perfeito,
vc está confundindo as regras"*, e oferecia duas traduções. A resposta veio argumentando
**a mesma regra ao contrário** (*"a anterioridade já marcada por advérbios como 一直
(sempre) dispensa o verbo no mais-que-perfeito"*), glosando 一直 como "(sempre)" —
exatamente a equivalência em disputa. Não avaliou nenhuma das duas opções, não tocou em
以为, e não sabia que #23 existia. Veredito: **correto**.

Três mecanismos produziram isso, todos verificáveis no código:

1. **A citação de regra é obrigatória.** `justificativa` é definida como "explicação
   objetiva citando a regra/seção do prompt da obra aplicável" e `secao_regra` é campo
   `required` ([prompts.ts:204](../../../server/src/ia/prompts.ts#L204),
   [contratos.ts:210](../../../server/src/ia/contratos.ts#L210)). O modelo **tem** que
   sair com uma regra na mão, mesmo quando a dúvida não é de regra.
2. **A lista de rótulos é um ranking.** `rotulosDeRegra` ordena por `COUNT(*) DESC`
   ([repos.ts:1122](../../../server/src/db/repos.ts#L1122)) e a instrução diz "REUSE um
   deles". O rótulo mais usado é o mais oferecido, o mais escolhido, e volta maior ainda.
   Na 死人经, `5-mais-que-perfeito` tem 9 dos 25 casos e encabeça a lista de toda revisão.
3. **Não existe fio.** Cada pergunta é uma linha solta em `banco_testes`; a segunda
   chamada não recebe a primeira. "Replicar" é reiniciar.

A raiz do caso concreto é menor que tudo isso e vive fora deste spec: a lista de gatilhos
da chave `mais_que_perfeito: evitar`
([preferenciasEstilo.ts:192](../../../shared/src/preferenciasEstilo.ts#L192)) enumera
曾经, 已经, 从来(没), 向来, 从小, 自幼, 早已 e o aspecto 过 — e **não inclui 一直**, embora
inclua 向来, quase sinônimo. Os dois vereditos opostos são o modelo adivinhando nos dois
sentidos de uma lista incompleta. Ver §3.

### Números que orientam as decisões

| Medida (obra 1, 2026-08-08) | Valor |
|---|---|
| Casos no banco de testes | 25 |
| Recorrência nº 1 (`5-mais-que-perfeito`) | 8 casos — mais que o dobro da 2ª |
| Casos rotulados `geral` | 5 (3 contam como recorrência) |
| Delta da obra (`prompts.conteudo`) | **0 chars**, nas duas versões |
| Chamadas de refinamento | 2, ambas em 2026-08-05 |
| Frases com edição manual e diferença real | **146** de 485 |
| Eventos de IA com `custo_estimado` | **0 de 35** |

## 2. Escopo

**Entra:** contrato da revisão, fio de réplicas, recusa com motivo, camada no rótulo de
regra, roteamento do refino por camada, a gaveta, portabilidade e testes.

**Não entra:** item 3 (aprender com as edições manuais) e item 4 (varredura obra-inteira).
A §9 registra os ganchos que este trabalho deixa prontos para eles.

## 3. Fase 0 — três consertos que não dependem deste desenho

Independentes entre si e do resto do spec. Podem ir antes, e valem por si.

**3.1 一直 na lista de gatilhos.** Acrescentar 一直 à enumeração de
[preferenciasEstilo.ts:192](../../../shared/src/preferenciasEstilo.ts#L192), junto de
向来. É texto de camada **Beta** — chave de estilo, não núcleo —, portanto não pede
versão nova de Alfa. O teste é o par de #23/#24: com o gatilho presente, a leitura
correta (`perfeito simples`, sem mais-que-perfeito) deixa de depender de sorte.

**3.2 Preços dos modelos em uso.** `precos_modelos` cobre só `claude:*`; os modelos
realmente usados (`deepseek:deepseek-v4-flash`, `deepseek:deepseek-v4-pro`,
`gemini:gemini-flash-latest`) não têm preço, e por isso `custo_estimado` é `NULL` em
100% dos eventos e a aba Custos está vazia. Cadastrar os três com os valores da tabela
vigente de cada provedor **no dia do conserto** — não estimar de memória — e rodar
`POST /telemetria/recalcular`
([sistema.ts:85](../../../server/src/rotas/sistema.ts#L85)) para preencher o histórico.
Preencher também `taxa_usd_brl`, hoje em `0`.

*Critério de aceite:* nenhum evento novo com `custo_estimado IS NULL` para os modelos
cadastrados, e a aba Custos mostrando valor diferente de zero.

**3.3 `cotas_diarias` sem deepseek.** A configuração lista gemini, openrouter e groq;
deepseek é o provedor padrão e está de fora. Acrescentar com a cota real (ou `0` para
"sem teto", como os outros), para o indicador de cota parar de mentir por omissão.

## 4. Dados — migração `022`

Três das mudanças exigem reconstrução da tabela (o SQLite não altera `CHECK` nem
`NOT NULL`), então todas vão juntas, no padrão de
[007](../../../server/src/db/migrations/007_fase_e_status_parcial.sql).

| Coluna | Mudança |
|---|---|
| `caso_pai_id` | nova, `INTEGER REFERENCES banco_testes(id) ON DELETE CASCADE` |
| `veredito` | `CHECK` passa a `('correto','incorreto','escolha-legitima')` |
| `status` | `CHECK` passa a incluir `'rejeitado'` |
| `resposta` | nova, `TEXT NOT NULL DEFAULT ''` |
| `justificativa` | passa a `TEXT NOT NULL DEFAULT ''` |
| `motivo_rejeicao` | nova, `TEXT` |

Índice novo: `idx_testes_pai ON banco_testes(caso_pai_id)`. Os índices existentes
(`idx_testes_obra_status`, `idx_testes_secao`) são recriados.

**Migração dos dados existentes**, no mesmo `INSERT … SELECT`:

- `caso_pai_id = NULL` — todo caso antigo vira raiz de um fio de um turno só.
- `resposta = justificativa` — o texto que existe é a resposta que houve. Nada se perde,
  e a tela nova não fica com campo vazio no histórico.
- `secao_regra = NULL WHEN secao_regra = 'geral'`. "Geral" quer dizer, no próprio
  contrato, "nenhuma regra específica se aplica"; contá-lo como recorrência agrupava
  coisas sem relação (5 casos na obra 1, 3 deles contando como lacuna sistemática).
  `recorrencias` já exige `IS NOT NULL`, então a exclusão sai de graça.

## 5. O contrato da revisão

### 5.1 Schema

`respostaRevisaoSchema` ([respostas.ts:35](../../../server/src/ia/respostas.ts#L35)) e
`CONTRATO_REVISAO` ([contratos.ts:192](../../../server/src/ia/contratos.ts#L192)):

```
resposta             string                                    ← NOVO, obrigatório
veredito             'correto' | 'incorreto' | 'escolha-legitima'
secao_regra          string | null      ← some o .default('geral'); sai de `required`
justificativa        string             ← '' quando não há regra; sai de `required`
correcao_proposta    string | null      ← inalterado
trecho_pt_errado     string | null      ← inalterado
trecho_pt_corrigido  string | null      ← inalterado
trecho_zh            string             ← inalterado
```

`resposta` é o texto que o revisor lê primeiro e que trata do motivo declarado.
`justificativa` deixa de ser prosa obrigatória e passa a existir só quando uma regra de
fato decide o caso — é o par natural de `secao_regra`, e os dois nascem e morrem juntos.

`escolha-legitima` cobre o que hoje é espremido em "correto": a tradução não está errada,
mas também não é a única leitura defensável. Em `reposTestes.criar`
([repos.ts:1009](../../../server/src/db/repos.ts#L1009)) nasce com status `confirmado`,
como `correto`.

### 5.2 Instruções

O bloco operacional de `sistemaRevisaoPartes`
([prompts.ts:198](../../../server/src/ia/prompts.ts#L198)) ganha, em substituição à
descrição atual de `justificativa`:

- A pergunta do usuário é a **premissa** da análise, não o endereço da frase.
- Se ela declara um motivo ("o original diz X", "isto soa Y", "no capítulo anterior
  ficou Z"), a `resposta` **tem** de tratar desse motivo — confirmando-o ou refutando-o
  pelo texto-fonte. Nunca substituir o motivo do usuário por outro argumento.
- Se o motivo não procede, dizer isso e mostrar onde no chinês. Concordar por concordar
  é pior que discordar.
- Só citar regra quando a regra é o que decide o caso. Caso contrário, `secao_regra`
  em `null` e `justificativa` vazia — a maior parte das dúvidas de tradução não tem
  regra por trás.

E em `usuarioRevisao` ([prompts.ts:251](../../../server/src/ia/prompts.ts#L251)) o
cabeçalho da pergunta ganha moldura, no lugar onde já está:

```
### PERGUNTA DO USUÁRIO (a premissa da sua análise — trate do motivo que ela declara):
```

### 5.3 Provedores

`revisarFrase` existe em quatro implementações: `claude.ts`, `gemini.ts`, `compat.ts`
(deepseek, openrouter, groq, mistral) e `mock.ts`. As três primeiras derivam o formato de
`CONTRATO_REVISAO`, então acompanham o schema sem edição própria; confirmar caso a caso.
O `mock.ts` tem heurística escrita à mão
([mock.ts:206](../../../server/src/ia/mock.ts#L206)) e precisa passar a devolver
`resposta` e a exercitar `escolha-legitima` — é o provedor dos testes.

## 6. O fio de réplicas

### 6.1 Modelo

Cada réplica é um caso novo com `caso_pai_id` apontando para o anterior. O fio é a
cadeia; a **folha** é o turno vigente.

```
#23  pergunta original          caso_pai_id = NULL
 └─ #25  réplica                caso_pai_id = 23
     └─ #26  réplica            caso_pai_id = 25      ← folha
```

### 6.2 Rota

`POST /frases/:id/revisar` ([frases.ts:113](../../../server/src/rotas/frases.ts#L113))
aceita `caso_pai_id?: number` no corpo. Validação: o pai tem de existir, ser da mesma
frase e **ser folha** (não ter filho) — replicar no meio de um fio é ambiguidade sem
utilidade, e devolve `400 pai-invalido`.

`RequisicaoRevisao` ([provedor.ts:99](../../../server/src/ia/provedor.ts#L99)) ganha:

```ts
/** Turnos anteriores do fio, do mais antigo ao mais recente. Sem eles a réplica
    reinicia a dúvida: foi o que produziu vereditos opostos nos casos #23/#24. */
turnosAnteriores?: {
  pergunta: string;
  resposta: string;
  veredito: string;
  secao_regra: string | null;
  correcao_proposta: string | null;
  recusado: boolean;
  motivo_rejeicao: string | null;
}[];
```

Montado na rota subindo a cadeia de `caso_pai_id`. **Teto de 6 turnos**: acima disso,
mantém o primeiro (que fixa a dúvida) e os 5 mais recentes, com uma linha dizendo quantos
foram omitidos. Sem teto, uma discussão longa cresce o prompt sem limite e não cabe no
desenho de cache.

### 6.3 No prompt

`usuarioRevisao` ganha, **antes** da frase questionada:

```
### Discussão até aqui (você já respondeu isto; o usuário replicou):
[turno 1] usuário: …
[turno 1] você: (veredito) …
[turno 2] usuário: …
```

E o operacional ganha: quando há discussão anterior, a resposta deve dizer
explicitamente se **mantém** ou **revisa** o veredito anterior, e por quê. Repetir o
argumento já contestado sem endereçar a contestação é o defeito a evitar.

## 7. Recusar o veredito

`PATCH /testes/:id` ([curadoria.ts:244](../../../server/src/rotas/curadoria.ts#L244))
aceita `status: 'rejeitado'` com `motivo_rejeicao?: string` (livre, até 500 caracteres).

Vale para qualquer veredito, inclusive `correto` — discordar de um "está correto" é tão
legítimo quanto recusar uma correção, e hoje não há como.

Consequências, todas necessárias para o botão significar alguma coisa:

- `recorrencias` ([repos.ts:1086](../../../server/src/db/repos.ts#L1086)) já lista status
  explicitamente, então `rejeitado` fica fora sem edição. **Mas** a consulta passa a
  contar **só a folha de cada fio** — sem isso uma discussão de quatro réplicas vira
  quatro lacunas falsas.
- `rotulosDeRegra` ignora casos `rejeitado`: rótulo nascido de veredito que o revisor
  recusou não deve voltar como sugestão ao modelo.
- O filtro de casos do refino ([obras.ts:456](../../../server/src/rotas/obras.ts#L456))
  passa a exigir folha-do-fio e a excluir `rejeitado`.
- `STATUS_CASO_ROTULO` no front ganha a etiqueta.

## 8. Rótulos de regra e camada

### 8.1 O problema

`secao_regra` é texto livre inventado pelo modelo, normalizado por
`normalizarSecaoRegra` e convergido para a grafia mais frequente. Ele **não carrega a
camada**, e por isso cada consumidor redescobre o assunto sozinho: `obras.ts` chama
`preferenciaQueCobre`, `recorrencias` não olha nada, a tela não mostra nada, e o modelo
recebe uma lista sem distinção.

O registro `TEMAS` ([temasDoPrompt.ts:71](../../../shared/src/temasDoPrompt.ts#L71)) já
é a fonte de verdade de quem é dono de quê, e já traz `padraoRotulo` justamente para
reconhecer tema **dentro de um rótulo**. Falta usá-lo inteiro.

### 8.2 `camadaDoRotulo`

Função nova no `shared`:

```ts
/** Tema do registro que este rótulo de regra invoca, e a camada dona dele.
    null = rótulo sem tema conhecido — candidato legítimo a diretriz de obra. */
export function camadaDoRotulo(rotulo: string): { tema: Tema; camada: Camada } | null
```

Lê `TEMAS` por `padraoRotulo ?? padrao` sobre o rótulo normalizado, **sem** o recorte
`filtravel` e **sem** o recorte `dono === 'beta'` que `preferenciaQueCobre` aplica — os
dois recortes existem porque aquele caminho derruba candidato em silêncio, e este só
informa. `preferenciaQueCobre` ([index.ts:65](../../../shared/src/index.ts#L65)) passa a
ser o caso particular: `camadaDoRotulo(r)` com `camada === 'beta'` e `tema.filtravel`.

Nada é gravado em coluna: o registro evolui e um valor gravado envelheceria. É a mesma
razão de `temasNoTexto` ser função pura.

### 8.3 A lista enviada ao modelo

`rotulosDeRegra` perde o `ORDER BY COUNT(*) DESC` e passa a devolver ordem alfabética
com a camada de cada rótulo. `usuarioRevisao` renderiza agrupado:

```
### Rótulos de regra já usados nesta obra
Diretrizes da obra:     1-prosa-nao-legenda, 4-sem-decalque
Chaves de estilo (S.5): 5-mais-que-perfeito, 5-nomes-proprios, 5-registro

Use um destes SÓ se a regra em questão for a mesma. A maior parte das dúvidas
não é de regra — nesse caso deixe secao_regra em null.
```

Dois efeitos: acaba o laço "mais usado → mais oferecido → mais usado", e o modelo passa a
ver que `5-mais-que-perfeito` é chave de estilo, não regra a ser argumentada caso a caso.

**Seleção e apresentação são coisas diferentes.** O `LIMIT 30` continua escolhendo por
frequência — numa obra com 200 rótulos, cortar alfabeticamente descartaria tudo depois do
"m". O que muda é só a **ordem em que os 30 escolhidos são mostrados**, que passa a ser
alfabética dentro de cada camada. Assim o corte segue relevante e o ranking deixa de ser
visível ao modelo.

### 8.4 Na tela

O Banco de Testes ([BancoTestes.tsx](../../../web/src/paginas/BancoTestes.tsx)) e o
histórico da gaveta mostram o rótulo com a etiqueta da camada. Hoje, olhando
"5-mais-que-perfeito" na lista, não há como saber que aquele caso nunca vai virar regra.

## 9. Refino do prompt

### 9.1 Roteamento por dono

Hoje a rota filtra só as recorrências cobertas por chave de Beta e devolve `409
so-preferencias` sem gastar a chamada ([obras.ts:430](../../../server/src/rotas/obras.ts#L430)).
Esse **comportamento** está certo e se mantém — o que muda por dentro é só a
implementação de `preferenciaQueCobre`, que passa a derivar de `camadaDoRotulo` (§8.2)
sem alterar o que devolve. O que falta é o ramo de **Alfa**:

```
recorrências (≥2 casos · folha do fio · sem rejeitados · secao_regra não nula)
│
├─ camada = beta   → "isto é chave: vire em Preferências de estilo"     [já existe]
├─ camada = alfa   → "isto é núcleo, ou o modelo desobedeceu"           [NOVO]
└─ sem tema        → candidato a diretriz → chamada paga ao refinador
```

Na obra 1, `4-sem-decalque` tem 2 casos e hoje passa direto: viraria uma diretriz de obra
sobre decalque, que é tema do **Alfa**. É a sobreposição que a partição por tema existe
para impedir, entrando pela porta do refinamento.

O ramo Alfa **não** é um 409 seco — a skill manda avisar, nunca bloquear. É um aviso com
os dois caminhos nomeados: ou a regra do núcleo tem buraco, e aí é versão nova de Alfa
com as duas medições exigidas pelo registro de temas; ou o modelo desobedeceu uma regra
que já existe, e aí o conserto é temperatura, modelo ou posição no prompt, não texto
novo. O 一直 da §3.1 é o exemplo vivo: o buraco era de Beta, e nenhuma diretriz nova
teria resolvido.

Quando **todas** as recorrências caem em beta/alfa, a resposta 409 nomeia a camada de
cada uma e o que fazer, em vez da mensagem única de hoje.

### 9.2 Os casos recusados como entrada

`usuarioRefinarPrompt` ([prompts.ts:371](../../../server/src/ia/prompts.ts#L371)) ganha
uma seção final:

```
### Casos em que o revisor RECUSOU o veredito da IA
- ZH: …
  Veredito recusado: … — …
  Motivo do revisor: …
```

E o operacional ganha: não propor regra que reproduza o erro desses casos; o motivo do
revisor é correção de rumo, não caso a ser generalizado.

É o único lugar do app onde o revisor diz **por escrito** por que a IA errou. Hoje isso
se perde inteiro.

### 9.3 O que continua igual

A IA propõe, o usuário edita e aprova como versão nova. Nada entra no Delta sozinho.

### 9.4 Gancho para o item 3

As edições manuais entram neste mesmo funil depois, como segunda fonte ao lado das
recorrências — o par `texto_pt_original_ia` → `texto_pt` já está gravado em 146 frases da
obra 1. Este spec não implementa nada disso; só evita fechar a porta: a montagem dos
casos em `obras.ts` fica numa função própria que recebe a lista de casos, em vez de
construí-la inline.

## 10. A gaveta

O **fio corrente** é o mais recente da frase (o que contém o caso de `criado_em` mais
novo). Ele ocupa a seção de revisão inteira, expandido, em ordem cronológica, com a caixa
de resposta no pé. "Sugerir termos" e "Segmentação" viram `<details>` fechados para dar
espaço. Os demais fios vão para "Revisões anteriores", **agrupados por fio** em vez de
linhas soltas, cada um recolhido e rotulado pelo veredito da sua folha.

Não existe estado "encerrado" gravado: perguntar de novo sem `caso_pai_id` abre um fio
novo, que passa a ser o corrente e empurra o anterior para a lista.

```
┌ Protocolo de Revisão ─────────┐
│ ZH │ PT [editável]            │
├───────────────────────────────┤
│ você  por que X? o original … │
│ IA    [escolha-legítima]      │
│       resposta…               │
│       [Aplicar] [Discordo]    │
│ você  não, porque …           │
│ IA    [incorreto] …           │
│ ┌─ responder ─────────────┐   │
│ └──────────────[Responder]┘   │
│ ▸ Sugerir termos              │
│ ▸ Segmentação                 │
└───────────────────────────────┘
```

Detalhes que importam:

- `resposta` é o texto grande. `justificativa` e `secao_regra` só aparecem quando existem,
  como uma linha discreta abaixo — deixam de ser o protagonista.
- "Discordo" abre um campo de motivo opcional e grava `rejeitado`. Não abre réplica
  automaticamente: descartar e discutir são gestos diferentes.
- Os avisos de proposta curta demais
  ([EditorCapitulo.tsx:1381](../../../web/src/paginas/EditorCapitulo.tsx#L1381)) e o
  `window.confirm` de "Aplicar correção" permanecem inalterados.
- `EditorCapitulo.tsx` já tem ~1500 linhas. A gaveta sai para um componente próprio
  (`web/src/componentes/GavetaRevisao.tsx`) como parte deste trabalho — não é refactor
  oportunista: o fio acrescenta estado e o arquivo já está no limite do que se lê inteiro.

## 11. Portabilidade

`portabilidade.ts` reinsere os casos na importação e eles **ganham id novo**
([portabilidade.ts:345](../../../server/src/db/portabilidade.ts#L345)). O `caso_pai_id`
precisa ser remapeado pelo mapa de ids antigos→novos, senão o fio aponta para o caso
errado — possivelmente de outra obra. É o defeito mais silencioso deste spec e tem teste
próprio (§12).

O schema de importação passa a aceitar os campos novos e a tolerar a ausência deles, para
que um export anterior a este spec continue importável: sem `resposta`, ela recebe o valor
de `justificativa`; sem `caso_pai_id`, fica `null`. O enum de `veredito` na importação
passa a aceitar os três valores — os exports antigos só trazem dois, e ambos continuam
válidos.

O CSV do banco de testes ([curadoria.ts:263](../../../server/src/rotas/curadoria.ts#L263))
ganha `caso_pai_id`, `resposta`, `motivo_rejeicao` e a camada do rótulo.

## 12. Testes

Além dos que acompanham cada mudança:

1. **Migração `022`** — banco com casos antigos (incluindo `secao_regra = 'geral'`) migra
   com `resposta = justificativa`, `'geral'` virando `NULL`, e nenhuma referência
   quebrada em `foreign_key_check`.
2. **Fio** — três turnos encadeados; a terceira chamada recebe os dois anteriores em
   `turnosAnteriores`, na ordem certa.
3. **Teto do fio** — 9 turnos produzem 6 enviados (o primeiro e os 5 últimos) e a linha
   de omissão.
4. **Pai inválido** — replicar num caso que já tem filho devolve `400 pai-invalido`.
5. **Recorrência conta só a folha** — fio de 4 turnos com o mesmo `secao_regra` conta 1,
   não 4.
6. **Rejeitado sai de tudo** — não conta em `recorrencias`, não aparece em
   `rotulosDeRegra`, não entra nos casos do refino.
7. **`camadaDoRotulo`** — `5-mais-que-perfeito` → beta; `4-sem-decalque` → alfa;
   `1-prosa-nao-legenda` → null. E `preferenciaQueCobre` continua devolvendo o mesmo que
   hoje para todos os rótulos do teste existente (não pode haver regressão).
8. **Roteamento do refino** — obra só com recorrência de alfa devolve 409 nomeando a
   camada e não gasta chamada.
9. **Portabilidade do fio** — exportar e reimportar uma obra com fio de 3 turnos preserva
   a cadeia com os ids novos.
10. **Contrato** — `secao_regra: null` e `justificativa: ''` são resposta válida;
    `escolha-legitima` grava status `confirmado`.

## 13. Riscos

**O modelo pode passar a concordar demais.** Instruir "trate do motivo que o usuário
declarou" empurra para a bajulação. A contramedida está na própria instrução ("se o
motivo não procede, diga isso e mostre onde no chinês") e na existência de
`escolha-legitima`, que dá uma saída honesta ao caso em que ambos têm razão parcial. O
sinal de alerta a monitorar é a proporção de `incorreto` subindo junto com a de correções
recusadas.

**O fio encarece a revisão.** Cada réplica é uma chamada, e carrega os turnos anteriores.
O teto de 6 turnos limita o pior caso; a §3.2 torna o custo visível, que é o pré-requisito
para julgar se compensa.

**`justificativa` vazia quebra consumidores.** Ela é `NOT NULL` hoje e vários lugares a
exibem direto. A migração dá `DEFAULT ''` e a busca por usos precisa ser exaustiva —
`usuarioRefinarPrompt`, CSV, export, BancoTestes.tsx, gaveta.

## 14. Não-objetivos

- Não se muda a segmentação, a tradução em blocos, nem o pipeline de fases.
- Não se implementa aprendizado com edições manuais (item 3) nem varredura obra-inteira
  (item 4).
- Não se corta versão nova de Alfa. O único texto de prompt tocado fora das instruções
  operacionais é a lista de gatilhos da §3.1, que é Beta.
