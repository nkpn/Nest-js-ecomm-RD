import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentsGrpcController } from './payments.grpc.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV || 'dev'}`, '.env'],
    }),
  ],
  controllers: [PaymentsGrpcController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
