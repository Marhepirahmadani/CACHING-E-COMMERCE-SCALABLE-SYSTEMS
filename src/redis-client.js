const Redis = require('ioredis');

class RedisClient {
  constructor(options = {}) {
    this.client = new Redis({
      host: options.host || 'localhost',
      port: options.port || 6380,
      retryStrategy: () => null,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
  }

  async connect() {
    await this.client.connect();
  }

  async disconnect() {
    await this.client.quit();
  }

  async set(key, value, ttlSeconds = null) {
    if (ttlSeconds) {
      return await this.client.setex(key, ttlSeconds, JSON.stringify(value));
    }
    return await this.client.set(key, JSON.stringify(value));
  }

  async setNX(key, value, ttlSeconds) {
    const result = await this.client.set(key, JSON.stringify(value), 'NX', 'EX', ttlSeconds);
    return result === 'OK';
  }

  async get(key) {
    const raw = await this.client.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  }

  async del(key) {
    return await this.client.del(key);
  }

  async exists(key) {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async flushAll(sync = true) {
    if (sync) {
      return await this.client.flushall('SYNC');
    }
    return await this.client.flushall();
  }

  async ttl(key) {
    return await this.client.ttl(key);
  }

  async incr(key) {
    return await this.client.incr(key);
  }

  async info(section) {
    return await this.client.info(section);
  }

  async dbsize() {
    return await this.client.dbsize();
  }

  async multi() {
    return this.client.multi();
  }
}

module.exports = RedisClient;
