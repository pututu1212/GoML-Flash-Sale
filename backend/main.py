
import os
from contextlib import asynccontextmanager
from uuid import UUID, uuid4

import asyncpg
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]
PRODUCT_ID = "flash-phone-001"


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = await asyncpg.create_pool(
        DATABASE_URL,
        min_size=2,
        max_size=10,
    )
    try:
        yield
    finally:
        await app.state.db.close()


app = FastAPI(
    title="GoML Flash Sale API",
    description="Concurrency-safe flash-sale checkout system",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://go-ml-flash-sale.vercel.app",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Idempotency-Key"],
)


class CheckoutRequest(BaseModel):
    product_id: str = Field(default=PRODUCT_ID, min_length=1)
    quantity: int = Field(default=1, ge=1, le=1)


async def get_order(pool, order_id: UUID):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, product_id, status, created_at
            FROM orders
            WHERE id = $1
            """,
            order_id,
        )
    return dict(row) if row else None


@app.get("/")
async def root():
    return {"message": "GoML Flash Sale API is running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/inventory")
async def inventory():
    async with app.state.db.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT product_id, stock
            FROM inventory
            WHERE product_id = $1
            """,
            PRODUCT_ID,
        )

    if not row:
        raise HTTPException(status_code=404, detail="Product not found")

    return dict(row)


@app.post("/checkout", status_code=202)
async def checkout(
    request: CheckoutRequest,
    idempotency_key: str = Header(
        ...,
        alias="Idempotency-Key",
        min_length=8,
        max_length=128,
    ),
):
    if request.product_id != PRODUCT_ID:
        raise HTTPException(status_code=404, detail="Product not found")

    pool = app.state.db

    async with pool.acquire() as conn:
        async with conn.transaction():
            # Serialize requests that use the same idempotency key.
            await conn.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
                idempotency_key,
            )

            existing = await conn.fetchrow(
                """
                SELECT id, product_id, status, created_at
                FROM orders
                WHERE idempotency_key = $1
                """,
                idempotency_key,
            )

            if existing:
                order = dict(existing)
                order["replayed"] = True
                return order

            # Atomically reserve one unit; stock cannot go below zero.
            updated = await conn.fetchrow(
                """
                UPDATE inventory
                SET stock = stock - 1
                WHERE product_id = $1 AND stock > 0
                RETURNING stock
                """,
                PRODUCT_ID,
            )

            if not updated:
                raise HTTPException(status_code=409, detail="Sold out")

            order_id = uuid4()

            # Confirm synchronously in the same transaction.
            await conn.execute(
                """
                INSERT INTO orders
                    (id, idempotency_key, product_id, status)
                VALUES ($1, $2, $3, 'confirmed')
                """,
                order_id,
                idempotency_key,
                PRODUCT_ID,
            )

            return {
                "id": order_id,
                "product_id": PRODUCT_ID,
                "status": "confirmed",
                "remaining_stock": updated["stock"],
                "replayed": False,
            }


@app.get("/orders/{order_id}")
async def order_status(order_id: UUID):
    order = await get_order(app.state.db, order_id)

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return order
