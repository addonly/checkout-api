import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { CryptomusModule } from '../cryptomus/cryptomus.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports:     [PrismaModule, CryptomusModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
