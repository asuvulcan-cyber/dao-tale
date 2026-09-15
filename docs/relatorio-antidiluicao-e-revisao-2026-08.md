# Relatório — antidiuluição dos prompts e revisão do texto final

Data: 2026-08-18. Corpus: *死人经 / O Sutra dos Mortos*, capítulos 0–17, 1.332 frases.

## 1. Diagnóstico

O sistema apresenta diluição moderada: não por tamanho isolado, mas porque regras de naturezas diferentes competem no mesmo nível. O Alfa v5.0, a Beta renderizada e o Delta v2.0 repetem naturalidade, repetição, léxico e expressões idiomáticas. As regras concretas continuam funcionando; as abstratas desaparecem no ruído.

Evidência observada:

- `少年 → garotos` caiu de 30% para 3,4% de erro depois de receber regra explícita;
- `杀手 → Assassino` zerou a variante proibida depois da regra;
- o Alfa v3.0 fez a preferência de anterioridade chegar ao modelo e reduziu em 94% o mais-que-perfeito sintético;
- no capítulo 17, já com Alfa v5.0 e Delta v2.0, reapareceram `fora`, `perdera`, `julgara`, `conseguira` e `morara`;
- regras descritivas como “ritmo e repetição” e “escolha lexical” não têm efeito histórico separável da variância normal da geração.

Conclusão: instrução concreta e verificável sobrevive; conselho geral repetido entre camadas dilui prioridade.

## 2. Nova arquitetura

### Alfa v6.0

Fica somente com invariantes universais de tradução zh→pt-BR:

- fidelidade sem invenção, omissão, explicação ou intensificação;
- prosa brasileira em vez de espelhamento sintático;
- resolução funcional de partículas, demonstrativos e expressões cristalizadas;
- coesão, ponto de vista, epítetos e preservação do grau de insulto;
- contrato do Gama e conversão segura de medidas.

O Alfa não decide diálogo, pensamento, anterioridade, onomatopeia, nomes ou capitalização: esses temas continuam pertencendo à Beta.

### Beta compacta

As mesmas chaves continuam existindo, mas a saída enviada ao modelo passa a conter decisão + contraste essencial, sem o manual pedagógico longo. O modo antigo continua disponível para Alfas históricos; o marcador compacto é opt-in do Alfa v6.0, preservando a reconstrução dos prompts usados nos capítulos anteriores.

A Beta compacta também explicita dois achados da auditoria:

- não usar flexão verbal de `tu` no registro jovem-adulto sem configuração específica;
- onomatopeia adaptada deve ficar em itálico.

### Gama

Gama é o glossário e passa a ser a única camada para equivalências individuais. Entradas `identidade` fixam a designação; entradas `lexical` fixam a palavra, permitindo flexão normal. `nota_uso` delimita quando a entrada se aplica. Termos ambíguos continuam chegando ao modelo, mas não alimentam acusação automática de consistência.

As equivalências antes enterradas no Delta passam ao Gama: `少年`, `红木`, `小崽子`, `无耻` e `功夫`. `杀手`, Yin, Yang e Qi já estavam catalogados.

### Delta v2.1

O Delta passa a conter uma única particularidade real da obra: Homem de Sabre, Assassino e Espectro são postos formais da Fortaleza do Peng Dourado e não devem ser trocados por sinônimos genéricos quando designarem o posto.

Saem do Delta:

- conselhos universais de ritmo, redundância e naturalidade — Alfa;
- aspas, capitalização, registro e onomatopeia — Beta;
- equivalências individuais — Gama;
- regras já cobertas pela norma ou pelo Alfa.

### Checklist final

O Alfa v6.0 termina, depois do Delta, com sete verificações curtas. A posição é deliberada: usa recência para recuperar as regras que historicamente decaíram no fim da geração.

1. fidelidade sem omissão, invenção ou intensificação;
2. termos aplicáveis do Gama;
3. diálogo e marcas balanceadas;
4. pensamento e onomatopeia;
5. anterioridade e pilhas de auxiliares;
6. unidades e caracteres chineses;
7. releitura exclusiva do português para decalque, epíteto, eco e tipografia aberta.

## 3. Correções do texto final

Correções objetivas autorizadas para aplicação em produção:

