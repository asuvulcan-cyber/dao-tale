# Revisão de texto — 死人经 / O Sutra dos Mortos

Obra 1, 17 capítulos (prólogo + 1–16), 1259 frases, todas com `status_traducao = traduzida`.
Medido em 2026-08-17 sobre o banco de produção (`/var/lib/dao-tale/dao-tale.db`, leitura apenas).
Nenhum texto, prompt ou código foi alterado por esta revisão.

Método: extração completa de `frases`, `glossario`, `prompt_padrao` e `prompts` para análise
local; contagem por termo, por papel sintático e por capítulo; comparação `texto_pt_original_ia`
× `texto_pt` para separar o que a IA entregou do que o revisor consertou à mão.

Todas as contagens abaixo são sobre `texto_pt` (o texto vigente), salvo onde dito o contrário.

---

## 0. O achado que reordena todos os outros

**A regra de capitalização já existe, e nunca rodou uma única vez.**

O Delta v1.8 traz, desde hoje às 03:04, a diretriz "Capitalização de títulos e tratamentos".
Mas nenhum dos 17 capítulos foi traduzido com ela:

| Delta | criado | usado pelos capítulos |
|---|---|---|
| v1.0 / v1.1 | 03/08 | prólogo a 7 |
| v1.3 | 15/08 | 8, 9 |
| v1.4 | 15/08 | 10, 11 |
| v1.6 (entra "Categorias e títulos") | 16/08 | 12, 13, 14, 15 |
| v1.7 | 16/08 | 16 |
| **v1.8 (entra "Capitalização de títulos")** | **17/08 03:04** | **nenhum** |

Ou seja: os 82% do livro que estão fora do critério foram produzidos por um prompt que não
continha critério nenhum. Antes de escrever qualquer regra nova, o barato é **retraduzir um
capítulo com o v1.8 e medir** — parte do desvio catalogado aqui pode já estar resolvida.

Isso não isenta a regra. Ela tem um defeito estrutural, descrito no §2.

---

## 1. O que encontrei, por quanto incomoda

### 1.1 Capitalização de títulos e tratamentos — 414 ocorrências, ~20% sem critério

O maior desvio do livro, e o único que aparece em todos os 17 capítulos.

Contagem por família de termo em `texto_pt` (maiúscula / minúscula):

| termo | MAI | min | total | veredito |
|---|---|---|---|---|
| senhor(es/a/as) | 30 | 85 | 115 | misto |
| assassino(s) | 26 | 74 | 100 | **misto, o pior caso** |
| senhorita(s) | 1 | 64 | 65 | quase sempre minúscula |
| rei(s) | 35 | 12 | 47 | misto |
| mestre(s) | 10 | 31 | 41 | misto |
| jovem senhor(a) | 15 | 10 | 25 | misto |
| espadachim/ns | 12 | 9 | 21 | **coerente** (ver 1.2) |
| jovem mestre | 13 | 0 | 13 | coerente |
| homem/ns de sabre | 12 | 0 | 12 | coerente |
| patriarca(s) | 5 | 6 | 11 | misto |
| general | 1 | 8 | 9 | misto |
| marechal | 4 | 1 | 5 | misto |
| madame | 1 | 2 | 3 | misto |

As evidências mais duras não são as somas, são as colisões:

- **O mesmo sintagma, nas duas caixas.** "assassino da Fortaleza do Peng Dourado" aparece
  **8× em minúscula** (caps 6, 7, 12, 15) e **4× em maiúscula** (caps 13, 14, 16). Mesmo
  referente, mesma construção, mesma obra.
- **A mesma frase, nas duas caixas.** No prólogo: *"Os assassinos eram a elite da Fortaleza do
  Peng Dourado; os Homens de Sabre eram mercenários da Fortaleza."* Dois postos coordenados,
  um minúsculo e o outro maiúsculo, a três palavras de distância. Ocorre 3× no prólogo.
