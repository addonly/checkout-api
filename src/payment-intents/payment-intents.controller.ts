import {
  Body, Controller, Get, Param, Post,
} from '@nestjs/common';
import { PaymentIntentsService } from './payment-intents.service';
import { CreateCryptoIntentDto } from './dto/create-crypto-intent.dto';
import { CryptomusService } from '../cryptomus/cryptomus.service';
import { VouchersService } from '../vouchers/vouchers.service';
import { SubmitVoucherDto } from '../vouchers/dto/submit-voucher.dto';

@Controller('')
export class PaymentIntentsController {
  constructor(
    private readonly service: PaymentIntentsService,
    private readonly cryptomusService: CryptomusService,
    private readonly vouchersService: VouchersService,
  ) {}

  /**
   * GET /api/v1/crypto/services
   * Lista pares cripto/rede disponíveis (filtrado pela allowlist + Cryptomus)
   */
  @Get('crypto/services')
  async getServices() {
    const services = await this.cryptomusService.getFilteredServices();
    return {
      baseCurrency: 'USD',
      services,
    };
  }

  /**
   * POST /api/v1/orders/:publicId/payment-intents/voucher
   * Submete Binance Gift Card (ou voucher genérico) para um pedido
   */
  @Post('orders/:publicId/payment-intents/voucher')
  submitVoucher(
    @Param('publicId') publicId: string,
    @Body() body: { provider: string; code: string; type?: string },
  ) {
    // Normalizar provider para o enum Prisma (uppercase)
    const dto: SubmitVoucherDto = {
      orderId: publicId,
      provider: body.provider?.toUpperCase() as any,
      code: body.code?.replace(/-/g, '').toUpperCase(),
      type: body.type as any,
    };
    return this.vouchersService.submit(dto);
  }

  /**
   * POST /api/v1/orders/:publicId/payment-intents/crypto
   * Cria PaymentIntent + invoice Cryptomus para o pedido
   */
  @Post('orders/:publicId/payment-intents/crypto')
  createCryptoIntent(
    @Param('publicId') publicId: string,
    @Body() dto: CreateCryptoIntentDto,
  ) {
    return this.service.createCryptoIntent(publicId, dto);
  }

  /**
   * GET /api/v1/payment-intents/:publicId
   * Detalhes completos do PaymentIntent
   */
  @Get('payment-intents/:publicId')
  getOne(@Param('publicId') publicId: string) {
    return this.service.getOne(publicId);
  }

  /**
   * GET /api/v1/payment-intents/:publicId/status
   * Estado rápido para polling do frontend
   */
  @Get('payment-intents/:publicId/status')
  getStatus(@Param('publicId') publicId: string) {
    return this.service.getStatus(publicId);
  }

  /**
   * GET /api/v1/payment-intents/:publicId/qr
   * QR Code da invoice Cryptomus (base64)
   */
  @Get('payment-intents/:publicId/qr')
  getQr(@Param('publicId') publicId: string) {
    return this.service.getQr(publicId);
  }
}
