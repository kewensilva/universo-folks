# Roadmap de reconstrução

> tags: roadmap, fases, plano, reconstrução, prioridades, próximo passo

Fase atual: **F0 — Fundação do harness (agentes, skills, RAG, hooks, evals)**

A v0 (`backend/`) provou as regras e a modelagem. A reconstrução em `apps/api` segue o workflow `feature.md`, fase a fase. Cada fase termina com e2e verde e o knowledge atualizado.

| Fase | Escopo | Base na v0 | Saída |
|---|---|---|---|
| F0 | Harness: estrutura, RAG, hooks, gates, evals, feedback | — | Este repositório |
| F1 | Fundação da API: monorepo, `packages/shared`, Prisma, auth (JWT + contexto + refresh), guards, auditoria, erros pt-BR | auth, common, access | Login/contexto/"ver como" com e2e |
| F2 | Tenancy: tenants, cotas (colaboradores/admins), uma empresa por pessoa, departamentos, convites, código da empresa | master, companies, seats | E2e de isolamento e cotas |
| F3 | Conteúdo: categorias, planetas, cursos, unidades, etapas (aula, vídeo, prática BANK/GENERATED, interativo), importador do catálogo, **MCP só para o MASTER e só de conteúdo, com OAuth 2.1 para o conector do claude.ai** (ADR 0007) | content, mcp | Catálogo real importado; MASTER conecta o Claude e cria um planeta pelo chat |
| F4 | Aprendizagem: trilha sequencial, anti-pulo, práticas, infinita, desafio final, certificados, insígnias, jogos | learning, certificates | E2e das regras do protótipo |
| F5 | Plano e gamificação: entitlements (grátis/premium/menor), limites diários, XP com teto, jornada, hangar | access/entitlements, gamification | E2e do plano grátis |
| F6 | Empresa: liberação de planetas, trilhas obrigatórias, pessoas e situação, lembretes, engajamento, CSV | companies, insights | Painel da empresa com dados reais |
| F7 | Financeiro: RevenueCat, Asaas (B2C web + contratos B2B), AdMob SSV, lançamentos manuais | billing | Validado no sandbox do Asaas |
| F8 | Dashboards MASTER/empresa/aluno + integrações Vimeo, Resend, push | dashboards, vimeo, email | Painéis completos |
| F9 | Front-end web (Next.js) e app (Expo), fiéis ao protótipo — **em andamento**: base, login, perfis, painéis Master/empresa e trilha prontos | apps/web, apps/mobile, packages/shared | Web publicada |
| F10 | App (Expo/EAS): player completo, RevenueCat, AdMob SSV, push, lojas, carga e go-live | apps/mobile | Apps nas lojas |

## Como avançar de fase
1. O tech-lead abre a fase lendo esta tabela e o trecho correspondente da v0.
2. Para cada regra da fase: workflow `feature.md`.
3. Ao concluir, atualize a linha "Fase atual" acima. O hook SessionStart lê essa linha.
