import type { CareerSite } from "../../config.js";
import { clearSession, getSession } from "./session.js";
import type { ApiEnvelope, CategoryNode, SearchContent, SearchParams } from "./types.js";

async function post<T>(site: CareerSite, path: string, body: object, retry = true): Promise<T> {
  const session = await getSession(site);
  const response = await fetch(`${site.baseUrl}/${path}?_csrf=${encodeURIComponent(session.token)}`, {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*", "accept-language": "zh-CN,zh;q=0.9", "content-type": "application/json",
      cookie: session.cookie, origin: site.baseUrl, referer: `${site.baseUrl}/`,
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138.0 Safari/537.36",
      "sec-fetch-dest": "empty", "sec-fetch-mode": "cors", "sec-fetch-site": "same-origin", "x-xsrf-token": session.token
    },
    body: JSON.stringify(body)
  });
  if ((response.status === 401 || response.status === 403) && retry) { clearSession(site); return post<T>(site, path, body, false); }
  if (!response.ok) throw new Error(`${site.domain}/${path} 请求失败: HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const envelope = await response.json() as ApiEnvelope<T>;
  if (envelope.success !== true) {
    if (retry) { clearSession(site); return post<T>(site, path, body, false); }
    throw new Error(`${site.domain}/${path} 业务错误: ${envelope.errorMsg ?? "未知错误"} (${envelope.errorCode ?? "无错误码"})`);
  }
  return envelope.content;
}

export function getCategories(site: CareerSite, language: "zh" = "zh") {
  return post<CategoryNode[]>(site, "category/list", { channel: "group_official_site", language });
}

export function searchPositions(site: CareerSite, params: SearchParams) {
  return post<SearchContent>(site, "position/search", {
    channel: "group_official_site", language: params.language ?? "zh", batchId: "", categories: params.category ?? "",
    deptCodes: params.deptCodes ?? [], key: params.keyword ?? "", pageIndex: params.pageIndex ?? 1, pageSize: params.pageSize ?? 10,
    regions: params.regions ?? "", subCategories: params.subCategory ?? "", shareType: "", shareId: "", myReferralShareCode: ""
  });
}
