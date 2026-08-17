# Revisão de texto — 死人经 / O Sutra dos Mortos

Obra 1, 17 capítulos (prólogo + 1–16), 1259 frases, todas com `status_traducao = traduzida`.
Medido em 2026-08-17 sobre o banco de produção (`/var/lib/dao-tale/dao-tale.db`, leitura apenas).
Nenhum texto, prompt ou código foi alterado por esta revisão.

**Critério de julgamento.** O texto traduzido **não** é a referência. Cada ocorrência foi
julgada contra (a) a regra do **Delta ativo da obra** e (b) a **norma do português brasileiro**
— nesta ordem, com a contradição entre as duas registrada no §3 quando existiu. Tomar o texto
como referência seria circular: ele é internamente inconsistente, e um critério extraído dele
herdaria a inconsistência em vez de resolvê-la. As contagens abaixo dizem **quantas ocorrências
estão erradas**, não o que a obra vem fazendo.

Método: extração completa de `frases`, `glossario`, `prompt_padrao` e `prompts`; classificação
de cada ocorrência pela cláusula do critério que a decide; contagem de erros por termo e por
capítulo, sobre `texto_pt` (o conserto pendente) e sobre `texto_pt_original_ia` (a falha do
prompt).

---

## 0. O achado que reordena todos os outros

O Delta **tem** regra de capitalização. Tem duas, e elas se contradizem — sobre a mesma palavra.

**Regra A**, entrada no Delta v1.6 (16/08):

> Categorias e títulos: os títulos das categorias de membros da Fortaleza do Peng Dourado
> (Homens de Sabre, Assassinos, Espectros) **são capitalizados** [...]; quando as mesmas
> palavras designarem a profissão ou conceito em geral (ex.: "organização de assassinos"), use
> minúscula.

**Regra B**, entrada no Delta v1.8 (17/08, 03:04):

> Capitalização de títulos e tratamentos: quando usados como forma de tratamento ou designação
> própria de **uma pessoa específica**, escreva com inicial maiúscula [...]. Quando usados
> genericamente, **sem designar uma pessoa específica**, escreva em minúscula: "um jovem
> mestre", "o patriarca da família", "uma senhorita".

Aplique as duas a "os vinte Assassinos e setenta Homens de Sabre":

- pela Regra A é a categoria de membros da Fortaleza → **maiúscula**;
- pela Regra B não designa uma pessoa específica → **minúscula**.

E há um segundo defeito, dentro da Regra B: **o exemplo contradiz o critério da própria regra.**
Ela manda escrever "o patriarca da família" em minúscula como caso de uso genérico — mas nesta
obra *o patriarca da família* **é** Gu Lun, uma pessoa específica e sempre a mesma. O exemplo
que deveria ensinar a fronteira é, nesta obra, um caso do outro lado dela.

Some-se o Alfa v3.0, Seção 2, que decide o mesmo tema numa terceira direção:

> **Títulos e cargos exclusivos:** sempre capitalizados.

E o glossário, declarado lei suprema pelos cabeçalhos das duas camadas, que guarda 杀手 →
**"Assassino"**, com maiúscula, "inclusive nas flexões".

**Quatro instruções sobre a mesma palavra, cada uma correta sozinha, incompatíveis juntas.** É
a assinatura que a skill `revisar-capitulo` descreve: saída que oscila sem motivo aparente. O
modelo não está desobedecendo — está escolhendo, e escolhe diferente a cada chamada.

O tamanho do chute, medido na saída crua da IA (`texto_pt_original_ia`), que é onde se mede
prompt: das 95 ocorrências de "assassino" produzidas pela IA, **46 maiúsculas e 49 minúsculas**.
Uma moeda ao ar. (No texto vigente a proporção é 26/74, porque o revisor já rebaixou parte à
mão — ver §4. A medida do comentário da migração 026, 57×25, é de outro recorte; a que vale
para julgar o prompt é a da saída crua.)

