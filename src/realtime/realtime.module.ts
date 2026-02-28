import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/order.module';
import { OrdersGateway } from './orders.gateway';

@Module({
  imports: [AuthModule, OrdersModule],
  providers: [OrdersGateway]
})
export class RealtimeModule {}
