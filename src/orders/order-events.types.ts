import { OrderStatus } from './entity/order.entity';

export type OrderStatusChangedEvent = {
  orderId: string;
  status: OrderStatus;
  version: number;
  ts: number;
};

export type OrderEventsMetrics = {
  received: number;
  dedupDropped: number;
  emitted: number;
};