**E a Regra B nunca rodou.** Nenhum dos 17 capítulos foi traduzido com o Delta v1.8:

| Delta | criado | capítulos traduzidos com ele |
|---|---|---|
| v1.0 / v1.1 | 03/08 | prólogo a 7 |
| v1.3 | 15/08 | 8, 9 |
| v1.4 | 15/08 | 10, 11 |
| v1.6 (entra a Regra A) | 16/08 | 12, 13, 14, 15 |
| v1.7 | 16/08 | 16 |
| **v1.8 (entra a Regra B)** | **17/08 03:04** | **nenhum** |

Consequência prática: parte do passivo catalogado aqui pode se resolver sozinha ao retraduzir
com o v1.8 — mas **não vai se resolver enquanto as quatro instruções continuarem em pé**,
porque o v1.8 acrescenta a quarta voz em vez de calar as outras três.

---

## 1. Erros encontrados, por quanto incomodam

Contados contra o critério do §3 (Delta + norma), sobre as 354 ocorrências de títulos e formas
de tratamento em `texto_pt`.

### 1.1 Capitalização — 59 erros em 354 ocorrências (17%)

**32 ocorrências deveriam estar em maiúscula e estão em minúscula; 27 o contrário.**

| termo | erros | onde |
|---|---|---|
| assassino(s) | 31 | caps. 0, 6, 7, 10, 12, 13, 14, 15 |
| chefe menor | 7 | cap. 8 |
| patriarca | 6 | caps. 1, 11, 13 |
| administrador | 4 | caps. 12, 13 |
| senhorita | 3 | caps. 8, 12 |
| senhor(a) | 3 | caps. 9, 13, 14 |
| homem/ns de sabre | 2 | cap. 10 |
| espectro | 2 | cap. 10 |
| espadachim | 1 | cap. 6 |

Erros por capítulo: 6 (8), 8 (8), 10 (7), 13 (7), 14 (7), 12 (6), 0 (4), 1 (4), 11 (3), 7 (2),
9 (1), 5 (1), 15 (1). Capítulos 2, 3, 4 e 16 estão limpos.

As evidências mais duras não são as somas, são as colisões internas:

- **O mesmo sintagma, nas duas caixas.** "assassino da Fortaleza do Peng Dourado" — categoria
  da Fortaleza pela Regra A, portanto maiúscula — aparece **8× em minúscula** (caps. 6, 7, 12,
  15) e 4× em maiúscula (caps. 13, 14, 16).
- **A mesma frase, nas duas caixas.** No prólogo: *"Os assassinos eram a elite da Fortaleza do
  Peng Dourado; os Homens de Sabre eram mercenários da Fortaleza."* Duas categorias
  coordenadas, uma minúscula e a outra maiúscula, a três palavras de distância. Ocorre 3× no
  prólogo.
- **Forma catalogada ignorada.** "Chefe Menor" está no glossário; sai **7× em minúscula** no
  cap. 8, todas elas. O glossário é lei acima das três camadas, e não foi aplicado uma vez
  sequer.

### 1.2 O contraexemplo que mostra onde está o buraco

`espadachim` tem 21 ocorrências e **um só erro**: as 11 da forma catalogada "Espadachim da
Grande Montanha Nevada" estão maiúsculas (uma escapou, cap. 6) e as 9 do substantivo comum
("sou apenas um espadachim") estão minúsculas.

O mesmo vale para "Mestre Yang" (12/12), "Deus Cabeçudo" (70/0), "Pequeno Senhor" (27/0),
"Jovem Mestre" (13/0).

O que separa esses termos de `assassino` não é frequência nem capítulo — é forma:

> **Quando o glossário cataloga uma expressão que não pode ser confundida com substantivo
> comum, o erro é raro. Quando o termo catalogado é uma palavra só que também é substantivo
> comum — 杀手/Assassino, 小姐/Senhorita, 老爷/Patriarca —, nenhuma regra de prosa resolve, porque
> a regra não tem como saber qual dos dois sentidos está em jogo naquela frase.**

