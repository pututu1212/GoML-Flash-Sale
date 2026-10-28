import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    checkout_smoke: {
      executor: 'shared-iterations',
      vus: 20,
      iterations: 20,
      maxDuration: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8002';

export default function () {
  const key = `smoke-${__VU}-${__ITER}-${Date.now()}`;

  const response = http.post(
    `${BASE_URL}/checkout`,
    JSON.stringify({
      product_id: 'flash-phone-001',
      quantity: 1,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
    }
  );

  check(response, {
    'checkout accepted': (r) => r.status === 202,
    'order has an ID': (r) => {
      try {
        return Boolean(JSON.parse(r.body).id);
      } catch {
        return false;
      }
    },
  });
}
