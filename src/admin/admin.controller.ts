import { Controller, Get, Ip, Param, Patch, Query, Req, UseGuards, Body } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { AdminService } from './admin.service';
import { OrderStatus } from '@prisma/client';

@Controller('admin')
@UseGuards(SupabaseAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('orders')
  listOrders(@Query('status') status?: OrderStatus) {
    return this.adminService.listOrders(status);
  }

  @Get('orders/:publicId')
  getOrder(@Param('publicId') publicId: string) {
    return this.adminService.getOrder(publicId);
  }

  @Patch('orders/:publicId/approve')
  approve(@Param('publicId') publicId: string, @Req() req: any, @Ip() ip: string) {
    return this.adminService.approveOrder(publicId, req.user.id, ip);
  }

  @Patch('orders/:publicId/reject')
  reject(
    @Param('publicId') publicId: string,
    @Req() req: any,
    @Ip() ip: string,
    @Body('notes') notes?: string,
  ) {
    return this.adminService.rejectOrder(publicId, req.user.id, notes, ip);
  }

  @Patch('orders/:publicId/deliver')
  deliver(@Param('publicId') publicId: string, @Req() req: any, @Ip() ip: string) {
    return this.adminService.deliverOrder(publicId, req.user.id, ip);
  }

  @Get('orders/:publicId/voucher')
  revealVoucher(@Param('publicId') publicId: string, @Req() req: any, @Ip() ip: string) {
    return this.adminService.revealVoucher(publicId, req.user.id, ip);
  }
}
