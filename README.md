# Universo Folks

Plataforma de ensino gamificada, multi-tenant (B2B, B2C e B2G), com web e app. É desenvolvida por um **time de agentes de IA guiado por um harness de engenharia**.

```
├── CLAUDE.md          constituição do projeto: regras, mapa e fluxo (todo agente lê)
├── agents/            14 subagentes especialistas            (→ .claude/agents)
├── skills/            10 procedimentos repetíveis             (→ .claude/skills)
├── harness/           hooks · quality gates · RAG · evals · feedback · workflows · CI
├── knowledge/         fonte da verdade de negócio (corpus do RAG)
│   ├── produto/       visão, perfis, regras, decisões do cliente, requisitos originais
│   ├── dominio/       glossário, modelo de dados
│   ├── arquitetura/   visão técnica + ADRs
│   ├── api/           convenções, endpoints
│   ├── integracoes/   Vimeo, Asaas, RevenueCat, AdMob, Resend
│   ├── prototipo/     protótipo do cliente × arquitetura
│   └── aprendizados/  erros corrigidos (alimentados pelo ciclo de feedback)
├── apps/              api · web · mobile (reconstrução a partir da F1)
├── packages/shared    tipos e schemas compartilhados
└── backend/           v0 de referência (testada; congelada)
```

## O time
**tech-lead** (orquestra) · **especialista-dominio** · **arquiteto-software** · **dba-modelagem** · **backend-nestjs** · **integracoes** · **conteudo-ia** · **qa-testes** · **seguranca-multitenant** · **revisor-codigo** · **documentador** · **devops-sre** · **frontend-web** · **mobile-app**

## O harness em uma linha por peça
- **RAG:** cada pedido recebe os trechos relevantes de `knowledge/` (BM25 local; medido por `npm run rag:eval`).
- **Guardas:** comandos destrutivos, leitura de segredos e edição de migração aplicada são bloqueados antes de rodar.
- **Quality gates:** typecheck, lint e testes do que mudou, mais a validação do harness e do RAG, rodam antes de o agente encerrar.
- **Feedback:** cada correção vira conhecimento recuperável e uma linha no dataset (evals e fine-tuning).
- **Evals:** qualidade da recuperação (offline) e comportamento dos agentes (`claude -p`).

## Começar
```bash
cp harness/settings.recommended.json .claude/settings.json   # ativa hooks e permissões (revise antes)
npm run harness:check
npm run rag:query -- "cota de administradores"
```
Detalhes: `harness/README.md` · roadmap: `harness/workflows/roadmap.md`.
