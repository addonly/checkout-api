import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');

    // 1. Validar token via Supabase (mesma auth do MemberHub)
    const supabase = createClient(
      this.config.getOrThrow('SUPABASE_URL'),
      this.config.getOrThrow('SUPABASE_ANON_KEY'),
    );

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    // 2. Verificar que o utilizador existe na tabela admins do MemberHub
    const adminsRows = await this.prisma.$queryRaw<{ id: string; role?: string }[]>`
      SELECT id, role FROM admins WHERE user_id = ${user.id}::uuid LIMIT 1
    `;

    if (!adminsRows || adminsRows.length === 0) {
      throw new UnauthorizedException('User is not an admin');
    }

    // 3. Upsert em admin_users para que FKs de audit_logs funcionem
    const adminUser = await this.prisma.adminUser.upsert({
      where: { email: user.email! },
      create: {
        email:        user.email!,
        passwordHash: 'supabase-managed',
        role:         'SUPER_ADMIN',
        active:       true,
      },
      update: {
        lastLoginAt: new Date(),
        active:      true,
      },
    });

    // 4. Injetar no request para uso nos controllers
    request.user = {
      id:         adminUser.id,   // admin_users.id → FK válida para audit_logs
      supabaseId: user.id,        // auth.users.id
      email:      user.email,
      role:       adminUser.role,
    };

    return true;
  }
}
