export type OrderProcessMessage = {
  messageId: string;
  orderId: string;
  createdAt: string;
  attempt: number;
  correlationId?: string;
  producer?: 'orders-api';
  eventName?: 'order.created';
};
