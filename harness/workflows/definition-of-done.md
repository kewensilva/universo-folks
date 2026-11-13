# Definition of Done

> tags: definition of done, pronto, qualidade, critérios, entrega

Uma tarefa de código só está pronta quando:

- [ ] Os critérios de aceite do `especialista-dominio` estão cobertos por testes que **falhariam** sem a mudança.
- [ ] `npm run gates` verde: typecheck, lint e testes dos workspaces alterados + `harness:check` + `rag:eval` se o knowledge mudou. O hook `Stop` impõe isso.
- [ ] Isolamento multi-tenant verificado (`endpoint-multitenant`) quando a rota toca dados de empresa.
- [ ] Migração segura aplicada e banco sincronizado, quando houver mudança de schema.
- [ ] `knowledge/` atualizado: regra, decisão datada e integração (status honesto: mock × sandbox × produção).
- [ ] Correções do usuário registradas (`registrar-aprendizado`).
- [ ] O resumo ao usuário diz o que **não** foi verificado.
