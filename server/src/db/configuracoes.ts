// Schema das configurações globais e saneamento do que já está gravado.
//
// O schema mora aqui, e não na rota, por causa de um bug real: a auditoria A1
// baixou o teto de `tamanho_bloco` de 400 para 120 sem mexer nos valores já no
// banco. Instalações antigas ficaram com 400 gravado — o GET devolvia numa boa,
// mas a tela de Configurações reenvia a config INTEIRA ao salvar, o schema
// recusava com 400 e nada mais era salvo. Com o schema e o saneamento no mesmo
// módulo, apertar uma faixa já traz junto a correção dos valores existentes.

import { z } from 'zod';
import { NIVEIS_IDIOMA, PAPEIS_TEMPERATURA, PROVEDORES_IDS, TEMPERATURA_MAX } from '@dao-tale/shared';
import type { BancoDados } from './index.js';

export const configSchema = z.object({
  provedor_padrao: z.enum(PROVEDORES_IDS).optional(),
  modelo_padrao: z.string().optional(),
  // A1: teto alinhado à capacidade real de saída dos provedores (~8K tokens) —
  // acima disso o truncamento era garantido e cada bloco pagava 5 chamadas
  // fadadas a falhar. O job ainda divide o bloco sozinho se truncar.
  tamanho_bloco: z.number().int().min(1).max(120).optional(),
  vizinhas_revisao: z.number().int().min(0).max(10).optional(),
  cauda_contexto: z.number().int().min(0).max(20).optional(),
  parar_no_limite: z.boolean().optional(),
  glossario_relevante: z.boolean().optional(),
  // Modelo por papel: revisão pode usar um provedor/modelo de raciocínio
  // próprio ('' = usar a cadeia normal).
  provedor_revisao: z.enum(PROVEDORES_IDS).or(z.literal('')).optional(),
  modelo_revisao: z.string().max(120).optional(),
  // Contracapa (título/sinopse): 1 chamada por obra — cabe o melhor modelo.
  provedor_detalhes: z.enum(PROVEDORES_IDS).or(z.literal('')).optional(),
  modelo_detalhes: z.string().max(120).optional(),
  // Temperatura por papel (doc 08 §13): substitui a tabela inteira, como as
  // cotas e os preços. Chave ausente na leitura volta ao padrão do papel.
  temperaturas: z.record(z.enum(PAPEIS_TEMPERATURA), z.number().min(0).max(TEMPERATURA_MAX)).optional(),
  cotas_diarias: z.record(z.string(), z.number().int().min(0).max(1000000)).optional(),
  // Checkpoint de estabilidade (doc 09 §4): limiares do semáforo de liberação do lote.
  checkpoint_janela: z.number().int().min(1).max(50).optional(),
  checkpoint_termos_max: z.number().min(0).max(100).optional(),
  checkpoint_edicao_max: z.number().min(0).max(100).optional(),
  checkpoint_violacoes_max: z.number().min(0).max(100).optional(),
  // Lote / cruzeiro (doc 09 §5): paralelismo e cadeia de failover.
  lote_paralelo: z.number().int().min(1).max(8).optional(),
  failover: z
    .array(z.object({ provedor: z.enum(PROVEDORES_IDS), modelo: z.string().max(120) }))
    .max(6)
    .optional(),
  // QA por segunda IA (doc 09 §6): par próprio + automação opt-in.
  provedor_qa: z.enum(PROVEDORES_IDS).or(z.literal('')).optional(),
  modelo_qa: z.string().max(120).optional(),
  qa_automatica: z.boolean().optional(),
  // Tutor de idioma (doc 29): par próprio e nível de quem aprende, por idioma.
  provedor_tutor: z.enum(PROVEDORES_IDS).or(z.literal('')).optional(),
  modelo_tutor: z.string().max(120).optional(),
  nivel_idioma: z.object({ zh: z.enum(NIVEIS_IDIOMA), en: z.enum(NIVEIS_IDIOMA) }).partial().optional(),
  // Telemetria (doc 11 §3): preços em USD por 1M tokens, chave "provedor:modelo"
  // (curinga "provedor:*" aceito). Teto alto o bastante para qualquer modelo de
  // ponta e baixo o bastante para pegar dedo trocado (preço por 1k em vez de 1M).
  precos_modelos: z
    .record(
      z.string().max(140),
      z.object({
        entrada: z.number().min(0).max(1000),
        saida: z.number().min(0).max(1000),
        cache_leitura: z.number().min(0).max(1000).optional(),
        cache_criacao: z.number().min(0).max(1000).optional(),
      }),
    )
    .optional(),
  taxa_usd_brl: z.number().min(0).max(1000).optional(),
});

/** Erro de validação legível: `campo: motivo`, em vez do dump JSON que o zod
 *  usa como `.message` — essa string vai para a tela do usuário. */
