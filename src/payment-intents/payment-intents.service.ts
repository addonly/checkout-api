import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CryptomusService } from '../cryptomus/cryptomus.service';
import { AmountValidatorService } from './amount-validator.service';
import { CreateCryptoIntentDto } from './dto/create-crypto-intent.dto';
import { PaymentIntentStatus, OrderStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';

@Injectable()
export class PaymentIntentsService {
  private readonly logger = new Logger(PaymentIntentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptomus: CryptomusService,
    private readonly amountValidator: AmountValidatorService,
    private readonly config: ConfigService,
  ) {}

  // ── Criar PaymentIntent + Invoice Cryptomus ────
  async createCryptoIntent(orderPublicId: string, dto: CreateCryptoIntentDto) {
    // 1. Carregar pedido
    const order = await this.prisma.order.findUnique({
      where: { publicId: orderPublicId },
      include: { product: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (['DELIVERED', 'REJECTED', 'EXPIRED', 'REFUNDED'].includes(order.status)) {
      throw new BadRequestException(`Order is ${order.status} and cannot accept new payments`);
    }

    // 2. Validar valor
    const validated = this.amountValidator.validate(dto.amount);

    // 3. Verificar allowlist + disponibilidade Cryptomus
    const availability = await this.cryptomus.validateServiceAvailability(
      dto.cryptoCurrency,
      dto.network,
      validated.normalized,
    );
    if (!availability.valid) {
      const isNoCreds = !this.config.get('CRYPTOMUS_MERCHANT_ID');
      if (isNoCreds) {
        throw new BadRequestException('Crypto payment is not yet configured. Please contact support.');
      }
      throw new BadRequestException(
        `Amount must be between $${availability.minAmount} and $${availability.maxAmount} for ${dto.cryptoCurrency}/${dto.network}`,
      );
    }

    // 4. Criar PaymentIntent
    const piPublicId = `PI_${randomBytes(8).toString('hex').toUpperCase()}`;
    const paymentIntent = await this.prisma.paymentIntent.create({
      data: {
        publicId:        piPublicId,
        orderId:         order.id,
        method:          'CRYPTO',
        enteredAmount:   validated.decimal,
        baseCurrency:    validated.currency,
        selectedCrypto:  dto.cryptoCurrency,
        selectedNetwork: dto.network,
        status:          PaymentIntentStatus.INVOICE_CREATED,
      },
    });

    // 5. Gerar ID único para a Cryptomus
    const cryptomusOrderId = `CP_${piPublicId}`;

    const callbackUrl = this.config.get('CRYPTOMUS_CALLBACK_URL', 'http://localhost:3001/api/v1/webhooks/cryptomus');
    const returnUrl   = `${this.config.get('CRYPTOMUS_RETURN_URL', 'http://localhost:5173/checkout')}/${orderPublicId}`;
    const successUrl  = `${returnUrl}?payment=success`;

    // 6. Criar invoice na Cryptomus
    this.logger.log(`Creating Cryptomus invoice: ${cryptomusOrderId} for ${validated.normalized} USD → ${dto.cryptoCurrency}/${dto.network}`);

    const invoice = await this.cryptomus.createInvoice({
      amount:                   validated.normalized,
      currency:                 'USD',
      order_id:                 cryptomusOrderId,
      to_currency:              dto.cryptoCurrency,
      network:                  dto.network,
      url_callback:             callbackUrl,
      url_return:               returnUrl,
      url_success:              successUrl,
      lifetime:                 3600,
      is_payment_multiple:      true,
      accuracy_payment_percent: 0,
      subtract:                 0,
      additional_data:          piPublicId,
    });

    const expiresAt = invoice.expired_at
      ? new Date(invoice.expired_at * 1000)
      : new Date(Date.now() + 3600_000);

    // 7. Persistir CryptoPayment
    await this.prisma.cryptoPayment.upsert({
      where: { orderId: order.id },
      create: {
        orderId:          order.id,
        paymentIntentId:  paymentIntent.id,
        provider:         'CRYPTOMUS',
        cryptomusUuid:    invoice.uuid,
        cryptomusOrderId: cryptomusOrderId,
        enteredAmount:    validated.decimal,
        invoiceAmount:    validated.decimal,
        invoiceCurrency:  'USD',
        payerAmount:      invoice.payer_amount ? parseFloat(invoice.payer_amount) : null,
        payerCurrency:    invoice.payer_currency || dto.cryptoCurrency,
        network:          invoice.network || dto.network,
        address:          invoice.address,
        providerStatus:   invoice.payment_status || 'check',
        isFinal:          invoice.is_final ?? false,
        invoiceUrl:       invoice.url,
        expiresAt,
      },
      update: {
        paymentIntentId:  paymentIntent.id,
        cryptomusUuid:    invoice.uuid,
        cryptomusOrderId: cryptomusOrderId,
        enteredAmount:    validated.decimal,
        invoiceAmount:    validated.decimal,
        payerAmount:      invoice.payer_amount ? parseFloat(invoice.payer_amount) : null,
        payerCurrency:    invoice.payer_currency || dto.cryptoCurrency,
        network:          invoice.network || dto.network,
        address:          invoice.address,
        providerStatus:   invoice.payment_status || 'check',
        isFinal:          invoice.is_final ?? false,
        invoiceUrl:       invoice.url,
        expiresAt,
      },
    });

    // 8. Atualizar PaymentIntent com expiresAt
    await this.prisma.paymentIntent.update({
      where: { id: paymentIntent.id },
      data:  { expiresAt },
    });

    // 9. Actualizar Order para PAYMENT_SUBMITTED
    await this.prisma.order.update({
      where: { id: order.id },
      data:  { status: OrderStatus.PAYMENT_SUBMITTED, paymentMethod: 'CRYPTO' },
    });

    // 10. Buscar QR
    let qrImage = '';
    try {
      qrImage = await this.cryptomus.getQrCode(invoice.uuid);
    } catch { /* QR é opcional */ }

    // 11. Retornar payload seguro (sem secrets)
    return {
      paymentIntentId: piPublicId,
      orderId:         orderPublicId,
      enteredAmount:   validated.normalized,
      baseCurrency:    validated.currency,
      crypto: {
        amount:   invoice.payer_amount || '0',
        currency: invoice.payer_currency || dto.cryptoCurrency,
        network:  invoice.network || dto.network,
        address:  invoice.address,
      },
      invoiceUrl: invoice.url,
      qrImage,
      status:    'WAITING_PAYMENT',
      expiresAt: expiresAt.toISOString(),
    };
  }

  // ── Obter estado do PaymentIntent ──────────────
  async getStatus(publicId: string) {
    const pi = await this.prisma.paymentIntent.findUnique({
      where: { publicId },
      include: { cryptoPayment: true, order: true },
    });
    if (!pi) throw new NotFoundException('Payment intent not found');

    return {
      paymentIntentId: pi.publicId,
      status:          pi.status,
      orderStatus:     pi.order.status,
      providerStatus:  pi.cryptoPayment?.providerStatus,
      isFinal:         pi.cryptoPayment?.isFinal ?? false,
      expiresAt:       pi.expiresAt?.toISOString(),
    };
  }

  // ── Obter QR Code ──────────────────────────────
  async getQr(publicId: string) {
    const pi = await this.prisma.paymentIntent.findUnique({
      where: { publicId },
      include: { cryptoPayment: true },
    });
    if (!pi?.cryptoPayment?.cryptomusUuid) {
      throw new NotFoundException('Payment intent not found or no invoice');
    }
    const image = await this.cryptomus.getQrCode(pi.cryptoPayment.cryptomusUuid);
    return { qrImage: image };
  }

  // ── Obter detalhes ─────────────────────────────
  async getOne(publicId: string) {
    const pi = await this.prisma.paymentIntent.findUnique({
      where: { publicId },
      include: { cryptoPayment: true, order: { include: { product: true } } },
    });
    if (!pi) throw new NotFoundException('Payment intent not found');

    const cp = pi.cryptoPayment;
    return {
      paymentIntentId: pi.publicId,
      orderId:         pi.order.publicId,
      enteredAmount:   pi.enteredAmount.toString(),
      baseCurrency:    pi.baseCurrency,
      selectedCrypto:  pi.selectedCrypto,
      selectedNetwork: pi.selectedNetwork,
      status:          pi.status,
      orderStatus:     pi.order.status,
      crypto: cp ? {
        amount:   cp.payerAmount?.toString() ?? '0',
        currency: cp.payerCurrency,
        network:  cp.network,
        address:  cp.address,
      } : null,
      invoiceUrl:     cp?.invoiceUrl,
      providerStatus: cp?.providerStatus,
      isFinal:        cp?.isFinal ?? false,
      expiresAt:      pi.expiresAt?.toISOString(),
    };
  }
}
