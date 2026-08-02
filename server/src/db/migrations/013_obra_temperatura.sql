-- Doc 08 §13 — override de temperatura por obra.
--
-- Fica na OBRA, ao lado de provedor_padrao/modelo_padrao, e não na versão do
-- prompt: preferência de estilo é texto (entra no prompt, logo é versionada com
-- ele); temperatura é amostragem — não muda um byte do que é enviado, então
-- versioná-la só criaria versões de prompt idênticas entre si.
--
-- NULL = usar o padrão do papel, vindo das Configurações. Toda obra existente
-- fica NULL, isto é, sem mudança de comportamento.
ALTER TABLE obras ADD COLUMN temperatura REAL;
