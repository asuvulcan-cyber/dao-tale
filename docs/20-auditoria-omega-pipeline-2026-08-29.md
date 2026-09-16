# Auditoria do Ômega e do pipeline — 29/08/2026

## Escopo e segurança

Auditoria somente de leitura do banco da VPS e dos capítulos 0–18 de *O Sutra dos
Mortos*. Nenhum texto publicado, prompt ativo, preferência, Gama ou configuração foi
alterado. Artefatos candidatos permanecem locais e inativos.

## Estado controlado

- Tradução histórica dos 19 capítulos: `deepseek-v4-flash`.
- Alfa/Delta usados variam do legado sem Alfa até 6.1/2.2 no capítulo 18.
- Vigente na VPS: Alfa 6.3 + Delta 2.4.
- Revisão configurada: `deepseek-v4-pro`; QA: `gemini-flash-latest`.
- 1.392 frases; todas preservam a primeira saída da IA para comparação.
- 1.230/1.392 (88,36%) diferem hoje da primeira IA.
- Primeira revisão aprovada: 1.116 propostas; segunda revisão: 176 propostas.
- O capítulo 18 recebeu 7 mudanças na segunda revisão e continua sendo a melhor linha
  de base disponível, mas foi originalmente traduzido com Alfa 6.1/Delta 2.2 — ele não
  prova a qualidade do Alfa 6.3.

## Diluição do prompt

O Ômega 6.3/2.4 tem 5.432 caracteres. A distribuição é:

| Parte | Caracteres | Observação |
|---|---:|---|
| cabeçalho | 444 | objetivo e responsabilidade |
| Alfa §1 | 702 | naturalização zh→pt-BR |
| Alfa §2 | 508 | coesão e voz |
| Alfa §3–4 | 634 | Gama e medidas |
| Beta | 1.927 | nove decisões editoriais, incluindo tom local |
| Delta | 360 | uma exceção específica |
| checklist | 857 | sete verificações de recência |

O tamanho bruto não é excessivo para os modelos configurados. O Gama também é filtrado:
em 125 blocos retrospectivos, entram 3–27 verbetes, mediana 15 e percentil 90 de 22.
Portanto, a causa principal da baixa qualidade histórica não é “prompt longo demais”.

Há, porém, **diluição lógica**: o cabeçalho 6.3 ordena `Beta > Delta`, enquanto a
introdução da Seção 6 diz que Delta prevalece sobre as demais camadas. Instruções curtas
mas contraditórias diluem mais que texto necessário e coerente.

## Progressão da qualidade

Com o modelo de tradução controlado (`deepseek-v4-flash`), a intervenção entre primeira
IA e vigente aumentou nos capítulos intermediários. A porcentagem de frases alteradas foi
67,5–77,1% nos capítulos 0–3, 88,3–100% nos capítulos 4–16, 82,2% no 17 e 85% no 18.
A distância textual normalizada foi 0,20–0,37 nos capítulos 0–3, 0,40–0,48 na maior
parte dos capítulos 4–17 e 0,287 no 18.

Esses números medem magnitude de intervenção, não qualidade isolada. Ainda assim,
refutam a hipótese de que a primeira IA estivesse perto do texto aprovado. As categorias
mais frequentes nas revisões foram ritmo (537), naturalidade (340), fidelidade (325),
clareza (257), imagem (211) e diálogo (198). Terminologia/Gama são importantes, mas não
explicam a maior parte do retrabalho.

A segunda revisão ainda alterou 176 frases (12,6% do livro) depois de uma primeira
revisão integral. As mudanças concentram o problema restante: tom local, frases mecânicas,
imagens achatadas, lógica entre orações e escolhas que soavam traduzidas.

## QA e revisão

O QA histórico realizou 36 chamadas e gerou oito apontamentos decididos. Seu contrato
estreito cobre glossário, pronome/gênero, repetição anômala e omissão. Ele não foi criado
para detectar a maioria dos problemas encontrados pela revisão literária e não pode ser
usado como substituto dela.

O pipeline em sombra existente está conceitualmente correto:

1. tradução em blocos com contexto anterior e futuro;
2. validadores determinísticos;
3. revisão literária conservadora contra chinês + primeira IA + vigente;
4. adjudicação por provedor/modelo independente;
5. staging versionado;
6. aprovação humana antes de publicação.

A lacuna de avaliação era dupla:

- o snapshot final estava congelado em Alfa 6.2/Delta 2.3;
- o executor media apenas o revisor, não a tradução inicial de uma IA alternativa.

