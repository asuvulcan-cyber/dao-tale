# 18 — Como classificar um termo do glossário

Os quatro campos que aparecem ao clicar **✎** num termo: **Espécie**, **Nota de uso**,
**Gatilho ambíguo** e **Termo pai**. Este guia usa termos reais da 死人经.

Nenhum deles é obrigatório. Termo sem espécie se comporta como antes de os campos
existirem — o padrão nunca muda o que já funcionava.

---

## Espécie — uma pergunta decide

> **Se o texto escrever essa palavra de outro jeito — plural, feminino, minúscula —
> continua certo?**

**Não, a forma É a resposta → `identidade`.**
O termo aponta **um** referente. "Gu Shenwei" não vira "gu shenwei"; "Cidade de Jade" não
vira "cidades de jade".

**Sim, o que importa é a palavra → `lexical`.**
Você escolheu **qual palavra** usar para um conceito comum. `刀 → sabre` quer dizer "sabre,
não faca, não espada" — mas "sabres" e "Sabre" são o mesmo acerto.

### O desempate, quando os dois parecem caber

> **Existe UM na obra, ou vários?**

Um só → identidade. Vários → lexical.

`金鹏堡` é uma fortaleza específica: identidade. `刀` são muitos sabres: lexical.

### Aplicado ao seu glossário

**Quase toda a lista é `identidade`** — e é por isso que ela é o padrão de quem não
classifica:

| categoria | exemplos seus |
|---|---|
| personagem | `顾慎为 → Gu Shenwei`, `翠兰 → Cuilan` |
| local | `金鹏堡 → Fortaleza do Peng Dourado`, `璧玉城 → Cidade de Jade` |
| facção, entidade | `上官家 → família Shangguan`, `饕餮 → Taotie` |
| técnica nomeada | `八卦掌 → Palma dos Oito Trigramas`, `伏虎拳 → Punho que Subjuga o Tigre` |
| obra citada, bando | `千字文 → Clássico dos Mil Caracteres`, `飞鹰帮 → Bando da Águia Voadora` |

**`lexical` é a minoria — e é onde está o ganho:**

| categoria | exemplos seus | por quê |
|---|---|---|
| objeto | `刀 → sabre`, `剑 → espada`, `枪 → lança` | substantivos comuns; flexionam |
| posto/cargo | `刀手 → Homem de Sabre`, `喽罗 → Capanga`, `小头目 → Chefe Menor` | há vários; "Homens de Sabre" é a mesma coisa |
| conceito genérico | `内功 → arte de energia interna` | descreve o que é, não quem |

O ganho está aqui porque `lexical` é o que **libera a forma**: o modelo para de copiar a
caixa e o número em que o termo está cadastrado.

> **Cuidado com a categoria `titulo-cargo`.** Ela mistura os dois: `韩院管 → Administrador
> Han` designa uma pessoa (identidade), enquanto `喽罗 → Capanga` é uma classe (lexical). A
> categoria não decide a espécie.

---

## Nota de uso — só quando o par `zh → pt` não basta

Uma linha, e vale nas duas espécies. Serve para dois casos:

**Quando capitalizar**, se o termo tem uso duplo:
> *"Maiúscula só quando for o posto na Fortaleza."*

**Quando o termo se aplica**, se o gatilho tem outro sentido:
> *"Só é a criada Xiao Xin quando for nome de pessoa; nos demais usos é substantivo comum."*

### A regra que não pode ser quebrada

**A nota diz QUANDO o termo se aplica. Nunca como traduzir o resto.**

❌ *"…senão é 'cuidado'."* — isso fixa uma palavra para o outro sentido, e o modelo passa a
escrever "cuidado" onde "cautela" ou "atenção" servem melhor. Vira um glossário
clandestino: uma tradução imposta que não passou pela espécie, não aparece na lista e
ninguém revisa.

✅ *"…nos demais usos é substantivo comum."* — delimita o território e devolve o resto ao
tradutor.

Se o sentido comum merecer mesmo tradução fixa, ele é **outra entrada** do glossário, com
espécie própria.

**Na dúvida, deixe vazio.** Nota é texto pago em toda chamada, e a espécie já carrega a
instrução principal.

---

## Gatilho ambíguo — quando o chinês engana

Marque quando o gatilho chinês **frequentemente não é este termo**.

O caso da obra: `小心 → Xiao Xin` é o nome de uma criada, mas 小心 é também a expressão
comum de cuidado. Em 8 frases traduzidas, **só 1 era a personagem**.

**O teste:** abra cinco frases em que o gatilho aparece. Se a maioria não for este termo,
marque.

O que acontece ao marcar: o termo sai da **contagem** de consistência — que erraria a maior
parte das vezes — e vai para uma lista de conferência caso a caso. Ele não some: você ainda
precisa ver se escreveu o nome certo quando ele **é** o nome.

Marcar um termo que não é ambíguo desliga uma checagem útil. Na dúvida, não marque.

---

## Termo pai — pertencimento, não variante

**Termo pai** = este termo fica **dentro** daquele.

Nos seus dados: `东堡 → Forte Leste` e `北堡 → Forte Norte` são partes de
`金鹏堡 → Fortaleza do Peng Dourado`. O pai deles é a Fortaleza.

Serve para uma coisa concreta: quando um trecho cita só `西堡`, o filtro leva `金鹏堡`
junto, para o modelo saber que um fica dentro do outro. **Um nível acima, nunca a raiz.**

### Não confunda com "variante"

| campo | significa | exemplo |
|---|---|---|
| **Termo pai** | faz parte de | `东堡` fica dentro de `金鹏堡` |
| **Variante** | é a mesma coisa, com outro nome | `芊芊` e `林芊` são a mesma pessoa |

Um termo pode ter os dois.

---

## Por onde começar

Não classifique 139 termos de uma vez. O contador no topo e o filtro **"só não
classificados"** existem para isso.

1. Comece pelos **objetos e postos** — é onde `lexical` muda o resultado.
2. Depois os **títulos e formas de tratamento**, que é onde a caixa oscila.
3. **Personagens e lugares podem esperar:** já se comportam como `identidade` por padrão.

Marcar explicitamente ainda vale (tira do contador e documenta a decisão), mas não muda o
prompt enquanto nenhum termo for `lexical` — sem um `lexical` para contrastar, a lista sai
sem os blocos, como sempre saiu.
