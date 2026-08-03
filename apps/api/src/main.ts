import 'reflect-metadata'
import { Logger, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { json } from 'express'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { corsOrigins } from './config/environment'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    // Public canvas signatures are bounded to 512 KiB of PNG bytes plus
    // base64/JSON overhead. Keep the parser limit explicit rather than using
    // an unbounded body parser.
    bodyParser: false,
  })
  const config = app.get(ConfigService)

  app.use(json({ limit: '1mb' }))

  app.use(helmet())
  app.enableCors({
    origin: corsOrigins(
      config.getOrThrow<string>('ERP_API_CORS_ORIGINS')
    ),
    credentials: true,
  })
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  )
  app.enableShutdownHooks()

  const port = config.getOrThrow<number>('PORT')
  await app.listen(port, '0.0.0.0')
  Logger.log(`Third Code ERP API listening on ${port}`, 'Bootstrap')
}

void bootstrap()
