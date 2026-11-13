# Universo Folks — API (back-end)

API multi-tenant (B2B, B2C, B2G) que atende a versão **web** e os apps **iOS/Android**.
Stack: **Node.js + TypeScript + NestJS 11 + Prisma 6 + PostgreSQL 16**.

Fontes deste back-end:
- os requisitos do `arquitetura.md`;
- as regras, as telas e o conteúdo do **protótipo do cliente**.

Veja [docs/prototipo-x-arquitetura.md](docs/prototipo-x-arquitetura.md) para o que veio de cada fonte e o que foi decidido onde as duas divergiam.

## Como rodar

```bash
cp .env.example .env            # ajuste os segredos JWT
docker compose up -d            # Postgres na porta 5433
npm install
npx prisma migrate dev          # cria as tabelas
SEED_DEMO=true npm run db:seed  # base + catálogo do protótipo + empresa de exemplo
npm run start:dev
```

- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/docs`
- MCP (Claude): `http://localhost:3000/mcp`

O seed carrega o **catálogo real do protótipo** (`content/catalog.json`): 10 planetas, 29 cursos, as trilhas de tabuada, porcentagem, ouvido e Feedback, e os itens do Hangar.

- Para regravar as trilhas a partir do JSON: `npm run db:seed -- --force-content`. Só regrava cursos sem progresso de alunos.
- Também é possível importar pela API: `POST /api/master/content/import/catalog`.

Logins criados pelo seed:

| Perfil | E-mail | Senha |
|---|---|---|
| MASTER-FOLKS | `master@folks.com.br` | `SEED_MASTER_PASSWORD` do `.env` |
| ADMIN-CLIENTE (Órbita Logística) | `admin@orbita.example` | `demo1234` |
| COLABORADOR-CLIENTE | `ana.ribeiro@orbita.example` (e as demais pessoas do protótipo) | `demo1234` |

O código da empresa demo é `ORBITA-2026`. A empresa vem com 8 semanas de atividade, para os painéis de engajamento terem dados.

---

## 1. Perfis e contexto (multi-tenant)

Um **usuário** é uma pessoa. O papel dela depende do **contexto ativo**, que vai dentro do JWT:

| Contexto | Quem | Papel lógico |
|---|---|---|
| `PLATFORM` | usuário com `platformRole = MASTER_FOLKS` | **MASTER-FOLKS** |
| `TENANT` | usuário com `Membership` ativa na empresa | **ADMIN-CLIENTE** ou **COLABORADOR-CLIENTE** |
| `B2C` | qualquer usuário | **ALUNO-CLIENTE** (grátis ou premium) |

- `GET /api/auth/contexts` lista os modos disponíveis.
- `POST /api/auth/switch-context` alterna entre eles. É assim que **o mesmo usuário alterna entre o modo B2B e o modo individual B2C**.
- `POST /api/auth/join-company { code }` corresponde ao campo "Código da empresa" da tela Ajustes.

**Isolamento:** o schema é compartilhado e as tabelas da empresa têm `tenant_id`. Todas as rotas de empresa passam por `AccessService.resolveTenant`:
- o ADMIN só opera no próprio tenant (`/companies/me/...`);
- o MASTER opera em qualquer um (`/companies/{tenantId}/...`).

O guard revalida a cada requisição se o usuário e o vínculo continuam ativos.

**Regras implementadas:**
- **Uma pessoa só pode estar em UMA empresa** (convidada ou ativa).
  - O banco garante a regra: coluna única `memberships.one_company_key`.
  - A API recusa com `409 other_company` quando alguém tenta entrar ou ser cadastrado em outra empresa.
  - Para trocar de empresa, a pessoa sai da atual (`POST /api/me/company/leave`) ou é desativada por ela.
  - O modo individual (B2C) continua disponível para todos.
- MASTER cria e remove outros MASTERs, mas **não pode remover a si mesmo**.
- **Limite de usuários por empresa** (`TenantSettings.maxUsers`).
- A empresa sempre mantém pelo menos 1 ADMIN ativo.
- Remover um colaborador apaga só o vínculo. A conta continua existindo e ele pode seguir no modo B2C.

## 2. Conteúdo

