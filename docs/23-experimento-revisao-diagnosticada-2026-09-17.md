# Revisão com diagnósticos concretos — 17/09/2026

## Resultado e decisão

O Flash respondeu aos nove alvos diagnosticados, preservou literalmente os onze
controles e não produziu edição isolada de aspas. Sete propostas passaram nas
travas; duas foram bloqueadas. Há melhora de cobertura em relação ao passe anterior,
mas isso não significa nove correções plenamente resolvidas ou um revisor autônomo.
Não promover o experimento nem aplicar suas propostas aos capítulos.

## Método

Mesmo chinês, traduções base, contexto, Alfa 6.3/Delta 2.4, Gama e seis exemplos
do experimento contrastivo anterior. Dois blocos de dez frases (23.30–39 e
24.40–49), uma chamada por bloco, Gemini 3.8 Flash confirmado pelas respostas,
temperatura 0,3. Sem novas traduções nem consultas/escritas no banco.

Mudança: foco `seletiva`, com diagnósticos editoriais escritos pelo assistente
contra o chinês. Não foram enviadas as referências aprovadas ou frases substitutas.
Alvos: 23.30/35/36/39 e 24.41/42/44/47/49. Os demais receberam instrução explícita
de controle sem problema diagnosticado. Portanto, a preservação dos controles mede
obediência a essa instrução, **não** capacidade de decidir autonomamente o que está bom.

Os diagnósticos separam sentido (causalidade, referente, intensidade, comparação,
tempo) de registro/naturalidade. Tipografia não é motivo independente de intervenção.
O runner identifica mudanças exclusivamente de aspas, ordens ausentes/duplicadas,
ordens extras e alterações de controles, além das travas literárias existentes.

Há duas mudanças conjuntas em relação ao teste anterior: contrato do passe e
diagnósticos concretos. Não é possível atribuir os ganhos somente aos diagnósticos.
Também não é uma avaliação de detector automático: a triagem já foi feita pelo
assistente em textos conhecidos. O custo desse trabalho editorial não desaparece.

## Conferência editorial

| Trecho | Resultado observado |
|---|---|
| 23.30 | Reduz “uma infinidade” a “muitos”, recupera pele rasgada/carne exposta e remove a repetição; “sem mais feição humana” ainda pode soar pouco corrente. |
| 23.35 | Remove a imagem acrescentada “tomou-lhe o peito”, mantendo pernas trêmulas e impulso de fuga. |
| 23.36 | Remove nobreza obrigatória e passa a formular uma comparação; “linhagem de funcionários” pode esclarecer melhor que são funcionários do governo. |
| 23.39 | “Começaram a chicoteá-los” corrige a construção defeituosa, reduz ornamentação e conserva o porco no abate. |
| 24.41 | Reduz o floreio a “leve temor”; aceitável, embora “medo” seja mais corrente. Preserva o restante. |
| 24.42 | Corrige a anterioridade e reduz “aberração”, mas “trabalho humilde” suaviza 最低贱 (trabalho mais desprezado/baixo). Proposta bloqueada por passado composto. |
| 24.44 | Modera “a todo instante” para “com frequência”, sem inventar compulsão; “de coluna reta” ainda pede julgamento editorial. |
| 24.47 | Remove a causalidade expressa por “sucumbiu” e corrige tentativa para assassinato realizado; “morreu sob possessão” continua menos claro que explicitar que estava possuído quando morreu. Proposta bloqueada por passado composto. |
| 24.49 | Reduz o registro, mas “em que mais treinou duro” fica pouco natural. Não considerar resolvida só porque alterou os termos apontados. |

Nos pensamentos 23.37/38, itálico e primeira pessoa permaneceram intactos.
As aspas curvas de 24.47 foram preservadas; a proposta é substantiva, não tipográfica.
Não houve itens ausentes, duplicados ou extras nesta execução.

## Trava temporal: limitação identificada

`validarPropostaLiteraria` bloqueia qualquer aumento da contagem de
`tinha/havia + particípio` quando o alvo possui diagnóstico. Isso bloqueou 24.42
(“não tinha intimidado”) e 24.47 (“tinham tentado”). A regra mede a forma, não
determina se a anterioridade é necessária ou se houve substituição mecânica.
Esses bloqueios precisam de julgamento temporal; não autorizam reescrever tudo no
pretérito simples nem aceitar integralmente as propostas. Não foi feita exceção,
remoção da trava ou alteração de produção durante este experimento.

## Uso, artefatos e verificações

| Bloco | Entrada | Saída |
|---|---:|---:|
| 23 | 7.250 | 4.080 |
| 24 | 7.676 | 5.208 |
| Total | 14.926 | 9.288 |

Estimativa usando as tarifas da rodada anterior (US$ 0,75/M entrada e US$ 3,75/M
saída): **US$ 0,0460245**. Não é conciliação da fatura ou verificação atual de preço.
Saída inclui raciocínio contabilizado pelo adaptador. Estes gastos isolados não
foram gravados em `eventos_ia` e precisam ser considerados separadamente.

Artefato privado: `/var/lib/dao-tale/eval-registro-yhKxPA/revisao-diagnosticada.json`.
Hash do ambiente: `89ef6d7d1d1ca6a84616c0f083bd42281a114c915d6a3be6ecad9a2c736a3717`.
Runner: `server/scripts/testar-revisao-diagnosticada.ts`.

O runner usa somente o snapshot anterior, recusa hash incompatível e saída existente,
guarda resultados parciais e não possui acesso ao banco. Execução remota completa,
`git diff --check` e typecheck do servidor concluídos. O tsconfig do servidor inclui
somente `src`; o typecheck não deve ser confundido com cobertura estática dos scripts.

## Encaminhamento

Há evidência prática para investigar **triagem específica + correção localizada**,
não para publicar automaticamente. Antes de ampliar chamadas pagas, definir testes
de regressão para a trava temporal e a separação de tipografia/conteúdo. Um futuro
teste de triagem automática deve usar outros trechos e medir problemas encontrados,
falsos alarmes e correções efetivamente resolvidas separadamente. Nenhuma nova
chamada ou mudança de configuração está programada.
