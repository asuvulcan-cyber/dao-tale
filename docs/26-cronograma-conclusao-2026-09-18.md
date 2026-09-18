# Cronograma de conclusão do Dao Tale

Planejamento de referência: **18/09/2026**.
Horizonte proposto: **seis semanas, até 30/10/2026**, com janela de contingência até
06/11 se houver regressões ou demora na validação editorial. São estimativas de
planejamento, não promessa de data, execução em segundo plano ou garantia de qualidade.
Cada marco depende de seu critério de aceite, não apenas de chegar a data.

## 1. O que significa estar pronto

Entregar uma versão estável para o uso atual: um usuário, tradução literária
chinês → PT-BR, Gemini Flash como opção econômica principal, revisão assistida,
glossário, editor, exportação e operação na VPS. O usuário consegue concluir o
fluxo sem scripts avulsos ou intervenções no banco.

“100%” significa cumprir **todos os requisitos de entrega definidos neste documento**,
não tradução infalível, ausência futura de bugs ou publicação sem leitura humana.
Uma proposta passar pelas travas não a torna editorialmente aprovada. Se um modelo
não atingir a qualidade desejada, a versão pode ser estável como ferramenta assistida,
mas esse limite deve aparecer no relatório de aceite, sem chamar autonomia de concluída.

Fora deste fechamento: trocar para Pro, treinar modelo, criar um CAT genérico,
adicionar idiomas, contas de terceiros, billing SaaS, aplicativo desktop empacotado,
memória entre obras, TMX e grafo narrativo temporal. São expansões separadas do doc 19,
não condições ocultas para terminar o produto atual. Exportação e leitura pública
que já existam entram na regressão, sem publicação de novos textos como parte do teste.

## 2. Ponto de partida comprovado

- O roadmap histórico documenta as fases básicas como implementadas, exceto desktop
  deliberadamente adiado. Isso não dispensa a auditoria de funcionamento atual.
- Capítulos 20–24 formam a primeira amostra revisada de Flash. Aprovação de propostas
  não deve ser confundida com status administrativo de capítulo; os estados atuais
  serão consultados antes de qualquer mudança.
- A triagem local selecionou 9/9 trechos problemáticos e 0/11 controles na amostra de
  calibração. As regras foram ajustadas nesses mesmos trechos: não é generalização.
- O teste automático ainda produziu correções parciais. As verificações novas apontam
  alguns sinais persistentes e impedem mudanças tipográficas fora do diagnóstico.
- Última verificação registrada: **890 testes do servidor**, typecheck e diff-check.
  Não é evidência de que frontend, build e VPS foram revalidados nesta rodada.
- Melhorias recentes estão no repositório local; não foram implantadas na VPS.
- Custos experimentais recentes foram registrados em relatórios, fora de `eventos_ia`.
  Há uma lacuna de rastreabilidade entre experimento e painel normal.

## 3. Agenda e dependências

| Marco | Janela proposta | Entrega verificável | Dependência |
|---|---|---|---|
| M0 — Inventário e base estável | 18–20/09 | Lista única de pendências, diferenças local/VPS e baseline reproduzível | Nenhuma |
| M1 — Avaliação e orçamento | 21–24/09 | Conjuntos separados, métricas e limites de experimentos | M0 |
| M2 — Triagem e validação | 25–29/09 | Sinais contextualizados, diagnóstico rastreável e testes de regressão | M1 |
| M3 — Fluxo integrado na interface | 30/09–04/10 | Revisão assistida utilizável sem scripts e gasto visível | M1; estabilização de M2 |
| M4 — Teste editorial independente | 05–09/10 | Resultado em capítulos não usados para ajustar regras | M2 + M3 |
| M5 — Robustez e segurança | 10–13/10 | Testes completos, falhas recuperáveis e restauração ensaiada | M3; fixes de M4 |
| M6 — Implantação controlada | 14–16/10 | Versão identificável na VPS, backup e rollback verificados | M4 + M5 aprovados |
| M7 — Piloto de uso real | 17–23/10 | 2–3 capítulos reais concluídos, custo e esforço registrados | M6 |
| M8 — Fechamento e documentação | 24–30/10 | Correções finais, checklist assinado e versão estável | M7 |

As janelas são dias corridos, incluindo margem e interação com o usuário; não são
estimativas de horas contínuas de processamento. Trabalho de testes, documentação
e interface pode se sobrepor quando não depender de código instável. Não há obrigação
de consumir a janela inteira se o marco terminar antes. Refazer planejamento após M0
se a diferença entre local e VPS for materialmente maior do que a esperada.

## 4. Entregas detalhadas por marco

### M0 — Inventário e base estável

- Conferir versões local/VPS, branch, dependências, migrações e mudanças não implantadas,
  inicialmente por leitura. Não substituir a instalação inteira sem entender o delta.
