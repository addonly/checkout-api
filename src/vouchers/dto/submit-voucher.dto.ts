import { IsEnum, IsString, Length, Matches } from 'class-validator';
import { VoucherProvider } from '@prisma/client';

export class SubmitVoucherDto {
  @IsString()
  @Length(1, 36)
  orderId: string;   // publicId do pedido

  @IsEnum(VoucherProvider)
  provider: VoucherProvider;

  @IsString()
  @Length(8, 64)
  // Aceita formatos: XXXX-XXXX-XXXX-XXXX ou alfanumérico sem hífens
  @Matches(/^[A-Z0-9\-]{8,64}$/, {
    message: 'code must be alphanumeric with optional hyphens',
  })
  code: string;
}
