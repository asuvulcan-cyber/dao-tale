---
name: revisar-capitulo
description: Auditar a qualidade de um capítulo traduzido do Dao Tale (obra em mandarim ou em inglês) e corrigir o que estiver fora das regras da obra — violações de estilo, alucinação, omissão, inconsistência de glossário, decalque e unidades de medida. Use quando o usuário pedir para conferir, revisar ou auditar um capítulo, quando reclamar que "a IA está ignorando uma regra", ou quando quiser comparar a qualidade entre configurações de tradução (modelos, provedores, esforço).
---

# Revisar um capítulo traduzido

## Antes de tudo: de que idioma é a obra?

```bash
curl -s localhost:8317/api/obras/<obra_id> | python3 -c "import sys,json; print(json.load(sys.stdin)['idioma_origem'])"
```

`zh` ou `en` decide o núcleo do prompt, os detectores e o que procurar na leitura
(doc 28). No inglês, **catálogo de erros e sinais bilíngues não existem** — campo
`false`/`null` ali é "varredura inexistente", não "zero problemas". A leitura
humana pesa ainda mais.

## A disciplina que vale mais que o resto

**Quando parecer que o modelo ignora uma regra, suspeite da regra primeiro.**

Três vezes nesta obra a "desobediência" era contradição interna do prompt:

| Contradição | Sintoma |
|---|---|
| `Conteúdo > Glossário (lei suprema)` | precedência que se nega na mesma linha |
| Seção 2 mandando "manter a sonoridade" nos locais vs. Seção 5 mandando traduzir | `Beiting` num capítulo, `Corte do Norte` no outro |
| `o ponto vira vírgula, DENTRO das aspas — "Não há saída", disse ele.` | prosa em desacordo com o próprio exemplo |

Assinatura comum: duas instruções corretas isoladamente, incompatíveis juntas, e saída que oscila entre elas **sem motivo aparente**. Se a saída oscila, procure a contradição antes de reforçar a regra.

Antes de concluir que o modelo desobedeceu, **confirme que a regra chegou nele**:

```bash
# monta o prompt exatamente como o job monta (composto = núcleo + preferências + delta)
reposPrompts.composto(db, obraId).texto
```

Já aconteceu de a regra não estar no prompt. Também já aconteceu de eu conferir com `reposPrompts.ativo` (devolve só o delta, quase sempre vazio) e concluir errado — **use `composto`**. O motor (`claude-code`) roda sem skills nem ferramentas: o que não está no composto ou no glossário, ele não sabe.

## Procedimento

### 1. Varredura automática (sem IA, sem custo)

```bash
curl -s localhost:8317/api/capitulos/<id>/estilo | python3 -m json.tool
curl -s localhost:8317/api/capitulos/<id>/consistencia   # glossário
```

`por_terco` é o campo que mais informa: concentração no **fim** acusa bloco grande demais (decaimento ao longo de uma geração longa); distribuição **espalhada** acusa outra coisa — regra ambígua, ou conteúdo que puxa para o erro.

### 2. Pontos cegos do scanner — estes exigem leitura humana

A varredura **não acusa** e nunca vai acusar sozinha:

- **Fidelidade ao original** — tradução fluente e errada passa por todo teste automático. Só a leitura origem↔PT pega.
- **`fora`, `era`, `vira`, `dera`** — ambíguas demais (preposição, conjunção, imperfeito de *ser*, presente de *virar*). São mais-que-perfeito de verdade em muitos casos. Busque à mão.

**Mandarim:**
- **Sentido invertido** — o caso mais grave que apareceu foi 刀/剑 colapsando em "espada", tornando a frase autocontraditória. Dicionários de aprendiz fazem o mesmo colapso (o DCP dá 刀 = "faca; espada"): para distinções de wuxia, dicionário não decide — contexto e glossário decidem.
- **Chengyu e expressões** traduzidos ao pé da letra.

**Inglês** (o decalque passa porque o português o tolera — o núcleo `NUCLEO_EN_PT` proíbe estes, então cada um é violação real):
- **Possessivo de posse óbvia** ("seus olhos", "a mão dela" para *his eyes*, *her hand*).
- **Progressivo reflexo** ("estava caminhando" onde o original só narra a ação).
- **Passiva calcada** ("ele foi dito"); **phrasal verb/idiom peça por peça**.
- **`said` enfeitado** ("proferiu", "articulou") — o original repete "disse" de propósito.
- **Falsos cognatos**: *actually* ≠ atualmente, *eventually* ≠ eventualmente, *pretend* ≠ pretender, *realize* ≠ realizar, *sensible* ≠ sensível, *argument* ≠ argumento (discussão).

