import type { CareerSite } from "../../config.js";

interface SiteSession { token: string; cookie: string; expiresAt: number }
const sessions = new Map<string, SiteSession>();
const pending = new Map<string, Promise<SiteSession>>();
const TTL = 30 * 60 * 1000;

function splitSetCookie(header: string): string[] {
  return header.split(/,(?=\s*[^;,]+=)/);
}

async function createSession(site: CareerSite): Promise<SiteSession> {
  // Some sites set XSRF-TOKEN on a redirect whose destination is only a UI page.
  // Node fetch has no cookie jar, so following it would discard that intermediate cookie.
  const response = await fetch(`${site.baseUrl}/`, { headers: { accept: "text/html,application/xhtml+xml", "accept-language": "zh-CN,zh;q=0.9", "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138.0 Safari/537.36" }, redirect: "manual" });
  const raw = response.headers.getSetCookie?.() ?? splitSetCookie(response.headers.get("set-cookie") ?? "");
  const cookies = raw.map((item) => item.split(";", 1)[0]).filter(Boolean);
  const tokenCookie = cookies.find((item) => item.startsWith("XSRF-TOKEN="));
  if (!tokenCookie) {
    if (!response.ok) throw new Error(`${site.domain} 首页请求失败: HTTP ${response.status}`);
    throw new Error(`${site.domain} 未返回 XSRF-TOKEN`);
  }
  const token = decodeURIComponent(tokenCookie.slice("XSRF-TOKEN=".length));
  return { token, cookie: cookies.join("; "), expiresAt: Date.now() + TTL };
}

export async function getSession(site: CareerSite): Promise<SiteSession> {
  const current = sessions.get(site.domain);
  if (current && current.expiresAt > Date.now()) return current;
  let promise = pending.get(site.domain);
  if (!promise) {
    promise = createSession(site).then((session) => { sessions.set(site.domain, session); return session; }).finally(() => pending.delete(site.domain));
    pending.set(site.domain, promise);
  }
  return promise;
}

export function clearSession(site: CareerSite): void { sessions.delete(site.domain); }