- Mapear o fluxo real: importar → segmentar → traduzir → revisar → aprovar → finalizar
  → exportar/ler, incluindo cancelamento, retomada e conflitos de edição.
- Executar verificações atuais de servidor e frontend, lint, formatação, tipos e build.
- Criar uma lista única classificada: bloqueador de dados/segurança; bloqueador de uso;
  defeito editorial; melhoria opcional. Distinguir implementado de validado.
- Congelar baseline e registrar backup/estratégia de restauração antes das próximas
  operações que modifiquem a instância real.

**Aceite:** sabemos qual versão está em cada ambiente, há reprodução local, nenhum
segredo é exposto e todas as pendências têm prioridade e critério de fechamento.
**API:** zero. **Resultado de saída:** checklist operacional, não uma nova rodada literária.

### M1 — Avaliação honesta e orçamento operacional

- Separar capítulos de desenvolvimento e avaliação; exemplos contrastivos não podem
  vir de capítulos reservados à avaliação. Os capítulos 20–24 são desenvolvimento.
- Preparar aproximadamente 60–100 frases de 2–3 capítulos não usados nas regras,
  contemplando narração, diálogo, pensamentos, ação e termos recorrentes. Ajustar o
  tamanho ao material disponível; dados já conhecidos não viram holdout por renomeação.
- Rotular sentido, referente, tempo, registro, naturalidade, tipografia e preferência
  editorial, com gravidade e localização. Manter controles bons e casos ambíguos.
- Congelar fonte, tradução, contexto, referências, Gama, prompt, modelo e parâmetros.
- Medir separadamente: frase selecionada; problema diagnosticado; proposta útil;
  problema resolvido; novo erro; tempo de revisão do usuário; custo por etapa.
- Planejar limite por execução, máximo de chamadas/tokens, interrupção e registro
  de uso. Cobrir experimentos sem misturá-los silenciosamente ao custo de tradução.

**Aceite:** dataset versionado sem vazamento conhecido, métricas definidas antes do
teste e orçamento rastreável. Uma referência aprovada é evidência editorial, não
gabarito obrigatório de palavras. **API:** zero para preparação; tradução nova só
se o material reservado realmente precisar dela e dentro do orçamento da rodada.

### M2 — Triagem e validação contextualizadas

- Rever a aplicação contextual do Gama: nome explicitamente repetido versus referência
  pronominal; termo lexical versus identidade; palavras maiores contendo termos menores.
- Manter tipografia fora da contagem de correções literárias e dos gatilhos pagos isolados.
- Verificar que contexto intermediário não desaparece ao selecionar alvos espaçados;
  não basta fornecer apenas texto anterior ao primeiro e posterior ao último alvo.
- Dar identificadores estáveis aos sinais e preservar sua origem na proposta e na
  rechecagem; não depender indefinidamente de interpretação de justificativa livre.
- Conferir resultado da ação, causalidade, intensidade e anterioridade nos casos em
  que exista evidência suficiente. Onde não houver, sinalizar incerteza, não inventar certeza.
- Acrescentar regressões com casos positivos, controles corretos e contraexemplos;
  não criar regra global só para forçar coincidência com uma frase aprovada.
- Verificar consistência entre exemplos, triagem, contrato do passe e validação.

**Aceite:** testes passam; nenhuma regra torna suspeita em correção automática;
contexto e diagnósticos chegam intactos ao revisor. **API:** preferencialmente zero,
reutilizando respostas salvas. Alterações de instrução só exigem chamada quando houver
uma hipótese nova verificável que não possa ser coberta por teste local.

### M3 — Integração no aplicativo e controle financeiro

- Auditar e completar a interface existente, sem reescrever telas que já funcionem.
- Mostrar por que um trecho foi selecionado, categoria, antes/depois, avisos, bloqueios
  e o que continua sem verificação. Separar “sem sinal”, “sem mudança”, “pendente” e “aprovado”.
- Aprovar, editar ou rejeitar por ação explícita; preservar primeira IA e histórico;
  detectar conflito se o texto mudar entre geração e aplicação.
- Validar uso de memória contrastiva aprovado/rejeitado, separado por obra e contexto,
  sem aplicar automaticamente preferências extraídas de uma única correção.
- Integrar execução limitada e retomável: não pagar novamente resultados já persistidos;
  distinguir erro técnico de rejeição editorial; evitar loops automáticos de melhoria.
- Mostrar tradução, revisão e experimentos separadamente; exibir custo desconhecido
  como desconhecido. Reconciliar tokens e preços configurados sem confundir estimativa,
  moeda de cobrança e créditos promocionais.
- Implementar ou completar limites de execução antes de aumentar a quantidade de chamadas.

