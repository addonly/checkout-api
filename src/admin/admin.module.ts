import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { VouchersModule } from '../vouchers/vouchers.module';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';

@Module({
  imports: [VouchersModule],
  controllers: [AdminController],
  providers: [AdminService, SupabaseAuthGuard],
})
export class AdminModule {}