```
Categoria  (Para a vida | Para o trabalho | Para a escola | ...criadas pelo MASTER)
 └ Planeta (tema)                 ex.: Comunicação
    └ Curso                       ex.: Comunicação Assertiva
       ├ Unidade                  ex.: Unidade 1 – Feedback é sobre comportamento
       │  └ Lição  VIDEO (Vimeo) → PRACTICE (questões do vídeo) → INTERACTIVE (SCORM/xAPI)
       └ Exam                     Certificação (prova final do curso)
```

- **Status:** `DRAFT`, `COMING_SOON` ("Em breve"), `PUBLISHED` e `ARCHIVED`. Conteúdo com progresso de alunos é arquivado, não apagado.
- **Acesso:** `FREE` ou `PREMIUM`, definido no planeta. O curso pode sobrescrever.
- **Trilha sequencial:** cada etapa libera a próxima. A empresa pode desligar isso.
- **Prática infinita:** libera depois da primeira aula concluída e sorteia questões das práticas já liberadas.
- **Certificação:** é liberada quando a trilha termina. A nota mínima vem da prova; se a prova não definir, vem da empresa; se a empresa também não definir, vale o padrão da plataforma. O número de tentativas e o cooldown entre elas são configuráveis.
- **Certificados:**
  - Ao passar na certificação, o aluno recebe o certificado do curso.
  - Ao concluir o último curso de um planeta, recebe o **certificado do PLANETA**, com o nome de todos os cursos.
  - Templates HTML são editáveis (`/api/master/certificate-templates`).
  - Qualquer certificado pode ser verificado publicamente em `/api/certificates/verify/{code}`.
  - No B2C grátis, os certificados ficam bloqueados. Quem assinar o premium depois resgata com `POST /api/me/certificates/claim/{courseId}`.

## 3. Vimeo

Os vídeos ficam nas pastas do Vimeo, e a API se conecta à conta com um token.

- **Configuração no `.env`:**
  - `VIMEO_ACCESS_TOKEN`: token do tipo *Authenticated*, criado em developer.vimeo.com > seu app, com os escopos `public private edit`.
  - `VIMEO_EMBED_DOMAINS`: domínios onde o player pode tocar.
- **Diagnóstico:** `GET /api/master/content/vimeo/status` mostra a conta, o plano e os escopos que faltam.
- **Pastas:** `GET /api/master/content/vimeo/folders` e `/folders/{id}/videos`. A listagem percorre todas as páginas e traz o hash dos vídeos não listados.
- **Ligar uma pasta a um curso:** `POST /api/master/content/courses/{id}/vimeo/link-folder { folderId, dryRun, overwrite, restrictEmbed }`.
  - Liga cada lição de vídeo ao vídeo da pasta com o mesmo título.
  - Preenche id, hash, duração e miniatura.
  - Com `restrictEmbed`, faz o vídeo tocar só nos domínios do app.
  - Rode primeiro com `dryRun: true` para ver o que seria ligado.
- **Sincronizar:** `POST /api/master/content/vimeo/sync?courseId=` atualiza duração, miniatura e hash.
- **Claude (MCP):** `vimeo_status`, `list_vimeo_folders`, `list_vimeo_folder_videos`, `link_course_videos_from_folder`, `set_lesson_video`, `sync_vimeo_metadata`.
- **Aluno:** recebe `embedUrl` (com `?h=` nos vídeos não listados), `videoId`, `hash` e `thumbnailUrl`. O app usa o Vimeo Player SDK e envia o tempo assistido a cada 10–15s.
- **Anti-pulo:** o tempo assistido só avança no ritmo real de reprodução, até 2× a velocidade. Para concluir é preciso assistir 90% (`minWatchPct`). O MASTER pode desligar com a configuração `video_anti_skip`.

## 4. Empresa (ADMIN-CLIENTE)

`/api/companies/me/...`:
- `departments`: setores e departamentos.
- `members`: colaboradores (um colaborador pode estar em vários departamentos). Inclui cadastro em lote em `members/bulk`.
- `planets`: liga e desliga cada planeta e escolhe os setores com acesso (os chips "Todas / Comercial / RH..." do print).
- `assignments`: **trilhas obrigatórias, prioridade e prazo**, por empresa, departamento ou colaborador. `assignments/order` reordena a prioridade.
- `settings`: nota mínima, tentativas e fluxo sequencial.

## 5. Dashboards (dados reais, em %)