**Aceite:** fluxo completo com mock pela interface, sem editar banco nem rodar scripts
manuais. Decisões persistem após recarregar; limites e cancelamento têm testes.
**API:** zero para desenvolvimento e testes de integração simulados.

### M4 — Avaliação independente e decisão sobre o pipeline

- Executar uma rodada pequena e pareada no material reservado: tradução base versus
  tradução com revisão seletiva. Manter modelo e parâmetros comparáveis e registrar diferenças.
- Conferir primeiro uma amostra reduzida; interromper expansão diante de regressão grave.
- Apresentar comparações sem revelar condição quando viável, sem exigir coincidência
  literal com a referência. O usuário valida voz, naturalidade e esforço de revisão.
- Avaliar propostas aceitas, corrigidas, rejeitadas, omissões e alterações irrelevantes;
  separar o custo humano do gasto de API.
- Se falhar, diagnosticar antes de repetir: no máximo uma rodada corretiva no orçamento
  inicial. Texto usado para corrigir o sistema passa a ser desenvolvimento; uma nova
  aferição independente precisa de outro conjunto reservado.

**Metas propostas, a congelar em M1:** precisão da triagem ≥85%, cobertura dos
problemas rotulados ≥70%, pelo menos 80% das propostas substantivas aceitas sem
reescrita importante e redução ≥25% do tempo mediano de revisão nos casos comparáveis.
São metas de produto, não resultados existentes. Registrar contagens e tamanho da
amostra, não apenas percentuais. Preferências e tipografia não contam como erro semântico.

**Critérios de segurança:** nenhuma nova perda grave de informação observada na amostra
de aceite; nenhum texto aplicado automaticamente; nenhum dado perdido. Zero ocorrências
observadas não significa risco zero em todo texto futuro.

**Saída possível se a qualidade não passar:** liberar a estabilidade técnica apenas
como ferramenta assistida, com revisão seletiva opcional/experimental. Não declarar
a meta editorial alcançada nem trocar para Pro automaticamente.

### M5 — Robustez, segurança e recuperação

- Rodar o conjunto completo de verificações do projeto; não só os testes do servidor.
- Ensaiar timeout, 429, resposta incompleta/duplicada, cancelamento, reinício, duas abas,
  edição concorrente e retomada, em ambiente descartável.
- Validar limites de chamadas e credenciais ausentes/invalidas; logs sem chaves ou sessões.
- Testar exportação/reimportação e segmentação com dados de cópia, preservando parágrafos,
  itálicos, nomes, caracteres chineses e histórico suportado pelo formato.
- Restaurar backup em diretório isolado e comparar conteúdo/integridade; definir onde
  fica uma cópia de segurança recuperável se a VPS for perdida.
- Rever autenticação, acesso público/privado, origem das requisições, permissões e
  exposição de arquivos. Não mudar permissões públicas ou publicar capítulos por teste.
- Conferir usabilidade em desktop e celular e desempenho com capítulos longos/lotes
  representativos. Virtualização só entra se a medição mostrar necessidade.

**Aceite:** nenhum bloqueador de dados/segurança/uso aberto; regressões documentadas;
restauração ensaiada. **API:** zero para falhas simuladas, sem provocar erros pagos reais.

### M6 — Implantação com retorno seguro

- Preparar release identificada, escopo exato, backup íntegro e instruções de reversão.
- Validar em instância isolada com cópia adequada; não expor credenciais/dados nos artefatos.
- Conferir ausência de jobs ativos antes da atualização; alinhar eventual interrupção de uso.
- Implantar código e migrações necessárias, preservando banco, chaves e traduções.
- Testar saúde, login, editor, leitura, telemetria e exportação; confirmar versão do servidor
  e da interface. Checar contagens/hashes dos dados que não deveriam mudar.
- Em falha, reverter código; se houver migração, usar a estratégia ensaiada. Não restaurar
  banco sobre edições novas sem reconciliá-las.

**Aceite:** versão esperada na VPS, smoke tests aprovados, dados preservados, rollback
viável. Implantar não significa habilitar automaticamente recursos experimentais.
**API:** zero no smoke test normal; chamada real apenas se necessária, pequena e registrada.

### M7 — Piloto real

- Usar 2–3 capítulos novos da rotina, que podem ser os seguintes disponíveis após o 24.
  Confirmar numeração/importação quando a fase chegar, sem pressupor estado futuro.
- Rodar o fluxo integrado com limites e revisão humana; registrar tempo, custos e
  proporção de sugestões úteis. Não escolher apenas capítulos fáceis.
- Conferir finalização, recuperação após recarregar e exportação do texto efetivamente aprovado.
- Observar por 5–7 dias de uso ou tempo equivalente suficiente para exercitar retomada,
  sessões e backups. Sem simular observação contínua que não tenha sido realizada.

