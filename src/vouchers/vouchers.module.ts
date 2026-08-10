import { Module } from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { VouchersController } from './vouchers.controller';
import { BinanceGiftCardService } from './binance-giftcard.service';

@Module({
  controllers: [VouchersController],
  providers: [VouchersService, BinanceGiftCardService],
  exports: [VouchersService],
})
export class VouchersModule {}

