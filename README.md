# Checkout API — MemberHub

Backend do sistema de checkout. NestJS + Prisma + Supabase PostgreSQL.

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/v1/products | Listar produtos activos |
| GET | /api/v1/products/:id | Detalhe do produto |
| POST | /api/v1/orders | Criar pedido |
| GET | /api/v1/orders/:publicId | Estado do pedido |
| POST | /api/v1/vouchers/submit | Submeter voucher |
| POST | /api/v1/webhooks/cryptomus | Webhook Cryptomus |
| POST | /api/v1/auth/login | Login admin |
| GET | /api/v1/admin/orders | Listar pedidos (JWT) |
| GET | /api/v1/admin/orders/:id | Detalhe (JWT) |
| GET | /api/v1/admin/orders/:id/voucher | Revelar código (JWT) |
| PATCH | /api/v1/admin/orders/:id/approve | Aprovar (JWT) |
| PATCH | /api/v1/admin/orders/:id/reject | Rejeitar (JWT) |
| PATCH | /api/v1/admin/orders/:id/deliver | Entregar (JWT) |

## Setup

```bash
# 1. Copiar env
cp .env.example .env
# Preencher DATABASE_URL e DIRECT_URL com as connection strings do Supabase

# 2. Instalar dependências
npm install

# 3. Gerar cliente Prisma
npm run prisma:generate

# 4. Criar tabelas no Supabase
npm run prisma:push

# 5. Iniciar em desenvolvimento
npm run start:dev
```

## Supabase

1. Aceder ao projeto Supabase → **Settings → Database**
2. Copiar **Transaction pooler** connection string → `DATABASE_URL`
3. Copiar **Direct connection** → `DIRECT_URL`
4. Substituir `[YOUR-PASSWORD]` pela password da base de dados
