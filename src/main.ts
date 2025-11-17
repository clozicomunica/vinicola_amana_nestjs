/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  app.setGlobalPrefix('api');

  // Adicionado: Rate-limit global (similar ao Express)
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 60,
      message: 'Muitas requisições, tente novamente em instantes.',
    }),
  );

  // Configuração de 'trust proxy' usando o adapter do Express
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Opcional: Helmet para headers de segurança
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3001;
  await app.listen(port);

  console.log(`✅ Vinícola API is online at http://localhost:${port}/api`);
}

bootstrap().catch((error) => {
  console.error('❌ Erro ao iniciar o servidor:', error);
  process.exit(1);
});
