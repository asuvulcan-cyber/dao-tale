# 15. As camadas do prompt — diagnóstico e proposta

> Documento de **trabalho**, escrito para ser executado num chat próprio. Ele registra o que
> foi medido em 2026-08-05 e propõe o desenho; nada aqui está implementado ainda, exceto o
> que estiver marcado como já existente.

---

## 1. O sintoma

*"Parece que o que eu estou vendo está repetitivo? desatualizado?"*

Estava certo, e a causa não era o desenho das camadas — era **duas instâncias em núcleos
diferentes**:

| | Local (`~/.local/share/dao-tale`) | VPS |
|---|---|---|
| Núcleo ativo | v5.0, enxuto, 6.204 c | **v1.0, o legado, 8.838 c** |
| Reserva a Seção 5? | sim | **não** |
| Preferências valem? | sim | **não — ignoradas em silêncio** |

O v1.0 tem a tabela de 18 proibições que **repete o corpo inteiro**, a árvore de 6 passos
para demonstrativos e a tabela de 9 partículas. É o "repetitivo". E como ele não traz o
marcador `{{PREFERENCIAS_OBRA}}`, `comporPromptMae` não injeta as chaves: a obra do VPS tem
`pensamento_tempo: "original"` gravado e recebe *"sempre no presente"* do núcleo.

**Lição que vale além deste caso:** duas instâncias com bancos independentes divergem, e a
divergência é silenciosa. Ver §6.

---

## 2. O princípio (a regra que o dono enunciou)

> O que está no Delta não pode estar no Beta nem no Alfa. O que está no Alfa não pode estar
> no Beta. Elas formam uma versão final única, completa e sem conflito.

Isto é uma **partição por tema**: cada tema pertence a exatamente uma camada. Não é só
higiene — é a diferença entre o modelo obedecer e o modelo escolher. Toda vez que duas
camadas falam do mesmo tema, quem decide é o modelo, e a decisão muda a cada chamada.

---

## 3. Nomes

Hoje a mesma coisa tem quatro nomes: *núcleo*, *prompt padrão*, *prompt padrão global*,
*prompt universal* — tabela `prompt_padrao`, constante `NUCLEO_ENXUTO`, doc
`08-prompt-universal.md`, rótulo de tela "Núcleo universal". Boa parte da sensação de estar
perdido vem daí, não da arquitetura.

| Nome | O que é | A pergunta que responde |
|---|---|---|
| **Alfa** | universal zh→pt-BR | *como se traduz do chinês sem decalque?* |
| **Beta** | preferências de estilo (chaves) | *quais convenções de casa esta obra segue?* |
| **Delta** | diretrizes da obra (texto livre) | *o que só existe nesta obra?* |
| **Ômega** | o composto que vai para a IA | — é a soma, não uma camada |

**Por que não "Gama" para o final:** no alfabeto grego γ vem **antes** de δ. Chamar o
resultado de Gama diz que ele vem antes do Delta, quando ele é a soma de tudo. **Ômega** é a
última letra: não há como confundir com camada.

**Por que Delta continua Delta:** o nome já está no banco (`prompts.tipo = 'delta'`), no
marcador `{{DELTA_OBRA}}` — que está **gravado dentro de cada versão de núcleo já existente,
e versões são imutáveis** — e no código. Renomear quebraria os núcleos antigos. Além disso
"delta" significa exatamente o que a camada é: o incremento.

O buraco em γ é proposital e informativo: **α, β, δ são entradas; Ω é a saída.**

---

## 4. Como decidir a que camada uma regra pertence

Três perguntas, em ordem. Pare na primeira que responder sim.

1. **Essa regra mudaria se eu traduzisse outro romance chinês?**
   Não → **Alfa**. (Ex.: 时辰 = 2 horas; 对方 não é "a outra parte".)
2. **É uma escolha estética com um oposto legítimo, que outra obra minha poderia querer ao
   contrário?**
   Sim → **Beta**. (Ex.: aspas ou travessão; pensamento no presente ou no original.)
3. **A regra nomeia algo que só existe nesta obra — personagem, vício de fala, topônimo?**
   Sim → **Delta**.

Se uma regra parece caber em duas, ela está mal escrita: quase sempre é uma regra Alfa com
um exemplo da obra grudado. Separe.

---

