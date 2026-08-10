import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CryptomusSignatureService {
  /**
   * Gera assinatura para requests à Cryptomus Merchant API
   * Fórmula: MD5( BASE64(JSON_BODY) + API_KEY )
   */
  createSign(serializedBody: string, apiKey: string): string {
    const base64 = Buffer.from(serializedBody, 'utf8').toString('base64');
    return crypto.createHash('md5').update(base64 + apiKey).digest('hex');
  }

  /**
   * Valida assinatura recebida no webhook
   * Remove o campo `sign` do payload, recomputa e faz timing-safe compare
   */
  verifyWebhook(
    payload: Record<string, unknown>,
    paymentApiKey: string,
  ): boolean {
    const receivedSign = String(payload['sign'] ?? '');

    const body = { ...payload };
    delete body['sign'];

    const serialized = JSON.stringify(body);
    const expected = this.createSign(serialized, paymentApiKey);

    if (receivedSign.length !== expected.length) return false;

    return crypto.timingSafeEqual(
      Buffer.from(receivedSign),
      Buffer.from(expected),
    );
  }
}
