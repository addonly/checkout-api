import { IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { VoucherProvider } from '@prisma/client';

export class SubmitVoucherDto {
  @IsString()
  @Length(1, 36)
  orderId: string;   // publicId do pedido

  @IsEnum(VoucherProvider)
  provider: VoucherProvider;

  @IsString()
  @Length(8, 64)
  // Aceita: XXXXXXXXXXXXXXXX (Binance 16 chars) ou XXXX-XXXX-XXXX-XXXX
  @Matches(/^[A-Z0-9\-]{8,64}$/, {
    message: 'code must be alphanumeric with optional hyphens',
  })
  code: string;

  @IsOptional()
  @IsString()
  type?: 'BINANCE_GIFT_CARD' | 'GENERIC';  // tipo de voucher — define se tenta redeem Binance
}