| Rota | Conteúdo |
|---|---|
| `GET /api/dashboards/master` | Clientes por tipo e status. Usuários: crescimento, engajamento em 7 e 30 dias, conversão premium. Aprendizagem: conclusão, aprovação, nota média, acerto nas práticas. Conteúdo. **Financeiro**: MRR/ARR por público, receita no período e crescimento, receita por provedor, churn, receita dos últimos 12 meses. Séries diárias e rankings. |
| `GET /api/dashboards/master/financial-by-client` | Financeiro de cada empresa: MRR, valores pagos e pendentes, uso de licenças. |
| `GET /api/dashboards/companies/me?departmentId=&from=&to=` | Licenças, engajamento, adoção e conclusão, provas, certificados, **compliance das trilhas obrigatórias** (atrasados e vencendo em 7 dias), visão por departamento e por curso, ranking de XP e série diária. |
| `GET /api/dashboards/companies/me/members/{id}` | Progresso do colaborador em cada curso. |
| `GET /api/dashboards/me` | Dashboard pessoal do aluno. |

## 6. Gamificação (prints Início, Hangar e Ajustes)

- XP por vídeo, prática e prova. Resposta rápida dá bônus quando o cronômetro está ligado.
- Nível a cada 200 XP (configurável).
- **Jornada de N dias** (streak) e meta diária de 20, 50, 100 ou 150 XP.
- **Hangar:** itens do astronauta liberados por nível e equipados com `PUT /api/me/hangar/{itemId}`.
- **Preferências:** sons, cronômetro, animações, lembrete diário e horário. O lembrete roda num job a cada minuto.

## 7. Plano grátis, Premium e anúncios (regras do protótipo)

- **Grátis:**
  - Unidades 1 e 2 de cada curso (`Unit.accessTier`); as demais e o desafio final são Premium.
  - **1 rodada por dia** de prática infinita, com 12 exercícios, e **1 jam por dia** no jogo.
  - Ao atingir o limite: `409 daily_limit`.
- **Anúncio com recompensa:**
  - Só para **adultos**: a data de nascimento é obrigatória no cadastro.
  - Nunca para Premium nem em contexto de empresa.
  - A rodada extra é liberada pelo **SSV do AdMob** (`GET /api/billing/webhooks/admob/ssv`), com a assinatura verificada nas chaves públicas do Google.
- **Premium e empresa:** tudo liberado, sem limite e sem anúncio.
- `GET /api/me/entitlements` devolve o plano, os limites e as rodadas restantes do dia.

## 8. Financeiro

- **Planos:** B2C, B2B e B2G. Os valores ainda não foram definidos, então o seed cria os planos **inativos e com preço 0**.
- **Premium nas lojas via RevenueCat (implementado):**
  - No app, `Purchases.logIn(<id do usuário da API>)`.
  - O webhook `POST /api/billing/webhooks/revenuecat` tem o header `Authorization` igual a `REVENUECAT_WEBHOOK_AUTH` e é idempotente.
  - Ativa, renova, cancela e expira o Premium, e grava os pagamentos.
  - Produto sem plano vinculado cria um plano automático, inativo, para revisão.
- **Asaas: Premium na web e contratos de empresas (implementado, aguardando a conta):**
  - **Configuração:** `ASAAS_API_KEY`, `ASAAS_API_URL` (sandbox ou produção) e `ASAAS_WEBHOOK_TOKEN`.
  - **Webhook:** no painel do Asaas, aponte para `POST /api/billing/webhooks/asaas`, com eventos de cobrança e de assinatura. O token chega no header `asaas-access-token`.
  - **B2C web:** `POST /api/billing/checkout { planId, cpfCnpj, billingType? }`.
    - Cria o cliente e a assinatura no Asaas e devolve a **fatura**, onde a pessoa paga com Pix, boleto ou cartão.
    - O Premium só libera quando o webhook confirma o pagamento (`PAYMENT_RECEIVED` ou `PAYMENT_CONFIRMED`).
    - Cancelar remove a assinatura no Asaas, e o Premium vale até o fim do período.
  - **Empresas B2B/B2G:** `POST /api/master/billing/tenants/{id}/asaas-contract { planId, valueCents, seats, billingType, nextDueDate }`.
    - Gera a cobrança recorrente (boleto/Pix) do contrato.
    - Exige o CNPJ da empresa cadastrado.
    - Ajusta o limite de licenças.
    - Boleto vencido deixa a assinatura `PAST_DUE` e aparece como pendente no financeiro por cliente.
  - O **MRR** usa o valor do contrato (`Subscription.amountCents`) quando ele difere do preço do plano.
  - **Lojas:** no app iOS/Android, as lojas exigem compra *in-app* para conteúdo digital. Lá o Premium continua pela RevenueCat, e o Asaas fica para a web e para empresas.
