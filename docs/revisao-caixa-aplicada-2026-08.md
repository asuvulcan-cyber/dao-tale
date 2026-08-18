# Correção de caixa aplicada — 死人经 / O Sutra dos Mortos

Passada de capitalização de títulos e formas de tratamento sobre `frases.texto_pt` da obra 1,
no banco de produção (`/var/lib/dao-tale/dao-tale.db`). Executada em 2026-08-18.

Backup anterior à passada: `/var/lib/dao-tale/backups/pre-caixa-2026-08-18T08-21-49-850Z.db`.

O critério aplicado é o do §3 de `docs/revisao-obra-2026-08.md`, na Leitura N (norma pt-BR):
vocativo (R1), antonomásia (R2) e categoria nomeada da Fortaleza (R3) sobem para maiúscula;
título antes de nome próprio, predicativo e uso genérico (R4) ficam em minúscula. A caixa do
verbete no glossário não decidiu nada.

## Os números

| | |
|---|---|
| ocorrências levantadas e lidas em contexto | **592** (25 raízes de título/tratamento, 17 capítulos) |
| ocorrências alteradas | **31**, em 28 frases |
| ocorrências deixadas em dúvida | **12 grupos**, ~75 ocorrências (§ *Dúvidas*) |
| frases da obra, antes e depois | 1259 = 1259 |
| `PRAGMA integrity_check` / `quick_check` / `foreign_key_check` | ok / ok / vazio |

Levantamento inicial com rede mais larga (incluindo parentesco e modificadores como *jovem*,
*pequeno*, *grande*): 1101 ocorrências. As 509 descartadas eram substantivo comum sem função de
título (*homem feito*, *jovens escravos*), parentesco (*pai*, *irmã*) ou o nome próprio
"Mãe Neve" (雪娘), catalogado como personagem.

Todas as 28 frases foram gravadas com `editado_manualmente = 1` e `origem_edicao = 'substituicao'`,
com troca por posição — só a palavra no índice conferido, nunca a frase reescrita. Cada troca foi
verificada antes de gravar: o trecho na posição tinha de bater exatamente com a palavra esperada e
estar isolado por fronteira de letra Unicode.

## O que mudou, por termo

| termo | direção | n | regra |
|---|---|---|---|
| `assassino`/`assassinos` | ↑ maiúscula | 11 | R3 — posto da Fortaleza do Peng Dourado |
| `Mestre` (Yang / Yang Zheng) | ↓ minúscula | 8 | R4 — título antes de nome próprio |
| `Patriarca` (Gu Lun) | ↓ minúscula | 4 | R4 — título antes de nome próprio |
| `Assassino`/`Assassinos` | ↓ minúscula | 4 | R4 — predicativo |
| `Marechal` (Yang) | ↓ minúscula | 3 | R4 — título antes de nome próprio |
| `senhorita` | ↑ maiúscula | 1 | R1 — vocativo |

19 rebaixadas, 12 elevadas.

## O que mudou, por capítulo

| cap. | n | o quê |
|---|---|---|
| 0 (prólogo) | 3 | `assassinos` → `Assassinos`, nos três pares coordenados com "Homens de Sabre" |
| 1 | 2 | `Patriarca Gu Lun` → `patriarca Gu Lun` |
| 2 | 3 | `Mestre Yang` ×2, `Marechal Yang` ×1 |
| 3 | 5 | `Mestre Yang` ×3, `Marechal Yang` ×2 |
| 4 | 1 | `Mestre Yang Zheng` |
| 6 | 5 | `assassino da Fortaleza` ×4 ↑, `Mestre Yang Zheng` ×1 ↓ |
| 7 | 2 | `assassino(s) da Fortaleza` ↑ |
| 10 | 1 | `Mestre Yang Zheng` |
| 11 | 1 | `Patriarca Gu Lun` |
| 12 | 4 | `ser Assassinos` ×2 ↓, `assassinos da Fortaleza` ↑, `Sim, senhorita.` → `Sim, Senhorita.` |
| 13 | 1 | `Patriarca Gu Lun` |
| 14 | 2 | `se tornar Assassino`, `virar Assassino` ↓ |
| 15 | 1 | `assassinos experientes da Fortaleza` ↑ |

Capítulos 5, 8, 9 e 16 não foram tocados.

Cada elevação foi conferida contra o chinês: as 11 de `assassino` estão sobre 金鹏堡杀手 /
金鹏堡的杀手 (o posto), o vocativo está sobre "是，小姐。". Cada rebaixamento de predicativo está
sobre 当杀手 / 成为杀手 ("virar assassino"), inclusive o do cap. 14, que traz 金鹏堡 na mesma
frase — contexto da Fortaleza não bastou para capitalizar, como manda a regra.

## Dúvidas — o que ficou como estava, e por quê

