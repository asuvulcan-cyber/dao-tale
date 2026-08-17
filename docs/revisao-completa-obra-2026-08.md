# Revisão literária — 死人经 / O Sutra dos Mortos

Obra 1, 17 capítulos (prólogo + 1–16), 1259 frases. Lido por inteiro em 2026-08-17 contra o
banco de produção (`/var/lib/dao-tale/dao-tale.db`, leitura apenas). Nenhum texto, prompt ou
código foi alterado.

Este documento é a opinião de um revisor sobre o **texto**. A capitalização de títulos já foi
tratada em `docs/revisao-obra-2026-08.md` e não se repete aqui — quando ela aparece, é como
sintoma de outra coisa.

**Critério.** Norma do português brasileiro e regras da obra (Alfa v3.0, chaves Beta, Delta
ativo), nesta ordem. O texto traduzido não é referência de nada: ele é internamente
inconsistente, e medir por ele seria circular.

---

## 1. O veredito

**A tradução está boa.** Ela lê como prosa em português, não como texto traduzido. O ritmo das
cenas de ação funciona, o diálogo distingue personagens pela fala, a ortografia é
essencialmente limpa em 1259 frases, e não há um único caractere chinês vazado nem sinal de
omissão sistemática. Um leitor brasileiro atravessa os 17 capítulos sem tropeçar na língua.

**O que a impede de estar pronta não é a prosa — é a inconsistência entre capítulos.** A mesma
função tipográfica recebe duas marcas diferentes, o mesmo personagem recebe dois tratamentos,
o mesmo termo do glossário sai catalogado num capítulo e genérico no outro. O efeito é o de
uma obra com vários tradutores. Nenhum desses defeitos é difícil; todos são de convenção, não
de compreensão.

**E há um segundo achado, que é o mais importante deste documento:** os defeitos que restam
são quase todos de classes que **o prompt nunca recebeu regra para resolver**. Onde há regra
nomeando um termo, a regra funciona — e funciona muito bem, com números no §4. Onde a regra
descreve uma qualidade ("evite repetição", "prefira o natural"), não se mede efeito nenhum.

---

## 2. O que funciona bem

Elogio específico, porque o genérico não ensina nada.

**A voz do narrador irônico do prólogo está inteira.** Esse era o trecho mais difícil da obra —
é um ensaio cínico, não narrativa —, e o sarcasmo sobrevive:

> O que aconteceu com esse mestre no fim? Morreu. Ainda não tinha trinta anos.

Três frases, três comprimentos decrescentes, e a piada cai no lugar. Um tradutor apressado
teria escrito "ele acabou morrendo antes dos trinta anos" e perdido o tempo cômico.

**O diálogo diferencia os personagens pelo registro, sem precisar de didascália.** Yao Nu fala
em bordão e obscenidade ("Lave bem o rabo", "Fica tranquilo: sei que você tem segredos"); Yang
Zheng responde em blocos curtos e secos ("Hum, também serve."); Han Jinu alterna bajulação e
crueldade na mesma fala. Compare a mesma personagem em dois momentos, cap. 15:

> "*Hehe*, não adianta me enganar. Sabe com quem está falando? Eu engano os outros desde
> criança. Você ainda é verde."

Isso é fala de gente, com ritmo de fala. Não é a saída média de um tradutor automático.

**As cenas de ação têm ritmo.** O duelo do cap. 5 usa o silêncio como recurso:

> Ouviu-se um grito seco, sem que se soubesse de quem; as armas tilintaram duas vezes, e
> depois o silêncio.

E a violência do prólogo é contida sem ser edulcorada — "Mãos caíam uma a uma como folhas na
geada, num farfalhar. Ninguém soltava um pio." A escolha de "farfalhar" para 簌簌 é boa: mantém
a imagem vegetal do original em vez de traduzir o som.

**As unidades estão convertidas, sem exceção.** Zero transliterações do tipo "dois chi" ou
"meio shichen" em 17 capítulos; 百里 vira "cinquenta quilômetros", 一尺八寸 vira "pouco menos de
meio metro". A Seção 4 do Alfa está sendo obedecida à risca.

