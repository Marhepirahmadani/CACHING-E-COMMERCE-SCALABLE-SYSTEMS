class FlashSale {
  constructor(redis) {
    this.redis = redis;
  }

  async acquireLock(lockKey, ttlSeconds = 5) {
    return await this.redis.setNX(lockKey, 'locked', ttlSeconds);
  }

  async releaseLock(lockKey) {
    await this.redis.del(lockKey);
  }

  async checkRateLimit(userId, maxRequests = 10, windowSeconds = 10) {
    const key = `ratelimit:${userId}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
    const current = await this.redis.client.incr(key);
    if (current === 1) await this.redis.client.expire(key, windowSeconds);
    return { allowed: current <= maxRequests, current, limit: maxRequests };
  }

  async claimOnePerUser(userId, dealId) {
    const key = `claimed:${dealId}:${userId}`;
    return await this.redis.setNX(key, 'claimed', 86400);
  }

  async preCacheFlashProduct(productId, data, ttlSeconds = 3600) {
    await this.redis.set(`flash:${productId}`, data, ttlSeconds);
  }

  async getFlashProduct(productId) {
    return await this.redis.get(`flash:${productId}`);
  }

  async purchaseWithProtection(userId, productId, quantity, stockCheckFn) {
    const lockKey = `purchase:lock:${productId}`;
    const lockAcquired = await this.acquireLock(lockKey, 3);
    if (!lockAcquired) return { success: false, reason: 'too_many_requests' };
    try {
      const hasStock = await stockCheckFn(productId, quantity);
      if (!hasStock) return { success: false, reason: 'out_of_stock' };
      const alreadyClaimed = await this.claimOnePerUser(userId, productId);
      if (!alreadyClaimed) return { success: false, reason: 'already_purchased' };
      return { success: true };
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  async incrementSaleCount(productId) {
    const key = `sales:${productId}`;
    return await this.redis.client.incr(key);
  }

  async getSaleCount(productId) {
    const raw = await this.redis.client.get(`sales:${productId}`);
    return raw ? parseInt(raw) : 0;
  }

  async getSalesRanking(limit = 5) {
    const keys = await this.scanKeys('sales:*');
    const sales = [];
    for (const key of keys) {
      const val = await this.redis.client.get(key);
      if (val) sales.push({ productId: key.replace('sales:', ''), count: parseInt(val) });
    }
    sales.sort((a, b) => b.count - a.count);
    return sales.slice(0, limit);
  }

  async checkSlidingWindow(userId, maxRequests = 20, windowMs = 60000) {
    const key = `sliding:${userId}`;
    const now = Date.now();
    await this.redis.client.zadd(key, now, `${now}:${Math.random()}`);
    await this.redis.client.zremrangebyscore(key, 0, now - windowMs);
    const count = await this.redis.client.zcard(key);
    await this.redis.client.expire(key, Math.ceil(windowMs / 1000) + 1);
    return { allowed: count <= maxRequests, count, limit: maxRequests };
  }

  async scanKeys(pattern) {
    const stream = this.redis.client.scanStream({ match: pattern, count: 100 });
    const keys = [];
    for await (const batch of stream) keys.push(...batch);
    return keys;
  }
}

module.exports = FlashSale;
