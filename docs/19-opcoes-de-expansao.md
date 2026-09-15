# 19 — Opções de expansão do Dao Tale

**Registrado em:** 22 de agosto de 2026

**Natureza:** levantamento de possibilidades; não é compromisso de implementação nem
ordem oficial do roadmap.

Este documento registra as expansões consideradas para o Dao Tale, confrontando cada
ideia com o estado atual do projeto. A classificação usada é:

- **implementado:** já existe no produto e está coberto pelo fluxo atual;
- **parcial:** a infraestrutura principal existe, mas a experiência pedida ainda não está
  completa;
- **não implementado:** exige um fluxo ou modelo novo.

As estimativas são relativas ao próprio projeto:

- **baixo:** mudança localizada, sem alterar os fundamentos do produto;
- **médio:** envolve banco, API, interface e testes, mas aproveita a arquitetura atual;
- **alto:** muda premissas centrais, segurança, isolamento de dados ou várias camadas do
  pipeline.

## Resumo executivo

| Expansão | Estado em agosto de 2026 | Esforço restante |
|---|---|---|
| CAT especializado em webnovels | parcial | médio por etapa; alto para um CAT genérico |
| Inglês, coreano e japonês ↔ PT-BR | não implementado | médio/alto |
| Importar traduções já feitas | não implementado no fluxo comum | baixo/médio |
| Contas de outros uploaders, cada uma com chaves próprias | não implementado | alto |
| Área exclusiva para revisão | parcial | médio |
| Aprendizado de idioma durante a tradução | não implementado | médio/alto |
| Plural, gênero e capitalização no glossário | implementado | manutenção e refinamento |
| Hierarquia e mapas de termos | árvore e vínculos atuais implementados; grafo narrativo pendente | médio/alto para grafo temporal |
| Organização semântica do glossário | implementado em grande parte | baixo/médio para UX adicional |
| Capitalização de títulos e tratamentos | implementado | manutenção e aferição |

---

## 1. Evoluir para um CAT especializado em webnovels

### Intenção

Transformar o Dao Tale em uma ferramenta de tradução assistida por computador — ou,
mais precisamente, incorporar as ferramentas úteis de um CAT como o OmegaT — sem perder
o foco editorial em webnovels.

### Estado atual: árvore e vínculos atuais implementados

O Dao Tale já oferece parte substancial da bancada de um CAT:

- editor bilíngue baseado em segmentos;
- segmentação automática do texto-fonte;
- divisão e junção manual de frases;
- glossário por obra;
- variantes e relações entre termos;
- captura e sugestão de termos;
- verificação de consistência;
- QA e revisão assistidos;
- preservação da primeira tradução da IA para comparação com a versão humana;
- exportação de capítulos e livros;
- importação e exportação do glossário;
- backup e restauração integral de uma obra.

O projeto, entretanto, ainda não possui os elementos que normalmente definem um CAT
completo:

- memória de tradução persistente;
- correspondências exatas e aproximadas (*fuzzy matches*);
- pesquisa de concordância em traduções anteriores;
- importação e exportação TMX;
- reaproveitamento controlado entre obras;
- tratamento de tags e formatos editoriais estruturados;
- atalhos e navegação de produtividade típicos de CAT;
- confirmação formal de segmentos e estados próprios de memória de tradução.

### Direção recomendada

Não é necessário replicar todo o OmegaT. O melhor encaixe para o produto é um **CAT
literário especializado em webnovels**, no qual memória, contexto narrativo, glossário e
revisão trabalham juntos.

Uma evolução segura pode ser dividida assim:

1. **Concordância:** pesquisar uma expressão nos originais e nas traduções de todos os
   capítulos da obra.
2. **Memória exata:** sugerir traduções anteriores quando o segmento-fonte se repetir.
3. **Memória aproximada:** calcular similaridade, exibir origem da sugestão e nunca
   substituir silenciosamente o texto.
4. **Memória entre obras:** somente por coleção explicitamente escolhida pelo usuário,
   para não misturar terminologia de universos diferentes.
5. **TMX:** importar e exportar memórias quando o modelo interno estiver estabilizado.

### Decisões necessárias

