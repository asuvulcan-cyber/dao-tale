-- Prompt em camadas (doc 08): a tabela prompts passa a distinguir a cópia
-- completa legada ('completo') do delta por obra ('delta' = só a Seção 6,
-- composto com o núcleo ativo da tabela prompt_padrao no momento do job).
ALTER TABLE prompts ADD COLUMN tipo TEXT NOT NULL DEFAULT 'completo'
  CHECK (tipo IN ('completo','delta'));
-- Núcleo sobre o qual o delta foi escrito (informativo; a composição usa
-- sempre o núcleo ativo do momento).
ALTER TABLE prompts ADD COLUMN nucleo_id INTEGER REFERENCES prompt_padrao(id);

-- Proveniência: qual versão do núcleo o job de tradução usou (par com prompt_id).
ALTER TABLE capitulos ADD COLUMN nucleo_id INTEGER REFERENCES prompt_padrao(id);
