import {
  Controller, Post, Body, Headers, Ip,
  Logger, HttpCode, BadRequestException, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CryptomusSignatureService } from '../cryptomus/cryptomus-signature.service';
import crypto from 'node:crypto';

// Mapeamento: status Cryptomus → estado interno do Order
const STATUS_MAP: Record<string, string> = {
  check:                 'PAYMENT_SUBMITTED',
  process:               'PAYMENT_SUBMITTED',
  confirm_check:         'PAYMENT_CONFIRMED',
  wrong_amount_waiting:  'PAYMENT_SUBMITTED',  // aguarda completar
  paid:                  'PAYMENT_CONFIRMED',
  paid_over:             'PAYMENT_CONFIRMED',
  wrong_amount:          'UNDER_REVIEW',
  locked:                'UNDER_REVIEW',       // AML_REVIEW → manual
  cancel:                'REJECTED',
  fail:                  'REJECTED',
  system_fail:           'PENDING',            // retentável
  refund_process:        'REFUNDED',
  refund_fail:           'UNDER_REVIEW',
  refund_paid:           'REFUNDED',
};

// IP oficial da Cryptomus (confirmar antes do deploy)
const CRYPTOMUS_IP = '91.227.144.54';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly signatureService: CryptomusSignatureService,
    private readonly config: ConfigService,
  ) {}

  @Post('cryptomus')
  @HttpCode(200)
  async handleCryptomus(
    @Body() payload: Record<string, unknown>,
    @Headers('x-forwarded-for') forwardedFor: string | undefined,
    @Ip() ip: string,
  ) {
    const apiKey = this.config.get<string>('CRYPTOMUS_PAYMENT_API_KEY', '');

    // ── 1. Verificar IP (camada adicional, não substitui assinatura)
    const remoteIp = (forwardedFor?.split(',')[0] ?? ip ?? '').trim();
    const isProdEnv = this.config.get('NODE_ENV') === 'production';
    if (isProdEnv && remoteIp && remoteIp !== CRYPTOMUS_IP) {
      this.logger.warn(`Webhook from unexpected IP: ${remoteIp}`);
      // Log apenas em prod — não bloquear em dev
    }

    // ── 2. Validar assinatura Cryptomus
    if (apiKey && !this.signatureService.verifyWebhook(payload, apiKey)) {
      this.logger.error('Invalid Cryptomus webhook signature');
      throw new UnauthorizedException('Invalid signature');
    }

    const cryptomusUuid   = String(payload['uuid']         ?? '');
    const cryptomusOrder  = String(payload['order_id']     ?? '');
    const providerStatus  = String(payload['payment_status'] ?? '');
    const isFinal         = Boolean(payload['is_final']);

    if (!cryptomusUuid && !cryptomusOrder) {
      throw new BadRequestException('Missing uuid and order_id');
    }

    // ── 3. Idempotência — hash do payload
    const payloadStr = JSON.stringify(payload);
    const eventHash  = crypto.createHash('sha256').update(payloadStr).digest('hex');

    const existing = await this.prisma.webhookEvent.findUnique({
      where: { eventHash },
    });
    if (existing) {
      this.logger.debug(`Duplicate webhook ${eventHash.slice(0, 12)} — skip`);
      return { ok: true };
    }

    // ── 4. Encontrar CryptoPayment
    const cryptoPayment = await this.prisma.cryptoPayment.findFirst({
      where: {
        OR: [
          { cryptomusUuid:    cryptomusUuid   || undefined },
          { cryptomusOrderId: cryptomusOrder  || undefined },
        ],
      },
      include: { order: true },
    });

    // ── 5. Gravar evento (mesmo se payment não encontrado, para auditoria)
    await this.prisma.webhookEvent.create({
      data: {
        eventHash,
        provider:       'cryptomus',
        cryptoPaymentId: cryptoPayment?.id ?? null,
        providerStatus,
        payloadJson:    payload as any,
        receivedAt:     new Date(),
      },
    });

    if (!cryptoPayment) {
      this.logger.warn(`No CryptoPayment found for uuid=${cryptomusUuid} order=${cryptomusOrder}`);
      return { ok: true }; // Responder 200 para a Cryptomus não retentar indefinidamente
    }

    // ── 6. Mapear status e actualizar em transação
    const newOrderStatus  = STATUS_MAP[providerStatus];
    const confirmedAt     = ['paid', 'paid_over'].includes(providerStatus) ? new Date() : undefined;

    await this.prisma.$transaction([
      // Atualizar CryptoPayment
      this.prisma.cryptoPayment.update({
        where: { id: cryptoPayment.id },
        data: {
          providerStatus,
          isFinal,
          txid:          String(payload['txid']          ?? '') || null,
          fromAddress:   String(payload['from']          ?? '') || null,
          paymentAmount: payload['payment_amount']  ? parseFloat(String(payload['payment_amount']))  : undefined,
          merchantAmount:payload['merchant_amount'] ? parseFloat(String(payload['merchant_amount'])) : undefined,
          confirmedAt,
        },
      }),
      // Atualizar Order (apenas se houver mapeamento)
      ...(newOrderStatus ? [
        this.prisma.order.update({
          where: { id: cryptoPayment.orderId },
          data:  {
            status:      newOrderStatus as any,
            approvedAt:  confirmedAt,
          },
        }),
      ] : []),
      // Marcar webhook como processado
      this.prisma.webhookEvent.update({
        where: { eventHash },
        data:  { processedAt: new Date() },
      }),
    ]);

    this.logger.log(
      `Webhook processed: order=${cryptoPayment.order?.publicId} status=${providerStatus} → ${newOrderStatus}`,
    );

    return { ok: true };
  }
}
