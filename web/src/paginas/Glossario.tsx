import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoriaGlossario, EntradaGlossario, EspecieTermo } from '@dao-tale/shared';
import { CATEGORIAS_GLOSSARIO, ESPECIES_TERMO } from '@dao-tale/shared';
import { api } from '../api';
import { Aviso, Botao, CabecalhoPagina, Etiqueta, MenuMais, SeletorCategoria } from '../App';
import { contarNaoClassificados } from '../util/glossario';

/** Texto curto de cada espécie, repetido no seletor e na ajuda da linha —
 *  "identidade" e "lexical" não bastam sozinhos porque o nome não diz qual dos
 *  dois flexiona. */
const DESCRICAO_ESPECIE: Record<EspecieTermo, string> = {
  identidade: 'designa um referente específico — a palavra é essa, e a caixa segue a norma (金鹏堡 → Fortaleza do Peng Dourado).',
  lexical: 'a palavra é a resposta e a forma flexiona à vontade (刀 → sabre; "sabres" conta).',
};

interface Aparicao {
  capitulo_id: number;
  capitulo_numero: number;
  frase_id: number;
  frase_ordem: number;
}
type Aparicoes = Record<string, { primeira: Aparicao | null; ultima: Aparicao | null }>;

export function Glossario() {
  const { obraId } = useParams();
  const clienteQuery = useQueryClient();
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [erro, setErro] = useState('');
  const [mostrarImportar, setMostrarImportar] = useState(false);
  const [csv, setCsv] = useState('');
  const [relatorio, setRelatorio] = useState('');
  const [soNaoClassificados, setSoNaoClassificados] = useState(false);

  const chaveQuery = ['glossario', obraId, busca, categoria];
  const { data: entradas } = useQuery({
    queryKey: chaveQuery,
    queryFn: () =>
      api<EntradaGlossario[]>(
        'GET',
        `/obras/${obraId}/glossario?busca=${encodeURIComponent(busca)}&categoria=${categoria}`,
      ),
  });

  // Aparições (primeira/última) por termo — calculadas no servidor, independentes
  // dos filtros de busca/categoria. Keyed pelo id da entrada.
  const { data: aparicoes } = useQuery({
    queryKey: ['glossario-aparicoes', obraId],
    queryFn: () => api<Aparicoes>('GET', `/obras/${obraId}/glossario/aparicoes`),
  });

  const invalidar = () => {
    clienteQuery.invalidateQueries({ queryKey: ['glossario', obraId] });
    clienteQuery.invalidateQueries({ queryKey: ['glossario-aparicoes', obraId] });
  };

  const criar = useMutation({
    mutationFn: (dados: { termo_zh: string; termo_pt: string; categoria: CategoriaGlossario; nota?: string }) =>
      api('POST', `/obras/${obraId}/glossario`, dados),
    onSuccess: () => {
      invalidar();
      setErro('');
    },
    onError: (e) => setErro((e as Error).message),
  });

  // "Só não classificados" filtra as LINHAS mostradas, não a lista de candidatas
  // a variante/termo pai (essa continua vindo de `entradas` inteiro, abaixo) —
  // senão marcar o filtro tiraria do ar as opções que o revisor precisa escolher.
  const visiveis = soNaoClassificados ? (entradas ?? []).filter((e) => e.especie == null) : (entradas ?? []);

  const importar = useMutation({
    mutationFn: () => api<{ inseridos: number; duplicados: number; invalidos: number }>('POST', `/obras/${obraId}/glossario/importar`, { csv }),
    onSuccess: (r) => {
      invalidar();
      setRelatorio(`Importação: ${r.inseridos} inseridos, ${r.duplicados} duplicados, ${r.invalidos} inválidos.`);
      setCsv('');
      setMostrarImportar(false);
    },
    onError: (e) => setErro((e as Error).message),
  });

  return (
    <div>
      <CabecalhoPagina
        titulo="Glossário"
        descricao={
          entradas ? `${entradas.length} termo${entradas.length === 1 ? '' : 's'} — a fonte da consistência.` : undefined
        }
      >
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar termo…"
          className="entrada text-sm"
        />
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="entrada text-sm">
          <option value="">Todas as categorias</option>
          {[...new Set([...CATEGORIAS_GLOSSARIO, ...(entradas?.map((e) => e.categoria) ?? [])])].sort().map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <MenuMais titulo="Importar / exportar CSV">
          <button
            type="button"
            onClick={() => setMostrarImportar((v) => !v)}
            className="rounded px-2 py-1.5 text-left text-sm text-tinta hover:bg-papel-fundo"
          >
            Importar CSV…
          </button>
          <a
            href={`/api/obras/${obraId}/glossario/exportar`}
            download
            className="rounded px-2 py-1.5 text-sm text-tinta hover:bg-papel-fundo"
          >
            Exportar CSV
          </a>
        </MenuMais>
      </CabecalhoPagina>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {relatorio && <Aviso tipo="ok">{relatorio}</Aviso>}
      {entradas && entradas.length > 0 && <ContadorClassificacao entradas={entradas} soNaoClassificados={soNaoClassificados} aoMudarFiltro={setSoNaoClassificados} />}

      {mostrarImportar && (
        <div className="mb-4 space-y-2 cartao p-4">
          <p className="text-sm text-tinta-2">
            Cole o CSV: <code>termo_zh,termo_pt,categoria,nota</code> (categoria e nota opcionais).
          </p>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={6}
            className="entrada w-full font-mono text-xs"
          />
          <Botao onClick={() => importar.mutate()} disabled={!csv.trim() || importar.isPending}>
            Importar
          </Botao>
        </div>
      )}

      <FormularioNovoTermo enviando={criar.isPending} aoEnviar={(d) => criar.mutate(d)} />

      <table className="w-full border-collapse overflow-hidden cartao text-sm">
        <thead>
          <tr className="bg-papel-fundo/60 text-left">
            <th className="olho whitespace-nowrap border-b border-linha px-2 py-2">Termo 中文</th>
            <th className="olho whitespace-nowrap border-b border-linha px-2 py-2">Tradução PT-BR</th>
            <th className="olho whitespace-nowrap border-b border-linha px-2 py-2">Categoria</th>
            <th className="olho whitespace-nowrap border-b border-linha px-2 py-2">Nota</th>
            <th className="olho whitespace-nowrap border-b border-linha px-2 py-2">Aparições</th>
            <th className="border-b border-linha px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {ordenarComVariantes(visiveis).map((e) => (
            <LinhaTermo
              key={e.id}
              // `todas` fica com a lista INTEIRA (não filtrada pelo checkbox): é a
              // origem das candidatas a variante e a termo pai, que continuam
              // escolhíveis mesmo com "só não classificados" marcado.
              entrada={e}
              aparicao={aparicoes?.[e.id]}
              todas={entradas ?? []}
              aoMudar={invalidar}
              aoErro={setErro}
            />
          ))}
          {visiveis.length === 0 && (
            <tr>
              <td colSpan={6} className="px-2 py-4 text-center text-tinta-2">
                {soNaoClassificados ? 'Nenhum termo sem classificação.' : 'Nenhum termo encontrado.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** O banner do topo (spec §7): "N termos ainda sem classificação", com o
 *  filtro que isola só eles. Sem número à vista, o campo novo não é preenchido
 *  — são 116 termos e o padrão preserva o comportamento de hoje, então nada
 *  além deste contador empurra o revisor a responder. */
function ContadorClassificacao({
  entradas,
  soNaoClassificados,
  aoMudarFiltro,
}: {
  entradas: EntradaGlossario[];
  soNaoClassificados: boolean;
  aoMudarFiltro: (v: boolean) => void;
}) {
  const n = contarNaoClassificados(entradas);
  return (
    <Aviso tipo="info">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {n === 0
            ? 'Todos os termos têm espécie classificada.'
            : `${n} termo${n === 1 ? '' : 's'} ainda sem classificação — sem espécie, o prompt trata a forma como identidade (o comportamento de hoje).`}
        </span>
        {n > 0 && (
          <label className="flex shrink-0 items-center gap-1.5 text-xs font-medium">
            <input
              type="checkbox"
              checked={soNaoClassificados}
              onChange={(e) => aoMudarFiltro(e.target.checked)}
            />
            Mostrar só os não classificados
          </label>
        )}
      </div>
    </Aviso>
  );
}

function FormularioNovoTermo({
  aoEnviar,
  enviando,
}: {
  aoEnviar: (d: { termo_zh: string; termo_pt: string; categoria: CategoriaGlossario; nota?: string }) => void;
  enviando: boolean;
}) {
  const [zh, setZh] = useState('');
  const [pt, setPt] = useState('');
  const [cat, setCat] = useState<CategoriaGlossario>('outro');
  const [nota, setNota] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        aoEnviar({ termo_zh: zh.trim(), termo_pt: pt.trim(), categoria: cat, nota: nota.trim() || undefined });
        setZh('');
        setPt('');
        setNota('');
      }}
      className="mb-4 flex flex-wrap items-end gap-2 cartao p-3"
    >
      <input required value={zh} onChange={(e) => setZh(e.target.value)} placeholder="termo chinês" className="texto-zh w-48 entrada text-sm" />
      <input required value={pt} onChange={(e) => setPt(e.target.value)} placeholder="tradução PT-BR" className="w-48 entrada text-sm" />
      <SeletorCategoria valor={cat} aoMudar={setCat} />
      <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="nota (opcional)" className="flex-1 entrada text-sm" />
      <Botao type="submit" disabled={enviando}>
        Adicionar
      </Botao>
    </form>
  );
}

