# Perfis e permissões

> tags: perfis, permissões, rbac, master, admin, colaborador, aluno, contexto | fontes: arquitetura.md, decisões do cliente

## Os quatro perfis
| Perfil | Escopo |
|---|---|
| **MASTER-FOLKS** | Acesso total à plataforma: clientes, conteúdo, financeiro de todos, configurações gerais e parametrização de cada empresa. Cria e exclui outros MASTERs, **mas não pode excluir a si mesmo**. |
| **ADMIN-CLIENTE** | Acesso total, mas **só aos dados da própria empresa**: colaboradores, departamentos, liberação de planetas por departamento, trilhas obrigatórias com prazo e prioridade, e dashboards. Não altera as cotas de licença (isso é do MASTER). |
| **COLABORADOR-CLIENTE** | Vê só os cursos e temas liberados para os departamentos dele (um ou mais). |
| **ALUNO-CLIENTE (B2C)** | Uso individual, grátis ou Premium. |

## Contexto ativo (modo)
Um mesmo usuário pode ter vários papéis. O **contexto ativo** vai no token:
- `PLATFORM`: atuando como MASTER.
- `TENANT`: dentro da empresa, como ADMIN ou COLABORADOR.
- `B2C`: modo individual (todo usuário tem).

**Um colaborador também pode ser B2C:** ele paga o uso individual e alterna entre o modo B2B e o B2C com o mesmo usuário (`switch-context`).

## Regras de vínculo
- **Uma pessoa só pode estar em UMA empresa** (convidada ou ativa). Decisão do cliente; ver ADR 0003.
- Remover alguém da empresa apaga só o vínculo. A conta continua no modo B2C.
- A empresa sempre mantém **pelo menos 1 ADMIN ativo**.
- Vínculo desativado (`DISABLED`) libera a pessoa para entrar em outra empresa.
- "Ver como" (MASTER): token de 30 minutos, **somente leitura**, simulando o ADMIN ou um colaborador de uma empresa.
