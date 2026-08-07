import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import compress from '@fastify/compress';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  await app.register(cookie);
  await app.register(compress, {
    threshold: 1024,
    encodings: ['gzip', 'deflate'],
  });

  await app.register(helmet, {
    global: true,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'https:', 'data:'],
        connectSrc: [
          "'self'",
          process.env.CORS_DEV || '',
          process.env.CORS_ORIGIN || '',
          process.env.CORS_UBUNTU || '',
        ],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(multipart, {
    attachFieldsToBody: false,
    limits: {
      fileSize: 6 * 1024 * 1024,
    },
  });

  app.enableCors({
    origin: [
      process.env.CORS_ORIGIN || '',
      process.env.CORS_DEV || '',
      process.env.CORS_UBUNTU || '',
    ].filter(Boolean),
    credentials: true,
    methods: ['POST', 'PUT', 'GET', 'PATCH', 'DELETE'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
