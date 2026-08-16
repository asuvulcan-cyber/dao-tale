# Glossário: espécie do termo, captura pela seleção e pertencimento

Desenho para o relato de 2026-08-16: plural/gênero/capitalização não casando, vontade de
separar "termo importante" de "tradução de palavra comum", hierarquia entre termos, e
adicionar um termo direto do texto.

**A medição reordena o pedido.** Duas das três queixas têm a mesma causa, e não é a que
parecia; uma terceira ideia encolhe até caber em três linhas de código.

## 1. O que a medição mostrou

### Flexão funciona na varredura e no modelo — e NÃO no grifo do editor

`contemTermoFlexionado` (`server/src/traducao/flexao.ts`) normaliza acento e caixa e
compara por radical. Testado contra os exemplos do relato:

```
CASA  "Assassino"      em "os assassinos atacaram."
CASA  "Homem de Sabre" em "Dois Homens de Sabre entraram."
CASA  "Senhor"         em "as Senhoras chegaram."
```

E a deduplicação de sugestões é por `termo_zh` (`repos.ts`, `registrarSugestoes` →
`reposGlossario.existeTermo`), então um termo já cadastrado nunca volta como sugestão
duplicada por causa de flexão no português.

**O modelo também já flexiona.** Formas de superfície realmente produzidas na obra 1
(1109 frases traduzidas, 2026-08-16):

| termo do glossário | frases com o gatilho | formas usadas |
|---|---|---|
| `杀手 → Assassino` | 77 | assassino×39, assassinos×17, **Assassino×14, Assassinos×11**, assassina×1 |
| `主子 → senhor` | 2 | senhor×2, **senhora×1, senhorita×1** |
| `刀 → sabre` | 58 | sabre×33, Sabre×12, sabres×10 |
| `喽罗 → capangas` | 4 | capangas×2, capanga×2 |

`主子` virou "senhora" quando o referente era mulher, sem ninguém pedir. Declarar as formas
permitidas (`senhor(a)`, `Senhores`…) resolveria um problema que não existe, e custaria
manutenção em 116 termos.

### Mas o grifo do editor tem outro casamento, e ele é literal

O ponto pontilhado sob os termos vem de `montarMarcadorGlossario`
(`web/src/componentes/TextoRico.tsx:24`), que **não** usa `contemTermoFlexionado`. Ele monta
uma alternância literal dos termos com fronteira de letra dos dois lados:

```js
new RegExp(`(?<![\\p{L}\\p{M}])(${termos.map(escapar).join('|')})(?![\\p{L}\\p{M}])`, 'giu')
```

A flag `i` explica por que "Assassino" e "assassino" são grifados igual. A fronteira à
direita explica o resto — reproduzido com os termos reais:

```
NÃO GRIFA  "Os Assassinos atacaram."
GRIFA      "O assassino sorriu."        → assassino
NÃO GRIFA  "as Senhoras chegaram."
NÃO GRIFA  "dois sabres"
GRIFA      "Dois Homens de Sabre."      → Sabre          ← pior que não grifar
```

A última linha é a mais grave e não estava no relato: o termo composto `Homem de Sabre`
falha, e `sabre` — outro termo do glossário — casa dentro dele. O revisor vê um grifo que
aponta para a entrada errada.

**São dois casadores para a mesma pergunta**, e só um sabe flexão. A correção não é
reescrever o grifo: é extrair as regras de `flexao.ts` para `shared/` e fazer os dois
consumirem a mesma fonte — que é o mesmo remédio aplicado a `orientacaoDaRegra` na entrega
do catálogo, pelo mesmo motivo (duas cópias divergem em silêncio).

### O que existe de verdade: a caixa é decidida no chute

`杀手` sai **57 vezes em minúscula e 25 em maiúscula**. Nada no app diz quando ele é o posto
na Fortaleza do Peng Dourado e quando é substantivo comum, então o modelo decide frase a
frase. A queixa da capitalização estava certa; a causa é outra.

