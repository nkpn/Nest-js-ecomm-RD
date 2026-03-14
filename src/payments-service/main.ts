import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { PAYMENTS_PACKAGE_NAME } from '../common/grpc.constants';
import { PaymentsModule } from './payments.module';

async function bootstrap() {
  const app = await NestFactory.create(PaymentsModule);
  const configService = app.get(ConfigService);

  const url = configService.get<string>(
    'PAYMENTS_GRPC_BIND_URL',
    '0.0.0.0:5022',
  );

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: PAYMENTS_PACKAGE_NAME,
      protoPath: join(process.cwd(), 'proto/payments.proto'),
      url,
      loader: {
        keepCase: false,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      },
    },
  });

  await app.startAllMicroservices();
  await app.init();
  Logger.log(`payments-service gRPC started on ${url}`, 'PaymentsBootstrap');
}

bootstrap();
