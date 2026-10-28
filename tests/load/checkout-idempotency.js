import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8002';

export default function () {
  const key = `idempotency-test-${Date.now()}`;
  const payload = JSON.stringify({
    product_id: 'flash-phone-001',
    quantity: 1,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    timeout: '5s',
  };

  const first = http.post(`${BASE_URL}/checkout`, payload, params);
  const second = http.post(`${BASE_URL}/checkout`, payload, params);

  let firstBody = {};
  let secondBody = {};

  try { firstBody = JSON.parse(first.body); } catch {}
  try { secondBody = JSON.parse(second.body); } catch {}

  check(null, {
    'first checkout accepted': () => first.status === 202,
    'retry accepted': () => second.status === 202,
    'both responses have the same order ID': () =>
      Boolean(firstBody.id) && firstBody.id === secondBody.id,
    'retry marked as replayed': () => secondBody.replayed === true,
  });
}
