# 13 — Hospedagem single-tenant (Fase B)

Passo 7 do plano da Nave Mãe, escopo **Fase B** de `visao-produto`. **Objetivo único:
acessar o meu próprio Dao Tale de fora de casa (celular), com segurança.**

Um usuário: eu. Sem contas de terceiros, sem cobrança, sem catálogo público — isso é
Fase C e continua futura. O modo local/desktop de hoje **não muda em nada**.

> ⚠️ Este passo expõe à internet uma aplicação que gasta cota real de API e guarda todo
> o trabalho de tradução. A postura é **fail-closed**: se a configuração de hospedagem
> estiver incompleta (sem senha, sem domínio, sem segredo), o servidor **recusa subir**.
> Nunca existe um estado "no ar e aberto".

---

## 1. O bloqueio a reconciliar

`server/src/rotas/protecaoLocal.ts` (doc 10 §3) rejeita com 403 **todo** `Host` não-loopback,
inclusive em GET. Atrás de um domínio, 100% das rotas `/api` morrem. Ele resolvia um
problema real (CSRF/DNS-rebinding numa app sem autenticação nenhuma) com a única trava
disponível: "só loopback é confiável".

Hospedado, a confiança muda de eixo: **não é mais o endereço que autentica, é a sessão**.
O middleware vira `protecaoOrigem` com dois modos, e o "só loopback" continua sendo a
regra inteira no modo local.

| | `local` (padrão, como hoje) | `hospedado` |
|---|---|---|
| `Host` aceito | loopback (`127.0.0.1`/`localhost`/`[::1]`) | loopback **+** domínios de `DAO_TALE_HOST_PUBLICO` |
| `Origin` em POST/PUT/PATCH/DELETE | loopback (se houver header) | precisa existir **e** estar na allowlist |
| Sessão | nenhuma (usuário é dono da máquina) | **obrigatória em toda `/api`** |
| Cookie | — | `HttpOnly` + `Secure` + `SameSite=Lax` |

Regressão coberta: os testes atuais de `protecaoLocal` continuam valendo palavra por
palavra no modo local (é o padrão, e nenhum teste define `DAO_TALE_MODO`).

---

## 2. Modo de operação por configuração

`DAO_TALE_MODO=local|hospedado` (ausente = `local`). No boot, em `hospedado`, `index.ts`
exige — e aborta com mensagem clara se faltar:

1. `DAO_TALE_HOST_PUBLICO` com ao menos um hostname (lista separada por vírgula);
2. senha definida (`<dados>/auth.json` existe e é válido);
3. segredo de sessão (env `DAO_TALE_SESSAO_SEGREDO` ou `<dados>/sessao.chave`, gerado
   automaticamente com 32 bytes aleatórios e `chmod 0600` na primeira subida).

Efeito colateral bom: `ehInstanciaCanonica()` passa a ser `true` em modo hospedado
(lá o `DAO_TALE_DIR=/var/lib/dao-tale` é *o* diretório real, não uma instância de teste) —
senão a tarja "instância de teste" ficaria acesa para sempre no VPS.

Continua tudo por env, sem tocar no banco: `DAO_TALE_DIR`, `DAO_TALE_PORTA` e o lockfile
do Passo 4 funcionam exatamente como hoje.

---

## 3. Autenticação single-user

**Zero dependência nova** — `node:crypto` já tem tudo.

**Senha em repouso:** `scrypt(N=2^15, r=8, p=1)` com sal de 16 bytes por instalação,
guardada em `<dados>/auth.json` com modo `0600`:

```json
{ "algoritmo": "scrypt", "n": 32768, "r": 8, "p": 1,
  "sal": "<base64>", "hash": "<base64>", "geracao": 1, "definida_em": "<ISO>" }
```

Comparação com `timingSafeEqual`. Senha em texto **nunca** é escrita em disco nem em log.

**Como se define:** `npm run senha` (novo CLI, `server/src/auth/senha-cli.ts`) — pergunta
duas vezes com eco desligado, exige ≥ 12 caracteres, grava o arquivo. Roda por SSH no VPS.
Não existe senha no código, nem no repositório, nem em variável de ambiente.

**Sessão sem tabela:** token assinado (HMAC-SHA256 sobre `versão.geração.expiração`,
`base64url`), verificado com `timingSafeEqual`. Stateless de propósito: reiniciar o
serviço **não** desloga o celular (o contrário seria insuportável no uso real), e a
revogação existe mesmo assim — trocar a senha incrementa `geracao` e derruba todas as
sessões antigas. Validade 30 dias, com renovação deslizante quando falta menos de 15.