### A raiz: duas espécies de coisa sob a mesma lei

O glossário guarda, com o mesmo "uso obrigatório e consistente":

- **Identidade** — `疏勒 → Shule`, `翠兰 → Cuilan`, `金鹏堡 → Fortaleza do Peng Dourado`. A
  forma de superfície **é** a resposta, caixa inclusive.
- **Escolha lexical** — `刀 → sabre`, `江湖 → jianghu`, `杀手 → assassino`. O que está fixo é
  a **palavra escolhida** (sabre, não faca); a superfície tem de variar à vontade.

O revisor já improvisa a distinção com a caixa: **41 dos 116 termos** começam em minúscula,
e alguns estão cadastrados no plural (`capangas`, `serviçais`, `técnicas de punho`). É
convenção que só existe na cabeça dele — o app não lê nada disso.

É a mesma distinção que o pedido "separar termo importante de palavra comum" descreve, e é
o que resolve "não quero que o glossário seja seguido à risca quando não é o caso
específico".

## 2. `especie`: campo próprio, não categoria

```ts
export type EspecieTermo = 'identidade' | 'lexical';
```

**Não é `categoria`.** `CategoriaGlossario` é `string` livre por decisão anterior (o usuário
cria as suas: hoje há 10, de `personagem` a `arte de energia interna`). Espécie precisa ser
fechada, porque o prompt e a varredura ramificam nela — categoria livre viraria
`Identidade`, `identidade `, `id` em três meses.

**Não é `principal_id`.** Esse campo já existe e diz *variante*: `芊芊` e `林芊` são o mesmo
referente com nomes diferentes. Espécie diz que tipo de lei o termo tem. Um termo pode ser
variante e lexical ao mesmo tempo.

O padrão de quem não declara é **`identidade`**: é o comportamento de hoje, e escolher o
outro mudaria o significado de 116 termos existentes sem ninguém olhar.

### O que muda no prompt

`formatarGlossario` (`server/src/ia/prompts.ts:17`) passa a emitir dois blocos em vez de uma
lista só:

- **Nomes e termos fixos** — "use exatamente esta forma, incluindo maiúsculas".
- **Escolhas de palavra** — "use esta palavra; flexione número, gênero e caixa como o
  português pedir".

A segunda instrução é o oposto do que o prompt diz hoje para esses termos, e é o objetivo
da entrega.

### `nota_uso`: a regra daquele termo, no ponto do uso

Campo de texto curto e opcional (ver §2b, que o generaliza para desambiguação):

> `杀手` · nota_uso: "Maiúscula só quando for o posto na Fortaleza do Peng Dourado."

Entregue junto **daquele termo**, na linha dele, como o `certo` do catálogo de erros — não
como regra geral no núcleo. A investigação de 2026-08-05 mediu texto de marcador no prompt
como sem efeito; texto no ponto do uso é o que funcionou.

## 2b. Termo ambíguo: quando o gatilho chinês não é o termo

Caso real de 2026-08-16, medido na obra 1: `小心 → Xiao Xin [personagem]` aparece em **8
frases traduzidas, e só 1 é a personagem**. As outras 7 são a expressão comum ("cuidado"),
e todas viram violação de consistência.

É o equivalente a ter uma personagem chamada **Socorro**: a varredura pergunta *"o chinês
tem 小心, logo o português tem de ter Xiao Xin?"* — e para um homógrafo essa pergunta está
errada em 7 dos 8 casos. A pergunta útil é a inversa: *quando o revisor escreveu o nome, ele
escreveu certo?*

**Nenhum sinal determinístico resolve.** Nem a categoria (`personagem` não implica
ambiguidade), nem o contexto chinês (小心 adverbial e 小心 nome ocupam as mesmas posições).
Pedir a desambiguação a uma IA transformaria uma varredura gratuita e determinística numa
chamada paga por frase — o oposto do que ela é.