Foi gerado um snapshot 6.3/2.4 final com 233 casos (176 positivos + 57 controles), 33
casos de teste em capítulos inteiros. O snapshot completo tem SHA-256
`e4d820ebcaa26e5d5ddd1ed15a28ea8c1cdf80110851db5bfcd5662ba1407a49`; seu
ambiente (incluindo temperatura de tradução 0,3) tem SHA-256
`56d148f64462f3bb7b2b22cccd75c4524032779b942766c3341a8cd076a70ac1`.

## Mudanças candidatas, ainda inativas

### Alfa 6.4 candidata

Substitui a hierarquia contraditória por responsabilidades:

> original = sentido e tom; Gama = forma do termo quando aplicável; Beta = convenções
> editoriais; Delta = exceções específicas da obra.

O marcador Delta é versionado. A ressalva nova limita uma exceção Delta ao escopo
declarado e permite que ela prevaleça apenas sobre a convenção Beta correspondente;
original e Gama continuam autoridades em seus domínios. Alfas históricos preservam os
mesmos bytes.

### Benchmark de tradução do zero

O novo executor traduz capítulos inteiros da partição cega sem receber PT vigente ou
referência. Ele usa somente chinês, Ômega, Gama filtrado, contexto futuro e a própria
tradução já produzida como cauda. Aferição compara sua distância ao final aprovado com:

- primeira IA histórica;
- texto vigente antes da segunda revisão;
- referência final.

Uma candidata só pode ser considerada avanço quando supera a primeira IA em conjunto,
não apenas em exemplos escolhidos, e não apresenta ausências ou regressões graves.

## Recomendações priorizadas

### Resultados reais dos modelos no teste cego

Os evals foram executados contra o snapshot congelado, sem alterar textos ou prompts
ativos.

**Revisor DeepSeek `deepseek-v4-pro`, Ômega 6.3/2.4:** 33 casos, 27 positivos e seis
controles. Propôs mudanças em 21 casos, omitiu nove positivos e alterou três dos seis
controles. A cobertura foi 66,67%; a precisão classificatória bruta foi 85,71%, mas houve
15 regressões contra a referência e ganho médio de distância de `-1,7425`. Consumiu
21.749 tokens de entrada, 60.091 de saída e 10.240 de cache em seis chamadas. A elevada
produção interna não se converteu em revisão confiável.

**Tradutor DeepSeek `deepseek-v4-flash`, Ômega 6.3/2.4:** traduziu do zero 158 frases dos
capítulos cegos 7 e 12, avaliadas em 33 casos. Contra a primeira IA histórica, superou
12, empatou três e piorou 18 (`36,36%` de vitórias). A distância normalizada média até o
texto final foi `0,4686`, acima da primeira IA histórica (`0,4381`) e muito acima do texto
vigente anterior à segunda revisão (`0,2043`). Foram necessárias 14 chamadas, incluindo
duas repetições de blocos que inicialmente voltaram sem estrutura válida: 31.642 tokens
de entrada, 194.627 de saída e 32.512 de cache. Não houve frase ausente ao final.

As regressões observadas não são apenas diferenças estilísticas. Incluem `kowtow`,
“temporada fraca”, “Hehei”, “cama aquecida de terra”, aspas indevidas em epíteto,
minúscula em posto formal e sintaxe literal como “tendo levado a melhor com a língua”.
O modelo também repôs construções que a revisão humana já havia removido.

**Gemini:** depois da correção da credencial, o alias `gemini-flash-latest` e o modelo
fixo `gemini-3.5-flash` continuaram apresentando HTTP 503 por alta demanda. O
`gemini-3.6-flash` completou os 33 casos após uma retomada: fez 14 propostas, com
cobertura de `48,15%`, precisão classificatória bruta de `92,86%`, um falso positivo,
nove regressões e 14 omissões. Consumiu 28.397 tokens de entrada e 20.119 de saída em
seis chamadas. É mais conservador e tem menos falsos positivos que o DeepSeek, mas ainda
não é confiável como revisor autônomo.

