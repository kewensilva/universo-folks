# Glossário do domínio

> tags: glossário, significado, termos, vocabulário, domínio, planeta, trilha, etapa, aula, insígnia, jornada, hangar, prática infinita, jam, tenant, vínculo, cota

| Termo | Significado | No código |
|---|---|---|
| Planeta | Tema (ex.: Comunicação). Agrupa cursos. | `Planet` |
| Galáxia / Categoria | "Para a vida", "Para o trabalho", "Para a escola". | `StudyCategory` (`life`→`para-a-vida`, `work`→`para-o-trabalho`) |
| Curso | Ex.: Comunicação Assertiva. Tem a trilha. | `Course` (`code` = id estável do catálogo) |
| Trilha | Sequência de unidades e etapas de um curso. | `Unit` + `Lesson` |
| Unidade | Bloco da trilha ("Unidade 1 – Feedback é sobre comportamento"). | `Unit` (`accessTier` define grátis/premium) |
| Etapa / nó | Aula, vídeo, prática, revisão ou interativo. | `Lesson` (`code` = id do nó no protótipo, ex. `tbu1a`) |
| Aula | Etapa em telas (slides com texto, visual e demos de áudio). | `LessonType.LESSON` |
| Prática gerada | Exercícios gerados no aparelho por "geradores" (`t1`, `p2b`, `pitch`...). | `questionSource = GENERATED` |
| Prática do banco | Questões cadastradas, corrigidas no servidor. | `questionSource = BANK` |
| Desafio final / Certificação | Prova final do curso. | `Exam` |
| Insígnia | Conquista ao concluir um curso sem certificado. | `Course.badge`, `UserBadge` |
| Prática infinita | Rodadas livres com as questões já liberadas; guarda recorde de sequência. | `InfiniteRecord` |
| Jam | Modo do jogo Campo Harmônico (1/dia no grátis). | `AllowanceFeature.JAM` |
| Jornada | Dias seguidos com atividade (streak). | `UserGamification.currentStreak` |
| Meta diária | XP alvo do dia. | `UserPreferences.dailyGoalXp` |
| Hangar | Customização do astronauta por nível. | `AvatarItem`, `UserAvatarItem` |
| Tenant | Empresa (B2B) ou órgão (B2G). | `Tenant` |
| Vínculo | Pessoa ↔ empresa, com papel e status. | `Membership` |
| Cota / licença | Limite de colaboradores e de administradores da empresa. | `TenantSettings.maxCollaborators` / `maxAdmins` |
| Trilha obrigatória | Atribuição com prioridade e prazo. | `Assignment` |
| Contexto | Modo ativo do usuário: PLATFORM, TENANT ou B2C. | JWT `mode` |
| Entitlements | O que o plano libera hoje (premium, anúncios, rodadas restantes). | `EntitlementsService` |
| Engajamento | Pessoas com ≥1 atividade no dia. | `ActivityEvent` |
