import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VouchersService } from '../vouchers/vouchers.service';
import { OrderStatus, VerificationStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vouchersService: VouchersService,
  ) {}

  // ── Listar pedidos (com filtros) ──────────────────────
  listOrders(status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: status ? { status } : {},
      include: {
        product: { select: { name: true, price: true } },
        voucherSubmission: {
          select: { provider: true, codeLast4: true, verificationStatus: true },
        },
        cryptoPayment: {
          select: {
            address: true, network: true, payerCurrency: true,
            payerAmount: true, providerStatus: true, invoiceUrl: true,
            cryptomusUuid: true, isFinal: true, confirmedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ── Detalhe do pedido ─────────────────────────────────
  async getOrder(publicId: string) {
    const order = await this.prisma.order.findUnique({
      where: { publicId },
      include: {
        product: true,
        voucherSubmission: true,
        cryptoPayment: true,
        auditLogs: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  // ── Revelar código do voucher (acção sensível) ────────
  async revealVoucher(publicId: string, adminId: string, ip?: string) {
    const order = await this.getOrder(publicId);
    if (!order.voucherSubmission) throw new NotFoundException('No voucher for this order');

    const plainCode = this.vouchersService.decrypt(
      order.voucherSubmission.codeCiphertext,
    );

    // AuditLog obrigatório
    await this.audit(adminId, order.id, 'ADMIN_REVEALED_VOUCHER', 'VoucherSubmission',
      order.voucherSubmission.id, ip);

    return { code: plainCode };
  }

  // ── Aprovar pedido ────────────────────────────────────
  async approveOrder(publicId: string, adminId: string, ip?: string) {
    const order = await this.getOrder(publicId);
    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.APPROVED, approvedAt: new Date() },
    });
    if (order.voucherSubmission) {
      await this.prisma.voucherSubmission.update({
        where: { orderId: order.id },
        data: { verificationStatus: VerificationStatus.VERIFIED, reviewedAt: new Date(), reviewedBy: adminId },
      });
    }
    await this.audit(adminId, order.id, 'ADMIN_APPROVED_ORDER', 'Order', order.id, ip);
    return updated;
  }

  // ── Rejeitar pedido ───────────────────────────────────
  async rejectOrder(publicId: string, adminId: string, notes?: string, ip?: string) {
    const order = await this.getOrder(publicId);
    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.REJECTED },
    });
    if (order.voucherSubmission) {
      await this.prisma.voucherSubmission.update({
        where: { orderId: order.id },
        data: {
          verificationStatus: VerificationStatus.REJECTED,
          reviewedAt: new Date(),
          reviewedBy: adminId,
          verificationNotes: notes,
        },
      });
    }
    await this.audit(adminId, order.id, 'ADMIN_REJECTED_ORDER', 'Order', order.id, ip);
    return updated;
  }

  // ── Marcar como entregue ──────────────────────────────
  async deliverOrder(publicId: string, adminId: string, ip?: string) {
    const order = await this.getOrder(publicId);
    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.DELIVERED, deliveredAt: new Date() },
    });
    await this.audit(adminId, order.id, 'ADMIN_DELIVERED_ORDER', 'Order', order.id, ip);
    return updated;
  }

  // ── Criar registo de AuditLog ─────────────────────────
  private audit(adminId: string, orderId: string, action: string,
    entityType: string, entityId: string, ip?: string) {
    return this.prisma.auditLog.create({
      data: { adminId, orderId, action, entityType, entityId, ip },
    });
  }
}
