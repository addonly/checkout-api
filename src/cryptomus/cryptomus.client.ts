import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CryptomusSignatureService } from './cryptomus-signature.service';

export interface CryptomusInvoicePayload {
  amount: string;
  currency: string;
  order_id: string;
  to_currency: string;
  network: string;
  url_callback: string;
  url_return: string;
  url_success: string;
  lifetime: number;
  is_payment_multiple: boolean;
  accuracy_payment_percent: number;
  subtract: number;
  additional_data?: string;
}

export interface CryptomusInvoiceResponse {
  state: number;
  result: {
    uuid: string;
    order_id: string;
    amount: string;
    payment_amount: string;
    payer_amount: string;
    payer_currency: string;
    currency: string;
    merchant_amount: string;
    network: string;
    address: string;
    from: string | null;
    txid: string | null;
    payment_status: string;
    url: string;
    expired_at: number;
    is_final: boolean;
    additional_data: string | null;
    created_at: string;
    updated_at: string;
  };
}

export interface CryptomusServiceOption {
  currency: string;
  network: string;
  is_available: boolean;
  limit: { min_amount: string; max_amount: string };
  commission: { fee_amount: string; percent: string };
}

@Injectable()
export class CryptomusClient {
  private readonly logger = new Logger(CryptomusClient.name);
  private readonly baseUrl: string;
  private readonly merchantId: string;
  private readonly paymentApiKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly signatureService: CryptomusSignatureService,
  ) {
    this.baseUrl = this.config.get('CRYPTOMUS_API_URL', 'https://api.cryptomus.com');
    this.merchantId = this.config.get('CRYPTOMUS_MERCHANT_ID', '');
    this.paymentApiKey = this.config.get('CRYPTOMUS_PAYMENT_API_KEY', '');
  }

  async post<T>(path: string, payload: unknown): Promise<T> {
    const body = JSON.stringify(payload ?? {});
    const sign = this.signatureService.createSign(body, this.paymentApiKey);

    this.logger.debug(`POST ${this.baseUrl}${path}`);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          merchant: this.merchantId,
          sign,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err: any) {
      this.logger.error(`Cryptomus request failed: ${err?.message}`);
      throw new InternalServerErrorException('Payment provider unavailable');
    }

    const json = await response.json();

    if (!response.ok || json?.state !== 0) {
      const msg = Array.isArray(json?.errors)
        ? Object.values(json.errors).flat().join(', ')
        : (json?.message || `HTTP ${response.status}`);
      this.logger.error(`Cryptomus error: ${msg}`);
      throw new InternalServerErrorException(`Payment provider error: ${msg}`);
    }

    return json as T;
  }
}
