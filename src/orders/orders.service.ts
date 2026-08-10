import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrderDto, customerIp?: string) {
    // Caso 1: com productId → busca produto no banco e usa preço canónico
    if (dto.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId, active: true },
      });
      if (!product) throw new NotFoundException('Product not found or inactive');

      const order = await this.prisma.order.create({
        data: {
          productId:           product.id,
          packageNameSnapshot: product.name,
          referencePrice:      product.price,
          referenceCurrency:   product.currency,
          amount:              product.price,
          currency:            product.currency,
          paymentMethod:       dto.paymentMethod,
          customerEmail:       dto.customerEmail,
          customerIp,
          status:              OrderStatus.PENDING,
          expiresAt:           new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        include: { product: true },
      });
      return order;
    }

    // Caso 2: sem productId → order de referência (ex: checkout crypto com pacote externo)
    const amount = dto.referencePrice ?? 0;
    const order = await this.prisma.order.create({
      data: {
        packageNameSnapshot: dto.packageName ?? 'Package',
        referencePrice:      amount,
        referenceCurrency:   'USD',
        amount:              amount,
        currency:            'USD',
        paymentMethod:       dto.paymentMethod,
        customerEmail:       dto.customerEmail,
        customerIp,
        status:              OrderStatus.PENDING,
        expiresAt:           new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    return order;
  }


  async findByPublicId(publicId: string) {
    const order = await this.prisma.order.findUnique({
      where: { publicId },
      include: {
        product: true,
        voucherSubmission: {
          select: {
            provider: true,
            codeLast4: true,
            verificationStatus: true,
            submittedAt: true,
          },
        },
        cryptoPayment: {
          select: {
            invoiceUrl: true,
            providerStatus: true,
            network: true,
            payerCurrency: true,
            address: true,
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async expire(orderId: string) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.EXPIRED },
    });
  }
}