É esse buraco que o mecanismo novo (`especie`/`nota_uso`) fecha, e nenhuma redação de prompt
fecharia. Ver §3.

### 1.3 Ausências de glossário — 21 ocorrências

Termo presente no chinês e forma catalogada ausente no português (descontados os casos em que
um termo mais longo cobre o mesmo trecho):

| ZH → PT catalogado | ausências | capítulos |
|---|---|---|
| 刀手 → Homem de Sabre | 11 | 0, 10 |
| 小头目 → Chefe Menor | 3 | 8, 9 |
| 杂役 → Serviçal | 3 | 6, 8, 9 |
| 独步王 → Rei Incomparável | 2 | 0 |
| 头目 → Subchefe / Chefe Menor | 2 | 8 |

小心 → Xiao Xin aparece com 9 "ausências" e **todas são falso positivo**: 小心 é "cuidado" em
quase toda ocorrência. É o caso que `ambiguo` + `nota_uso` existem para resolver; nenhuma frase
precisa ser tocada.

Defeitos no próprio glossário, que alimentam os erros acima: a entrada 八少奶奶 traz "oitovo
jovem lorde" na nota (erro de digitação, e "lorde" é termo que o revisor vem substituindo por
"mestre" no texto); e 大雪山剑客 e 雪山剑客 apontam para o mesmo PT sem `principal_id` ligando uma
à outra.

### 1.4 Mais-que-perfeito composto — 197 ocorrências contra a chave da obra

A chave Beta é `mais_que_perfeito: "evitar"`, e há 197 construções `tinha/havia + particípio`,
concentradas nos caps. 6 (23), 10 (19), 14 (18), 12 e 13 (17 cada). Não é lista de conserto —
ver §5.

### 1.5 O que está limpo

- **0** caracteres chineses vazados no português (1259 frases).
- **0** unidades transliteradas ("dois chi", "meio shichen"): a Seção 4 do Alfa está sendo obedecida.
- **1** vírgula de inciso dentro das aspas, contra 3 corretas (cap. 14).
- **5** suspeitas de omissão pela razão PT/ZH (mediana 3,98) e **1** de invenção — todas
  inspecionadas, todas falso positivo de falas curtas.

---

## 2. O que é defeito da regra e o que é defeito do texto

### Defeito da regra — consertar primeiro; o resto é sintoma

**(a) Duas regras do Delta decidem o mesmo tema em direções opostas** (§0): a Regra A manda
capitalizar as categorias da Fortaleza; a Regra B manda minúscula em tudo que não designe uma
pessoa específica. Colidem em todo uso coletivo — "os vinte Assassinos", "os Assassinos e os
Homens de Sabre" —, que é justamente onde o texto mais oscila.

**(b) O exemplo da Regra B contradiz o critério da Regra B** (§0): "o patriarca da família",
dado como uso genérico, designa Gu Lun nesta obra. Um exemplo que cai do lado errado da
fronteira ensina a fronteira errada, e é a explicação mais econômica para o chute de 46×49.

**(c) O Alfa §2 decide um tema que não é dele**, e decide contra o Delta: "Títulos e cargos
exclusivos: sempre capitalizados". Que essa linha é a invasora prova-se dentro do próprio Alfa
— quatro linhas acima, a mesma Seção 2 faz a remissão certa:

> **Locais, seitas e organizações:** capitalizados. Traduzir ou transliterar é decidido na
> Seção 5 (Nomes próprios) — aqui só a capitalização.

O conserto é fazer a linha dos títulos parecer com a dos locais: o Alfa fica com o que é
universal e **remete a decisão de caixa à Seção 5**. Remissão não é sobreposição.

