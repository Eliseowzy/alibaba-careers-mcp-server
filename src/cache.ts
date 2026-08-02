import { LRUCache } from "lru-cache";
import type { Logger } from "./logger.js";

const cache = new LRUCache<string, object | string | number | boolean>({ max: 500 });

export async function cached<T>(key: string, ttl: number, loader: () => Promise<T>, logger: Logger): Promise<T> {
  const hit = cache.get(key) as T | undefined;
  if (hit !== undefined) {
    logger.debug({ key }, "cache hit");
    return hit;
  }
  const value = await loader();
  cache.set(key, value as object | string | number | boolean, { ttl });
  return value;
}
