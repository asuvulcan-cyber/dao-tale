import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoriaGlossario, CriarObraPayload, Obra, ObraComContadores } from '@dao-tale/shared';
import { CATEGORIAS_GLOSSARIO } from '@dao-tale/shared';
import { api } from '../api';
import { Aviso, Botao, CabecalhoPagina, Etiqueta } from '../App';

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
      <CabecalhoPagina titulo="Obras" descricao="Sua estante de traduções.">
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
          {importar.isPending ? 'Importando…' : 'Importar (.json)'}
        </Botao>
        <Botao onClick={() => setMostrarFormulario((v) => !v)}>
          {mostrarFormulario ? 'Cancelar' : 'Nova obra'}
        </Botao>
      </CabecalhoPagina>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {mostrarFormulario && <FormularioNovaObra enviando={criar.isPending} aoEnviar={(p) => criar.mutate(p)} />}

      {isLoading && <p className="text-tinta-2">Carregando…</p>}
      {obras?.length === 0 && !mostrarFormulario && (
        <p className="text-tinta-2">Nenhuma obra ainda. Crie a primeira com “Nova obra”.</p>
      )}

      {/* Estante: a capa é a protagonista; ações raras no ⋯ (guia §五.1) */}
      <div className="grid gap-4 sm:grid-cols-2">
        {obras?.map((obra) => (
          <div key={obra.id} className="cartao group relative flex gap-4 p-4">
            <Link to={`/obras/${obra.id}`} className="shrink-0" tabIndex={-1}>
              {obra.tem_capa ? (
                <img
                  src={`/api/obras/${obra.id}/capa`}
                  alt={`Capa de ${obra.titulo}`}
                  className="h-32 w-22 rounded object-cover shadow-md shadow-tinta/20"
                />
              ) : (
                <div
                  className="texto-zh grid h-32 w-22 place-items-center rounded bg-papel-fundo text-4xl text-tinta-2/50 shadow-md shadow-tinta/20"
                  aria-hidden
                >
                  道
                </div>
              )}
            </Link>
            <div className="flex min-w-0 flex-1 flex-col">
              <Link to={`/obras/${obra.id}`} className="pr-8 hover:underline">
                <h2 className="font-display text-lg font-semibold leading-snug">{obra.titulo}</h2>
                {obra.titulo_original && <p className="texto-zh text-sm text-tinta-2">{obra.titulo_original}</p>}
              </Link>
              {obra.sinopse && <p className="mt-1.5 line-clamp-2 text-sm text-tinta-2">{obra.sinopse}</p>}
              <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                {obra.tags.map((tag) => (
                  <Etiqueta key={tag} cor="indigo">
                    {tag}
                  </Etiqueta>
                ))}
                <Etiqueta>{obra.capitulos_total} capítulos</Etiqueta>
                <Etiqueta>{obra.glossario_total} termos</Etiqueta>
                {obra.testes_pendentes > 0 && <Etiqueta cor="ocre">{obra.testes_pendentes} casos pendentes</Etiqueta>}
                {obra.termos_sugeridos_pendentes > 0 && (
                  <Etiqueta cor="indigo">{obra.termos_sugeridos_pendentes} sugeridos</Etiqueta>
                )}
              </div>
            </div>
            <details className="absolute top-3 right-3">
              <summary
                className="grid size-7 cursor-pointer list-none place-items-center rounded-md border border-transparent text-tinta-2 group-hover:border-linha hover:border-jade hover:text-jade-forte [&::-webkit-details-marker]:hidden"
                title="Exportar ou excluir"
              >
                ⋯
              </summary>
              <div className="cartao absolute right-0 z-10 mt-1 flex w-44 flex-col gap-1 p-2 shadow-lg">
                <a
                  href={`/api/obras/${obra.id}/exportar`}
                  download
                  className="rounded px-2 py-1.5 text-sm text-tinta hover:bg-papel-fundo"
                  title="Backup completo (capítulos, glossário, prompts e banco de testes) — reimportável"
                >
                  Exportar backup
                </a>
                <button
                  type="button"
                  onClick={() => excluir.mutate(obra)}
                  className="rounded px-2 py-1.5 text-left text-sm text-erro hover:bg-selo-tint"
                >
                  Excluir obra…
                </button>
              </div>
            </details>
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
    <form onSubmit={enviar} className="mb-6 space-y-3 cartao p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Título*
          <input
            required
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="entrada mt-1 w-full"
            placeholder="Dez Dias Até o Fim"
          />
        </label>
        <label className="block text-sm">
          Título original (chinês)
          <input
            value={tituloOriginal}
            onChange={(e) => setTituloOriginal(e.target.value)}
            className="texto-zh entrada mt-1 w-full"
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
          className="entrada mt-1 w-full"
          placeholder="Resumo curto da obra, para o cartão na lista…"
        />
      </label>
      <label className="block text-sm">
        Tags (opcional — separadas por vírgula)
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className="entrada mt-1 w-full"
          placeholder="xianxia, suspense, sistema"
        />
      </label>
      <label className="block text-sm">
        Prompt mãe inicial (versão 1.0 — pode colar o .md inteiro; opcional, mas necessário antes de traduzir)
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
          className="entrada mt-1 w-full font-mono text-xs"
        />
      </label>
      <label className="block text-sm">
        Glossário inicial (opcional — uma linha por termo: <code>termo_zh,termo_pt,categoria</code>)
        <textarea
          value={glossarioCsv}
          onChange={(e) => setGlossarioCsv(e.target.value)}
          rows={4}
          className="entrada mt-1 w-full font-mono text-xs"
          placeholder="终焉,Fim Derradeiro,outro"
        />
      </label>
      <Botao type="submit" disabled={enviando}>
        {enviando ? 'Criando…' : 'Criar obra'}
      </Botao>
    </form>
  );
}