**(d) Não existe tema de capitalização no registro.** `shared/src/temasDoPrompt.ts` não tem
entrada para caixa de títulos — por isso a colisão (c) nunca acendeu aviso: o verificador não
sabe que esse tema existe. Sem a entrada, o conserto pode ser desfeito na próxima versão de
núcleo sem ninguém perceber.

**(e) A Regra B está na camada errada.** Não nomeia nada que só exista nesta obra: não cita a
Fortaleza, nem Gu Shenwei, nem 少爷. É política geral, aplicável a qualquer wuxia — chave de
Beta escrita como prosa de Delta (§3).

### Defeito do texto — só depois que as camadas estiverem certas

- as 59 ocorrências de caixa erradas (§1.1), das quais 31 em "assassino" e 7 em "Chefe Menor";
- as 21 ausências de glossário (§1.3), das quais 11 são 刀手 → Homem de Sabre;
- a vírgula de inciso dentro das aspas, cap. 14.

Nenhum justifica retradução por si só. A ordem certa é: fechar as camadas, retraduzir um
capítulo, medir de novo, e só então decidir se o passivo vale um passe de correção.

---

## 3. Proposta de capitalização

### O critério

Da norma do português brasileiro vêm três fatos, e é sobre eles que a regra se apoia:

1. **Título e cargo são substantivos comuns e vão em minúscula no uso corrente** — "o jovem
   mestre entrou", "o patriarca ficou surpreso", e também no predicativo, "foi eleito
   presidente", "virou assassino".
2. **Sobem para maiúscula na antonomásia**, quando o título substitui o nome e passa a designar
   uma pessoa determinada: "o Aleijadinho", "o Rei Sol" — e aqui, "o Pequeno Senhor", "o Patriarca".
3. **Sobem para maiúscula no tratamento direto** (vocativo): "Sim, Senhorita."

E um quarto, que decide o caso mais frequente: **título antes de nome próprio fica em
minúscula** — "o presidente Lula", "o papa Francisco", "o general Silva". Logo: "o patriarca
Gu Lun", "a senhorita Luo Ningcha".

Daí o critério, em cinco cláusulas, na ordem, parando na primeira que responder:

| # | caso | caixa | exemplo |
|---|---|---|---|
| **R0** | a ocorrência faz parte de uma **forma catalogada no glossário** | a do glossário | "o **Espadachim da Grande Montanha Nevada**", "o **Chefe Menor**", "**Mestre Yang**" |
| **R1** | **vocativo** — dirigindo-se à pessoa | maiúscula | "Sim, **Senhorita**." |
| **R2** | **antonomásia** — o título sozinho, com artigo definido, no lugar do nome de uma pessoa determinada | maiúscula | "o **Pequeno Senhor**", "o **Patriarca**" |
| **R3** | **categoria nomeada da Fortaleza** (Homens de Sabre, Assassinos, Espectros) quando é o posto, e não a profissão em geral | maiúscula | "os vinte **Assassinos**", "um **Assassino** da Fortaleza do Peng Dourado" |
| **R4** | todo o resto | minúscula | "um **assassino** não é um ator", "virar **assassino**", "o **patriarca** Gu Lun" |

R0 vem primeiro porque o glossário é lei acima das três camadas — é o que mantém "Mestre Yang"
e "Senhor Han" em maiúscula sem abrir exceção na regra do título+nome. R3 exige que a Fortaleza
esteja em jogo na frase, porque é assim que a Regra A separa "categoria de membros" de
"profissão ou conceito em geral": os aforismos do prólogo ("o assassino não é general",
"primeiro preceito do assassino") são a profissão, e ficam em minúscula.

### As contradições, e qual eu segui

**Delta Regra A × Delta Regra B**, nos usos coletivos ("os vinte Assassinos"). **Segui a Regra
A** (maiúscula): é a regra mais específica, é a que o glossário respalda — 杀手, 刀手 e 刺客 estão
catalogados com maiúscula —, e a leitura contrária esvazia a Regra A por completo, já que uma
categoria quase nunca designa uma pessoa específica. Recomendo reescrever a Regra B para dizer
que não vale sobre os termos catalogados como categoria.

