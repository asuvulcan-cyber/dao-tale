# Triagem automática — 18/09/2026

## Entrega e decisão

Implementada e testada localmente uma triagem mais específica. Aspas curvas deixam
de disparar revisão literária, falsos alertas de palavras acentuadas foram corrigidos,
e sinais bilíngues conhecidos geram suspeitas contextualizadas. Não houve implantação
na VPS, alteração dos capítulos ou aprovação automática de propostas.

O fluxo triagem → revisão Flash → validação foi exercitado em uma única chamada.
Ele funciona operacionalmente, mas as correções ainda são parciais. Manter revisão
humana; não promover os resultados como publicação automática ou detecção geral.

## Avaliação local antes/depois

Snapshot dos experimentos anteriores: 20 frases, nove com diagnósticos editoriais
conhecidos e onze controles. Preferências de avaliação explícitas e fixas: padrões
do aplicativo com mais-que-perfeito `evitar` e diálogo `aspas`. Não foram inferidas
preferências históricas do texto do Omega. Baseline do código: commit `04c87ee`.

| Medida por frase | Antes | Depois |
|---|---:|---:|
| Trechos problemáticos selecionados | 3/9 | 9/9 |
| Controles sinalizados | 2/11 | 0/11 |
| Trechos problemáticos não selecionados | 6/9 | 0/9 |

**Estes números são de calibração:** as novas regras foram escritas após examinar
os mesmos casos. Não são holdout, prova de generalização ou percentual de problemas
semânticos detectados. Selecionar a frase não significa identificar todos os seus
erros: em 23.36, por exemplo, a nova regra aborda a origem familiar, não a comparação
com deuses/fantasmas. Na baseline, 24.42 foi selecionado só por Gama e 24.47 só por
aspas; dos três acertos de seleção, apenas 24.49 tinha sinal relacionado ao diagnóstico.

Conferência adicional nas vinte redações aprovadas desses mesmos trechos: nenhuma
foi selecionada após os ajustes. Isso também é controle conhecido, não independente.
Antes do último ajuste, “tinha maltratado” ainda produzia um alerta indevido de ritmo.

## Mudanças

- `aspas-nao-retas` permanece no relatório de estilo, mas não dispara revisão
  literária seletiva. Outros problemas na mesma frase continuam sendo selecionados.
- Fronteiras Unicode completas impedem recortes como “opera” em “operação”,
  “considera” em “consideração” e “li” em “lição”. “Câmara”, “terceira” e
  “assustadora” não são tratadas como mais-que-perfeito.
- Capitalização isolada de posto não dispara chamada: pode estar correta segundo
  o Gama. Continua disponível como contexto quando outro sinal exige revisão.
- Passado composto isolado não dispara revisão de ritmo. Isso é coerente com a
  validação temporal ajustada no experimento anterior.
- Oito sinais bilíngues exigem coincidência nas duas línguas: origem de funcionários
  convertida em linhagem nobre; possessão tornada causa da morte; assassinato tornado
  tentativa; frequência intensificada; diferença tornada aberração; registro de medo;
  imagem acrescentada ao impulso; construção defeituosa da ação de chicotear.
- Uma redundância lexical conhecida (“carne em carne viva”) é sinalizada sem acusar
  “em carne viva” ou repetições idiomáticas como “de passo em passo”.

As regras não substituem palavras. Elas pedem conferência contextual, e podem
produzir falsos positivos em outros contextos. O reconhecimento lexical é estreito;
não cobre todas as paráfrases nem as relações entre orações. Não se adicionou uma
lista global de palavras proibidas nem um diagnóstico artificial de todos os erros.

## Teste integrado econômico

Modo `--automatico` do runner `testar-revisao-diagnosticada.ts`: usa apenas o bloco
24.40–49, diagnósticos gerados pelo código e os mesmos seis exemplos de 20–22.
As referências aprovadas e diagnósticos editoriais não são enviados ao modelo.
Os cinco alvos sem sinal recebem instrução explícita de preservação para verificar
obediência; não se confunde esse controle com decisão sem assistência do modelo.

Foram recebidas dez decisões: cinco propostas substantivas, cinco preservações,
nenhum item ausente/duplicado/extra e nenhum bloqueio nas travas. Nenhuma proposta
foi só de aspas. Houve, porém, troca oportunista de aspas junto com conteúdo em 24.47.

Conferência editorial das cinco propostas:

- 24.41: reduz o floreio de “lampejo” para “ponta de temor”.
- 24.42: reduz “aberração” a “estranho”, mas repete o nome por suspeita de Gama;
  mantém “estrato”, “tarefas servis” e o problema temporal. A triagem por ausência de
  identidade continua sujeita a falso positivo quando a referência está implícita.
- 24.44: corrige a intensidade para “com frequência”, mas mantém “espinha ereta”.
- 24.47: retira a causa explícita em “sucumbiu”, mas introduz “acometido” e substitui
  a tentativa por “foram armar um assassinato”, sem assegurar o ato consumado. Não
  considerar o diagnóstico plenamente resolvido só porque o trecho foi alterado.
- 24.49: remove formas simples, mas conserva formalismos. Correção parcial.

Portanto, o gargalo restante não é apenas selecionar a frase: é cobrir todos os
problemas pertinentes e verificar se cada diagnóstico foi efetivamente resolvido.
As travas estruturais não substituem esse julgamento. Não foram feitas novas
chamadas em busca de uma saída melhor.

## Custo, verificações e rastreabilidade

Uma chamada ao `gemini-3.8-flash`, modelo confirmado na resposta: 7.663 tokens de
entrada e 4.494 de saída, incluindo raciocínio contabilizado pelo adaptador.
Estimativa pelas tarifas usadas nos experimentos anteriores: **US$ 0,02259975**.
Não é conciliação de fatura nem consulta atualizada de preços. O gasto experimental
não foi registrado em `eventos_ia`, devendo ser considerado separadamente.

Typecheck do servidor e **877 testes em 79 arquivos** passaram. Incluem regressões
de Unicode/unidades, aspas separadas, capitalização, anterioridade, sinais bilíngues
com controles de ausência de chinês e redações corretas. Esses testes sintéticos
também não são evidência de generalização literária.

Avaliação reproduzível sem API:
`server/scripts/aferir-triagem-diagnosticada.ts SNAPSHOT.json SAIDA.json`.
Snapshot fonte na VPS:
`/var/lib/dao-tale/eval-registro-yhKxPA/revisao-diagnosticada.json`.
Resultados locais desta rodada: `/tmp/dao-tale-triagem-WxsjUM/antes.json` e
`/tmp/dao-tale-triagem-WxsjUM/final.json` (temporários; regeneráveis pelo script).

Resposta integrada privada na VPS:
`/var/lib/dao-tale/eval-registro-yhKxPA/revisao-triagem-automatica-2026-09-18.json`.
Hash do ambiente: `da206439010fa397dc31dadba543b503cc8308775d05142cea958c7a4f80ca1e`.
O código local foi enviado por stdin, empacotado com suas regras, sem substituir o
serviço instalado. Nenhum arquivo de aplicação ou banco de produção foi alterado.