- [0.66] retirar a pilha de três `tinha`;
- [1.0] `período constrangedor` → `fase ingrata` e restaurar `enjeitado` sem redundância;
- [9.18] manter deliberadamente a aspa aberta: o mesmo falante continua em [9.19], que reabre e encerra a fala;
- [14.25] retirar `catamitos((...))`, inadequado ao registro e dependente de nota explicativa;
- [16.11] reparar as aspas de `“designado”`;
- [17.33] restaurar a aspa final perdida na edição humana;
- [17.69] reverter a intensificação `Vai se foder` para uma imprecação equivalente a 去死;
- converter aspas simples externas remanescentes em aspas duplas nos destaques identificados.

Não será alterado [12.63–64]: no banco, pergunta e resposta já estão em frases separadas e ambas têm aspas balanceadas. [0.57], [5.62] e [12.67] também já estavam corrigidos no texto vigente.

As 46 repetições do epíteto nos capítulos 7–9 não serão substituídas mecanicamente. A correção exige reescrita contextual de sujeito e oração; automatizá-la criaria risco maior que o defeito. O Alfa v6.0 previne o padrão em capítulos novos, e os antigos devem receber passe humano dedicado.

### O que ocorreu com o Delta 2.0

O conteúdo não era, em sua maioria, falso ou descartável; estava na camada errada e repetia regras universais. A redistribuição foi:

- **Alfa:** ritmo sem variação gratuita, escolha lexical natural, ordens e imprecações, expressões idiomáticas, precisão sem apagar nuances, insultos com força equivalente e prevenção de ecos;
- **Beta:** convenção de aspas e capitalização; a versão seguinte explicita também falas que atravessam parágrafos;
- **Gama:** `少年`, `红木`, `小崽子`, `无耻`, `功夫`, Yin/Yang/Qi e demais equivalências individuais;
- **Delta:** somente os postos formais Homem de Sabre, Assassino e Espectro, particularidade real da Fortaleza do Peng Dourado.

As regras de artigo em topônimos e epítetos continuam válidas como gramática/contexto, mas não justificam um Delta permanente. A ordem genérica de “reduzir redundância” foi estreitada: aplicada sem teste de nuance, ela pode apagar informação do chinês.

## 4. Verificação e aferição futura

- manter Alfa v6.1 + Delta v2.2 por pelo menos cinco capítulos antes de nova mudança;
- comparar sempre `texto_pt_original_ia`, nunca o texto já revisado;
- registrar glossário disponível no instante da tradução;
- acompanhar violações determinísticas por terço do capítulo, para separar regra ruim de perda de aderência em blocos longos;
- executar A/B no mesmo capítulo para qualquer regra abstrata que se queira reintroduzir;
- nunca editar versões históricas: toda mudança cria Alfa/Delta novos.

O critério de sucesso não é apenas reduzir o prompt. É aumentar a proporção de instruções que podem ser conferidas objetivamente e manter cada decisão numa única camada.

## 5. Aplicação verificada

Aplicado em produção em 2026-08-18/19:

- Alfa 6.1 ativo, preservando o Alfa 6.0 imutável e acrescentando a regra multiparágrafo;
- Delta 2.2 ativo, com o mesmo conteúdo específico da 2.1 e associação imutável ao Alfa 6.1;
- ordem confirmada: Alfa → Beta compacta → Delta → checklist final;
- Gama: 144 → 149 entradas;
- sete intervenções textuais: seis correções e a restauração contextual da convenção multiparágrafo em [9.18];
- backups verificados antes do deploy e antes de cada transação;
- `integrity_check=ok`, 1.332 frases preservadas e serviço ativo após reinício;
- varredura final: zero caracteres chineses e zero aspas asiáticas/tipográficas; aspas validadas em contexto — [9.18] fica legitimamente ímpar porque a fala continua em [9.19], enquanto [17.33] fecha porque [17.34] volta à narração.

## 6. Revisão literária integral — prólogo a capítulo 18

Em 2026-08-19 foi concluída uma nova leitura frase a frase do prólogo e dos capítulos
1–18. O capítulo 18 vigente, já submetido a uma revisão humana mais profunda, foi usado
como linha de base editorial. Para os capítulos 0–17, cada decisão comparou o chinês, a
primeira saída registrada da IA, o texto vigente, o Gama aplicável e o histórico de edição
humana. As mudanças estão em *staging*: não alteram leitura pública, exportação nem o
campo `frases.texto_pt`.

