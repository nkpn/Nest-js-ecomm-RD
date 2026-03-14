import { PaymentsService } from '../src/payments-service/payments.service';

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(() => {
    service = new PaymentsService();
  });

  it('authorize is idempotent by idempotency key', () => {
    const first = service.authorize({
      orderId: 'order-1',
      amount: '120.00',
      currency: 'USD',
      idempotencyKey: 'idem-auth-1',
    });
    const second = service.authorize({
      orderId: 'order-1',
      amount: '120.00',
      currency: 'USD',
      idempotencyKey: 'idem-auth-1',
    });

    expect(second.paymentId).toBe(first.paymentId);
    expect(second.status).toBe('PAYMENT_STATUS_AUTHORIZED');
  });

  it('capture is idempotent and updates payment status', () => {
    const auth = service.authorize({
      orderId: 'order-2',
      amount: '15.00',
      currency: 'USD',
      idempotencyKey: 'idem-auth-2',
    });

    const firstCapture = service.capture({
      paymentId: auth.paymentId,
      idempotencyKey: 'idem-capture-1',
    });
    const secondCapture = service.capture({
      paymentId: auth.paymentId,
      idempotencyKey: 'idem-capture-1',
    });
    const status = service.getStatus(auth.paymentId);

    expect(firstCapture).toEqual({
      kind: 'ok',
      response: { ok: true, message: 'payment captured' },
    });
    expect(secondCapture).toEqual(firstCapture);
    expect(status).toEqual({
      paymentId: auth.paymentId,
      status: 'PAYMENT_STATUS_CAPTURED',
    });
  });

  it('refund is idempotent and updates payment status', () => {
    const auth = service.authorize({
      orderId: 'order-3',
      amount: '99.90',
      currency: 'USD',
      idempotencyKey: 'idem-auth-3',
    });

    const firstRefund = service.refund({
      paymentId: auth.paymentId,
      idempotencyKey: 'idem-refund-1',
    });
    const secondRefund = service.refund({
      paymentId: auth.paymentId,
      idempotencyKey: 'idem-refund-1',
    });
    const status = service.getStatus(auth.paymentId);

    expect(firstRefund).toEqual({
      kind: 'ok',
      response: { ok: true, message: 'payment refunded' },
    });
    expect(secondRefund).toEqual(firstRefund);
    expect(status).toEqual({
      paymentId: auth.paymentId,
      status: 'PAYMENT_STATUS_REFUNDED',
    });
  });

  it('capture returns FAILED_PRECONDITION for refunded payment', () => {
    const auth = service.authorize({
      orderId: 'order-4',
      amount: '50.00',
      currency: 'USD',
      idempotencyKey: 'idem-auth-4',
    });
    service.refund({ paymentId: auth.paymentId });

    const outcome = service.capture({
      paymentId: auth.paymentId,
      idempotencyKey: 'idem-capture-2',
    });

    expect(outcome).toEqual({
      kind: 'error',
      code: 'FAILED_PRECONDITION',
      message: 'cannot capture refunded payment',
    });
  });
});
