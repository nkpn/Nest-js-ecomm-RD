import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/order.module';
import { OrdersWorkerService } from './orders-worker.service';

@Module({
  imports: [OrdersModule],
  providers: [OrdersWorkerService],
})
export class OrdersWorkerModule {}
