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

A vitrine serve para o dono **mandar o link** a quem ele quiser; aparecer em buscador é outra
decisão, e bem mais difícil de desfazer do que de tomar (cache de buscador sobrevive à
despublicação). São duas medidas, e é preciso as duas:

| Medida | O que faz |
|---|---|
| `GET /robots.txt` → `Disallow: /` | pede que o buscador **não leia** as páginas |
| `X-Robots-Tag: noindex, nofollow` em toda resposta | manda o buscador **não indexar** |

Parecem redundantes e não são. `Disallow` impede a *varredura*, não a *indexação*: uma URL
citada em outro site pode entrar no resultado de busca mesmo sem nunca ter sido lida — a
armadilha clássica de quem confia só no `robots.txt`. O cabeçalho é a instrução explícita de
não indexar, e vale para o crawler que chegar por qualquer caminho.

Para liberar buscadores um dia, é preciso desfazer **as duas** (e o `Disallow` primeiro: um
crawler que não pode ler a página nunca vê o cabeçalho que a libera).

Nada disso é cadeado — orienta quem respeita a convenção. Quem quiser raspar o site, raspa.
O que protege o material inédito não é isto: é o §2.

---

## 7. Trava de IP na bancada

A senha responde *quem é você*. A lista de IPs responde *de onde você pode nem tentar*. Elas
empilham: quem está fora da lista não vê a bancada nem com a senha certa.

```sh
npm run ips                          # o que está permitido hoje
npm run ips -- permitir 189.5.4.3    # um endereço
npm run ips -- permitir 2804:14d:baa::/48   # uma faixa (IPv6 doméstico muda o final sozinho)
npm run ips -- remover 189.5.4.3
npm run ips -- desligar              # esvazia = volta a aceitar de qualquer lugar
```

A lista vive em `<dados>/ips-permitidos.json` (0600) e é **relida a cada requisição**:
acrescentar um IP vale na hora, sem reiniciar o serviço.

**A resposta a quem está de fora é `404` sem corpo.** Não é 403 e não tem mensagem — a
pedido, e é a escolha certa: um 403 com texto anuncia que existe uma lista, o que só ensina
o visitante a tentar de outro lugar. Para quem está fora, a bancada não existe. A interface
acompanha: `GET /api/sessao` devolve `pode_entrar: false` e a vitrine deixa de desenhar o
botão *entrar*; a rota `/entrar` redireciona para a estante sem mostrar campo de senha.

### As três defesas contra se trancar do lado de fora

Esta é a funcionalidade com maior chance de virar contra o dono. IP residencial muda
sozinho, e dado móvel muda o tempo todo (CGNAT).

1. **Lista vazia = trava desligada.** É o padrão, e é o estado de quem atualiza a versão:
   ninguém acorda trancado porque instalou o app novo.
2. **Loopback sempre passa.** Quem está *dentro* da máquina nunca é barrado — é por ali que
   se conserta, e é o que faz o `npm run ips` funcionar mesmo com a lista errada.
3. **Só se administra por SSH.** Não há tela no app para editar a própria lista de acesso,
   de propósito: dá para se expulsar e perder a chave junto.

Preso do lado de fora? SSH na máquina e:

```sh
cd /opt/dao-tale
sudo -u daotale DAO_TALE_DIR=/var/lib/dao-tale npm run ips -- permitir $(curl -s https://api.ipify.org)
```

> **Prefira faixa a endereço exato.** `189.5.4.0/24` ou `2804:14d:baa::/48` sobrevive à
> troca de IP dentro da mesma operadora/região; `189.5.4.3` te tranca no dia em que o modem
> reiniciar. E lembre que a trava não protege contra quem estiver na *sua* faixa.

### O que a trava resolve de quebra

O teto global de 30 tentativas por 15 minutos do freio de login (doc 13 §3) era um botão de
incômodo que qualquer estranho podia apertar: gastar as 30 e deixar o dono sem conseguir
entrar. Com a lista ligada, quem está fora recebe 404 **antes** do freio e não gasta
tentativa nenhuma — o teto global passa a contar só quem já tem permissão de chegar.

---

## 8. O que este passo NÃO faz

- **Nenhum controle de banda.** Só o login tem freio. Um visitante insistente consegue bater
  bastante na vitrine, e o `better-sqlite3` é síncrono. Para uso pessoal, com o endereço
  circulando entre conhecidos, é aceitável; se um dia o link viralizar, o freio entra aqui.
- **Sem comentários, sem contas, sem contador de leitura.** Nada que aceite escrita de fora.
- **Sem download.** EPUB, PDF e Markdown continuam atrás da senha. A vitrine é leitura na
  tela; distribuir arquivo é outra decisão.
- **Sem capítulo agendado.** Publicar é agora ou não é.

---

## 9. Verificação executada

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
