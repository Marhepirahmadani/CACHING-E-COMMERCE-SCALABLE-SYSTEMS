class SessionCache {
  constructor(redis) {
    this.redis = redis;
  }

  async createSession(sessionId, userData, ttlSeconds = 3600) {
    const session = { ...userData, createdAt: Date.now(), lastAccess: Date.now() };
    await this.redis.set(`session:${sessionId}`, session, ttlSeconds);
    return session;
  }

  async getSession(sessionId) {
    return await this.redis.get(`session:${sessionId}`);
  }

  async validateSession(sessionId) {
    const session = await this.redis.get(`session:${sessionId}`);
    if (!session) return { valid: false };
    return { valid: true, session };
  }

  async refreshSession(sessionId, ttlSeconds = 3600) {
    const key = `session:${sessionId}`;
    const session = await this.redis.get(key);
    if (!session) return null;
    session.lastAccess = Date.now();
    await this.redis.set(key, session, ttlSeconds);
    return session;
  }

  async destroySession(sessionId) {
    return await this.redis.del(`session:${sessionId}`);
  }

  async blacklistToken(token, ttlSeconds = 86400) {
    await this.redis.set(`blacklist:${token}`, 'revoked', ttlSeconds);
  }

  async isTokenBlacklisted(token) {
    const result = await this.redis.get(`blacklist:${token}`);
    return result !== null;
  }

  async updateSessionData(sessionId, updates, ttlSeconds = 3600) {
    const key = `session:${sessionId}`;
    const session = await this.redis.get(key);
    if (!session) return null;
    Object.assign(session, updates, { lastAccess: Date.now() });
    await this.redis.set(key, session, ttlSeconds);
    return session;
  }

  async getActiveSessions(userId) {
    const keys = await this.scanKeys('session:*');
    const sessions = [];
    for (const key of keys) {
      const session = await this.redis.get(key);
      if (session && session.userId === userId) {
        sessions.push({ sessionId: key.replace('session:', ''), ...session });
      }
    }
    return sessions;
  }

  async rateLimitLogin(userId, maxAttempts = 5, windowSeconds = 300) {
    const key = `login:attempts:${userId}`;
    const attempts = await this.redis.client.incr(key);
    if (attempts === 1) await this.redis.client.expire(key, windowSeconds);
    return { allowed: attempts <= maxAttempts, attempts, remaining: Math.max(0, maxAttempts - attempts) };
  }

  async scanKeys(pattern) {
    const stream = this.redis.client.scanStream({ match: pattern, count: 100 });
    const keys = [];
    for await (const batch of stream) keys.push(...batch);
    return keys;
  }
}

module.exports = SessionCache;
