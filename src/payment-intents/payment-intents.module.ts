import { Module } from '@nestjs/common';
import { PaymentIntentsController } from './payment-intents.controller';
import { PaymentIntentsService } from './payment-intents.service';
import { AmountValidatorService } from './amount-validator.service';
import { CryptomusModule } from '../cryptomus/cryptomus.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports:     [PrismaModule, CryptomusModule],
  controllers: [PaymentIntentsController],
  providers:   [PaymentIntentsService, AmountValidatorService],
  exports:     [PaymentIntentsService],
})
export class PaymentIntentsModule {}
