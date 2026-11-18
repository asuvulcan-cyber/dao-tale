# 28 · Perfis de idioma de origem

> Implementado em 2026-09-22. Substitui o pressuposto implícito de que toda obra
> vem do mandarim.

## 1. O problema

O Dao Tale nasceu só com mandarim e, por isso, nunca precisou dizer isso em lugar
nenhum. Não havia coluna de idioma no banco nem campo na API: o mandarim estava
**assumido** em cerca de quinze pontos, cada um decidindo por conta própria e do
seu jeito.

O inventário de antes da mudança:

- **quatro** regexes Han diferentes para "isto é chinês" — `一-鿿` (U+4E00) na
  interface e no provedor simulado, `㐀-鿿` (U+3400) na revisão literária. As
  duas discordavam sobre a Extensão A;
- casamento de glossário por `includes` + contagem de caractere, em cinco sítios;
- máquina de estados de segmentação com pontuação e aspas CJK;
- "chinês" e `ZH:` escritos à mão em ~20 pontos dos prompts;
- `texto-zh` fixo em ~30 pontos da interface;
- um único núcleo (Alfa) ativo no banco inteiro.

## 2. A ideia

**Cada idioma de origem é um perfil completo.** Tudo que estava espalhado e
implícito passa a ser uma entrada só, explícita. O que existia virou o *perfil
mandarim*; o *perfil inglês* nasceu ao lado dele como par, não como exceção.

A obra escolhe o perfil (`obras.idioma_origem`), e o pipeline pergunta a ela.

O teste da arquitetura: **somar um terceiro idioma deve ser escrever dois
arquivos**, não caçar `if` pelo código.

O perfil é **ortogonal às camadas do prompt** (doc 15). Ele não é uma camada
nova — *seleciona* qual Alfa vale, do mesmo jeito que a obra seleciona seu Delta.

## 3. Onde o perfil mora

Em duas metades, porque `shared` é puro e os dois lados o importam, enquanto
segmentador e Alfa são de servidor. As duas juntas são o perfil; **nenhuma
decisão de idioma mora fora delas.**

| Metade | Arquivo | Conteúdo |
|---|---|---|
| Pura | `shared/src/idiomaOrigem.ts` | `rotulo`, `sigla`, `bcp47`, `tipografia`, `juntarFrases`, `ehDaOrigem`, `casaTermo`, `termoCurtoDemais`, `termoContem` |
| Servidor | `server/src/idiomas/index.ts` | `segmentar`, `detectores`, `extrairTermoSimulado` |

## 4. O que cada perfil decide

| Decisão | Mandarim | Inglês |
|---|---|---|
| Segmentação | pontuação CJK, aspas `「」『』` | ponto ambíguo (`Mr.`, `J. R. R.`), aspas simétricas |
| Alfa | `NUCLEO_ANTI_DILUICAO_V4` / candidato 6.4 | `NUCLEO_EN_PT` |
| Casamento de glossário | substring; termo < 2 caracteres é curto | **limite de palavra**; termo < 2 caracteres é curto |
| Remontagem de parágrafo | frases coladas (sem espaço) | frases separadas por espaço |
| "Precisa traduzir?" | tem caractere Han | campo preenchido (ver §6) |
| Catálogo de erros | sim (aferido) | **não existe ainda** |
| Sinais bilíngues | sim | **não existe ainda** |
| Unidades da origem | chi, cun, zhang, li, jin… | pés, milhas, libras, °F |
| Escrita vazada | faixa Han | **não se aplica** |
| Tipografia | pilha CJK, entrelinha 1.9 | corpo de leitura, entrelinha 1.6 |

A distinção que importa nas três linhas em negrito: `false`/`null` ali **não** é
"o detector deu zero", é "esta varredura não existe para esta origem". A tela
tem de dizer isso, e não mostrar resultado vazio.

## 5. O que mudou de comportamento

Uma coisa só, de propósito: as quatro faixas Han viraram **uma**, a mais larga
(`㐀-鿿`). A faixa estreita classificava a Extensão A — ideogramas raros mas
legítimos — como "não é chinês".

Tudo o mais do caminho mandarim é byte a byte o de antes, e é a suíte inalterada
que prova isso.

## 6. Decisões e o porquê

