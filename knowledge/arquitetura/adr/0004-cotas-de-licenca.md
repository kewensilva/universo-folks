# ADR 0004 — Cotas de licença separadas: colaboradores e administradores

> tags: adr, licenças, cotas, limite, colaboradores, administradores, maxAdmins, maxCollaborators | status: aceita (decisão do cliente) | data: 2026-11-09

## Decisão
- O MASTER define, por empresa, `maxCollaborators` (coluna `max_users`) e `maxAdmins` (padrão 2). 0 = sem limite.
- `SeatsService` é o único lugar que conta e valida a ocupação (convidados + ativos por papel).
- Mudança de papel muda de cota: promover a ADMIN exige vaga de admin e libera uma de colaborador.
- Não é permitido baixar uma cota abaixo do uso, nem `maxAdmins` abaixo de 1 (exceto 0 = sem limite).
- O ADMIN da empresa **não** altera cotas.
- Contrato no Asaas: `seats` → colaboradores e `adminSeats` → administradores.
- Alertas no painel MASTER: perto do limite (90%), limite de colaboradores atingido e limite de admins atingido.
