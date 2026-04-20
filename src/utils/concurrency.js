let limiterRuntime = {};
let mutexRuntime = {};

try {
  limiterRuntime = await import("rate-limiter-flexible");
} catch {
  limiterRuntime = {};
}

try {
  mutexRuntime = await import("async-mutex");
} catch {
  mutexRuntime = {};
}

const lockMap = new Map();
const fallbackBuckets = new Map();

const limiter = typeof limiterRuntime.RateLimiterMemory === "function"
  ? new limiterRuntime.RateLimiterMemory({
      points: 14,
      duration: 4
    })
  : null;

function cleanupFallbackBucket(key, durationMs) {
  setTimeout(() => {
    const current = fallbackBuckets.get(key);
    if (current && Date.now() - current.startedAt >= durationMs) {
      fallbackBuckets.delete(key);
    }
  }, durationMs + 50).unref?.();
}

export async function consumeUserRateLimit(userId, actionKey = "default") {
  const key = `${String(userId || "")}:${String(actionKey || "default")}`;
  if (!userId) {
    return { allowed: true, retryAfterMs: 0 };
  }

  if (limiter) {
    try {
      await limiter.consume(key, 1);
      return { allowed: true, retryAfterMs: 0 };
    } catch (error) {
      return {
        allowed: false,
        retryAfterMs: Number(error?.msBeforeNext) || 2000
      };
    }
  }

  const now = Date.now();
  const durationMs = 4000;
  const current = fallbackBuckets.get(key);
  if (!current || now - current.startedAt >= durationMs) {
    fallbackBuckets.set(key, {
      startedAt: now,
      count: 1
    });
    cleanupFallbackBucket(key, durationMs);
    return { allowed: true, retryAfterMs: 0 };
  }

  current.count += 1;
  if (current.count <= 14) {
    return { allowed: true, retryAfterMs: 0 };
  }

  return {
    allowed: false,
    retryAfterMs: Math.max(0, durationMs - (now - current.startedAt))
  };
}

export async function runWithLock(key, handler) {
  const lockKey = String(key || "");
  if (!lockKey) {
    return handler();
  }

  if (typeof mutexRuntime.Mutex === "function") {
    let mutex = lockMap.get(lockKey);
    if (!mutex) {
      mutex = new mutexRuntime.Mutex();
      lockMap.set(lockKey, mutex);
    }

    return mutex.runExclusive(handler);
  }

  const previous = lockMap.get(lockKey) || Promise.resolve();
  let release = null;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const next = previous.catch(() => null).then(() => current);
  lockMap.set(lockKey, next);

  await previous.catch(() => null);
  try {
    return await handler();
  } finally {
    release?.();
    if (lockMap.get(lockKey) === next) {
      lockMap.delete(lockKey);
    }
  }
}