- A unidade da memória será frase, parágrafo ou ambos?
- Edições humanas terão prioridade sobre traduções aceitas sem edição?
- Como invalidar uma memória depois que o glossário ou o prompt da obra mudar?
- Memórias serão privadas por obra, compartilhadas por coleção ou globais?
- Uma sugestão terá proveniência visível: obra, capítulo, data, modelo e versão do prompt?

### Riscos

- Reutilizar uma frase semelhante fora do contexto pode introduzir erro narrativo.
- Uma memória global pode contaminar nomes, cargos e convenções entre obras.
- Similaridade superficial não garante equivalência em chinês, japonês ou coreano.
- Um CAT genérico demais pode deslocar o foco do produto e multiplicar formatos a manter.

### Critério de conclusão da primeira fase

O tradutor consegue selecionar uma frase e ver ocorrências anteriores do original, suas
traduções e contexto; segmentos idênticos geram sugestões explicáveis, mas nada é aplicado
sem ação explícita.

---

## 2. Aceitar outros idiomas e tradução nos dois sentidos

### Intenção

Traduzir inglês, coreano e japonês para português brasileiro e, futuramente, traduzir do
português brasileiro para esses idiomas.

### Estado atual: não implementado

O núcleo atual foi concebido para chinês → PT-BR. Essa especialização não está apenas no
texto do prompt; aparece em todas as camadas:

- nomes de campos como `texto_zh`, `termo_zh` e `trecho_zh`;
- segmentação baseada em pontuação e convenções chinesas;
- catálogo de erros específico de chinês → português;
- regras de nomes, unidades, partículas e aspectos chineses;
- QA que consulta explicitamente o original chinês;
- tipografia e rótulos da interface;
- glossário entendido como par chinês → português.

### Escopo mínimo para múltiplos idiomas

1. Adicionar à obra `idioma_origem` e `idioma_destino` usando códigos BCP 47 ou uma lista
   fechada inicialmente.
2. Generalizar nomes internos novos para `texto_origem`, `termo_origem` e
   `trecho_origem`, mantendo uma migração compatível com os dados atuais.
3. Criar um segmentador por idioma:
   - inglês: abreviações, aspas e pontuação latina;
   - japonês: pontuação japonesa, diálogos e ausência de espaços;
   - coreano: pontuação moderna, diálogos e terminações;
   - chinês: preservar o comportamento já aferido.
4. Separar o prompt universal das regras específicas do par linguístico.
5. Criar catálogos de QA por par linguístico; não reaproveitar automaticamente as regras
   de chinês.
6. Tornar glossário, exportações, busca e editor neutros em relação ao idioma.
7. Testar fontes, seleção de texto e quebra de linha para cada escrita.

### Ordem recomendada

1. Generalizar o modelo sem mudar o comportamento de chinês → PT-BR.
2. Adicionar inglês → PT-BR, por ser o par mais simples para validar a arquitetura.
3. Adicionar japonês → PT-BR.
4. Adicionar coreano → PT-BR.
5. Só então introduzir PT-BR → outros idiomas.

### Por que o “vice-versa” é uma fase separada

Inverter origem e destino não equivale a inverter duas opções. A política editorial muda:
naturalidade, honoríficos, romanização, explicitação de sujeito, ordem sintática, gênero,
registro e pontuação precisam de regras próprias. Cada direção é um par linguístico
distinto e deve ter prompts, QA e testes próprios.

### Riscos

- Uma abstração genérica demais pode piorar o excelente tratamento especializado do
  chinês.
- Modelos diferentes têm competências muito distintas em cada par linguístico.
- Glossários bilaterais nem sempre são simétricos.
- Catálogos automáticos sem aferição produzem falsos positivos e perdem a confiança do
  revisor.

### Critério de conclusão

Uma obra declara origem e destino; segmentação, glossário, tradução, revisão, QA e
exportação funcionam sem rótulos ou regras indevidamente herdadas de chinês.

---

## 3. Importar traduções já feitas

### Intenção

Permitir cadastrar uma tradução existente, com ou sem o original ao lado, para revisar,
publicar, organizar ou continuar o trabalho dentro do Dao Tale.

### Estado atual: não implementado no fluxo comum

