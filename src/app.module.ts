import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OrdersModule } from './orders/order.module';
import { UserModule } from './users/user.module';

@Module({
  imports: [
    OrdersModule,
    UserModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV || 'dev'}`, '.env'],
    }),
  ],
})
export class AppModule {}
