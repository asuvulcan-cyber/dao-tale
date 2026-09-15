// Deriva do snapshot final vigente um eval idêntico, mudando somente o trecho
// candidato do Alfa. Não consulta nem grava o banco.
// Uso: node server/scripts/preparar-eval-alfa-6-4.mjs ENTRADA.json SAIDA.json

import crypto from 'node:crypto';
import fs from 'node:fs';

const [entrada, saida] = process.argv.slice(2);
if (!entrada || !saida) {
  console.error('Uso: node server/scripts/preparar-eval-alfa-6-4.mjs ENTRADA.json SAIDA.json');
  process.exit(2);
}
const serializado = fs.readFileSync(entrada, 'utf8');
const documento = JSON.parse(serializado);
if (documento.esquema !== 'dao-tale-eval-literaria-v1' || documento.provisoria) {
  throw new Error('A entrada precisa ser um eval literário final não provisório.');
}
const antigo = '**Prioridade em conflito:** Gama (glossário aplicável) > conteúdo do original > Beta > Delta > naturalidade. Gama decide termos; Beta decide convenções; Delta contém apenas particularidades desta obra.';
const candidato = '**Responsabilidades:** original = sentido e tom; Gama = forma do termo quando aplicável; Beta = convenções editoriais; Delta = exceções específicas da obra. Entre soluções compatíveis, escolha a mais natural em PT-BR. Nenhuma camada autoriza contrariar o original.';
if (!documento.ambiente.omega.includes(antigo)) throw new Error('O snapshot não contém o trecho-base esperado do Alfa 6.3.');
const ressalvaAntiga = '*(Regras desta seção têm precedência sobre as demais quando conflitarem — exceto o glossário, que é lei acima de todas as camadas.)*';
const ressalvaCandidata = '*(Aplique cada regra somente ao escopo declarado. O original continua a decidir sentido e tom, e o Gama a forma dos termos. Uma exceção explícita desta seção prevalece apenas sobre a convenção Beta correspondente.)*';
if (!documento.ambiente.omega.includes(ressalvaAntiga)) throw new Error('O snapshot não contém a ressalva-base esperada do Delta.');

const origemSha256 = crypto.createHash('sha256').update(serializado).digest('hex');
const ambienteBase = {
  ...documento.ambiente,
  omega: documento.ambiente.omega.replace(antigo, candidato).replace(ressalvaAntiga, ressalvaCandidata),
  alfa: { versao: '6.4-candidata', base: documento.ambiente.alfa },
};
delete ambienteBase.sha256;
const ambiente = {
  ...ambienteBase,
  sha256: crypto.createHash('sha256').update(JSON.stringify(ambienteBase)).digest('hex'),
};
const derivado = {
  ...documento,
  gerado_em: new Date().toISOString(),
  derivado_de_sha256: origemSha256,
  candidato: { camada: 'alfa', versao: '6.4-candidata', alteracao: 'responsabilidades sem precedência contraditória' },
  ambiente,
};
const resultado = JSON.stringify(derivado, null, 2) + '\n';
fs.writeFileSync(saida, resultado);
console.log(JSON.stringify({ saida, casos: derivado.casos.length, ambiente_sha256: ambiente.sha256, sha256: crypto.createHash('sha256').update(resultado).digest('hex') }));
