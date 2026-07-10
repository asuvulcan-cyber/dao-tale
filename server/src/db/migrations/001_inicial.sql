CREATE TABLE obras (
  id               INTEGER PRIMARY KEY,
  titulo           TEXT NOT NULL,
  titulo_original  TEXT,
  provedor_padrao  TEXT,
  modelo_padrao    TEXT,
  criado_em        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE prompts (
  id           INTEGER PRIMARY KEY,
  obra_id      INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  versao       TEXT NOT NULL,
  conteudo     TEXT NOT NULL,
  notas_versao TEXT,
  ativo        INTEGER NOT NULL DEFAULT 0,
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (obra_id, versao)
);
CREATE UNIQUE INDEX idx_prompt_ativo_por_obra ON prompts(obra_id) WHERE ativo = 1;

CREATE TABLE capitulos (
  id            INTEGER PRIMARY KEY,
  obra_id       INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  numero        INTEGER NOT NULL,
  titulo        TEXT,
  status        TEXT NOT NULL DEFAULT 'rascunho'
                CHECK (status IN ('rascunho','traduzindo','revisado','finalizado')),
  texto_origem  TEXT NOT NULL,
  provedor      TEXT,
  modelo        TEXT,
  prompt_id     INTEGER REFERENCES prompts(id),
  criado_em     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (obra_id, numero)
);

CREATE TABLE frases (
  id                    INTEGER PRIMARY KEY,
  capitulo_id           INTEGER NOT NULL REFERENCES capitulos(id) ON DELETE CASCADE,
  ordem                 INTEGER NOT NULL,
  paragrafo             INTEGER NOT NULL,
  texto_zh              TEXT NOT NULL,
  texto_pt              TEXT NOT NULL DEFAULT '',
  texto_pt_original_ia  TEXT,
  editado_manualmente   INTEGER NOT NULL DEFAULT 0,
  status_traducao       TEXT NOT NULL DEFAULT 'pendente'
                        CHECK (status_traducao IN ('pendente','traduzida','erro')),
  UNIQUE (capitulo_id, ordem)
);
CREATE INDEX idx_frases_capitulo ON frases(capitulo_id, ordem);

CREATE TABLE glossario (
  id         INTEGER PRIMARY KEY,
  obra_id    INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  termo_zh   TEXT NOT NULL,
  termo_pt   TEXT NOT NULL,
  categoria  TEXT NOT NULL DEFAULT 'outro'
             CHECK (categoria IN ('local','poder-habilidade','entidade','titulo-cargo','personagem','outro')),
  nota       TEXT,
  origem     TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','sugerido-ia')),
  criado_em  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (obra_id, termo_zh)
);

CREATE TABLE termos_sugeridos (
  id          INTEGER PRIMARY KEY,
  obra_id     INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  capitulo_id INTEGER NOT NULL REFERENCES capitulos(id) ON DELETE CASCADE,
  termo_zh    TEXT NOT NULL,
  termo_pt    TEXT NOT NULL,
  categoria   TEXT,
  contexto    TEXT,
  status      TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aceito','rejeitado')),
  criado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE banco_testes (
  id                 INTEGER PRIMARY KEY,
  frase_id           INTEGER NOT NULL REFERENCES frases(id) ON DELETE CASCADE,
  obra_id            INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  trecho_zh          TEXT NOT NULL,
  pergunta           TEXT NOT NULL,
  veredito           TEXT NOT NULL CHECK (veredito IN ('correto','incorreto')),
  justificativa      TEXT NOT NULL,
  secao_regra        TEXT,
  correcao_proposta  TEXT,
  status             TEXT NOT NULL DEFAULT 'pendente'
                     CHECK (status IN ('confirmado','corrigido','pendente','regra-nova-necessaria')),
  provedor           TEXT NOT NULL,
  modelo             TEXT NOT NULL,
  resposta_bruta     TEXT NOT NULL,
  criado_em          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_testes_obra_status ON banco_testes(obra_id, status);
CREATE INDEX idx_testes_secao ON banco_testes(obra_id, secao_regra);

CREATE TABLE configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
