/**
 * Script para criar o primeiro admin user
 * Uso: node scripts/create-admin.js
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const email    = process.argv[2] || 'admin@memberhub.com';
  const password = process.argv[3] || 'Admin@123456';
  const role     = process.argv[4] || 'SUPER_ADMIN';

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash, role, active: true },
    create: {
      email,
      passwordHash,
      role,
      active: true,
    },
  });

  console.log(`\n✅ Admin criado com sucesso!`);
  console.log(`   Email : ${admin.email}`);
  console.log(`   Role  : ${admin.role}`);
  console.log(`   ID    : ${admin.id}`);
  console.log(`\n🔐 Password: ${password}`);
  console.log(`   (Guarda num lugar seguro e altera depois de entrar)\n`);
}

main()
  .catch(e => { console.error('❌ Erro:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
