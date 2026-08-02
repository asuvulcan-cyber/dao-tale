// Temperatura por papel (doc 08 §13): amostragem, não texto.
//
// Até aqui NENHUM provedor definia `temperature` — todas as chamadas do
// aplicativo saíam no padrão do modelo (1.0). Isso não é neutro: a mesma
// requisição, byte a byte, devolvia traduções sensivelmente diferentes, e a
// dispersão entre execuções ficou do tamanho da diferença que o portão A/B do
// §12 queria medir. Sem controle de amostragem não existe comparação honesta
// entre dois prompts — nem consistência entre dois capítulos da mesma obra.
//
// Temperatura NÃO é preferência de estilo: preferência é texto, entra no prompt
// e por isso é versionada com ele (§12.3). Temperatura é como o modelo sorteia
// o próximo token — não muda um byte do que é enviado. Por isso mora na
// configuração (padrão por papel) e, quando a obra quiser fugir do padrão, na
// própria obra, ao lado de `modelo_padrao`.

/** Papéis que geram texto e, portanto, amostram. `comparador` não tem chave
    própria de propósito: ele É tradução sendo medida, e mede com a mesma
    temperatura da tradução — outra temperatura mediria outra coisa. */
export const PAPEIS_TEMPERATURA = ['traducao', 'revisao', 'qa', 'extracao', 'titulo', 'refinamento'] as const;
export type PapelTemperatura = (typeof PAPEIS_TEMPERATURA)[number];

export type TemperaturasPapel = Record<PapelTemperatura, number>;

/** Teto aceito na configuração. Os provedores estreitam para a faixa deles
    (a Anthropic vai até 1; Gemini e compatíveis com OpenAI, até 2). */
export const TEMPERATURA_MAX = 2;

/** Padrões: baixos, porque quase todo papel aqui quer a MESMA resposta duas
    vezes. Tradução um pouco acima do chão (0.3) para a prosa não engessar;
    revisão, QA e extração no mínimo útil (0.2), que são veredito e catálogo —
    variar ali é ruído puro; contracapa um pouco solta (0.4), a única tarefa
    declaradamente interpretativa (doc 08 §11); refinamento mais solto (0.5),
    porque propor regra nova é a única tarefa em que variedade é o produto. */
export const TEMPERATURAS_PADRAO: TemperaturasPapel = {
  traducao: 0.3,
  revisao: 0.2,
  qa: 0.2,
  extracao: 0.2,
  titulo: 0.4,
  refinamento: 0.5,
};

/** Valor válido de temperatura, ou null. Guarda de fronteira: um número fora da
    faixa (ou NaN vindo de JSON corrompido) cai para o padrão em vez de virar
    uma chamada rejeitada pelo provedor. */
export function temperaturaValida(valor: unknown): number | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return null;
  if (valor < 0 || valor > TEMPERATURA_MAX) return null;
  return valor;
}

/** JSON guardado na configuração → tabela completa, chave a chave. Chave
    ausente ou corrompida cai no padrão dela sozinha (não derruba as outras). */
export function normalizarTemperaturas(bruto: unknown): TemperaturasPapel {
  const origem = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  const tabela = {} as TemperaturasPapel;
  for (const papel of PAPEIS_TEMPERATURA) {
    tabela[papel] = temperaturaValida(origem[papel]) ?? TEMPERATURAS_PADRAO[papel];
  }
  return tabela;
}

/** Temperatura efetiva de uma chamada: override da obra (quando houver) vence o
    padrão do papel. O override é um número só para a obra inteira — quem o
    define está dizendo "esta obra sorteia assim", não "este papel sorteia
    assim"; papel a papel é o que a configuração global já faz. */
export function resolverTemperatura(
  temperaturas: TemperaturasPapel,
  papel: PapelTemperatura,
  overrideObra?: number | null,
): number {
  return temperaturaValida(overrideObra) ?? temperaturaValida(temperaturas[papel]) ?? TEMPERATURAS_PADRAO[papel];
}