Depois da remoção do limite, o benchmark de tradução do zero no 3.6 Flash foi retomado e
concluiu os 14 blocos, sem ausências. Nos 33 casos, superou a primeira IA histórica em
12, empatou dois e piorou 19 (`36,36%` de vitórias). Sua distância média ao texto final
foi `0,4741`, pior que a primeira IA histórica (`0,4381`) e que o DeepSeek novo
(`0,4686`). Consumiu 53.759 tokens de entrada e 59.760 de saída. Entre os padrões
observados estão elevação de registro (“nutrindo”, “tais relatos”, “desferiu”),
explicitação ou intensidade não garantida pelo original (“tragicamente”, “bradou”),
capitalização excessiva de postos e soluções que voltam a soar traduzidas. O Gemini é
mais econômico e mais controlado no formato que o DeepSeek, mas o texto inicial não
alcança a linha de base humana.

Há uma ressalva no conjunto de referência: 7.14 e 7.18 ainda usam vírgula depois de
interrogação antes do dicendi, em conflito com a convenção Beta ativa. Esses dois casos
devem ser corrigidos em uma futura versão do snapshot ou excluídos da métrica de
pontuação; não justificam editar silenciosamente o livro e não alteram a conclusão geral.

### Experimento multipasse posterior

Foi implementado um executor em sombra com focos independentes, sem alterar o modo
integral existente:

- `fidelidade`: apenas omissão, invenção, referente, lógica/tempo, intensidade e Gama;
- `tom-naturalidade`: apenas interferência de tradução, registro, voz, ritmo e diálogo.

Aplicados pelo `gemini-3.6-flash` sobre sua própria tradução, os dois passes fizeram
somente duas alterações válidas nos 33 casos. A distância ao final caiu marginalmente de
`0,4741` para `0,4736`; foram 12 vitórias, três empates e 18 derrotas contra a primeira IA
histórica. A especialização conteve paráfrases, mas tornou o revisor quase inerte.

Também foi testada a composição `gemini-3.6-flash` (tradução) →
`gemini-3.1-pro-preview` (revisão integral). O Pro alterou 14 casos e reduziu a distância
para `0,4585`, com 13 vitórias, cinco empates e 15 derrotas. Corrigiu escolhas como
“nutrindo” e recuperou termos/contexto, mas preservou ou introduziu problemas como
“tragicamente”, capitalização genérica de postos e perda de ação concreta. É a melhor
composição automática testada, mas ainda fica abaixo da primeira IA histórica (`0,4381`)
e não deve alimentar publicação automática.

O resultado muda o próximo passo técnico: novos passes genéricos não bastam. O revisor
precisa receber uma memória contrastiva pequena e recuperada das edições humanas
aprovadas — problema, formulação rejeitada, solução aprovada e razão — selecionada por
categoria e semelhança com o trecho. Essa memória deve ficar fora do Alfa/Beta/Delta/Gama
e entrar apenas no passe correspondente, para não recriar diluição global.

### Eval da memória contrastiva com DeepSeek

A memória foi implementada fora do Ômega e congelada apenas com capítulos de calibração.
Os capítulos cegos 7 e 12 foram excluídos por inteiro. Cada bloco recebeu no máximo
quatro exemplos; o limite padrão do executor continua zero, portanto o recurso permanece
inativo fora de eval explícito.

No A/B sobre a mesma tradução `deepseek-v4-flash`, o passe `deepseek-v4-pro` produziu:

| Condição | Distância ao final | Supera/empata/piora a IA histórica |
|---|---:|---:|
| Flash sem revisão | 0,4686 | 12 / 3 / 18 |
| Pro sem memória | 0,4753 | 12 / 3 / 18 |
| Pro + memória v1 (4 exemplos) | 0,4647 | 13 / 3 / 17 |
| Pro + memória v2 consolidada | 0,4694 | 12 / 3 / 18 |

A v1 ajudou em decisões já aprovadas — capitalização contextual de “assassino”, ação
concreta no lugar de `kowtow`, “Hehe” e “repetir o juramento” — mas também induziu aspas
em epíteto e soluções pouco naturais. A v2 removeu exemplos duplicados e consolidou cada
cadeia humana em “primeira versão rejeitada → versão final aprovada”; apesar de ser mais
coerente, piorou a métrica. Semelhança de categoria, vocabulário e Gama não basta para
recuperar o exemplo certo de tom local.

Decisão: **não ativar a memória contrastiva atual**. O resultado confirma ganho causal
pequeno na v1, mas não robusto. A próxima tentativa deve recuperar exemplos por função
narrativa e fenômeno diagnosticado, não por proximidade lexical genérica, e precisa ser
avaliada também por leitura cega humana, porque distância textual não é qualidade.

### Detector e roteamento seletivo

Foi implementada uma triagem determinística que combina, sem reescrever texto:

