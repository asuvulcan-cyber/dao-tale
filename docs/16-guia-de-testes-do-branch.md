# 16 — Guia de testes manuais do branch

O que testar antes de subir `claude/dao-tale-translation-app-ernik3` para o VPS. São
quatro entregas, feitas a partir dos quatro problemas relatados em 2026-08-08.

Não é o `07-guia-de-teste.md` (aquele é o primeiro uso do app). Este aqui pressupõe que
você já usa o app e quer conferir o que mudou.

> **Antes de tudo, leia a seção 6.** Há duas coisas que só você pode decidir, e uma delas
> é irreversível se passar batido.

---

## Como preparar

O jeito seguro de testar é **numa cópia**, não no banco de produção.

```bash
cd ~/dev/dao-tale
git checkout claude/dao-tale-translation-app-ernik3
npm install
```

Traga uma cópia consistente do banco do VPS (o `backup()` do SQLite, não `cp` — o `cp`
de um banco em uso pode vir pela metade):

```bash
ssh -i ~/.ssh/dao_tale root@103.199.186.52 'node -e "
const D = require(\"/opt/dao-tale/node_modules/better-sqlite3\");
new D(\"/var/lib/dao-tale/dao-tale.db\", { readonly: true }).backup(\"/tmp/copia.db\")
  .then(() => process.exit(0));"'
scp -i ~/.ssh/dao_tale root@103.199.186.52:/tmp/copia.db /tmp/dao-tale-teste.db
ssh -i ~/.ssh/dao_tale root@103.199.186.52 'rm -f /tmp/copia.db'
```

Suba o app contra a cópia, **com o provedor no mock**, senão os testes que pedem IA gastam
cota real:

```bash
DAO_TALE_BANCO=/tmp/dao-tale-teste.db DAO_TALE_PORTA=8412 npm run start
```

A porta diferente é de propósito: a 8317 é a da sua instância normal, e o app tem trava de
instância única.

> ⚠️ Nem `DAO_TALE_BANCO` nem `DAO_TALE_DIR` isolam as chaves de API — a instância de teste
> lê o mesmo chaveiro do sistema operacional. Se você quer garantia de custo zero, escolha
> o provedor **Simulado** no seletor antes de clicar em qualquer botão que chame IA. Os
> testes abaixo dizem, um a um, quais custam dinheiro.

Ao abrir pela primeira vez, o app roda as migrações 022, 023 e 024 na cópia. Se algo der
errado ali, pare e me diga — nada mais adiante faz sentido.

---

## 1. A revisão virou conversa (o problema #1 e #2)

O relato era: *"ele está justificando com coisas que não citei na minha dúvida"* e
*"se eu discordar da resposta, não tem como dar uma réplica"*.