**A razão de extensão PT/ZH é saudável e estável**: mediana 3,98 caracteres de português por
caractere de chinês, variando de 3,76 a 4,19 entre capítulos. Não há inflação nem encolhimento
— o tradutor não está resumindo nem enfeitando.

**A ortografia é limpa.** Nas varreduras que fiz — crase antes de indefinido, "há … atrás",
"mim" como sujeito, espaço antes de pontuação — o total de ocorrências em 1259 frases foi
**duas**: um espaço duplo (cap. 12) e um espaço no início de uma frase (prólogo).

---

## 3. O que atrapalha a leitura

Por ordem de incômodo. Em cada item, a correção que eu aplicaria.

### 3.1 Duas marcas para a mesma função: aspas simples × aspas duplas

É o defeito mais visível da obra, e o mais barato de resolver. O texto destaca palavras e
citações **68 vezes com aspas duplas** e **38 vezes com aspas simples**, sem que nada separe os
dois casos. Às vezes na mesma cena:

| capítulo | aspas simples | aspas duplas |
|---|---|---|
| 3–4 | `'nome'`, `'açougueiro'` | `"Vontade Divina"`, `"manual secreto"`, `"tigre"` |
| 5 | `'Rei Açougueiro'`, `'bando'` | `"Era de Ouro"` |
| 12 | `'Penhasco do Grito Fantasma'` | `"Huan Nu"`, `"baixa temporada"`, `"Jovem Senhora"` |

A norma brasileira é firme: **aspas simples só dentro de aspas duplas.** Tudo isso deveria ser
aspas duplas (ou itálico, se a casa preferir, mas então em todos os casos).

> No fim, o misterioso assassino virou ídolo. […] Essa é a verdadeira face das lendas do
> jianghu.
> — o `'nome'` que percorre o prólogo inteiro (7 ocorrências) deve virar `"nome"`.

O revisor já vem corrigindo isso à mão, um por um — as edições manuais mostram
`'senhorita Ningcha'` → `"senhorita Ningcha"` e `'dedos de ferro'` → `"dedos de ferro"` só no
cap. 12. É trabalho manual repetido numa decisão que ninguém tomou por escrito.

**Correção:** é chave de Beta (é escolha estética com oposto legítimo), não Delta. Enquanto a
chave não existir, uma linha no Delta resolve: *"Destaques, citações e apelidos: sempre aspas
duplas. Aspas simples apenas dentro de outras aspas."*

### 3.2 O epíteto repetido — 46 vezes em três capítulos

Nos caps. 7, 8 e 9, a personagem que só será nomeada no cap. 11 é chamada **"o jovem de rosto
pontudo" 21, 10 e 15 vezes** respectivamente. Em três parágrafos seguidos do cap. 7:

> O **jovem de rosto pontudo** aguentou o riso o tempo todo […]
> Gu Shenwei não imaginava que houvesse no mundo uma pessoa tão detestável. Por um tempo, o
> **jovem de rosto pontudo** chegou a ocupar o lugar dos assassinos […]
> O alvo das zombarias do **jovem de rosto pontudo** não era apenas Gu Shenwei.

Conferi o original: 尖脸少年 aparece 21 vezes no cap. 7 e a IA produziu 19. **A tradução está
sendo fiel** — e é exatamente aí que ela erra, porque o chinês tolera a repetição de epíteto
que o português não tolera. O português resolve isso com sujeito oculto e pronome, recursos que
o chinês não tem na mesma medida.

**Correção** (mesmo trecho):

> O jovem de rosto pontudo aguentou o riso o tempo todo […]
> Gu Shenwei não imaginava que houvesse no mundo uma pessoa tão detestável. Por um tempo, **ele**
> chegou a ocupar o lugar dos assassinos […]
> **As zombarias não tinham** Gu Shenwei como alvo único.

A regra que decide isso **já existe** e é do Alfa — "Alterne apenas entre nome próprio, pronome
e sujeito oculto". Ela simplesmente não está sendo aplicada a epítetos, provavelmente porque
o modelo os lê como nome próprio. Vale um exemplo explícito no Alfa: *"Um epíteto descritivo
(o jovem de rosto pontudo, o bandido da cicatriz) conta como nome próprio para esta regra:
alterne."*