function CelulaAparicoes({
  obraId,
  aparicao,
}: {
  obraId: string | undefined;
  aparicao?: { primeira: Aparicao | null; ultima: Aparicao | null };
}) {
  const link = (a: Aparicao) => `/obras/${obraId}/capitulos/${a.capitulo_id}?frase=${a.frase_id}`;
  const primeira = aparicao?.primeira;
  const ultima = aparicao?.ultima;
  if (!primeira) return <span className="text-tinta-2">—</span>;
  // Chip com fundo colorido (tokens do Etiqueta): jade = primeira, selo = última.
  // A cor + a ordem já dizem qual é qual; o tooltip confirma.
  const chip = (cor: 'jade' | 'selo') =>
    `inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium hover:underline ${
      cor === 'jade'
        ? 'border-jade-forte/40 bg-jade-tint text-jade-forte'
        : 'border-selo-forte/40 bg-selo-tint text-selo-forte'
    }`;
  return (
    <span className="flex flex-wrap gap-1">
      <Link to={link(primeira)} className={chip('jade')} title="Primeira aparição — ir à frase">
        cap. {primeira.capitulo_numero}
      </Link>
      {ultima && ultima.frase_id !== primeira.frase_id && (
        <Link to={link(ultima)} className={chip('selo')} title="Última aparição — ir à frase">
          cap. {ultima.capitulo_numero}
        </Link>
      )}
    </span>
  );
}

