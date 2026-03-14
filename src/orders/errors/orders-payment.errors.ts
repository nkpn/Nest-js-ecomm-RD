import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

type DomainErrorPayload = {
  code: string;
  message: string;
  retryable: boolean;
};

export class OrdersPaymentValidationError extends BadRequestException {
  constructor(message: string) {
    const payload: DomainErrorPayload = {
      code: 'ORDERS_PAYMENT_VALIDATION_FAILED',
      message,
      retryable: false,
    };
    super(payload);
  }
}

export class OrdersPaymentNotFoundError extends NotFoundException {
  constructor(message: string) {
    const payload: DomainErrorPayload = {
      code: 'ORDERS_PAYMENT_NOT_FOUND',
      message,
      retryable: false,
    };
    super(payload);
  }
}

export class OrdersPaymentConflictError extends ConflictException {
  constructor(message: string) {
    const payload: DomainErrorPayload = {
      code: 'ORDERS_PAYMENT_CONFLICT',
      message,
      retryable: false,
    };
    super(payload);
  }
}

export class OrdersPaymentTimeoutError extends GatewayTimeoutException {
  constructor(message: string) {
    const payload: DomainErrorPayload = {
      code: 'ORDERS_PAYMENT_TIMEOUT',
      message,
      retryable: true,
    };
    super(payload);
  }
}

export class OrdersPaymentUnavailableError extends ServiceUnavailableException {
  constructor(message: string) {
    const payload: DomainErrorPayload = {
      code: 'ORDERS_PAYMENT_UNAVAILABLE',
      message,
      retryable: true,
    };
    super(payload);
  }
}

export class OrdersPaymentIntegrationError extends BadGatewayException {
  constructor(message: string) {
    const payload: DomainErrorPayload = {
      code: 'ORDERS_PAYMENT_INTEGRATION_ERROR',
      message,
      retryable: false,
    };
    super(payload);
  }
}
