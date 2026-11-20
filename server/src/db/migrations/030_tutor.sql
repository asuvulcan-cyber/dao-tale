-- Modo tutor de idioma (doc 29).
--
-- `eventos_ia.papel` ganha 'tutor': explicar uma frase e corrigir a tentativa de
-- quem aprende têm custo próprio, e misturá-lo com a revisão esconderia quanto o
-- estudo pesa no limite do plano. CHECK não se altera no SQLite: rebuild, padrão
-- da 023 (que também é a última a ter mexido nesta tabela).

CREATE TABLE eventos_ia_novo (
  id                   INTEGER PRIMARY KEY,
  em                   TEXT NOT NULL DEFAULT (datetime('now')),
  data                 TEXT NOT NULL,
  obra_id              INTEGER REFERENCES obras(id)     ON DELETE SET NULL,
  capitulo_id          INTEGER REFERENCES capitulos(id) ON DELETE SET NULL,
  papel                TEXT NOT NULL CHECK (papel IN
                         ('traducao','revisao','qa','extracao','refinamento','titulo','comparador','estilo','tutor')),
  provedor             TEXT NOT NULL,
  modelo               TEXT NOT NULL,
  tokens_entrada       INTEGER,
  tokens_saida         INTEGER,
  tokens_cache_leitura INTEGER,
  tokens_cache_criacao INTEGER,
  custo_estimado       REAL,
  modelo_resolvido     TEXT
);

INSERT INTO eventos_ia_novo
  (id, em, data, obra_id, capitulo_id, papel, provedor, modelo,
   tokens_entrada, tokens_saida, tokens_cache_leitura, tokens_cache_criacao, custo_estimado,
   modelo_resolvido)
  SELECT id, em, data, obra_id, capitulo_id, papel, provedor, modelo,
         tokens_entrada, tokens_saida, tokens_cache_leitura, tokens_cache_criacao, custo_estimado,
         modelo_resolvido
  FROM eventos_ia;

DROP TABLE eventos_ia;
ALTER TABLE eventos_ia_novo RENAME TO eventos_ia;

CREATE INDEX idx_eventos_ia_obra     ON eventos_ia(obra_id, em);
CREATE INDEX idx_eventos_ia_capitulo ON eventos_ia(capitulo_id);
CREATE INDEX idx_eventos_ia_dia      ON eventos_ia(data, provedor);

-- Uma linha por frase estudada. `texto_origem` é o original NA ÉPOCA da
-- explicação: se a frase for dividida ou mesclada e o texto mudar, a explicação
-- guardada deixa de valer (a rota descarta em vez de explicar outra frase).
CREATE TABLE tutor_frases (
  frase_id      INTEGER PRIMARY KEY REFERENCES frases(id) ON DELETE CASCADE,
  texto_origem  TEXT NOT NULL,
  explicacao    TEXT,              -- JSON (ExplicacaoTutor)
  dicas_vistas  INTEGER NOT NULL DEFAULT 0 CHECK (dicas_vistas BETWEEN 0 AND 3),
  tentativa     TEXT,
  correcao      TEXT,              -- JSON (CorrecaoTutor) da última tentativa corrigida
  tentativas    INTEGER NOT NULL DEFAULT 0,
  salva_em      TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Vocabulário de quem aprende, com o estado da repetição espaçada. Uma palavra
-- é única por idioma: adicionar de novo (de outra frase, de outra obra) não zera
-- o progresso dela.
CREATE TABLE vocabulario (
  id              INTEGER PRIMARY KEY,
  idioma          TEXT NOT NULL CHECK (idioma IN ('zh','en')),
  termo           TEXT NOT NULL,
  leitura         TEXT,
  significado     TEXT NOT NULL,
  nota            TEXT,
  exemplo_origem  TEXT,
  exemplo_pt      TEXT,
  obra_id         INTEGER REFERENCES obras(id)  ON DELETE SET NULL,
  frase_id        INTEGER REFERENCES frases(id) ON DELETE SET NULL,
  criado_em       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  intervalo_dias  INTEGER NOT NULL DEFAULT 0,
  facilidade      REAL NOT NULL DEFAULT 2.5,
  repeticoes      INTEGER NOT NULL DEFAULT 0,
  proxima_revisao TEXT NOT NULL,   -- data local AAAA-MM-DD
  ultima_revisao  TEXT,            -- data local AAAA-MM-DD
  total_revisoes  INTEGER NOT NULL DEFAULT 0,
  total_erros     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (idioma, termo)
);
CREATE INDEX idx_vocabulario_revisao ON vocabulario(idioma, proxima_revisao);