- **O mesmo nome próprio, nas duas caixas.** "Patriarca Gu Lun" sai **5× maiúsculo** (caps 1,
  11, 13) e **5× minúsculo** (caps 1, 2, 6) — moeda ao ar sobre um título colado a um nome.
- **O título do capítulo contra o corpo do capítulo.** O prólogo se chama "Os Dois Preceitos
  do Assassino", e no corpo do mesmo capítulo lê-se "Primeiro preceito do assassino".

**Não há correlação com o chinês.** Das frases que contêm 杀手, a saída foi 22 maiúsculas e 68
minúsculas — mesmo gatilho, caixa aleatória. A variação não é semântica; é ruído.

### 1.2 O contraexemplo que explica tudo: quando o glossário resolve, não há desvio

`espadachim` tem 21 ocorrências e **um só desvio**:

- as 11 ocorrências da forma catalogada "Espadachim da Grande Montanha Nevada" estão
  maiúsculas (10 corretas, 1 escapou em minúscula no cap. 6);
- as 9 ocorrências do substantivo comum ("sou apenas um espadachim") estão minúsculas.

O mesmo vale para "Mestre Yang" (12/12 maiúsculo), "Deus Cabeçudo" (70/0), "Pequeno Senhor"
(27/0), "Jovem Mestre" (13/0), "Homens de Sabre" (12/0).

O padrão é nítido e vale como lei da obra:

> **Onde o glossário cataloga uma forma que não pode ser confundida com substantivo comum, a
> caixa é estável. Onde o termo catalogado é uma palavra só que também é substantivo comum
> — 杀手/Assassino, 小姐/Senhorita, 老爷/Patriarca —, a caixa vira sorteio.**

Consistência nesta obra é função de cobertura do glossário, não de regra de prosa. É por isso
que a solução principal é o mecanismo novo (`especie`/`nota_uso`), e não mais texto no prompt.

### 1.3 Ausências reais de glossário — 刀手 em 11 frases

Termo presente no chinês e forma catalogada ausente no português (excluídos os casos em que
um termo mais longo cobre o mesmo trecho):

| ZH → PT catalogado | ausências | capítulos |
|---|---|---|
| 刀手 → Homem de Sabre | 11 | 0, 10 |
| 小头目 → Chefe Menor | 3 | 8, 9 |
| 杂役 → Serviçal | 3 | 6, 8, 9 |
| 独步王 → Rei Incomparável | 2 | 0 |
| 头目 → Subchefe / Chefe Menor | 2 | 8 |

小心 → Xiao Xin aparece com 9 "ausências" e **todas são falso positivo**: 小心 é "cuidado" em
quase toda ocorrência, e só raramente a personagem. É exatamente o caso que a coluna `ambiguo`
+ `nota_uso` foram criadas para resolver — nenhuma frase precisa ser tocada.

Nota de qualidade do próprio glossário: a entrada 八少奶奶 traz "oitovo jovem lorde" na nota
(erro de digitação e "lorde", termo que o revisor vem substituindo por "mestre" no texto), e
duas entradas distintas — 大雪山剑客 e 雪山剑客 — apontam para o mesmo PT "Espadachim da Grande
Montanha Nevada" sem `principal_id` ligando uma à outra.

### 1.4 Mais-que-perfeito composto — 197 ocorrências contra a preferência da obra

A chave Beta da obra é `mais_que_perfeito: "evitar"`, e o texto tem 197 construções
`tinha/havia + particípio`, concentradas nos caps. 6 (23), 10 (19), 14 (18), 12 e 13 (17 cada).

Isto **não é uma lista de 197 conserto**. Conforme a skill `revisar-capitulo`, converter em
massa produz prosa pior que a violação. Ver §5.

### 1.5 O que está limpo

Vale registrar, porque delimita o problema:

