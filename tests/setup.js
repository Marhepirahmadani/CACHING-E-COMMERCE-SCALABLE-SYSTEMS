const RedisClient = require('../src/redis-client');

const redis = new RedisClient({ host: 'localhost', port: 6380 });
const TEST_TIMEOUT = 15000;

beforeAll(async () => {
  try {
    await redis.connect();
    await redis.flushAll(true);
    console.log('✓ Redis e-commerce terhubung');
  } catch (err) {
    console.warn('⚠ Redis tidak terhubung, pastikan docker sudah running: docker compose up -d');
    console.warn('  Error:', err.message);
  }
}, 15000);

afterAll(async () => {
  try {
    await redis.flushAll(true);
    await redis.disconnect();
  } catch {}
}, 10000);

module.exports = { redis, TEST_TIMEOUT };
