'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fmt } from '@folks/shared';
import { useSession } from '@/lib/session';
import { PUBLIC_API_URL } from '@/lib/env';
import { Button, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';
import { DataTable, Modal, NumberInput, SectionTitle, TextInput, useAction, useConfirm, useToast } from '@/components/admin';

interface Token { id: string; name: string; prefix: string; scopes: string[]; lastUsedAt?: string | null; expiresAt?: string | null; createdAt: string }

/** Conexão do Claude com a plataforma (MCP): só o MASTER, só para criar e editar conteúdo (ADR 0007). */
export default function IntegracoesPage() {
  const { api } = useSession();
  const toast = useToast();
  const [ask, node] = useConfirm();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: 'Claude', days: 90 as number | '' });
  const [created, setCreated] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['master', 'api-tokens'], queryFn: () => api.http.get<Token[]>('/master/api-tokens') });
  const create = useAction(() => api.http.post<{ token: string }>('/master/api-tokens', { name: f.name.trim(), expiresInDays: f.days === '' ? undefined : f.days }), { invalidate: [['master', 'api-tokens']], onDone: (r) => { setOpen(false); setCreated(r.token); } });
  const revoke = useAction((id: string) => api.http.del(`/master/api-tokens/${id}`), { success: 'Token revogado', invalidate: [['master', 'api-tokens']] });
  const mcpUrl = PUBLIC_API_URL.replace(/\/api\/?$/, '') + '/mcp';
  return (
    <>
      <PageTitle title="Integração com o Claude" subtitle="O Claude cria e edita planetas, cursos e trilhas a seu pedido. Ele não vê pessoas, relatórios nem financeiro." actions={<Button onClick={() => setOpen(true)}>+ Gerar token</Button>} />
      <Card className="mb-6">
        <SectionTitle>Como conectar</SectionTitle>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>Gere um token aqui (ele aparece uma única vez).</li>
          <li>
            <b className="text-ink">Claude Code</b> (terminal): rode o comando abaixo trocando <code className="text-ink">SEU_TOKEN</code> pelo token.
            <code className="mt-1 block break-all rounded-xl bg-bg p-3 font-mono text-xs text-ink">claude mcp add --transport http universo-folks {mcpUrl} --header &quot;Authorization: Bearer SEU_TOKEN&quot;</code>
          </li>
          <li>
            <b className="text-ink">Claude Desktop</b>: em Configurações › Desenvolvedor › Editar configuração, adicione ao <code className="text-ink">claude_desktop_config.json</code> e reinicie o app:
            <code className="mt-1 block whitespace-pre-wrap break-all rounded-xl bg-bg p-3 font-mono text-xs text-ink">{`{ "mcpServers": { "universo-folks": {
  "command": "npx",
  "args": ["-y", "mcp-remote", "${mcpUrl}", "--header", "Authorization:\${FOLKS_AUTH}"],
  "env": { "FOLKS_AUTH": "Bearer SEU_TOKEN" }
} } }`}</code>
          </li>
          <li>Peça, por exemplo: “crie o planeta Comunicação com os cursos e as URLs dos vídeos do Vimeo”. Tudo entra como rascunho para você revisar em Conteúdo.</li>
        </ol>
        <p className="mt-3 text-xs text-dim">Conector personalizado do claude.ai (site e app) ainda não: ele exige login por OAuth e um endereço HTTPS público, que entram com a publicação da API (ADR 0007).</p>
      </Card>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : (
        <DataTable rows={q.data!} rowKey={(t) => t.id} empty="Nenhum token ainda." minWidth={600}
          columns={[
            { key: 'n', label: 'Nome', render: (t) => <div><div className="font-bold">{t.name}</div><div className="font-mono text-xs text-dim">{t.prefix}…</div></div> },
            { key: 's', label: 'Permissão', render: (t) => t.scopes.join(', ') },
            { key: 'u', label: 'Último uso', render: (t) => fmt.relativeDays(t.lastUsedAt) },
            { key: 'e', label: 'Expira', render: (t) => t.expiresAt ? fmt.date(t.expiresAt) : 'Não expira' },
            { key: 'a', label: '', className: 'text-right', render: (t) => <button className="text-sm font-bold text-red" onClick={async () => { if (await ask({ title: 'Revogar token?', text: 'O Claude que usa este token perde o acesso na hora.', confirm: 'Revogar', danger: true })) revoke.mutate(t.id); }}>Revogar</button> },
          ]} />
      )}
      <Modal open={open} title="Gerar token para o Claude" onClose={() => setOpen(false)}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button loading={create.isPending} disabled={f.name.trim().length < 3} onClick={() => create.mutate(undefined)}>Gerar</Button></>}>
        <div className="flex flex-col gap-4">
          <TextInput label="Nome" value={f.name} onChange={(v) => setF({ ...f, name: v })} hint="Ex.: Claude do Pedro" />
          <NumberInput label="Validade (dias)" min={1} max={365} value={f.days} onChange={(v) => setF({ ...f, days: v })} hint="Vazio = não expira" />
        </div>
      </Modal>
      <Modal open={!!created} title="Token gerado" onClose={() => setCreated(null)} footer={<Button onClick={async () => { await navigator.clipboard.writeText(created ?? ''); toast('Token copiado'); }}>Copiar token</Button>}>
        <p className="mb-3 text-sm text-amber">Copie agora: por segurança ele não aparece de novo.</p>
        <code className="block break-all rounded-xl bg-bg p-4 font-mono text-sm">{created}</code>
      </Modal>
      {node}
    </>
  );
}
