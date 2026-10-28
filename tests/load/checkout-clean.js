import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    inventory_contention: {
      executor: 'shared-iterations',
      vus: 100,
      iterations: 500,
      maxDuration: '60s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8002';

export default function () {
  const key = `clean-${__VU}-${__ITER}-${Date.now()}-${Math.random()}`;

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
      timeout: '5s',
      responseCallback: http.expectedStatuses(202, 409),
    }
  );

  check(response, {
    'checkout accepted or sold out': (r) => r.status === 202 || r.status === 409,
    'accepted order has an ID': (r) => {
      if (r.status !== 202) return true;
      try {
        return Boolean(JSON.parse(r.body).id);
      } catch {
        return false;
      }
    },
  });
}
