
import { useEffect, useRef, useState } from 'react'
import './App.css'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001'
const PRODUCT_ID = 'flash-phone-001'

type Inventory = { product_id: string; stock: number }

type Order = {
  id: string
  product_id: string
  status: string
  remaining_stock?: number
  replayed?: boolean
}

function App() {
  const [inventory, setInventory] = useState<Inventory | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(30 * 60)

  const checkoutInFlight = useRef(false)
  const checkoutKey = useRef<string | null>(
    sessionStorage.getItem('flash-sale-idempotency-key'),
  )

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds((value) => (value > 0 ? value - 1 : 0))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  async function refreshInventory() {
    try {
      const response = await fetch(`${API}/inventory`)
      if (!response.ok) throw new Error('Inventory unavailable')

      const data: Inventory = await response.json()
      setInventory(data)
      setError('')
    } catch {
      setError('Cannot connect to the sale server. Please try again shortly.')
    }
  }

  useEffect(() => {
    let active = true

    async function loadInventory() {
      try {
        const response = await fetch(`${API}/inventory`)
        if (!response.ok) throw new Error('Inventory unavailable')

        const data: Inventory = await response.json()

        if (active) {
          setInventory(data)
          setError('')
        }
      } catch {
        if (active) {
          setError(
            'Cannot connect to the sale server. Please try again shortly.',
          )
        }
      }
    }

    void loadInventory()

    const poll = window.setInterval(() => {
      void loadInventory()
    }, 5000)

    return () => {
      active = false
      window.clearInterval(poll)
    }
  }, [])

  useEffect(() => {
    if (
      !order ||
      order.status === 'confirmed' ||
      order.status === 'rejected' ||
      order.status === 'failed'
    ) {
      return
    }

    let active = true

    const poll = window.setInterval(async () => {
      try {
        const response = await fetch(`${API}/orders/${order.id}`)

        if (response.ok) {
          const data: Order = await response.json()
          if (active) setOrder(data)
        }
      } catch {
        // Keep the current order visible while the server reconnects.
      }
    }, 2000)

    return () => {
      active = false
      window.clearInterval(poll)
    }
  }, [order])

  async function buyNow() {
    if (
      checkoutInFlight.current ||
      loading ||
      order ||
      !inventory ||
      inventory.stock <= 0
    ) {
      return
    }

    checkoutInFlight.current = true
    setLoading(true)
    setError('')

    if (!checkoutKey.current) {
      checkoutKey.current = crypto.randomUUID()
      sessionStorage.setItem(
        'flash-sale-idempotency-key',
        checkoutKey.current,
      )
    }

    try {
      const response = await fetch(`${API}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': checkoutKey.current,
        },
        body: JSON.stringify({
          product_id: PRODUCT_ID,
          quantity: 1,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Checkout failed')
      }

      setOrder(data)
      await refreshInventory()
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} If the request outcome is uncertain, retry safely.`
          : 'Checkout failed. Please retry.',
      )
    } finally {
      checkoutInFlight.current = false
      setLoading(false)
    }
  }

  const hours = String(Math.floor(seconds / 3600)).padStart(2, '0')
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
  const secs = String(seconds % 60).padStart(2, '0')

  return (
    <main className="page">
      <nav className="navbar">
        <a className="brand" href="#">
          <span className="brand-mark">G</span> goML
          <span className="brand-light">/sale</span>
        </a>
        <span className="nav-status">
          <span className="live-dot" /> LIVE DROP
        </span>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">THE ONE-DAY DROP · LIMITED STOCK</p>
          <h1>
            Big tech.
            <br />
            <span>One chance.</span>
          </h1>
          <p className="intro">
            A flagship experience. An extraordinary price. When the 500 units
            are gone, they're gone.
          </p>
          <div className="timer-label">SALE WINDOW CLOSES IN</div>
          <div
            className="countdown"
            aria-label={`${hours} hours ${minutes} minutes ${secs} seconds`}
          >
            <div>
              <strong>{hours}</strong>
              <small>HRS</small>
            </div>
            <b>:</b>
            <div>
              <strong>{minutes}</strong>
              <small>MIN</small>
            </div>
            <b>:</b>
            <div>
              <strong>{secs}</strong>
              <small>SEC</small>
            </div>
          </div>
          <a className="text-link" href="#drop">
            Explore the drop <span>&darr;</span>
          </a>
        </div>

        <div
          className="product-art"
          aria-label="Stylized smartphone product illustration"
        >
          <div className="art-glow" />
          <div className="phone phone-back">
            <div className="camera camera-one" />
            <div className="camera camera-two" />
            <div className="camera camera-three" />
            <div className="phone-logo">g</div>
          </div>
          <div className="phone phone-front">
            <div className="screen-island" />
            <div className="screen-content">
              <span>08:00</span>
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="art-caption">
            SERIES 01 <span>·</span> BUILT FOR MORE
          </div>
        </div>
      </section>

      <section className="drop-section" id="drop">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE FEATURED DROP</p>
            <h2>Meet your next upgrade.</h2>
          </div>
          <span className="drop-tag">DROP 001 / 500</span>
        </div>

        <article className="product-card">
          <div className="product-info">
            <span className="availability">
              <span className="live-dot" /> FLASH SALE EXCLUSIVE
            </span>
            <h3>Phone Series 01</h3>
            <p className="product-desc">
              Minimal design. Maximum performance. Made for everything ahead.
            </p>
            <div className="specs">
              <span>01 / Flagship design</span>
              <span>02 / All-day power</span>
              <span>03 / Pro camera system</span>
            </div>
          </div>

          <div className="price-panel">
            <p className="price-label">EXCLUSIVE DROP PRICE</p>
            <div className="price">&#8377;29,999</div>
            <p className="price-note">Limited launch allocation</p>
            <div className="stock-row">
              <span>Availability</span>
              <strong>
                {inventory ? `${inventory.stock} / 500 units` : 'Checking…'}
              </strong>
            </div>
            <div className="stock-track">
              <div
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, ((inventory?.stock ?? 0) / 500) * 100),
                  )}%`,
                }}
              />
            </div>
            <button
              className="buy-button"
              onClick={buyNow}
              disabled={
                loading || !inventory || inventory.stock <= 0
              }
            >
              {loading
                ? 'SECURING YOUR UNIT…'
                : inventory?.stock === 0
                  ? 'SOLD OUT'
                  : 'SECURE YOUR UNIT'}{' '}
              <span>&#8599;</span>
            </button>
            <p className="secure-note">
              Secure checkout · One unit per request
            </p>
          </div>
        </article>

        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}

        {order && (
          <section className="order-card" aria-live="polite">
            <div>
              <p className="eyebrow">YOUR CHECKOUT</p>
              <h3>
                {order.status === 'confirmed'
                  ? 'You’re in.'
                  : 'Your order is processing.'}
              </h3>
              <p>
                Order ID: <code>{order.id}</code>
              </p>
              <p>
                Status: <strong>{order.status.toUpperCase()}</strong>
              </p>
            </div>
            <span className={`order-state ${order.status}`}>
              {order.status === 'confirmed' ? 'CONFIRMED' : 'PROCESSING'}
            </span>
          </section>
        )}

        <div className="trust-row">
          <div>
            <strong>01</strong>
            <span>Atomic stock reservation</span>
          </div>
          <div>
            <strong>02</strong>
            <span>Duplicate-safe checkout</span>
          </div>
          <div>
            <strong>03</strong>
            <span>Live order status</span>
          </div>
        </div>
      </section>

      <footer>
        <a className="brand" href="#">
          <span className="brand-mark">G</span> goML
          <span className="brand-light">/sale</span>
        </a>
        <span className="owner">BUILT BY SIDDHANTH JAIN</span>
      </footer>
    </main>
  )
}

export default App
