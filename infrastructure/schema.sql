CREATE TABLE IF NOT EXISTS inventory (
    product_id TEXT PRIMARY KEY,
    stock INTEGER NOT NULL CHECK (stock >= 0)
);

INSERT INTO inventory (product_id, stock)
VALUES ('flash-phone-001', 500)
ON CONFLICT (product_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY,
    idempotency_key TEXT NOT NULL UNIQUE,
    product_id TEXT NOT NULL REFERENCES inventory(product_id),
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'confirmed', 'rejected', 'failed')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbox (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    aggregate_id UUID NOT NULL REFERENCES orders(id),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_unpublished
    ON outbox (id)
    WHERE published_at IS NULL;
