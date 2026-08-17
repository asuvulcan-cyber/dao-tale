// Cadastro de termo a partir da seleção no editor (mesma forma do BannerTroca em
// EditorCapitulo.tsx: barra flutuante que nasce do que o revisor acabou de fazer
// no texto, sem exigir sair para a aba Glossário).
//
// Decisão central: a seleção dá UM lado. O outro nasce vazio, sempre, com o
// foco nele — nunca um palpite pré-preenchido. "Candidato óbvio" não tem
// definição que sobreviva ao texto real, e um palpite num campo prestes a ser
// confirmado é aceito sem leitura.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CategoriaGlossario, EntradaGlossario, EspecieTermo } from '@dao-tale/shared';
import { ESPECIES_TERMO } from '@dao-tale/shared';
import { api, ErroApi, mensagemDeErro } from '../api';
import { Aviso, Botao, SeletorCategoria } from '../App';
import type { Captura } from '../util/captura';

// Mesmo texto de Glossario.tsx (Task 5) — o revisor não deve reaprender o
// vocabulário ao trocar de tela.
const DESCRICAO_ESPECIE: Record<EspecieTermo, string> = {
  identidade: 'designa um referente específico — a palavra é essa, e a caixa segue a norma (金鹏堡 → Fortaleza do Peng Dourado).',
  lexical: 'a palavra é a resposta e a forma flexiona à vontade (刀 → sabre; "sabres" conta).',
};