**1.1 — A resposta responde a pergunta.** Abra um capítulo, selecione uma frase, abra a
gaveta de revisão e faça uma pergunta com um **motivo explícito** ("o 一直 aqui não é
'sempre', é continuidade — confere?"). *Custa uma chamada.*

- ✅ A resposta trata do motivo que você deu.
- ❌ Se ela ignorar o seu motivo e citar uma regra que você não mencionou, é o defeito
  original — me mande o caso.

**1.2 — A réplica não reinicia a dúvida.** No pé do fio, use **Responder neste fio** e
escreva uma réplica ("mas na frase anterior o sujeito é outro"). *Custa outra chamada.*

- ✅ A gaveta mostra o **fio**: sua pergunta, a resposta, a sua réplica, a nova resposta —
  em sequência, e a IA recebe a conversa inteira.
- ❌ Se a segunda resposta parecer não saber da primeira, o fio não está chegando.

**1.3 — Você pode recusar o veredito.** Numa resposta de que você discorde, clique
**Discordo**, escreva o motivo (opcional) e confirme em **Descartar o veredito**.

- ✅ O caso fica com status `rejeitado` e o seu motivo é guardado.
- ✅ Em **Banco de testes**, o caso recusado aparece com o motivo à vista.
- ℹ️ Note a divisão: **Discordo** descarta aquele veredito; para *discutir* sem descartar,
  o caminho é **Responder neste fio** (1.2). São coisas diferentes de propósito.

**1.4 — O que foi recusado ensina o refinamento.** Em **Prompt mãe → Refinar com IA**, o
material enviado passa a incluir as recusas. *Custa uma chamada.* Confira que a proposta
não repete a regra que você recusou.

**1.5 — Retrocompatibilidade.** Abra o **Banco de testes** e olhe os casos antigos (os 25
que já existiam).

- ✅ Todos continuam lá, com a justificativa antiga agora no campo de resposta.
- ✅ Nenhum ficou órfão nem sumiu.

---

## 2. Aprender com as edições manuais (o problema #3)

O relato era: *"o que mudo à mão normalmente não tem relação com o que peço para revisar
pela IA"*.

**2.1 — A tela existe e classifica.** Nas abas da obra, **Edições manuais** — vizinha do
Banco de testes, porque são os dois canais de aprendizado e este é o que o app ignorou por
mais tempo (146 edições suas contra 25 casos no canal oficial). Não custa nada.

- ✅ As suas edições aparecem agrupadas por rota: *Candidatas a diretriz*, *Chave de
  estilo desobedecida*, *Falha do núcleo*, *Termo do glossário*, **O catálogo já
  detecta**, *Só tipografia*.
- ✅ O grupo *Só tipografia* deve ser grande — é o esperado, e é por isso que ele fica por
  último.
- ⚠️ Confira por amostragem se alguma classificação está claramente errada. O caso mais
  provável de erro é uma edição que faz duas coisas ao mesmo tempo.

**2.2 — Só o que é candidato vai para a chamada paga.** No grupo *Candidatas a diretriz*,
use **Incluir no próximo refinamento** — ele leva ao Prompt mãe com o painel de refino
aberto, onde você dispara **Refinar diretrizes com …**. *Custa uma chamada.*

- ℹ️ Repare que só esse grupo tem o botão. Nos outros, um botão daqui mandaria justamente o
  material que o refinamento é proibido de usar.

- ✅ A proposta fala do que você digitou, não de aspas nem de partícula.
- ❌ Se a proposta sugerir regra sobre `一直`, `总`, aspas ou tipografia, algo furou o
  filtro — me mande a proposta.

**2.3 — Passe de estilo.** No editor, abra a gaveta de estilo e use **Propor consertos com
a IA**. *Custa uma chamada.*

- ✅ Cada proposta mostra a prévia do texto já corrigido.
- ✅ Aprovar grava; **propor não grava nada**.
- ✅ Alguma proposta pode vir como **descarte** ("isto não é violação") — isso é resposta
  legítima, não erro.

**2.4 — O conserto do passe não polui a mineração.** Depois de aprovar um conserto do
passe, volte a **Edições manuais**.

- ✅ Aquela frase **não** aparece como edição manual — ela foi decisão registrada em outro
  canal.

---

## 3. Consistência do glossário na obra inteira (o problema #4)

O relato era: *"pode acontecer de um termo ser adicionado no glossário, mas ele foi
traduzido de forma diferente antes"*.

**3.1 — A varredura da obra.** Nas abas da obra, **Consistência** — colada ao Glossário de
propósito, porque é a prestação de contas dele. Não custa nada.

- ✅ A aba traz o total de violações entre parênteses quando há alguma.

- ✅ O topo diz o que foi examinado ("N termos · N frases examinadas, agora").
- ✅ Se não houver violação, a tela diz isso **junto com o que foi olhado** — "está limpo"
  e "ninguém olhou" precisam ser distinguíveis.
- ℹ️ Na obra 1 o resultado esperado é **zero violações**: você já tinha consertado tudo à
  mão. Zero aqui é a resposta certa, não tela quebrada.

**3.2 — O gatilho, que era o buraco de verdade.** Este é o teste que importa:

1. Anote o número de violações que um capítulo mostra na lista de capítulos.
2. Cadastre no glossário um termo que **falta** em frases antigas (por exemplo um nome que
   você sabe que aparece traduzido de outro jeito no capítulo 2).
3. Volte à lista de capítulos **sem fazer mais nada**.

- ✅ O número do capítulo mudou sozinho. Antes desta entrega, ele continuaria mostrando um
  `0` calculado **antes de o termo existir**.
- Repita apagando o termo: o número tem de voltar.

**3.3 — O conserto em lote.** Num grupo com violação, digite o que estava sendo usado,
peça **Prévia** (diz quantas frases seriam afetadas, sem gravar) e então **Trocar**.

- ✅ A prévia não altera nada.
- ✅ Depois de trocar, a contagem do capítulo cai.
- ✅ As frases trocadas **não** aparecem em Edições manuais (foi substituição, não sua
  digitação).

**3.4 — Dispensar.** Nem toda ausência é erro: quando o referente já está estabelecido, o
português omite. Use **Dispensar** numa violação legítima e confirme que ela some da lista
e da contagem, sem o texto mudar.

---

## 4. O catálogo de erros zh→pt-BR (o pedido do "banco de dados de erros comuns")

Você pediu algo que valesse *"em praticamente todas obras futuras"*. A medição contra a sua
obra mudou o desenho duas vezes, e é importante você saber disso antes de testar:

- A tabela de nove partículas do prompt antigo foi medida contra as suas 561 frases: das
  **85** frases que ela acusaria, você tinha mudado **5**. Ela reprovou.
- **Só `一直 → "sempre"` sobreviveu** (3 de 4). O catálogo nasce com **uma** entrada, e as
  cinco reprovadas ficam registradas com o número que as reprovou, para ninguém repropor
  de boa-fé daqui a três meses.

Isso é de propósito. O valor da entrega não é o tamanho da lista — é o mecanismo que
impede a lista de crescer errado, que é exatamente o que faltou quando a tabela das nove
foi escrita.

**4.1 — O achado aparece.** Abra um capítulo que tenha uma frase com `一直` traduzido como
"sempre" (a varredura de estilo do capítulo mostra). Não custa nada.

- ✅ O alerta aparece na **mesma lista** das violações de estilo, com o nome
  *"一直 traduzido como «sempre»"* — não com o id cru `particula-yizhi`.
- ✅ Abaixo do nome, uma linha explicando **o que é certo**. As regras de estilo puro não
  têm essa linha.

**4.2 — O passe conserta com o chinês à vista.** Use **Propor consertos com a IA** num
capítulo que tenha esse alerta. *Custa uma chamada.*

- ✅ A proposta troca "sempre" por algo como "até então" / "vinha …ndo" — não por um
  sinônimo qualquer.
- ℹ️ Se ela devolver **descarte**, leia a frase: pode ser um caso em que "sempre" está
  certo mesmo. O modelo agora recebe o original chinês para decidir isso.

**4.3 — Dispensar funciona igual.** Dispense um alerta do catálogo e confirme que ele some
da lista e da contagem. É a mesma tabela e o mesmo botão das regras de estilo.

**4.4 — A aferição, que é o coração da coisa.** Rode contra a cópia do banco:

```bash
cd server && npx tsx scripts/aferir-catalogo.ts 1 /tmp/dao-tale-teste.db
```

Não custa nada e não escreve nada (o banco é aberto somente leitura). O esperado:

```
particula-yizhi  一直  acusadas  3 · restantes  1 · corrigidas 2 · novas 0 · assistidas 1 · precisão 67%  → PASSA
particula-hai    还   acusadas 33 · restantes 32 · corrigidas 1 · novas 0 · assistidas 1 · precisão  3%  → REPROVA
particula-dou    都   acusadas 30 · restantes 30 · corrigidas 0 · novas 0 · assistidas 1 · precisão  0%  → REPROVA
particula-zong   总   acusadas 11 · restantes 10 · corrigidas 1 · novas 0 · assistidas 1 · precisão  9%  → REPROVA
particula-cai    才   acusadas  2 · restantes  2 · corrigidas 0 · novas 0 · assistidas 0 · precisão  0%  → REPROVA
particula-you    又   acusadas  2 · restantes  2 · corrigidas 0 · novas 0 · assistidas 1 · precisão  0%  → REPROVA
```

> Se você rodar contra uma cópia do banco feita **antes** do deploy de 15/08, os números
> saem diferentes (`一直` como 4/3, `assistidas` zerado em tudo): naquele banco a coluna
> `origem_edicao` não existia, e o script avisa disso na primeira linha. Não é divergência
> — é a mesma conta lendo um banco que ainda não sabia separar o que você digitou do que
> você aprovou num botão.

**É este comando que decide o futuro do catálogo.** Quando a segunda obra tiver corpus,
rode de novo com o id dela: se `一直` cair abaixo de 50%, a entrada sai; se alguma
reprovada subir, ela entra. O número nunca é opinião.

Leia as colunas assim:

| coluna | o que é |
|---|---|
| `acusadas` | frases que a regra acusaria no texto que a **IA** produziu |
| `corrigidas` | dessas, quantas **você** consertou sozinho, sem ninguém avisar — é o numerador |
| `restantes` | dessas, quantas você deixou como estavam |
| `novas` | frases em que a **revisão introduziu** o erro (não entra na conta) |
| `assistidas` | frases que **um botão do app** consertou — saem da conta inteira |

`assistidas` merece um parágrafo. A pergunta da aferição é *"o que o revisor faria sem ser
avisado?"*, e para uma frase que o passe consertou essa pergunta não tem resposta
observável. Contá-la como acerto inflaria a precisão com o trabalho do próprio app —
medido: a mesma obra saía de `{4, 3}` para `{4, 4}` depois de um passe. Contá-la só no
denominador afundaria uma entrada justamente porque ela funcionou. Então a frase sai
inteira, e o número aparece para você ver a amostra encolhendo. Se sobrarem menos de 3
frases legíveis, a entrada deixa de poder se justificar por dado novo — e isso também é
uma resposta.

**4.5 — O catálogo não vira pedido de prompt.** Numa frase com `一直`, troque "sempre" por
"até então" **à mão**. Vá a **Edições manuais**.

- ✅ A edição aparece no grupo **"O catálogo já detecta"**, não em *Candidatas a diretriz*.
- ❌ Se aparecer em *Candidatas a diretriz*, o filtro furou: você estaria pagando por uma
  regra de prompt sobre uma partícula que o app já detecta de graça — e que já foi medida
  como sem efeito no prompt.

---

## 5. Regressão do que já funcionava

Rápido, e vale a pena: estas quatro entregas mexeram em rotas que você usa todo dia.

- **Traduzir um capítulo** do começo ao fim (provedor Simulado serve).
- **Retraduzir** com e sem "sobrescrever as editadas à mão".
- **Exportar** a obra em `.json`, apagar numa instância limpa e **importar** de volta:
  o fio da revisão, o par cirúrgico e a fase de tradução têm de sobreviver à volta.
- **Exportar EPUB** e abrir num leitor.
- A **vitrine pública** (`/ler`), se você tiver capítulo publicado.
- A aba **Custos**: os números do dia continuam batendo.

---

## 6. Duas coisas que só você decide

**6.1 — Os seus dois arquivos não commitados.** `git status` mostra:

```
 M server/src/traducao/estiloViolacoes.ts
 M shared/src/preferenciasEstilo.ts
```

São o seu conserto do apelido 飞鹰, feito à mão e **nunca commitado**. Nenhum commit desta
sessão os tocou — foram deliberadamente mantidos fora de tudo.

**Isto importa na hora de subir:** `npm run subir` faz rsync da **árvore de trabalho**, não
do HEAD. Esses dois arquivos vão junto para o VPS, commitados ou não. Decida
conscientemente: ou você os commita, ou os guarda com `git stash`, ou aceita que eles subam
assim. O que não dá é descobrir depois.

**6.2 — O VPS está na migração 021.** Este branch traz a 022, a 023 e a 024. Elas rodam
sozinhas no primeiro boot depois do deploy, e **reconstroem tabelas** (`banco_testes` e
`eventos_ia`).

Antes de subir:

```bash
ssh -i ~/.ssh/dao_tale root@103.199.186.52 'ls -lh /var/lib/dao-tale/'
```

Confirme que existe backup recente. As três migrações foram testadas contra cópias do seu
banco real — 25 casos preservados na 022, soma de tokens idêntica na 023, 128 frases
tipadas na 024 — mas migração que reconstrói tabela é o tipo de coisa em que backup não é
formalidade.

---

## O que reportar

Se algo falhar, o mais útil é: **qual passo**, **o que você esperava**, **o que apareceu**,
e o trecho chinês envolvido quando for questão de tradução. Para os testes que custam
chamada, o texto da resposta da IA também ajuda — é ele que mostra se o problema é o prompt
ou o encanamento.
