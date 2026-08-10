# Consistência do glossário na obra inteira

Desenho para o item 4 do relato de 2026-08-08: *"seria bom uma forma de a consistência do
glossário ser usada para varrer todos os capítulos feitos, pois pode acontecer de um termo
ser adicionado no glossário mas ele foi traduzido de forma diferente antes."*

A intuição está certa e a medição desloca o alvo: **o problema não é o escopo da varredura,
é o gatilho.** Nada no app reexamina os capítulos antigos quando o glossário muda.

## 1. O que já existe, e o que falta

`varrerConsistencia(frases, glossario, ignoradas)`
(`server/src/traducao/consistencia.ts:34`) é **função pura sobre uma lista de frases** —
não sabe o que é capítulo. Ela já roda em três lugares: a rota manual
`GET /capitulos/:id/consistencia`, o fim do job de tradução, e o checkpoint.

O conserto em lote também já existe: `POST /glossario/:id/substituir`
(`server/src/rotas/curadoria.ts:110`) troca um texto pelo termo canônico na obra inteira,
com prévia.

**O que não existe é a invalidação.** `capitulos.consistencia_violacoes` só é reescrito
por `reposCapitulos.registrarConsistencia` (`repos.ts:413`), chamado pelo job e pelo
checkpoint. Criar, editar, apagar ou importar um termo do glossário **não toca nele**.

O efeito concreto: você cadastra `金鹏堡 → Fortaleza do Peng Dourado` hoje, e os sete
capítulos continuam exibindo o `0 violações` que foi calculado **antes de o termo
existir**. O número não está desatualizado — ele responde a uma pergunta que ninguém mais
está fazendo.

### Medições (obra 1, 死人经, 2026-08-10)

| | |
|---|---|
| Frases traduzidas | 561 |
| Termos no glossário | 57 |
| Dispensas registradas | 4 |
| **Violações hoje, obra inteira** | **0** em 603 ocorrências |

**A varredura acha zero.** Isso não é motivo para não construir — é motivo para não
construir demais. O zero existe porque o revisor já consertou tudo à mão: a mineração de
edições manuais (item 3) mostra o padrão `Jinpeng → do Peng Dourado` repetido nas
correções digitadas. O trabalho foi feito; o que falta é o app avisar da próxima vez.

Custo de varrer a obra inteira, medido no banco de produção:

```
glossário real (57 termos)      ~10 ms
inflado a  200 termos           ~10 ms
inflado a  600 termos           ~19 ms
inflado a 1500 termos           ~38 ms
```

**Isso decide o desenho.** A 38 ms não vale inventar um estado "precisa reconferir" que a
tela ainda não sabe desenhar: recalcula-se e pronto.

## 2. Escopo

**Entra:** a varredura no nível da obra agrupada por termo, o recálculo automático quando
o glossário muda, e a tela que liga o achado ao conserto que já existe.

**Entra também, por emenda:** o resíduo parkeado da revisão final do item 3 (§7).

**Não entra:** IA. A varredura é determinística e acha zero hoje; gastar chamada paga
num problema sem ocorrências seria construir para um fantasma.

## 3. A varredura da obra

`GET /obras/:id/consistencia` devolve o resultado **agrupado por termo**, não por frase:

```ts
{
  ocorrencias: number;              // pares (frase, termo) examinados
  termos_curtos_ignorados: number;  // termos de 1 caractere, filtro que já existe
  frases_examinadas: number;
  por_termo: {
    glossario_id: number;
    termo_zh: string;
    termo_pt: string;
    violacoes: {
      frase_id: number;
      capitulo_id: number;
      capitulo_numero: number;
      ordem: number;
      texto_zh: string;
      texto_pt: string;
    }[];
  }[];
}
```

O agrupamento é a decisão central. O conserto é **por termo** — `substituir` troca na obra
inteira —, então o relatório precisa estar organizado do jeito que o conserto funciona.
Uma lista por frase obrigaria o revisor a reconstruir mentalmente qual termo é qual antes
de poder agir.

`por_termo` sai ordenado por número de violações, decrescente; empate desempata pelo
`termo_pt` em ordem alfabética, para a lista não dançar entre duas chamadas iguais.

