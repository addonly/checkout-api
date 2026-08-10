import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// O WebhooksService legado é substituído pelo WebhooksController
// que agora faz tudo directamente com validação de assinatura.
// Este ficheiro fica como stub para não quebrar o módulo.
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  constructor(private readonly prisma: PrismaService) {}
}