### 3.3 Termos do glossário que não chegam ao texto

`小少爷` está catalogado como **Pequeno Senhor**. A IA escreveu "jovem senhor" e o revisor
corrigiu à mão **22 vezes, em 10 capítulos diferentes — inclusive no cap. 16**, o mais recente.
Vinte e duas correções idênticas ao longo de duas semanas é o sintoma mais claro de um
mecanismo que não está fechando.

O mesmo padrão, em menor escala: `头目` → "chefe menor" (6 correções manuais no cap. 8),
`老爷` → "Patriarca" (3), `少爷` → "Mestre" e não "Lorde" (4), `小姐` → "senhorita" e não
"moça"/"senhora" (9).

O diagnóstico está no doc anterior e continua valendo: **quando o termo catalogado é uma
palavra composta inconfundível, o erro é raro; quando é uma palavra que também é substantivo
comum, nenhuma redação de prompt resolve.** "Espadachim da Grande Montanha Nevada" sai certo
11 vezes em 12; "Pequeno Senhor" erra 22 vezes.

### 3.4 Decalques pontuais — a tradução literal de uma metáfora morta

São poucos, mas doem porque cada um trava uma frase inteira.

| onde | está | deveria estar | porquê |
|---|---|---|---|
| 1.0 | 尴尬的时期 → "um período **constrangedor**" | "uma fase **ingrata**" | 尴尬 aqui é a fase difícil do bicho, não algo que envergonhe quem olha |
| 5.26 | 盗匪林立 → "os ladrões **proliferavam como uma floresta**" | "os bandos de ladrões **brotavam como mato**" | 林立 é metáfora morta em chinês ("de pé como um bosque"); traduzida ao pé da letra volta a ser metáfora viva, e ridícula |
| 2.13 | 对谁都不客气 → "não era **cortês** com ninguém" | "não **fazia cerimônia** com ninguém" | 客气 é cerimônia, não cortesia; a frase atual descreve um grosseiro, o original descreve um homem sem papas na língua |
| 0.65 | 全凭异乡客人的一句否认 → "concluindo que ele errou apenas **pela negativa do forasteiro**" | "e o julgou culpado só **com base na palavra do forasteiro**" | "pela negativa de X" não é construção corrente |

### 3.5 Sintaxe quebrada e antecedente errado — cinco casos, todos consertáveis em um minuto

**[0.57]** A frase não fecha:

> O sangue **do local onde sua mão decepada** só foi estancado após usarem um grande pacote de
> unguento cicatrizante.

Curiosamente, a IA tinha acertado: *"O sangue no local do corte só estancou com um pacote grande
de remédio para feridas."* A quebra foi introduzida na revisão manual. Correção: **"O sangue do
coto só estancou depois de um pacote inteiro de unguento."**

**[1.1]** O sujeito troca no meio e o leitor tropeça:

> Gu Shenwei, aos quatorze anos, estava numa fase parecida. O nome soava um tanto antiquado,
> mas **ainda guardava** muita travessura e inocência infantis.

Quem guarda travessura é o menino, não o nome — o original diz 身上 ("no corpo dele").
Correção: **"O nome soava um tanto antiquado, mas ele ainda guardava muita travessura e
inocência de criança."**

**[5.62]** A hesitação está no original (只有……金鹏堡才), mas a ordem do português não a suporta:

> "Um espadachim também não deveria matar inocentes à toa; **só...** a Fortaleza do Peng
> Dourado mata por qualquer motivo."

Correção: **"só... só a Fortaleza do Peng Dourado é que mata sem motivo."** O `é que` recupera
a ênfase de 才 e faz o "só" ter em que se apoiar.

**[12.63]** Aspas de abertura sem fechamento, e é troca de turno (a senhorita pergunta, Mãe
Neve responde), não fala contínua:

> "Mãe Neve, quem você acha que serve?
> "O resto é secundário; o essencial é que a pessoa seja esperta. Para mim, é ele."

