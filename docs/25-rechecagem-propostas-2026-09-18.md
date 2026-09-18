# Rechecagem das propostas — 18/09/2026

## Entrega

A validação seletiva agora reexamina os sinais bilíngues reconhecidos que constam
do diagnóstico, em vez de presumir que uma frase alterada resolveu o problema.
Sinal persistente gera alerta para leitura humana; não é um veredito semântico.
A ausência do padrão recebe o estado `sinal-nao-detectado`, nunca “corrigido”.
Diagnósticos sem verificador conhecido não recebem resultado de verificação.

O código também bloqueia conversão de formato de aspas fora do diagnóstico
seletivo, inclusive quando vem junto com uma alteração substantiva. A comparação
abrange citações com conteúdo idêntico e mesma quantidade de ocorrências, entre
aspas duplas retas, curvas e pares asiáticos. Não tenta analisar toda pontuação,
reescrita de falas ou aspas simples/apóstrofos. Revisão integral e diagnóstico
explícito de tipografia continuam permitidos; a categoria retornada pela IA não
autoriza por si só ampliar o escopo.

## Resultado com a resposta já salva

Revalidação local da única chamada de triagem automática do experimento anterior:

- Dez decisões, cinco propostas substantivas, cinco preservações.
- 24.47: alerta de persistência em `assassinato-tentativa`, pois “foram armar um
  assassinato” ainda não assegura ato consumado. A mesma proposta foi bloqueada
  pela mudança de “possuídos” para aspas retas, fora do diagnóstico.
- Quatro propostas continuam elegíveis para staging, não aprovadas. Os problemas
  residuais descritos no relatório 24 — formalismos, referente e tempo — permanecem.
- Nenhum texto, lote ou status de produção foi alterado.

O verificador de resultado da ação reconhece algumas formas explícitas de
tentativa/preparação conhecidas. Outras paráfrases podem escapar. Sua saída é uma
suspeita, porque o contexto pode justificar essas formas. Também não se conclui
que um ato aconteceu apenas pela ausência dos padrões. A restrição tipográfica,
por outro lado, é uma verificação objetiva de escopo da edição, não de sentido.

## Integração e testes

Dois testes da rota, com provedor mock e banco em memória, confirmam:

1. Sem mudança de aspas, a suspeita persistente acompanha a proposta pendente como
   `alerta:diagnostico-nao-resolvido`.
2. Com conversão não diagnosticada, a proposta não é inserida no staging.
3. Em ambos os casos, o texto vigente permanece intacto.

Testes unitários cobrem persistência, a variante de preparação, padrões que
desaparecem sem certificação de acerto, diagnósticos desconhecidos, necessidade de
evidência chinesa, separação de tipografia/conteúdo, escopo explícito e reordenação
de citações. **890 testes do servidor passaram**, além de typecheck e diff-check.

## Rastreabilidade e custo

Runner offline novo:
`server/scripts/revalidar-diagnosticos-salvos.ts SNAPSHOT.json SAIDA.json`.
Valida o hash do ambiente e exige saída exclusiva. Não importa credenciais,
provedores ou banco. Apenas lê respostas e escreve o relatório local.

Fonte privada na VPS:
`/var/lib/dao-tale/eval-registro-yhKxPA/revisao-triagem-automatica-2026-09-18.json`.
SHA-256 dos bytes da fonte:
`ee19585444c1582782023076a26ef8a7abf50628974af8841fc5720e18806f69`.
Relatório local temporário:
`/tmp/dao-tale-verificar-GUsZAa/revalidacao.json` (regenerável pelo runner).

**Zero chamadas e zero gasto adicional de API.** A resposta anterior foi apenas
copiada da VPS para leitura local. Não houve implantação ou modificação do banco.

## Limite da entrega

Esta é uma proteção adicional verificável, não um revisor literário autônomo.
O fluxo ainda depende de aprovação humana e não deve equiparar “passou nas travas”
a qualidade suficiente para publicação. Não há novas chamadas programadas.
