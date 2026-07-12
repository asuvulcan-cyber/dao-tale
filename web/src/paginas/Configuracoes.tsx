import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Configuracoes as Config, EstadoConfiguracoes, ProvedorId, UsoIaDia } from '@dao-tale/shared';
import { api } from '../api';
import { Aviso, Botao, Etiqueta } from '../App';
import { SeletorModelo } from '../componentes/SeletorModelo';
import { IndicadorCota } from '../componentes/IndicadorCota';

interface ProvedorInfo {
  id: ProvedorId;
  nome: string;
  precisa_chave: boolean;
  modelo_padrao: string;
}

export function Configuracoes() {
  const clienteQuery = useQueryClient();

  const { data: estado } = useQuery({
    queryKey: ['configuracoes'],
    queryFn: () => api<EstadoConfiguracoes>('GET', '/configuracoes'),
  });

  const { data: provedores } = useQuery({
    queryKey: ['provedores'],
    queryFn: () => api<ProvedorInfo[]>('GET', '/provedores'),
  });

  if (!estado || !provedores) return <p className="text-tinta-2">Carregando…</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Configurações</h1>

      <section className="cartao p-4">
        <h2 className="olho mb-1">Chaves de API</h2>
        <p className="mb-3 text-sm text-tinta-2">
          Guardadas {estado.modo_guarda_chaves === 'keyring' ? 'no cofre de credenciais do sistema operacional' : (
            <>em arquivo local com permissão restrita (<code>credenciais.json</code> no diretório de dados) — o
            cofre do sistema não está disponível nesta máquina</>
          )}. As chaves nunca saem da sua máquina, exceto na chamada direta à API do provedor.
        </p>
        <div className="space-y-3">
          {provedores
            .filter((p) => p.precisa_chave)
            .map((p) => (
              <CartaoCredencial
                key={p.id}
                provedor={p}
                configurada={estado.credenciais.find((c) => c.provedor === p.id)?.configurada ?? false}
                aoMudar={() => clienteQuery.invalidateQueries({ queryKey: ['configuracoes'] })}
              />
            ))}
        </div>
      </section>

      <FormularioPadroes
        config={estado.configuracoes}
        provedores={provedores}
        aoSalvar={() => clienteQuery.invalidateQueries({ queryKey: ['configuracoes'] })}
      />

      <UsoDeHoje />

      <section className="cartao p-4 text-sm text-tinta-2">
        <h2 className="olho mb-1">Dados</h2>
        <p>
          Banco de dados e arquivos do aplicativo: <code className="rounded bg-papel px-1">{estado.caminho_dados}</code>
        </p>
        <p className="mt-1">Para backup manual, copie esse diretório inteiro com o aplicativo fechado.</p>
      </section>
    </div>
  );
}

