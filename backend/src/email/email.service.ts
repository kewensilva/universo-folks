import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const layout = (title: string, body: string, cta?: { label: string; url: string }) => `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#0d0a1f;font-family:Arial,sans-serif;color:#fff">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
<h1 style="font-size:22px;margin:0 0 16px">${esc(title)}</h1>
<div style="font-size:15px;line-height:1.5;color:#d6c8ff">${body}</div>
${cta ? `<p style="margin:28px 0"><a href="${cta.url}" style="background:#ffc21a;color:#1a1033;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:bold">${esc(cta.label)}</a></p>` : ''}
<p style="font-size:12px;color:#8e84b8;margin-top:32px">Folks Poplearning · Universo Folks</p></div></body></html>`;

/** Templates transacionais (convite, nova senha, lembrete de trilhas). */
export const templates = {
  invite(appUrl: string, token: string, company: string, admin: boolean): Omit<Mail, 'to'> {
    const url = `${appUrl}/convite?token=${encodeURIComponent(token)}`;
    const role = admin ? 'administrar a equipe' : 'estudar';
    return {
      subject: `${company} convidou você para o Universo Folks`,
      html: layout('Você foi convidado!', `<p>A <b>${esc(company)}</b> liberou um acesso para você ${role} no Universo Folks.</p><p>O link vale por 14 dias.</p>`, { label: 'Criar minha senha', url }),
      text: `A ${company} convidou você para o Universo Folks. Crie sua senha: ${url} (vale 14 dias)`,
    };
  },
  passwordReset(appUrl: string, token: string): Omit<Mail, 'to'> {
    const url = `${appUrl}/nova-senha?token=${encodeURIComponent(token)}`;
    return {
      subject: 'Redefinição de senha · Universo Folks',
      html: layout('Vamos criar uma nova senha', '<p>Recebemos um pedido para redefinir sua senha. O link vale por 1 hora. Se não foi você, ignore este e-mail.</p>', { label: 'Criar nova senha', url }),
      text: `Redefina sua senha: ${url} (vale 1 hora). Se não foi você, ignore.`,
    };
  },
  reminder(appUrl: string, company: string, pending: Array<{ title: string; due: string | null }>): Omit<Mail, 'to'> {
    const items = pending.map((p) => `<li>${esc(p.title)}${p.due ? ` — prazo ${esc(p.due)}` : ''}</li>`).join('');
    return {
      subject: `Suas trilhas na ${company} estão te esperando`,
      html: layout('Bora continuar?', `<p>Você tem trilhas da <b>${esc(company)}</b> para concluir:</p><ul>${items}</ul>`, { label: 'Abrir o app', url: appUrl }),
      text: `Trilhas pendentes na ${company}: ${pending.map((p) => p.title).join(', ')}. ${appUrl}`,
    };
  },
};

/**
 * Envio de e-mail pela Resend (RESEND_API_KEY). Sem chave, o e-mail é só
 * registrado no log (desenvolvimento).
 */
@Injectable()
export class EmailService {
  private readonly log = new Logger(EmailService.name);
  /** últimos e-mails (somente fora de produção) - útil em testes */
  readonly outbox: Mail[] = [];

  constructor(private readonly config: ConfigService) {}

  get appUrl() {
    return this.config.get<string>('PUBLIC_APP_URL') ?? this.config.get<string>('APP_URL', 'http://localhost:5173');
  }

  async send(mail: Mail) {
    if (this.config.get('NODE_ENV') !== 'production') {
      this.outbox.push(mail);
      if (this.outbox.length > 50) this.outbox.shift();
    }
    const key = this.config.get<string>('RESEND_API_KEY');
    if (!key) {
      this.log.log(`[e-mail simulado] para=${mail.to} assunto="${mail.subject}" :: ${mail.text}`);
      return;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.config.get('EMAIL_FROM', 'Folks Poplearning <nao-responda@folkspoplearning.com.br>'),
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
    });
    if (!res.ok) this.log.error(`Falha ao enviar e-mail para ${mail.to}: HTTP ${res.status} ${await res.text()}`);
  }
}

@Global()
@Module({ providers: [EmailService], exports: [EmailService] })
export class EmailModule {}