| Capítulo | Frases | Propostas | Palavras/período: vigente → proposto |
|---:|---:|---:|---:|
| Prólogo | 76 | 36 | 14,6 → 14,5 |
| 1 | 58 | 31 | 16,4 → 15,8 |
| 2 | 77 | 33 | 14,5 → 13,7 |
| 3 | 70 | 54 | 17,3 → 13,9 |
| 4 | 60 | 51 | 17,0 → 13,7 |
| 5 | 70 | 61 | 15,9 → 12,7 |
| 6 | 74 | 66 | 18,1 → 13,2 |
| 7 | 76 | 67 | 15,9 → 12,3 |
| 8 | 85 | 81 | 18,5 → 13,2 |
| 9 | 74 | 73 | 15,5 → 12,2 |
| 10 | 66 | 66 | 23,4 → 14,3 |
| 11 | 77 | 75 | 17,6 → 12,7 |
| 12 | 82 | 78 | 17,3 → 12,0 |
| 13 | 81 | 72 | 15,6 → 13,0 |
| 14 | 83 | 74 | 14,7 → 11,8 |
| 15 | 77 | 70 | 13,7 → 11,2 |
| 16 | 73 | 69 | 16,6 → 12,4 |
| 17 | 73 | 60 | 15,1 → 11,2 |
| 18 (linha de base) | 60 | 0 | 15,8 → 15,8 |

Total: **1.116 propostas** em 1.332 frases dos capítulos 0–17. A redução de extensão
média não deve ser interpretada sozinha como melhora: ela resulta principalmente da
remoção de decalques, redundâncias e encadeamentos truncados, mas capítulos com média
próxima de 11–12 palavras por período merecem atenção especial do aprovador para evitar
fragmentação excessiva. Por isso a aplicação é individual e protegida contra conflito.

### Progressão controlada

Todos os capítulos foram traduzidos pela família DeepSeek V4 Flash; portanto, a mudança
mais observável vem das versões das camadas e da intervenção humana, não de troca do
modelo tradutor. O histórico vai de Delta 1.0 sem Alfa no prólogo a Alfa 6.1 + Delta 2.2
no capítulo 18. O volume de edição humana é muito desigual (535 frases marcadas no corpus
0–18), e o QA histórico armazenou apenas oito achados aceitos. Isso impede atribuir a
evolução a uma única versão de prompt e torna o texto original da IA + as edições humanas
o controle mais confiável.

O padrão é claro: regras terminológicas concretas melhoraram de forma sustentável;
instruções abstratas de “naturalidade”, “ritmo” e “evitar repetição” não. O capítulo 18
mostrou que Alfa 6.1/Delta 2.2 reduz erros objetivos, mas ainda não produz sozinho a
qualidade da revisão final. A diferença está no passe literário contextual, que o pipeline
atual não possui: a tradução é feita em blocos, enquanto o QA procura sobretudo glossário,
omissão, pronomes e repetição.

### Classes recorrentes corrigidas no staging

- decalque sintático e ordem chinesa que deixam ações mecânicas;
- léxico formal ou raro onde o original pede palavra corrente;
- anterioridade artificial com mais-que-perfeito sintético;
- relações causais e sujeitos ambíguos perdidos entre frases;
- falas pouco brasileiras, vocativos e pontuação de diálogo;
- inconsistências do Gama, incluindo `白绢`, `内丹`, `内功`, postos e topônimos;
- excesso de explicação, intensidade ou informação não sustentada pelo chinês.

Exemplos curtos e comparáveis podem ser vistos diretamente no editor, nas colunas
**chinês / vigente / revisão literária**, acompanhadas da justificativa e categoria. A
numeração exibida usa `capítulo.frase`, inclusive 9.18 e 17.33.

## 7. Recomendações priorizadas para o pipeline

1. **Adicionar um passe literário próprio, depois da tradução.** Ele deve receber o
   capítulo completo ou janelas sobrepostas, o chinês, a tradução e somente o Gama
   relevante. Sua saída deve ser um diff estruturado por frase, nunca uma reescrita opaca.
