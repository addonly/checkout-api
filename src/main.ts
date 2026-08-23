import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // ── Global prefix ──────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── Cookie parser ──────────────────────────────
  app.use(cookieParser());

  // ── Validation ─────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ── CORS ───────────────────────────────────────
  const origins = config.get<string>('CORS_ORIGINS', 'http://localhost:5173');
  app.enableCors({
    origin: origins.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = config.get<number>('PORT', 3001);
  await app.listen(port);
  console.log(`🚀 Checkout API running on http://localhost:${port}/api/v1`);
}

bootstrap();