**[12.67]** `"A senhorita não disse para quê ele serviria"` → **"para que"**, sem acento: o
circunflexo só se usa em fim de frase ou isolado.

### 3.6 Pilhas de "tinha" — e o revisor as está criando

A chave `mais_que_perfeito: evitar` monta uma hierarquia de três degraus: perfeito simples
primeiro, `tinha/havia` + particípio quando a anterioridade precisa ser marcada (**alternando os
dois auxiliares**), e nunca a forma sintética (`cumprira`). Os dois primeiros degraus estão
sendo confundidos.

No prólogo:

> Agora, ele **tinha perdido** a mão direita, **tinha arruinado** mais da metade de sua arte
> marcial e, acima de tudo, **tinha perdido** por completo a honra.

Três "tinha" em vinte palavras, e o terceiro repete o verbo do primeiro. **A IA não escreveu
isso** — ela escreveu `perdera / arruinara / perdera`, que viola a regra do degrau 3. O revisor
consertou a violação certa pelo caminho errado. Correção:

> Agora estava sem a mão direita, **havia arruinado** mais da metade de sua arte marcial e,
> acima de tudo, **perdera a honra por completo** — não, melhor: **e, acima de tudo, não lhe
> sobrara honra nenhuma.**

Ou, mais simples e mais brasileiro: **"Agora, perdera a mão direita — não: agora estava sem a
mão direita, com mais da metade da arte marcial arruinada e sem nenhuma honra."**

A proporção `tinha`:`havia` no texto vigente denuncia o problema: cap. 6 → **20:1**; cap. 13 →
**15:1**; cap. 12 → **13:1**; caps. 4, 7, 8, 11 → **tudo "tinha", nenhum "havia"**. A regra pede
alternância explícita e ela não está acontecendo.

### 3.7 Coisas menores que ainda assim se notam

- **`jianghu` em três formas no prólogo**: `*jianghu*` (0.0), `jianghu` sem marca (0.17, 0.19,
  0.25), `*Jianghu*` com maiúscula (0.28). Escolha uma. Sugiro `*jianghu*`, itálico e minúscula,
  como estrangeirismo corrente.
- **Onomatopeia em itálico é regra de fato, não de direito.** A chave é `onomatopeia: adaptar` +
  `pensamento_marca: italico`, e o revisor vem pondo os asteriscos à mão (`"Hehe,"` → `"*Hehe*,"`,
  `Humpf.` → `*Humpf*.`). Na saída crua da IA há **1 onomatopeia em itálico contra 14 sem**, em
  17 capítulos. Nunca foi escrito em lugar nenhum que ela leva itálico.
- **`"designado''`** (16.11): aspa dupla de abertura fechada com duas simples. A IA tinha
  escrito `'designado'`; o erro entrou na conversão manual para aspas duplas.
- **`catamitos((…))`** (14.25): a IA tinha escrito "meninos de programa" — anacrônico, mas
  legível. O revisor trocou por "catamitos" e acrescentou nota de rodapé explicando o termo.
  Precisar de nota para explicar a própria escolha lexical é sinal de que a escolha está acima
  do registro configurado (`registro: jovem-adulto`). Eu manteria **"meninos usados por homens"**
  ou similar, e dispensaria a nota.
- **`"enjeitado"` → `"abandonado"`** (1.0): aqui a edição manual perdeu precisão. 弃儿 é
  exatamente "enjeitado"; "abandonado desamparado" é redundante e mais pálido.

---

## 4. A evolução entre as versões do prompt

### 4.1 O que de fato variou

Levantei do banco (`capitulos.prompt_id` e `capitulos.nucleo_id`, que registram o que foi
usado, não o que estava ativo) em vez de inferir por data:

| capítulos | Delta | Núcleo (Alfa) | QA por 2ª IA | revisão por IA |
|---|---|---|---|---|
| 0 | v1.0 (vazio) | — | não | não |
| 1, 2, 3 | v1.1 (vazio) | — | só o 3 | não |
| 4 | v1.1 | **v1.0** | sim | não |
| 5, 6, 7 | v1.1 | **v3.0** | sim | 5 e 7 |
| 8, 9 | v1.3 | v3.0 | só o 8 | só o 8 |
| 10, 11 | v1.4 | v3.0 | só o 10 | sim |
| 12, 13, 14, 15 | v1.6 | v3.0 | não | sim |
| 16 | v1.7 | v3.0 | não | sim |