- **0** caracteres chineses vazados no português (1259 frases).
- **0** unidades transliteradas ("dois chi", "meio shichen"): a Seção 4 do Alfa está sendo obedecida.
- **1** vírgula de inciso dentro das aspas, contra 3 corretas (cap. 14).
- **5** suspeitas de omissão pela razão PT/ZH (mediana 3,98) e **1** de invenção — inspecionadas,
  são todas falso positivo (falas curtas: 我没看见 → "Eu não vi, eu não vi.").

---

## 2. O que é defeito do texto e o que é defeito da regra

### Defeito da regra (consertar isto primeiro; o resto é sintoma)

**(a) O Alfa §2 decide um tema que não é dele, e decide ao contrário do Delta.**

Alfa v3.0, Seção 2, última linha:

> **Títulos e cargos exclusivos:** sempre capitalizados.

Delta v1.8:

> Quando usados genericamente, sem designar uma pessoa específica, escreva em minúscula.

E o glossário — que os dois cabeçalhos declaram lei suprema — guarda 杀手 → **"Assassino"**,
com maiúscula, "inclusive nas flexões".

São três instruções, cada uma correta sozinha, incompatíveis juntas, sobre a mesma palavra.
É a assinatura exata que a skill descreve: **saída que oscila sem motivo aparente**. O modelo
não está desobedecendo; está escolhendo, e escolhe diferente a cada chamada.

Que a linha do Alfa é a invasora, prova-se dentro do próprio Alfa: quatro linhas acima, a mesma
Seção 2 faz a remissão certa —

> **Locais, seitas e organizações:** capitalizados. Traduzir ou transliterar é decidido na
> Seção 5 (Nomes próprios) — aqui só a capitalização.

O conserto é fazer a linha dos títulos parecer com a dos locais: o Alfa mantém o que é
universal e **remete a decisão de caixa à Seção 5**. Remissão não é sobreposição.

**(b) A regra do Delta é uma chave de Beta escrita como prosa.**

"Capitalização de títulos e tratamentos" não nomeia nada que só exista nesta obra: não cita a
Fortaleza, nem Gu Shenwei, nem 少爷. É política geral, aplicável a qualquer wuxia. Pelo
erro catalogado na skill ("Escreveu 'use travessão' no Delta → é chave de Beta"), está na
camada errada. Enquanto for texto livre do Delta, cada obra nova terá de reescrevê-la à mão, e
nenhuma tela avisará que ela colide com o Alfa.

**(c) Não existe tema de capitalização no registro.**

`shared/src/temasDoPrompt.ts` não tem entrada para caixa de títulos. Por isso a colisão (a)
nunca acendeu aviso: o verificador não sabe que esse tema existe. Sem a entrada no registro, o
conserto de (a) e (b) pode ser desfeito na próxima versão de núcleo sem ninguém perceber.

### Defeito do texto (só depois que a regra estiver certa)

- as ~86 ocorrências de caixa fora do critério (§3);
- as 21 ausências de glossário do §1.3, das quais 11 são 刀手 → Homem de Sabre;
- a ocorrência única de vírgula de inciso dentro das aspas, cap. 14.

Nenhum deles justifica retradução por si só. A ordem certa é: consertar as camadas, retraduzir
um capítulo, medir de novo, e só então decidir se o passivo vale um passe de correção.

---

## 3. Proposta de capitalização

### O critério

Uma pergunta só, aplicada à ocorrência:

> **A palavra está apontando QUEM, ou dizendo O QUÊ?**
> Aponta uma pessoa ou um grupo determinado → **maiúscula**.
> Diz uma função, uma classe ou uma profissão → **minúscula**.

Operacionalizada em cinco cláusulas, na ordem, parando na primeira que responder:

