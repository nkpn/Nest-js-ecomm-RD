import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { CallOptions, status as GrpcStatus } from '@grpc/grpc-js';
import { ConfigService } from '@nestjs/config';
import type { ClientGrpc } from '@nestjs/microservices';
import {
  firstValueFrom,
  Observable,
  retry,
  throwError,
  timeout,
  timer,
} from 'rxjs';
import {
  PAYMENTS_GRPC_CLIENT,
  PAYMENTS_SERVICE_NAME,
} from '../common/grpc.constants';
import {
  OrdersPaymentConflictError,
  OrdersPaymentIntegrationError,
  OrdersPaymentNotFoundError,
  OrdersPaymentTimeoutError,
  OrdersPaymentUnavailableError,
  OrdersPaymentValidationError,
} from './errors/orders-payment.errors';

export type AuthorizePaymentRequest = {
  orderId: string;
  amount: string;
  currency: string;
  idempotencyKey?: string;
  simulateUnavailableOnce?: boolean;
};

export type AuthorizePaymentResponse = {
  paymentId: string;
  status: string;
};

export type GetPaymentStatusResponse = {
  paymentId: string;
  status: string;
};

type GetPaymentStatusRequest = {
  paymentId: string;
};

interface PaymentsGrpcService {
  Authorize(
    payload: AuthorizePaymentRequest,
    metadata?: undefined,
    options?: CallOptions,
  ): Observable<AuthorizePaymentResponse>;
  GetPaymentStatus(
    payload: GetPaymentStatusRequest,
    metadata?: undefined,
    options?: CallOptions,
  ): Observable<GetPaymentStatusResponse>;
}

@Injectable()
export class PaymentsGrpcClient implements OnModuleInit {
  private readonly logger = new Logger(PaymentsGrpcClient.name);
  private paymentsService!: PaymentsGrpcService;

  constructor(
    @Inject(PAYMENTS_GRPC_CLIENT) private readonly client: ClientGrpc,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.paymentsService = this.client.getService<PaymentsGrpcService>(
      PAYMENTS_SERVICE_NAME,
    );
  }

  async authorize(
    payload: AuthorizePaymentRequest,
  ): Promise<AuthorizePaymentResponse> {
    const timeoutMs = this.getTimeoutMs();
    const maxRetries = this.getAuthorizeMaxRetries();
    const baseBackoffMs = this.getRetryBackoffMs();
    const maxBackoffMs = this.getRetryMaxBackoffMs();
    const callOptions: CallOptions = {
      deadline: new Date(Date.now() + timeoutMs),
    };

    try {
      return await firstValueFrom(
        this.paymentsService
          .Authorize(payload, undefined, callOptions)
          .pipe(
            timeout(timeoutMs),
            retry({
              count: maxRetries,
              delay: (error, retryIndex) => {
                if (!this.isTransientGrpcError(error)) {
                  return throwError(() => error);
                }

                const delayMs = Math.min(
                  baseBackoffMs * Math.pow(2, retryIndex - 1),
                  maxBackoffMs,
                );
                this.logger.warn(
                  `retry authorize attempt=${retryIndex}/${maxRetries} delayMs=${delayMs}`,
                );
                return timer(delayMs);
              },
            }),
          ),
      );
    } catch (error) {
      throw this.mapRpcError(error);
    }
  }

  async getPaymentStatus(paymentId: string): Promise<GetPaymentStatusResponse> {
    const timeoutMs = this.getTimeoutMs();
    const callOptions: CallOptions = {
      deadline: new Date(Date.now() + timeoutMs),
    };

    try {
      return await firstValueFrom(
        this.paymentsService
          .GetPaymentStatus({ paymentId }, undefined, callOptions)
          .pipe(timeout(timeoutMs)),
      );
    } catch (error) {
      throw this.mapRpcError(error);
    }
  }

  private getTimeoutMs(): number {
    const value = Number(
      this.configService.get<string>('PAYMENTS_GRPC_TIMEOUT_MS') ??
        this.configService.get<string>('PAYMENTS_RPC_TIMEOUT_MS') ??
        '1000',
    );
    if (!Number.isFinite(value) || value <= 0) {
      return 1000;
    }
    return value;
  }

  private getAuthorizeMaxRetries(): number {
    const value = Number(
      this.configService.get<string>('PAYMENTS_GRPC_AUTHORIZE_MAX_RETRIES') ??
        '2',
    );
    if (!Number.isInteger(value) || value < 0) {
      return 2;
    }
    return value;
  }

  private getRetryBackoffMs(): number {
    const value = Number(
      this.configService.get<string>('PAYMENTS_GRPC_RETRY_BACKOFF_MS') ?? '150',
    );
    if (!Number.isFinite(value) || value <= 0) {
      return 150;
    }
    return value;
  }

  private getRetryMaxBackoffMs(): number {
    const value = Number(
      this.configService.get<string>('PAYMENTS_GRPC_RETRY_MAX_BACKOFF_MS') ??
        '2000',
    );
    if (!Number.isFinite(value) || value <= 0) {
      return 2000;
    }
    return value;
  }

  private isTransientGrpcError(error: unknown): boolean {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: number }).code
        : undefined;

    return code === GrpcStatus.UNAVAILABLE;
  }

  private mapRpcError(error: unknown): Error {
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: string }).name === 'TimeoutError'
    ) {
      return new OrdersPaymentTimeoutError('Payments RPC timeout exceeded');
    }

    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: number }).code
        : undefined;
    const details =
      typeof error === 'object' && error !== null && 'details' in error
        ? (error as { details?: string }).details
        : undefined;
    const message = details ?? 'unknown grpc error';

    if (code === GrpcStatus.INVALID_ARGUMENT) {
      return new OrdersPaymentValidationError(
        `Payments validation failed: ${message}`,
      );
    }

    if (code === GrpcStatus.NOT_FOUND) {
      return new OrdersPaymentNotFoundError(`Payment not found: ${message}`);
    }

    if (code === GrpcStatus.FAILED_PRECONDITION) {
      return new OrdersPaymentConflictError(
        `Payment state conflict: ${message}`,
      );
    }

    if (code === GrpcStatus.ALREADY_EXISTS) {
      return new OrdersPaymentConflictError(
        `Payment duplicate request conflict: ${message}`,
      );
    }

    if (code === GrpcStatus.DEADLINE_EXCEEDED) {
      return new OrdersPaymentTimeoutError(
        `Payments deadline exceeded: ${message}`,
      );
    }

    if (code === GrpcStatus.UNAVAILABLE) {
      return new OrdersPaymentUnavailableError(
        `Payments temporarily unavailable: ${message}`,
      );
    }

    return new OrdersPaymentIntegrationError(
      `Payments RPC failed: ${message}`,
    );
  }
}