export function mensagemDeValidacao(erro: z.ZodError): string {
  return erro.issues.map((i) => (i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
}

export interface AjusteConfig {
  chave: string;
  de: string;
  para: string;
}

/**
 * Encaixa os valores JÁ GRAVADOS nas faixas que o schema aceita HOJE, no boot.
 *
 * Escolhi saneamento no boot em vez de migração SQL numerada ou de um clamp na
 * leitura, por três motivos:
 *
 *  • As faixas vivem no zod, não no SQL — o saneamento LÊ o próprio schema, então
 *    apertar um teto amanhã já vem com o conserto dos dados de graça. Uma migração
 *    numerada congelaria o número de hoje e seria só mais um lugar para esquecer
 *    de atualizar, que é exatamente a causa do bug.
 *  • Roda em todo boot (e é idempotente), então também pega banco restaurado de
 *    backup antigo — coisa que uma migração de número fixo, já marcada como
 *    aplicada, não pegaria.
 *  • Conserta o dado em vez de mascarar na leitura: com o valor gravado dentro da
 *    faixa, qualquer caminho que releia e reenvie a config passa a valer.
 *
 * Preserva a intenção de quem configurou: encosta no limite mais próximo
 * (400 → 120), nunca devolve ao padrão de fábrica. Só mexe em chave que existe no
 * banco — chave ausente continua ausente e segue usando o padrão.
 */
export function sanearConfiguracoes(db: BancoDados): AjusteConfig[] {
  const linhas = db.prepare('SELECT chave, valor FROM configuracoes').all() as { chave: string; valor: string }[];
  const forma = configSchema.shape as Record<string, z.ZodTypeAny | undefined>;
  const ajustes: AjusteConfig[] = [];

  db.transaction(() => {
    const gravar = db.prepare('UPDATE configuracoes SET valor = ? WHERE chave = ?');
    for (const { chave, valor } of linhas) {
      const schema = forma[chave];
      if (!schema) continue; // flag interna (nucleo_migrado…) ou chave legada: não é nossa.
      const tipo = nomeDoTipo(desembrulhar(schema));
      let novo: string | null = null;

      if (tipo === 'ZodNumber') {
        const n = Number(valor);
        if (!Number.isFinite(n)) continue; // corrompido: numeroConfig() já devolve o padrão na leitura.
        const ajustado = ajustar(schema, n) as number;
        if (ajustado !== n) novo = String(ajustado);
      } else if (tipo === 'ZodObject' || tipo === 'ZodRecord') {
        let bruto: unknown;
        try {
          bruto = JSON.parse(valor);
        } catch {
          continue; // JSON corrompido: as guardas de leitura em repos.ts resolvem.
        }
        // Comparo o JSON reserializado com o reserializado, e não com o texto do
        // banco: diferença só de formatação não vale uma escrita a cada boot.
        const antes = JSON.stringify(bruto);
        const depois = JSON.stringify(ajustar(schema, bruto));
        if (depois !== antes) novo = depois;
      }
      // Texto, booleano e enum não têm faixa numérica para encostar.

      if (novo === null) continue;
      gravar.run(novo, chave);
      ajustes.push({ chave, de: valor, para: novo });
    }
  })();

  return ajustes;
}

// ── Leitura das faixas declaradas no schema ────────────────────────────────
// O zod 3 não expõe as faixas em API pública; elas ficam em `_def.checks`. O
// acesso está isolado nestes três helpers — se um upgrade de zod mudar a forma
// interna, é aqui que quebra (e os testes de saneamento pegam).

interface DefZod {
  typeName: string;
  innerType?: z.ZodTypeAny;
  valueType?: z.ZodTypeAny;
  checks?: { kind: string; value?: number }[];
}

const definicao = (schema: z.ZodTypeAny): DefZod => (schema as unknown as { _def: DefZod })._def;

const nomeDoTipo = (schema: z.ZodTypeAny): string => definicao(schema).typeName;

/** Tira as camadas de `.optional()`/`.nullable()`/`.default()` até o tipo de fato. */
function desembrulhar(schema: z.ZodTypeAny): z.ZodTypeAny {
  let atual = schema;
  for (let i = 0; i < 10; i += 1) {
    const def = definicao(atual);
    if (def.typeName !== 'ZodOptional' && def.typeName !== 'ZodNullable' && def.typeName !== 'ZodDefault') break;
    if (!def.innerType) break;
    atual = def.innerType;
  }
  return atual;
}

/** Encaixa `valor` nas faixas de `schema`, descendo por objetos e registros.
 *  Devolve valor novo só onde mudou; chave que o schema não conhece passa intacta. */
function ajustar(schema: z.ZodTypeAny, valor: unknown): unknown {
  const alvo = desembrulhar(schema);
  const def = definicao(alvo);

  if (def.typeName === 'ZodNumber') return ajustarNumero(def, valor);

  if (def.typeName === 'ZodObject' && valor !== null && typeof valor === 'object' && !Array.isArray(valor)) {
    const forma = (alvo as unknown as z.ZodObject<z.ZodRawShape>).shape;
    return mapearCampos(valor as Record<string, unknown>, (chave) => forma[chave]);
  }

  if (def.typeName === 'ZodRecord' && valor !== null && typeof valor === 'object' && !Array.isArray(valor)) {
    const valores = def.valueType;
    if (!valores) return valor;
    return mapearCampos(valor as Record<string, unknown>, () => valores);
  }

  return valor;
}

/** Reconstrói o objeto na ORDEM ORIGINAL das chaves — assim uma config que não
 *  mudou reserializa idêntica e não vira escrita a cada boot. */
function mapearCampos(
  valor: Record<string, unknown>,
  schemaDe: (chave: string) => z.ZodTypeAny | undefined,
): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [chave, item] of Object.entries(valor)) {
    const schema = schemaDe(chave);
    saida[chave] = schema ? ajustar(schema, item) : item;
  }
  return saida;
}

function ajustarNumero(def: DefZod, valor: unknown): unknown {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return valor;
  const checks = def.checks ?? [];
  // Arredondo ANTES de encostar nos limites: 120,7 num campo inteiro com teto 120
  // vira 121 e depois 120, nunca 121.
  let n = checks.some((c) => c.kind === 'int') && !Number.isInteger(valor) ? Math.round(valor) : valor;
  for (const check of checks) {
    if (check.value === undefined) continue;
    if (check.kind === 'min' && n < check.value) n = check.value;
    if (check.kind === 'max' && n > check.value) n = check.value;
  }
  return n;
}