2. **Separar detecção e reescrita.** Validadores determinísticos verificam Gama,
   caracteres chineses, aspas, notas, unidades e padrões proibidos; o modelo fica com
   fidelidade semântica, voz, fluxo e naturalidade.
3. **Usar dois julgamentos independentes.** Uma IA revisa; outra compara original e
   proposta contra o chinês e pode rejeitar perda de nuance. Alteração de alto risco não
   avança automaticamente.
4. **Transformar as 1.116 decisões em evals estratificados.** Separar treino/calibração e
   teste congelado por capítulo, fenômeno e versão de prompt; nunca avaliar no mesmo caso
   que originou a regra.
5. **Medir aceitação humana e regressão, não apenas fluência.** Métricas mínimas: precisão
   do Gama contextual, omissão/invenção, taxa de aprovação sem edição, distância da edição
   final, violações por mil frases e distribuição por terço do capítulo.
6. **Manter o refino de Delta conservador.** O refinador deve classificar Alfa/Beta/Gama/
   Delta, agrupar recorrências confirmadas e mostrar contraexemplos/rejeições. Nunca deve
   converter automaticamente uma edição isolada em regra da obra.
7. **Liberar por sombra e promoção.** O novo passe roda sem publicar por pelo menos cinco
   capítulos; só substitui o fluxo atual após superar a linha de base em conjunto de teste
   congelado e em aprovação humana cega.

## 8. Estado de implantação

O lote `Revisão literária integral 0–17 · base capítulo 18` foi carregado na VPS com
1.116 propostas pendentes. Antes da carga foi criado backup verificado; depois dela,
`integrity_check=ok` e o hash de todos os textos vigentes permaneceu idêntico. As notas
editoriais no formato `((...))` agora aparecem no leitor como marcadores discretos com
tooltip acessível, sem poluir a prosa.

## 9. Pipeline literário implementado em modo sombra

Foi criada uma tarefa própria de **revisão literária**, diferente tanto da tradução
quanto do passe de estilo. O endpoint explícito trabalha em blocos de até 12 frases e
recebe:

- chinês, primeira saída da IA e texto vigente de cada alvo;
- até oito frases de cada lado como contexto não editável; o contexto leva apenas
  chinês e vigente, enquanto a comparação com a primeira IA fica restrita aos alvos,
  evitando que versões redundantes do capítulo inteiro diluam a tarefa;
- Omega vigente e apenas o Gama relevante;
- instrução operacional curta e conservadora, colocada no fim do sistema.

O modelo deve devolver uma decisão por frase e usar `null` quando não houver ganho
claro. Nenhuma resposta toca `frases.texto_pt`: somente candidatos que atravessam as
barreiras são gravados como novo lote de staging. As barreiras bloqueiam mudança de
números, perda/invenção de `((notas))`, introdução de chinês, quebra de identidades
inequívocas do Gama, ordem errada e texto vazio; mudança extrema de extensão vira alerta.
Entradas ambíguas do Gama, como `内息`, não são tratadas como equivalência fixa.

Por padrão, o passe exige um segundo provedor/modelo configurado como QA. O adjudicador
recebe chinês, texto vigente e candidato e devolve `melhora`, `equivalente`, `regressao`
ou `incerto`, com riscos concretos. Regressão impede o staging; equivalência e incerteza
seguem como alertas para decisão humana. Usar o mesmo par do revisor é recusado, pois não
ofereceria independência real. É possível desligar a adjudicação apenas de forma explícita
para diagnóstico.

### Evals

Os scripts `exportar-eval-literaria.ts`, `executar-eval-literaria.ts` e
`aferir-eval-literaria.ts` criam, executam e medem um conjunto reproduzível. O artefato
congela não só as referências, mas também Omega, versões Alfa/Delta, temperatura, Gama e
o contexto integral dos capítulos, com hash próprio do ambiente. Assim, uma alteração
posterior no banco não muda silenciosamente a entrada de um modelo. A partição é feita
por capítulo inteiro, não por frase, para não
vazar voz ou contexto de cenas vizinhas. Controles negativos são amostrados em todos os
capítulos e excluem as frases com referência positiva: um modelo que reescreve
indiscriminadamente é penalizado sem confundir uma correção conhecida com caso intacto.

