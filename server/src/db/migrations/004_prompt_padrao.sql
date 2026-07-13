-- Prompt padrão global: usado como ponto de partida quando a obra ainda não
-- tem prompt mãe próprio. Mesmo modelo de versões imutáveis da tabela prompts.
CREATE TABLE prompt_padrao (
  id           INTEGER PRIMARY KEY,
  versao       TEXT NOT NULL UNIQUE,
  conteudo     TEXT NOT NULL,
  notas_versao TEXT,
  ativo        INTEGER NOT NULL DEFAULT 0,
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX idx_prompt_padrao_ativo ON prompt_padrao(ativo) WHERE ativo = 1;