Então o app **para de fingir que sabe**, com um campo:

```ts
/** O gatilho chinês nem sempre é este termo (小心 = "cuidado" e também a criada
 *  Xiao Xin). Tira o termo da varredura direta, que erraria a maior parte das
 *  vezes, e entrega a regra de desambiguação ao modelo na linha dele. */
ambiguo: boolean;
```

Duas consequências, e nenhuma delas mexe em `varrerConsistencia`:

1. **A varredura não recebe o termo.** Quem chama separa o glossário em checáveis e
   ambíguos e passa só os primeiros — a função pura continua intocada, que é a restrição do
   projeto. Os ambíguos aparecem numa lista própria da tela, rotulada *"confira caso a
   caso"*, sem entrar na contagem de violações. Contagem inflada por ruído é o que ensina o
   revisor a ignorar a tela, e 7 de 8 é ruído.
2. **O modelo recebe a regra.** A nota do termo vai na linha dele, no prompt — é onde a
   desambiguação tem chance de funcionar, porque é sobre aquele termo naquele trecho.

### `nota_uso` no lugar de `nota_caixa`

O campo que a §2 chamava de `nota_caixa` vira **`nota_uso`**, porque as duas notas são a
mesma coisa: uma linha sobre **quando e como** aquele termo se aplica, entregue na linha
dele.

> `杀手` · "Maiúscula só quando for o posto na Fortaleza do Peng Dourado."
> `小心` · "Só é a criada Xiao Xin quando for nome de pessoa; senão é 'cuidado'."

Dois campos separados sugeririam que capitalização e desambiguação são problemas
diferentes. Não são: os dois existem porque o par `zh → pt` sozinho não carrega a regra de
uso, e o remédio é o mesmo — texto curto no ponto do uso, nunca no núcleo.

## 3. Adicionar um termo pela seleção

Hoje o termo nasce longe do texto: o revisor lê uma frase, sai para a aba Glossário e
digita os dois lados de memória.

O app já tem o padrão: depois de uma correção manual, uma barra flutuante oferece propagar
a troca para a obra (`EditorCapitulo.tsx:1494`). A captura usa a mesma forma.

**O termo tem dois lados, e a seleção dá um.** Selecionar "Homens de Sabre" no português
não diz que o chinês é `刀手`. O fluxo:

1. Selecionar um trecho no português **ou** no chinês da frase aberta.
2. Aparece **Adicionar ao glossário**.
3. Abre um painel com o lado selecionado preenchido, o outro campo **vazio e com o foco**, e
   os campos de categoria e **espécie**.
4. O outro lado nasce vazio, sempre. A tentação é adivinhá-lo a partir da frase — mas
   "candidato óbvio" não tem definição que sobreviva ao texto real, e um palpite
   pré-preenchido num campo que o revisor está prestes a confirmar é pior que um campo
   vazio: ele é aceito sem leitura. Selecionar o outro lado é um gesto, e o editor mostra
   os dois idiomas na mesma frase.

**Sem IA.** Pedir o par ao modelo seria uma chamada paga para adivinhar o que o revisor sabe
olhando.

**Sem criação em um clique.** Espécie e categoria são escolhidas na hora, porque a seleção é
o momento em que o contexto está à vista — e criar sem classificar reproduziria exatamente o
estado que esta entrega existe para consertar.

Duplicata reusa o 409 de `POST /obras/:obraId/glossario`, que já existe, e o painel oferece
abrir o termo existente em vez de repetir o erro.

## 4. Pertencimento (`termo_pai_id`), escopado ao que paga

O pedido é maior — mapas de lugares, árvores familiares. Esta entrega leva **só** o que
melhora a tradução, e o critério é mecânico.