**A rota calcula na hora, a cada chamada.** A 10–38 ms não há motivo para cachear, e isso
resolve sozinho a pergunta "este número é de quando?": na tela da obra, é sempre de agora.
O valor guardado em `capitulos.consistencia_violacoes` continua existindo para o selo da
lista de capítulos — e é ele que o gatilho da §4 mantém honesto.

A rota reusa `varrerConsistencia` sem alterá-la — a função já aceita qualquer lista de
frases. O que ela ganha é um chamador novo que passa **todas** as frases traduzidas da
obra, mais o de-para de `frase_id → capítulo`, que a função pura deliberadamente não
conhece (mesmo desenho que a rota por capítulo já usa em `capitulos.ts:315`).

## 4. O gatilho — onde estava o buraco

Função nova em `server/src/traducao/consistencia.ts`:

```ts
/** Recalcula `capitulos.consistencia_violacoes` de todos os capítulos da obra.
    Sem isto, o número exibido responde a uma pergunta feita antes de o glossário
    mudar — e "0 violações" calculado antes de o termo existir é pior que nenhum
    número, porque parece resposta.

    Respeita `consistencia_ignorada` como as demais chamadas: dispensa registrada
    pelo revisor não volta a contar só porque o glossário mudou em outro ponto. */
export function recalcularConsistenciaDaObra(db: BancoDados, obraId: number): void;
```

Chamada depois de **toda** mutação do glossário da obra:

| Rota | Arquivo |
|---|---|
| `POST /obras/:obraId/glossario` (criar) | `curadoria.ts:83` |
| `PATCH /glossario/:id` (editar) | `curadoria.ts:93` |
| `DELETE /glossario/:id` | `curadoria.ts:101` |
| `POST /glossario/:id/substituir` | `curadoria.ts:110` |
| `POST /glossario/:id/vincular` | `curadoria.ts:131` |
| `POST /obras/:obraId/glossario/importar` | `curadoria.ts:153` |
| `POST /termos-sugeridos/:id/aceitar` | `curadoria.ts:201` |

`substituir` entra na lista porque altera as **frases**, não o glossário — e é justamente
a ação que zera as violações que o revisor acabou de consertar.

A importação de CSV recalcula **uma vez ao fim**, não por termo.

## 5. O conserto

A varredura diz *"o termo canônico está faltando nesta frase"*. Ela **não sabe o que está
lá no lugar** — e o `substituir` precisa saber. Quem sabe é o revisor.

Fluxo: o grupo do termo mostra as frases acusadas com o `texto_pt` à vista. O revisor lê,
digita **uma vez** o que estava sendo usado (`Jinpeng`), pede **Prévia** (que devolve
quantas frases seriam afetadas, sem gravar) e então **Trocar**. Tudo isso já existe em
`POST /glossario/:id/substituir`, que aceita `previa: boolean`.

Interação boa que cai de graça: `substituirTermoGlossario` grava
`origem_edicao = 'substituicao'` (item 3, Task 6), então essas frases **não** entram na
mineração de edições manuais fingindo ter sido digitadas.

## 6. A tela

Uma tela por obra, ao lado das outras da obra, com o mesmo cabeçalho das demais.

- Resumo no topo: *"57 termos · 561 frases examinadas · N frases fora do padrão"*.
- Um bloco por termo: `termo_zh → termo_pt`, a contagem, e a lista das frases com
  `cap X/ordem` e o `texto_pt`. Lista longa fica dentro de `<details>`.
- No pé de cada bloco: o campo de substituição, com **Prévia** e **Trocar**.
- Cada frase tem link para o editor no capítulo e ordem certos, e o botão **Dispensar**
  que já existe (`POST /frases/:id/consistencia/dispensar`), porque nem toda ausência é
  erro — quando o referente já está estabelecido, o português omite em vez de repetir.
- Quando não há violação nenhuma, a tela diz isso **junto com o que foi examinado**
  ("57 termos contra 561 frases, agora"), não um "tudo certo" solto. É a diferença entre
  "está limpo" e "ninguém olhou" — e como a rota calcula a cada chamada (§3), o "agora" é
  literal, sem precisar de carimbo de tempo no banco.

