# 14. Vitrine pública (Fase C)

> Fecha o pedido que ficou de pé desde o Passo 7: *"só minha conta sobe com chave; qualquer
> outra pessoa que acesse vê só o resultado, vê só o visual."*

O doc 13 pôs o app na internet **inteiro atrás de senha**. Isso resolveu o acesso remoto do
dono e deixou o app mudo para todo o resto do mundo. A vitrine abre uma fresta — uma só, e
do tamanho exato do pedido: **ler o que já está pronto**.

---

## 1. O que muda para quem chega

| Quem | O que vê em `https://…/` |
|---|---|
| Visitante | A **estante**: as obras publicadas, com capa, autor, tags e contagem de capítulos |
| Visitante em `/ler/:obra` | O **leitor**: o texto em português, tamanho de letra, largura e tema |
| Dono, depois de `/entrar` | A bancada de sempre, sem nada alterado |

Em **modo local** nada disso aparece: o servidor responde `autenticado: true`, o portão é
passa-direto e o desktop segue idêntico. A vitrine só existe onde existe senha.

---

## 2. As duas travas, e por que são duas

Publicar exige **os dois** sins, independentes:

1. **A obra** precisa estar marcada como pública (`obras.publica`, padrão `0`).
2. **O capítulo** precisa estar em `finalizado`.

Uma trava só não bastaria, e por motivos diferentes. Se bastasse marcar a obra, publicar
uma obra em andamento derramaria capítulos crus na rua a cada tradução — o pior tipo de
vazamento, o que acontece sozinho depois. Se bastasse o status do capítulo, todo capítulo
que o usuário finalizasse viraria público sem ninguém decidir nada.

`finalizado` foi escolhido em vez de `STATUS_LEGIVEIS` (que inclui `traduzido` e `revisado`)
porque é o único status que significa *uma pessoa leu isto e aprovou*. O modo leitura da
bancada é mais frouxo de propósito: lá o leitor é quem traduziu.

**O padrão é privado em toda porta de entrada**: obra nova, restauração de backup, import de
JSON antigo. `publica` nasce `0` e só muda por um `PUT` autenticado.

---

## 3. A superfície exposta, inteira

```
GET /api/publico/obras                          estante
GET /api/publico/obras/:id                      contracapa
GET /api/publico/obras/:id/capa                 imagem
GET /api/publico/obras/:id/capitulos            sumário
GET /api/publico/obras/:id/capitulos/:numero    o texto
```

Cinco rotas, todas `GET`, todas em `server/src/rotas/publico.ts`, todas registradas **antes**
de `exigirSessao` — o que faz desta lista, mais o login, a soma do que a internet alcança.

Três decisões dentro dela:

- **Capítulo endereçado por número, nunca por id.** Não existe URL pública que aceite chave
  primária, então não existe "e se eu chutar o id 4217?".
- **404 para obra privada, idêntico ao 404 de obra inexistente.** Um 403 confirmaria que a
  obra está ali.
- **Consultas em arquivo próprio** (`server/src/db/publico.ts`), sem `SELECT *` e com
  `publica = 1` escrito no SQL de cada uma. O `repos.ts` principal não é usado aqui: uma
  coluna nova em `obras` — custo, chave, nota interna — apareceria de graça se fosse.

Os tipos também são separados (`shared/src/publico.ts`). `Obra` carrega provedor, modelo,
temperatura, thinking e fase de tradução; `ObraPublica` carrega o que está na capa de um
livro. Reaproveitar o primeiro teria sido mais curto e é exatamente o erro que os testes de
`publico.test.ts` existem para pegar.

**O que não existe, e precisa de uma boa razão para passar a existir:** glossário, prompts,
telemetria, custos, exportação/EPUB/PDF, banco de testes, termos sugeridos, texto de origem
em chinês, e qualquer método que escreva.

---

## 4. O texto sai remontado

A vitrine devolve `paragrafos: string[]`, já colados pelo `remontarParagrafos` do servidor —
não a lista de frases. Frase é a unidade de *trabalho* (tem id, status, versão da IA, marca
de edição manual); parágrafo é a unidade de *leitura*. Mandar frases seria mandar a bancada
pelo cano e obrigar o cliente público a saber o que fazer com ela.

Efeito colateral bem-vindo: sem `texto_zh` no caminho, o modo bilíngue simplesmente não é
possível na vitrine. O original chinês não é republicado.

---

## 5. Dois roteadores, não um com `if`

`PortaoSessao` deixou de escolher entre *bancada* e *login* e passou a escolher entre
*bancada* e *vitrine*. Sem sessão, o React monta um `createBrowserRouter` **diferente**, que
não conhece `/configuracoes`, `/obras/:id` nem `/custos`; a rota `*` dele devolve para a
estante.

Isso é conveniência para o visitante, **não** é a trava — quem barra é `exigirSessao` no
servidor. Vale dizer em voz alta porque o contrário é uma armadilha comum: esconder o botão
no front e achar que fechou a porta.

`LeitorPublico.tsx` é primo do `Leitor.tsx` e **não** compartilha componente com ele. A
duplicação é deliberada e tem motivo de segurança: um ajuste no leitor de trabalho — mostrar
o chinês, marcar glossário, botão de exportar — não pode escorregar para a rua porque alguém
editou um componente comum. O que a rua vê cabe em um arquivo.

---

## 6. Publicar ≠ indexar

`GET /robots.txt` responde `Disallow: /`. A vitrine serve para o dono **mandar o link** a
quem ele quiser; aparecer em buscador é outra decisão, e bem mais difícil de desfazer do que
de tomar (cache de buscador sobrevive à despublicação). Para liberar, troque a linha em
`app.ts` por `Allow: /`.

`robots.txt` é convenção, não cadeado: ele orienta buscadores que o respeitam. Quem quiser
raspar o site, raspa. O que protege o material inédito não é isto — é o §2.

---

## 7. O que este passo NÃO faz

- **Nenhum controle de banda.** Só o login tem freio. Um visitante insistente consegue bater
  bastante na vitrine, e o `better-sqlite3` é síncrono. Para uso pessoal, com o endereço
  circulando entre conhecidos, é aceitável; se um dia o link viralizar, o freio entra aqui.
- **Sem comentários, sem contas, sem contador de leitura.** Nada que aceite escrita de fora.
- **Sem download.** EPUB, PDF e Markdown continuam atrás da senha. A vitrine é leitura na
  tela; distribuir arquivo é outra decisão.
- **Sem capítulo agendado.** Publicar é agora ou não é.

---

## 8. Verificação executada

`server/src/rotas/publico.test.ts` — 22 testes, todos sem cookie:

- obra nova nasce privada; obra privada e obra inexistente respondem **igual**
- capítulo `revisado` não sai nem pelo sumário nem pelo endereço direto, e o corpo da
  resposta não contém o texto dele
- a resposta pública não tem `provedor_padrao`, `modelo_padrao`, `temperatura`, `thinking`,
  `fase_traducao`, `publica`, nem datas
- o corpo do capítulo não contém o chinês, `texto_zh`, `capitulo_id` nem `status`
- `/api/obras`, `/api/configuracoes`, `/api/provedores`, `/api/saude`, o glossário da obra
  **publicada** e a exportação dela continuam em 401
- `POST`/`PUT`/`DELETE` em rota pública nunca respondem 2xx
- um estranho não consegue publicar obra nenhuma (401, e a coluna continua `0`)
- obra pública sem capítulo finalizado não aparece nem abre
- despublicar tira do ar na mesma requisição seguinte
- id malformado (`abc`, `-1`, `0`, `1e9999`) devolve 404, não 500
