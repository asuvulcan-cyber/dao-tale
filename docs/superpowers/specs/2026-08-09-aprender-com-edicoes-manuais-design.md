# Aprender com as edições manuais

Desenho para o item 3 do relato de 2026-08-08: *"seria bom uma forma de analisar o que
eu mudei à mão e a partir disso melhorar o prompt; normalmente o que mudo à mão não tem
relação com o que peço para revisar pela IA."*

A premissa estava certa e a medição a corrigiu num ponto decisivo: **o que o usuário
muda à mão não é invisível ao app — 40% já era detectado e apontado, e ele consertava
mesmo assim, uma frase por vez.**

## 1. A medição

Obra 1 (死人经), 2026-08-09, contra o banco de produção.

| Medida | Valor |
|---|---|
| Frases traduzidas | 561 |
| Frases com edição manual e diferença real | **146** |
| Casos no banco de testes (o canal "oficial") | 25 |
| Das 146, só tipografia (aspas curvas, ênfase) | 14 (10%) |
| Das 146, com mudança de conteúdo | 132 (90%) |
| **Das 146, o scanner de estilo já acusava algo** | **58 (40%)** |
| …e a edição do usuário reduziu as violações | 55 |
| Regras que o scanner acusava | 57× `mais-que-perfeito`, 16× `aspas-nao-retas` |
| Estoque pendente hoje | 3 violações em 561 frases · 29 dispensas |

O padrão dominante nas edições de conteúdo é a forma sintética do mais-que-perfeito
sendo desfeita à mão:

```
errara    → errou            fora      → era / tinha sido / foi
tomara    → tomou            cumprira  → tinha cumprido
perdera   → perdeu           conseguira→ tinha conseguido
```

`fora` virou coisas diferentes em frases diferentes. **A correção depende do contexto,
não da morfologia** — é o que exclui um conversor determinístico.

O resíduo que o scanner não vê traz outra natureza: `"morto" → "cadáver"`,
`"espadachins seus subordinados" → "homens de sabre sob seu comando"`,
`"Jinpeng" → "do Peng Dourado"`, `"o outro" → "o inimigo"`.

## 2. As duas metades, e por que num spec só

**Parte A — fechar o laço no que já é detectado.** O app aponta e não ajuda a consertar.
Isto é a "Etapa 5 / duas passagens" que o doc 09 adiou, e é o caminho que
`docs/superpowers/specs/…` e a investigação de anterioridade já tinham apontado: *passe
de correção sobre as frases acusadas, com decisão humana.*

**Parte B — ler o resíduo.** As ~88 edições que o scanner não vê, classificadas e
roteadas por camada.

Vão juntas porque compartilham a mesma leitura — o par
`texto_pt_original_ia → texto_pt` — e o mesmo princípio: **nada entra sozinho; o usuário
aprova cada mudança.**

**Fora de escopo:** a varredura de consistência na obra inteira (spec próprio) e o
catálogo universal de erros (§9).

## 3. Parte A — O passe de estilo

### 3.1 Escopo

Só as frases que `analisarEstilo` já acusa, descontadas as dispensas de
`estilo_ignorado`. Não é uma segunda passagem sobre o capítulo: é sobre a lista que a
tela de estilo já mostra hoje.

### 3.2 Rota e contrato

`POST /capitulos/:id/estilo/passe` monta um lote com as frases acusadas — cada uma com a
`regra` violada, o `trecho` que a disparou, e as vizinhas de contexto — e chama o
provedor com um contrato novo, `CONTRATO_PASSE_ESTILO`:

```
correcoes: [{
  ordem              number        a frase
  regra              string        a violação que motivou (ecoada, para conferência)
  trecho_pt_errado   string        cópia LETRA POR LETRA do texto atual
  trecho_pt_corrigido string
  descartar          boolean       true = "aqui não há violação de verdade"
}]
```

O par cirúrgico é o mesmo da revisão, então a aplicação reusa `aplicarCorrecao`
(`shared/src/index.ts`) inteira, **incluindo** o aviso de proposta curta demais e o
caminho de fallback quando o modelo não coopera.

`descartar` existe porque o scanner é heurístico por sufixo: `romãzeira`, `Voadora` e
`prepara` já apareceram como falso positivo. Dar ao modelo uma saída honesta é melhor
que forçá-lo a inventar correção para o que está certo — e o que ele descarta vira
sugestão de dispensa na tela, nunca dispensa automática.

### 3.3 As instruções

O bloco operacional diz, em resumo: conserte **apenas** a violação apontada; não toque em
mais nada da frase; se a violação for falso positivo, marque `descartar` e não proponha
nada. É o que separa isto de uma retradução — e retradução é justamente o que faria o
usuário perder as correções que já tinha feito à mão.

Temperatura: a do papel `revisao` (é veredito, não criação).

### 3.4 Modelo e custo

