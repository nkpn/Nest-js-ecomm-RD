import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Order } from './entity/order.entity';
import { OrdersService } from './order.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  getAll(): Promise<Order[]> {
    return this.ordersService.getAll();
  }

  @Get(':id')
  getOrder(@Param('id') id: string): Promise<Order> {
    return this.ordersService.getOrder(id);
  }

  @Post()
  create(
    @Body() body: CreateOrderDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ): Promise<Order> {
    return this.ordersService.create(body, idempotencyKey).then((result) => {
      res.status(result.wasDuplicate ? HttpStatus.OK : HttpStatus.CREATED);
      return result.order;
    });
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateOrderDto,
  ): Promise<Order> {
    return this.ordersService.updateOrder(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string): Promise<void> {
    return this.ordersService.deleteOrder(id);
  }
}
