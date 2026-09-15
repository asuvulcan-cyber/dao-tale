import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['web/src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: { ...globals.browser, ...globals.es2022 },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['web/src/**/*.test.{ts,tsx}', 'web/src/teste/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.es2022 } },
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Débito legado isolado; novos arquivos continuam sob a regra recomendada.
    files: ['web/src/paginas/EditorCapitulo.tsx'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    // O projeto usa nomes de hooks em português; o analisador reconhece apenas
    // funções iniciadas literalmente por `use` como hooks personalizados.
    files: ['web/src/sessao.ts'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
);
