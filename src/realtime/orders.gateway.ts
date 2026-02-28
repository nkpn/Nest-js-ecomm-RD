import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException
} from '@nestjs/websockets';
import { Subscription } from 'rxjs';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../auth/types';
import { OrderStatusChangedEvent } from '../orders/order-events.types';
import { OrdersEventsService } from '../orders/orders-events.service';
import { OrdersService } from '../orders/order.service';

type SubscribeOrderPayload = {
  orderId: string;
};

type RealtimeClientData = {
  user?: JwtPayload;
  subscribeCalls?: number[];
};

/**
 * ПОРЯДОК ВИКЛИКІВ (lifecycle + runtime) ДЛЯ OrdersGateway
 *
 * =========================
 * 0) Старт застосунку (Nest lifecycle)
 * =========================
 * 1) Nest DI створює інстанс OrdersGateway (constructor)
 * 2) Nest викликає onModuleInit()
 *    2.1) this.ordersEvents.events$.subscribe(...)
 *         - З цього моменту gateway "слухає" внутрішні події замовлень
 *         - Це НЕ залежить від того, чи є підключені WS-клієнти
 *
 * =========================
 * 1) Підключення клієнта (Socket.IO connect / handshake)
 * =========================
 * Клієнт робить: io("/realtime", { auth: { token } }) або передає bearer/query token
 *
 * 3) Socket.IO приймає handshake (auth / headers / query)
 * 4) Якщо транспорт/handshake ок -> відбувається connect
 * 5) Nest викликає handleConnection(client)
 *    5.1) getTokenFromHandshake(client)
 *         - пробує витягнути token у порядку:
 *           a) client.handshake.auth.token
 *           b) client.handshake.headers.authorization (Bearer ...)
 *           c) client.handshake.query.token
 *    5.2) якщо token НЕ знайдено -> client.disconnect() -> (перейде до disconnect)
 *    5.3) якщо token знайдено -> jwtService.verifyAsync(token)
 *         - якщо verify OK:
 *           - client.data.user = payload
 *           - client.data.subscribeCalls = []
 *         - якщо verify FAIL:
 *           - log warn
 *           - client.disconnect() -> (перейде до disconnect)
 *
 * 6) Коли з'єднання реально рветься (сам/мережа/сервер/через disconnect вище)
 *    Nest викликає handleDisconnect(client)
 *    6.1) чистимо client.data.subscribeCalls (не критично, але охайно)
 *
 * =========================
 * 2) Виклики з клієнта (client -> server events)
 * =========================
 * Клієнт шле: socket.emit("subscribeOrder", { orderId })
 *
 * 7) Nest ловить подію "subscribeOrder" -> викликає subscribeOrder(client, payload)
 *    7.1) assertRateLimit(client)
 *         - вікно: 3000ms
 *         - ліміт: 5 викликів
 *         - якщо перевищено -> throw WsException("Rate limit exceeded")
 *    7.2) валідація payload.orderId
 *         - якщо нема/не string -> throw WsException("orderId is required")
 *    7.3) беремо user з client.data.user
 *         - якщо нема -> throw WsException("Unauthenticated")
 *    7.4) ordersService.canSubscribeToOrder(orderId, user)
 *         - якщо кидає помилку -> throw WsException(err.message || "Subscription denied")
 *    7.5) client.join(orderRoom(orderId)) // додаємо socket у room "order:<id>"
 *    7.6) return { ok: true }
 *
 * Клієнт шле: socket.emit("unsubscribeOrder", { orderId })
 *
 * 8) Nest ловить "unsubscribeOrder" -> викликає unsubscribeOrder(client, payload)
 *    8.1) валідація orderId (як вище)
 *    8.2) client.leave(orderRoom(orderId))
 *    8.3) return { ok: true }
 *
 * =========================
 * 3) Внутрішні події (server -> clients broadcast)
 * =========================
 * Десь у системі OrdersEventsService пушить події у events$:
 *   ordersEvents.events$.next({ orderId, ... })
 *
 * 9) RxJS subscription (з onModuleInit) отримує event у next(...)
 *    9.1) викликається emitOrderStatus(event)
 *         -> this.server.to("order:<id>").emit("order.status", event)
 * 10) Socket.IO розсилає "order.status" ВСІМ клієнтам, які ВЖЕ в room "order:<id>"
 *     - якщо клієнт не викликав subscribeOrder() -> він не в room -> подію не отримає
 *
 * =========================
 * 4) Зупинка застосунку (Nest lifecycle)
 * =========================
 * 11) Nest викликає onModuleDestroy()
 *     11.1) this.eventsSub?.unsubscribe()
 */

