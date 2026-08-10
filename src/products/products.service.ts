import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.product.findMany({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  findOne(id: string) {
    return this.prisma.product.findUnique({ where: { id, active: true } });
  }

  findBySlug(slug: string) {
    return this.prisma.product.findUnique({ where: { slug, active: true } });
  }
}
