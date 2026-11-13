# ADR 0012 — Arquitetura do front-end: web em Next.js, app em Expo, núcleo compartilhado

> tags: adr, front-end, frontend, web, mobile, app, react native, expo, next.js, login, sessão, perfis, rotas, design system, protótipo | status: aceita | data: 2026-11-11

## Contexto
Decisões do cliente:
- O app é **React Native com Expo** (substitui a sugestão de Capacitor do protótipo).
- A stack da web fica a nosso critério.
- O visual fica **como no protótipo** (`universo-folks.html`):
  - tema espacial escuro (`--bg #03040f`), fonte Plus Jakarta Sans, cor de destaque âmbar `#ffb020`;
  - planetas com astronauta;
  - abas Início, Cursos, Hangar, Premium e Ajustes.
- A versão web também é usada em desktop (call centers).

Há quatro perfis, que chegam da API como **contexto ativo** no login (ADR 0002):

| Contexto da API | Perfil | Onde usa |
|---|---|---|
| `PLATFORM` + `MASTER_FOLKS` | MASTER | **Web** (painel completo) |
| `TENANT` + `ADMIN_CLIENTE` | Cliente-Folks (administrador B2B) | **Web** (painel da empresa) |
| `TENANT` + `COLABORADOR_CLIENTE` | Colaborador B2B | **App e web** (área de estudo) |
| `B2C` + `ALUNO_CLIENTE` | Aluno individual | **App e web** (área de estudo) |

## Decisão
1. **Três pacotes:**
   - `apps/web`: **Next.js (App Router) + TypeScript + Tailwind CSS + TanStack Query**.
     - Next em vez de SPA puro, por três motivos: BFF de sessão (cookie httpOnly); páginas públicas com SEO (landing B2C, validação de certificado, convite e nova senha); deploy simples na VPS atrás do Caddy.
   - `apps/mobile`: **Expo (SDK 58) + Expo Router + TypeScript + TanStack Query**, com `expo-secure-store` para o refresh token.
   - `packages/shared` (`@folks/shared`): sem dependências de UI. Contém:
     - cliente tipado da API, com refresh automático e armazenamento de token injetado por plataforma;
     - tipos de sessão e contexto, e a regra `areaFor(contexto)`, que decide a área de cada perfil;
     - tokens de design do protótipo (cores, raios, fonte);
     - formatação pt-BR;
     - tipos das questões entregues ao aluno.
2. **Sessão:**
   - **Web:** o refresh token **nunca fica acessível ao JavaScript**. Rotas do próprio Next (`/api/sessao/*`) chamam a API e guardam o refresh num cookie `httpOnly; Secure; SameSite=Lax`. O navegador recebe só o access token, que fica em memória, e chama a API direto com Bearer (CORS já configurado em `CORS_ORIGINS`).
   - **App:** refresh no Keychain/Keystore (`expo-secure-store`), access em memória.
3. **Rotas por perfil (web):**
   - `/entrar` e `/contexto` (escolher entre Master, empresa ou Individual quando houver mais de um);
   - `/master/*` (MASTER), `/empresa/*` (ADMIN B2B) e `/estudar/*` (colaborador e aluno);
   - o guarda de rota usa `areaFor`; a API continua sendo a autoridade (RBAC no servidor).
4. **App = área de estudo.** MASTER e ADMIN que entram no app veem duas opções: o aviso de que o painel é na web, ou a troca para um contexto de estudo (Individual ou empresa como colaborador).
5. **Instalação isolada do app:** `apps/mobile` fica **fora** dos workspaces do npm da raiz, com lockfile próprio, e usa `@folks/shared` via `file:`. Assim o React e o Metro do Expo não colidem com o React do Next. A web fica no workspace.
6. **Contratos:** tipos de resposta vêm de `@folks/shared`. Mensagens de erro vêm prontas da API (pt-BR). Códigos de negócio (`PREMIUM_REQUIRED`, `daily_limit`, `license_limit`, `other_company`) viram telas próprias.

## Alternativas descartadas
- **Expo Router com react-native-web também para a web:** um código só, mas os painéis densos do MASTER e da empresa (tabelas, filtros, gráficos, upload de importação) ficam piores e mais lentos de fazer; sem SSR para páginas públicas.
- **Vite SPA:** simples, mas guardaria o refresh token no navegador (localStorage), sem SSR.
- **Capacitor com o HTML do protótipo:** o cliente escolheu React Native/Expo.

## Consequências
- Telas de estudo existem duas vezes (React DOM e React Native). A lógica (API, regras de acesso, correção, formatação) fica uma vez só, no `@folks/shared`.
- `areaFor` é a única regra de "qual área este perfil vê". Novos perfis (B2G) entram nela.
- Na web, **Cache Components e partial prefetching do Next 16 ficam desligados**. A área logada renderiza no cliente, porque a sessão está em memória, e não há conteúdo autenticado para pré-renderizar. Ligar exigiria `instant = false` em cada página. Páginas públicas futuras (landing, certificado) podem reavaliar isso.
- A web precisa de `CORS_ORIGINS` com a origem dela, e o cookie de sessão exige HTTPS em produção.

## Pendências
- Assinatura Premium no app (RevenueCat) e anúncios (AdMob SSV): fase do app.
- Push (lembrete diário): fase do app.
- Arte do protótipo (planetas e astronauta em SVG) a portar para `react-native-svg` e para a web.
