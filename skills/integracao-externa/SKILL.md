---
name: integracao-externa
description: Padrão para integrar um serviço externo (pagamento, vídeo, e-mail, push, storage) - configuração por env, cliente isolado, webhook autenticado e idempotente, mapeamento de status, testes com API simulada e registro honesto do que foi validado. Use ao criar ou alterar qualquer integração.
---

# Integração externa

1. **Leia** `knowledge/integracoes/` e a documentação oficial do provedor (WebFetch). Anote endpoints, autenticação, eventos e status.
2. **Configuração:** `XXX_API_KEY`, `XXX_API_URL` (configurável para sandbox ou mock) e `XXX_WEBHOOK_TOKEN`, no `.env.example` com comentário de onde obter. Sem chave, a feature responde `503` com mensagem clara (não quebra a API).
3. **Cliente:**
   - um service por provedor;
   - `request()` central que traduz erros para pt-BR, envia `User-Agent` e **nunca loga segredo**;
   - paginação percorrida até o fim, com limite de segurança.
4. **Webhook:**
   - autenticação em tempo constante (`timingSafeEqual`) ou assinatura verificada;
   - `WebhookEvent` gravado antes de processar (idempotência); `processedAt` só no sucesso; `error` na falha;
   - responder 200 rápido, sem trabalho pesado síncrono.
5. **Estado:** tabela explícita de evento → status local. Nunca "piore" um estado (ex.: não reduzir `currentPeriodEnd`). Estado pendente não libera nada.
6. **Testes:**
   - mock a partir de `skills/testes-e2e/templates/mock-api.mjs`;
   - cobrir sucesso, credencial inválida, evento duplicado, erro do provedor e o caso de negócio principal;
   - conferir em `/_calls` o payload enviado (valores, centavos → reais etc.).
7. **Conhecimento:** atualize `knowledge/integracoes/<provedor>.md` com o status honesto: "validado com mock" × "validado no sandbox" × "em produção".
