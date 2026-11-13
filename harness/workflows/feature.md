# Workflow: nova feature ou mudança de regra

> tags: workflow, feature, processo, etapas, orquestração, handoff

O `tech-lead` conduz. Cada etapa tem **entrada**, **responsável**, **saída** e **gate**. Não pule gate.

| # | Etapa | Responsável | Saída | Gate para avançar |
|---|---|---|---|---|
| 1 | Entender | tech-lead | Objetivo em 1 frase + perguntas que mudam o resultado | Ambiguidades críticas respondidas pelo usuário |
| 2 | Regras | especialista-dominio | Regras com fonte, casos de borda, critérios de aceite | Nenhuma regra "inventada"; lacunas explícitas |
| 3 | Desenho | arquiteto-software (se houver decisão estrutural) | ADR + impacto por módulo | ADR `aceita` ou decisão trivial justificada |
| 4 | Dados | dba-modelagem | Schema + migração revisada e aplicada no dev | `migrate diff --exit-code` = 0 |
| 5 | Implementação | backend-nestjs / integracoes / conteudo-ia | Código + testes unitários | `npm run gates` verde |
| 6 | Verificação | qa-testes | Roteiro e2e N/N em banco isolado | Todos os critérios de aceite cobertos |
| 7 | Segurança | seguranca-multitenant | Parecer | Não BLOQUEADO |
| 8 | Revisão | revisor-codigo | Parecer | APROVADO |
| 9 | Conhecimento | documentador | knowledge/ + caso de RAG | `rag:eval` sem regressão |
| 10 | Entrega | tech-lead (skill `entregar-feature`) | Resumo honesto ao usuário | Definition of Done |

## Handoff (modelo de mensagem para um subagente)
```
OBJETIVO: <1 frase>
CONTEXTO: <regras com fonte; arquivos relevantes; decisões já tomadas>
ENTREGA: <o que devolver, em que formato>
PRONTO QUANDO: <critério verificável>
NÃO FAÇA: <limites: ex. não alterar schema, não publicar conteúdo>
```
O subagente **não vê** a conversa: tudo que importa vai no handoff.

## Paralelismo
- Regras (2) e leitura de código existente podem rodar juntas.
- Segurança (7) e revisão (8) podem rodar em paralelo depois da verificação.
- Dados (4) sempre antes da implementação que depende do schema.
