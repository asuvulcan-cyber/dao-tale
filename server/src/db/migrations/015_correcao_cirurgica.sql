-- Par cirúrgico da correção de revisão.
--
-- Aplicar uma correção trocava a frase INTEIRA pela proposta, e isso destruiu
-- conteúdo em casos reais na 死人经: numa frase de três orações o modelo devolveu
-- só a que consertou (as outras duas sumiram), e numa fala devolveu o texto sem
-- as aspas de diálogo. O contrato já pedia "a frase COMPLETA corrigida" — o
-- modelo é que não obedece de forma confiável, então a correção passa a ser
-- ancorada no menor trecho que muda, e tudo fora dele fica intocado.
--
-- NULL nos casos antigos: eles continuam aplicando pelo caminho da frase
-- inteira, agora com aviso e confirmação.
ALTER TABLE banco_testes ADD COLUMN trecho_pt_errado TEXT;
ALTER TABLE banco_testes ADD COLUMN trecho_pt_corrigido TEXT;
