#!/usr/bin/env node

const { randomUUID } = require('node:crypto');
const amqp = require('amqplib');

function readArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const maybeValue = argv[index + 1];
    if (!maybeValue || maybeValue.startsWith('--')) {
      args[key] = 'true';
      continue;
    }

    args[key] = maybeValue;
    index += 1;
  }
  return args;
}

function failUsage(message) {
  console.error(message);
  console.error(
    'Usage: node scripts/publish-order-message.js --orderId <uuid> [--messageId <uuid>] [--attempt <n>] [--queue <name>] [--url <amqp-url>] [--expiration <ms>]',
  );
  process.exit(1);
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const orderId = args.orderId;
  if (!orderId) {
    failUsage('--orderId is required');
  }

  const queue = args.queue ?? 'orders.process';
  const messageId = args.messageId ?? randomUUID();
  const correlationId = args.correlationId ?? orderId;
  const createdAt = args.createdAt ?? new Date().toISOString();
  const url = args.url ?? process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5673';
  const attempt = Number.parseInt(args.attempt ?? '0', 10);
  if (!Number.isInteger(attempt) || attempt < 0) {
    failUsage('--attempt must be a non-negative integer');
  }

  const payload = {
    messageId,
    orderId,
    createdAt,
    attempt,
    correlationId,
    producer: 'orders-api',
    eventName: 'order.created',
  };

  const publishOptions = {
    contentType: 'application/json',
    persistent: true,
    messageId,
    correlationId,
  };
  if (args.expiration) {
    publishOptions.expiration = String(args.expiration);
  }

  let connection;
  let channel;
  try {
    connection = await amqp.connect(url);
    channel = await connection.createChannel();
    await channel.assertQueue(queue, { durable: true });
    const ok = channel.sendToQueue(
      queue,
      Buffer.from(JSON.stringify(payload)),
      publishOptions,
    );

    console.log(
      JSON.stringify(
        {
          published: ok,
          queue,
          url,
          messageId,
          orderId,
          attempt,
          correlationId,
          expiration: args.expiration ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    if (channel) {
      await channel.close();
    }
    if (connection) {
      await connection.close();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
