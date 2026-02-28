import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EMPTY, Subject } from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  groupBy,
  mergeMap,
  tap,
  throttleTime,
} from 'rxjs/operators';
import {
  OrderEventsMetrics,
  OrderStatusChangedEvent,
} from './order-events.types';

@Injectable()
export class OrdersEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(OrdersEventsService.name);
  private readonly input$ = new Subject<OrderStatusChangedEvent>();

  readonly metrics: OrderEventsMetrics = {
    received: 0,
    dedupDropped: 0,
    emitted: 0,
  };

  readonly events$ = this.input$.pipe(
    groupBy((event) => event.orderId),
    mergeMap((group$) => {
      let lastVersion: number | undefined;

      return group$.pipe(
        tap((event) => {
          if (lastVersion === event.version) {
            this.metrics.dedupDropped += 1;
          }
          lastVersion = event.version;
        }),
        distinctUntilChanged((left, right) => left.version === right.version),
        throttleTime(300, undefined, { leading: true, trailing: true }),
        tap(() => {
          this.metrics.emitted += 1;
        }),
        catchError((err) => {
          this.logger.error(
            `orders stream error (orderId=${group$.key})`,
            err?.stack ?? String(err),
          );
          return EMPTY;
        }),
      );
    }),
    catchError((err) => {
      this.logger.error('orders stream crashed', err?.stack ?? String(err));
      return EMPTY;
    }),
  );

  publishStatusChanged(event: OrderStatusChangedEvent): void {
    this.metrics.received += 1;
    this.input$.next(event);
  }

  onModuleDestroy(): void {
    this.input$.complete();
  }
}
