type CacheItem = {
  data: any;
  expires: number;
};

const cache: Record<string, CacheItem> = {};

export function setCache(key: string, data: any, ttl = 30) {
  cache[key] = {
    data,
    expires: Date.now() + ttl * 1000,
  };
}

export function getCache(key: string) {
  const item = cache[key];

  if (!item) return null;

  if (Date.now() > item.expires) {
    delete cache[key];
    return null;
  }

  return item.data;
}