function UsoDeHoje() {
  const { data: uso } = useQuery({
    queryKey: ['uso-hoje'],
    queryFn: () => api<UsoIaDia[]>('GET', '/uso/hoje'),
    refetchInterval: 60_000,
  });

  return (
    <section className="cartao p-4">
      <h2 className="olho mb-1">Uso de hoje</h2>
      <p className="mb-3 text-sm text-tinta-2">
        Requisições de tradução e revisão contadas neste computador — os provedores não informam o consumo pela API,
        então a contagem zera à meia-noite local e não enxerga uso feito fora do aplicativo.
      </p>
      <IndicadorCota />
      {uso && uso.filter((u) => u.provedor !== 'mock').length > 0 ? (
        <table className="mt-3 text-sm">
          <tbody>
            {uso
              .filter((u) => u.provedor !== 'mock')
              .map((u) => (
                <tr key={`${u.provedor}/${u.modelo}`}>
                  <td className="pr-4 text-tinta-2">
                    {u.provedor} · {u.modelo}
                  </td>
                  <td className="tabular-nums">{u.requisicoes} requisições</td>
                </tr>
              ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-2 text-sm text-tinta-2">Nenhuma requisição a provedores reais hoje.</p>
      )}
    </section>
  );
}

function CartaoCredencial({
  provedor,
  configurada,
  aoMudar,
}: {
  provedor: ProvedorInfo;
  configurada: boolean;
  aoMudar: () => void;
}) {
  const [chave, setChave] = useState('');
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const salvar = useMutation({
    mutationFn: () => api('PUT', `/credenciais/${provedor.id}`, { chave }),
    onSuccess: () => {
      setChave('');
      setMensagem({ tipo: 'ok', texto: 'Chave salva.' });
      aoMudar();
    },
    onError: (e) => setMensagem({ tipo: 'erro', texto: (e as Error).message }),
  });

  const testar = useMutation({
    mutationFn: () => api<{ ok: boolean; mensagem: string }>('POST', `/credenciais/${provedor.id}/testar`),
    onSuccess: (r) => setMensagem({ tipo: r.ok ? 'ok' : 'erro', texto: r.mensagem }),
  });

  const remover = useMutation({
    mutationFn: () => api('DELETE', `/credenciais/${provedor.id}`),
    onSuccess: () => {
      setMensagem({ tipo: 'ok', texto: 'Chave removida.' });
      aoMudar();
    },
  });

  return (
    <div className="rounded border border-linha/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-medium">{provedor.nome}</span>
        {configurada ? <Etiqueta cor="jade">chave configurada</Etiqueta> : <Etiqueta>sem chave</Etiqueta>}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          type="password"
          value={chave}
          onChange={(e) => setChave(e.target.value)}
          placeholder={configurada ? 'Substituir chave…' : 'Colar chave de API…'}
          className="flex-1 entrada text-sm"
        />
        <Botao onClick={() => salvar.mutate()} disabled={!chave.trim() || salvar.isPending}>
          Salvar
        </Botao>
        {configurada && (
          <>
            <Botao variante="secundario" onClick={() => testar.mutate()} disabled={testar.isPending}>
              {testar.isPending ? 'Testando…' : 'Testar'}
            </Botao>
            <Botao variante="perigo" onClick={() => remover.mutate()}>
              Remover
            </Botao>
          </>
        )}
      </div>
      {mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}
    </div>
  );
}

function FormularioPadroes({
  config,
  provedores,
  aoSalvar,
}: {
  config: Config;
  provedores: ProvedorInfo[];
  aoSalvar: () => void;
}) {
  const [valores, setValores] = useState<Config>(config);
  const [salvo, setSalvo] = useState(false);

  const salvar = useMutation({
    mutationFn: () => api('PUT', '/configuracoes', valores),
    onSuccess: () => {
      setSalvo(true);
      aoSalvar();
      setTimeout(() => setSalvo(false), 3000);
    },
  });

  return (
    <section className="cartao p-4">
      <h2 className="olho mb-3">Padrões globais</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Provedor padrão
          <select
            value={valores.provedor_padrao}
            onChange={(e) => setValores({ ...valores, provedor_padrao: e.target.value as ProvedorId })}
            className="entrada mt-1 w-full"
          >
            {provedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Modelo padrão
          <SeletorModelo
            provedor={valores.provedor_padrao}
            valor={valores.modelo_padrao}
            aoMudar={(novo) => setValores({ ...valores, modelo_padrao: novo })}
            modeloPadraoProvedor={provedores.find((p) => p.id === valores.provedor_padrao)?.modelo_padrao}
          />
        </label>
        <label className="block text-sm">
          Frases por bloco de tradução
          <input
            type="number"
            min={1}
            max={100}
            value={valores.tamanho_bloco}
            onChange={(e) => setValores({ ...valores, tamanho_bloco: Number(e.target.value) })}
            className="entrada mt-1 w-full"
          />
        </label>
        <label className="block text-sm">
          Frases vizinhas na revisão (cada lado)
          <input
            type="number"
            min={0}
            max={10}
            value={valores.vizinhas_revisao}
            onChange={(e) => setValores({ ...valores, vizinhas_revisao: Number(e.target.value) })}
            className="entrada mt-1 w-full"
          />
        </label>
        <label className="block text-sm">
          Cauda de contexto entre blocos (frases)
          <input
            type="number"
            min={0}
            max={10}
            value={valores.cauda_contexto}
            onChange={(e) => setValores({ ...valores, cauda_contexto: Number(e.target.value) })}
            className="entrada mt-1 w-full"
          />
        </label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Cota diária do Gemini (requisições/dia; 0 = não mostrar indicador)
          <input
            type="number"
            min={0}
            value={valores.cota_diaria_gemini}
            onChange={(e) => setValores({ ...valores, cota_diaria_gemini: Number(e.target.value) })}
            className="entrada mt-1 w-full"
          />
        </label>
        <label className="block text-sm">
          Cota diária do Claude (0 = não mostrar)
          <input
            type="number"
            min={0}
            value={valores.cota_diaria_claude}
            onChange={(e) => setValores({ ...valores, cota_diaria_claude: Number(e.target.value) })}
            className="entrada mt-1 w-full"
          />
        </label>
      </div>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={valores.parar_no_limite}
          onChange={(e) => setValores({ ...valores, parar_no_limite: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          Usar somente a cota gratuita: ao atingir o limite de requisições do provedor (erro 429), a tradução{' '}
          <strong>para e avisa</strong> em vez de insistir. As frases restantes ficam pendentes — use "Retomar
          tradução" quando o limite renovar.
        </span>
      </label>
      <div className="mt-3 flex items-center gap-3">
        <Botao onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          Salvar padrões
        </Botao>
        {salvo && <span className="text-sm text-jade-forte">Salvo.</span>}
      </div>
    </section>
  );
}