**Delta Regra B × norma pt-BR**, no título antes de nome próprio ("o patriarca Gu Lun"). A
Regra B lista "Patriarca" entre os que sobem para maiúscula ao designar pessoa específica, e
"Patriarca Gu Lun" designa Gu Lun. **Segui a norma** (minúscula), por três motivos: a norma
brasileira é firme nesse ponto ("o general Silva"); o próprio exemplo da Regra B — "o patriarca
da família" em minúscula — mostra que a regra não pretendia capturar este caso, e sim o
oposto; e não se perde nada, porque as designações que precisam permanecer maiúsculas já estão
catalogadas no glossário e entram por R0. **Esta é a decisão que mais muda ocorrências e a que
vale confirmar antes de aplicar** — é ela que mantém as 10 ocorrências de "senhorita Luo
Ningcha" em minúscula e transforma os 5 "Patriarca Gu Lun" em erro.

### Quanto está errado

| medida | ocorrências | corretas | **erradas** |
|---|---|---|---|
| `texto_pt` — o conserto pendente | 354 | 295 (83%) | **59 (17%)** |
| `texto_pt_original_ia` — a falha do prompt | 311 | 231 (74%) | **80 (26%)** |

No texto vigente: 32 deveriam ser maiúsculas e não são; 27 são maiúsculas e não deveriam ser.
Detalhamento por termo e capítulo no §1.1.

Os dois números medem coisas diferentes e ambos importam: **26% de erro na saída crua** é o
tamanho da falha das camadas, e é o número a refazer depois de consertá-las; **17% no texto
vigente** é o passivo que sobra hoje.

### A que camada pertence

Pelas três perguntas da skill `camadas-do-prompt`:

