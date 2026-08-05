import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import './estilos.css';
import { Casca } from './App';
import { ListaObras } from './paginas/ListaObras';
import { ObraLayout } from './paginas/ObraLayout';
import { Capitulos } from './paginas/Capitulos';
import { EditorCapitulo } from './paginas/EditorCapitulo';
import { Glossario } from './paginas/Glossario';
import { PromptMae, PaginaPromptPadrao } from './paginas/PromptMae';
import { BancoTestes } from './paginas/BancoTestes';
import { TermosSugeridos } from './paginas/TermosSugeridos';
import { Configuracoes } from './paginas/Configuracoes';
import { Docs } from './paginas/Docs';
import { ComparadorModelos } from './paginas/ComparadorModelos';
import { Telemetria } from './paginas/Telemetria';
import { Leitor } from './paginas/Leitor';
import { Biblioteca } from './paginas/Biblioteca';
import { LeitorPublico } from './paginas/LeitorPublico';
import { Entrar } from './paginas/Entrar';
import { PortaoSessao } from './componentes/PortaoSessao';

const clienteQuery = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

// Vitrine (doc 14): o roteador de quem chega sem senha. Três rotas, e a `*`
// devolve para a estante — assim um /configuracoes digitado à mão vira estante,
// não tela de erro nem pista de que existe um /configuracoes.
const rotasVitrine = createBrowserRouter([
  { path: '/', element: <Biblioteca /> },
  { path: '/entrar', element: <Entrar /> },
  { path: '/ler/:obraId', element: <LeitorPublico /> },
  { path: '/ler/:obraId/:numero', element: <LeitorPublico /> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

const rotasBancada = createBrowserRouter([
  // Modo leitura FORA da casca de trabalho (doc 12 §7): sem cabeçalho global nem
  // abas de bancada — o leitor tem a barra dele.
  { path: '/ler/:obraId', element: <Leitor /> },
  { path: '/ler/:obraId/:numero', element: <Leitor /> },
  {
    path: '/',
    element: <Casca />,
    children: [
      { index: true, element: <ListaObras /> },
      { path: 'docs', element: <Docs /> },
      { path: 'prompt-padrao', element: <PaginaPromptPadrao /> },
      { path: 'configuracoes', element: <Configuracoes /> },
      {
        path: 'obras/:obraId',
        element: <ObraLayout />,
        children: [
          { index: true, element: <Capitulos /> },
          { path: 'capitulos/:capituloId', element: <EditorCapitulo /> },
          { path: 'glossario', element: <Glossario /> },
          { path: 'prompt', element: <PromptMae /> },
          { path: 'testes', element: <BancoTestes /> },
          { path: 'termos', element: <TermosSugeridos /> },
          { path: 'comparar', element: <ComparadorModelos /> },
          { path: 'custos', element: <Telemetria /> },
        ],
      },
    ],
  },
  // Quem entrou estando em /entrar cai aqui e é levado para a lista de obras.
  { path: '*', element: <Navigate to="/" replace /> },
]);

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
