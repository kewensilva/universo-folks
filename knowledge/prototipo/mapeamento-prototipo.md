# Protótipo do cliente × arquitetura.md: como o back-end junta os dois

> tags: protótipo, mapeamento, estado S, localStorage, decisões, divergências

O protótipo (`universo-folks-kewen.zip`) serviu de **base de regras, telas e conteúdo**. O código back-end dele (Fastify + SQL) **não foi usado**.

Este back-end (NestJS + Prisma) junta as duas fontes:
- **o que veio do protótipo**: regras de plano, engajamento, convites, catálogo real;
- **o que veio do arquitetura.md**: multi-tenant com B2B/B2C/B2G, departamentos, MASTER, Claude via MCP, SCORM/xAPI, dashboards completos.

## Onde as duas fontes divergiam e o que foi decidido

| Ponto | Protótipo | arquitetura.md | Decisão |
|---|---|---|---|
| Empresas por pessoa | Uma empresa por pessoa | Colaborador também pode ser B2C e alternar | **Decidido pelo cliente: uma empresa por pessoa**, garantido no banco (`one_company_key`). O modo individual B2C continua disponível (`/auth/switch-context`). |
| Área / departamento | Uma área por pessoa | "um ou mais setor/departamento" | **Vale o arquitetura.md:** vários departamentos por pessoa. |
| Nota da prova final | Fixa: total−2 (8/10), Feedback 4/5 | "média definida nas configurações de cada empresa" | **Configurável.** O padrão da plataforma e de cada empresa nova é **80%**, o que reproduz o protótipo. A empresa pode alterar, e uma prova específica pode sobrescrever. |
| Exercícios | Gerados no aparelho (`generators`) e o app informa acertos | Questões cadastradas e corrigidas | **Os dois modos.** `questionSource = GENERATED` (life: tabuada, porcentagem, ouvido) e `BANK` (certificações B2B, como o Feedback). |
| Insígnia × certificado | Cursos "para a vida" dão insígnia; "para o trabalho", certificado | Certificado do curso + certificado do planeta | **Os dois.** `Course.badge` gera a insígnia; `hasCertificate` gera o certificado do curso e, ao fechar o planeta, o do planeta. |
| Premium nas lojas | RevenueCat | (não definido) | **RevenueCat**: webhook implementado. Os stubs Apple/Google foram removidos. |
| Pagamento de empresas e Premium web | Fora das lojas (boleto/Pix/NF) | Financeiro por cliente no MASTER | **Asaas** (decidido pelo cliente): contratos B2B recorrentes e Premium na web. O lançamento manual continua disponível. |
| Vídeo interativo / Claude / B2G | — | Pedidos explícitos | Mantidos (SCORM/xAPI/cmi5, MCP, `TenantType.B2G`). |

## O que veio do protótipo

- **Plano grátis:**
  - Unidades 1 e 2 de cada curso (`Unit.accessTier`); as unidades 3, 4 e o desafio final são Premium.
  - 1 rodada por dia de prática infinita, com 12 exercícios, e 1 jam por dia.
  - Ao atingir o limite: `409 daily_limit`.
- **Anúncio com recompensa:**
  - Só para adultos (data de nascimento obrigatória no cadastro).
  - Verificação server-side (SSV) do AdMob com a assinatura do Google.
  - Nunca em contexto de empresa nem para Premium.
- **Aulas em telas** (`LESSON` com `slides`, `visualHtml`, `audioDemos`), **prática gerada**, **revisão**, **prática infinita com recorde** ("Novo recorde!").
- **Jogo Campo Harmônico:** estado salvo, sessões (ensaio, jam, prova) e progresso = tons dominados ÷ 14.
- **Estado de curso no aparelho** (cartas da tabuada) e um **snapshot** para hidratar o app numa chamada (`GET /api/learning/me/snapshot`).
- **XP:** teto por evento, para o app não mandar valores absurdos. **Jornada** e meta do dia no fuso de São Paulo.
- **Engajamento:** pessoa engajada = fez ao menos uma atividade no dia. Séries de 8 semanas e de 8 meses, por empresa e geral.
- **Pessoas da empresa:**
  - Situação de cada uma: Convite enviado / Em dia / Atrasado / Não começou / Concluiu.
  - **Convite por e-mail** (o convidado ocupa licença) e reenvio do convite.
  - **Lembrete por e-mail** para quem está atrasado.