Papel próprio na telemetria: **`estilo`**. Sem isso o custo do passe se mistura com o da
revisão e a aba Custos deixa de responder "quanto me custa consertar estilo". `eventos_ia.papel`
tem `CHECK`, então isso exige a migração `023` (ver §5).

O par provedor/modelo segue a cadeia do papel `revisao` (config `provedor_revisao` /
`modelo_revisao`), com o mesmo `failover` das demais chamadas.

### 3.5 A tela

Uma tela por capítulo, alcançável do mesmo lugar onde a varredura de estilo já vive.
Lista uma linha por violação: a frase com o trecho destacado, a proposta, e três ações —
**Aplicar**, **Editar** (abre o trecho para você digitar), **Dispensar** (grava em
`estilo_ignorado`, como hoje). Mais um **Aplicar os marcados** no pé, para o caso em que
as propostas estão obviamente certas.

Aplicar grava por `reposFrases.editarTexto`, que marca `editado_manualmente = 1` — o que
significa que **uma correção aplicada aqui não vira, ela mesma, material de aprendizado
na Parte B**. Ver §4.3.

## 4. Parte B — A mineração do resíduo

### 4.1 Custo zero de IA

A classificação é determinística e usa três máquinas que já existem. Nenhuma chamada
nova: o único consumo de IA é o refinamento que **já existe**, agora com mais material.

### 4.2 O roteamento

Para cada frase com `editado_manualmente = 1` e `texto_pt_original_ia <> texto_pt`,
calcula-se o **menor trecho que mudou** e roteia-se.

Esse cálculo é uma **função nova** — não existe hoje. `aplicarCorrecao` vai no sentido
contrário (recebe o par e aplica). Entra em `shared/src/index.ts`, pura e testável:

```ts
/** O menor trecho que difere entre dois textos: corta o prefixo e o sufixo comuns.
    É o inverso de `aplicarCorrecao` — dela sai o par que a correção cirúrgica
    consumiria. */
export function trechoQueMudou(antes: string, depois: string): { de: string; para: string };
```

| Teste, nesta ordem | Rota |
|---|---|
| Normalizado (aspas, travessão, reticências, ênfase, espaços), o par fica igual | **tipografia** — não ensina nada; some do relatório |
| O trecho antigo contém termo do glossário fora da forma canônica (`contemTermoFlexionado`) | **glossário** — é curadoria, não regra de prompt |
| `temasNoTexto(trecho)` casa tema de **beta** | **chave de estilo** — vire a chave, ou o modelo desobedeceu |
| `temasNoTexto(trecho)` casa tema de **alfa** | **núcleo** — falha universal; matéria-prima do catálogo (§9) |
| Nada casou | **candidato a diretriz** — vai ao refinador |

A ordem importa: glossário antes de tema, porque `Jinpeng → do Peng Dourado` casaria o
tema `glossario` de qualquer jeito, mas o que interessa é *qual termo*, não *que é
glossário*.

### 4.3 O que não entra

- Frases cuja edição veio de **Aplicar correção** (revisão) ou do passe da Parte A: elas
  já são decisão registrada em outro canal, e recontá-las como "o que você mudou à mão"
  contaria a mesma lição duas vezes. Distinguir isso exige saber a origem da edição —
  ver §5, coluna `origem_edicao`.
- Frases classificadas como **tipografia**.

### 4.4 A entrada no refinamento

`RequisicaoRefinarPrompt` ganha `edicoes`, ao lado de `casos` e `recusados`:

```
edicoes: [{
  trecho_zh   string   o chinês da frase inteira (o original é o árbitro)
  ia          string   texto_pt_original_ia
  voce        string   texto_pt (o que o revisor deixou)
  mudou       { de: string; para: string }   o menor trecho que difere
}]
```

A frase inteira vai junto do trecho porque `morto → cadáver` isolado não diz nada; é a
frase que mostra por que a troca foi feita.

E `usuarioRefinarPrompt` ganha a seção *"### Correções que o revisor fez à mão (a IA
nunca soube)"*, com a instrução de que estas são o padrão que o revisor pratica sem
pedir — e portanto o sinal mais forte de todos, mas também o mais bruto: só vira regra
quando o mesmo tipo de correção se repete.

Limite: até 15 edições por chamada, as mais recentes. É o mesmo espírito do teto de 5
casos por seção recorrente — chamada enxuta e representativa.

### 4.5 A tela

Uma tela por obra, *"O que você corrigiu à mão"*, com a contagem por rota e a lista
dentro de cada uma. Da rota **candidato a diretriz** sai um botão que inclui essas
edições no próximo refinamento. Sem esse botão, a mineração vira relatório que ninguém lê.

## 5. Dados — migração `023`

Duas mudanças, ambas exigindo reconstrução por `CHECK` (padrão da 007):