**Cookie:** `dao_tale_sessao`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age`.
`Lax` (e não `Strict`) para que abrir o link do celular a partir de outro app já chegue
logado; contra CSRF quem responde é a checagem de `Origin` em métodos mutantes (§1) —
`Lax` já não envia cookie em POST cross-site.

**Rate-limit do login** (`server/src/auth/limite.ts`, em memória):

- atraso progressivo antes de responder erro: `250 ms × falhas`, teto 3 s;
- por IP: 5 falhas em 15 min → `429` com `Retry-After` até a janela expirar;
- global: 30 falhas em 15 min → `429` para todos (freio contra tentativa distribuída;
  incomoda só a mim, e por 15 minutos);
- sucesso zera os contadores daquele IP.

IP do cliente vem de `X-Forwarded-For` **apenas** em modo hospedado (atrás do nosso proxy
em loopback); no modo local, do socket.

**Rotas novas** (`server/src/rotas/sessao.ts`, registradas **antes** do middleware de sessão):

| Rota | O quê |
|---|---|
| `GET /api/sessao` | pública: `{ modo, autenticado, senha_definida }` — só isso, sem caminho de dados |
| `POST /api/sessao` | login `{ senha }` → `Set-Cookie` + `{ ok: true }`; erro genérico ("senha incorreta") |
| `DELETE /api/sessao` | logout: expira o cookie |

Todo o resto de `/api/*` — inclusive `/api/saude`, que expõe caminho de dados — passa a
exigir sessão em modo hospedado. Sem sessão: `401 { erro: { codigo: 'nao-autenticado' } }`.

O bundle da SPA (`web/dist`) continua servido sem sessão: é código público, não dado.
Sem cookie, a única coisa que a interface consegue desenhar é a tela de login.

---

## 4. TLS obrigatório: Caddy na frente

O Hono continua ouvindo **só em `127.0.0.1`** (o bind de hoje). Quem fala com a internet é
o Caddy, que resolve Let's Encrypt sozinho, renova sozinho e manda HSTS por padrão:

```caddyfile
tale.exemplo.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8317
}
```

É o arquivo inteiro (`deploy/Caddyfile`). O Caddy preserva o `Host` original, que é
exatamente o que a allowlist de §1 verifica, e acrescenta `X-Forwarded-For`/`-Proto`.
Como o servidor de aplicação nunca escuta em endereço público, não existe caminho em
claro: sem 443, não há Dao Tale.

Cabeçalhos de resposta acrescentados pela própria app (não dependem do proxy):
`X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`,
`Content-Security-Policy: frame-ancestors 'none'`.

> Se um dia o login "entrar e voltar para a tela de login", a causa quase certa é acesso
> por `http://` sem TLS: o cookie é `Secure` e o navegador simplesmente não o guarda. Isso
> é proposital — não existe chave de escape para servir em claro.

**Armadilha do `caddy validate`:** rodar a validação como `root` **cria** o arquivo de log
declarado no Caddyfile, com dono `root`. Depois o serviço, que roda como `caddy`, não
consegue abrir o próprio log e morre com `permission denied` — em um arquivo cujo
*diretório* está com o dono certo, o que despista. Se acontecer:
`chown caddy:caddy /var/log/caddy/dao-tale.log`.

### 4.1 Quando o VPS já tem um proxy (Traefik, Nginx, Dokploy…)

Foi o caso real do primeiro deploy: a máquina já rodava um Dokploy, e o **Traefik dele era
o dono das portas 80 e 443**, com outras aplicações em produção atrás. Instalar o Caddy ali
não é uma questão de configuração — é uma disputa por porta que **derruba o que já está no
ar**. A regra é: *quem chegou primeiro na 443 continua sendo o dono; o Dao Tale entra por
ele.*

Dois ajustes bastam.

**1. O app precisa escutar onde o proxy o enxergue.** O padrão é `127.0.0.1`, e um proxy em
container **não alcança o loopback do host** — para ele, `127.0.0.1` é ele mesmo. Daí o
`DAO_TALE_BIND`, que aponta o bind para a ponte do Docker:

```sh
DAO_TALE_BIND=172.17.0.1     # gateway de docker0, visível dos containers
```

`172.17.0.1` é endereço de interface do host: não é roteável da internet, então a porta
continua fechada de fora (confira com um TCP de fora, não com `ufw status`). Como `docker0`
só existe depois que o Docker sobe, a unit precisa de um drop-in:

```ini
# /etc/systemd/system/dao-tale.service.d/docker.conf
[Unit]
After=docker.service
Wants=docker.service
```

**2. Uma rota no proxy.** O Traefik do Dokploy observa `/etc/dokploy/traefik/dynamic/`:
soltar o arquivo lá basta, e **não se deve recarregar o Traefik** (piscaria as outras
aplicações à toa). O modelo está em `deploy/traefik-dao-tale.yml.exemplo`; o que não pode
faltar é `passHostHeader: true`, senão a allowlist de §1 responde 403 a tudo.

> **`ufw` em máquina com Docker é armadilha.** O Docker escreve as regras dele no iptables
> antes da cadeia que o `ufw` governa: ligar o `ufw` **não fecha** uma porta publicada por
> container (um `0.0.0.0:3306->3306` continua aberto para a internet inteira) e ainda pode
> cortar o caminho host↔container de que o proxy depende. Porta publicada se fecha **onde
> foi publicada** — no container — ou num firewall fora da máquina.

---

## 5. Deploy reproduzível (systemd)

`deploy/dao-tale.service` + `deploy/dao-tale.env.exemplo`. Sem Docker: `better-sqlite3` é
nativo e o keyring é opcional — uma unit systemd é mais simples e mais fácil de auditar.

```ini
[Service]
Type=simple
User=daotale
StateDirectory=dao-tale                      # cria /var/lib/dao-tale com dono certo
EnvironmentFile=/etc/dao-tale/dao-tale.env   # 0600, fora do repositório
ExecStart=/usr/bin/npm -w server run start
Restart=on-failure
KillSignal=SIGTERM                           # dispara o shutdown limpo do Passo 4
TimeoutStopSec=20
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
```

Env de produção (o arquivo `0600`, nunca versionado):

```sh
DAO_TALE_MODO=hospedado
DAO_TALE_HOST_PUBLICO=tale.exemplo.com
DAO_TALE_DIR=/var/lib/dao-tale
DAO_TALE_PORTA=8317
# DAO_TALE_SESSAO_SEGREDO=  # opcional; sem isto, gerado em <dados>/sessao.chave
```

Backup automático, rotação, `integrity_check`, lockfile e shutdown limpo vêm de graça do
Passo 4; a restauração continua sendo `npm run restaurar`.

### Passo a passo, VPS limpo (Debian/Ubuntu)

> **Antes de começar, confira que o VPS está mesmo limpo:** `ss -tlnp | grep -E ':80 |:443 '`
> e `docker ps`. Se algo já ocupa 80/443, **pule o Caddy** e siga §4.1 — o primeiro deploy
> real quase derrubou um bot em produção exatamente aqui.

```sh
# 1. Sistema e usuário de serviço (sem shell, sem home)
sudo apt update && sudo apt install -y git curl unattended-upgrades

#    ⚠️ CADDY não está nos repositórios do Ubuntu 22.04 — precisa do oficial:
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

#    ⚠️ CHROMIUM no Ubuntu vem como SNAP, e snap não funciona sob a unit
#    endurecida (ProtectSystem=strict, PrivateTmp). Use o .deb do Google:
curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
  | sudo gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg
echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] \
  https://dl.google.com/linux/chrome/deb/ stable main' \
  | sudo tee /etc/apt/sources.list.d/google-chrome.list
sudo apt update && sudo apt install -y google-chrome-stable
#    (é só para o PDF; sem ele a rota /pdf devolve 503 e o HTML segue valendo)
sudo adduser --system --group --no-create-home --shell /usr/sbin/nologin daotale

# 2. Node 22 — EXIGÊNCIA, não preferência: o gerador de PDF fala DevTools
#    Protocol pelo WebSocket embutido, que só existe a partir do 22.
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Código em /opt/dao-tale
sudo git clone https://github.com/asuvulcan-cyber/dao-tale.git /opt/dao-tale
cd /opt/dao-tale && sudo npm ci && sudo npm run build
sudo chown -R daotale:daotale /opt/dao-tale

# 4. Configuração (0600, fora do repositório)
sudo install -d -m 0700 /etc/dao-tale
sudo install -m 0600 deploy/dao-tale.env.exemplo /etc/dao-tale/dao-tale.env
sudo nano /etc/dao-tale/dao-tale.env          # trocar o domínio

# 5. Pasta de dados e SENHA (antes de qualquer coisa subir)
sudo install -d -m 0700 -o daotale -g daotale /var/lib/dao-tale
sudo -u daotale DAO_TALE_DIR=/var/lib/dao-tale npm run senha

# 6. Serviço
sudo cp deploy/dao-tale.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now dao-tale
systemctl status dao-tale                     # deve dizer "Modo hospedado"

# 7. TLS
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile                # trocar o domínio
sudo systemctl reload caddy                   # certificado sai automático

# 8. Firewall: só 443 (e 80, que o Let's Encrypt usa) + SSH
sudo ufw allow 22/tcp && sudo ufw allow 80,443/tcp && sudo ufw enable
```

**Atualizar depois:** `cd /opt/dao-tale && sudo -u daotale git pull && sudo -u daotale npm ci
&& sudo -u daotale npm run build && sudo systemctl restart dao-tale`. O `SIGTERM` do restart
faz checkpoint do WAL e libera o lock; a sessão do celular sobrevive (o token não depende
do processo).

**Chaves de API:** o VPS não tem keyring do SO, então caem no `credenciais.json` `0600` do
diretório de dados (o fallback que já existia). Cadastre-as pela tela de Configurações,
depois do primeiro login — nunca por variável de ambiente.

**Correção de aresta encontrada agora:** `restaurar-cli.ts` decide "o app está no ar?" pelo
`GET /api/saude` respondendo `ok`. Em modo hospedado essa rota passa a devolver `401`, e o
CLI concluiria "não está no ar" — e restauraria o banco por baixo de um servidor vivo. Vai
passar a consultar o **lockfile do Passo 4** (`lerLock` + `processoVivo`), que é o sinal
correto e não depende de HTTP.

---

## 5.1 A produção real — onde ela fica

Anotado depois de eu mesmo bater no servidor errado duas vezes em 2026-08-06.

| | |
|---|---|
| Domínio | `daotale.illusia.com.br` |
| **Host** | **`103.199.186.52`, porta 22 padrão** |
| Acesso | `ssh -i ~/.ssh/dao_tale root@103.199.186.52` |
| Aplicação | `/opt/dao-tale` — **não é repositório git**, o deploy é cópia de arquivos |
| Dados | `/var/lib/dao-tale` (banco, backups, credenciais, auth) |
| Serviço | unit `dao-tale`, roda como usuário `daotale` |

**Cuidado — há outro VPS Hostinger no `known_hosts`:** `86.38.190.94:65002`. Não é este.
Duas tentativas de chave falharam ali antes de alguém pensar em resolver o DNS, e VPS
Hostinger costuma ter fail2ban — insistir no host errado bloqueia o IP de quem tenta.
Na dúvida: `getent hosts daotale.illusia.com.br`.

**Não existe `sqlite3` instalado no servidor.** Para inspecionar o banco, use o `node` com
o `better-sqlite3` que já está em `/opt/dao-tale/node_modules`, sempre com
`{ readonly: true }`.

**Atualizar:** `npm run subir` (o `git pull` citado acima nunca funcionou aqui — a pasta
não é repositório). O script roda testes e tipos antes, faz backup **verificado** do banco,
envia por rsync sem tocar em `*.db`, reinicia e confere que o núcleo ativo reserva a Seção 5.
`npm run subir -- --seco` mostra o que mudaria sem enviar nada.

---

## 6. Segredos e superfície

- `credenciais.json` (fallback sem keyring, já `0600`) e `sessao.chave` (`0600`) vivem em
  `/var/lib/dao-tale`, fora do repositório; `auth.json` idem. Nenhum entra em commit —
  `.gitignore` ganha as três entradas por precaução.
- **Nada de segredo em log:** teste automatizado que faz login (certo e errado) capturando
  `console.log`/`console.error` e afirma que nem a senha, nem o hash, nem o token, nem o
  segredo aparecem na saída. `GET /api/sessao` e `/api/configuracoes` não devolvem hash.
- Cota de API: quem tem sessão sou eu; se a senha vazar, o prejuízo é gasto real de cota —
  daí a senha longa e o rate-limit acima serem o item de segurança mais importante do passo.

### Checklist do box

- [ ] firewall: só `22`, `80` e `443` abertos (`ufw status`);
- [ ] SSH por chave — `PasswordAuthentication no` e `PermitRootLogin no` em
      `/etc/ssh/sshd_config`;
- [ ] `unattended-upgrades` ligado (o box vai ficar meses sem eu olhar);
- [ ] `ss -tlnp` mostra o Node **só** em `127.0.0.1:8317` — nunca `0.0.0.0`;
- [ ] `ls -l /var/lib/dao-tale` → `auth.json`, `sessao.chave` e `credenciais.json` em `0600`,
      dono `daotale`; a pasta em `0700`;
- [ ] `/etc/dao-tale/dao-tale.env` em `0600` e **sem senha dentro**;
- [ ] `git status` limpo — nenhum desses arquivos versionado (o `.gitignore` cobre todos);
- [ ] `journalctl -u dao-tale | grep -i senha` não devolve nada além de mensagens de
      configuração.

---

## 7. Mobile

- `/ler` é o uso principal no celular. A barra do leitor tem 7 controles em linha
  (‹ Obra · título · ☰ · A−/A+ · largura · 中 · tema) — em 360 px isso espreme o título a
  zero. Vira: título + ☰ sempre visíveis, o resto recolhido num menu de ajustes em telas
  estreitas (o `MenuMais` que já existe), tudo intacto no desktop.
- Login desenhado mobile-first (campo grande, `autocomplete="current-password"`,
  `inputmode` correto) — é a primeira tela do celular.
- Casca de admin: navegação e a tarja de instância verificadas em viewport estreito;
  botão **Sair** aparece só em modo hospedado.

---

## 8. O que este passo NÃO faz

Multiusuário, contas, convites, cobrança, catálogo público, BYOK, Postgres, fila
distribuída. Tudo isso é Fase C e depende de decisões que continuam abertas em
`visao-produto`. Aqui não entra nenhuma linha de código que só faça sentido com mais de
um usuário.

---

## 9. Verificação executada

Não há VPS nesta máquina (nem docker/podman/caddy instalados), então a verificação simulou
a forma exata da produção: instância descartável (`DAO_TALE_DIR=/tmp/…`, tudo em provedor
`mock` conforme `dao-tale-dir-nao-isola-chaves` — **zero chamada de IA paga**), servidor em
modo hospedado ouvindo só em loopback e subido como **unit systemd de usuário**, e um
**proxy TLS** (Node + certificado autoassinado) no papel do Caddy, terminando HTTPS e
encaminhando com `Host: tale.local` e `X-Forwarded-*` preservados.

| # | O quê | Resultado |
|---|---|---|
| 1 | `npm run senha` num pty, digitação real | senha gravada, **não ecoada** na tela, `auth.json` `0600`, sem texto claro dentro |
| 2 | Boot hospedado sem senha e sem domínio | **recusa subir**, lista as duas faltas, `exit 1` |
| 3 | `GET /api/obras` por HTTPS sem cookie | `401 nao-autenticado` |
| 4 | `GET /api/saude` sem cookie | `401` (caminho de dados protegido) |
| 5 | `GET /api/sessao` sem cookie | `200 {modo, autenticado:false, senha_definida:true}`, `no-store` |
| 6 | `GET /` sem cookie | `200 text/html` — a SPA carrega só para desenhar o login |
| 7 | 6 senhas erradas seguidas | `401`×5 → **`429` com `Retry-After: 898`** |
| 8 | Senha certa | `200` + `Set-Cookie … HttpOnly; Secure; SameSite=Lax`; cabeçalhos `nosniff`, `frame-ancestors 'none'`, `same-origin` |
| 9 | Com cookie: `GET /api/obras`, `/api/saude`, `PUT /api/configuracoes` | `200` / `200` / `200` (e `canonico: true` no modo hospedado) |
| 10 | `Host: tale.local.atacante.net` com cookie válido | `403 origem-bloqueada` |
| 11 | `PUT` com `Origin: https://site-malicioso.example` | `403` |
| 12 | `PUT` sem `Origin` | `403` |
| 13 | `systemctl restart` e reusar o cookie | `200` — reiniciar o serviço **não** desloga o celular |
| 14 | Logout | `Set-Cookie … Max-Age=0`; requisição seguinte `401` |
| 15 | Journal do serviço | senha, hash, sal e segredo de sessão: **nenhum aparece** |
| 16 | `SIGTERM` pelo systemd | shutdown limpo do Passo 4, lockfile removido |
| 17 | `npm run restaurar` com o app no ar | **recusa** (PID/porta do lockfile) — o bug que a auth teria criado |
| 18 | Modo local em paralelo (outra pasta/porta) | `GET`/`POST` sem cookie → `200`/`201`, `/api/sessao` → `modo: local, autenticado: true`, tarja de instância de teste intacta |
| 19 | `/ler` a 360 px, `/` a 360 px, login a 360 px (Chromium headless) | leitor legível com ajustes no menu "Aa" (aberto via CDP), navegação da casca quebrando em duas linhas sem estouro lateral, login centrado |
| 20 | `/ler` a 1280 px | inalterado — todos os controles em linha, como antes |

O `Caddyfile` não é executável aqui (Caddy não está instalado); fica documentado e é a
configuração padrão de quatro linhas.

**Testes automatizados: 224 → 275 verdes** (+51), typecheck limpo nos dois workspaces.
Nenhum dos 224 anteriores precisou de alteração — só o arquivo de testes da proteção de
origem foi renomeado junto com o módulo, mantendo os casos palavra por palavra.