- **Relatórios CSV** que abrem direto no Excel em pt-BR (BOM + `;`), por empresa e geral.
- **"Ver como"** empresa ou colaborador: token de 30 minutos, somente leitura.
- **Conta:**
  - "Esqueci minha senha", que envia por e-mail um link para criar a nova senha.
  - Aceitar convite (`/convite?token=`).
  - Apagar conta (LGPD) e rate limit no login.
- **Hangar** com os itens reais (traje, detalhe, viseira, cabeça, costas) e **visual dos planetas** (cores, anel, ícones em órbita, figurino do astronauta).
- **Catálogo real** importado de `content/catalog.json`:
  - 10 planetas e 29 cursos;
  - 4 trilhas completas: tabuada, porcentagem, ouvido e Feedback;
  - os cursos sem trilha entram como "Em breve".

## Mapeamento do estado do protótipo (`S`) para a API

| No protótipo | Na API |
|---|---|
| `S.name`, `S.email` | `GET /api/me` → `displayName`, `email` · `PATCH /api/me` |
| `S.xp`, `S.streak`, `S.dayXp` | `GET /api/me/progress` |
| `S.cfg` | `GET/PATCH /api/me/preferences` |
| `S.look` (Hangar) | `GET /api/me/hangar` · `PUT /api/me/hangar/{itemId}` |
| `S.tips`, `S.welcomed` | `PATCH /api/me { tipsSeen }` |
| `S.premium`, `hasLib()` | `GET /api/me/entitlements` → `premium`, `library`, `ads`, limites do dia |
| `S.done[nodeId]` | `GET /api/learning/me/snapshot` → `completions[].nodeCode` (mesmo id do protótipo, ex. `tbu1a`) |
| conclusão de aula / prática | `POST /api/learning/lessons/{id}/complete` · `/practice-result { correct, total, xp }` · `/practice` (questões do banco) |
| `startInf()` / `finishInf()` | `POST /api/learning/courses/{id}/infinite/start` · `/infinite/finish` |
| `S.tab` | `PUT /api/learning/course-states/{courseId}` |
| `folks-campo-v1` | `PUT /api/learning/games/campo/state` · `POST /api/learning/games/campo/sessions` · `POST /api/learning/games/campo/jam/start` |
| prova final | `POST /api/learning/courses/{id}/exam/start` → `GENERATED` (com `minCorrect`) ou `BANK` · `POST /api/learning/exam-attempts/{id}/submit` |
| código da empresa | `POST /api/auth/join-company` |
| aba Empresa do colaborador | `GET /api/me/company` |
| ADM Empresa: painel, pessoas, trilhas, temas | `GET /api/dashboards/companies/me` · `/api/companies/me/people` · `/assignments` · `/planets` |
| exportar relatório | `GET /api/companies/me/report.csv` · `GET /api/dashboards/master/report.csv` |
| ADM Folks: visão geral | `GET /api/dashboards/master/overview` |
| "Ver como" | `POST /api/auth/impersonate { tenantId, as }` |

## Pontos que o cliente precisa decidir

1. ~~Uma empresa por pessoa?~~ **Decidido: sim.**
2. **Confiança nos resultados gerados no app:** acertos de exercícios gerados vêm do aparelho, com teto de XP. Para certificados com valor formal (B2B), a recomendação é usar questões do banco, como já acontece no Feedback.
3. **Vídeos do Feedback:** o protótipo só tem título e duração. Quando o token do Vimeo estiver configurado, `link-folder` liga os vídeos da pasta às lições pelo título.
4. **Preços e product ids** dos planos Premium (RevenueCat nas lojas, Asaas na web). O gateway está decidido: **Asaas**.
5. **Inadimplência B2B:** suspender automaticamente a empresa após N dias de boleto vencido?
