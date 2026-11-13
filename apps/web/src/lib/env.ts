/** URL da API vista pelo navegador. */
export const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';
/** URL da API vista pelo servidor do Next (BFF). Na VPS pode ser a rede interna do Docker. */
export const SERVER_API_URL = process.env.API_URL ?? PUBLIC_API_URL;
