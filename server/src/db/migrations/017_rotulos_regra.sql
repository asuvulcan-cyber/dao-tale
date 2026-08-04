-- Marcador da unificação de rótulos de regra do banco de testes.
--
-- A unificação em si NÃO cabe em SQL: a regra de equivalência ("5-mais-que-
-- perfeito" == "5.estilo-mais-que-perfeito") vive em `normalizarSecaoRegra`, no
-- shared, e é a mesma que o agrupamento e a convergência na gravação usam. SQLite
-- não tem como reproduzir aquilo sem duplicar a lógica — e duplicá-la seria criar
-- exatamente o tipo de divergência que este conserto existe para acabar.
--
-- Então a migração só registra que o passo é devido; quem executa é
-- `unificarRotulosDeRegra`, chamada em `abrirBanco` logo depois das migrações.
INSERT INTO configuracoes (chave, valor) VALUES ('rotulos_regra_unificados', '0')
  ON CONFLICT (chave) DO NOTHING;