| Tabela | Mudança |
|---|---|
| `eventos_ia.papel` | `CHECK` ganha `'estilo'` |
| `frases` | coluna nova `origem_edicao TEXT` — `NULL` (manual), `'revisao'`, `'passe-estilo'`, `'qa'` |

`origem_edicao` é escrita por quem aplica: `reposTestes.aplicarCorrecao` grava
`'revisao'`, o passe grava `'passe-estilo'`, a aplicação de sugestão de QA grava `'qa'`,
e a edição pelo editor deixa `NULL`. Os dados existentes migram com `NULL` — ou seja,
tudo que já está lá conta como manual, que é a leitura correta do histórico: nenhuma das
146 veio de um botão que ainda não existia.

`frases` não tem `CHECK` a alterar, então a coluna entra por `ALTER TABLE ADD COLUMN`;
só `eventos_ia` pede rebuild.

## 6. O que muda no que já existe

- `reposFrases.editarTexto` ganha parâmetro `origem` com default `null`, para os
  chamadores atuais seguirem compilando.
- `reposTestes.aplicarCorrecao` passa `'revisao'`.
- A rota de sugestão de QA que aplica correção passa `'qa'`.
- `usuarioRefinarPrompt` e `sistemaRefinarPromptPartes` ganham a seção da §4.4.
- `obras.ts`, na montagem do refinamento, junta as edições candidatas ao material.

## 7. Testes

1. **Classificação — tipografia**: `‘x’ → 'x'` roteia para tipografia e não aparece no
   relatório.
2. **Classificação — glossário**: edição que troca `Jinpeng` por `Peng Dourado`, com o
   termo no glossário, roteia para glossário.
3. **Classificação — beta**: edição que desfaz `-ara` roteia para chave de estilo.
4. **Classificação — alfa**: edição que troca `a outra parte` por um nome roteia para
   núcleo.
5. **Classificação — sem tema**: `morto → cadáver` roteia para candidato a diretriz.
6. **Ordem do roteamento**: uma edição que casaria glossário E tema vai para glossário.
7. **`origem_edicao`**: aplicar correção pela revisão grava `'revisao'`; a frase deixa de
   aparecer na mineração.
8. **Migração 023**: `papel = 'estilo'` é aceito; eventos existentes preservados;
   `origem_edicao` nasce `NULL` em todas as frases.
9. **Contrato do passe**: `descartar: true` é resposta válida sem par cirúrgico;
   `descartar: false` exige o par.
10. **Passe aplica cirurgicamente**: uma frase com duas violações recebe duas propostas e
    aplicar uma não desfaz a outra.

## 8. Riscos

**O passe vira retradução disfarçada.** Se o modelo devolver um `trecho_pt_errado` que é
a frase inteira, aplicar apaga o que o usuário já tinha ajustado. Mitigação: o aviso de
proposta curta demais já existe e é reusado; e o teste 10 trava o caso de duas violações.

**Trecho repetido derruba a aplicação cirúrgica.** `aplicarCorrecao`
(`shared/src/index.ts:156-157`) só aplica quando o `trecho_pt_errado` aparece **uma única
vez** na frase; havendo duas ocorrências, ele cai no caminho da frase inteira. Uma frase
com `errara … errara` produziria duas propostas com o mesmo trecho, e a segunda não teria
onde ancorar. Mitigação: as instruções do passe pedem que o trecho inclua palavras
vizinhas suficientes para ser único na frase, e a tela mostra o resultado de
`aplicarCorrecao` antes de gravar — quando ele volta `frase-inteira`, a linha aparece
marcada e o botão exige confirmação, como na revisão.

**A mineração vira ruído.** 146 edições numa obra, com 88 no resíduo, é muito para ler de
uma vez. Mitigação: a tela agrupa por rota e o botão só oferece a rota que serve; o teto
de 15 por chamada mantém o refinamento enxuto.

**`origem_edicao` mente para o histórico.** As 146 edições existentes migram como
manuais, o que é verdade hoje. Mas se alguém aplicar uma correção de revisão numa dessas
frases depois, a coluna passa a dizer `'revisao'` e a edição manual anterior some da
mineração. É perda aceitável — a informação de que houve edição manual antes não está
gravada em lugar nenhum, e inventá-la agora seria pior.

## 9. Não-objetivos, e o gancho para o catálogo

- Não classifico edição por IA. Se o determinístico não souber dizer o que uma edição é,
  ela vai ao refinador como caso bruto; a IA decide lá, na chamada que já acontece.
- Não implemento a varredura de consistência na obra inteira: spec próprio.
- **Não construo o catálogo universal de erros** — mas a rota **núcleo** da §4.2 existe
  para ser a matéria-prima dele. Uma edição classificada como `alfa` é, por definição,
  falha que não depende desta obra: é o que um catálogo zh→pt-BR reaproveitável quer
  colecionar. O spec do catálogo consome essa rota; este aqui só garante que ela saia
  separada, em vez de se dissolver no meio das diretrizes da obra.