@WebSocketGateway({ namespace: '/realtime', cors: { origin: true } })
export class OrdersGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  //нест з метадати бере сокет іо сервер і повертає саме його
  @WebSocketServer() server: Server;

  private readonly logger = new Logger(OrdersGateway.name);
  private eventsSub?: Subscription;

  constructor(
    private readonly jwtService: JwtService,
    private readonly ordersService: OrdersService,
    private readonly ordersEvents: OrdersEventsService
  ) {}

  onModuleInit(): void {
    this.eventsSub = this.ordersEvents.events$.subscribe({
      next: (event) => this.emitOrderStatus(event),
      error: (err) => {
        this.logger.error('orders events subscription failed', err?.stack ?? String(err));
      }
    });
  }

  onModuleDestroy(): void {
    this.eventsSub?.unsubscribe();
  }

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    const token = this.getTokenFromHandshake(client);
    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      (client.data as RealtimeClientData).user = payload;
      (client.data as RealtimeClientData).subscribeCalls = [];
    } catch (err: any) {
      this.logger.warn(`WS auth failed: ${err?.message ?? String(err)}`);
      client.disconnect();
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket): void {
    const data = client.data as RealtimeClientData;
    if (data.subscribeCalls) {
      data.subscribeCalls.length = 0;
    }
  }

  @SubscribeMessage('subscribeOrder')
  async subscribeOrder(
    @ConnectedSocket() client: Socket,// ios, web, ... 
    @MessageBody() payload: SubscribeOrderPayload
  ): Promise<{ ok: true }> {
    //#region Можна винести в декоратори
    this.assertRateLimit(client);

    const orderId = payload?.orderId;
    if (!orderId || typeof orderId !== 'string') {
      throw new WsException('orderId is required');
    }

    const user = (client.data as RealtimeClientData).user;
    if (!user) {
      throw new WsException('Unauthenticated');
    }
    //#endregion Можна винести в декоратори

    try {
      await this.ordersService.canSubscribeToOrder(orderId, user);
    } catch (err: any) {
      const message = err?.message ?? 'Subscription denied';
      this.logger.warn(`subscribeOrder denied userId=${user.sub} orderId=${orderId} reason=${message}`);
      throw new WsException(message);
    }
  
    await client.join(this.orderRoom(orderId));

    this.logger.log(`subscribeOrder userId=${user.sub} orderId=${orderId}`);

    return { ok: true };
  }

  @SubscribeMessage('unsubscribeOrder')
  async unsubscribeOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribeOrderPayload
  ): Promise<{ ok: true }> {
    const orderId = payload?.orderId;
    if (!orderId || typeof orderId !== 'string') {
      throw new WsException('orderId is required');
    }

    await client.leave(this.orderRoom(orderId));
    return { ok: true };
  }

  private emitOrderStatus(event: OrderStatusChangedEvent): void {
    this.server.to(this.orderRoom(event.orderId)).emit('order.status', event);
  }

  private orderRoom(orderId: string): string {
    return `order:${orderId}`;
  }

  private getTokenFromHandshake(client: Socket): string | null {
    const authToken = (client.handshake.auth as any)?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }

    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
      return header.slice('bearer '.length).trim();
    }

    const queryToken = (client.handshake.query as any)?.token;
    if (typeof queryToken === 'string' && queryToken.length > 0) {
      return queryToken;
    }

    return null;
  }

  private assertRateLimit(client: Socket): void {
    const data = client.data as RealtimeClientData;
    const now = Date.now();
    const windowMs = 3000;
    const maxCalls = 5;

    if (!data.subscribeCalls) {
      data.subscribeCalls = [];
    }

    data.subscribeCalls = data.subscribeCalls.filter((t) => now - t < windowMs);
    if (data.subscribeCalls.length >= maxCalls) {
      throw new WsException('Rate limit exceeded');
    }

    data.subscribeCalls.push(now);
  }
}
