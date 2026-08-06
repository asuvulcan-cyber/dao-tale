---
name: camadas-do-prompt
description: Use when adding, moving or reviewing a translation rule in the dao-tale prompt — writing a work's Delta, cutting a new Alfa (núcleo) version, deciding whether something belongs in a style key, or investigating why the model ignores a rule, contradicts itself between calls, or produces output that looks stale or repetitive.
---

# Camadas do prompt

## Overview

O prompt que vai para a IA (**Ômega**) é a soma de três camadas. A regra que as governa é
uma **partição por tema**: cada tema pertence a exatamente uma camada. Quando duas camadas
falam do mesmo tema, quem decide é o modelo — e a decisão muda a cada chamada.

| Camada | O que é | A pergunta que responde |
|---|---|---|
| **Alfa** | universal zh→pt-BR (tabela `prompt_padrao`) | *como se traduz do chinês sem decalque?* |
| **Beta** | preferências de estilo, chaves fechadas | *quais convenções de casa esta obra segue?* |
| **Delta** | diretrizes da obra, texto livre | *o que só existe nesta obra?* |
| **Ômega** | o composto que a IA recebe | — é a soma, não uma camada |

O buraco em γ é encaixe reservado: α, β e δ ocupam posições numa escala de especificidade,
e γ é a posição livre para uma quarta entrada que ainda não existe. Ômega é a última letra
— nunca poderá ser camada, porque não há nada depois dela para ser mais específico.

**Acima das três: o glossário é lei.** Os cabeçalhos de Beta e Delta dizem isso
explicitamente, e é por isso que uma chave de estilo não derruba um termo catalogado.

## Onde a regra vai — três perguntas, em ordem

Pare na primeira que responder sim.

1. **Essa regra mudaria se eu traduzisse outro romance chinês?**
   Não → **Alfa**. (时辰 = 2 horas; 对方 não é "a outra parte".)
2. **É escolha estética com um oposto legítimo, que outra obra sua poderia querer ao
   contrário?**
   Sim → **Beta** — e é uma chave: não se escreve, se configura.
3. **A regra nomeia algo que só existe nesta obra — personagem, vício de fala, topônimo?**
   Sim → **Delta**.

**Se parece caber em duas, está mal escrita.** Quase sempre é uma regra de Alfa com um
exemplo da obra grudado. Separe: a regra sobe, o exemplo desce.

## O registro de temas é a fonte de verdade

`shared/src/temasDoPrompt.ts` — tema → camada dona → padrão de reconhecimento. Não
classifique de cabeça: consulte a tabela.

Os padrões miram a **decisão**, não o vocabulário. *"Alterne apenas entre nome próprio,
pronome e sujeito oculto"* fala em nome próprio e é tema de **Alfa** (variação elegante),
não de Beta — não decide nada sobre transliteração.

**Remissão não é sobreposição.** Um Alfa pode e deve dizer *"isto se decide na Seção 5"*:
é a partição funcionando à vista, e o registro isenta essas linhas.

### Acrescentar um tema

1. Entrada nova em `TEMAS`, com `dono`, `resolucao` e `padrao`.
2. `filtravel: true` só quando derrubar um candidato **em silêncio** for sempre certo. Na
   dúvida, `false`: o tema aparece no aviso e fica fora do filtro. `nomes_proprios` é
   `false` porque a política é de Beta mas o nome específico é do glossário.
3. Medir nos **dois sentidos** antes de commitar: o Alfa distribuído continua limpo
   (`server/src/db/promptPadraoInicial.test.ts`) e cada variante de Beta acende o seu tema.

## Aviso, nunca bloqueio

O dono é o dono e às vezes quer mesmo a exceção. O que não pode é a sobreposição acontecer
sem ele ver. Toda checagem mostra o **trecho que casou** e deixa salvar.

## Erros comuns

| Sintoma | O que está acontecendo |
|---|---|
| "A IA ignora essa regra" | duas camadas falam do mesmo tema; o modelo escolhe |
| "Mudei a preferência e não mudou nada" | o Alfa ativo não traz `{{PREFERENCIAS_OBRA}}` — as chaves são descartadas em silêncio |
| "O prompt está repetitivo / desatualizado" | o Alfa ativo é versão antiga que decide temas hoje pertencentes a Beta |
| Escreveu "use travessão" no Delta | é chave de Beta (`dialogo`), não diretriz |
| Editou uma versão de Alfa no lugar de criar outra | versões são imutáveis: corte uma nova e ative-a |
| Dois bancos, duas "v5.0" | versão só identifica bytes com **um** escritor. Uma instância só. |

## Nunca

- **Renomear Delta**, `prompts.tipo = 'delta'` ou `{{DELTA_OBRA}}`: estão gravados dentro
  de versões de núcleo imutáveis, e renomear quebra os núcleos antigos.
- **Afrouxar um padrão do registro para um teste passar.** Ou o Alfa invadiu mesmo, ou o
  padrão precisa mirar melhor a decisão — nos dois casos o conserto é outro.

Diagnóstico completo: `docs/15-camadas-do-prompt.md`. Desenho: `docs/superpowers/specs/2026-08-06-camadas-do-prompt-design.md`.
