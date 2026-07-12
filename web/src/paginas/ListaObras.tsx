import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoriaGlossario, CriarObraPayload, Obra, ObraComContadores } from '@dao-tale/shared';
import { CATEGORIAS_GLOSSARIO } from '@dao-tale/shared';
import { api } from '../api';
import { Aviso, Botao, Etiqueta } from '../App';

export function ListaObras() {
  const clienteQuery = useQueryClient();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [erro, setErro] = useState('');

  const { data: obras, isLoading } = useQuery({
    queryKey: ['obras'],
    queryFn: () => api<ObraComContadores[]>('GET', '/obras'),
  });

  const criar = useMutation({
    mutationFn: (payload: CriarObraPayload) => api<Obra>('POST', '/obras', payload),
    onSuccess: () => {
      clienteQuery.invalidateQueries({ queryKey: ['obras'] });
      setMostrarFormulario(false);
      setErro('');
    },
    onError: (e) => setErro((e as Error).message),
  });

  const inputImportar = useRef<HTMLInputElement>(null);
  const importar = useMutation({
    mutationFn: async (arquivo: File) => {
      const dados = JSON.parse(await arquivo.text());
      return api<Obra>('POST', '/obras/importar', dados);
    },
    onSuccess: () => {
      clienteQuery.invalidateQueries({ queryKey: ['obras'] });
      setErro('');
    },
    onError: (e) =>
      setErro(e instanceof SyntaxError ? 'O arquivo selecionado não é um JSON válido.' : (e as Error).message),
  });

  const excluir = useMutation({
    mutationFn: async (obra: ObraComContadores) => {
      const impacto = await api<Record<string, number>>('DELETE', `/obras/${obra.id}?simular=1`);
      const detalhe = Object.entries(impacto)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${n} ${k.replace('_', ' ')}`)
        .join(', ');
      const mensagem = detalhe
        ? `Excluir "${obra.titulo}"?\n\nSerão perdidos em cascata: ${detalhe}.`
        : `Excluir "${obra.titulo}"?`;
      if (!window.confirm(mensagem)) return;
      await api('DELETE', `/obras/${obra.id}`);
    },
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: ['obras'] }),
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Obras</h1>
        <div className="flex gap-2">
          <input
            ref={inputImportar}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) importar.mutate(arquivo);
              e.target.value = '';
            }}
          />
          <Botao variante="secundario" onClick={() => inputImportar.current?.click()} disabled={importar.isPending}>
            {importar.isPending ? 'Importando…' : 'Importar obra (.json)'}
          </Botao>
          <Botao onClick={() => setMostrarFormulario((v) => !v)}>
            {mostrarFormulario ? 'Cancelar' : 'Nova obra'}
          </Botao>
        </div>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {mostrarFormulario && <FormularioNovaObra enviando={criar.isPending} aoEnviar={(p) => criar.mutate(p)} />}

      {isLoading && <p className="text-stone-500">Carregando…</p>}
      {obras?.length === 0 && !mostrarFormulario && (
        <p className="text-stone-500">Nenhuma obra ainda. Crie a primeira com “Nova obra”.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {obras?.map((obra) => (
          <div key={obra.id} className="flex gap-3 rounded-lg border border-stone-300 bg-white p-4">
            {obra.tem_capa && (
              <Link to={`/obras/${obra.id}`} className="shrink-0">
                <img
                  src={`/api/obras/${obra.id}/capa`}
                  alt={`Capa de ${obra.titulo}`}
                  className="h-28 w-20 rounded object-cover shadow-sm"
                />
              </Link>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between">
                <Link to={`/obras/${obra.id}`} className="hover:underline">
                  <h2 className="text-lg font-semibold">{obra.titulo}</h2>
                  {obra.titulo_original && <p className="texto-zh text-sm text-stone-500">{obra.titulo_original}</p>}
                </Link>
                <div className="flex shrink-0 gap-2">
                  <a href={`/api/obras/${obra.id}/exportar`} download title="Backup completo (capítulos, glossário, prompts e banco de testes) — reimportável">
                    <Botao variante="secundario">Exportar</Botao>
                  </a>
                  <Botao variante="perigo" onClick={() => excluir.mutate(obra)}>
                    Excluir
                  </Botao>
                </div>
              </div>
              {obra.sinopse && <p className="mt-1 line-clamp-2 text-sm text-stone-600">{obra.sinopse}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {obra.tags.map((tag) => (
                  <Etiqueta key={tag} cor="indigo">
                    {tag}
                  </Etiqueta>
                ))}
                <Etiqueta>{obra.capitulos_total} capítulos</Etiqueta>
                <Etiqueta>{obra.glossario_total} termos</Etiqueta>
                {obra.testes_pendentes > 0 && <Etiqueta cor="ocre">{obra.testes_pendentes} casos pendentes</Etiqueta>}
                {obra.termos_sugeridos_pendentes > 0 && (
                  <Etiqueta cor="indigo">{obra.termos_sugeridos_pendentes} termos sugeridos</Etiqueta>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FormularioNovaObra({
  aoEnviar,
  enviando,
}: {
  aoEnviar: (p: CriarObraPayload) => void;
  enviando: boolean;
}) {
  const [titulo, setTitulo] = useState('');
  const [tituloOriginal, setTituloOriginal] = useState('');
  const [sinopse, setSinopse] = useState('');
  const [tags, setTags] = useState('');
  const [prompt, setPrompt] = useState('');
  const [glossarioCsv, setGlossarioCsv] = useState('');

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const payload: CriarObraPayload = { titulo: titulo.trim() };
    if (tituloOriginal.trim()) payload.titulo_original = tituloOriginal.trim();
    if (sinopse.trim()) payload.sinopse = sinopse.trim();
    const listaTags = tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (listaTags.length > 0) payload.tags = listaTags;
    if (prompt.trim()) payload.prompt_inicial = { versao: '1.0', conteudo: prompt };
    if (glossarioCsv.trim()) {
      payload.glossario_inicial = glossarioCsv
        .split(/\r?\n/)
        .map((l) => l.split(',').map((c) => c.trim()))
        .filter((c) => c[0] && c[1] && !/termo|zh/i.test(c[0]))
        .map(([termo_zh, termo_pt, categoria]) => ({
          termo_zh,
          termo_pt,
          categoria: (CATEGORIAS_GLOSSARIO as string[]).includes(categoria)
            ? (categoria as CategoriaGlossario)
            : undefined,
        }));
    }
    aoEnviar(payload);
  }

  return (
    <form onSubmit={enviar} className="mb-6 space-y-3 rounded-lg border border-stone-300 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Título*
          <input
            required
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5"
            placeholder="Dez Dias Até o Fim"
          />
        </label>
        <label className="block text-sm">
          Título original (chinês)
          <input
            value={tituloOriginal}
            onChange={(e) => setTituloOriginal(e.target.value)}
            className="texto-zh mt-1 w-full rounded border border-stone-300 px-2 py-1.5"
            placeholder="十日终焉"
          />
        </label>
      </div>
      <label className="block text-sm">
        Sinopse (opcional)
        <textarea
          value={sinopse}
          onChange={(e) => setSinopse(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5"
          placeholder="Resumo curto da obra, para o cartão na lista…"
        />
      </label>
      <label className="block text-sm">
        Tags (opcional — separadas por vírgula)
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5"
          placeholder="xianxia, suspense, sistema"
        />
      </label>
      <label className="block text-sm">
        Prompt mãe inicial (versão 1.0 — pode colar o .md inteiro; opcional, mas necessário antes de traduzir)
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
          className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 font-mono text-xs"
        />
      </label>
      <label className="block text-sm">
        Glossário inicial (opcional — uma linha por termo: <code>termo_zh,termo_pt,categoria</code>)
        <textarea
          value={glossarioCsv}
          onChange={(e) => setGlossarioCsv(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 font-mono text-xs"
          placeholder="终焉,Fim Derradeiro,outro"
        />
      </label>
      <Botao type="submit" disabled={enviando}>
        {enviando ? 'Criando…' : 'Criar obra'}
      </Botao>
    </form>
  );
}
