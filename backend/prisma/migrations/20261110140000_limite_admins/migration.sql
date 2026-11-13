-- Licenças por empresa em duas cotas definidas pelo MASTER:
--   max_users  -> licenças de COLABORADORES (coluna mantida; no Prisma: maxCollaborators)
--   max_admins -> licenças de ADMINISTRADORES (nova)
ALTER TABLE "tenant_settings" ADD COLUMN "max_admins" INTEGER NOT NULL DEFAULT 2;

-- empresas que já têm mais administradores que o padrão mantêm o que usam hoje
UPDATE "tenant_settings" ts SET max_admins = sub.n
FROM (
  SELECT tenant_id, COUNT(*)::int AS n FROM "memberships"
  WHERE role = 'ADMIN_CLIENTE' AND status IN ('ACTIVE', 'INVITED')
  GROUP BY tenant_id
) sub
WHERE sub.tenant_id = ts.tenant_id AND sub.n > 2;
