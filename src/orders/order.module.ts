import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './order.controller';
import { Order } from './entity/order.entity';
import { OrderItem } from './entity/order-item.entity';
import { OrdersService } from './order.service';
import { User } from '../users/entity/user.entity';
import { OrdersEventsService } from './orders-events.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, User])],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersEventsService],
  exports: [OrdersService, OrdersEventsService, TypeOrmModule],
})
export class OrdersModule {}
