-- Backfill de `frases.origem_edicao` para os botões que já existiam antes da coluna.
--
-- A migração 023 gravou origem_edicao = NULL em toda frase, com a justificativa de
-- que "nenhuma delas veio de um botão que ainda não existia". Isso é falso para
-- dois botões: `reposTestes.aplicarCorrecao` (aceitar a correção da revisão) e
-- `reposQa.aplicarSugestao` (aceitar sugestão de QA) já existiam muito antes da
-- 023 e já gravavam editado_manualmente = 1 — só não tinham onde registrar a
-- origem, porque a coluna não existia.
--
-- Sem este backfill, uma frase corrigida por um desses botões entra DUAS vezes no
-- mesmo prompt pago de refinamento: uma como caso do banco de testes (ou
-- apontamento de QA) e outra lida por `classificarEdicoes` como "correção que o
-- revisor fez à mão" — exatamente o dano que origem_edicao existe para evitar, e
-- que acontece já no primeiro uso desta função sobre uma obra real.
--
-- O vínculo de volta está no próprio banco: `banco_testes.frase_id` é NOT NULL e
-- o caso aceito fica com status = 'corrigido'; `qa_apontamentos.frase_id` é
-- nullable (nem todo apontamento tem frase associada) e o apontamento aceito fica
-- com status = 'aceito'. Só toca frase com origem_edicao ainda NULL — não
-- sobrescreve nada que já tenha sido gravado corretamente pelo código novo.

UPDATE frases SET origem_edicao = 'revisao'
  WHERE origem_edicao IS NULL
    AND id IN (SELECT frase_id FROM banco_testes WHERE status = 'corrigido');

UPDATE frases SET origem_edicao = 'qa'
  WHERE origem_edicao IS NULL
    AND id IN (SELECT frase_id FROM qa_apontamentos WHERE status = 'aceito' AND frase_id IS NOT NULL);
