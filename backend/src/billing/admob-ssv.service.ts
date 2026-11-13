import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AllowanceFeature } from '@prisma/client';
import { verify } from 'crypto';
import { EntitlementsService } from '../access/entitlements.service';

const KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Verificação server-side (SSV) do anúncio com recompensa do AdMob.
 * O Google chama GET /api/billing/webhooks/admob/ssv?...&signature=..&key_id=..
 * com user_id = id do usuário da API e custom_data = "infinite" | "jam".
 * A assinatura (ECDSA/SHA-256) cobre a query string até antes de "&signature=".
 */
@Injectable()
export class AdmobSsvService {
  private readonly log = new Logger(AdmobSsvService.name);
  private keys: { at: number; map: Map<string, string> } | null = null;

  constructor(private readonly entitlements: EntitlementsService) {}

  async handle(originalUrl: string) {
    const qs = originalUrl.includes('?') ? originalUrl.slice(originalUrl.indexOf('?') + 1) : '';
    const sigIdx = qs.indexOf('&signature=');
    if (sigIdx < 0) throw new BadRequestException('Assinatura ausente');
    const message = qs.slice(0, sigIdx);
    const params = new URLSearchParams(qs);
    const signature = params.get('signature')!;
    const keyId = params.get('key_id')!;
    if (!(await this.verify(message, signature, keyId))) throw new ForbiddenException('Assinatura inválida');

    const userId = params.get('user_id') ?? '';
    const transactionId = params.get('transaction_id') ?? '';
    const feature: AllowanceFeature = params.get('custom_data') === 'jam' ? 'JAM' : 'INFINITE';
    if (!UUID.test(userId) || !transactionId) throw new BadRequestException('user_id/transaction_id inválidos');
    const r = await this.entitlements.grantAdBonus(userId, feature, transactionId);
    if (!r.granted) this.log.log(`Recompensa AdMob não concedida (${r.reason}) user=${userId} tx=${transactionId}`);
    return r;
  }

  private async verify(message: string, signatureB64Url: string, keyId: string) {
    const pem = (await this.publicKeys()).get(keyId) ?? (await this.publicKeys(true)).get(keyId);
    if (!pem) return false;
    const sig = Buffer.from(signatureB64Url.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    try {
      return verify('sha256', Buffer.from(message), pem, sig);
    } catch {
      return false;
    }
  }

  private async publicKeys(force = false) {
    if (!force && this.keys && Date.now() - this.keys.at < 24 * 3600_000) return this.keys.map;
    const res = await fetch(KEYS_URL);
    if (!res.ok) throw new Error(`Falha ao baixar chaves do AdMob: HTTP ${res.status}`);
    const json = (await res.json()) as { keys: Array<{ keyId: number | string; pem: string }> };
    this.keys = { at: Date.now(), map: new Map(json.keys.map((k) => [String(k.keyId), k.pem])) };
    return this.keys.map;
  }
}
