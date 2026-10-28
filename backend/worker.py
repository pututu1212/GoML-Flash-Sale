import asyncio
import json
import os

import aio_pika
import asyncpg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]
RABBITMQ_URL = os.environ["RABBITMQ_URL"]
QUEUE_NAME = "flash-sale-orders"


async def publish_outbox(pool, exchange):
    """Publish unpublished events; retain them if publishing fails."""
    async with pool.acquire() as conn:
        events = await conn.fetch(
            """
            SELECT id, event_type, aggregate_id, payload
            FROM outbox
            WHERE published_at IS NULL
            ORDER BY id
            LIMIT 50
            """
        )

    for event in events:
        body = json.dumps(dict(event), default=str).encode()
        message = aio_pika.Message(
            body=body,
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            message_id=str(event["id"]),
            content_type="application/json",
        )

        # Publisher confirms are enabled on the channel.
        await exchange.publish(
            message,
            routing_key=QUEUE_NAME,
            mandatory=True,
        )

        # Mark only after broker confirmation. A crash between these
        # operations may cause redelivery, so the consumer is idempotent.
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE outbox
                SET published_at = NOW()
                WHERE id = $1 AND published_at IS NULL
                """,
                event["id"],
            )


async def process_message(pool, message):
    event = json.loads(message.body)
    order_id = event["aggregate_id"]

    async with pool.acquire() as conn:
        async with conn.transaction():
            # The stock reservation and order were committed by checkout.
            # This consumer finalizes the existing order only.
            await conn.execute(
                """
                UPDATE orders
                SET status = 'confirmed', updated_at = NOW()
                WHERE id = $1 AND status = 'pending'
                """,
                order_id,
            )

    print(f"Processed order event: {order_id}")


async def main():
    pool = await asyncpg.create_pool(
        DATABASE_URL, min_size=1, max_size=5
    )

    try:
        connection = await aio_pika.connect_robust(RABBITMQ_URL)
        async with connection:
            channel = await connection.channel(
                publisher_confirms=True,
                on_return_raises=True,
            )
            await channel.set_qos(prefetch_count=20)

            exchange = await channel.declare_exchange(
                "flash-sale", aio_pika.ExchangeType.DIRECT, durable=True
            )
            queue = await channel.declare_queue(
                QUEUE_NAME, durable=True
            )
            await queue.bind(exchange, routing_key=QUEUE_NAME)

            async def consume(message):
                async with message.process(requeue=True):
                    await process_message(pool, message)

            await queue.consume(consume)
            print("Worker running. Press Ctrl+C to stop.")

            while True:
                await publish_outbox(pool, exchange)
                await asyncio.sleep(1)
    finally:
        await pool.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Worker stopped.")
