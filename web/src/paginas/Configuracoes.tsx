import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Configuracoes as Config,
  EstadoConfiguracoes,
  EstadoSaude,
  InfoBackup,
  PrecosModelos,
  ProvedorId,
  TelemetriaDia,
} from '@dao-tale/shared';
import { api, ErroApi } from '../api';
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

      <TabelaPrecos
        config={estado.configuracoes}
        provedores={provedores}
        aoSalvar={() => clienteQuery.invalidateQueries({ queryKey: ['configuracoes'] })}
      />

      <SecaoDados caminhoDados={estado.caminho_dados} />
    </div>
  );
}

function SecaoDados({ caminhoDados }: { caminhoDados: string }) {
  const clienteQuery = useQueryClient();
  const { data: saude } = useQuery({
    queryKey: ['saude'],
    queryFn: () => api<EstadoSaude>('GET', '/saude'),
  });

  const backup = useMutation({
    mutationFn: () => api<{ ok: boolean; backup: InfoBackup | null }>('POST', '/sistema/backup'),
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: ['saude'] }),
  });

  const ultimo = saude?.backups.ultimo ? new Date(saude.backups.ultimo).toLocaleString() : null;

  return (
    <section className="cartao p-4 text-sm text-tinta-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="olho">Dados e backup</h2>
        <Botao variante="secundario" onClick={() => backup.mutate()} disabled={backup.isPending}>
          {backup.isPending ? 'Fazendo backup…' : 'Fazer backup agora'}
        </Botao>
      </div>

      {saude && !saude.canonico && (
        <Aviso tipo="info">
          Esta é uma <strong>instância de teste</strong> (porta {saude.porta}), não a obra real na porta padrão.
          Confira a pasta de dados abaixo antes de traduzir ou apagar algo.
        </Aviso>
      )}

      <p>
        Banco e arquivos do aplicativo: <code className="rounded bg-papel px-1">{caminhoDados}</code>
        {saude && <> · porta <code className="rounded bg-papel px-1">{saude.porta}</code></>}
      </p>

      <p className="mt-1">
        Backups automáticos em <code className="rounded bg-papel px-1">{caminhoDados}/backups</code> (no boot e antes
        de lote/importação/migração; guardados os últimos 10).{' '}
        {saude ? (
          <>
            {saude.backups.total} backup(s); {ultimo ? `último em ${ultimo}` : 'nenhum ainda'}.
          </>
        ) : null}
      </p>

      {backup.isSuccess && backup.data.backup && (
        <Aviso tipo="ok">
          Backup criado: <code className="rounded bg-papel px-1">{backup.data.backup.nome}</code>
        </Aviso>
      )}
      {backup.isError && (
        <Aviso tipo="erro">
          Falha ao fazer backup: {backup.error instanceof ErroApi ? backup.error.message : 'erro inesperado'}
        </Aviso>
      )}

      <p className="mt-2">
        Para restaurar um backup, feche o aplicativo e rode <code className="rounded bg-papel px-1">npm run restaurar</code>{' '}
        (lista os backups) ou <code className="rounded bg-papel px-1">npm run restaurar -- 0</code> (restaura o mais
        recente). Uma cópia do banco atual é guardada antes de sobrescrever.
      </p>
    </section>
  );
}