- **Lançamento manual pelo MASTER:** `/api/master/billing/subscriptions` (contratos e cortesias, com `amountCents`) e `/api/master/billing/payments`.

## 9. Conteúdo interativo (SCORM / xAPI / cmi5)

Veja [docs/conteudo-interativo.md](docs/conteudo-interativo.md).

## 10. Claude criando planetas (MCP)

Veja [docs/claude-mcp.md](docs/claude-mcp.md).

## Estrutura

```
prisma/schema.prisma    modelo de dados completo (comentado)
prisma/seed.ts          seed base + demo
src/access/             regras de acesso e isolamento multi-tenant (ponto único)
src/auth/               login, refresh com rotação, troca de contexto, código da empresa
src/master/             MASTERs, clientes (tenants), usuários B2C, configurações gerais
src/companies/          gestão da empresa: departamentos, pessoas, convites, lembretes, liberação, trilhas, engajamento, CSV
src/vimeo/              integração Vimeo: conta, pastas, metadados, privacidade do embed
src/content/            CRUD de conteúdo, builder transacional e importador do catálogo do protótipo
src/catalog/            telas do aluno (início, planetas, busca, trilhas obrigatórias)
src/access/entitlements plano grátis/premium, menor de idade, anúncios, limites diários
src/email/              e-mail transacional (Resend): convite, nova senha, lembrete
src/learning/           trilha, aula em telas, vídeo, prática (banco ou gerada no app), infinita, jogos, desafio final
src/certificates/       emissão, templates, verificação
src/gamification/       XP, nível, jornada, hangar
src/billing/            planos, assinaturas, RevenueCat (lojas), Asaas (web/empresas), AdMob SSV, lançamentos manuais
src/dashboards/         dashboards MASTER / empresa / aluno
src/interactive/        pacotes SCORM/xAPI/cmi5 + LRS embutido
src/mcp/                servidor MCP (HTTP em /mcp e stdio)
src/notifications/      lembrete diário (envio de push ainda pendente)
```

## Conta e empresa (vindos do protótipo)

- **Convite por e-mail:** quem é cadastrado pela empresa recebe um link (`/convite?token=`) para criar a senha. Enquanto não aceita, fica como `INVITED` e já ocupa licença.
- **Esqueci minha senha:** `POST /api/auth/password/forgot` envia o link (`/nova-senha?token=`); `POST /api/auth/password/reset` grava a nova senha. O mesmo endpoint aceita o convite.
- **E-mail transacional:** pela Resend (`RESEND_API_KEY`). Sem a chave, o conteúdo do e-mail aparece no log.
- **Rate limit** em login, cadastro e senha.
- **Apagar conta (LGPD):** `POST /api/me/delete-account`.
- **Pessoas da empresa:** situação de cada uma (em dia / atrasado / não começou / concluiu / convite), reenvio de convite, lembrete por e-mail, engajamento semanal e mensal e **CSV** que abre direto no Excel.
- **"Ver como" (MASTER):** `POST /api/auth/impersonate` gera um token de 30 minutos, somente leitura.

## Pendências conhecidas

- **Asaas:** o código está pronto e foi testado contra uma API simulada. Quando a conta for aprovada, falta configurar a chave e o webhook, e validar no sandbox.
- **Vimeo:** o código está pronto e foi testado contra uma API simulada. Falta gerar o token da conta e rodar o `link-folder` nos cursos (o Feedback já está mapeado pelos títulos dos vídeos).
- **Inadimplência B2B:** decidir se uma empresa com boleto vencido há N dias deve ser suspensa automaticamente. Hoje o status só fica `PAST_DUE`, com alerta no financeiro.
- **Push:** integrar FCM/APNs para o lembrete diário.
- **Conector no claude.ai:** conectores customizados do claude.ai exigem OAuth. Hoje o MCP usa token pessoal, que funciona no Claude Code e no Claude Desktop.
- **Storage:** usa disco local. Para produção, trocar por S3/R2 + CDN.
- **Endurecimento:** Row-Level Security no Postgres como segunda camada de isolamento e rate limiting.
- **Certificados:** são gerados em HTML. Para PDF no servidor, usar Puppeteer/Playwright.
- **B2G:** o modelo está preparado (`TenantType.B2G`, `govDetails`), aguardando as regras.
