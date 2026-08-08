-- A revisão vira conversa: fio de réplicas, terceiro veredito e recusa com motivo.
--
-- Três mudanças precisam de rebuild (o SQLite não altera CHECK nem NOT NULL), então
-- vão juntas — padrão da migração 002/007.
--
-- `resposta` nasce com o valor de `justificativa`: o texto que existe É a resposta que
-- houve, e assim o histórico não aparece vazio na tela nova.
--
-- `secao_regra = 'geral'` vira NULL. "Geral" quer dizer, no próprio contrato, "nenhuma
-- regra específica se aplica" — contá-lo como recorrência agrupava coisas sem relação
-- (5 casos na 死人经, 3 deles contando como lacuna sistemática). `recorrencias` já exige
-- IS NOT NULL, então a exclusão sai de graça.
--
-- A auto-referência aponta para `banco_testes` (o nome FINAL), não para a tabela _novo:
-- o SQLite não resolve alvo de FK no CREATE, e assim o schema já sai correto do RENAME
-- em vez de depender de o rename reescrever a referência.

CREATE TABLE banco_testes_novo (
  id                 INTEGER PRIMARY KEY,
  frase_id           INTEGER NOT NULL REFERENCES frases(id) ON DELETE CASCADE,
  obra_id            INTEGER NOT NULL REFERENCES obras(id)  ON DELETE CASCADE,
  -- Turno anterior do fio. NULL = raiz (a pergunta original).
  caso_pai_id        INTEGER REFERENCES banco_testes(id) ON DELETE CASCADE,
  trecho_zh          TEXT NOT NULL,
  pergunta           TEXT NOT NULL,
  veredito           TEXT NOT NULL CHECK (veredito IN ('correto','incorreto','escolha-legitima')),
  -- Trata do motivo declarado na pergunta. É o texto que o revisor lê primeiro.
  resposta           TEXT NOT NULL DEFAULT '',
  -- Só existe quando uma REGRA decide o caso; par natural de secao_regra.
  justificativa      TEXT NOT NULL DEFAULT '',
  secao_regra        TEXT,
  correcao_proposta  TEXT,
  trecho_pt_errado   TEXT,
  trecho_pt_corrigido TEXT,
  status             TEXT NOT NULL DEFAULT 'pendente'
                     CHECK (status IN ('confirmado','corrigido','pendente','regra-nova-necessaria','rejeitado')),
  -- Por que o revisor recusou o veredito. É o único lugar do app onde ele diz
  -- por escrito que a IA errou — entra como insumo do refinamento do prompt.
  motivo_rejeicao    TEXT,
  provedor           TEXT NOT NULL,
  modelo             TEXT NOT NULL,
  resposta_bruta     TEXT NOT NULL,
  criado_em          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO banco_testes_novo
  (id, frase_id, obra_id, caso_pai_id, trecho_zh, pergunta, veredito, resposta, justificativa,
   secao_regra, correcao_proposta, trecho_pt_errado, trecho_pt_corrigido, status,
   motivo_rejeicao, provedor, modelo, resposta_bruta, criado_em)
  SELECT id, frase_id, obra_id, NULL, trecho_zh, pergunta, veredito,
         justificativa,
         justificativa,
         CASE WHEN secao_regra = 'geral' THEN NULL ELSE secao_regra END,
         correcao_proposta, trecho_pt_errado, trecho_pt_corrigido, status,
         NULL, provedor, modelo, resposta_bruta, criado_em
  FROM banco_testes;

DROP TABLE banco_testes;
ALTER TABLE banco_testes_novo RENAME TO banco_testes;

CREATE INDEX idx_testes_obra_status ON banco_testes(obra_id, status);
CREATE INDEX idx_testes_secao       ON banco_testes(obra_id, secao_regra);
CREATE INDEX idx_testes_pai         ON banco_testes(caso_pai_id);
