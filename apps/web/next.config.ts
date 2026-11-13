import type { NextConfig } from 'next';

/**
 * A área logada é renderizada no cliente: a sessão fica em memória e o refresh num cookie
 * httpOnly lido só pelas rotas /api/sessao (ADR 0012). Por isso Cache Components e
 * partial prefetching ficam DESLIGADOS: não há conteúdo autenticado para pré-renderizar
 * e a validação de "navegação instantânea" só geraria ruído.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
    },
  },
};

export default nextConfig;