export function CapturaTermo({
  captura,
  obraId,
  glossario,
  aoFechar,
}: {
  captura: Captura;
  obraId: string;
  /** A lista já carregada pelo editor (alimenta o marcador do texto) — reaproveitada
   *  aqui para mostrar o termo existente no 409, sem rota nova. */
  glossario: EntradaGlossario[] | undefined;
  aoFechar: () => void;
}) {
  const clienteQuery = useQueryClient();
  // O lado capturado entra preenchido; o outro começa vazio e recebe o foco
  // (autoFocus abaixo) — é o revisor quem escreve o par, olhando a frase.
  const [termoZh, setTermoZh] = useState(captura.lado === 'zh' ? captura.trecho : '');
  const [termoPt, setTermoPt] = useState(captura.lado === 'pt' ? captura.trecho : '');
  const [categoria, setCategoria] = useState<CategoriaGlossario>('outro');
  // '' = ainda não escolhida. Sem valor padrão: espécie escolhida na hora é o
  // ponto desta entrega (116 termos ficaram sem classificação por nascerem
  // assim, num formulário que não perguntava).
  const [especie, setEspecie] = useState<EspecieTermo | ''>('');
  const [notaUso, setNotaUso] = useState('');
  const [erro, setErro] = useState('');
  // Entrada já existente com este termo_zh, achada na lista local após um 409 —
  // não existe rota para pedir "qual é" ao servidor, e não é o caso de criar uma
  // nesta task só para isto.
  const [duplicado, setDuplicado] = useState<EntradaGlossario | 'desconhecido' | null>(null);

  const criar = useMutation({
    // `especie` só é chamada com o botão liberado (podeSalvar exige as duas
    // pontas + espécie escolhida), mas o envio condicional evita mandar '' ao
    // schema (que é enum fechado e recusaria) se algo chamar mutate() cedo demais.
    mutationFn: () =>
      api<EntradaGlossario>('POST', `/obras/${obraId}/glossario`, {
        termo_zh: termoZh.trim(),
        termo_pt: termoPt.trim(),
        categoria,
        ...(especie ? { especie } : {}),
        nota_uso: notaUso.trim() || undefined,
      }),
    onSuccess: () => {
      // A prova de que pegou é o grifo aparecer no texto na hora: o marcador do
      // editor (montarMarcadorGlossario) só repinta depois desta invalidação.
      clienteQuery.invalidateQueries({ queryKey: ['glossario', obraId] });
      window.getSelection()?.removeAllRanges();
      aoFechar();
    },
    onError: (e) => {
      if (e instanceof ErroApi && e.status === 409) {
        // Mostra o termo existente em vez de repetir a mensagem do servidor —
        // "já existe" sozinho não diz ao revisor o que já está lá.
        setDuplicado(glossario?.find((g) => g.termo_zh === termoZh.trim()) ?? 'desconhecido');
        return;
      }
      setDuplicado(null);
      setErro(mensagemDeErro(e));
    },
  });

  const podeSalvar = !!termoZh.trim() && !!termoPt.trim() && !!especie && !criar.isPending;

  return (
    <div className="fixed bottom-4 left-1/2 z-30 w-[28rem] max-w-[calc(100vw-2rem)] -translate-x-1/2">
      <div className="cartao space-y-2.5 border-jade/60 p-3 text-sm shadow-xl shadow-tinta/10">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Adicionar ao glossário</h3>
          <button onClick={aoFechar} aria-label="Fechar" className="text-tinta-2 hover:text-tinta">
            ✕
          </button>
        </div>

        {duplicado ? (
          <div className="space-y-2">
            <p>
              <span className="font-medium text-ocre-forte">Esse termo chinês já existe</span> no glossário desta
              obra.
            </p>
            {duplicado !== 'desconhecido' && (
              <p className="rounded bg-papel-fundo/60 px-2 py-1.5">
                <span className="texto-zh font-medium">{duplicado.termo_zh}</span> →{' '}
                <span className="font-medium">{duplicado.termo_pt}</span>
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/obras/${obraId}/glossario`}
                className="rounded border border-linha bg-papel-alto px-3 py-1.5 text-sm text-tinta hover:border-jade hover:text-jade-forte"
              >
                Abrir no Glossário
              </Link>
              <button onClick={aoFechar} className="text-xs text-tinta-2 underline hover:text-tinta">
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-medium text-tinta-2">
                Termo 中文
                <input
                  value={termoZh}
                  onChange={(e) => setTermoZh(e.target.value)}
                  autoFocus={captura.lado === 'pt'}
                  className="texto-zh entrada mt-0.5 block w-full text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-tinta-2">
                Tradução PT-BR
                <input
                  value={termoPt}
                  onChange={(e) => setTermoPt(e.target.value)}
                  autoFocus={captura.lado === 'zh'}
                  className="entrada mt-0.5 block w-full text-sm"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-medium text-tinta-2">
                Categoria
                <SeletorCategoria
                  valor={categoria}
                  aoMudar={setCategoria}
                  extras={[...new Set(glossario?.map((g) => g.categoria) ?? [])]}
                  className="entrada mt-0.5 block w-full text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-tinta-2">
                Espécie
                <select
                  required
                  value={especie}
                  onChange={(e) => setEspecie(e.target.value as EspecieTermo | '')}
                  className="entrada mt-0.5 block w-full text-sm"
                >
                  <option value="" disabled>
                    — escolha —
                  </option>
                  {ESPECIES_TERMO.map((esp) => (
                    <option key={esp} value={esp}>
                      {esp === 'identidade' ? 'Identidade' : 'Escolha de palavra'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {especie && <p className="text-xs text-tinta-2">{DESCRICAO_ESPECIE[especie]}</p>}

            <label className="block text-xs font-medium text-tinta-2">
              Nota de uso (opcional)
              <input
                value={notaUso}
                onChange={(e) => setNotaUso(e.target.value)}
                maxLength={200}
                placeholder='Ex.: "Só é a criada Xiao Xin quando for nome de pessoa."'
                className="entrada mt-0.5 block w-full text-sm"
              />
            </label>
            <p className="text-xs text-tinta-2">
              Quando o termo se aplica — vale nas duas espécies. Nunca é a tradução do sentido comum.
            </p>

            {erro && <Aviso tipo="erro">{erro}</Aviso>}

            <div className="flex items-center gap-2">
              <Botao onClick={() => criar.mutate()} disabled={!podeSalvar}>
                {criar.isPending ? 'Salvando…' : 'Adicionar'}
              </Botao>
              <button onClick={aoFechar} className="text-xs text-tinta-2 underline hover:text-tinta">
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