function UsoDeHoje() {
  // Doc 11 §5, pergunta (c): dinheiro e cota lado a lado. `tentativas` vem de
  // uso_ia (conta retries e falhas — é o que o provedor debita) e `chamadas` do
  // livro-caixa: a diferença entre as duas É o desperdício.
  const { data: dia } = useQuery({
    queryKey: ['telemetria-dia'],
    queryFn: () => api<TelemetriaDia>('GET', '/telemetria/dia'),
    refetchInterval: 60_000,
  });

  const linhas = (dia?.provedores ?? []).filter((p) => p.provedor !== 'mock');

  return (
    <section className="cartao p-4">
      <h2 className="olho mb-1">Uso de hoje</h2>
      <p className="mb-3 text-sm text-tinta-2">
        Tentativas contadas neste computador (os provedores não informam consumo pela API, então a contagem zera à
        meia-noite local) e, ao lado, os tokens e o custo que as respostas realmente reportaram.
      </p>
      <IndicadorCota />
      {linhas.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr>
                <th className="olho border-b border-linha px-2 py-1.5 text-left">Provedor</th>
                <th className="olho border-b border-linha px-2 py-1.5 text-right" title="Inclui retries e chamadas que falharam — é o que conta na cota">
                  Tentativas
                </th>
                <th className="olho border-b border-linha px-2 py-1.5 text-right" title="Chamadas que devolveram consumo">
                  Faturadas
                </th>
                <th className="olho border-b border-linha px-2 py-1.5 text-right">Entrada</th>
                <th className="olho border-b border-linha px-2 py-1.5 text-right">Saída</th>
                <th className="olho border-b border-linha px-2 py-1.5 text-right">Custo</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((p) => (
                <tr key={p.provedor} className="border-b border-linha/50 last:border-b-0">
                  <td className="px-2 py-1.5">
                    {NOME_CURTO[p.provedor] ?? p.provedor}
                    {p.cota_diaria > 0 && (
                      <span className="ml-1 text-xs text-tinta-2">
                        ({p.tentativas}/{p.cota_diaria} da cota)
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.tentativas}</td>
                  <td
                    className={`px-2 py-1.5 text-right tabular-nums ${p.tentativas > p.chamadas ? 'text-ocre-forte' : ''}`}
                    title={
                      p.tentativas > p.chamadas
                        ? `${p.tentativas - p.chamadas} tentativa(s) não devolveram consumo: retries, 429 ou truncamento.`
                        : undefined
                    }
                  >
                    {p.chamadas}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.tokens_entrada.toLocaleString('pt-BR')}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.tokens_saida.toLocaleString('pt-BR')}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {p.chamadas_sem_preco > 0 && p.custo_usd === 0
                      ? '—'
                      : `US$ ${p.custo_usd.toLocaleString('pt-BR', {
                          minimumFractionDigits: p.custo_usd > 0 && p.custo_usd < 0.01 ? 5 : 2,
                          maximumFractionDigits: p.custo_usd > 0 && p.custo_usd < 0.01 ? 5 : 2,
                        })}`}
                    {p.chamadas_sem_preco > 0 && (
                      <span className="ml-1 text-ocre-forte" title={`${p.chamadas_sem_preco} chamada(s) sem preço cadastrado`}>
                        +?
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-2 text-sm text-tinta-2">Nenhuma requisição a provedores reais hoje.</p>
      )}
    </section>
  );
}

/** Tabela de preços (doc 11 §3): sem ela não existe "custo em dinheiro". */
function TabelaPrecos({
  config,
  provedores,
  aoSalvar,
}: {
  config: Config;
  provedores: ProvedorInfo[];
  aoSalvar: () => void;
}) {
  const [precos, setPrecos] = useState<PrecosModelos>(config.precos_modelos);
  const [taxa, setTaxa] = useState(config.taxa_usd_brl);
  const [novoProvedor, setNovoProvedor] = useState<ProvedorId>(provedores[0]?.id ?? 'claude');
  const [novoModelo, setNovoModelo] = useState('');
  const [salvo, setSalvo] = useState(false);

  const salvar = useMutation({
    mutationFn: () => api('PUT', '/configuracoes', { precos_modelos: precos, taxa_usd_brl: taxa }),
    onSuccess: () => {
      setSalvo(true);
      aoSalvar();
      setTimeout(() => setSalvo(false), 3000);
    },
  });

  const recalcular = useMutation({
    mutationFn: () => api<{ atualizados: number; total: number }>('POST', '/telemetria/recalcular'),
  });

  const chaves = Object.keys(precos).sort();

  const definir = (chave: string, campo: 'entrada' | 'saida', valor: number) =>
    setPrecos({ ...precos, [chave]: { ...precos[chave], [campo]: valor } });

  return (
    <section className="cartao p-4" id="precos">
      <h2 className="olho mb-1">Preços dos modelos</h2>
      <p className="mb-3 text-sm text-tinta-2">
        Em dólares por 1 milhão de tokens, como os provedores publicam. Sem preço cadastrado, o painel de custos conta a
        chamada como <strong>desconhecida</strong> — nunca como grátis. Faixa gratuita se cadastra com <strong>0</strong>{' '}
        nos dois campos. Leitura de cache é cobrada a 0,1× a entrada e escrita a 1,25×; só a família Claude vem
        preenchida de fábrica.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="olho border-b border-linha px-2 py-1.5 text-left">Provedor · modelo</th>
              <th className="olho border-b border-linha px-2 py-1.5 text-right">Entrada US$/1M</th>
              <th className="olho border-b border-linha px-2 py-1.5 text-right">Saída US$/1M</th>
              <th className="olho border-b border-linha px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {chaves.map((chave) => (
              <tr key={chave} className="border-b border-linha/50 last:border-b-0">
                <td className="px-2 py-1.5">
                  <code className="rounded bg-papel px-1">{chave}</code>
                </td>
                <td className="px-2 py-1.5 text-right">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={precos[chave].entrada}
                    onChange={(e) => definir(chave, 'entrada', Number(e.target.value))}
                    className="entrada w-24 text-right text-sm tabular-nums"
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={precos[chave].saida}
                    onChange={(e) => definir(chave, 'saida', Number(e.target.value))}
                    className="entrada w-24 text-right text-sm tabular-nums"
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => setPrecos(Object.fromEntries(Object.entries(precos).filter(([k]) => k !== chave)))}
                    className="text-tinta-2 hover:text-erro"
                    title="Remover preço (o custo volta a desconhecido)"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          Provedor
          <select
            value={novoProvedor}
            onChange={(e) => setNovoProvedor(e.target.value as ProvedorId)}
            className="entrada mt-1 block"
          >
            {provedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Modelo (ou <code>*</code> para todos do provedor)
          <input
            value={novoModelo}
            onChange={(e) => setNovoModelo(e.target.value)}
            placeholder="*"
            className="entrada mt-1 block w-56"
          />
        </label>
        <Botao
          variante="secundario"
          onClick={() => {
            const chave = `${novoProvedor}:${novoModelo.trim() || '*'}`;
            if (precos[chave]) return;
            setPrecos({ ...precos, [chave]: { entrada: 0, saida: 0 } });
            setNovoModelo('');
          }}
        >
          + Adicionar modelo
        </Botao>
      </div>

      <label className="mt-4 block text-sm">
        Cotação do dólar (para mostrar em reais; 0 = só em US$)
        <input
          type="number"
          min={0}
          step="0.01"
          value={taxa}
          onChange={(e) => setTaxa(Number(e.target.value))}
          className="entrada mt-1 block w-32 tabular-nums"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Botao onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          Salvar preços
        </Botao>
        <Botao variante="secundario" onClick={() => recalcular.mutate()} disabled={recalcular.isPending}>
          Recalcular custos do histórico
        </Botao>
        {salvo && <span className="text-sm text-jade-forte">Salvo.</span>}
        {recalcular.isSuccess && (
          <span className="text-sm text-jade-forte">
            {recalcular.data.atualizados} de {recalcular.data.total} chamada(s) recalculada(s).
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-tinta-2">
        Salvar preço novo não reescreve o passado sozinho — use “Recalcular” para aplicar a tabela vigente ao histórico
        já gravado.
      </p>
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