**Os campos `_zh` ficaram.** `texto_zh`, `termo_zh`, `trecho_zh` passam a
significar "texto de origem"; o sufixo é histórico. Renomear custaria migração de
cinco tabelas, bump do formato `dao-tale-export` e ~431 sítios — risco sobre
histórico de tradução para ganhar um nome. O mesmo vale para a classe CSS
`.texto-zh`.

**O casamento de glossário por limite de palavra foi conserto, não cosmética.**
Com a regra do mandarim, `art` casa dentro de `start` e `go` dentro de `good`: a
varredura de consistência acusaria a obra inglesa inteira.

**Unidade da origem é dado do perfil, não detector do mandarim.** O inglês tem
pés e milhas escapando pela mesma razão. Mas a regex inglesa **não** exige
numeral antes, e a mandarim exige: `li` também é palavra portuguesa ("eu li o
livro"), e sem o numeral acusaria meio capítulo. `acre` ficou de fora da lista
inglesa por ser a exceção simétrica.

**`no` não entra na lista de abreviações inglesas.** Em prosa, `"no."` fechando
uma fala é ordens de grandeza mais frequente que "No. 5", e listá-lo fazia a
frase seguinte grudar na fala. Abreviação rara perdida custa uma frase mal
segmentada; palavra comum listada custa todas.

**O inglês não tenta adivinhar se o texto já está em português.** As duas línguas
dividem o alfabeto latino, e não há heurística honesta. Quem decide é quem colou
o texto: o botão de traduzir aparece com o campo preenchido.

**O Alfa inglês usa marcadores próprios** (`{{PREFERENCIAS_OBRA_EN}}`,
`{{CHECKLIST_FINAL_EN}}`) em vez de uma v4 dos existentes. Assim `comporOmega`
ganhou dois `replace` em vez de ramificar por idioma, e nenhum byte dos Alfas
mandarins históricos mudou.

**A tipografia vem de variável CSS, não de classe por idioma.** `.texto-zh`
aparece em ~30 pontos de quinze arquivos; a classe continua uma só e lê
`var(--fonte-origem)`, que o container da obra define. Trocar a classe em cada
sítio daria o mesmo resultado com trinta chances de esquecer um.

## 7. O Alfa ativo por perfil

O ponto estrutural. Até a migração 029, `idx_prompt_padrao_ativo` garantia **um**
núcleo ativo no banco inteiro. Agora a unicidade é por idioma:

```sql
CREATE UNIQUE INDEX idx_prompt_padrao_ativo_por_idioma
  ON prompt_padrao(idioma_origem, ativo) WHERE ativo = 1;
```

`reposPromptPadrao.ativo(db, idioma)` passou a exigir o idioma — a assinatura
mudou de propósito, para o compilador apontar cada chamador em vez de a mudança
passar em silêncio num `WHERE ativo = 1` que agora casa duas linhas.

`prompt_padrao.versao` continua UNIQUE no banco inteiro: a numeração mandarim
ficou intocada (1.0, 2.0…) e a inglesa nasce prefixada ("EN 1.0"). Reconstruir a
tabela para tornar a chave composta custaria mexer nas FKs de `prompts.nucleo_id`
e `capitulos.nucleo_id`.

## 8. Somar um terceiro idioma

1. `shared/src/idiomaOrigem.ts`: um `PerfilIdioma` novo e a entrada em
   `PERFIS_IDIOMA`; o id entra em `IDIOMAS_ORIGEM`.
2. `server/src/idiomas/index.ts`: um `PerfilServidor` com segmentador,
   detectores e recorte do simulado.
3. Um segmentador em `server/src/segmentacao/`, com a bateria espelhando
   `segmentar.test.ts`.
4. Um Alfa em `promptPadraoInicial.ts`, com marcadores próprios, semeado em
   `db/index.ts`.
5. Migração de uma linha, ampliando o `CHECK` de `obras.idioma_origem` e
   `prompt_padrao.idioma_origem`.

Nada fora disso. Se algo mais precisar mudar, é sinal de que uma decisão de
idioma vazou do perfil — e o lugar dela é aqui.

## 9. Fora de escopo

Catálogo de erros en→pt e sinais bilíngues ingleses. A regra que governa o
catálogo (`shared/src/catalogoErros.ts`) exige número medido em corpus real, e
não há corpus inglês ainda. O perfil já tem o lugar reservado
(`detectores.catalogo: false`); quando houver capítulos traduzidos,
`server/scripts/aferir-catalogo.ts` mede e a chave vira `true`.