A tela de edições manuais do item 3 ganha, na rota `glossario`, um link para cá: hoje ela
diz *"resolve-se na varredura de consistência"* e não tem para onde apontar.

## 7. Emenda — o resíduo parkeado do item 3

A revisão final do item 3 deixou um achado parkeado que esta entrega leva junto, por ser
pequeno e por afetar o caminho principal desta obra.

Quando o refinamento do prompt roda **só com edições manuais** e nenhum caso recorrente —
o que passou a ser possível, e é o cenário provável aqui (146 edições contra 25 casos) —
o prompt sai com um cabeçalho órfão:

```
### Casos recorrentes do banco de testes:

### Correções que o revisor fez à mão (a IA nunca soube)
- ZH: …
```

`usuarioRefinarPrompt` (`server/src/ia/prompts.ts`) empurra o cabeçalho de casos
incondicionalmente, e `sistemaRefinarPromptPartes` está ancorado em casos: *"Com base nos
casos que virão…"* e *"secao_regra (o identificador dos casos que a motivaram)"* — mas o
objeto `edicoes` não carrega `secao_regra` nenhum.

Conserto: o cabeçalho de casos só sai quando há casos; o bloco de sistema descreve as
**duas** fontes possíveis e diz o que fazer quando só há edições (propor `secao_regra`
novo, descritivo do padrão observado, em vez de citar um identificador que não existe).

## 8. Testes

1. **Agrupamento por termo**: duas frases sem o mesmo termo saem num grupo só, não em dois.
2. **Ordenação**: o termo com mais violações vem primeiro.
3. **Dispensa respeitada**: par (frase, termo) dispensado não aparece na varredura da obra.
4. **Termo curto ignorado**: termo de 1 caractere não gera violação e entra na contagem
   `termos_curtos_ignorados` — o filtro que já existe continua valendo no nível da obra.
5. **Só frases traduzidas**: frase com `status_traducao` diferente de `'traduzida'` não é
   examinada.
6. **Gatilho — criar termo**: cadastrar um termo que falta em frases antigas muda
   `consistencia_violacoes` dos capítulos afetados, de `0` para `N`.
7. **Gatilho — apagar termo**: apagar o termo devolve a contagem a zero.
8. **Gatilho — substituir**: depois do `substituir`, a contagem do capítulo cai.
9. **Importação recalcula uma vez**: importar 20 termos deixa as contagens certas.
10. **Prompt sem casos**: `usuarioRefinarPrompt` com `casos: []` e `edicoes` preenchidas
    **não** emite o cabeçalho de casos; com `casos` preenchidos, emite.

## 9. Riscos

**O recálculo em toda mutação do glossário.** São 10–38 ms por chamada, mas a curadoria é
o fluxo com mais escritas por minuto do app — aceitar 20 termos sugeridos em sequência
dispara 20 recálculos. Mitigação: a importação de CSV recalcula uma vez ao fim; para o
resto, 38 ms por clique está dentro do que uma rota já gasta em I/O. Se algum dia
incomodar, o caminho é agrupar por transação, não abandonar o recálculo.

**A tela pode nascer vazia e ficar vazia.** Hoje são zero violações. A tela precisa
dizer *quando* a varredura rodou, senão "nenhuma violação" e "nunca varri" ficam
indistinguíveis — que é exatamente o defeito que este spec existe para consertar, e seria
irônico reproduzi-lo na tela nova.

**Falso positivo por omissão legítima.** `varrerConsistencia` acusa quando o termo chinês
está na origem e o canônico não está no português. Mas o português omite o referente já
estabelecido em vez de repetir — e é por isso que a dispensa por par (frase, termo) já
existe. A tela da obra tem de oferecer a dispensa com o mesmo peso do conserto, senão o
revisor aprende a ignorar a lista inteira.

## 10. Não-objetivos

- Nada de IA nesta entrega.
- Não se altera `varrerConsistencia`, nem o filtro de termos curtos, nem a heurística de
  flexão. O que muda é quem a chama e quando.
- Não se implementa varredura entre obras — o glossário é por obra e a consistência
  também.
- Não se toca no catálogo universal de erros zh→pt-BR: spec próprio.
