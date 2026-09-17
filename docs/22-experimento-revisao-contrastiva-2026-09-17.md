# Revisão conservadora com exemplos — 17/09/2026

## Decisão

Não ativar automaticamente. Os exemplos melhoraram algumas redações, mas não
aumentaram a cobertura dos problemas nesta pequena amostra. Ambas as condições
alteraram os mesmos cinco alvos, sendo um deles apenas tipográfico: quatro
intervenções de conteúdo em vinte frases. Isso não é uma taxa de acerto de 20%.

## Método e limites

Foram reutilizadas as traduções **base** dos blocos 23.30–39 e 24.40–49 do
experimento anterior, sem pagar nova tradução. Cada bloco passou pelo revisor
existente com foco `tom-naturalidade`, sem e com seis exemplos contrastivos.
O modelo foi `gemini-3.8-flash`, temperatura 0,3. Ordem alternada entre condições.

Exemplos aprovados: 20.1/2, 21.5/7, 22.1/2. Seleção determinística: dois por
capítulo, categoria naturalidade, entre 80 e 350 caracteres, texto vigente igual
à revisão aprovada. São correções do assistente aprovadas pelo usuário, não seis
reescritas necessariamente digitadas pelo usuário. Os capítulos 23/24 não entram
nos exemplos. As referências aprovadas dos alvos não foram enviadas ao modelo.

Este é um passe conservador que decide o que mudar em cada bloco; **não** é ainda
o pipeline de triagem automática com foco `seletiva` e diagnósticos por alvo.
O teste isola o efeito dos exemplos dentro do passe já existente. Uma geração por
condição em trechos conhecidos não permite conclusão estatística ou generalização.
Contexto anterior/posterior idêntico, vindo da primeira tradução histórica.

## Conferência das propostas

| Alvo | Sem exemplos | Com exemplos | Avaliação |
|---|---|---|---|
| 23.30 | Corrige redundância, mas usa “inerte” | “Muitos”, “sem forças”, “gritaram” | A versão com exemplos se aproxima mais do tom corrente e de 无力. |
| 23.39 | Corrige “deram início aos chicotes” | Também naturaliza o grito do porco | Ganho parcial; “com destreza” e “açoitamento” continuam formais. |
| 24.41 | “Uma ponta de temor” | “Uma ponta de medo” | Com exemplos, escolha lexical mais corrente; mudanças adicionais de preposição/pronome não são necessárias. |
| 24.47 | Só troca aspas | Só troca aspas | Excluído da contagem literária. Não corrige causa da morte nem assassinato consumado transformado em tentativa. |
| 24.49 | Remove “fora/treinara”, usa “treino convencional” | Remove “fora/treinara”, usa “treino normal” | Com exemplos melhora o léxico, mas mantém “com afinco/paradeiro desconhecido”. |

As duas condições preservaram os pensamentos 23.37–38 e os controles simples
23.31, 24.43/45. Não surgiram os problemas de pensamentos do primeiro experimento.
Entretanto, ambas mantiveram 23.35 (“tomou-lhe o peito”), 24.42 (“estrato”,
“tarefas servis”, “aberração”) e 24.44 (“espinha ereta”). Também não corrigiram
a comparação distorcida de deuses/fantasmas em 23.36.

Todos os vinte itens de cada condição passaram pelas travas automáticas. Isso
**não** certifica qualidade editorial ou fidelidade: os exemplos acima mostram
problemas que essas travas não detectam.

## Limitação importante do passe atual

O foco `tom-naturalidade` instrui o modelo a tratar o sentido como já verificado.
Não se pode usar sua omissão de erros semânticos como prova de incapacidade geral
do modelo de revisar fidelidade. A entrada usada aqui é tradução sem revisão
semântica prévia, portanto este passe sozinho não valida o fluxo completo.
O prompt operacional também permite tipografia, explicando a proposta só de aspas.
Antes de novo teste, é necessário definir o contrato de triagem/revisão por alvo
e separar correções tipográficas das literárias. Não basta adicionar exemplos e
promover o passe atual como revisor completo.

## Uso e custo

| Condição | Chamadas concluídas | Entrada | Saída |
|---|---:|---:|---:|
| Sem exemplos | 2 | 11.126 | 8.940 |
| Com exemplos | 2 | 13.764 | 12.541 |
| Total | 4 | 24.890 | 21.481 |

Com os valores usados na rodada anterior (US$ 0,75/M entrada; US$ 3,75/M saída):
US$ 0,0418695 sem exemplos e US$ 0,05735175 com exemplos; total US$ 0,09922125.
São estimativas, não conciliação da fatura. Saída segue a contabilização do adaptador,
incluindo raciocínio quando informado; não corresponde somente às propostas visíveis.
Nesta execução, exemplos custaram aproximadamente 37% a mais que o controle,
sem aumento na quantidade de problemas tratados. Não extrapolar para outros lotes.
Gastos experimentais não foram inseridos em `eventos_ia`; contabilizar separadamente.

Artefato privado: `/var/lib/dao-tale/eval-registro-yhKxPA/revisao-contraste.json`.
Hash do ambiente: `08d206d5394551fa07a6ad61269a7afe08dacce7ce07fe1be91bb968265317c1`.
Runner: `server/scripts/testar-revisao-contrastiva.ts`.
Banco aberto somente para leitura e fechado antes das chamadas. Nenhum texto,
prompt ou lote de produção alterado. Resultados parciais salvos; saída existente
não pode ser sobrescrita por outra execução. Typecheck do servidor e execução
remota concluídos, assim como a verificação de espaços do diff.

Recomendação: manter a revisão humana e o prompt vigente. Próximo experimento,
se autorizado, deve avaliar a triagem com diagnósticos concretos contra o chinês,
sem pressupor fidelidade já verificada e sem contar aspas como edição literária.
Nenhuma chamada adicional foi programada.
