class CartCache {
  constructor(redis) {
    this.redis = redis;
  }

  async getCart(sessionId) {
    return await this.redis.get(`cart:${sessionId}`);
  }

  async addItem(sessionId, item, ttl = 86400) {
    const key = `cart:${sessionId}`;
    let cart = await this.redis.get(key);
    if (!cart) cart = { items: [], total: 0 };
    const existingIndex = cart.items.findIndex(i => i.productId === item.productId);
    if (existingIndex >= 0) {
      cart.items[existingIndex].quantity += item.quantity;
    } else {
      cart.items.push(item);
    }
    cart.total = cart.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    await this.redis.set(key, cart, ttl);
    return cart;
  }

  async updateQuantity(sessionId, productId, quantity, ttl = 86400) {
    const key = `cart:${sessionId}`;
    let cart = await this.redis.get(key);
    if (!cart) return null;
    const item = cart.items.find(i => i.productId === productId);
    if (!item) return null;
    item.quantity = quantity;
    cart.total = cart.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    await this.redis.set(key, cart, ttl);
    return cart;
  }

  async removeItem(sessionId, productId, ttl = 86400) {
    const key = `cart:${sessionId}`;
    let cart = await this.redis.get(key);
    if (!cart) return null;
    cart.items = cart.items.filter(i => i.productId !== productId);
    cart.total = cart.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    await this.redis.set(key, cart, ttl);
    return cart;
  }

  async mergeCarts(anonymousSessionId, userSessionId) {
    const anonCart = await this.redis.get(`cart:${anonymousSessionId}`);
    const userCart = await this.redis.get(`cart:${userSessionId}`);
    if (!anonCart) return userCart || { items: [], total: 0 };
    if (!userCart) {
      await this.redis.set(`cart:${userSessionId}`, anonCart, 86400);
      await this.redis.del(`cart:${anonymousSessionId}`);
      return anonCart;
    }
    for (const anonItem of anonCart.items) {
      const existing = userCart.items.find(i => i.productId === anonItem.productId);
      if (existing) existing.quantity += anonItem.quantity;
      else userCart.items.push(anonItem);
    }
    userCart.total = userCart.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    await this.redis.set(`cart:${userSessionId}`, userCart, 86400);
    await this.redis.del(`cart:${anonymousSessionId}`);
    return userCart;
  }

  async clearCart(sessionId) {
    return await this.redis.del(`cart:${sessionId}`);
  }

  async getItemCount(sessionId) {
    const cart = await this.redis.get(`cart:${sessionId}`);
    if (!cart) return 0;
    return cart.items.reduce((sum, i) => sum + i.quantity, 0);
  }

  async setCartAnonymous(sessionId, cartData, ttl = 86400) {
    await this.redis.set(`cart:${sessionId}`, cartData, ttl);
  }

  async addItemConcurrent(sessionId, item, ttl = 86400) {
    const key = `cart:${sessionId}`;
    const lockKey = `cart:lock:${sessionId}`;
    const lockAcquired = await this.redis.setNX(lockKey, '1', 5);
    if (!lockAcquired) return { success: false, reason: 'lock_contention' };
    try {
      return { success: true, cart: await this.addItem(sessionId, item, ttl) };
    } finally {
      await this.redis.del(lockKey);
    }
  }
}

module.exports = CartCache;