Hoje o formulário de capítulo recebe `.txt`/`.md` ou texto colado, mas interpreta o
conteúdo como texto-fonte chinês. O backup integral consegue restaurar uma obra que já
veio do próprio Dao Tale, porém não é um importador de traduções externas.

O modelo atual também pressupõe que cada frase possui `texto_zh` não nulo. Uma importação
“somente tradução” precisa representar honestamente a ausência de original, em vez de
inventar um texto-fonte vazio como se fosse um capítulo bilíngue normal.

### Modos propostos

#### A. Somente tradução

- aceitar texto colado, `.txt` ou `.md`;
- preservar parágrafos;
- criar unidades de edição em português sem exigir original;
- desabilitar recursos que dependem de comparação com a fonte;
- permitir revisão de estilo, leitura, publicação e exportação.

**Esforço:** baixo/médio.

#### B. Original e tradução já alinhados

- aceitar TSV/CSV ou uma interface com duas colunas;
- validar número e ordem dos segmentos;
- mostrar uma prévia antes de gravar;
- permitir juntar/dividir pares durante a conferência;
- registrar a tradução como importada, não como saída de IA.

**Esforço:** médio.

#### C. Dois arquivos ainda não alinhados

- importar fonte e tradução separadamente;
- propor alinhamento por parágrafo e similaridade estrutural;
- destacar trechos sem par e divergências de contagem;
- exigir confirmação humana antes de persistir.

**Esforço:** médio/alto.

### Alterações de modelo sugeridas

- adicionar uma origem da tradução: `ia`, `manual`, `importada`;
- representar explicitamente capítulos `monolingue` e `bilingue`, ou tornar o original
  opcional de maneira controlada;
- não contar importação como edição manual aprendida nem como custo de IA;
- registrar formato, nome do arquivo e data de importação;
- preservar o texto bruto importado para recuperação e auditoria.

### Riscos

- Alinhamento automático incorreto pode deslocar todo o restante do capítulo.
- Markdown e arquivos de origem podem conter títulos, notas e separadores ambíguos.
- Sem original, revisão de fidelidade, extração de termos e parte do QA não são possíveis.

### Critério de conclusão da primeira fase

O usuário importa uma tradução monolíngue, vê uma prévia dos parágrafos e consegue
revisar, publicar e exportar sem o sistema fingir que existe texto-fonte.

---

## 4. Criar contas para outros uploaders, com chaves próprias

### Intenção

Permitir que várias pessoas usem a mesma instalação, cada uma com sua conta, suas obras e
suas credenciais de provedores de IA.

### Estado atual: não implementado

O modo hospedado atual é **single-tenant e single-user**: uma senha protege a instalação
inteira. Não existem usuários, cadastro, propriedade por obra ou permissões. A sessão
responde “é o dono da instância”, não “qual usuário entrou”.

### Por que é uma mudança arquitetural

Uma interface de cadastro não basta. O isolamento precisa alcançar todas as consultas e
operações:

- usuários e identidades;
- sessões vinculadas ao usuário;
- propriedade da obra;
- membros e papéis por obra;
- autorização em todas as rotas;
- credenciais de IA por usuário;
- cotas e telemetria atribuídas corretamente;
- autoria de edições, revisões e decisões de glossário;
- exportação e exclusão dos dados de cada pessoa;
- administração, convite, suspensão e recuperação de acesso;
- proteção contra enumeração e acesso cruzado.

### Primeira versão recomendada

Evitar cadastro público inicialmente. Implementar:

1. contas criadas por convite;
2. obras privadas;
3. papéis `dono`, `tradutor`, `revisor` e, se necessário, `leitor`;
4. uma obra com um dono e membros convidados;
5. chaves privadas por usuário, nunca devolvidas pela API;
6. auditoria mínima: quem alterou tradução, termo, status e regra;
7. cotas e custos separados por usuário/provedor.

### Decisões necessárias

- A pessoa paga com a própria chave ou o dono da instalação pode patrocinar chamadas?
- Uma obra pode ter vários tradutores simultâneos?
- Como resolver duas edições concorrentes da mesma frase?
- O dono pode ler ou usar a chave de outro usuário? A resposta recomendada é não.
- Haverá exclusão de conta e transferência de propriedade?

### Riscos