| # | caso | caixa | exemplo |
|---|---|---|---|
| 0 | a ocorrência faz parte de uma forma catalogada no glossário | a do glossário | "o **Espadachim da Grande Montanha Nevada**" |
| 1 | título colado a nome próprio | maiúscula | "**Patriarca** Gu Lun", "**Senhorita** Luo Ningcha" |
| 2 | vocativo (chamando a pessoa) | maiúscula | "Sim, **Senhorita**." |
| 3 | predicativo — função, estado, o que se torna | minúscula | "virar **assassino**", "aprendiz de **assassino**" |
| 4 | designa pessoa ou grupo determinado, no lugar do nome | maiúscula | "os vinte **Assassinos**", "o **Pequeno Senhor**" |
| 5 | todo o resto: classe, profissão, uso genérico | minúscula | "um **assassino** não é um ator" |

**Fundamento na norma pt-BR:** título e cargo são substantivos comuns e vão em minúscula no
uso corrente ("o patriarca ficou surpreso", "foi eleito presidente" — cláusulas 3 e 5). Sobem
para maiúscula em três situações reconhecidas: quando integram o nome próprio (cláusula 1),
no vocativo de tratamento (cláusula 2) e na antonomásia, em que o título substitui o nome de
uma pessoa determinada (cláusula 4 — "o Aleijadinho", "o Rei Sol").

**Fundamento no que a obra faz**, que é o que decidiu os empates: a cláusula 3 não veio da
gramática, veio de medir as correções manuais. O revisor rebaixou "Assassino" para minúscula
24 vezes, e o padrão delas é inequívoco — *"virar assassino"*, *"se tornasse um assassino"*,
*"aprendiz de assassino"* — **inclusive quando a Fortaleza é nomeada na mesma frase**. Ao
mesmo tempo manteve "os vinte Assassinos e setenta Homens de Sabre". A obra distingue o posto
de que se fala do posto em que alguém se torna, e um critério que só olhasse o contexto da
Fortaleza erraria essas 24.

### Quanto mudaria

Aplicado às 414 ocorrências de títulos e tratamentos em `texto_pt`:

- **328 já estão conformes (79%)**;
- **86 mudariam (21%)** — 65 para maiúscula, 21 para minúscula.

Por termo: assassino 43, senhorita 13, patriarca 7, chefe menor 7, senhor 5, homem de sabre 4,
administrador 4, espectro 2, espadachim 1.
Por capítulo, os mais afetados: cap. 6 (17), cap. 12 (10), caps. 8 e 10 (9 cada), cap. 0 (8).

**Validação contra o revisor.** O teste que importa não é a gramática, é se o critério
reproduz as decisões que o revisor já tomou à mão. Das 42 correções manuais de caixa em termos
de tratamento, o critério **concorda com 38 (90%)**. Os 4 restantes são a zona cinzenta
honesta: "esses Homens de Sabre" e "os assassinos experientes da Fortaleza" — grupo
determinado, mas onde o revisor mesmo hesitou entre as cláusulas 4 e 5.

### A que camada pertence

Pelas três perguntas da skill:

