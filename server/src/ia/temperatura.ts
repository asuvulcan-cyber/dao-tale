// Envio de `temperature` aos provedores (doc 08 §13).
//
// A temperatura efetiva é resolvida antes (config por papel + override da obra,
// em `shared/src/temperatura.ts`); aqui fica só a parte que depende da API de
// cada provedor: quando NÃO mandar o parâmetro.
//
// Duas defesas, porque o catálogo muda mais rápido que o código:
// 1. `aceitaTemperatura` — famílias de raciocínio conhecidas que fixam a
//    amostragem e rejeitam (ou ignoram) o parâmetro. Barato e sem chamada.
// 2. O 400 falando de `temperature` derruba o parâmetro e repete a chamada, no
//    mesmo desenho do fallback do `thinkingConfig` do Gemini. É a defesa que
//    pega o modelo que ninguém previu.

/** Modelos de raciocínio que fixam a temperatura. `-thinking`/`reasoner` cobrem
    as variantes de qualquer fabricante; o resto é nome de família. */
const SEM_TEMPERATURA = /(^|[/:])o[1-4]([.-]|$)|gpt-5|deepseek-reasoner|reasoner|-thinking|qwq/i;

export function aceitaTemperatura(modelo: string): boolean {
  return !SEM_TEMPERATURA.test(modelo);
}

/** O provedor rejeitou a chamada por causa da temperatura? (400 com a palavra no
    texto — é o que Anthropic, Google e compatíveis com OpenAI devolvem.) */
export function ehErroDeTemperatura(mensagem: string): boolean {
  return /temperature/i.test(mensagem);
}

/** O 400 reclamou de um parâmetro específico? Usado para reenviar a chamada sem
 *  ele, quando o parâmetro é otimização e não requisito. */
export function ehErroDeParametro(mensagem: string, parametro: string): boolean {
  return new RegExp(parametro.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(mensagem);
}

/** Temperatura a enviar, já dentro da faixa do provedor. `undefined` = não
    mandar o parâmetro (nenhuma temperatura definida ou modelo que não aceita). */
export function temperaturaDoPedido(
  req: { modelo: string; temperatura?: number },
  faixaMaxima: number,
): number | undefined {
  if (req.temperatura === undefined || !aceitaTemperatura(req.modelo)) return undefined;
  return Math.min(Math.max(req.temperatura, 0), faixaMaxima);
}
