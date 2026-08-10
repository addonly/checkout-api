import { IsString, Matches } from 'class-validator';

export class CreateCryptoIntentDto {
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'Amount must be a positive decimal number (e.g. 25.00)',
  })
  amount!: string;

  @IsString()
  cryptoCurrency!: string;

  @IsString()
  network!: string;
}
