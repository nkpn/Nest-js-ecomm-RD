import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'node:path';
import {
  PAYMENTS_GRPC_CLIENT,
  PAYMENTS_PACKAGE_NAME,
} from '../common/grpc.constants';
import { OrdersController } from './order.controller';
import { Order } from './entity/order.entity';
import { OrderItem } from './entity/order-item.entity';
import { OrdersService } from './order.service';
import { User } from '../users/entity/user.entity';
import { OrdersEventsService } from './orders-events.service';
import { ProcessedMessage } from '../idempotency/processed-message.entity';
import { PaymentsGrpcClient } from './payments-grpc.client';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: PAYMENTS_GRPC_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: PAYMENTS_PACKAGE_NAME,
            protoPath: join(process.cwd(), 'proto/payments.proto'),
            url: configService.get<string>(
              'PAYMENTS_GRPC_URL',
              'localhost:5022',
            ),
            loader: {
              keepCase: false,
              longs: String,
              enums: String,
              defaults: true,
              oneofs: true,
            },
          },
        }),
      },
    ]),
    TypeOrmModule.forFeature([Order, OrderItem, User, ProcessedMessage]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersEventsService, PaymentsGrpcClient],
  exports: [OrdersService, OrdersEventsService, TypeOrmModule],
})
export class OrdersModule {}
