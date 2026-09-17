# Experimento de registro com Flash — 17/09/2026

## Resultado

Não promover a orientação candidata. A amostra não mostra melhora consistente de
registro e apresenta regressões de forma e sentido. Nenhum prompt, capítulo,
glossário ou lote de revisão da aplicação foi modificado pelo experimento.

## Desenho

- Modelo: `gemini-3.8-flash`, confirmado nas quatro respostas; temperatura 0,3.
- Base: Alfa 6.3 / Delta 2.4, congelados com Gama e contexto.
- Dois blocos contíguos: 23.30–39 e 24.40–49, dez frases por bloco.
- Cada bloco recebe uma tradução base e uma candidata. Quatro chamadas lógicas,
  todas concluídas, 40 traduções para 20 frases únicas.
- Ordem alternada: base/candidata no 23, candidata/base no 24.
- Mesmo chinês, glossário e três frases de contexto anterior/posterior nas duas
  condições. O contexto anterior usa a primeira IA, não a referência aprovada.
- Textos aprovados ficam no artefato para avaliação; não são enviados como exemplos.
- Frases preservadas na revisão anterior também participam (p.ex. 23.31–34 e 24.43/45/46).
- Candidata: somente uma seção adicional pedindo registro corrente na narração
  neutra, preservação da solenidade contextual, imagens, ambiguidades e anterioridade.
  O texto exato está no script e no artefato.

Trata-se de um diagnóstico exploratório em capítulos já conhecidos, com uma geração
por condição. Não é teste cego, holdout, comparação estatística nem reprodução exata
de uma tradução contínua do capítulo: a memória de termos adotados começa vazia.
O efeito da orientação não pode ser separado completamente da variabilidade da geração.

## Conferência editorial contra o chinês

| Trecho | Observação |
|---|---|
| 23.31 | Ambas preservam a identificação de Han Jinu, sem mudança desnecessária. |
| 23.33 | A candidata produz a construção pouco natural “por suas pernas de calça”. |
| 23.35 | A candidata remove “tomou-lhe o peito”, mas ainda usa “tomado pelo impulso”; melhora local, não solução geral. |
| 23.36 | Ambas deformam a comparação: tortura é para os garotos algo lendário, como deuses/fantasmas, não lendas *sobre* essas entidades. A candidata também troca deuses por demônios. |
| 23.37–38 | Base marca pensamentos em itálico e primeira pessoa; candidata perde a marcação e usa terceira pessoa. |
| 23.39 | Candidata mantém registro elevado: “com destreza”, “açoitamento”, “clamor contínuo”. |
| 24.41 | “Uma ponta de medo” é mais corrente que “um lampejo de temor”; ganho local. |
| 24.42 | Candidata introduz “traíra”, mantém “trabalho mais vil” e torna ser diferente em “anomalia”. Base também exagera com “aberração”. |
| 24.44 | Candidata acrescenta “insistência involuntária” ao simples hábito de lavar as mãos frequentemente; “espinha ereta” persiste nas duas. |
| 24.47 | Candidata evita “sucumbiu à possessão”, da base, mas “cometer um atentado” ainda não transmite com precisão o assassinato realizado. |
| 24.49 | As duas mantêm “fora”, “treinara com afinco” e formulação formal sobre o paradeiro; candidata melhora apenas “cultivo convencional” para “treino comum”. |

Esses julgamentos não usam coincidência literal com a referência como critério.
Há traduções alternativas aceitáveis; a referência é apoio editorial, não um gabarito
lexical. Não se atribuiu um percentual de vitória com base nesses exemplos.

## Uso e rastreabilidade

| Condição | Entrada | Saída |
|---|---:|---:|
| 23 base | 3.936 | 747 |
| 23 candidata | 4.034 | 690 |
| 24 candidata | 4.462 | 726 |
| 24 base | 4.364 | 714 |
| Total | 16.796 | 2.877 |

Aplicando os valores usados na rodada anterior (US$ 0,75/M entrada e US$ 3,75/M
saída), a estimativa é US$ 0,02338575. Não é conciliação da fatura nem consulta
atualizada de preço. O runner isolado não registra estes gastos em `eventos_ia`:
somá-los separadamente ao avaliar o custo do projeto; não confundir com a tradução
original dos capítulos. Tokens de cache vieram sem contagem informada.

Artefatos privados na VPS:
`/var/lib/dao-tale/eval-registro-yhKxPA/previa.json` e
`/var/lib/dao-tale/eval-registro-yhKxPA/resultado.json`.
Hash do ambiente:
`4de0b2b20681044a0945d834617285c3d841b33fe6566d82f0484898e790ce23`.
Script: `server/scripts/testar-registro-flash.ts`.

Banco aberto somente para leitura e fechado antes das chamadas. Saída exclusiva,
privada, com salvamento parcial após cada resposta; não há repetição automática de
uma execução nem promoção do candidato. O adaptador Gemini mantém suas quedas
de configuração para erros 400; quatro chamadas lógicas não são garantia geral de
quatro tentativas HTTP. Nesta execução houve quatro respostas completas.

## Próximo passo recomendado

Manter o prompt atual. Em um próximo experimento, testar um passe editorial
seletivo sobre a tradução já existente, com exemplos contrastivos de capítulos
distintos dos avaliados. Exigir correção de registro sem mudança de sentido,
continuidade temporal ou pensamentos, além de preservação de trechos bons.
Comparar esforço de revisão e custo total, não apenas contagem de palavras formais.
Este segundo experimento não foi executado e não há novas chamadas programadas.