- preferências editoriais e tipografia;
- catálogo bilíngue de interferências zh→pt;
- consistência reversa do Gama;
- sinais de literalidade, registro elevado, perífrases, complexidade e capitalização
  contextual de postos.

Na primeira calibração sobre a tradução cega do DeepSeek, o detector encaminhou 60 de
158 frases, redução potencial de `62,03%` frente à revisão integral. Dentro dos 33 casos
históricos de teste, selecionou 15: cobertura histórica de `48,15%`, precisão
classificatória de `86,67%` e dois controles selecionados. Esses dois não são
necessariamente falsos positivos reais:
o rótulo descreve se o texto histórico precisou de segunda revisão, enquanto o detector
examina uma tradução nova, que pode conter defeito diferente. Por isso essas métricas são
auxiliares; o gate correto é a qualidade da tradução depois da revisão seletiva.

Aferido o passe `deepseek-v4-pro` nesses 15 alvos, a primeira versão alterou 11 textos e
melhorou a comparação contra a primeira IA histórica de `12/3/18` para `14/4/15`
(supera/empata/piora); a distância ao final caiu de `0,4686` para `0,4629`. A leitura,
porém, encontrou regressões que a distância não representa bem: `ouvira` virou `tinha
ouvido`, uma ação concreta virou `um atrás do outro` e o caso de `kowtow` voltou a
“diante dele”, contrariando decisão humana explícita.

Um prompt mais cirúrgico reduziu as alterações para oito, mas ainda capitalizou
“Assassino” em usos genéricos e apenas deslocou `tinha decidido` dentro da frase. Por
isso o detector deixou de encaminhar complexidade isolada: frase longa é sinal de
inspeção, não defeito. A versão conservadora roteia 37 de 158 frases (`76,58%` de
redução potencial); nos 33 casos, seleciona dez, com precisão classificatória de `90%`,
um controle selecionado e cobertura histórica de `33,33%`.

Também foram acrescentadas barreiras determinísticas exclusivas do passe seletivo:

- não introduzir `tinha/havia + particípio`;
- não mudar a capitalização de postos sem diagnóstico contextual;
- não elevar o léxico com marcador formal novo;
- não aceitar proposta que apenas desloque e preserve a locução diagnosticada.

Na rodada conservadora, oito propostas sobreviveram antes das duas últimas barreiras.
Ela ficou em `12/3/18` e distância `0,4649`: melhora textual pequena em relação ao Flash,
mas sem avanço classificatório robusto. A conclusão é que o detector tem valor como
triagem e redução de custo; o DeepSeek Pro não demonstrou qualidade para adjudicar ou
publicar suas próprias propostas. O modo seletivo deve permanecer em sombra.

A rota de sombra agora aceita modo seletivo. Janela limpa não chama IA nem cria lote;
janela acusada envia apenas frases diagnosticadas, apresenta os sinais ao revisor como
hipóteses e grava somente propostas pendentes. Nenhuma aplicação é automática. A suíte
completa do servidor passou: 78 arquivos e 851 testes. O falso negativo inicial da
credencial foi de invocação: as chaves estão no keyring do usuário `daotale`; ao executar
no contexto correto, o eval DeepSeek concluiu sem erro. Nenhuma rodada seletiva alterou
banco ou texto publicado, e o serviço ainda não foi reiniciado para ativar esse código.

### Decisão

Alfa 6.4 permanece candidata e **não deve ser ativada agora**. Ela corrige uma contradição
real de responsabilidades, mas uma comparação cara 6.3 × 6.4 com o mesmo DeepSeek não
isolaria adequadamente o efeito do prompt: o modelo falhou em regras explícitas, formato,
naturalidade e julgamento local. O Gemini 3.6 confirmou que o déficit não é exclusivo
do DeepSeek: ambos pioraram mais casos do que melhoraram sob o mesmo Ômega. A Alfa 6.4
não deve ser testada como se uma correção de hierarquia, sozinha, pudesse compensar a
falta de julgamento local dos modelos.

1. Corrigir e versionar os dois casos inconsistentes do snapshot, preservando o arquivo
   congelado atual como evidência histórica.
2. Transformar as decisões humanas recorrentes em passes e gates separados: fidelidade
   local, tom/registro, naturalidade, convenções editoriais e Gama, cada um com contrato
   curto e exemplos contrastivos.
3. Não ativar Alfa 6.4 apenas por parecer mais coerente: exigir ausência de regressão no
   teste e leitura humana cega de uma amostra.