**O modelo não é variável: os 17 capítulos foram traduzidos com `deepseek/deepseek-v4-flash`.**
As versões v1.2, v1.5 e v1.8 do Delta nunca traduziram um capítulo. Os Deltas v1.0 e v1.1 são
strings vazias — os sete primeiros capítulos rodaram **sem nenhuma diretriz de obra**.

### 4.2 A armadilha, e como a contornei

Capítulos antigos foram revisados por mais tempo. O prólogo existe há 14 dias; o cap. 16, há
um. Idade e versão do prompt são **perfeitamente colineares** nesta obra, e nenhum ajuste
estatístico separa duas variáveis que andam juntas em 17 pontos.

Então **não usei o texto vigente para medir o prompt.** Usei `texto_pt_original_ia`, que é
gravado no momento da tradução e nunca mais muda: é imune, por construção, a quanto tempo o
revisor teve. Tudo no §4.3 e §4.4 está medido sobre ele.

Para referência, o que a medida contaminada diz — e por que não confio nela:

| Delta | lev/kchar (quanto o revisor reescreveu, por 1000 caracteres) |
|---|---|
| v1.0 | 50,1 (n=1) |
| v1.1 | 26,8 (n=6, sem o cap. 7) |
| v1.3 | 24,2 (n=2) |
| v1.4 | 22,0 (n=2) |
| v1.6 | 19,2 (n=4) |
| v1.7 | 13,9 (n=1) |

Cai monotonicamente, r = −0,66 contra o número do capítulo — e é exatamente o que se esperaria
se **nada** tivesse melhorado e só a idade explicasse tudo. Além disso, a variância **dentro**
de uma mesma versão é maior que a variância **entre** versões (F = 1,83 com 5 e 9 graus de
liberdade; seria preciso ~3,5 para o resultado significar alguma coisa). Dentro do próprio
Delta v1.6, o cap. 15 tem 19,9 e o cap. 14 tem 23,0; dentro do v1.1, o cap. 2 tem 26,3 e o
cap. 4 tem 17,3. **Como evidência de melhoria, esta tabela não vale nada.**

O cap. 7 está fora de todas as contas: foi traduzido duas vezes (8 chamadas de tradução em duas
datas) e recebeu 15 passes de revisão por IA. Seu `lev/kchar` é 290,6 — onze vezes a mediana.
Ele não mede prompt, mede retrabalho.

### 4.3 O que melhorou de verdade — e não foi um Delta

O salto de qualidade maior e mais limpo da obra **acontece entre os capítulos 4 e 5, onde o
Delta não muda** (continua v1.1) e **o núcleo passa a v3.0**.

Medida: ocorrências do mais-que-perfeito **sintético** (`cumprira`, `perdera`, `aprendera`), a
forma que a chave Beta `mais_que_perfeito: evitar` proíbe no degrau 3, contadas na saída crua
da IA com lista fechada de verbos:

| capítulos | núcleo | sintéticos na saída crua | por capítulo |
|---|---|---|---|
| 0, 1, 2, 3 | **nenhum registrado** | 18 + 0 + 6 + 12 = **36** | **9,0** |
| 4 | v1.0 | 1 | 1,0 |
| 5 … 16 | **v3.0** | **6** em 12 capítulos | **0,5** |

**Queda de 94%, sem que o Delta tenha mudado uma vírgula.** O prólogo sozinho traz `matara`,
`tomara`, `cumprira`, `viera`, `fizera`, `trouxera`, `morrera`, `perdera`, `baixara`,
`escapara`, `conseguira`, `errara`, `arruinara`, `levara`, `insistira`, `acontecera` — dezoito
ocorrências dessas formas, todas proibidas pela chave, todas num capítulo em que a chave nunca
chegou ao modelo.

