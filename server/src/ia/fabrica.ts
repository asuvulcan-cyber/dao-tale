import type { ProvedorId } from '@dao-tale/shared';
import type { ProvedorIA } from './provedor.js';
import { provedorClaude } from './claude.js';
import { provedorMock } from './mock.js';

// Adicionar um provedor novo (ex.: Gemini na Fase 2) = criar o arquivo e registrar aqui.
const provedores: Record<string, ProvedorIA> = {
  claude: provedorClaude,
  mock: provedorMock,
};

export function obterProvedor(id: ProvedorId): ProvedorIA {
  const p = provedores[id];
  if (!p) throw new Error(`Provedor de IA desconhecido ou ainda não suportado: ${id}`);
  return p;
}

export function listarProvedores(): ProvedorIA[] {
  return Object.values(provedores);
}