**Aceite:** usuário consegue concluir capítulos sem reparos no banco; nenhuma perda ou
cobrança duplicada observada; limites editoriais compreendidos e métricas registradas.
Se surgir defeito grave, corrigir e repetir o cenário afetado, não a bateria paga inteira.

### M8 — Fechamento

- Corrigir pendências do piloto e repetir somente testes afetados mais a regressão completa.
- Atualizar documentação de operação, custos, estados, backup, recuperação e limitações.
- Publicar notas de versão e checklist final; arquivar experimentos como evidência,
  não como mecanismo operacional obrigatório.
- Registrar o que ficou fora do escopo e a decisão sobre o recurso experimental.
- Declarar a versão estável quando todos os critérios técnicos obrigatórios estiverem
  cumpridos, com conclusão editorial separada e honesta.

**Aceite:** entrega operável pelo usuário, versão identificada, documentação útil,
rotina de manutenção e nenhuma pendência bloqueadora disfarçada de “melhoria futura”.

## 5. Política de gasto

**Proposta de planejamento:** reservar até **US$ 3 de gasto adicional de API** para
este fechamento: US$ 0,50 para smoke tests e hipóteses pontuais, US$ 1 para avaliação,
US$ 1 para o piloto e US$ 0,50 de contingência. Não é previsão de consumo obrigatório,
preço atual verificado nem orçamento já aprovado pelo usuário. Crédito promocional
é recurso finito e conta como gasto de uso, mesmo sem cobrança imediata no cartão.

- Preferir sempre replay, mocks e análise local; não usar modelo para decidir o que um
  teste determinístico consegue verificar.
- Antes de cada rodada paga, registrar hipótese, casos, limite de chamadas, estimativa,
  critério de sucesso e condição de interrupção.
- Não repetir uma rodada para “tentar uma resposta melhor”. Investigar a falha primeiro.
- Manter Flash; mudança de modelo ou aumento material do gasto exige nova decisão.
- Registrar uso parcial e chamadas que retornem erro quando houver metadados. Nenhum
  orçamento deve ser apresentado como teto absoluto se a chamada em voo puder ultrapassá-lo.
- Enforce de teto precisa considerar limite de saída, chamadas em voo e eventuais retries;
  limites locais não substituem limites e faturamento do provedor.
- O plano não autoriza consumir US$ 3 de uma vez. Até o orçamento ser confirmado,
  continuar apenas trabalho local e testes pontuais estritamente necessários dentro
  da cautela já solicitada; escalar antes de comprometer uma rodada maior.

## 6. Checklist final de “pronto”

- [ ] Local, release e VPS identificados, sem divergência desconhecida.
- [ ] Importação, segmentação, tradução e retomada funcionam sem perda de texto.
- [ ] Revisão mostra diagnósticos, propostas e limitações; nada aplicado sem aprovação.
- [ ] Tipografia não infla métricas literárias nem dispara chamadas isoladas desnecessárias.
- [ ] Alterações humanas e primeira IA são preservadas; conflitos são tratados.
- [ ] Glossário e referências contextuais foram exercitados em testes reais e negativos.
- [ ] Custos por etapa e limites são visíveis e verificáveis.
- [ ] Avaliação independente realizada e resultado editorial explicitamente aceito ou
      recurso mantido experimental — sem alegação indevida de perfeição.
- [ ] Servidor, interface, tipos, lint, formatação, build e fluxos de integração verificados.
- [ ] Login, permissões, exportação/reimportação e restauração passaram nos testes.
- [ ] Implantação e reversão documentadas; backup recuperável disponível.
- [ ] Piloto concluído e ausência de bloqueadores confirmada.
- [ ] Manual de uso, notas de versão e limites entregues.

## 7. Responsabilidades e regras de continuidade

**Assistente:** inspeção, implementação, testes, análise dos artefatos, relatórios,
preparação da release e acompanhamento de métricas, dentro do escopo autorizado.
Não pedir “faça isso” para cada tarefa já prevista. Não prometer atividade contínua
fora das sessões ou monitoramento que não esteja configurado.

**Usuário:** decidir voz editorial, validar amostras e piloto, fornecer/importar o
material ainda indisponível e decidir gastos maiores ou expansão de escopo.
Concentrar essas decisões nos marcos M1, M4 e M7, não em cada ajuste de código.

**Paradas obrigatórias:** risco de perda de dados; mudança material de escopo/modelo;
orçamento insuficiente; teste sem hipótese verificável; informação essencial ausente.
Fora desses casos, avançar até o critério de conclusão da etapa.

Não existe percentual global confiável hoje. O acompanhamento deve usar os marcos
e o checklist acima: concluído com evidência, em validação, bloqueado ou fora do escopo.

Este documento organiza trabalho futuro. Sua criação não implantou código, não
alterou estados de capítulos e não iniciou chamadas de API.
