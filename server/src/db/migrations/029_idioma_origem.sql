-- Perfil de idioma de origem por obra, e Alfa ativo por perfil.
--
-- Até aqui o aplicativo só traduzia do mandarim, e por isso nunca precisou
-- dizer isso: o idioma estava assumido no código, não gravado. Esta migração
-- torna o idioma um DADO — a obra escolhe o perfil, e o pipeline pergunta a ela.
--
-- Toda obra existente é mandarim, e todo Alfa existente é mandarim: os DEFAULT
-- abaixo garantem que nada muda de comportamento em banco já em uso.
ALTER TABLE obras ADD COLUMN idioma_origem TEXT NOT NULL DEFAULT 'zh'
  CHECK (idioma_origem IN ('zh','en'));

ALTER TABLE prompt_padrao ADD COLUMN idioma_origem TEXT NOT NULL DEFAULT 'zh'
  CHECK (idioma_origem IN ('zh','en'));

-- O ponto sensível da mudança. `idx_prompt_padrao_ativo` (migração 004) dizia
-- que existe UM núcleo ativo no banco inteiro. Com dois idiomas de origem isso
-- deixa de valer: o Alfa mandarim e o Alfa inglês estão ativos ao mesmo tempo,
-- cada um governando as obras do seu perfil. A unicidade continua existindo,
-- mas por idioma.
DROP INDEX idx_prompt_padrao_ativo;
CREATE UNIQUE INDEX idx_prompt_padrao_ativo_por_idioma
  ON prompt_padrao(idioma_origem, ativo) WHERE ativo = 1;

-- Nota sobre `prompt_padrao.versao`, que é UNIQUE desde a 004 e continua sendo:
-- a numeração do mandarim fica intocada (1.0, 2.0, …) e a do inglês nasce
-- prefixada ("EN 1.0"), em vez de reconstruir a tabela só para tornar a chave
-- composta. Reconstruir custaria mexer nas FKs de `prompts.nucleo_id` e
-- `capitulos.nucleo_id` — risco real sobre histórico de tradução — para ganhar
-- uma estética em campo que é identificador de exibição.
