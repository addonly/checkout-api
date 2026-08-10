import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from '@prisma/client/runtime/library';

export interface ValidatedAmount {
  normalized: string;
  decimal: Decimal;
  currency: string;
}

@Injectable()
export class AmountValidatorService {
  private readonly minAmount: number;
  private readonly maxAmount: number;
  private readonly baseCurrency: string;

  constructor(private readonly config: ConfigService) {
    this.minAmount   = parseFloat(this.config.get('CHECKOUT_MIN_AMOUNT_USD', '5.00'));
    this.maxAmount   = parseFloat(this.config.get('CHECKOUT_MAX_AMOUNT_USD', '5000.00'));
    this.baseCurrency = this.config.get('CHECKOUT_BASE_CURRENCY', 'USD');
  }

  validate(raw: string): ValidatedAmount {
    if (!raw || typeof raw !== 'string') {
      throw new BadRequestException('Amount is required');
    }

    // Rejeitar notação científica
    if (/[eE]/.test(raw)) {
      throw new BadRequestException('Scientific notation is not allowed');
    }

    // Rejeitar caracteres não numéricos (exceto ponto)
    if (!/^\d+(\.\d{1,2})?$/.test(raw.trim())) {
      throw new BadRequestException('Enter a valid amount (e.g. 25.00)');
    }

    const value = parseFloat(raw);

    if (!isFinite(value) || isNaN(value)) {
      throw new BadRequestException('Invalid amount');
    }

    if (value <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    if (value < this.minAmount) {
      throw new BadRequestException(
        `Minimum payment is $${this.minAmount.toFixed(2)}`,
      );
    }

    if (value > this.maxAmount) {
      throw new BadRequestException(
        `Maximum payment is $${this.maxAmount.toFixed(2)}`,
      );
    }

    // Normalizar para exatamente 2 casas decimais
    const normalized = value.toFixed(2);

    return {
      normalized,
      decimal:  new Decimal(normalized),
      currency: this.baseCurrency,
    };
  }
}