`filtrarGlossarioRelevante` (`server/src/ia/prompts.ts:54`) escolhe o que entra no prompt
por `corpo.includes(e.termo_zh)`: só o termo cujo chinês aparece literalmente no trecho.
Quando o texto diz apenas `西堡`, o modelo não recebe `金鹏堡` e não tem como saber que um
está dentro do outro.

```ts
/** O termo do qual este faz parte — pertencimento, não identidade.
 *  Distinto de `principal_id`, que é variante do MESMO referente. */
termo_pai_id: number | null;
```

E o filtro passa a **puxar o pai** de todo termo presente, um nível acima (não a raiz):
dois níveis já entregariam a obra inteira num trecho com um topônimo aninhado, e o filtro
existe para encolher o prompt, não para inflá-lo.

O pai entra **mesmo que o chinês dele não apareça no trecho** — é exatamente esse o ponto,
e é a única exceção à regra de que o filtro só admite termo presente no texto. Ele entra
uma vez só (nunca duplicado quando dois filhos compartilham o mesmo pai) e é renderizado
sob a espécie dele, não sob a do filho.

**Não entra:** tela de árvore, mapa visual, grafo. Sem evidência de que são consultados, é
construir para um fantasma — e o `termo_pai_id` fica gravado, então a tela pode nascer
depois sem migração nova.

## 5. Migração

Uma migração, três colunas, todas anuláveis — nenhuma reconstrução de tabela:

```sql
ALTER TABLE glossario ADD COLUMN especie TEXT;        -- NULL = 'identidade'
ALTER TABLE glossario ADD COLUMN nota_uso TEXT;
ALTER TABLE glossario ADD COLUMN ambiguo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE glossario ADD COLUMN termo_pai_id INTEGER REFERENCES glossario(id);
```

`especie` anulável em vez de `NOT NULL DEFAULT 'identidade'` porque a diferença importa: o
`NULL` distingue "nunca classificado" de "classificado como identidade", e é isso que
permite a tela pedir a classificação dos 116 antigos sem incomodar quem já respondeu.

**Nenhum backfill automático.** A tentação é classificar por heurística (minúscula →
lexical). Os 41 minúsculos são convenção do revisor, não dado — e chutar 116 vezes gera
exatamente os falsos positivos que treinam o revisor a ignorar a tela. A classificação é
pedida na tela, aos poucos, e o que não foi respondido segue como hoje.

## 6. Testes

1. **Padrão preserva o comportamento**: termo sem `especie` é tratado como `identidade`, e
   o bloco do prompt sai idêntico ao de hoje.
2. **Dois blocos**: com um termo de cada espécie, `formatarGlossario` emite os dois
   cabeçalhos, cada termo sob o seu.
3. **Instrução oposta**: o bloco lexical manda flexionar caixa e número; o de identidade,
   não. Teste por conteúdo, não por presença de cabeçalho.
4. **`nota_uso` no ponto do uso**: sai na linha daquele termo, e só nele; termo sem nota
   não emite linha vazia.
5. **`nota_uso` vale nas duas espécies**: um termo `identidade` e ambíguo (`小心`) emite a
   nota — ela diz QUANDO o termo se aplica, não como escrevê-lo, e a forma continuar sendo
   lei não a torna dispensável.
6. **Filtro puxa o pai**: trecho com `西堡` traz `西堡` **e** `金鹏堡`.
7. **Um nível só**: numa cadeia de três, o avô não entra.
8. **Pai ausente ou apagado** não quebra o filtro nem duplica o termo na lista.
9. **`termo_pai_id` não se confunde com `principal_id`**: um termo variante de A e filho de
   B aparece com os dois vínculos, sem um sobrescrever o outro.
10. **Ciclo de pertencimento** (A pai de B, B pai de A) não trava o filtro.
11. **Captura pela seleção**: o painel monta o par com o lado selecionado preenchido; criar
    com o outro lado vazio é recusado antes da chamada.
12. **Duplicata na captura**: termo chinês já existente devolve 409 e o painel oferece o
    existente.
