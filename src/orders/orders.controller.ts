import { Body, Controller, Get, Ip, Param, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller('orders')
@UseGuards(ThrottlerGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto, @Ip() ip: string) {
    return this.ordersService.create(dto, ip);
  }

  @Get(':publicId')
  findOne(@Param('publicId') publicId: string) {
    return this.ordersService.findByPublicId(publicId);
  }
}