1. *Mudaria se eu traduzisse outro romance chinês?* **Mudaria** — e não por gosto: metade das
   webnovels traduzidas adota a convenção de capitalizar toda forma de tratamento ("o Jovem
   Mestre", "a Senhorita") como marca de gênero, e a outra metade segue a norma pt-BR estrita.
   As duas são legítimas e uma obra sua poderia querer cada uma. Não é Alfa.
2. *É escolha estética com oposto legítimo?* **Sim.** → **Beta, e como chave: não se escreve,
   se configura.**
3. (não se chega aqui)

**Proposta concreta:** chave `capitalizacao_titulos` em `PreferenciasEstilo`, com duas opções:

- `norma-pt` (padrão) — as cinco cláusulas acima;
- `titulos-maiusculos` — toda forma de tratamento em maiúscula, a convenção de gênero.

E os dois consertos que a acompanham, sem os quais a chave é ignorada em silêncio:

- **Alfa:** trocar "Títulos e cargos exclusivos: sempre capitalizados" por uma remissão à
  Seção 5, no molde que a linha dos locais já usa. Núcleos são imutáveis: corte v4.0, não edite v3.0.
- **Registro:** entrada nova em `TEMAS` (`id: 'capitalizacao_titulos'`, `dono: 'beta'`), com
  `filtravel: false` — porque, tal como `nomes_proprios`, **a política é de Beta mas o termo
  individual é do glossário**, e filtrar em silêncio descartaria diretriz legítima.
- **Delta v1.9:** remover a diretriz "Capitalização de títulos e tratamentos", que passa a ser
  a chave. Manter apenas o que é desta obra e de mais nenhuma.

### O que a chave NÃO resolve — e o `especie`/`nota_uso` resolve

A chave decide a política. Ela não decide, e nunca vai decidir, **se um "assassino" naquela
frase é o posto da Fortaleza ou o substantivo comum**. Essa é a colisão do §1.2, e é
precisamente o buraco que o mecanismo novo tapa. Para os termos de uma palavra que colidem com
substantivo comum:

| termo | `especie` | `ambiguo` | `nota_uso` sugerida |
|---|---|---|---|
| 杀手 → Assassino | `identidade` | 1 | "Só quando for o posto da Fortaleza do Peng Dourado, entre Homens de Sabre e Espectros." |
| 刺客 → Espectro | `identidade` | 1 | "Só quando for a categoria da Fortaleza, acima dos Assassinos." |
| 小姐 → Senhorita | `identidade` | 1 | "Só como tratamento dirigido a Luo Ningcha." |
| 老爷 → Patriarca | `identidade` | 1 | "Só quando designar Gu Lun, senhor da casa." |
| 小心 → Xiao Xin | `identidade` | 1 | "Só quando for a personagem; 小心 é 'cuidado' na maioria das ocorrências." |

`identidade` e não `lexical` porque nestes cinco a **forma** é a resposta — a maiúscula faz
parte do que se está mandando. `lexical` fica para os casos em que a palavra é lei e a
superfície flexiona livre (刀 → sabre).

Atenção ao contrato do `nota_uso`, que `prompts.ts` documenta e é fácil de violar: a nota diz
**só quando o termo se aplica**. Escrever "...; nos demais casos use minúscula" transformaria a
nota num glossário clandestino, prescrevendo o sentido comum sem passar por `especie` nem pela
varredura de consistência. A nota delimita; quem decide os demais casos é a chave de Beta.

Detalhe operacional: hoje os 139 termos da obra 1 estão com `especie: null` (o banco de
produção nem tem as colunas ainda — a migração 026 está no branch, não deployada). Enquanto
nenhum termo for marcado `lexical`, `formatarGlossario` não emite os cabeçalhos de bloco e a
distinção não chega ao modelo. Classificar os cinco acima **e pelo menos um `lexical`** é o
mínimo para o mecanismo ligar.

---

## 4. O que já melhorou — o que o revisor vem consertando à mão

467 das 1259 frases (**37,1%**) diferem de `texto_pt_original_ia`. Distribuídas por todos os
capítulos, com pico no cap. 7 (72 frases) e no prólogo (37).

Os 1465 trechos alterados se dividem em:

| tipo | trechos |
|---|---|
| palavra/expressão trocada | 1043 |
| reescrita de trecho | 262 |
| **caixa (maiúscula/minúscula)** | **84** |
| pontuação | 76 |

**As 84 correções de caixa são a medida direta do buraco desta revisão** — 57 de minúscula
para maiúscula, 27 no sentido inverso. Palavras mais recorrigidas: `assassino/assassinos`
(24×, todas para minúscula), `senhor` (8×), `qi` (8×), `divina` (6×), `jovem` (5×),
`homens de sabre` e `sabre` (6×), `mestre` (3×), `soberano` (2×).

Trocas lexicais que se repetem — cada uma é uma regra que o prompt ainda não entrega sozinha:

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

Lido como diagnóstico: **as trocas que viraram regra pararam de aparecer.** "pau-rosa",
"canalha" e "matadores → assassinos" estão hoje escritos no Delta (v1.6+), e as correções
manuais delas se concentram nos capítulos traduzidos *antes* de a regra entrar. O ciclo
funciona. O que ainda não virou regra e continua saindo caro é (i) a caixa dos títulos, (ii) a
distinção 少爷 / 小少爷 — 18 correções manuais, que o glossário já tem catalogada e o modelo
ainda confunde por serem duas entradas de uma palavra quase igual, e (iii) "aprendera" →
"aprendeu", que é a chave `mais_que_perfeito: evitar` sendo desfeita à mão, frase a frase.

---

## 5. O que NÃO vale mexer

**As 197 ocorrências de mais-que-perfeito composto.** É o maior número deste documento e o pior
candidato a mutirão. A skill `revisar-capitulo` já mediu, no cap. 2, que 12 das 13 ocorrências
pediam perfeito simples e que a conversão mecânica no sentido inverso empilha "tinha" e produz
prosa pior que a violação. Aqui há o agravante de o revisor já estar corrigindo as que
incomodam ("aprendera" → "aprendeu", 3×): o passivo restante é, em boa parte, uso legítimo.
Não vale passe automático; vale, no máximo, olhar os caps. 6 e 10 quando forem revisados por
outro motivo.

**As 9 "ausências" de 小心 → Xiao Xin.** Falso positivo por construção: 小心 é "cuidado" na
maioria das ocorrências. O conserto é marcar `ambiguo` + `nota_uso` na entrada do glossário —
zero frases tocadas.

**As 5 suspeitas de omissão e a 1 de invenção pela razão PT/ZH.** Todas inspecionadas, todas
falso positivo de falas curtas. A razão PT/ZH desta obra é saudável (mediana 3,98, contra ~3,9
esperado): não há sinal de omissão sistemática.

**A vírgula de inciso dentro das aspas.** Uma ocorrência em 1259 frases (cap. 14). Custa mais
abrir a ferramenta do que o defeito incomoda; conserte se passar por perto.

**Retraduzir os capítulos antigos para uniformizar a caixa.** As 86 ocorrências do §3 valem uma
correção dirigida, se e quando valerem — não valem uma retradução, que traz variância nova em
1259 frases para consertar 86. E não vale corrigir nada **antes** de fechar as camadas: sem o
conserto do Alfa §2, o próximo capítulo traduzido reabre o mesmo desvio.

**A capitalização de Yin/Yang/Qi.** O Delta já decide (v1.8, "Terminologia marcial"), o revisor
já corrigiu 8 vezes à mão, e a regra é recente demais para ter sido testada. Meça depois de
retraduzir um capítulo, não agora.

---

## Resumo executivo

1. A regra de capitalização existe no Delta v1.8 e **nunca traduziu um capítulo**. Medir antes
   de escrever mais regra.
2. O Alfa §2 ("Títulos e cargos exclusivos: sempre capitalizados") **contradiz** o Delta e o
   glossário. É a causa da oscilação, e o conserto é uma remissão à Seção 5, no molde que a
   linha dos locais já usa.
3. O critério proposto — *aponta QUEM, maiúscula; diz O QUÊ, minúscula* — mudaria **86 de 414**
   ocorrências (21%) e **concorda com 90%** das correções que o revisor já fez à mão.
4. Ele é **chave de Beta** (`capitalizacao_titulos`), com tema novo no registro; a parte que
   nenhuma chave resolve — 杀手 posto × substantivo comum — é `especie: identidade` +
   `ambiguo` + `nota_uso` nos cinco termos que colidem.
5. Consistência nesta obra é função de cobertura do glossário: onde a forma catalogada é
   inconfundível, o desvio é 1 em 21; onde é uma palavra só que também é substantivo comum, é
   moeda ao ar.