- Uma falha de autorização passa a ser vazamento de obras e credenciais.
- O cofre atual precisa deixar de usar apenas o provedor como identidade da chave.
- SQLite continua adequado para uma equipe pequena, mas escrita concorrente deve ser
  medida antes de abrir cadastro amplo.
- Recuperação de senha e e-mail introduzem infraestrutura externa e abuso.

### Critério de conclusão

Dois usuários da mesma instância enxergam apenas suas obras ou obras compartilhadas; cada
chamada usa a credencial e a cota esperadas; toda mutação relevante registra autoria.

---

## 5. Criar uma área exclusivamente dedicada à revisão

### Intenção

Oferecer uma bancada que trate revisão como uma atividade própria, com prompts e fluxos
para capítulos e arcos completos, em vez de ser apenas uma ação aberta dentro de uma
frase do editor.

### Estado atual: parcial

Já existem fundações importantes:

- revisão por frase em uma gaveta;
- revisão como conversa, com réplica e recusa fundamentada;
- correção proposta e aplicação cirúrgica;
- QA por capítulo;
- passe de estilo;
- consistência da obra inteira;
- banco de testes gerado a partir da revisão;
- mineração das edições manuais;
- modelos e temperaturas próprios para o papel de revisão.

Ainda não existe uma sessão dedicada que permita selecionar um escopo, executar uma
campanha de revisão e acompanhar uma fila consolidada.

### Bancada proposta

#### Escopos

- capítulo atual;
- intervalo de capítulos;
- capítulos selecionados;
- arco nomeado;
- obra inteira, dividida em lotes.

#### Tipos de revisão

- fidelidade ao original;
- fluidez e naturalidade;
- consistência de personagens, cargos, locais e termos;
- cronologia e continuidade;
- voz de personagem;
- repetições e vícios de linguagem;
- pontuação e tipografia;
- revisão final pré-publicação.

#### Fluxo

1. escolher escopo e tipos de revisão;
2. estimar quantidade de chamadas, tokens e custo;
3. executar em lotes retomáveis;
4. consolidar apontamentos e remover duplicatas;
5. apresentar fila ordenada por severidade e capítulo;
6. aceitar, editar, dispensar ou conversar sobre cada apontamento;
7. registrar decisões para QA e refinamento futuro.

### Revisão de arco

Não se deve enviar um arco inteiro em uma única chamada. A solução recomendada é:

- processar capítulos em lotes;
- produzir um estado acumulado estruturado de personagens, relações, fatos, lugares,
  promessas narrativas e cronologia;
- revisar cada novo lote contra esse estado;
- executar uma consolidação final que cite evidências e capítulos.

Isso exige que “arco” seja uma entidade persistida ou, inicialmente, uma seleção salva de
capítulos.

### Riscos

- Contexto muito grande aumenta custo sem garantir melhor julgamento.
- Correções em massa podem apagar voz literária se forem aplicadas automaticamente.
- O mesmo problema pode ser apontado por várias passagens de revisão.
- Prompts livres e não versionados tornam resultados difíceis de reproduzir.

### Critério de conclusão da primeira fase

O usuário seleciona um capítulo e um tipo de revisão, recebe uma fila persistente de
apontamentos, decide cada item e retoma a sessão depois sem perder o estado.

---

## 6. Aprender outro idioma enquanto traduz

### Intenção

Acrescentar um modo pedagógico que ajude o usuário a compreender o idioma-fonte enquanto
traduz, sem transformar a tradução literária em uma aula obrigatória.

### Estado atual: não implementado

O Dao Tale explica problemas de tradução e permite conversar com a revisão, mas isso não
forma um currículo, não acompanha domínio de vocabulário e não programa revisões de
aprendizado.

### Princípio de produto

O recurso deve ser um **modo de estudo opcional**, separado da bancada profissional. Um
tradutor experiente não deve pagar custo, espaço visual ou latência por explicações que
não pediu.

### Primeira versão possível

Ao selecionar uma frase, oferecer “Estudar original” com:

- leitura/romanização quando aplicável;
- divisão em palavras ou unidades;
- significado contextual, não uma lista de dicionário;
- explicação curta da construção gramatical;
- diferença entre tradução literal e decisão literária;
- indicação de termos já presentes no glossário;
- uma ou duas perguntas de recuperação antes de revelar a resposta.