## 5. Estado atual: o que já protege, o que não protege

**Existe:**

1. `preferenciaQueCobre` (`shared/src/index.ts`) — impede que o refinamento por IA proponha
   regra de Delta sobre tema que é chave de Beta. Filtra **antes** de gastar a chamada.
2. O prompt de refinamento proíbe explicitamente esses temas (`ia/prompts.ts`).
3. A tela do prompt acende aviso vermelho quando o Alfa ativo não reserva a Seção 5.
4. `comporPromptMae` é determinístico — mesmos bytes para as mesmas versões (prompt caching).
5. A camada operacional do servidor (glossário, formato, protocolo) **não** repete regra de
   estilo. Conferida: limpa.

**Não existe:**

1. Nada confere o **Delta que o usuário digita**. Escrever "use travessão" com a chave em
   aspas passa liso. A guarda só vale para o que a IA propõe.
2. Nada confere um **Alfa novo**. Uma versão pode reintroduzir um tema de Beta e matar a
   chave em silêncio — que é literalmente o que o v1.0 faz.
3. Nada olha o **Ômega pronto**, que é o único lugar onde as três camadas se encontram.
4. Nenhum teste garante que o Alfa publicado no código não fale de tema de Beta.

---

## 6. O conflito estrutural achado (e ele é real)

O topo do Alfa declara:

> **Hierarquia, em caso de conflito:** Glossário > Conteúdo > Forma natural. O glossário é lei.

Mas o cabeçalho de Beta diz *"quando conflitarem com **as seções anteriores**, valem estas"*,
e o de Delta diz *"precedência **sobre as demais**"*. A Seção 2 (glossário é lei) **é** uma
seção anterior. Formalmente, uma chave de Beta derruba o glossário.

Não é hipótese: `nomes_proprios: mesclar` diz *"Pessoa: **sempre** em pinyin"*. Se o glossário
tiver um nome de pessoa em forma traduzida, as duas regras se contradizem e quem decide é o
modelo.

**Conserto:** a precedência das camadas precisa dizer *"exceto o glossário, que é lei acima
de todas"*. Uma linha em cada cabeçalho.

---

## 7. O que construir (proposta para o chat dedicado)

**Peça central: um registro de temas com dono.** Uma tabela em código — tema → camada dona →
como reconhecê-lo no texto. `preferenciaQueCobre` já é a versão embrionária disso (6 temas,
por regex sobre o rótulo da regra); generalizar para reconhecer tema em **texto corrido** de
qualquer camada.

Com ele, três checagens e um teste:

| Onde | O que faz |
|---|---|
| Ao salvar o **Delta** | avisa "isto é tema de Beta — resolve-se pela chave X" |
| Ao criar um **Alfa** | avisa "esta versão fala de tema de Beta" e "perdeu o marcador" |
| Sobre o **Ômega** | relatório: temas presentes, dono de cada um, sobreposições |
| Teste | o Alfa publicado no código não menciona nenhum tema de Beta |

Aviso, não bloqueio: o usuário é o dono e às vezes quer mesmo a exceção. O que não pode é a
sobreposição acontecer **sem ninguém ver**.

**Ordem sugerida:** (1) conserto da hierarquia do §6 — é uma linha e vale para tudo;
(2) registro de temas; (3) as três checagens; (4) resolver a divergência de instâncias (§8).

---

## 8. A questão das instâncias

Duas instâncias com bancos independentes **divergem sozinhas** — foi o que produziu o
sintoma do §1. Há dois desenhos coerentes:

**(a) Uma instância só.** O VPS é a bancada e a vitrine; o desktop vira apenas um navegador
apontado para ele. Elimina a classe inteira de problema: existe um Alfa, um Beta, um Delta.
Custo: migrar o banco local para o VPS uma vez, e depender da rede para trabalhar.

**(b) Separadas, com sincronização de verdade.** Local é a bancada e fonte da verdade; o VPS
só publica. Exige uma peça que **não existe**: `importarObra` sempre **cria obra nova**, nunca
atualiza — reimportar duplica a obra e troca o id, o que quebra o link público `/ler/:id`.
Sem essa peça, "separado" significa apagar e reimportar a cada publicação.

Recomendação: **(a)**, a menos que trabalhar offline seja requisito. A divergência silenciosa
já custou uma sessão inteira de confusão.
