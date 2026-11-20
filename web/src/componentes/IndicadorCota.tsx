import { useQuery } from '@tanstack/react-query';
import type { EstadoConfiguracoes, UsoIaDia } from '@dao-tale/shared';
import { api } from '../api';

// Barra de cota diária: requisições feitas hoje (contadas localmente — os
// provedores não expõem o consumo via API) contra o limite configurado em
// Configurações. Some quando o limite do provedor é 0.

export const NOME_CURTO: Record<string, string> = {
  'claude-code': 'Claude Code',
  gemini: 'Gemini',
  claude: 'Claude',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  mistral: 'Mistral',
};

export function IndicadorCota({ compacto = false }: { compacto?: boolean }) {
  const { data: uso } = useQuery({
    queryKey: ['uso-hoje'],
    queryFn: () => api<UsoIaDia[]>('GET', '/uso/hoje'),
    refetchInterval: 60_000,
  });
  const { data: estado } = useQuery({
    queryKey: ['configuracoes'],
    queryFn: () => api<EstadoConfiguracoes>('GET', '/configuracoes'),
  });

  if (!uso || !estado) return null;

  const cotas: { provedor: string; limite: number }[] = Object.entries(estado.configuracoes.cotas_diarias)
    .map(([provedor, limite]) => ({ provedor, limite }))
    .filter((c) => c.limite > 0);

  const linhas = cotas
    .map((c) => {
      const requisicoes = uso.filter((u) => u.provedor === c.provedor).reduce((n, u) => n + u.requisicoes, 0);
      return { ...c, requisicoes, pct: Math.min(100, Math.round((requisicoes / c.limite) * 100)) };
    })
    .filter((l) => !compacto || l.requisicoes > 0);

  if (linhas.length === 0) return null;

  return (
    <div className={compacto ? 'flex items-center gap-3' : 'space-y-2'}>
      {linhas.map((l) => {
        const cor = l.pct >= 90 ? 'bg-selo-tint0' : l.pct >= 70 ? 'bg-ocre-tint0' : 'bg-jade-tint0';
        return (
          <div
            key={l.provedor}
            className="flex items-center gap-1.5"
            title={`${l.requisicoes} de ${l.limite} requisições da cota diária do ${NOME_CURTO[l.provedor] ?? l.provedor} (contagem local; ajuste o limite em Configurações)`}
          >
            <span className="text-xs text-tinta-2">{NOME_CURTO[l.provedor] ?? l.provedor}</span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-papel-fundo">
              <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.max(l.pct, 2)}%` }} />
            </div>
            <span className="text-xs tabular-nums text-tinta-2">
              {l.requisicoes}/{l.limite}
            </span>
          </div>
        );
      })}
    </div>
  );
}