1. *Mudaria se eu traduzisse outro romance chinês?* **Mudaria** — e não por gosto: boa parte da
   webnovel traduzida adota a convenção de capitalizar toda forma de tratamento ("o Jovem
   Mestre", "a Senhorita") como marca de gênero, e a outra parte segue a norma pt-BR estrita.
   As duas são legítimas e outra obra sua poderia querer a oposta. **Não é Alfa.**
2. *É escolha estética com oposto legítimo?* **Sim.** → **Beta, e como chave: não se escreve,
   se configura.**

**Proposta concreta:** chave `capitalizacao_titulos` em `PreferenciasEstilo`, com duas opções —
`norma-pt` (padrão, as cláusulas R1–R4 acima) e `titulos-maiusculos` (toda forma de tratamento
em maiúscula, a convenção de gênero). Acompanham, sem os quais a chave é ignorada em silêncio:

- **Alfa v4.0:** trocar "Títulos e cargos exclusivos: sempre capitalizados" pela remissão à
  Seção 5, no molde da linha dos locais. Núcleos são imutáveis: corte uma versão, não edite a v3.0.
- **Registro:** entrada em `TEMAS` (`id: 'capitalizacao_titulos'`, `dono: 'beta'`) com
  `filtravel: false` — porque, tal como `nomes_proprios`, **a política é de Beta mas o termo
  individual é do glossário**, e filtrar em silêncio descartaria diretriz legítima.
- **Delta v1.9:** remover a Regra B (vira a chave) e reescrever a Regra A para dizer que vale
  sobre os termos catalogados como categoria, inclusive no plural e no coletivo.

### O que a chave não resolve — e o `especie`/`nota_uso` resolve

A chave decide a política. Ela não decide, e nunca vai decidir, **se um "assassino" naquela
frase é o posto da Fortaleza ou o substantivo comum** — o buraco do §1.2, e a origem dos 31
erros do termo. Para os termos de uma palavra que colidem com substantivo comum:

| termo | `especie` | `ambiguo` | `nota_uso` sugerida |
|---|---|---|---|
| 杀手 → Assassino | `identidade` | 1 | "Só quando for o posto da Fortaleza do Peng Dourado, entre Homens de Sabre e Espectros." |
| 刺客 → Espectro | `identidade` | 1 | "Só quando for a categoria da Fortaleza, acima dos Assassinos." |
| 小姐 → Senhorita | `identidade` | 1 | "Só como tratamento dirigido a Luo Ningcha." |
| 老爷 → Patriarca | `identidade` | 1 | "Só quando designar Gu Lun, senhor da casa." |
| 小心 → Xiao Xin | `identidade` | 1 | "Só quando for a personagem." |

`identidade`, e não `lexical`, porque nestes cinco a **forma** é a resposta — a maiúscula faz
parte do que se está mandando. `lexical` fica para os casos em que a palavra é lei e a
superfície flexiona livre (刀 → sabre).

Atenção ao contrato do `nota_uso`, que `server/src/ia/prompts.ts` documenta e é fácil de
violar: a nota diz **só quando o termo se aplica**. Escrever "...; nos demais casos use
minúscula" faria dela um glossário clandestino, prescrevendo o sentido comum sem passar por
`especie` nem pela varredura de consistência. A nota delimita; quem decide os demais casos é a
chave de Beta.

Detalhe operacional: o banco de produção ainda não tem essas colunas — a migração 026 está no
branch, não deployada — e os 139 termos estão com `especie: null`. Enquanto nenhum termo for
marcado `lexical`, `formatarGlossario` não emite os cabeçalhos de bloco e a distinção não chega
ao modelo. Classificar os cinco acima **e pelo menos um `lexical`** é o mínimo para ligar o
mecanismo.

---

## 4. O que já melhorou

467 das 1259 frases (**37,1%**) diferem de `texto_pt_original_ia`, com pico no cap. 7 (72) e no
prólogo (37). Os 1465 trechos alterados se dividem em: palavra/expressão trocada (1043),
reescrita de trecho (262), **caixa (84)** e pontuação (76).

**Em capitalização, o trabalho manual levou a conformidade de 74% para 83%** — 80 erros na
saída crua contra 59 no texto vigente. São 84 recaixamentos à mão, 57 de minúscula para
maiúscula e 27 no sentido inverso, nas palavras `assassino/assassinos` (24×), `senhor` (8×),
`qi` (8×), `divina` (6×), `jovem` (5×), `homens de sabre` e `sabre` (6×), `mestre` (3×),
`soberano` (2×).

Vale dizer com todas as letras, porque muda o que se conclui daí: **essas correções manuais não
são a referência.** Verificadas contra o critério, a maioria acerta, mas parte erra na mesma
direção da regra ambígua — houve rebaixamento de "Assassino" para minúscula em contextos que a
Regra A manda capitalizar ("os assassinos experientes da Fortaleza do Peng Dourado", cap. 15).
O revisor está arbitrando à mão, frase a frase, uma decisão que as camadas não tomaram — e por
isso arbitra diferente em capítulos diferentes, exatamente como o modelo.

Trocas lexicais recorrentes, cada uma uma regra que o prompt ainda não entrega sozinha:

| troca | vezes | capítulos |
|---|---|---|
| "jovem senhor" → "pequeno senhor" | 18 | 1, 2, 3, 8, 9, 10, 13 |
| "fora" → "foi" (mais-que-perfeito desfeito à mão) | 7 | 1, 2, 3 |
| "madeira vermelha" → "pau-rosa" | 6 | 11, 12, 14 |
| "lorde" → "mestre" | 5 | 13, 14 |
| "sem-vergonha" → "canalha" | 5 | 15 |
| "moça" → "senhorita" | 4 | 1, 9 |
| "matadores" → "assassinos" | 4 | 10 |
| "fortaleza" → "forte" | 4 | 12 |
| "aprendera" → "aprendeu" | 3 | 2, 16 |

Lido como diagnóstico, o ciclo funciona: **as trocas que viraram regra pararam de aparecer.**
"pau-rosa", "canalha" e "matadores → assassinos" estão escritos no Delta desde a v1.6, e as
correções manuais delas se concentram nos capítulos traduzidos *antes* de a regra entrar. O que
ainda não virou regra e continua saindo caro é (i) a caixa dos títulos, (ii) a distinção
少爷/小少爷 — 18 correções manuais, catalogada no glossário e ainda confundida por serem duas
entradas quase iguais, e (iii) "aprendera" → "aprendeu", que é a chave `mais_que_perfeito:
evitar` sendo desfeita à mão, frase a frase.

---

## 5. O que NÃO vale mexer

**As 197 ocorrências de mais-que-perfeito composto.** É o maior número deste documento e o pior
candidato a mutirão. A skill `revisar-capitulo` já mediu, no cap. 2, que 12 das 13 ocorrências
pediam perfeito simples e que a conversão mecânica no sentido inverso empilha "tinha" e produz
prosa pior que a violação. Vale, no máximo, olhar os caps. 6 e 10 quando forem revisados por
outro motivo.

**As 9 "ausências" de 小心 → Xiao Xin.** Falso positivo por construção. O conserto é `ambiguo` +
`nota_uso` na entrada do glossário — zero frases tocadas.

**As 5 suspeitas de omissão e a 1 de invenção pela razão PT/ZH.** Todas falso positivo de falas
curtas. A razão desta obra é saudável (mediana 3,98, contra ~3,9 esperado): não há sinal de
omissão sistemática.

**A vírgula de inciso dentro das aspas.** Uma ocorrência em 1259 frases (cap. 14).

**Retraduzir os capítulos antigos para uniformizar a caixa.** As 59 ocorrências erradas valem
uma correção dirigida, se e quando valerem — não valem retradução, que traz variância nova em
1259 frases para consertar 59. E não vale corrigir nada **antes** de fechar as camadas: sem o
conserto do §2, o próximo capítulo traduzido reabre o mesmo desvio.

**A capitalização de Yin/Yang/Qi.** O Delta v1.8 já decide, o revisor já corrigiu 8 vezes à mão,
e a regra nunca rodou. Meça depois de retraduzir um capítulo, não agora.

---

## Resumo executivo

1. O Delta tem **duas** regras de capitalização que se contradizem sobre os usos coletivos das
   categorias da Fortaleza, e o exemplo de uma delas ("o patriarca da família") cai do lado
   errado da fronteira que ela pretende ensinar. Somadas ao Alfa §2 e ao glossário, são quatro
   instruções sobre a mesma palavra — e a saída crua da IA é uma moeda ao ar: 46 maiúsculas
   contra 49 minúsculas em "assassino".
2. A regra que responderia à pergunta (Delta v1.8) **nunca traduziu um capítulo**. Ela não
   basta: acrescenta a quarta voz em vez de calar as outras três.
3. Contra o critério proposto, **59 de 354 ocorrências estão erradas no texto vigente (17%)** e
   **80 de 311 na saída crua (26%)**. Pior termo: "assassino" (31 erros); pior capítulo: 6 e 8
   (8 cada).
4. O critério é **chave de Beta** (`capitalizacao_titulos`), com tema novo no registro e Alfa
   v4.0 remetendo à Seção 5. A decisão que mais muda ocorrências — título antes de nome próprio
   em minúscula, "o patriarca Gu Lun", seguindo a norma contra a letra do Delta — está
   registrada no §3 e vale confirmar antes de aplicar.
5. O que nenhuma chave resolve — se aquele "assassino" é o posto ou o substantivo comum — é
   `especie: identidade` + `ambiguo` + `nota_uso` nos cinco termos que colidem.
