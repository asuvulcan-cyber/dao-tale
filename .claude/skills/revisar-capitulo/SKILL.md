---
name: revisar-capitulo
description: Auditar a qualidade de um capítulo traduzido do Dao Tale e corrigir o que estiver fora das regras da obra — violações de estilo, alucinação, omissão, inconsistência de glossário e unidades de medida. Use quando o usuário pedir para conferir, revisar ou auditar um capítulo, quando reclamar que "a IA está ignorando uma regra", ou quando quiser comparar a qualidade entre configurações de tradução.
---

# Revisar um capítulo traduzido

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

Já aconteceu de a regra não estar no prompt. Também já aconteceu de eu conferir com `reposPrompts.ativo` (devolve só o delta, quase sempre vazio) e concluir errado — **use `composto`**.

## Procedimento

### 1. Varredura automática (sem IA, sem custo)

```bash
curl -s localhost:8317/api/capitulos/<id>/estilo | python3 -m json.tool
curl -s localhost:8317/api/capitulos/<id>/consistencia   # glossário
```

`por_terco` é o campo que mais informa: concentração no **fim** acusa bloco grande demais (decaimento ao longo de uma geração longa); distribuição **espalhada** acusa outra coisa — regra ambígua, ou conteúdo que puxa para o erro.

### 2. Pontos cegos do scanner — estes exigem leitura humana

A varredura **não acusa** e nunca vai acusar sozinha:

- **`fora`, `era`, `vira`, `dera`** — ambíguas demais (preposição, conjunção, imperfeito de *ser*, presente de *virar*). São mais-que-perfeito de verdade em muitos casos. Busque à mão.
- **Fidelidade ao chinês** — tradução fluente e errada passa por todo teste automático. Só a leitura ZH↔PT pega.
- **Sentido invertido** — o caso mais grave que apareceu foi 刀/剑 colapsando em "espada", tornando a frase autocontraditória.

Nenhum número de violações substitui ler o capítulo contra o original.

### 3. Verificações que valem por script

```sql
-- chinês sobrando na tradução, traduções duplicadas, frases vazias
-- razão de caracteres PT/ZH: mediana ~3,9. Abaixo de 60% da mediana = suspeita
-- de omissão; acima de 170% = suspeita de invenção
```

Termo do glossário presente no ZH e ausente no PT = violação real. Termo **fora** do glossário traduzido de dois jeitos = a correção é cadastrar o termo, não editar as frases.

### 4. Corrigir

Aplique por `PATCH /frases/:id` com `{ texto_pt }`. Uma frase por vez, com o ZH à vista.

**Nunca converta mecanicamente.** As regras da obra são hierarquias de escolha, não substituições:

- **Anterioridade:** 12 das 13 ocorrências do capítulo 2 pediam **perfeito simples** (`nunca aprendeu`), não `tinha + particípio`. Converter tudo para perífrase empilha `tinha` e produz prosa **pior** que a violação. Só use `tinha`/`havia` quando nenhum advérbio marcar a anterioridade — e alterne os dois.
- **Vírgula do inciso:** fica **depois** das aspas (`"Não há saída", disse ele.`). Dentro é convenção do inglês.
- **Nomes próprios:** sentido vs som. `中原` (centro+planície) descreve → traduz. `疏勒` é transcrição de Kashgar → translitera. Pessoa sempre em pinyin, mesmo com sentido pleno.
- **Unidades:** converta ao métrico (1里 ≈ 500 m, 1丈 ≈ 3,3 m, 1尺 ≈ 33 cm, 1斤 ≈ 500 g). Exceção: medida usada como imagem — `一寸土地` é "um palmo de terra", não "3,3 cm".

### 5. Conferir

Rode a varredura de novo. Zero violações é o alvo; se sobrar, confirme que não é falso positivo antes de mexer (`prepara`, `embora`, `de fora do clã` já apareceram).

## Cuidados

- **O usuário pode estar revisando o mesmo capítulo agora.** Já aconteceu de eu ir corrigir uma frase que ele já tinha consertado. Leia o texto atual antes de escrever, nunca o `texto_pt_original_ia`.
- **Para comparar configurações**, meça sobre `texto_pt_original_ia` (texto cru da IA); para corrigir, use `texto_pt`. Misturar os dois invalida a comparação.
- **Reiniciar o servidor** é necessário para mudanças no scanner ou nos prompts valerem: `npm run build` e reinício. Medir sem reiniciar mede o código velho.
- Ao mudar uma regra do prompt, **confira prosa contra exemplo** como passo separado. As três contradições passariam por qualquer revisão que lesse só um dos dois.

## Onde está o resto

- `docs/08-prompt-universal.md` — por que cada regra existe, e as medições
- `shared/src/preferenciasEstilo.ts` — o texto das regras que vai ao prompt
- `server/src/traducao/estiloViolacoes.ts` — o que a varredura sabe detectar
