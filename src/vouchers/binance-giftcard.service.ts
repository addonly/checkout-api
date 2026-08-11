import * as crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

// ── Tipos ─────────────────────────────────────────────────────

export interface BinanceRedeemResult {
  binanceSuccess: boolean;
  status: 'PAID' | 'MANUAL_REVIEW';
  token?: string;
  amount?: string;
  referenceNo?: string;
  error?: string;
}

// ── Service ───────────────────────────────────────────────────

@Injectable()
export class BinanceGiftCardService {
  private readonly logger = new Logger(BinanceGiftCardService.name);

  // Cache da RSA public key (válida ~6h)
  private rsaCache: { key: string; at: number } | null = null;

  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;
  private readonly recvWindow: number;

  constructor(private readonly config: ConfigService) {
    this.apiKey     = this.config.get<string>('BINANCE_API_KEY', '');
    this.apiSecret  = this.config.get<string>('BINANCE_API_SECRET', '');
    this.baseUrl    = this.config.get<string>('BINANCE_API_BASE_URL', 'https://api.binance.com');
    this.recvWindow = this.config.get<number>('BINANCE_RECV_WINDOW', 5000);
  }

  // ── Assinatura HMAC-SHA256 ────────────────────────────────

  private sign(params: string): string {
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(params)
      .digest('hex');
  }

  private get headers() {
    return { 'X-MBX-APIKEY': this.apiKey };
  }

  // ── RSA Public Key (Binance) ──────────────────────────────

  private async getRsaPublicKey(): Promise<string> {
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    if (this.rsaCache && Date.now() - this.rsaCache.at < SIX_HOURS) {
      return this.rsaCache.key;
    }

    const ts = Date.now();
    const params = `timestamp=${ts}&recvWindow=${this.recvWindow}`;
    const sig = this.sign(params);

    const res = await axios.get(
      `${this.baseUrl}/sapi/v1/giftcard/cryptography/rsa-public-key?${params}&signature=${sig}`,
      { headers: this.headers, timeout: 8000 },
    );

    if (!res.data?.success || !res.data?.data) {
      throw new Error('Could not fetch Binance RSA public key');
    }

    this.rsaCache = { key: res.data.data as string, at: Date.now() };
    return this.rsaCache.key;
  }

  // ── Encriptar código com RSA/OAEP-SHA256 ──────────────────

  private async encryptCode(plainCode: string): Promise<string> {
    const keyB64 = await this.getRsaPublicKey();
    const pem = [
      '-----BEGIN PUBLIC KEY-----',
      Buffer.from(keyB64, 'base64').toString('base64').match(/.{1,64}/g)!.join('\n'),
      '-----END PUBLIC KEY-----',
    ].join('\n');

    const encrypted = crypto.publicEncrypt(
      { key: pem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(plainCode, 'utf8'),
    );
    return encrypted.toString('base64');
  }

  // ── Redeem — chamada à Binance ────────────────────────────

  async redeemCode(
    plainCode: string,
    externalUid: string,
  ): Promise<BinanceRedeemResult> {

    const normalized = plainCode.trim().toUpperCase().replace(/-/g, '');

    // Validação de formato: 16 chars alfanuméricos
    if (!/^[A-Z0-9]{16}$/.test(normalized)) {
      this.logger.warn(`Invalid redemption code format: ${normalized.slice(0, 4)}...`);
      return { binanceSuccess: false, status: 'MANUAL_REVIEW', error: 'Invalid code format' };
    }

    // Encriptar com RSA (recomendado pela Binance)
    let codeToSend = normalized;
    try {
      codeToSend = await this.encryptCode(normalized);
      this.logger.debug('Code encrypted with Binance RSA key');
    } catch (rsaErr) {
      this.logger.warn(`RSA encrypt failed (using plain): ${rsaErr}`);
      // Continua com código simples — a Binance aceita ambos
    }

    // Construir request assinado
    const ts = Date.now();
    const paramStr = [
      `code=${encodeURIComponent(codeToSend)}`,
      `externalUid=${encodeURIComponent(externalUid)}`,
      `timestamp=${ts}`,
      `recvWindow=${this.recvWindow}`,
    ].join('&');

    const signature = this.sign(paramStr);
    const url = `${this.baseUrl}/sapi/v1/giftcard/redeemCode?${paramStr}&signature=${signature}`;

    try {
      const res = await axios.post(url, null, {
        headers: { ...this.headers, 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 12000,
      });

      const { success, code, message, data } = res.data;

      if (success && code === '000000' && data) {
        this.logger.log(
          `✅ Binance Gift Card redeemed: ${data.amount} ${data.token} | ref: ${data.referenceNo}`,
        );
        return {
          binanceSuccess: true,
          status: 'PAID',
          token: data.token,
          amount: data.amount,
          referenceNo: data.referenceNo,
        };
      }

      this.logger.warn(`Binance redeem rejected: [${code}] ${message}`);
      return { binanceSuccess: false, status: 'MANUAL_REVIEW', error: `${code}: ${message}` };

    } catch (err: any) {
      const isTimeout = err.code === 'ECONNABORTED' || String(err.message).includes('timeout');

      this.logger.error(
        `Binance redeemCode ${isTimeout ? 'TIMEOUT' : 'ERROR'}: ${err.message}`,
      );

      // Timeout = incerteza → sempre MANUAL_REVIEW, nunca retry automático
      return {
        binanceSuccess: false,
        status: 'MANUAL_REVIEW',
        error: isTimeout ? 'Request timed out — check Funding Wallet manually' : err.message,
      };
    }
  }
}