Isto é exatamente o sintoma que a skill `camadas-do-prompt` cataloga: *"Mudei a preferência e
não mudou nada — o Alfa ativo não traz `{{PREFERENCIAS_OBRA}}`; as chaves são descartadas em
silêncio."* Sete capítulos foram traduzidos com as preferências da obra sendo jogadas fora sem
aviso. **A lição operacional é maior que a lição literária:** o dinheiro gasto ajustando o Delta
nos capítulos 0–4 foi gasto com um prompt que não entregava metade do que ele mandava.

### 4.4 O que os Deltas melhoraram — regra por regra

Aqui os números são bons, e todos imunes ao tempo de revisão. Cada regra é medida nas frases
cujo **chinês** contém o termo, comparando os capítulos antes e depois de a regra entrar:

| regra | entra em | antes | depois |
|---|---|---|---|
| **少年 → "garotos"** (nunca "rapazes"/"jovens") | v1.6, cap. 12 | 32 erradas / 14 certas (108 ocorrências) | **2 erradas / 54 certas** (58) |
| **杀手 → "Assassino"** (nunca "matador") | v1.6, cap. 12 | 7 erradas / 42 certas (49) | **0 erradas / 40 certas** (40) |
| **红木 → "pau-rosa"** (nunca "madeira vermelha") | v1.7, cap. 16 | 6 erradas / 4 certas (10) | **0 / 1** (1) |
| **小崽子 → "pirralhos"** | v1.7, cap. 16 | 1 errada | **1 certa** |
| **无耻 → "canalha"** | v1.7, cap. 16 | 5 erradas (cap. 15) | sem ocorrência — não testada |
| **功夫 → não "kung fu"** | v1.8 | 1 errada (cap. 15) | **nunca rodou** |
| **epítetos com artigo** ("a Mãe Neve") | v1.7, cap. 16 | caps. 13–14: 7 com / 8 sem | cap. 16: 4 com / 2 sem — **sem efeito claro** |

A regra de 少年 é o melhor resultado da obra: **de 30% de erro para 3,4%**, com amostra grande
dos dois lados. A de 杀手 zera. A de 红木 acerta, mas com n = 1 depois — não dá para chamar de
prova.

### 4.5 O que os Deltas **não** melhoraram

As regras que descrevem uma qualidade em vez de nomear um termo não deixaram rastro mensurável.
Densidade de defeitos genéricos (aspas simples de destaque, perífrase composta, aspas
tipográficas estrangeiras) por mil caracteres da saída crua, por versão de Delta:

| v1.0 | v1.1 | v1.3 | v1.4 | v1.6 | v1.7 |
|---|---|---|---|---|---|
| 0,56 | 1,39 | 0,66 | 1,74 | 1,32 | 1,63 |

Sobe e desce sem direção. Correlação com o número do capítulo: **r = 0,15** (nenhuma).
F = 1,39 — variância entre versões indistinguível do ruído.

Concretamente:

- **"Ritmo e repetição"** (v1.3 em diante) — as 46 repetições de "o jovem de rosto pontudo"
  estão nos capítulos 7, 8 e 9. Os caps. 8 e 9 rodaram **com** a regra. Não mudou nada.
