import { Injectable, Logger } from '@nestjs/common';
import { CryptomusClient, CryptomusServiceOption, CryptomusInvoicePayload, CryptomusInvoiceResponse } from './cryptomus.client';

// Allowlist interna — apenas estes pares são permitidos
const CRYPTO_ALLOWLIST: Array<{ currency: string; network: string }> = [
  { currency: 'USDT', network: 'tron' },
  { currency: 'USDT', network: 'eth' },
  { currency: 'BTC',  network: 'BTC' },
  { currency: 'ETH',  network: 'eth' },
];

interface CachedServices {
  data: CryptomusServiceOption[];
  fetchedAt: number;
}

@Injectable()
export class CryptomusService {
  private readonly logger = new Logger(CryptomusService.name);
  private cache: CachedServices | null = null;
  private readonly cacheTtlMs = 300_000; // 5 minutos

  constructor(private readonly client: CryptomusClient) {}

  // ── Buscar e cachear lista de serviços ─────────
  async getServices(): Promise<CryptomusServiceOption[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.fetchedAt < this.cacheTtlMs) {
      return this.cache.data;
    }

    try {
      const response = await this.client.post<{ state: number; result: CryptomusServiceOption[] }>(
        '/v1/payment/services',
        {},
      );
      this.cache = { data: response.result ?? [], fetchedAt: now };
      return this.cache.data;
    } catch (err) {
      this.logger.warn('Failed to fetch Cryptomus services, returning cached or empty');
      return this.cache?.data ?? [];
    }
  }

  // ── Serviços filtrados (allowlist + disponíveis) ──
  async getFilteredServices() {
    const all = await this.getServices();

    return CRYPTO_ALLOWLIST
      .map(allowed => {
        const svc = all.find(
          s => s.currency === allowed.currency &&
               s.network === allowed.network &&
               s.is_available,
        );
        if (!svc) return null;
        return {
          currency: svc.currency,
          network:  svc.network,
          available: true,
          minAmount: svc.limit?.min_amount ?? '1',
          maxAmount: svc.limit?.max_amount ?? '10000',
        };
      })
      .filter(Boolean);
  }

  // ── Validar se par currency/network está disponível ──
  async validateServiceAvailability(
    currency: string,
    network: string,
    amount: string,
  ): Promise<{ valid: boolean; minAmount: string; maxAmount: string }> {
    const services = await this.getServices();
    const svc = services.find(
      s => s.currency === currency && s.network === network && s.is_available,
    );

    if (!svc) return { valid: false, minAmount: '0', maxAmount: '0' };

    const min = parseFloat(svc.limit?.min_amount ?? '0');
    const max = parseFloat(svc.limit?.max_amount ?? '999999');
    const amt = parseFloat(amount);

    return {
      valid: amt >= min && amt <= max,
      minAmount: svc.limit?.min_amount ?? '0',
      maxAmount: svc.limit?.max_amount ?? '999999',
    };
  }

  // ── Criar invoice na Cryptomus ─────────────────
  async createInvoice(payload: CryptomusInvoicePayload): Promise<CryptomusInvoiceResponse['result']> {
    const response = await this.client.post<CryptomusInvoiceResponse>('/v1/payment', payload);
    return response.result;
  }

  // ── Consultar informações de pagamento ─────────
  async getPaymentInfo(uuid: string) {
    const response = await this.client.post<{ state: number; result: any }>(
      '/v1/payment/info',
      { uuid },
    );
    return response.result;
  }

  // ── Gerar QR Code ──────────────────────────────
  async getQrCode(merchantPaymentUuid: string): Promise<string> {
    const response = await this.client.post<{ state: number; result: { image: string } }>(
      '/v1/payment/qr',
      { merchant_payment_uuid: merchantPaymentUuid },
    );
    return response.result?.image ?? '';
  }
}