4. No capítulo 19, manter tradução e passe literário em colunas separadas. Publicação
   continua dependendo de aprovação até cinco capítulos consecutivos sem regressão.
5. Manter o refinador de Delta conservador. Alfa recebe universais; Beta recebe escolhas;
   Gama recebe equivalências; Delta recebe somente exceções recorrentes da obra.
6. Promover o pipeline apenas com métricas registradas por modelo, versão de prompt,
   capítulo e custo. Fluência percebida sem fidelidade ao chinês não conta como ganho.

## Validação prospectiva: capítulo 19

O capítulo 19 foi a primeira amostra nova depois da reorganização do Ômega. Foi traduzido
integralmente pelo `deepseek-v4-flash`, Alfa 6.3, Delta 2.4, temperatura 0,3 e blocos de
20 frases. Tinha 70 frases e 2.177 palavras; no momento da auditoria, não havia QA,
edição humana nem diferença entre a primeira saída e o texto vigente.

O resultado não alcançou a linha de base do capítulo 18 revisado. Houve melhora no erro
mais fácil de contar — o mais-que-perfeito simples caiu para duas ocorrências reais —,
mas a saída introduziu seis locuções `tinha/havia + particípio` e elevou o registro sem
apoio local. Entre os marcadores estão “insuflou-lhe”, “pretensões indevidas”, “altivez”,
“ermos”, “paragens”, “candura”, “vazão” e “impotência”. Também apareceram construções
traduzidas como “vida com pouca garantia”, “bastasse passar”, “tom afirmativo”,
“tomou a iniciativa de se aproximar”, “não era, porém, pequena a tarefa” e “perfeito
ignorante”. A instrução de tom local estava no Ômega recebido; acrescentá-la outra vez
ao Alfa apenas aumentaria a diluição.

As quatro chamadas consumiram 15.721 tokens de entrada e 131.629 de saída. A última
registrou 44.219 tokens de saída, sinal de raciocínio muito caro sem conversão equivalente
em qualidade de prosa. A configuração da instância foi reduzida de 20 para 10 frases por
bloco; o padrão de novas instalações também passou a 10, com aviso explícito na tela de
que aumentar o bloco troca aderência por menos chamadas.

A revisão humana integral contra o chinês gerou o lote de staging 3, com 58 propostas e
12 frases preservadas. A composição revisada passou com zero violações determinísticas
de estilo e zero inconsistências checáveis do Gama. Um alerta de extensão em 19.68 é
intencional: o dicendi de 19.69 foi unido à fala anterior para não abrir novo parágrafo
com “Qi Nu disse”. Nenhuma proposta foi aplicada ao texto vigente.

Os formalismos e decalques confirmados foram adicionados ao detector seletivo, não ao
prompt. Assim eles geram inspeção contextual sem substituição mecânica. O resultado
prospectivo confirma a política de promoção: o pipeline novo reduz erros objetivos e
custo de revisão, mas o modelo ainda não sustenta sozinho o julgamento literário local.

## Retomada e consolidação — 15/09/2026

Consulta somente de leitura à VPS confirmou o capítulo 19 finalizado. As 58 propostas
do lote 3 foram aprovadas pelo usuário e coincidem integralmente com o texto vigente;
as outras 12 frases permanecem iguais à primeira tradução. Nenhuma frase está vazia e
as 70 primeiras saídas da IA continuam preservadas. A última aprovação ocorreu em
15/09/2026 às 15:40:13 UTC (12:40:13 em São Paulo). O lote ainda tem status administrativo
`aberto`, embora não tenha propostas pendentes.

A instância mantém Alfa 6.3, Delta 2.4 e tradução `deepseek-v4-flash`, com temperatura
0,3. O serviço está ativo desde 05/09/2026; seu carimbo ainda informa
`aeccfa1-sujo`, de 25/08. A comparação por conteúdo encontrou diferenças entre o código
local e a VPS, portanto esse carimbo não identifica uma versão reproduzível do código
atual. Nenhum deploy foi realizado nesta consolidação.

Validação local: lint, formatação configurada, tipos, 852 testes do servidor, 68 testes
da interface e build passaram. Foi necessário recompilar `better-sqlite3` para o Node
local antes de executar os testes; a primeira tentativa falhou por incompatibilidade
do módulo nativo, sem exigir alteração no código.

Próxima rodada acordada: capítulo 20, preservando Alfa 6.3/Delta 2.4, blocos de dez
frases e aprovação humana das propostas literárias. Comparar volume de intervenção,
erros recorrentes e consumo com o capítulo 19. Na consulta desta retomada, o capítulo
20 ainda não estava importado; a tradução depende do fornecimento do original chinês.

