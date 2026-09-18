// Sinais de calibração, não regras de tradução nem diagnósticos definitivos.
// Cada regra exige evidência nos dois idiomas e pede conferência contextual.
export const SINAIS_BILINGUES = [
  { id: 'origem-funcionarios', zh: /官宦/, pt: /\blinhagem nobre\b/iu,
    razao: 'Conferir 官宦: descendência de funcionários não implica necessariamente nobreza hereditária.' },
  { id: 'possessao-causa-morte', zh: /中邪[^。！？]*死/u, pt: /\bsucumbi\p{L}*\s+[aà]\s+possessão/iu,
    razao: 'Conferir se o chinês atribui a morte à possessão ou apenas descreve o estado de quem morreu; não inferir causalidade.' },
  { id: 'assassinato-tentativa', zh: /搞暗杀/u, pt: /\btent(?:ou|aram)\s+(?:um\s+)?assassinato\b/iu,
    razao: 'Conferir se 搞暗杀 descreve assassinato realizado ou tentativa; não mudar o resultado sem apoio contextual.' },
  { id: 'frequencia-intensificada', zh: /频繁/u, pt: /\ba todo instante\b/iu,
    razao: 'Conferir intensidade: 频繁 indica frequência, não necessariamente uma ação a todo instante.' },
  { id: 'diferenca-intensificada', zh: /另类/u, pt: /\baberraç(?:ão|ões)(?!\p{L})/iu,
    razao: 'Conferir se “aberração” intensifica 另类; preservar a diferença sem acrescentar monstruosidade.' },
  { id: 'medo-registro', zh: /一丝畏惧/u, pt: /\blampejo de temor\b/iu,
    razao: 'Conferir o registro de “lampejo de temor” para 一丝畏惧; preservar a baixa intensidade sem embelezar.' },
  { id: 'impulso-imagem', zh: /冲动/u, pt: /\btomou-lhe o peito\b/iu,
    razao: 'Conferir se a imagem “tomou-lhe o peito” tem apoio no original ao expressar 冲动; preservar o impulso e as reações físicas.' },
  { id: 'acao-chicote', zh: /鞭刑/u, pt: /\b(?:deu|deram) início aos chicotes\b/iu,
    razao: 'Conferir a construção “início aos chicotes”: 鞭刑 descreve uma punição/ação, não o início de um objeto.' },
] as const;

export function detectarSinaisBilingues(textoZh: string, textoPt: string) {
  return SINAIS_BILINGUES.filter(s => s.zh.test(textoZh) && s.pt.test(textoPt))
    .map(s => ({ id: s.id, razao: s.razao }));
}
