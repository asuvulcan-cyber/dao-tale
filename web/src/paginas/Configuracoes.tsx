import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Configuracoes as Config, EstadoConfiguracoes, ProvedorId, UsoIaDia } from '@dao-tale/shared';
import { api } from '../api';
import { Aviso, Botao, Etiqueta } from '../App';
import { SeletorModelo } from '../componentes/SeletorModelo';
import { IndicadorCota, NOME_CURTO } from '../componentes/IndicadorCota';

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
          )}. As chaves nunca saem da sua máquina, exceto na chamada direta à API do provedor. Não sabe qual usar ou
          como criar uma chave? Veja o <Link className="text-jade-forte underline" to="/docs#chaves">guia de chaves de API</Link>.
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
          Provedor de revisão
          <select
            value={valores.provedor_revisao}
            onChange={(e) => setValores({ ...valores, provedor_revisao: e.target.value as ProvedorId | '', modelo_revisao: '' })}
            className="entrada mt-1 w-full"
          >
            <option value="">— o mesmo da tradução —</option>
            {provedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          <span className="mt-0.5 block text-xs text-tinta-2">
            A revisão é rara e vale mais raciocínio: um modelo de pensamento profundo aqui não pesa no custo da
            tradução em volume.
          </span>
        </label>
        <label className="block text-sm">
          Modelo de revisão
          {valores.provedor_revisao ? (
            <SeletorModelo
              provedor={valores.provedor_revisao}
              valor={valores.modelo_revisao}
              aoMudar={(novo) => setValores({ ...valores, modelo_revisao: novo })}
              modeloPadraoProvedor={provedores.find((p) => p.id === valores.provedor_revisao)?.modelo_padrao}
            />
          ) : (
            <input disabled value="" placeholder="segue o modelo da tradução" className="entrada mt-1 w-full opacity-60" />
          )}
        </label>
        <label className="block text-sm">
          Frases por bloco de tradução
          <input
            type="number"
            min={1}
            max={120}
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
            max={20}
            value={valores.cauda_contexto}
            onChange={(e) => setValores({ ...valores, cauda_contexto: Number(e.target.value) })}
            className="entrada mt-1 w-full"
          />
        </label>
      </div>
      <div className="mt-4">
        <h3 className="text-sm font-medium">Cotas diárias por provedor</h3>
        <p className="mb-2 mt-0.5 text-sm text-tinta-2">
          Limite de requisições/dia usado pelo indicador de cota (0 = não mostrar). Confira o limite real da sua
          conta no painel do provedor — veja o <Link className="text-jade-forte underline" to="/docs#cotas">guia de cotas</Link>.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {provedores
            .filter((p) => p.precisa_chave)
            .map((p) => (
              <label key={p.id} className="block text-sm">
                {NOME_CURTO[p.id] ?? p.nome}
                <input
                  type="number"
                  min={0}
                  value={valores.cotas_diarias[p.id] ?? 0}
                  onChange={(e) =>
                    setValores({
                      ...valores,
                      cotas_diarias: { ...valores.cotas_diarias, [p.id]: Number(e.target.value) },
                    })
                  }
                  className="entrada mt-1 w-full"
                />
              </label>
            ))}
        </div>
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
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={valores.glossario_relevante}
          onChange={(e) => setValores({ ...valores, glossario_relevante: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          Enviar só o glossário relevante: cada chamada à IA leva apenas os termos que aparecem no trecho enviado,
          em vez do glossário inteiro — economia grande de tokens em obras com glossário extenso.
        </span>
      </label>

      <div className="mt-4">
        <h3 className="text-sm font-medium">Checkpoint de estabilidade</h3>
        <p className="mb-2 mt-0.5 text-sm text-tinta-2">
          Limiares do semáforo que libera a tradução em lote (cruzeiro) por obra. Medidos numa janela dos capítulos
          recentes — não por número fixo de capítulos.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Janela (capítulos recentes)
            <input
              type="number"
              min={1}
              max={50}
              value={valores.checkpoint_janela}
              onChange={(e) => setValores({ ...valores, checkpoint_janela: Number(e.target.value) })}
              className="entrada mt-1 w-full"
            />
          </label>
          <label className="block text-sm">
            Máx. termos novos por 100 frases
            <input
              type="number"
              min={0}
              step={0.5}
              value={valores.checkpoint_termos_max}
              onChange={(e) => setValores({ ...valores, checkpoint_termos_max: Number(e.target.value) })}
              className="entrada mt-1 w-full"
            />
          </label>
          <label className="block text-sm">
            Máx. % de frases editadas à mão
            <input
              type="number"
              min={0}
              max={100}
              value={valores.checkpoint_edicao_max}
              onChange={(e) => setValores({ ...valores, checkpoint_edicao_max: Number(e.target.value) })}
              className="entrada mt-1 w-full"
            />
          </label>
          <label className="block text-sm">
            Máx. violações de glossário por 100 frases (0 = só informativa)
            <input
              type="number"
              min={0}
              value={valores.checkpoint_violacoes_max}
              onChange={(e) => setValores({ ...valores, checkpoint_violacoes_max: Number(e.target.value) })}
              className="entrada mt-1 w-full"
            />
          </label>
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-medium">QA por segunda IA (opcional)</h3>
        <p className="mb-2 mt-0.5 text-sm text-tinta-2">
          Uma IA diferente da que traduz aponta problemas de glossário, gênero, repetição e omissão — ela só aponta,
          você decide. Vazio = usa o par da revisão. Custo separado da tradução; ligue a automação só se compensar.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Provedor de QA
            <select
              value={valores.provedor_qa}
              onChange={(e) => setValores({ ...valores, provedor_qa: e.target.value as ProvedorId | '', modelo_qa: '' })}
              className="entrada mt-1 w-full"
            >
              <option value="">— usar o par da revisão —</option>
              {provedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Modelo de QA
            {valores.provedor_qa ? (
              <SeletorModelo
                provedor={valores.provedor_qa}
                valor={valores.modelo_qa}
                aoMudar={(novo) => setValores({ ...valores, modelo_qa: novo })}
                modeloPadraoProvedor={provedores.find((p) => p.id === valores.provedor_qa)?.modelo_padrao}
              />
            ) : (
              <input disabled value="" placeholder="segue o par da revisão" className="entrada mt-1 w-full opacity-60" />
            )}
          </label>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={valores.qa_automatica}
            onChange={(e) => setValores({ ...valores, qa_automatica: e.target.checked })}
            className="mt-0.5"
          />
          <span>
            Rodar QA automaticamente ao fim de cada capítulo do lote. Desligado por padrão: como você revisa tudo, o
            QA é uma despesa extra opt-in. Só roda quando há um par de QA diferente do tradutor do capítulo.
          </span>
        </label>
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-medium">Tradução em lote (fase de cruzeiro)</h3>
        <p className="mb-2 mt-0.5 text-sm text-tinta-2">
          Quantos capítulos traduzir em paralelo e a cadeia de reserva (failover). Ordene do mais barato ao mais
          caro: o lote surfa as cotas gratuitas antes de gastar.
        </p>
        <label className="block w-56 text-sm">
          Capítulos em paralelo
          <input
            type="number"
            min={1}
            max={8}
            value={valores.lote_paralelo}
            onChange={(e) => setValores({ ...valores, lote_paralelo: Number(e.target.value) })}
            className="entrada mt-1 w-full"
          />
        </label>
        <div className="mt-3">
          <span className="text-sm">Cadeia de failover (em ordem de tentativa)</span>
          <div className="mt-1 space-y-2">
            {valores.failover.map((par, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="w-5 text-right font-mono text-xs text-tinta-2">{i + 1}.</span>
                <select
                  value={par.provedor}
                  onChange={(e) => {
                    const failover = [...valores.failover];
                    failover[i] = { provedor: e.target.value as ProvedorId, modelo: '' };
                    setValores({ ...valores, failover });
                  }}
                  className="entrada"
                >
                  {provedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
                <div className="w-56">
                  <SeletorModelo
                    provedor={par.provedor}
                    valor={par.modelo}
                    aoMudar={(novo) => {
                      const failover = [...valores.failover];
                      failover[i] = { ...failover[i], modelo: novo };
                      setValores({ ...valores, failover });
                    }}
                    modeloPadraoProvedor={provedores.find((p) => p.id === par.provedor)?.modelo_padrao}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setValores({ ...valores, failover: valores.failover.filter((_, j) => j !== i) })}
                  className="text-tinta-2 hover:text-erro"
                  title="Remover da cadeia"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {valores.failover.length < 6 && (
            <Botao
              variante="secundario"
              onClick={() =>
                setValores({
                  ...valores,
                  failover: [...valores.failover, { provedor: provedores[0]?.id ?? 'mock', modelo: '' }],
                })
              }
            >
              + Adicionar provedor de reserva
            </Botao>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Botao onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          Salvar padrões
        </Botao>
        {salvo && <span className="text-sm text-jade-forte">Salvo.</span>}
      </div>
    </section>
  );
}
