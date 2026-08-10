import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { VouchersModule } from './vouchers/vouchers.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CryptomusModule } from './cryptomus/cryptomus.module';
import { PaymentIntentsModule } from './payment-intents/payment-intents.module';

@Module({
  imports: [
    // ── Config (variáveis de ambiente) ────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // ── Rate limiting global ──────────────────────
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,  // 60 segundos
        limit: 30,    // 30 requests por janela
      },
    ]),

    // ── Módulos da aplicação ──────────────────────
    PrismaModule,
    ProductsModule,
    OrdersModule,
    VouchersModule,
    WebhooksModule,
    AdminModule,
    AuthModule,
    CryptomusModule,
    PaymentIntentsModule,
  ],
})
export class AppModule {}
