import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 5,
  iterations: 10,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8002';

export default function () {
  const key = `diagnostic-${__VU}-${__ITER}-${Date.now()}`;

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
      responseCallback: http.expectedStatuses(202, 409),
      timeout: '5s',
    }
  );

  check(response, {
    'expected checkout status': (r) => r.status === 202 || r.status === 409,
  });
}
