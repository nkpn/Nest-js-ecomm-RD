import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export type PaymentStatus =
  | 'PAYMENT_STATUS_UNSPECIFIED'
  | 'PAYMENT_STATUS_AUTHORIZED'
  | 'PAYMENT_STATUS_CAPTURED'
  | 'PAYMENT_STATUS_REFUNDED'
  | 'PAYMENT_STATUS_FAILED';

type PaymentRecord = {
  paymentId: string;
  orderId: string;
  status: PaymentStatus;
  amount: string;
  currency: string;
};

export type AuthorizePaymentInput = {
  orderId: string;
  amount: string;
  currency: string;
  idempotencyKey?: string;
};

export type AuthorizePaymentResult = {
  paymentId: string;
  status: PaymentStatus;
};

export type GetPaymentStatusResult = {
  paymentId: string;
  status: PaymentStatus;
};

export type PaymentOperationResult = {
  ok: boolean;
  message: string;
};

type OperationErrorCode = 'NOT_FOUND' | 'FAILED_PRECONDITION';

type OperationOutcome =
  | { kind: 'ok'; response: PaymentOperationResult }
  | { kind: 'error'; code: OperationErrorCode; message: string };

@Injectable()
export class PaymentsService {
  private readonly paymentsById = new Map<string, PaymentRecord>();
  private readonly authorizeIdempotencyResults = new Map<
    string,
    AuthorizePaymentResult
  >();
  private readonly captureIdempotencyResults = new Map<
    string,
    OperationOutcome
  >();
  private readonly refundIdempotencyResults = new Map<
    string,
    OperationOutcome
  >();
  private readonly transientFailOnceGate = new Set<string>();

  authorize(input: AuthorizePaymentInput): AuthorizePaymentResult {
    if (
      input.idempotencyKey &&
      this.authorizeIdempotencyResults.has(input.idempotencyKey)
    ) {
      return this.authorizeIdempotencyResults.get(input.idempotencyKey)!;
    }

    const paymentId = randomUUID();
    const result: AuthorizePaymentResult = {
      paymentId,
      status: 'PAYMENT_STATUS_AUTHORIZED',
    };

    this.paymentsById.set(paymentId, {
      paymentId,
      orderId: input.orderId,
      status: result.status,
      amount: input.amount,
      currency: input.currency,
    });

    if (input.idempotencyKey) {
      this.authorizeIdempotencyResults.set(input.idempotencyKey, result);
    }

    return result;
  }

  capture(input: {
    paymentId: string;
    idempotencyKey?: string;
  }): OperationOutcome {
    if (
      input.idempotencyKey &&
      this.captureIdempotencyResults.has(input.idempotencyKey)
    ) {
      return this.captureIdempotencyResults.get(input.idempotencyKey)!;
    }

    const payment = this.paymentsById.get(input.paymentId);
    if (!payment) {
      return this.persistOperationOutcome(
        this.captureIdempotencyResults,
        input.idempotencyKey,
        {
          kind: 'error',
          code: 'NOT_FOUND',
          message: 'payment not found',
        },
      );
    }

    if (payment.status === 'PAYMENT_STATUS_REFUNDED') {
      return this.persistOperationOutcome(
        this.captureIdempotencyResults,
        input.idempotencyKey,
        {
          kind: 'error',
          code: 'FAILED_PRECONDITION',
          message: 'cannot capture refunded payment',
        },
      );
    }

    if (payment.status === 'PAYMENT_STATUS_CAPTURED') {
      return this.persistOperationOutcome(
        this.captureIdempotencyResults,
        input.idempotencyKey,
        {
          kind: 'ok',
          response: {
            ok: true,
            message: 'payment already captured',
          },
        },
      );
    }

    if (payment.status !== 'PAYMENT_STATUS_AUTHORIZED') {
      return this.persistOperationOutcome(
        this.captureIdempotencyResults,
        input.idempotencyKey,
        {
          kind: 'error',
          code: 'FAILED_PRECONDITION',
          message: 'payment must be authorized before capture',
        },
      );
    }

    payment.status = 'PAYMENT_STATUS_CAPTURED';
    return this.persistOperationOutcome(
      this.captureIdempotencyResults,
      input.idempotencyKey,
      {
        kind: 'ok',
        response: {
          ok: true,
          message: 'payment captured',
        },
      },
    );
  }

  refund(input: {
    paymentId: string;
    idempotencyKey?: string;
  }): OperationOutcome {
    if (
      input.idempotencyKey &&
      this.refundIdempotencyResults.has(input.idempotencyKey)
    ) {
      return this.refundIdempotencyResults.get(input.idempotencyKey)!;
    }

    const payment = this.paymentsById.get(input.paymentId);
    if (!payment) {
      return this.persistOperationOutcome(
        this.refundIdempotencyResults,
        input.idempotencyKey,
        {
          kind: 'error',
          code: 'NOT_FOUND',
          message: 'payment not found',
        },
      );
    }

    if (payment.status === 'PAYMENT_STATUS_REFUNDED') {
      return this.persistOperationOutcome(
        this.refundIdempotencyResults,
        input.idempotencyKey,
        {
          kind: 'ok',
          response: {
            ok: true,
            message: 'payment already refunded',
          },
        },
      );
    }

    if (
      payment.status !== 'PAYMENT_STATUS_AUTHORIZED' &&
      payment.status !== 'PAYMENT_STATUS_CAPTURED'
    ) {
      return this.persistOperationOutcome(
        this.refundIdempotencyResults,
        input.idempotencyKey,
        {
          kind: 'error',
          code: 'FAILED_PRECONDITION',
          message: 'payment must be authorized or captured before refund',
        },
      );
    }

    payment.status = 'PAYMENT_STATUS_REFUNDED';
    return this.persistOperationOutcome(
      this.refundIdempotencyResults,
      input.idempotencyKey,
      {
        kind: 'ok',
        response: {
          ok: true,
          message: 'payment refunded',
        },
      },
    );
  }

  getStatus(paymentId: string): GetPaymentStatusResult | null {
    const payment = this.paymentsById.get(paymentId);
    if (!payment) {
      return null;
    }

    return {
      paymentId: payment.paymentId,
      status: payment.status,
    };
  }

  shouldFailTransient(
    orderId: string,
    simulateUnavailableOnce?: boolean,
  ): boolean {
    if (!simulateUnavailableOnce) {
      return false;
    }

    if (this.transientFailOnceGate.has(orderId)) {
      return false;
    }

    this.transientFailOnceGate.add(orderId);
    return true;
  }

  private persistOperationOutcome(
    storage: Map<string, OperationOutcome>,
    idempotencyKey: string | undefined,
    outcome: OperationOutcome,
  ): OperationOutcome {
    if (idempotencyKey) {
      storage.set(idempotencyKey, outcome);
    }

    return outcome;
  }
}
