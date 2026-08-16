# Glossário: espécie do termo, captura pela seleção e pertencimento

Desenho para o relato de 2026-08-16: plural/gênero/capitalização não casando, vontade de
separar "termo importante" de "tradução de palavra comum", hierarquia entre termos, e
adicionar um termo direto do texto.

**A medição reordena o pedido.** Duas das três queixas têm a mesma causa, e não é a que
parecia; uma terceira ideia encolhe até caber em três linhas de código.

## 1. O que a medição mostrou

### Flexão já funciona — nos dois lados

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

### `nota_caixa`: a regra de capitalização no ponto do uso

Campo de texto curto, opcional, só faz sentido em `lexical`:

> `杀手` · nota_caixa: "Maiúscula só quando for o posto na Fortaleza do Peng Dourado."

Entregue junto **daquele termo**, na linha dele, como o `certo` do catálogo de erros — não
como regra geral no núcleo. A investigação de 2026-08-05 mediu texto de marcador no prompt
como sem efeito; texto no ponto do uso é o que funcionou.

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
ALTER TABLE glossario ADD COLUMN nota_caixa TEXT;
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
4. **`nota_caixa` no ponto do uso**: sai na linha daquele termo, e só nele; termo sem nota
   não emite linha vazia.
5. **`nota_caixa` só em lexical**: gravada num termo de identidade, não é emitida — a forma
   já é lei ali, e a nota contradiria.
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
- **Não se altera `contemTermoFlexionado`**, nem o filtro de termos curtos, nem
  `varrerConsistencia`. Eles não são o problema — foi o que a medição estabeleceu.
- **Não se corta versão nova de Alfa.** O que muda é como o glossário é renderizado, não o
  texto do núcleo.
- **Nenhuma tela de árvore, mapa ou grafo** nesta entrega.
- **Nenhum backfill por heurística** da espécie dos 116 termos existentes.
