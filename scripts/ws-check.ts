import { io } from 'socket.io-client';

type CliOptions = {
  url: string;
  token: string;
  orderId: string;
  timeoutMs: number;
};

function readOptions(): CliOptions {
  const args = new Map<string, string>();

  for (const rawArg of process.argv.slice(2)) {
    if (!rawArg.startsWith('--')) {
      continue;
    }

    const [key, value] = rawArg.slice(2).split('=');
    if (key && value) {
      args.set(key, value);
    }
  }

  const url = args.get('url') ?? process.env.WS_URL ?? 'http://localhost:3000/realtime';
  const token = args.get('token') ?? process.env.WS_TOKEN ?? '';
  const orderId = args.get('orderId') ?? process.env.WS_ORDER_ID ?? '';
  const timeoutMs = Number(args.get('timeoutMs') ?? process.env.WS_TIMEOUT_MS ?? '30000');

  if (!token) {
    throw new Error('Missing token. Pass --token=... or set WS_TOKEN.');
  }

  if (!orderId) {
    throw new Error('Missing orderId. Pass --orderId=... or set WS_ORDER_ID.');
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('timeoutMs must be a positive number.');
  }

  return { url, token, orderId, timeoutMs };
}

async function main(): Promise<void> {
  const options = readOptions();

  const socket = io(options.url, {
    transports: ['websocket'],
    auth: { token: options.token },
    timeout: options.timeoutMs,
  });

  const shutdown = (code: number) => {
    socket.disconnect();
    process.exit(code);
  };

  const timer = setTimeout(() => {
    console.error(`Timed out after ${options.timeoutMs}ms without order.status event.`);
    shutdown(1);
  }, options.timeoutMs);

  socket.on('connect', () => {
    console.log(`Connected: socketId=${socket.id}`);
    socket.emit(
      'subscribeOrder',
      { orderId: options.orderId },
      (response: unknown) => {
        console.log('subscribeOrder ack:', JSON.stringify(response, null, 2));
      },
    );
  });

  socket.on('connect_error', (error) => {
    clearTimeout(timer);
    console.error('Connection error:', error.message);
    shutdown(1);
  });

  socket.on('order.status', (event) => {
    clearTimeout(timer);
    console.log('order.status event:');
    console.log(JSON.stringify(event, null, 2));
    shutdown(0);
  });

  process.on('SIGINT', () => {
    clearTimeout(timer);
    console.log('Interrupted.');
    shutdown(130);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
