import { Injectable, Logger } from '@nestjs/common';
import { CryptomusClient, CryptomusServiceOption, CryptomusInvoicePayload, CryptomusInvoiceResponse } from './cryptomus.client';

// Allowlist interna — network codes exactamente como a Cryptomus retorna
const CRYPTO_ALLOWLIST: Array<{ currency: string; network: string }> = [
  { currency: 'USDT', network: 'TRON' },
  { currency: 'USDT', network: 'BSC' },
  { currency: 'USDT', network: 'ETH' },
  { currency: 'USDT', network: 'SOL' },
  { currency: 'USDT', network: 'POLYGON' },
  { currency: 'USDT', network: 'ARBITRUM' },
  { currency: 'USDC', network: 'ETH' },
  { currency: 'USDC', network: 'BSC' },
  { currency: 'USDC', network: 'SOL' },
  { currency: 'BTC',  network: 'BTC' },
  { currency: 'ETH',  network: 'ETH' },
  { currency: 'SOL',  network: 'SOL' },
  { currency: 'BNB',  network: 'BSC' },
];

interface CachedServices {
  data: CryptomusServiceOption[];
  fetchedAt: number;
}

@Injectable()
export class CryptomusService {
  private readonly logger = new Logger(CryptomusService.name);
  private cache: CachedServices | null = null;
  private readonly cacheTtlMs = 120_000; // 2 minutos

  constructor(private readonly client: CryptomusClient) {}

  // -- Buscar e cachear lista de serviços ----------------------
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
      const list = response.result ?? [];
      this.logger.log(`Cryptomus services loaded: ${list.length} entries`);
      this.cache = { data: list, fetchedAt: now };
      return this.cache.data;
    } catch (err: any) {
      this.logger.warn(`Failed to fetch Cryptomus services: ${err?.message}`);
      return this.cache?.data ?? [];
    }
  }

  // -- Serviços filtrados (allowlist + disponíveis) ------------
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

  // -- Diagnóstico: retorna serviços brutos da Cryptomus -------
  async getRawServices(): Promise<{ total: number; available: number; services: CryptomusServiceOption[] }> {
    const all = await this.getServices();
    return {
      total: all.length,
      available: all.filter(s => s.is_available).length,
      services: all,
    };
  }

  // -- Validar se par currency/network está disponível ---------
  async validateServiceAvailability(
    currency: string,
    network: string,
    amount: string,
  ): Promise<{ valid: boolean; minAmount: string; maxAmount: string }> {
    const services = await this.getServices();

    if (services.length === 0) {
      this.logger.warn('No services available — Cryptomus credentials may be missing');
      return { valid: false, minAmount: '0', maxAmount: '0' };
    }

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

  // -- Criar invoice na Cryptomus -------------------------------
  async createInvoice(payload: CryptomusInvoicePayload): Promise<CryptomusInvoiceResponse['result']> {
    const response = await this.client.post<CryptomusInvoiceResponse>('/v1/payment', payload);
    return response.result;
  }

  // -- Consultar informações de pagamento -----------------------
  async getPaymentInfo(uuid: string) {
    const response = await this.client.post<{ state: number; result: any }>(
      '/v1/payment/info',
      { uuid },
    );
    return response.result;
  }

  // -- Gerar QR Code ---------------------------------------------
  async getQrCode(merchantPaymentUuid: string): Promise<string> {
    const response = await this.client.post<{ state: number; result: { image: string } }>(
      '/v1/payment/qr',
      { merchant_payment_uuid: merchantPaymentUuid },
    );
    return response.result?.image ?? '';
  }
}
