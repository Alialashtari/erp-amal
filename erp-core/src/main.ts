import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { parseCorsOrigins } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const isProduction = process.env.NODE_ENV === 'production';

  // Security headers (Constitution Art. 6.1)
  app.use(helmet());
  // Behind the VPS reverse proxy / TLS terminator: trust X-Forwarded-* so
  // rate limiting and audit see real client IPs (Art. 6.3/6.4).
  app.set('trust proxy', 1);
  // Explicit CORS: production requires an allowlist (env validation enforces it).
  app.enableCors({ origin: parseCorsOrigins(process.env.CORS_ORIGINS), credentials: true });
  // Request correlation id on every request/response
  app.use(requestIdMiddleware);
  // Graceful shutdown: drain HTTP, close queues/DB (SIGTERM from Docker).
  app.enableShutdownHooks();

  // /api/v1/... (Build Spec Part 6: versioning required)
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Validate every input at the API layer (Constitution Art. 3.3)
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // Consistent error envelope (Build Spec Part 6 §22)
  app.useGlobalFilters(new ApiExceptionFilter());

  // OpenAPI (mandatory, auto-generated). In production the interactive UI is
  // disabled unless SWAGGER_ENABLED=true (docs remain in the repo/CI artifact).
  if (!isProduction || process.env.SWAGGER_ENABLED === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Amal Foundation Platform - Core ERP API')
      .setDescription(
        'Central management, governance, workflow and integration platform (Hub Model).',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
