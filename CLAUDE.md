# Universo Folks — instruções do projeto para agentes

Plataforma de ensino gamificada (planetas, trilhas, XP), **multi-tenant**, com B2B, B2C e B2G. Tem versão web e app (App Store / Google Play).

Este repositório é desenvolvido por um **time de agentes** guiado por um **harness**. Antes de agir, entenda onde fica cada coisa.

## Mapa do repositório

| Pasta | Para que serve |
|---|---|
| `agents/` | Subagentes especialistas (o Claude Code lê via `.claude/agents`). Cada um tem papel, limites e checklist próprios. |
| `skills/` | Procedimentos repetíveis (o Claude Code lê via `.claude/skills`). Use a skill em vez de improvisar. |
| `harness/` | Engrenagem que mantém a qualidade: hooks, quality gates, RAG, evals, ciclo de feedback, workflows e CI. |
| `knowledge/` | **Fonte da verdade de negócio**, indexada pelo RAG: regras, decisões do cliente, ADRs, glossário, contratos, integrações e aprendizados. |
| `apps/api` | API (NestJS + Prisma + PostgreSQL), reconstruída pela nova estrutura. |
| `apps/web` | Web em **Next.js 16**: painel do MASTER (`/master`), painel da empresa (`/empresa`) e área de estudo (`/estudar`). Sessão via BFF com cookie httpOnly (ADR 0012). |
| `apps/mobile` | App em **React Native + Expo SDK 58** (área de estudo). Instalação isolada, fora dos workspaces da raiz (ADR 0012). |
| `packages/shared` | `@folks/shared`: cliente tipado da API, sessão e perfis (`areaFor`), tokens de design do protótipo, formatação pt-BR e tipos das questões. Usado pela web e pelo app. |
| `packages/content-ingest` | Importação do conteúdo criado no Claude: formato canônico `folks.content/v1`, adaptadores, validação e planejador (ADR 0010). |
| `backend/` | **v0 de referência**: primeira versão, já testada. Recebe a importação de conteúdo agora (núcleo em `packages/content-ingest`); o resto da evolução vai em `apps/api`. |
| `arquitetura.md` | Requisitos originais do cliente. Está consolidado em `knowledge/produto/`. |

## Regras inegociáveis

1. **Consulte o conhecimento antes de implementar regra de negócio.**
   - O hook `UserPromptSubmit` injeta trechos relevantes automaticamente.
   - Para buscar mais: `npm run rag:query -- "termo"` ou a skill `consultar-conhecimento`.
   - Se `knowledge/` contradiz o código, quem vale é `knowledge/`. Se você discordar, registre uma ADR.
2. **Isolamento multi-tenant:** toda rota de empresa resolve o tenant num ponto único e nunca confia em `tenantId` vindo do cliente sem validar o papel. Veja `knowledge/arquitetura/adr/0001-*`.
3. **Banco de dados:**
   - Nunca rode `prisma migrate reset`, `DROP DATABASE`, `docker compose down -v` ou nada que apague dados sem confirmação explícita do usuário. O hook bloqueia.
   - Migrações são geradas pela skill `migracao-prisma-segura`.
   - Uma migração já aplicada nunca é editada.
4. **Segredos:** nunca leia nem escreva `.env` com valores reais, e nunca coloque chave em código, log ou commit.
5. **Definition of Done** (`harness/workflows/definition-of-done.md`): typecheck, lint e testes passando (hook `Stop`), teste cobrindo a regra de negócio e o conhecimento atualizado se a regra mudou.
6. **Errou e o usuário corrigiu?** Registre com a skill `registrar-aprendizado`. Isso alimenta o RAG e o dataset de feedback, e o time não repete o erro.
7. **Português do Brasil** em mensagens ao usuário, docs, mensagens de erro da API e commits. Nomes de código em inglês.

## Como o trabalho flui

```
pedido do usuário
  └─ tech-lead (orquestra)           → workflows/feature.md
       ├─ especialista-dominio       → valida regras no knowledge/ (RAG)
       ├─ arquiteto-software         → ADR se houver decisão estrutural
       ├─ dba-modelagem              → schema + migração segura
       ├─ backend-nestjs / integracoes / conteudo-ia → implementação
       ├─ qa-testes                  → testes e2e da regra
       ├─ seguranca-multitenant      → revisão de isolamento e RBAC
       └─ revisor-codigo             → revisão final
  └─ harness: hooks (guardas + RAG), quality gates no Stop, evals, feedback
```

## Comandos úteis

```bash
npm run rag:index            # reindexa knowledge/ (os hooks fazem isso sozinhos quando o índice fica velho)
npm run rag:query -- "cota de administradores"
npm run rag:eval             # mede a qualidade da recuperação (hit@k, MRR)
npm run gates                # typecheck/lint/test só do que mudou
npm run feedback -- --help   # registra um aprendizado
npm run harness:check        # valida agentes, skills, hooks e knowledge
```

## Estado atual

- **Fase:** F0 (fundação do harness). O roadmap de reconstrução está em `harness/workflows/roadmap.md`.
- **Decisões recentes do cliente:**
  - uma pessoa só pode estar em uma empresa;
  - o MASTER define cotas separadas de colaboradores e de administradores por empresa;
  - pagamentos pelo Asaas (web e B2B) e pela RevenueCat (lojas);
  - vídeos no Vimeo;
  - app mobile em React Native com Expo; a stack da web ficou a nosso critério (Next.js, ADR 0012);
  - o Claude se conecta à plataforma só para o MASTER, e só para criar e editar planeta, cursos e trilhas (MCP com OAuth 2.1; ADR 0007).
  - planos do aluno por galáxia: Básico (só gratuitos), Premium (Para a vida + Para o trabalho) e Premium Plus (todas); o MASTER escolhe as galáxias no menu Planos (ADR 0014).
  - cursos de som (violão, canto): aula de som, treino de ouvido e prática no microfone, sem vídeo (ADR 0015).
  - Detalhes em `knowledge/produto/decisoes-do-cliente.md`.
