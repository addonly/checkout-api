import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { VouchersService } from './vouchers.service';
import { SubmitVoucherDto } from './dto/submit-voucher.dto';

@Controller('vouchers')
@UseGuards(ThrottlerGuard)
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Post('submit')
  submit(@Body() dto: SubmitVoucherDto) {
    return this.vouchersService.submit(dto);
  }
}
