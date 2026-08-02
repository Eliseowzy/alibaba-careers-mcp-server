export interface CareerSite {
  siteKey: string;
  domain: string;
  baseUrl: string;
  displayName: string;
  isDefault?: boolean;
}

const definitions: Array<[string, string, string]> = [
  ["holding", "talent-holding.alibaba.com", "阿里控股集团"],
  ["aliyun", "careers.aliyun.com", "阿里云"],
  ["taotian", "talent.taotian.com", "淘天集团"],
  ["eleme", "talent.ele.me", "饿了么"],
  ["amap", "talent.amap.com", "高德"],
  ["aidc", "aidc-jobs.alibaba.com", "阿里国际数字商业集团"],
  ["cainiao", "talent.cainiao.com", "菜鸟"],
  ["hujing", "jobs.hujing-dme.com", "虎鲸文娱"],
  ["alihealth", "careers.alihealth.cn", "阿里健康"],
  ["alisports", "jobs.alisports.com", "阿里体育"],
  ["dingtalk", "talent.dingtalk.com", "钉钉"],
  ["fliggy", "career.fliggy.com", "飞猪"],
  ["freshippo", "hire.freshippo.com", "盒马"],
  ["lingxigames", "talent.lingxigames.com", "灵犀互娱"],
  ["thead", "recruitment.t-head.cn", "平头哥"],
  ["tongyi", "careers-tongyi.alibaba.com", "通义"],
  ["agtech", "talent.agtech.com", "AGTech"],
  ["quark", "talent.quark.cn", "夸克"]
];

export const CAREER_SITES: CareerSite[] = definitions.map(([siteKey, domain, displayName], index) => ({
  siteKey,
  domain,
  baseUrl: `https://${domain}`,
  displayName,
  isDefault: index === 0
}));

export const DEFAULT_SITE = CAREER_SITES[0];

export function resolveSite(value?: string): CareerSite {
  if (!value) return DEFAULT_SITE;
  const normalized = value.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const site = CAREER_SITES.find((item) => item.siteKey === normalized || item.domain === normalized);
  if (!site) {
    throw new Error(`不支持的站点: ${value}。可用值: ${CAREER_SITES.map((item) => `${item.siteKey} (${item.domain})`).join(", ")}`);
  }
  return site;
}