### Evolução pedagógica

- marcar palavras como `nova`, `aprendendo` ou `dominada`;
- gerar cartões a partir de frases reais da obra;
- repetição espaçada;
- metas por frequência e nível;
- ocultar traduções conhecidas durante exercícios;
- relatório de progresso por vocabulário e construção;
- exportação opcional para formatos de estudo.

### Decisões necessárias

- O objetivo é leitura, tradução, gramática ou vocabulário?
- Haverá romanização sempre, sob demanda ou nunca?
- Como evitar explicações incorretas da IA virarem material memorizado?
- O aprendizado será local a uma obra ou compartilhado entre obras?
- Como distinguir uma palavra comum de um nome próprio segmentado incorretamente?

### Riscos

- Explicações de IA podem parecer convincentes e estar erradas.
- Romanização constante pode atrasar o desenvolvimento da leitura da escrita original.
- Um sistema de repetição espaçada cria um segundo produto dentro do primeiro.
- Misturar “resposta literária correta” com “tradução literal” pode confundir iniciantes.

### Critério de conclusão da primeira fase

O usuário abre uma explicação contextual de uma frase sem alterar a tradução nem o
glossário; a resposta separa claramente análise linguística, literalidade e escolha
literária.

---

## 7. Plural, gênero e capitalização nos termos do glossário

### Intenção

Reconhecer que uma entrada lexical pode aparecer no plural, no feminino ou com outra
capitalização sem deixar de cumprir o glossário, ao mesmo tempo que nomes e cargos
específicos preservam sua identidade.

### Estado atual: implementado

O sistema já possui um casador compartilhado de termos flexionados, usado pelo servidor e
pelo destaque no editor. A comparação:

- ignora diferenças simples de caixa;
- tolera flexões no final das palavras;
- cobre plural simples e mudanças como `Homem de Sabre` → `Homens de Sabre`;
- trata conectores de nomes compostos sem confundi-los com a identidade do termo;
- exige fronteiras de palavra para evitar casamento dentro de outra palavra.

O glossário também distingue duas espécies:

- **identidade:** designa um referente específico;
- **lexical:** fixa a escolha lexical, mas permite flexão e caixa naturais.

Exemplos:

- `金鹏堡 → Fortaleza do Peng Dourado`: identidade;
- `刀 → sabre`: lexical;
- `杀手 → assassino`: lexical quando for o substantivo comum;
- um cargo específico chamado `Assassino`: identidade ou entrada com nota de uso que
  delimite o contexto hierárquico.

O campo **nota de uso** registra exceções como:

> Maiúscula apenas quando designar o cargo na Fortaleza; nos demais contextos é
> substantivo comum.

### Limites conscientes

O casador é uma heurística para destaque e alerta, não um analisador morfológico completo.
Não deve alterar texto automaticamente. Casos irregulares, polissemia e distinções de
sentido continuam dependentes de espécie, nota de uso e revisão humana.

### Manutenção recomendada

- aferir falsos positivos e falsos negativos em obras reais;
- acrescentar testes para flexões encontradas, não regras hipotéticas;
- nunca usar aparência capitalizada do verbete como ordem automática de caixa;
- manter a mesma regra compartilhada entre editor e varredura de consistência.

---

## 8. Sistema de hierarquia e relações entre termos

### Intenção

Organizar lugares, famílias, facções, personagens e outros conceitos em árvores ou mapas
de ligação. Exemplo: Forte Leste e Forte Oeste fazem parte da Fortaleza do Peng Dourado.

### Estado atual: parcial

O glossário já possui `termo_pai_id`, que representa pertencimento. Um termo filho pode
apontar para um termo pai da mesma obra. Quando o filho aparece num trecho, o filtro de
contexto pode incluir o pai para informar à IA a relação relevante.

Também existe uma separação conceitual importante:

- **termo pai:** uma coisa pertence ou fica dentro de outra;
- **variante:** dois nomes apontam para o mesmo referente.

Assim, o modelo atual já suporta:

```text
Fortaleza do Peng Dourado
├── Forte Leste
└── Forte Oeste
```