## Capítulo 20 — Gemini e revisão pendente, 15/09/2026

Após a retomada, o usuário importou e traduziu o capítulo 20, “Faca Pontuda”, com
`gemini-3.8-flash`, por falta de saldo no DeepSeek. Foram traduzidas as 61 frases, com
Alfa 6.3 e Delta 2.4, sem erros de execução. A telemetria registra sete chamadas,
30.271 tokens de entrada e 5.134 de saída. O custo estimado está nulo; esses dados não
demonstram desconto de créditos promocionais na conta Google.

A primeira saída apresentou 14 alertas determinísticos de estilo e um de Gama. A
leitura contra o chinês encontrou também desvios semânticos: destinatário inventado
para o sinal “irmão” (20.18), “vocês” no lugar de “você” (20.33), “mundo esquecido” em
vez de esquecimento (20.44) e comparação entre perdas transformada em comparação com
posses (20.45). A medida da lâmina inicial também exigiu correção: quatro cun,
aproximadamente treze centímetros, antes da extensão descrita em 20.17.

Com autorização do usuário, o assistente preparou o lote 4, “Revisão integral do
capítulo 20 · Gemini 3.8 Flash”: 44 propostas pendentes e 17 frases preservadas. As
propostas ainda dependem da leitura e aprovação do usuário. Não houve chamadas
adicionais aos provedores de IA para gerar esse lote.

A composição revisada passou sem violações determinísticas de estilo, inconsistências
checáveis de Gama ou alertas das travas literárias. Isso valida as convenções
checáveis, não substitui a aprovação editorial. O script específico
`server/scripts/registrar-revisao-capitulo20.ts` valida por padrão, exige banco explícito
e só insere propostas quando executado com `--staging`; verifica a base novamente na
transação e recusa sobrescrever um lote divergente.

Foi verificado um backup prévio em
`/var/lib/dao-tale/backups/pre-revisao-cap20-2026-09-15T16-32-45-619Z.db`.
O hash SHA-256 das linhas completas das 61 frases da base é
`f2cd622842beabee74d4d68666f63c90bdefcb278139cdbd63fa6a4bc89faef3`.
O texto vigente e a primeira tradução permanecem preservados para aprovação e futura
comparação. O volume de propostas (44/61) ainda não equivale a intervenções aprovadas;
não é uma comparação controlada de qualidade com o DeepSeek no capítulo 19.

## Capítulo 21 — revisão pendente, 16/09/2026

“Debaixo da Cama” foi traduzido pelo usuário com `gemini-3.8-flash`, mantendo o prompt
15 (Delta 2.4 associado ao Alfa 6.3). As 83 frases foram traduzidas em nove chamadas:
36.403 tokens de entrada e 5.893 de saída. O Dao Tale agora registra custo estimado de
US$ 0,049401; o valor não representa uma confirmação de cobrança líquida pelo Google.

A revisão editorial do assistente gerou o lote 5, com 50 propostas pendentes e 33 frases
preservadas. Entre os ajustes estão a identidade dos irmãos (21.9), o objeto que o
protagonista consegue localizar pelo tato (21.52), a respiração reduzida em vez de
interrompida (21.53), a faquinha que virou adaga (21.38/81) e o colchão acrescentado em
21.74. O texto revisado mantém a percepção limitada do protagonista e não amplia os
detalhes da cena.

A composição passou pelas travas literárias sem alertas e pela consistência checável
do Gama sem violações. Restaram três falsos positivos de estilo confirmados pela
leitura: `opera` dentro de “operação” (21.11), `terceira` (21.15) e `uma li` dentro de
“uma lição” (21.49). O script registra explicitamente essas exceções locais; não foram
reescritos trechos corretos para satisfazer o detector. O defeito do detector permanece
pendente de correção no código do aplicativo.

Antes da gravação, foi verificado o backup
`/var/lib/dao-tale/backups/pre-revisao-cap21-2026-09-16T05-19-59-419Z.db`.
A base das frases tem SHA-256
`b54fee1b5413aec709e6beb3383400e7f3b2c303ae55223177aaf7c5ab48cb93`.
As propostas foram gravadas pelo script `server/scripts/registrar-revisao-capitulo21.ts`,
com validação prévia e rechecagem da base dentro da transação. Não houve chamadas
adicionais à API. A aprovação do usuário continua pendente.
