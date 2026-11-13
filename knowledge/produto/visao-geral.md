# Visão geral do produto

> tags: produto, visão, escopo | fontes: arquitetura.md, protótipo do cliente

O **Universo Folks** (Folks Poplearning) é uma plataforma de ensino gamificada. Cada **tema é um planeta**, com cursos em lições curtas (3 a 5 minutos), prática infinita, XP, jornada (dias seguidos), insígnias e certificados.

## Modelos de negócio
- **B2B:** empresas contratam licenças para os colaboradores. A empresa gerencia departamentos, trilhas obrigatórias, prazos e acompanha os dashboards.
- **B2C:** a pessoa usa sozinha. O plano grátis tem limites; o **Premium** libera tudo. É self-service, com suporte só em problemas sérios.
- **B2G:** órgãos públicos. O modelo será detalhado depois; por enquanto é um tenant do tipo `B2G`, com campos flexíveis (`govDetails`).

## Canais
- **Web** (desktop, inclusive em call centers).
- **App iOS e Android** em React Native com Expo (decisão do cliente de 2026-11-11, no lugar do Capacitor sugerido no protótipo). O app é a área de estudo; os painéis ficam na web.

## Quem cria o conteúdo
O **MASTER-FOLKS** cria todo o conteúdo: planetas, cursos, trilhas, vídeos, práticas, certificações e templates de certificado. Ele pode criar pelo painel ou **pelo Claude**: conecta o Claude à plataforma (MCP) e pede, por exemplo, "cria o planeta Comunicação com estes vídeos do Vimeo".

## Pilares técnicos
- Multi-tenant com isolamento rígido entre empresas.
- Dashboards com **dados reais e percentuais**.
- Vídeos no **Vimeo**; vídeos interativos em **SCORM/xAPI/cmi5**.
- Pagamentos: **RevenueCat** (lojas) e **Asaas** (web e empresas).