O Glossário possui uma visualização **Relações** com duas leituras complementares:

- **Árvore:** pertencimento por `termo_pai_id`, ramos recolhíveis, variantes junto da
  identidade canônica, filtro por categoria e diagnóstico de órfãos/ciclos;
- **Vínculos:** arestas explícitas “pertence a” e “variante de”, com navegação de cada nó
  para o verbete editável.

Novos vínculos de pertencimento são validados no servidor: precisam apontar para outro
termo da mesma obra e não podem criar ciclos. O que ainda não existe é o sistema geral de
relações narrativas e temporais descrito abaixo.

### Primeira etapa concluída

- visualização em árvore a partir de `termo_pai_id`;
- expansão e recolhimento de ramos;
- filtro por categoria preservando os ancestrais necessários;
- diagnóstico de órfãos e ciclos inválidos;
- navegação da árvore e dos vínculos para o verbete.

### Mapas gerais implementados

Árvore não representa relações como casamento, rivalidade ou aliança. Por isso foi criada
uma entidade separada:

```text
relacoes_termos
- id
- obra_id
- origem_termo_id
- destino_termo_id
- tipo
- direcao
- nota
- capitulo_inicio
- capitulo_fim
- confirmado_por
```

Os tipos iniciais cobrem:

- pai/mãe com filho/filha, irmãos/irmãs, cônjuges;
- membro de, lidera, serve a, mestre de e irmão juramentado;
- aliado de e inimigo de;
- originário de e localizado em.

Cada relação é gravada uma vez e possui rótulo de leitura direta e inversa. Relações
simétricas são normalizadas para impedir duplicatas em ordem invertida; variantes são
resolvidas para o verbete canônico. A interface oferece uma árvore genealógica em
gerações, uma rede narrativa e um editor de fatos com nota e intervalo de capítulos.

Relações familiares e políticas podem mudar durante a história; por isso, capítulo de
início/fim e proteção contra spoilers precisam ser considerados antes de exibi-las no
leitor público.

### Riscos

- Grafos extraídos automaticamente podem transformar inferência em fato.
- Uma relação válida num capítulo pode deixar de valer depois.
- Exibir toda a árvore para um leitor pode revelar spoilers.
- `termo_pai_id` não deve ser sobrecarregado para representar relações que não são
  pertencimento.

### Critério de conclusão da primeira fase

O usuário vê e edita uma árvore dos vínculos pai–filho existentes, sem mudar o modelo
semântico atual e sem permitir ciclos.

---

## 9. Organizar melhor o glossário

### Intenção

Separar termos que são identidades importantes e devem ser obedecidos rigidamente de
traduções de palavras comuns que só valem em determinado sentido ou podem flexionar.

### Estado atual: implementado em grande parte

O glossário possui atualmente:

- categorias sugeridas e categorias livres;
- busca e filtro por categoria;
- espécie `identidade` ou `lexical`;
- estado “ainda não classificado”;
- nota geral;
- nota de uso contextual;
- marca de gatilho ambíguo;
- variantes do mesmo referente;
- pertencimento pai–filho;
- primeira e última aparição no texto;
- filtro “somente não classificados”;
- importação e exportação CSV.

### Como representar os exemplos

- `合和劲 → Força Harmoniosa`: normalmente **identidade**, pois designa uma técnica ou
  conceito específico da obra.
- `杀手 → assassino`: **lexical** quando apenas fixa a escolha de palavra, permitindo
  `assassinos`, `assassina` e caixa natural.
- `杀手 → Assassino` como cargo exclusivo: entrada específica ou nota de uso que diga
  quando a designação hierárquica se aplica.
- gatilho com vários sentidos: marcar como **ambíguo** e delimitar a entrada com nota de
  uso; a checagem deixa de tratar toda ocorrência como certeza.

### Melhorias ainda possíveis

- edição em massa de espécie e categoria;
- grupos ou coleções salvas;
- visualização em árvore;
- colunas configuráveis;
- ordenação por frequência e última aparição;
- relatório de verbetes caros que nunca entram no contexto;
- importação CSV dos campos semânticos novos;
- detecção assistida de possíveis duplicatas e categorias inconsistentes;
- fila específica para decidir termos ambíguos.

