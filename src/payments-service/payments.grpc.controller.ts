import { Controller, Logger } from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { PAYMENTS_SERVICE_NAME } from '../common/grpc.constants';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsGrpcController {
  private readonly logger = new Logger(PaymentsGrpcController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @GrpcMethod(PAYMENTS_SERVICE_NAME, 'Authorize')
  authorize(payload: {
    orderId: string;
    amount: string;
    currency: string;
    idempotencyKey?: string;
    simulateUnavailableOnce?: boolean;
  }) {
    if (!payload.orderId) {
      throw new RpcException({
        code: GrpcStatus.INVALID_ARGUMENT,
        message: 'order_id is required',
      });
    }

    const amountValue = Number(payload.amount ?? '');
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      throw new RpcException({
        code: GrpcStatus.INVALID_ARGUMENT,
        message: 'amount must be > 0',
      });
    }

    if (!/^[A-Z]{3}$/.test(payload.currency ?? '')) {
      throw new RpcException({
        code: GrpcStatus.INVALID_ARGUMENT,
        message: 'currency must be 3 uppercase letters',
      });
    }

    if (
      this.paymentsService.shouldFailTransient(
        payload.orderId,
        payload.simulateUnavailableOnce,
      )
    ) {
      throw new RpcException({
        code: GrpcStatus.UNAVAILABLE,
        message: 'transient provider outage',
      });
    }

    const result = this.paymentsService.authorize({
      orderId: payload.orderId,
      amount: payload.amount,
      currency: payload.currency,
      idempotencyKey: payload.idempotencyKey,
    });

    this.logger.log(
      `authorize ok orderId=${payload.orderId} paymentId=${result.paymentId}`,
    );

    return result;
  }

  @GrpcMethod(PAYMENTS_SERVICE_NAME, 'GetPaymentStatus')
  getPaymentStatus(payload: { paymentId: string }) {
    const payment = this.paymentsService.getStatus(payload.paymentId);
    if (!payment) {
      throw new RpcException({
        code: GrpcStatus.NOT_FOUND,
        message: 'payment not found',
      });
    }

    return payment;
  }

  @GrpcMethod(PAYMENTS_SERVICE_NAME, 'Capture')
  capture(payload: { paymentId: string; idempotencyKey?: string }) {
    if (!payload.paymentId) {
      throw new RpcException({
        code: GrpcStatus.INVALID_ARGUMENT,
        message: 'payment_id is required',
      });
    }

    const outcome = this.paymentsService.capture({
      paymentId: payload.paymentId,
      idempotencyKey: payload.idempotencyKey,
    });

    if (outcome.kind === 'error') {
      throw new RpcException({
        code:
          outcome.code === 'NOT_FOUND'
            ? GrpcStatus.NOT_FOUND
            : GrpcStatus.FAILED_PRECONDITION,
        message: outcome.message,
      });
    }

    this.logger.log(`capture ok paymentId=${payload.paymentId}`);
    return outcome.response;
  }

  @GrpcMethod(PAYMENTS_SERVICE_NAME, 'Refund')
  refund(payload: { paymentId: string; idempotencyKey?: string }) {
    if (!payload.paymentId) {
      throw new RpcException({
        code: GrpcStatus.INVALID_ARGUMENT,
        message: 'payment_id is required',
      });
    }

    const outcome = this.paymentsService.refund({
      paymentId: payload.paymentId,
      idempotencyKey: payload.idempotencyKey,
    });

    if (outcome.kind === 'error') {
      throw new RpcException({
        code:
          outcome.code === 'NOT_FOUND'
            ? GrpcStatus.NOT_FOUND
            : GrpcStatus.FAILED_PRECONDITION,
        message: outcome.message,
      });
    }

    this.logger.log(`refund ok paymentId=${payload.paymentId}`);
    return outcome.response;
  }
}
