import type { PrecoModelo, PrecosModelos } from '@dao-tale/shared';
import type { UsoChamada } from '../ia/provedor.js';

// Conversão tokens → dinheiro (doc 11 §3). Puro: nenhuma leitura de banco aqui.
//
// Três estados possíveis para um par provedor/modelo, e a diferença importa:
//   com preço      → custo em USD
//   preço 0 (explícito, faixa gratuita) → custo 0, medido
//   sem preço      → custo NULL, e o painel conta como "sem preço cadastrado"
// O que NUNCA acontece é modelo desconhecido aparecer como US$ 0,00 disfarçado
// de grátis — era exatamente a cegueira que este passo existe para acabar.

/** Descontos padrão da indústria quando o preço de cache não é informado. */
const FATOR_CACHE_LEITURA = 0.1;
const FATOR_CACHE_CRIACAO = 1.25;

export function chavePreco(provedor: string, modelo: string): string {
  return `${provedor}:${modelo}`;
}

/** Preço do par: chave exata → curinga do provedor → nenhum. */
export function buscarPreco(precos: PrecosModelos, provedor: string, modelo: string): PrecoModelo | null {
  return precos[chavePreco(provedor, modelo)] ?? precos[chavePreco(provedor, '*')] ?? null;
}

/** Custo em USD de uma chamada. `null` quando não há preço cadastrado ou quando
 * o provedor não reportou consumo algum (nada medido = nada a faturar). */
export function calcularCusto(preco: PrecoModelo | null, uso: UsoChamada): number | null {
  if (!preco) return null;
  const campos = [uso.tokens_entrada, uso.tokens_saida, uso.tokens_cache_leitura, uso.tokens_cache_criacao];
  if (campos.every((v) => v === null)) return null;

  const leitura = preco.cache_leitura ?? preco.entrada * FATOR_CACHE_LEITURA;
  const criacao = preco.cache_criacao ?? preco.entrada * FATOR_CACHE_CRIACAO;
  const porMilhao =
    (uso.tokens_entrada ?? 0) * preco.entrada +
    (uso.tokens_saida ?? 0) * preco.saida +
    (uso.tokens_cache_leitura ?? 0) * leitura +
    (uso.tokens_cache_criacao ?? 0) * criacao;
  return porMilhao / 1_000_000;
}

/** Quanto o cache poupou: os tokens lidos do cache teriam custado preço de
 * entrada cheio. Responde em dinheiro a pergunta (a) do doc 11. */
export function economiaDoCache(preco: PrecoModelo | null, tokensLidos: number): number | null {
  if (!preco) return null;
  const leitura = preco.cache_leitura ?? preco.entrada * FATOR_CACHE_LEITURA;
  return (tokensLidos * (preco.entrada - leitura)) / 1_000_000;
}
