# Campo apagado no formulário de edição não era salvo

> tags: aprendizado, web, formularios, patch | origem: teste | data: 2026-11-11

## Regra
Em formulário de edição, campo apagado precisa ir como null ou '', nunca omitido. Ao criar, omitir continua certo.

## Contexto
Teste do painel: apagar telefone, CNPJ, descrição ou data de contrato e salvar mostrava 'salvo', mas o valor antigo continuava no banco.

## O que estava errado
Usar opt() (texto vazio vira undefined) também na edição; o PATCH ignora campos undefined. No back-end, settingsData trocava null por undefined nas datas de contrato.

## O que é correto
Na edição, mandar null (colunas anuláveis validadas por class-validator) ou '' (schemas Zod z.string().optional()) para limpar; auxiliar optEdit(v, editando) em components/admin.tsx. settingsData passou a respeitar null. Verificado no painel e pela API.
