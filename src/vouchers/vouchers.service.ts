import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitVoucherDto } from './dto/submit-voucher.dto';
import { OrderStatus, VerificationStatus } from '@prisma/client';

@Injectable()
export class VouchersService {
  private readonly encKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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
    // formato: iv(hex):tag(hex):ciphertext(hex)
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
    const normalizedCode = dto.code.toUpperCase().replace(/\s/g, '');
    const codeHash = this.hash(normalizedCode);

    // 1. Buscar pedido pelo publicId
    const order = await this.prisma.order.findUnique({
      where: { publicId: dto.orderId },
    });
    if (!order) throw new NotFoundException('Order not found');

    // 2. Validar estado do pedido
    if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.PAYMENT_SUBMITTED) {
      throw new BadRequestException(`Order is in status ${order.status} and cannot accept a voucher`);
    }

    // 3. Verificar duplicado (mesmo código já submetido noutro pedido)
    const duplicate = await this.prisma.voucherSubmission.findUnique({
      where: { codeHash },
    });
    if (duplicate) {
      throw new ConflictException('This voucher code has already been submitted');
    }

    // 4. Guardar encriptado
    const [submission] = await this.prisma.$transaction([
      this.prisma.voucherSubmission.create({
        data: {
          orderId: order.id,
          provider: dto.provider,
          codeLast4: normalizedCode.slice(-4),
          codeHash,
          codeCiphertext: this.encrypt(normalizedCode),
          verificationStatus: VerificationStatus.MANUAL_REVIEW,
        },
      }),
      this.prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.PAYMENT_SUBMITTED },
      }),
    ]);

    return {
      orderId: order.publicId,
      status: submission.verificationStatus,
      codeLast4: submission.codeLast4,
      message: 'Voucher received and under manual review.',
    };
  }
}