### Princípio de segurança

O glossário deve dizer **quando uma entrada se aplica** e **qual identidade ou escolha
lexical ela fixa**. Não deve obrigar uma tradução comum fora do contexto coberto pela
entrada.

---

## 10. Capitalização de títulos, cargos e formas de tratamento

### Intenção

Definir quando capitalizar formas como Jovem Mestre, Jovem Senhor, Senhorita, Senhor,
Patriarca e Madame, distinguindo título dirigido a uma pessoa, cargo específico e
substantivo comum.

### Estado atual: implementado

Existe uma preferência de estilo própria para capitalização de títulos. A obra pode
escolher entre políticas editoriais, incluindo:

- seguir a norma geral do português e o papel sintático/contextual;
- capitalizar títulos e formas de tratamento segundo a convenção editorial escolhida.

A responsabilidade é dividida corretamente:

- a **preferência da obra** decide a política geral;
- a **espécie do verbete** diz se ele é identidade ou escolha lexical;
- a **nota de uso** resolve a exceção de um termo concreto;
- a forma como o verbete foi digitado não é, sozinha, uma ordem universal de caixa.

Na política de norma do português, a intenção registrada é distinguir, por exemplo:

- vocativo/tratamento direto: `Senhorita, espere.`;
- título diante de nome próprio: `o mestre Yang`;
- cargo ou predicativo comum: `ele virou assassino`;
- designação institucional exclusiva: conforme o glossário e a nota de uso.

### Manutenção recomendada

- manter testes com exemplos reais das obras;
- medir oscilações antes e depois de alterações no prompt;
- evitar regras automáticas baseadas somente na palavra;
- revisar separadamente política editorial e exceção terminológica;
- preservar a decisão como preferência versionada do prompt.

---

## Priorização recomendada por retorno sobre esforço

Esta ordem é uma recomendação técnica, não uma decisão de roadmap:

1. **Importação de tradução pronta, somente em português.** Entrega valor novo com escopo
   controlado.
2. **Bancada de revisão de capítulo.** Aproveita praticamente toda a infraestrutura atual.
3. **Concordância e memória exata.** Primeiro passo concreto para o CAT de webnovels.
4. **Visualização em árvore.** Torna útil e visível a hierarquia já armazenada.
5. **Generalização interna dos idiomas, preservando chinês → PT-BR.** Preparação sem
   regressão funcional.
6. **Inglês → PT-BR.** Primeiro novo par linguístico.
7. **Revisão por arco e memória aproximada.** Recursos poderosos, mas dependentes de
   contexto e proveniência bem resolvidos.
8. **Japonês/coreano → PT-BR.** Depois da arquitetura multilíngue estar comprovada.
9. **Contas multiusuário.** Exige uma fase própria de segurança e autorização.
10. **PT-BR → outros idiomas e modo pedagógico completo.** Produtos maiores, que devem
    nascer depois das fundações anteriores.

## Dependências entre expansões

```text
Importação de traduções ───────────────┐
                                       ├─> CAT / memória de tradução
Generalização dos idiomas ─────────────┘
             ├─> inglês → PT-BR
             ├─> japonês → PT-BR
             ├─> coreano → PT-BR
             └─> PT-BR → outros idiomas

Revisão atual ─> bancada de capítulo ─> revisão de arco/obra

termo_pai_id ─> árvore de termos ─────> grafo de relações

autenticação single-user ─> usuários ─> papéis/obras compartilhadas
                                      └> chaves e cotas por usuário
```

## Regras para decidir se uma expansão entra no roadmap

Antes de promover uma opção deste documento para tarefa, registrar:

1. problema concreto e exemplos reais;
2. fluxo mínimo que resolve o problema;
3. dados novos e estratégia de migração;
4. recursos existentes que serão reutilizados;
5. comportamento em obras antigas;
6. custos e limites de chamadas de IA;
7. riscos de falsos positivos ou alterações automáticas;
8. critérios verificáveis de conclusão;
9. testes de regressão necessários;
10. itens explicitamente deixados fora da primeira versão.

Uma expansão só deve alterar as premissas local-first, privacidade, autoria humana ou
segurança mediante uma decisão de produto explícita e documentada.