- **"Repetição lexical"** (v1.7) — o cap. 16 tem a mesma densidade de repetição dos anteriores.
- **"Escolha lexical: prefira o corrente"** (v1.2 em diante, com exemplos "maciço, não
  rombudo") — os três exemplos citados nunca reaparecem no corpus. A regra pode estar
  funcionando e ser invisível, ou pode ser inerte; não há como saber. Uma regra com exemplos que
  não voltam a ocorrer é uma regra que não se pode aferir.

**A conclusão que os dados sustentam:** *regra que nomeia um termo funciona; regra que descreve
uma qualidade, não se mede.* Isso não prova que as regras descritivas sejam inúteis — prova que,
com 17 capítulos e uma versão nova a cada dois, **este desenho não consegue medi-las.** Se o
objetivo é aferir uma regra de qualidade, o caminho é o comparador A/B no mesmo capítulo, não a
série histórica.

### 4.6 O que piorou

Nada de forma sistemática. Duas regressões pontuais que valem registro:

- **Cap. 11 (v1.4)** reintroduziu 4 formas sintéticas (`viera`, `deixara`, `dissera`,
  `trouxera`) depois de seis capítulos limpos. Ruído de geração, não regressão de regra — mas é
  a medida do quanto varia dentro de uma mesma configuração.
- **Cap. 14 (v1.6)** tem a maior densidade de defeitos genéricos da saída crua de toda a obra
  (2,18/kchar), acima de qualquer capítulo do v1.1. Mesmo Delta, mesmo núcleo, mesmo modelo que
  os caps. 12, 13 e 15 — que estão entre os melhores. **Essa é a variância que o §4.2 mede, vista
  de perto.**

---

## 5. O que o revisor humano vem consertando à mão

1145 trechos alterados entre `texto_pt_original_ia` e o texto vigente (749 fora o cap. 7).
Classificados pela natureza da mudança:

| natureza | trechos | % |
|---|---|---|
| troca lexical curta (1–3 palavras) | 817 | **71%** |
| reescrita de trecho | 164 | 14% |
| pontuação | 91 | 8% |
| só caixa | 73 | 6% |

**Setenta e um por cento do trabalho manual é trocar palavra por palavra.** Isso é um elogio à
prosa e uma acusação ao mecanismo de termos: o revisor quase não está reescrevendo frases — está
aplicando um glossário à mão, um caso por vez.

As trocas mais repetidas:

| troca | vezes | capítulos |
|---|---|---|
| "jovem senhor" → "Pequeno Senhor" | 22 | 1,2,3,8,9,10,12,13,14,**16** |
| "Assassino" → "assassino" (e inverso) | 20 | 10–16 |
| "qi"/"yin" → "Qi"/"Yin" | 10 | 15, 16 |
| "subchefe" → "chefe menor" | 6 | 8 |
| "na Fortaleza" → "no Forte" | 6 | 12 |
| "fora" → "foi" / "aprendera" → "aprendeu" | 9 | 1, 2, 3, 16 |
| "Lorde" → "Mestre" | 4 | 13, 14 |
| "madeira vermelha" → "pau-rosa" | 6 | 11, 12, 14 |
| "rapazes" → "garotos" | 4 | 11 |

**O que isso revela, item por item:**

- **"jovem senhor" (22×, ainda no cap. 16)** — o glossário é declarado lei suprema pelos
  cabeçalhos de Beta e Delta e não está sendo aplicado a um termo que aparece em toda página.
  É o buraco de `especie`/`nota_uso` descrito no doc anterior, e é aqui que ele custa mais caro.
- **"madeira vermelha" e "rapazes" param depois que a regra entra** (v1.7 e v1.6). Isso é o
  ciclo funcionando: a troca vira regra, a regra elimina a troca. Confirmado com números no §4.4.
- **"na Fortaleza" → "no Forte" (6× no cap. 12)** é uma distinção que o prompt não conhece:
  堡 (a Fortaleza inteira) contra 东堡/西堡 (os Fortes Leste e Oeste). Nem o glossário nem o Delta
  registram a diferença. É candidata a entrada de glossário, não a diretriz.
- **"fora" → "foi", "aprendera" → "aprendeu"** — o revisor executando à mão o degrau 3 da chave
  `mais_que_perfeito`. Nove correções, todas nos capítulos que rodaram **sem** o núcleo v3.0.
  Depois do cap. 5, praticamente somem. Prova cruzada do §4.3.
- **Aspas e itálico de onomatopeia** — regras que nunca foram escritas, executadas à mão em todo
  capítulo. Todo o trabalho do §3.1 e do §3.7 se enquadra aqui.

**E, três vezes, a edição manual piorou o texto:** a sintaxe quebrada de [0.57], a pilha de três
"tinha" de [0.66], e "enjeitado" → "abandonado" em [1.0]. Não é crítica ao revisor — é o
resultado esperado de arbitrar frase a frase uma decisão que as camadas não tomaram. É o mesmo
diagnóstico que o doc anterior fez para a capitalização, e vale igual aqui.

---

## 6. O que eu faria a seguir

Em ordem de retorno pelo esforço.

1. **Conferir que o núcleo ativo traz `{{PREFERENCIAS_OBRA}}` antes de qualquer outra coisa, e
   fazer disso uma verificação automática.** Custo: uma tarde. Retorno: o §4.3 mostra que sete
   capítulos foram traduzidos com as chaves da obra descartadas em silêncio, e ninguém percebeu
   por duas semanas. Enquanto essa checagem não existir, toda medição de prompt está sujeita a
   medir um prompt que não é o que se pensa.

2. **Escrever a regra de aspas.** Uma linha resolve 38 ocorrências e para de gastar tempo manual
   em todo capítulo novo. Idealmente chave de Beta; enquanto isso não existe, linha no Delta.

3. **Fechar `小少爷 → Pequeno Senhor` pelo mecanismo, não pela redação.** É `especie: identidade`
   + `nota_uso`, o mesmo mecanismo já proposto para `杀手`/`小姐`/`老爷`. Vinte e duas correções
   manuais em dez capítulos é o maior desperdício isolado de atenção humana nesta obra.

4. **Acrescentar ao Alfa que epíteto descritivo conta como nome próprio para a regra de variação
   elegante.** Resolve as 46 repetições dos caps. 7–9 e previne a próxima personagem sem nome.

5. **Escrever a regra do itálico em onomatopeia** — ela existe de fato, executada à mão, e não
   existe de direito em lugar nenhum.

6. **Corrigir os cinco pontos do §3.5 diretamente no texto.** São cinco frases; leva minutos e
   são os únicos lugares onde a leitura realmente trava.

7. **Passar as regras descritivas pelo comparador A/B no mesmo capítulo, não pela série
   histórica.** O §4.5 mostra que a série histórica não consegue enxergá-las. Se elas valem o
   espaço que ocupam no prompt, o comparador dirá; a série nunca vai dizer.

8. **Não retraduzir nada por conta deste documento.** O que está errado é pontual e barato de
   corrigir à mão; retraduzir traz variância nova em 1259 frases — e o cap. 14 (§4.6) mostra que
   a variância de uma geração isolada é maior que a diferença entre duas versões de prompt.

---

## Resumo executivo

1. **A tradução está boa e é publicável com um passe leve.** A prosa lê como português, o
   diálogo tem voz, o ritmo funciona e a ortografia é limpa. O que a segura é inconsistência de
   convenção entre capítulos, não qualidade de tradução.
2. Os três problemas que mais atrapalham: **aspas simples e duplas para a mesma função** (38 ×
   68); **o epíteto "o jovem de rosto pontudo" repetido 46 vezes** nos caps. 7–9, por fidelidade
   a um chinês que tolera o que o português não tolera; e **termos do glossário que não chegam ao
   texto**, com "jovem senhor" → "Pequeno Senhor" corrigido 22 vezes à mão, ainda no cap. 16.
3. **O maior ganho de qualidade da obra não veio de um Delta — veio do núcleo v3.0**, no cap. 5,
   que fez as chaves Beta chegarem ao modelo pela primeira vez: mais-que-perfeito sintético caiu
   **94%** (9,0 → 0,5 por capítulo) sem que o Delta mudasse.
4. **Regra que nomeia um termo funciona; regra que descreve uma qualidade não se mede.**
   少年 → "garotos" foi de 30% para 3,4% de erro; 杀手 → "Assassino" zerou. Já "evite repetição" e
   "prefira o natural" não deixam sinal (r = 0,15 com o número do capítulo).
5. **A série histórica não separa versões de prompt**, e é honesto dizer isso: idade e versão são
   colineares em 17 capítulos, e a variância dentro de uma versão supera a variância entre
   versões (F = 1,83). Só a saída crua da IA permite medir; para regras de qualidade, o caminho é
   o comparador A/B, não a série.
6. **71% do trabalho manual do revisor é troca lexical curta** — ele está aplicando glossário à
   mão, não reescrevendo prosa. Isso elogia a tradução e acusa o mecanismo de termos.