Enquanto as propostas não forem decididas, o artefato leva `provisoria: true` e não pode
promover modelo. O snapshot da primeira revisão permanece como registro histórico. A
segunda revisão, feita do zero sobre a base já aprovada, reteve somente 175 mudanças com
ganho concreto. Seu snapshot provisório contém 232 casos: 175 referências positivas
pendentes e 57 controles negativos distribuídos pelos 19 capítulos; 33 casos ficam no
teste e 199 na calibração. Seu SHA-256 provisório é
`2808c692c6bb099281006f15d798674732e65ea467b51f9649f870a1cc2e3416`.
Depois do aval, o snapshot final deve ser
regenerado somente com propostas `aprovada`, receber hash SHA-256 e permanecer imutável.

Métricas de promoção: cobertura e precisão das propostas, correspondência exata,
distância e ganho relativo à referência, regressões, omissões, taxa de falsos positivos
nos controles e bloqueios determinísticos. As chaves são capítulo+frase, e bloqueios de
outra partição não entram no resultado. Essas métricas não
substituem avaliação humana cega; servem para impedir que uma melhora de fluência esconda
perda de fidelidade.

O revisor e o adjudicador agora tratam o tom local do chinês como variável, não como
rótulo global da obra. Eles avaliam voz, oralidade/formalidade, densidade, ritmo,
distância emocional e intensidade em cada contexto. “Naturalizar” significa retirar
interferência do chinês; não autoriza simplificar, modernizar, formalizar, ornamentar ou
uniformizar. O validador sinaliza — sem bloquear automaticamente — elevação lexical,
aumento suspeito de complexidade e perífrases recorrentes, exigindo evidência no original.

O executor recusa artefatos provisórios por padrão, aceita-os apenas com a opção explícita
de calibração e grava resultados progressivamente para permitir auditoria de falhas e
custos. Um ensaio sem chamadas externas, usando o provedor `mock`, percorreu os 205 casos
de teste em 35 blocos e produziu 205 decisões, sem erro; o aferidor identificou corretamente
145 omissões e nenhum falso positivo, confirmando o caminho completo sem fingir qualidade
do modelo simulado.

## 10. Consolidação do Gama e promoção do tom local

A curadoria integral consolidou as 159 entradas do Gama em 16 categorias semânticas:
101 identidades e 58 itens lexicais. Há 13 entradas explicitamente ambíguas, 25 variantes
ligadas ao mesmo referente e 31 relações estritas de pertencimento ou localização. Todas
as entradas têm espécie e orientação editorial; `principal_id` não é mais usado para
relações apenas associativas, e `termo_pai_id` não representa casamento, rivalidade ou
outras arestas do futuro grafo.

O Alfa 6.3 substitui o perfil global de “webnovel de ritmo rápido” por uma obrigação
operacional: inferir do chinês o tom de cada passagem e preservar voz, formalidade,
densidade, ritmo, distância emocional e intensidade, sem permitir que acessibilidade
uniformize a obra. O Delta 2.4 conserva somente as exceções específicas já confirmadas.
O prompt operacional manda ler o bloco inteiro antes de redigir e fazer uma segunda
passagem silenciosa contra o chinês e depois contra o português. O Gama relevante passa
a distinguir explicitamente variante lexical de pertencimento hierárquico.

Após a aprovação das propostas, o eval final não provisório contém 233 casos: 176
referências positivas e 57 controles negativos; 33 casos estão no teste congelado e 200
na calibração. O SHA-256 do ambiente é
`aa9be1922eea5a56345914effd41b11b2a98a69e6ecaa09c662412736f5497e8`.

Em 22 de agosto de 2026, Alfa 6.3 e Delta 2.4 foram ativados na VPS após backup. A
composição produziu um Ômega de 5.277 caracteres, sem marcadores pendentes nem a antiga
ordem de ritmo global. A auditoria posterior confirmou `integrity_check=ok`, 159 entradas
no Gama e o serviço ativo. O passe literário de capítulo inteiro continua em modo sombra:
ele pode preencher um único lote por blocos consecutivos, mas nenhuma proposta é
publicada sem aprovação humana.
