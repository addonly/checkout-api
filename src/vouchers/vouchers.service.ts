import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitVoucherDto } from './dto/submit-voucher.dto';
import { BinanceGiftCardService } from './binance-giftcard.service';
import { OrderStatus, VerificationStatus } from '@prisma/client';

@Injectable()
export class VouchersService {
  private readonly logger = new Logger(VouchersService.name);
  private readonly encKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly binance: BinanceGiftCardService,
  ) {
    const keyHex = this.config.getOrThrow<string>('VOUCHER_ENCRYPTION_KEY');
    this.encKey = Buffer.from(keyHex, 'hex');
  }

  // ── Criptografar código (AES-256-GCM) ─────────────────
  private encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  // ── Descriptografar (só para reveal no admin) ──────────
  decrypt(ciphertext: string): string {
    const [ivHex, tagHex, encHex] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const enc = Buffer.from(encHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', this.encKey, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc).toString('utf8') + decipher.final('utf8');
  }

  // ── Hash para deduplicação ─────────────────────────────
  private hash(code: string): string {
    return createHash('sha256').update(code.toUpperCase()).digest('hex');
  }

  // ── Submeter voucher ───────────────────────────────────
  async submit(dto: SubmitVoucherDto) {
    const normalizedCode = dto.code.toUpperCase().replace(/[\s\-]/g, '');
    const codeHash = this.hash(normalizedCode);
    const isBinance = dto.type === 'BINANCE_GIFT_CARD';

    // 1. Buscar pedido pelo publicId
    const order = await this.prisma.order.findUnique({
      where: { publicId: dto.orderId },
    });
    if (!order) throw new NotFoundException('Order not found');

    // 2. Validar estado do pedido
    if (
      order.status !== OrderStatus.PENDING &&
      order.status !== OrderStatus.PAYMENT_SUBMITTED
    ) {
      throw new BadRequestException(
        `Order is in status ${order.status} and cannot accept a voucher`,
      );
    }

    // 3. Verificar duplicado
    const duplicate = await this.prisma.voucherSubmission.findUnique({
      where: { codeHash },
    });
    if (duplicate) {
      throw new ConflictException('This voucher code has already been submitted');
    }

    // 4. Guardar encriptado com status PENDING
    const submission = await this.prisma.voucherSubmission.create({
      data: {
        orderId: order.id,
        provider: dto.provider,
        voucherType: isBinance ? 'BINANCE_GIFT_CARD' : 'GENERIC',
        codeLast4: normalizedCode.slice(-4),
        codeHash,
        codeCiphertext: this.encrypt(normalizedCode),
        verificationStatus: VerificationStatus.PENDING,
      },
    });

    // Actualizar order para PAYMENT_SUBMITTED
    await this.prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.PAYMENT_SUBMITTED },
    });

    // 5. Tentar resgate automático na Binance (apenas para Gift Cards Binance)
    if (isBinance) {
      const externalUid = `order_${order.publicId}`;
      this.logger.log(`Attempting Binance auto-redeem for order ${order.publicId}`);

      const result = await this.binance.redeemCode(normalizedCode, externalUid);

      // Actualizar submission com resultado
      const newStatus = result.status === 'PAID'
        ? VerificationStatus.PAID
        : VerificationStatus.MANUAL_REVIEW;

      await this.prisma.voucherSubmission.update({
        where: { id: submission.id },
        data: {
          verificationStatus: newStatus,
          binanceToken: result.token,
          binanceAmount: result.amount,
          binanceReferenceNo: result.referenceNo,
          verificationNotes: result.error,
          reviewedAt: new Date(),
        },
      });

      // Se pago → confirmar pedido
      if (result.status === 'PAID') {
        await this.prisma.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.PAYMENT_CONFIRMED },
        });

        this.logger.log(
          `✅ Order ${order.publicId} PAID via Binance Gift Card: ${result.amount} ${result.token}`,
        );
      } else {
        // Fallback para manual review
        await this.prisma.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.UNDER_REVIEW },
        });
      }

      return {
        orderId: order.publicId,
        status: result.status,            // 'PAID' | 'MANUAL_REVIEW'
        binanceSuccess: result.binanceSuccess,
        token: result.token,
        amount: result.amount,
        codeLast4: submission.codeLast4,
        message: result.binanceSuccess
          ? `Payment confirmed: ${result.amount} ${result.token} received`
          : 'Gift Card submitted for manual review',
      };
    }

    // 6. Fluxo genérico (não-Binance) — sempre MANUAL_REVIEW
    await this.prisma.voucherSubmission.update({
      where: { id: submission.id },
      data: { verificationStatus: VerificationStatus.MANUAL_REVIEW },
    });

    return {
      orderId: order.publicId,
      status: 'MANUAL_REVIEW',
      binanceSuccess: false,
      codeLast4: submission.codeLast4,
      message: 'Voucher received and under manual review.',
    };
  }
}