13. **Grifo com flexão**: "Assassinos", "Senhoras" e "sabres" passam a ser grifados; a
    caixa continua indiferente ("assassino" e "Assassino" seguem iguais).
14. **Grifo do termo composto**: "Homens de Sabre" grifa o termo inteiro e aponta para
    `刀手`, não a palavra "Sabre" apontando para `刀`. É o caso que hoje aponta para a
    entrada errada, e o que prova que a correção não é só afrouxar a fronteira.
15. **Grifo não invade palavra maior**: um termo curto não pode casar dentro de outra
    palavra — a mesma regra de duas faixas de `flexao.ts` (palavra curta aceita só plural
    simples), senão "rei" grifaria dentro de "reino".
16. **Uma fonte só**: a suíte atual de `flexao.test.ts` passa sem edição depois da
    extração para `shared/` — é a prova de que o comportamento da varredura não mudou.
17. **Termo ambíguo sai da varredura direta**: com `小心` marcado, as 7 frases de "cuidado"
    param de gerar violação, e a contagem do capítulo cai.
18. **Mas não some da tela**: ele aparece na lista "confira caso a caso", com as ocorrências
    — silenciar de vez seria trocar ruído por cegueira.
19. **`varrerConsistencia` intocada**: quem separa checáveis de ambíguos é o chamador; a
    função pura recebe só os checáveis, e sua suíte passa sem edição.
20. **Ambíguo ainda vai ao prompt**: ele continua entrando no glossário do trecho, com a
    `nota_uso` — tirar da varredura não é tirar da tradução.

## 7. Riscos

**A classificação pode nunca acontecer.** São 116 termos e o padrão preserva o
comportamento atual, então nada obriga o revisor a responder — e sem resposta a entrega não
entrega nada. Mitigação: a captura pela seleção pede a espécie no momento em que o termo
nasce (aí é uma pergunta, não 116), e a tela do glossário mostra quantos ainda estão sem
classificar. Sem número à vista, isso vira campo que ninguém preenche.

**O bloco lexical pode soltar demais.** Dizer "flexione à vontade" a um modelo é convidar
sinônimo: `刀` vira "lâmina" num parágrafo e "sabre" no outro. A instrução precisa separar
com clareza a **palavra** (fixa) da **forma** (livre), e é o tipo de coisa que só a leitura
de um capítulo real confirma. A varredura de consistência continua sendo a rede: ela casa
por radical, então "lâmina" acusa e "sabres" não.

**Um nível de pai pode ser pouco.** Numa hierarquia de três (`金鹏堡` → `西堡` → um pátio
dentro dele), o trecho que cita só o pátio não recebe a fortaleza. É escolha consciente
contra inflar o prompt; se doer, o conserto é subir para dois níveis com medição de tokens
ao lado, não abandonar o limite.

## 8. Não-objetivos

- **Não se lista forma permitida por termo** (`senhor(a)`, `Senhores`). A medição mostra que
  o modelo já flexiona e que a varredura já casa; a lista seria manutenção sem retorno.
- **Não se altera o COMPORTAMENTO de `contemTermoFlexionado`**, nem o filtro de termos
  curtos, nem `varrerConsistencia`. As regras de flexão são movidas para `shared/` para o
  grifo poder consumi-las, e a prova de que nada mudou são os testes atuais de
  `flexao.test.ts` passando sem edição.
- **Não se corta versão nova de Alfa.** O que muda é como o glossário é renderizado, não o
  texto do núcleo.
- **Nenhuma tela de árvore, mapa ou grafo** nesta entrega.
- **Nenhuma desambiguação por IA.** A varredura é determinística e gratuita; resolver
  homógrafo por chamada paga por frase inverteria o que ela é. O app marca o termo, entrega
  a regra ao modelo e devolve o caso a caso ao revisor.
- **Nenhum backfill por heurística** da espécie dos 116 termos existentes.
