import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthorizeOrderPaymentDto } from './dto/authorize-order-payment.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Order } from './entity/order.entity';
import { OrdersService } from './order.service';
import {
  AuthorizePaymentResponse,
  GetPaymentStatusResponse,
  PaymentsGrpcClient,
} from './payments-grpc.client';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paymentsGrpcClient: PaymentsGrpcClient,
  ) {}

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

  @Post(':id/payments/authorize')
  async authorizePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AuthorizeOrderPaymentDto,
  ): Promise<AuthorizePaymentResponse> {
    const order = await this.ordersService.getOrder(id);
    const amount = order.items.reduce((sum, item) => {
      const price = Number(item.priceSnapshot);
      const quantity = Number(item.quantity);
      return sum + price * quantity;
    }, 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        'Order total amount must be a positive number',
      );
    }

    return this.paymentsGrpcClient.authorize({
      orderId: order.id,
      amount: amount.toFixed(2),
      currency: body.currency,
      idempotencyKey: body.idempotencyKey,
      simulateUnavailableOnce: body.simulateUnavailableOnce,
    });
  }

  @Get('payments/:paymentId/status')
  getPaymentStatus(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ): Promise<GetPaymentStatusResponse> {
    return this.paymentsGrpcClient.getPaymentStatus(paymentId);
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
