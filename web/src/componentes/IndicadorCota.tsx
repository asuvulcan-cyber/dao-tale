import { useQuery } from '@tanstack/react-query';
import type { EstadoConfiguracoes, UsoIaDia } from '@dao-tale/shared';
import { api } from '../api';

// Barra de cota diária: requisições feitas hoje (contadas localmente — os
// provedores não expõem o consumo via API) contra o limite configurado em
// Configurações. Some quando o limite do provedor é 0.

const NOME_CURTO: Record<string, string> = { gemini: 'Gemini', claude: 'Claude' };

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

  const cotas: { provedor: string; limite: number }[] = [
    { provedor: 'gemini', limite: estado.configuracoes.cota_diaria_gemini },
    { provedor: 'claude', limite: estado.configuracoes.cota_diaria_claude },
  ].filter((c) => c.limite > 0);

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
        const cor = l.pct >= 90 ? 'bg-red-500' : l.pct >= 70 ? 'bg-amber-500' : 'bg-green-500';
        return (
          <div
            key={l.provedor}
            className="flex items-center gap-1.5"
            title={`${l.requisicoes} de ${l.limite} requisições da cota diária do ${NOME_CURTO[l.provedor] ?? l.provedor} (contagem local; ajuste o limite em Configurações)`}
          >
            <span className="text-xs text-stone-500">{NOME_CURTO[l.provedor] ?? l.provedor}</span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-200">
              <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.max(l.pct, 2)}%` }} />
            </div>
            <span className="text-xs tabular-nums text-stone-500">
              {l.requisicoes}/{l.limite}
            </span>
          </div>
        );
      })}
    </div>
  );
}
