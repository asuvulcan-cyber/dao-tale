import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import './estilos.css';
import { Casca, pintarBarraDoNavegador } from './App';
import { PortaoSessao } from './componentes/PortaoSessao';

function pagina<T extends Record<string, unknown>, K extends keyof T>(
  carregar: () => Promise<T>,
  nome: K,
) {
  return lazy(async () => ({ default: (await carregar())[nome] as React.ComponentType }));
}

// Cada tela vira um chunk independente. Casca e PortaoSessao continuam no
// primeiro carregamento porque são a moldura e a decisão de acesso do app.
const ListaObras = pagina(() => import('./paginas/ListaObras'), 'ListaObras');
const ObraLayout = pagina(() => import('./paginas/ObraLayout'), 'ObraLayout');
const Capitulos = pagina(() => import('./paginas/Capitulos'), 'Capitulos');
const EditorCapitulo = pagina(() => import('./paginas/EditorCapitulo'), 'EditorCapitulo');
const PasseEstilo = pagina(() => import('./paginas/PasseEstilo'), 'PasseEstilo');
const EdicoesManuais = pagina(() => import('./paginas/EdicoesManuais'), 'EdicoesManuais');
const Glossario = pagina(() => import('./paginas/Glossario'), 'Glossario');
const ConsistenciaObra = pagina(() => import('./paginas/ConsistenciaObra'), 'ConsistenciaObra');
const PromptMae = pagina(() => import('./paginas/PromptMae'), 'PromptMae');
const PaginaPromptPadrao = pagina(() => import('./paginas/PromptMae'), 'PaginaPromptPadrao');
const BancoTestes = pagina(() => import('./paginas/BancoTestes'), 'BancoTestes');
const TermosSugeridos = pagina(() => import('./paginas/TermosSugeridos'), 'TermosSugeridos');
const Configuracoes = pagina(() => import('./paginas/Configuracoes'), 'Configuracoes');
const Vocabulario = pagina(() => import('./paginas/Vocabulario'), 'Vocabulario');
const Changelog = pagina(() => import('./paginas/Changelog'), 'Changelog');
const Docs = pagina(() => import('./paginas/Docs'), 'Docs');
const ComparadorModelos = pagina(() => import('./paginas/ComparadorModelos'), 'ComparadorModelos');
const Telemetria = pagina(() => import('./paginas/Telemetria'), 'Telemetria');
const Leitor = pagina(() => import('./paginas/Leitor'), 'Leitor');
const Biblioteca = pagina(() => import('./paginas/Biblioteca'), 'Biblioteca');
const ObraPublica = pagina(() => import('./paginas/ObraPublica'), 'ObraPublica');
const LeitorPublico = pagina(() => import('./paginas/LeitorPublico'), 'LeitorPublico');
const Entrar = pagina(() => import('./paginas/Entrar'), 'Entrar');

function CarregandoPagina() {
  return (
    <div className="grid min-h-[40vh] place-items-center bg-papel px-6 text-sm text-tinta-2" role="status">
      Carregando…
    </div>
  );
}

function adiar(elemento: React.ReactNode) {
  return <Suspense fallback={<CarregandoPagina />}>{elemento}</Suspense>;
}

const clienteQuery = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

// Vitrine (doc 14): o roteador de quem chega sem senha. Quatro rotas, e a `*`
// devolve para a estante — assim um /configuracoes digitado à mão vira estante,
// não tela de erro nem pista de que existe um /configuracoes.
//
// `/ler/:obraId` é a CONTRACAPA (doc 14 §10), não o capítulo 1: um link
// compartilhado abre a obra se apresentando, e não o meio de uma cena. O
// capítulo tem endereço próprio e sempre com número.
const rotasVitrine = createBrowserRouter([
  { path: '/', element: adiar(<Biblioteca />) },
  { path: '/entrar', element: adiar(<Entrar />) },
  { path: '/ler/:obraId', element: adiar(<ObraPublica />) },
  { path: '/ler/:obraId/:numero', element: adiar(<LeitorPublico />) },
  { path: '*', element: <Navigate to="/" replace /> },
]);

const rotasBancada = createBrowserRouter([
  // Modo leitura FORA da casca de trabalho (doc 12 §7): sem cabeçalho global nem
  // abas de bancada — o leitor tem a barra dele.
  { path: '/ler/:obraId', element: adiar(<Leitor />) },
  { path: '/ler/:obraId/:numero', element: adiar(<Leitor />) },
  {
    path: '/',
    element: <Casca />,
    children: [
      { index: true, element: adiar(<ListaObras />) },
      { path: 'docs', element: adiar(<Docs />) },
      { path: 'mudancas', element: adiar(<Changelog />) },
      { path: 'prompt-padrao', element: adiar(<PaginaPromptPadrao />) },
      { path: 'configuracoes', element: adiar(<Configuracoes />) },
      { path: 'vocabulario', element: adiar(<Vocabulario />) },
      {
        path: 'obras/:obraId',
        element: adiar(<ObraLayout />),
        children: [
          { index: true, element: adiar(<Capitulos />) },
          { path: 'capitulos/:capituloId', element: adiar(<EditorCapitulo />) },
          // O passe é tela própria, e não mais um modal do editor: a lista de
          // consertos é longa (57 numa obra real), cada linha tem três decisões
          // possíveis e o revisor volta a ela — coisas que uma caixa sobre o
          // texto, sem endereço, não sustenta.
          { path: 'capitulos/:capituloId/estilo', element: adiar(<PasseEstilo />) },
          { path: 'edicoes', element: adiar(<EdicoesManuais />) },
          { path: 'glossario', element: adiar(<Glossario />) },
          // Endereço próprio, e não um painel do glossário: o revisor sai daqui
          // para a frase e volta, e a varredura da obra inteira é uma sessão de
          // trabalho — não um relance.
          { path: 'consistencia', element: adiar(<ConsistenciaObra />) },
          { path: 'prompt', element: adiar(<PromptMae />) },
          { path: 'testes', element: adiar(<BancoTestes />) },
          { path: 'termos', element: adiar(<TermosSugeridos />) },
          { path: 'comparar', element: adiar(<ComparadorModelos />) },
          { path: 'custos', element: adiar(<Telemetria />) },
        ],
      },
    ],
  },
  // Quem entrou estando em /entrar cai aqui e é levado para a lista de obras.
  { path: '*', element: <Navigate to="/" replace /> },
]);

// A barra do navegador do celular acompanha o papel desde a primeira pintura —
// inclusive nas telas que não têm o botão de tema (login).
pintarBarraDoNavegador();

ReactDOM.createRoot(document.getElementById('raiz')!).render(
  <React.StrictMode>
    <QueryClientProvider client={clienteQuery}>
      {/* Em modo hospedado (doc 13 §3), nada da BANCADA é montado sem sessão —
          quem chega sem senha recebe a vitrine pública (doc 14). */}
      <PortaoSessao vitrine={<RouterProvider router={rotasVitrine} />}>
        <RouterProvider router={rotasBancada} />
      </PortaoSessao>
    </QueryClientProvider>
  </React.StrictMode>,
);
