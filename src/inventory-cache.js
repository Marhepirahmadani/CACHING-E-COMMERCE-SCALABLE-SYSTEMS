class InventoryCache {
  constructor(redis) {
    this.redis = redis;
  }

  async initStock(productId, quantity) {
    const key = `stock:${productId}`;
    const exists = await this.redis.exists(key);
    if (exists) return false;
    await this.redis.client.set(key, quantity.toString());
    return true;
  }

  async getStock(productId) {
    const raw = await this.redis.client.get(`stock:${productId}`);
    return raw !== null ? parseInt(raw) : null;
  }

  async setStock(productId, quantity) {
    await this.redis.client.set(`stock:${productId}`, quantity.toString());
  }

  async deductStock(productId, quantity) {
    const key = `stock:${productId}`;
    const current = await this.redis.client.get(key);
    if (current === null) return false;
    const newStock = parseInt(current) - quantity;
    if (newStock < 0) return false;
    await this.redis.client.set(key, newStock.toString());
    return true;
  }

  async deductStockAtomic(productId, quantity) {
    const current = await this.getStock(productId);
    if (current === null || current < quantity) return false;
    await this.redis.client.decrby(`stock:${productId}`, quantity);
    return true;
  }

  async reserveStock(productId, quantity, ttlSeconds = 300) {
    const key = `stock:${productId}`;
    const current = await this.redis.client.get(key);
    if (current === null || parseInt(current) < quantity) return false;
    await this.redis.client.decrby(key, quantity);
    const reservationId = `reserved:${productId}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
    await this.redis.client.setex(reservationId, ttlSeconds, quantity.toString());
    return reservationId;
  }

  async releaseReservation(reservationId) {
    const raw = await this.redis.client.get(reservationId);
    if (!raw) return false;
    const quantity = parseInt(raw);
    const productId = reservationId.split(':')[1];
    await this.redis.client.incrby(`stock:${productId}`, quantity);
    await this.redis.client.del(reservationId);
    return true;
  }

  async purchaseWithLock(productId, quantity, userId) {
    const lockKey = `purchase:lock:${productId}`;
    const acquired = await this.redis.setNX(lockKey, userId, 3);
    if (!acquired) return { success: false, reason: 'too_many_requests' };
    try {
      const current = await this.redis.client.get(`stock:${productId}`);
      if (current === null) return { success: false, reason: 'no_stock_data' };
      if (parseInt(current) < quantity) return { success: false, reason: 'out_of_stock' };
      await this.redis.client.decrby(`stock:${productId}`, quantity);
      return { success: true, remainingStock: parseInt(current) - quantity };
    } finally {
      await this.redis.del(lockKey);
    }
  }

  async bulkUpdateStock(items) {
    const multi = this.redis.client.multi();
    for (const { productId, quantity } of items) {
      multi.set(`stock:${productId}`, quantity.toString());
    }
    await multi.exec();
    return items.length;
  }

  async restock(productId, quantity) {
    const key = `stock:${productId}`;
    await this.redis.client.incrby(key, quantity);
    const newStock = await this.redis.client.get(key);
    return parseInt(newStock);
  }

  async getLowStockProducts(threshold = 5) {
    const keys = await this.scanKeys('stock:*');
    const low = [];
    for (const key of keys) {
      const val = await this.redis.client.get(key);
      if (val && parseInt(val) <= threshold) {
        low.push({ productId: key.replace('stock:', ''), stock: parseInt(val) });
      }
    }
    return low;
  }

  async getStockAudit(productIds) {
    const multi = this.redis.client.multi();
    for (const id of productIds) multi.get(`stock:${id}`);
    const results = await multi.exec();
    const audit = {};
    for (let i = 0; i < productIds.length; i++) {
      const raw = results[i]?.[1];
      audit[productIds[i]] = raw !== null ? parseInt(raw) : null;
    }
    return audit;
  }

  async scanKeys(pattern) {
    const stream = this.redis.client.scanStream({ match: pattern, count: 100 });
    const keys = [];
    for await (const batch of stream) keys.push(...batch);
    return keys;
  }
}

module.exports = InventoryCache;
