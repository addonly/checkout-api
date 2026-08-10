import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, IsNumber, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateOrderDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsString()
  packageName?: string;         // snapshot do nome do pacote

  @IsOptional()
  @IsNumber()
  @Min(0)
  referencePrice?: number;      // preço de referência (informativo)

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;
}