Nenhum número de violações substitui ler o capítulo contra o original.

### 3. Verificações que valem por script

```sql
-- texto de origem sobrando na tradução, traduções duplicadas, frases vazias
-- razão de caracteres PT/origem para suspeitar de omissão ou invenção
```

Razão PT/origem: no **mandarim**, mediana **3,88** (1.812 frases do Sutra dos Mortos, medido em 20/11/2026); abaixo de 60% da mediana = suspeita de omissão, acima de 170% = suspeita de invenção. No **inglês ainda não há medição** — calcule a mediana da própria obra antes de usar limiar; não chute.

Termo do glossário presente na origem e ausente no PT = violação real. Termo **fora** do glossário traduzido de dois jeitos = a correção é cadastrar o termo, não editar as frases.

### 4. Corrigir

Aplique por `PATCH /api/frases/:id` com `{ texto_pt }`. Uma frase por vez, com o original à vista.

**Nunca converta mecanicamente.** As regras da obra são hierarquias de escolha, não substituições:

- **Anterioridade:** 12 das 13 ocorrências do capítulo 2 pediam **perfeito simples** (`nunca aprendeu`), não `tinha + particípio`. Converter tudo para perífrase empilha `tinha` e produz prosa **pior** que a violação. Só use `tinha`/`havia` quando nenhum advérbio marcar a anterioridade — e alterne os dois.
- **Vírgula do inciso:** fica **depois** das aspas (`"Não há saída", disse ele.`). Dentro é convenção do inglês.
- **Nomes próprios (mandarim):** sentido vs som. `中原` (centro+planície) descreve → traduz. `疏勒` é transcrição de Kashgar → translitera. Pessoa sempre em pinyin, mesmo com sentido pleno.
- **Unidades:** converta ao métrico, arredondado como prosa. Mandarim: 1里 ≈ 500 m, 1丈 ≈ 3,3 m, 1尺 ≈ 33 cm, 1斤 ≈ 500 g. Inglês: pés, polegadas, jardas, milhas, libras, onças, galões, °F. Exceção nos dois: medida usada como imagem — `一寸土地` é "um palmo de terra", *miles away* é "muito longe", *an inch from death* não vira cálculo.

### 5. Conferir

Rode a varredura de novo. Zero violações é o alvo; se sobrar, confirme que não é falso positivo antes de mexer (`prepara`, `embora`, `de fora do clã` já apareceram).

## Cuidados

- **O usuário pode estar revisando o mesmo capítulo agora.** Já aconteceu de eu ir corrigir uma frase que ele já tinha consertado. Leia o texto atual antes de escrever, nunca o `texto_pt_original_ia`.
- **Frase do usuário não se sobrescreve.** `editado_manualmente = 1` ou `origem_edicao = 'tutor'` (tradução feita por ele no modo tutor): aponte o problema e proponha; quem decide é ele.
- **Termo "oficial" só com fonte.** Se for sugerir como uma editora ou um jogo traduziu um termo, cite a fonte (link). De memória, não — um termo oficial inventado com segurança é pior que nenhum. Precedente informa; o glossário da obra decide.
- **Para comparar configurações**, meça sobre `texto_pt_original_ia` (texto cru da IA); para corrigir, use `texto_pt`. Misturar os dois invalida a comparação.
- **Mudança no scanner ou nos prompts** só vale depois de reiniciar o servidor (ele roda do TypeScript via `tsx`; `npm run build` só é preciso para mudança em `web/`). Medir sem reiniciar mede o código velho.
- Ao mudar uma regra do prompt, **confira prosa contra exemplo** como passo separado. As três contradições passariam por qualquer revisão que lesse só um dos dois.

## Onde está o resto

- `docs/08-prompt-universal.md` — por que cada regra existe, e as medições
- `docs/28-perfis-de-idioma.md` — o que cada perfil (mandarim/inglês) decide e o que ainda não existe no inglês
- `server/src/db/promptPadraoInicial.ts` — os núcleos (`NUCLEO_EN_PT` e os mandarins)
- `shared/src/preferenciasEstilo.ts` — o texto das regras que vai ao prompt
- `server/src/traducao/estiloViolacoes.ts` — o que a varredura sabe detectar