// Ordena com cada variante logo abaixo da sua canônica; variantes cuja canônica
// não está na lista (por causa de filtro de busca/categoria) vão soltas ao fim.
function ordenarComVariantes(entradas: EntradaGlossario[]): EntradaGlossario[] {
  const out: EntradaGlossario[] = [];
  const incluidos = new Set<number>();
  for (const c of entradas.filter((e) => e.principal_id == null)) {
    out.push(c);
    incluidos.add(c.id);
    for (const v of entradas.filter((e) => e.principal_id === c.id)) {
      out.push(v);
      incluidos.add(v.id);
    }
  }
  for (const e of entradas) if (!incluidos.has(e.id)) out.push(e);
  return out;
}

function LinhaTermo({
  entrada,
  aparicao,
  todas,
  aoMudar,
  aoErro,
}: {
  entrada: EntradaGlossario;
  aparicao?: { primeira: Aparicao | null; ultima: Aparicao | null };
  todas: EntradaGlossario[];
  aoMudar: () => void;
  aoErro: (m: string) => void;
}) {
  const { obraId } = useParams();
  const [editando, setEditando] = useState(false);
  const [pt, setPt] = useState(entrada.termo_pt);
  const [cat, setCat] = useState(entrada.categoria);
  const [nota, setNota] = useState(entrada.nota ?? '');
  const [principalSel, setPrincipalSel] = useState<number | null>(entrada.principal_id);
  // '' representa "não classificado" (especie: null) — estado distinto de já
  // ter escolhido uma espécie, não um terceiro valor de verdade.
  const [especie, setEspecie] = useState<EspecieTermo | ''>(entrada.especie ?? '');
  const [notaUso, setNotaUso] = useState(entrada.nota_uso ?? '');
  const [termoPaiSel, setTermoPaiSel] = useState<number | null>(entrada.termo_pai_id);
  // O gatilho chinês nem sempre é este termo: 小心 é "cuidado" em 7 das 8
  // ocorrências da obra, e a criada Xiao Xin em 1. Sem este controle na tela, o
  // campo existia no banco e no prompt mas era inalcançável pelo revisor — e a
  // varredura seguia acusando as 7.
  const [ambiguo, setAmbiguo] = useState(entrada.ambiguo);

  const ehVariante = entrada.principal_id != null;
  const principal = ehVariante ? todas.find((e) => e.id === entrada.principal_id) : undefined;
  const variantes = todas.filter((e) => e.principal_id === entrada.id);
  // Candidatas a canônica: outras entradas que já são canônicas (nível único).
  const candidatasPrincipal = todas.filter((e) => e.id !== entrada.id && e.principal_id == null);
  // Candidatas a pai: qualquer outro termo da obra. `termo_pai_id` é
  // PERTENCIMENTO (西堡 dentro de 金鹏堡) — não tem a restrição de nível único
  // de `principal_id`, que é VARIANTE do mesmo referente; os dois convivem.
  const candidatasPai = todas.filter((e) => e.id !== entrada.id);

  const salvar = useMutation({
    mutationFn: async () => {
      await api('PATCH', `/glossario/${entrada.id}`, {
        termo_pt: pt,
        categoria: cat,
        nota: nota || null,
        // O schema do PATCH aceita `especie` só como enum-ou-ausente (não
        // nullable) — não existe "desclassificar" pela tela, então '' aqui
        // significa "não mexer", nunca "apagar".
        ...(especie !== '' ? { especie } : {}),
        // Também não é nullable no schema; string vazia é o jeito de limpar
        // sem quebrar a validação (o prompt já trata nota_uso vazia como ausente).
        nota_uso: notaUso.trim(),
        termo_pai_id: termoPaiSel,
        ambiguo,
      });
      if ((principalSel ?? null) !== (entrada.principal_id ?? null)) {
        await api('POST', `/glossario/${entrada.id}/vincular`, { principal_id: principalSel });
      }
    },
    onSuccess: () => {
      setEditando(false);
      aoMudar();
    },
    onError: (e) => aoErro((e as Error).message),
  });

  const excluir = useMutation({
    mutationFn: () => api('DELETE', `/glossario/${entrada.id}`),
    onSuccess: aoMudar,
  });

  // Substituir a tradução deste termo nas frases já traduzidas.
  const clienteQuery = useQueryClient();
  const [substituindo, setSubstituindo] = useState(false);
  const [de, setDe] = useState('');
  const [previa, setPrevia] = useState<number | null>(null);
  const [aplicado, setAplicado] = useState<number | null>(null);

  const abrirSubstituir = () => {
    setSubstituindo((v) => !v);
    setDe('');
    setPrevia(null);
    setAplicado(null);
  };
  const prever = useMutation({
    mutationFn: () =>
      api<{ frases: number; capitulos: number }>('POST', `/glossario/${entrada.id}/substituir`, { de, previa: true }),
    onSuccess: (r) => {
      setPrevia(r.frases);
      setAplicado(null);
      aoErro('');
    },
    onError: (e) => aoErro((e as Error).message),
  });
  const aplicar = useMutation({
    mutationFn: () =>
      api<{ frases: number; capitulos: number }>('POST', `/glossario/${entrada.id}/substituir`, { de, previa: false }),
    onSuccess: (r) => {
      setAplicado(r.frases);
      setPrevia(null);
      clienteQuery.invalidateQueries({ queryKey: ['capitulo'] });
      aoErro('');
    },
    onError: (e) => aoErro((e as Error).message),
  });

  if (!editando) {
    return (
      <>
      <tr className="group border-b border-linha/60 last:border-b-0 hover:bg-papel-fundo/40">
        <td className={`texto-zh whitespace-nowrap px-2 py-2 ${ehVariante ? 'pl-6 text-tinta-2' : ''}`}>
          {ehVariante && <span className="mr-1">↳</span>}
          {entrada.termo_zh}
        </td>
        <td className="px-2 py-2">
          {entrada.termo_pt}
          {principal && (
            <span className="ml-2 text-xs text-tinta-2">variante de {principal.termo_pt}</span>
          )}
        </td>
        <td className="whitespace-nowrap px-2 py-2">
          <span className="inline-flex items-center gap-1.5">
            <Etiqueta>{entrada.categoria}</Etiqueta>
            {entrada.origem === 'sugerido-ia' && <Etiqueta cor="indigo">IA</Etiqueta>}
          </span>
        </td>
        <td className="px-2 py-2 text-tinta-2">
          <span className="block max-w-[42ch]">{entrada.nota}</span>
        </td>
        <td className="px-2 py-2">
          <CelulaAparicoes obraId={obraId} aparicao={aparicao} />
        </td>
        <td className="w-px px-2 py-2 text-right whitespace-nowrap">
          <span className={`inline-flex gap-1 ${substituindo ? '' : 'invisible group-hover:visible'}`}>
            <button
              onClick={abrirSubstituir}
              aria-pressed={substituindo}
              title="Substituir esta tradução nas frases já traduzidas"
              aria-label="Substituir nas traduções"
              className={`grid size-6 place-items-center rounded ${
                substituindo ? 'bg-jade text-papel-alto' : 'text-tinta-2 hover:bg-papel-fundo hover:text-tinta'
              }`}
            >
              ⇄
            </button>
            <button
              onClick={() => setEditando(true)}
              title="Editar termo"
              aria-label="Editar termo"
              className="grid size-6 place-items-center rounded text-tinta-2 hover:bg-papel-fundo hover:text-tinta"
            >
              ✎
            </button>
            <button
              onClick={() => window.confirm(`Excluir "${entrada.termo_zh}"?`) && excluir.mutate()}
              title="Excluir termo"
              aria-label="Excluir termo"
              className="grid size-6 place-items-center rounded text-erro hover:bg-selo-tint hover:text-selo-forte"
            >
              ✕
            </button>
          </span>
        </td>
      </tr>
      {substituindo && (
        <tr className="border-b border-linha/60 bg-papel-fundo/40">
          <td colSpan={6} className="px-2 py-2">
            <div className="flex flex-wrap items-end gap-2 text-sm">
              <label className="text-xs text-tinta-2">
                Substituir o texto
                <input
                  value={de}
                  onChange={(e) => {
                    setDe(e.target.value);
                    setPrevia(null);
                    setAplicado(null);
                  }}
                  placeholder="tradução antiga (ex.: Abismo)"
                  className="entrada mt-0.5 block w-56 text-sm"
                />
              </label>
              <span className="pb-1.5 text-tinta-2">
                por <span className="font-medium text-tinta">{entrada.termo_pt}</span>
              </span>
              <Botao
                variante="secundario"
                onClick={() => prever.mutate()}
                disabled={!de.trim() || prever.isPending}
              >
                {prever.isPending ? 'Contando…' : 'Prever'}
              </Botao>
              {previa != null && (
                <>
                  <span className="pb-1.5 text-tinta-2">
                    {previa === 0 ? 'nenhuma frase' : `${previa} frase${previa === 1 ? '' : 's'}`} a trocar
                  </span>
                  {previa > 0 && (
                    <Botao onClick={() => aplicar.mutate()} disabled={aplicar.isPending}>
                      {aplicar.isPending ? 'Aplicando…' : 'Aplicar'}
                    </Botao>
                  )}
                </>
              )}
              {aplicado != null && (
                <span className="pb-1.5 text-jade-forte">
                  Trocado em {aplicado} frase{aplicado === 1 ? '' : 's'}.
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-tinta-2">
              Só nas frases cujo original tem {entrada.termo_zh}, e só em palavra isolada. As frases trocadas passam a
              contar como editadas.
            </p>
          </td>
        </tr>
      )}
      </>
    );
  }

  return (
    <>
      <tr className="border-b border-linha/60 bg-ocre-tint last:border-b-0">
        <td className="texto-zh whitespace-nowrap px-2 py-2">{entrada.termo_zh}</td>
        <td className="px-2 py-1">
          <input value={pt} onChange={(e) => setPt(e.target.value)} className="w-full entrada" />
        </td>
        <td className="px-2 py-1">
          <SeletorCategoria valor={cat} aoMudar={setCat} className="entrada" />
        </td>
        <td className="px-2 py-1 align-top">
          <input value={nota} onChange={(e) => setNota(e.target.value)} className="w-full entrada" />
          {variantes.length > 0 ? (
            <p className="mt-1 text-xs text-tinta-2">Termo principal de {variantes.length} variante(s).</p>
          ) : (
            <label className="mt-1 block text-xs text-tinta-2">
              Variante de:
              <select
                value={principalSel ?? ''}
                onChange={(e) => setPrincipalSel(e.target.value ? Number(e.target.value) : null)}
                className="entrada mt-0.5 block w-full text-sm"
              >
                <option value="">— é um termo principal —</option>
                {candidatasPrincipal.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.termo_pt} ({c.termo_zh})
                  </option>
                ))}
              </select>
            </label>
          )}
        </td>
        <td className="px-2 py-1 align-top">
          <CelulaAparicoes obraId={obraId} aparicao={aparicao} />
        </td>
        <td className="px-2 py-1 text-right whitespace-nowrap">
          <Botao onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            Salvar
          </Botao>
          <button onClick={() => setEditando(false)} className="ml-2 text-xs text-tinta-2 underline">
            cancelar
          </button>
        </td>
      </tr>
      {/* Linha própria para a classificação (espécie/nota de uso/termo pai):
         são os campos que fazem a Task 5 existir, e amontoá-los na linha
         principal os deixaria fáceis de pular. */}
      <tr className="border-b border-linha/60 bg-ocre-tint/60 last:border-b-0">
        <td colSpan={6} className="px-2 py-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-tinta-2" htmlFor={`especie-${entrada.id}`}>
                Espécie
              </label>
              <select
                id={`especie-${entrada.id}`}
                value={especie}
                onChange={(e) => setEspecie(e.target.value as EspecieTermo | '')}
                className="entrada mt-0.5 block w-full text-sm"
              >
                <option value="">Não classificado — hoje se comporta como identidade</option>
                {ESPECIES_TERMO.map((esp) => (
                  <option key={esp} value={esp}>
                    {esp === 'identidade' ? 'Identidade' : 'Escolha de palavra'}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-tinta-2">
                {DESCRICAO_ESPECIE[especie === 'lexical' ? 'lexical' : 'identidade']}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-tinta-2" htmlFor={`nota-uso-${entrada.id}`}>
                Nota de uso
              </label>
              <input
                id={`nota-uso-${entrada.id}`}
                value={notaUso}
                onChange={(e) => setNotaUso(e.target.value)}
                maxLength={200}
                placeholder='Ex.: "Só é a criada Xiao Xin quando for nome de pessoa; nos demais usos é substantivo comum."'
                className="entrada mt-0.5 block w-full text-sm"
              />
              <p className="mt-1 text-xs text-tinta-2">
                Quando o termo se aplica — vale nas duas espécies. Nunca é a tradução do sentido comum: escrever
                "senão é 'cuidado'" fixaria essa palavra fora do glossário.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-tinta-2" htmlFor={`ambiguo-${entrada.id}`}>
                Gatilho ambíguo
              </label>
              <label className="mt-0.5 flex items-center gap-2 text-sm" htmlFor={`ambiguo-${entrada.id}`}>
                <input
                  id={`ambiguo-${entrada.id}`}
                  type="checkbox"
                  checked={ambiguo}
                  onChange={(e) => setAmbiguo(e.target.checked)}
                />
                <span>O chinês nem sempre é este termo</span>
              </label>
              <p className="mt-1 text-xs text-tinta-2">
                Marque quando o gatilho tiver outro sentido comum — 小心 é "cuidado" na maior parte das vezes e a
                criada Xiao Xin em poucas. O termo sai da contagem de consistência e vai para a lista de conferência,
                em vez de acusar as ocorrências que não são ele.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-tinta-2" htmlFor={`termo-pai-${entrada.id}`}>
                Termo pai
              </label>
              <select
                id={`termo-pai-${entrada.id}`}
                value={termoPaiSel ?? ''}
                onChange={(e) => setTermoPaiSel(e.target.value ? Number(e.target.value) : null)}
                className="entrada mt-0.5 block w-full text-sm"
              >
                <option value="">— nenhum —</option>
                {candidatasPai.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.termo_pt} ({c.termo_zh})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-tinta-2">
                Pertencimento (西堡 dentro de 金鹏堡), não variante — isso já existe acima, em "Variante de".
              </p>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}