Nenhuma destas foi tocada. São os casos em que as cláusulas do critério se cruzam e uma troca
errada custaria mais do que uma minúscula sobrando.

1. **`a senhorita` narrativo — ~45 ocorrências, caps. 8 a 14, todas em minúscula.** Pela letra da
   R2 ("o título sozinho, com artigo definido, no lugar do nome de uma pessoa determinada"), as
   45 subiriam: designam Luo Ningcha. Mas o §1.1 do relatório mediu apenas **3** erros no termo, e
   o `nota_uso` proposto para 小姐 no §3 diz "**só como tratamento dirigido** a Luo Ningcha" — ou
   seja, a maiúscula do verbete é para o vocativo, e a menção narrativa é substantivo comum. Além
   disso o texto está internamente coerente: as 45 estão em minúscula do começo ao fim, o que é
   escolha, não deriva. Virar 45 ocorrências com base numa leitura que o próprio relatório não
   seguiu seria refazer o estilo, não corrigir erro. **É a maior decisão em aberto desta passada.**
2. **`o administrador` — 4 ocorrências (caps. 11 e 13), em minúscula.** Designa Han Jinu, mas é
   introduzido como predicado descritivo ("O administrador do Pátio da Lenha Empilhada era um
   homem de vinte e poucos anos") e retomado anaforicamente — não é substituto do nome. Mantido em
   minúscula, coerente com o item 1. Note que `administrador Han` (cap. 13) já está correto pela R4.
3. **`o patriarca` sozinho em [1.5] (id=82), em minúscula.** "não era de se estranhar que o
   patriarca ficasse surpreso" — antonomásia de Gu Lun pela R2, e o mesmo capítulo traz "é o
   Patriarca" em maiúscula ([1.36], id=113). Deixei como está pela mesma razão dos itens 1 e 2:
   optei por não elevar **nenhum** título nu em narração, para não aplicar dois pesos. É a
   ocorrência mais defensável de todas as dúvidas — se a decisão do item 1 for "elevar", esta vai junto.
4. **Formas de tratamento entre aspas: `chamava de "Mestre Yang"` (id=125) e `procurava o
   "Marechal Yang"` (id=215).** São título + sobrenome, o que pela R4 pediria minúscula, mas as
   aspas marcam a forma de tratamento em si — vizinha do vocativo. Mantidas em maiúscula. As
   demais 8 de "Mestre Yang" e 3 de "Marechal Yang", sem aspas, foram rebaixadas.
5. **`Oitavo Jovem Mestre Shangguan Nu` / `Jovem Mestre Shangguan Nu` — 13 ocorrências, todas em
   maiúscula.** Estruturalmente é título + nome próprio (R4 rebaixaria), mas o ordinal transforma o
   sintagma em designação de portador único dentro da família Shangguan, e o §1.2 do relatório
   mediu "Jovem Mestre" em 13/13 correto. Mesmo raciocínio vale para `Oitava Jovem Senhora` (8).
6. **`Um espadachim da Grande Montanha Nevada` em [6.6] (id=418), em minúscula** — as outras 11 da
   forma catalogada estão em maiúscula. O relatório chama esta de "a que escapou", mas o artigo
   indefinido faz o sintagma ler como membro de categoria ("um espadachim vindo da Grande Montanha
   Nevada"), não como o epíteto de Long Feidu. Ambíguo de verdade.
7. **`assassino de preto` — ~10× em minúscula no cap. 6, `Assassino de preto` em maiúscula no
   cap. 13.** É o mesmo personagem e o mesmo posto, mas o sintagma é epíteto descritivo, e a R3
   exige a Fortaleza em jogo **na frase**, o que não ocorre em nenhuma das duas. Deixar as duas
   caixas convivendo é feio; escolher uma delas sem regra que sustente seria pior.
8. **`me tornar o assassino mais temido da Fortaleza` (id=1155) e `como se já fosse o mundialmente
   famoso assassino da Fortaleza` (id=1156), cap. 15, em minúscula.** O sintagma casa com a R3,
   mas a construção é predicativa, que a R4 manda rebaixar. Deixei a R4 vencer por omissão — não
   toquei. Sob a mesma dúvida, `Assassino` em [12.10] e [14.72]–[14.73] eu **rebaixei**, porque ali
   o predicativo é nu (`ser Assassinos`, `virar Assassino`), exatamente o caso que o revisor humano
   já rebaixou 24 vezes à mão.
9. **`era um Assassino leal às ordens do Oitavo Jovem Mestre` (id=1074), em maiúscula.**
   Predicativo, mas com o posto qualificado e em contraste explícito com "tinha sido o Pequeno
   Senhor da família Gu" na mesma frase. Mantido.
10. **`senhora da casa` — 2 ocorrências (caps. 9 e 13), em minúscula.** 女主人 está catalogado como
    "Senhora da Casa", mas é cargo de vários portadores (fora da G1) e aqui vem com adjetivo
    intercalado ("a cruel senhora da casa"), o que puxa para substantivo comum.
11. **`nossa senhorita da Montanha de Ferro` (id=589), em minúscula.** 铁山小姐 é epíteto de
    portador único e cairia na G1 (maiúscula), mas o possessivo "nossa" faz o sintagma ler como
    relação, não como designação.
12. **`o senhor Assassino` (id=1083), em maiúscula.** Tratamento deferente em terceira pessoa,
    parente do vocativo. Mantido.

## Três divergências com o relatório de medição

O aviso de não confiar nas coordenadas do `revisao-obra-2026-08.md` se confirmou em três pontos —
todos no mesmo sentido, o de erros contados que não existem no texto:

- **`espectro` — o relatório aponta 2 erros no cap. 10.** O texto tem exatamente 3 ocorrências de
  `espectro`/`Espectros`, todas no cap. 10, todas em maiúscula e todas com a Fortaleza nomeada na
  frase. Estão certas pela R3. Nada a corrigir.
- **`homem/ns de sabre` — o relatório aponta 2 erros no cap. 10.** As 8 ocorrências de "Homens de
  Sabre" no cap. 10 estão em maiúscula e corretas. Os erros reais desse par estão no **prólogo**, e
  não em "Homem de Sabre": é o `assassinos` minúsculo ao lado do `Homens de Sabre` maiúsculo, que o
  relatório contabilizou sob `assassino`.
- **`administrador` — o relatório aponta 3 erros nos caps. 12 e 13.** O termo não ocorre nenhuma
  vez no cap. 12. As 6 ocorrências do livro estão nos caps. 11, 13 e 14.

Em compensação, duas contagens do relatório bateram exatamente: as **3** ocorrências do par
coordenado no prólogo, e a divisão **8 minúsculas (caps. 6, 7, 12, 15) × 4 maiúsculas (caps. 13,
14, 16)** do sintagma "assassino da Fortaleza do Peng Dourado".

## Padrões que apareceram

**Nenhum erro está numa expressão de várias palavras.** Os epítetos catalogados saem
impecáveis — "Deus Cabeçudo" 70/0, "Pequeno Senhor" 27/0, "Jovem Mestre" 13/0, "Rei Incomparável"
sem uma minúscula sequer, "Espadachim da Grande Montanha Nevada" 11 de 12 (o item 6 das dúvidas).
Todo erro corrigido está sobre um título **de uma palavra só que
também é substantivo comum**: 杀手, 老爷, 小姐, 师父, 元帅. É a mesma conclusão do §1.2 do
relatório, agora confirmada palavra por palavra: o que protege um termo não é a frequência nem o
capítulo, é a expressão ser longa o bastante para não se confundir com prosa comum.

**A deriva de `assassino da Fortaleza do Peng Dourado` é por bloco, não por contexto.** As 8
minúsculas estão nos caps. 6, 7, 12 e 15; as 4 maiúsculas, nos caps. 13, 14 e 16. É o mesmo
sintagma, quase sempre traduzindo o mesmo 金鹏堡杀手, e a caixa vira a partir do cap. 13 e não
volta. Tem a cara da deriva de aspas por bloco documentada na revisão do cap. 4 — o modelo fixa uma
convenção dentro de uma chamada e a troca na seguinte.

**No prólogo o erro é dentro da mesma frase.** "Os assassinos eram a elite da Fortaleza do Peng
Dourado; os Homens de Sabre eram mercenários da Fortaleza" — duas categorias coordenadas, a três
palavras de distância, em caixas opostas, três vezes. 刀手 saiu do glossário como forma fixa e
veio maiúsculo; 杀手 foi tratado como substantivo comum. A lista de termos entregou a caixa de um
e não do outro, o que é exatamente o buraco que `especie`/`nota_uso` fecham.

**O revisor humano já tinha varrido o predicativo.** Das dezenas de "virar assassino" / "aprendiz
de assassino" do livro, sobraram só 4 em maiúscula, e as 4 estão concentradas nos caps. 12 a 14 —
justamente onde a deriva de bloco tinha acabado de trocar a convenção.

## Efeito colateral a registrar

Das 28 frases gravadas, **15 carregavam edição manual** (`editado_manualmente = 1` com
`origem_edicao = NULL`), 7 estavam cruas da IA e 6 já vinham de substituição anterior. Gravar as 28
com `origem_edicao = 'substituicao'`, como pedido, **tira essas 15 do universo de mineração de
edições manuais** — elas deixam de alimentar `classificarEdicoes` e o refinamento. É o
comportamento correto para esta passada mecânica (nenhuma das 31 trocas é lição de estilo do
revisor), mas as 15 lições que aquelas frases carregavam de antes saem junto.
