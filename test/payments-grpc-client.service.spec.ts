import { of } from 'rxjs';
import { PaymentsGrpcClient } from '../src/orders/payments-grpc.client';

describe('PaymentsGrpcClient', () => {
  it('authorize passes callOptions as second argument (without undefined metadata)', async () => {
    const authorizeMock = jest.fn().mockReturnValue(
      of({
        paymentId: 'payment-1',
        status: 'PAYMENT_STATUS_AUTHORIZED',
      }),
    );
    const getStatusMock = jest.fn();

    const grpcClient = {
      getService: jest.fn().mockReturnValue({
        Authorize: authorizeMock,
        GetPaymentStatus: getStatusMock,
      }),
    };
    const configService = { get: jest.fn().mockReturnValue(undefined) };

    const client = new PaymentsGrpcClient(
      grpcClient as never,
      configService as never,
    );
    client.onModuleInit();

    const payload = {
      orderId: 'order-1',
      amount: '199.99',
      currency: 'USD',
    };

    await expect(client.authorize(payload)).resolves.toEqual({
      paymentId: 'payment-1',
      status: 'PAYMENT_STATUS_AUTHORIZED',
    });

    expect(authorizeMock).toHaveBeenCalledTimes(1);
    expect(authorizeMock).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({
        deadline: expect.any(Date),
      }),
    );
    expect(authorizeMock.mock.calls[0]).toHaveLength(2);
  });

  it('getPaymentStatus passes callOptions as second argument (without undefined metadata)', async () => {
    const authorizeMock = jest.fn();
    const getStatusMock = jest.fn().mockReturnValue(
      of({
        paymentId: 'payment-1',
        status: 'PAYMENT_STATUS_AUTHORIZED',
      }),
    );

    const grpcClient = {
      getService: jest.fn().mockReturnValue({
        Authorize: authorizeMock,
        GetPaymentStatus: getStatusMock,
      }),
    };
    const configService = { get: jest.fn().mockReturnValue(undefined) };

    const client = new PaymentsGrpcClient(
      grpcClient as never,
      configService as never,
    );
    client.onModuleInit();

    await expect(client.getPaymentStatus('payment-1')).resolves.toEqual({
      paymentId: 'payment-1',
      status: 'PAYMENT_STATUS_AUTHORIZED',
    });

    expect(getStatusMock).toHaveBeenCalledTimes(1);
    expect(getStatusMock).toHaveBeenCalledWith(
      { paymentId: 'payment-1' },
      expect.objectContaining({
        deadline: expect.any(Date),
      }),
    );
    expect(getStatusMock.mock.calls[0]).toHaveLength(2);
  });
});
