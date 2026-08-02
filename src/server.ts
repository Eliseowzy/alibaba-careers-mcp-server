import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { cached } from "./cache.js";
import { CAREER_SITES, resolveSite } from "./config.js";
import type { Logger } from "./logger.js";
import { getCategories, searchPositions } from "./api/alibaba/client.js";
import type { CategoryNode, RawJob } from "./api/alibaba/types.js";

const DAY = 24 * 60 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;
const response = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

function resolveCategory(value: string | undefined, nodes: CategoryNode[], children: boolean): string | undefined {
  if (!value) return undefined;
  const candidates = children ? nodes.flatMap((node) => node.categories ?? []) : nodes;
  if (candidates.some((item) => item.code === value)) return value;
  const matches = candidates.filter((item) => item.name === value);
  if (matches.length === 1) return matches[0].code;
  if (matches.length > 1) throw new Error(`筛选名称“${value}”存在歧义，请改传 code。候选: ${matches.map((item) => `${item.name}(${item.code})`).join(", ")}`);
  throw new Error(`未找到筛选名称或 code: ${value}`);
}

function truncate(value?: string): string | undefined {
  if (!value || value.length <= 200) return value;
  return `${value.slice(0, 200)}...`;
}

function mapJob(job: RawJob, baseUrl: string) {
  const path = job.positionUrl ?? "";
  return {
    id: job.id, title: job.name, city: (job.workLocations ?? []).join(", "), category: job.categories ?? [],
    subCategory: job.categoryName, department: job.department, degree: job.degree, experience: job.experience,
    updateTime: job.modifyTime ? new Date(job.modifyTime).toISOString() : undefined,
    url: /^https?:\/\//.test(path) ? path : `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`,
    requirement: truncate(job.requirement), description: truncate(job.description)
  };
}

export function createMcpServer(logger: Logger): McpServer {
  const server = new McpServer({ name: "alibaba-careers", version: "1.0.0" });

  server.registerTool("list_alibaba_career_sites", { description: "列出支持的阿里系社招站点及默认站点。" }, async () => response({
    defaultSite: CAREER_SITES.find((site) => site.isDefault)?.domain,
    sites: CAREER_SITES.map(({ siteKey, domain, displayName, isDefault }) => ({ siteKey, domain, displayName, isDefault: Boolean(isDefault) }))
  }));

  server.registerTool("get_job_filters", {
    description: "获取指定阿里招聘站点的岗位大类和子类筛选项。",
    inputSchema: { site: z.string().optional().describe("站点 siteKey 或域名，默认阿里控股集团"), language: z.literal("zh").default("zh") }
  }, async ({ site: siteValue, language }) => {
    const site = resolveSite(siteValue);
    logger.info({ tool: "get_job_filters", site: site.domain }, "tool call");
    const categories = await cached(`categories:${site.siteKey}:${language}`, DAY, () => getCategories(site, language), logger);
    return response({ site: site.domain, displayName: site.displayName, categories });
  });

  server.registerTool("search_jobs", {
    description: "搜索阿里系社招岗位。category/subCategory 可传接口 code 或精确中文名；regions/deptCodes 需传接口原始值。",
    inputSchema: {
      keyword: z.string().optional(), site: z.string().optional().describe("站点 siteKey 或域名"),
      category: z.string().optional(), subCategory: z.string().optional(), regions: z.string().optional().describe("地区接口原始值"),
      deptCodes: z.array(z.string()).optional().describe("部门编码接口原始值"), pageIndex: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(20).default(10), language: z.literal("zh").default("zh")
    }
  }, async (args) => {
    const site = resolveSite(args.site);
    logger.info({ tool: "search_jobs", site: site.domain }, "tool call");
    let category = args.category;
    let subCategory = args.subCategory;
    if (category || subCategory) {
      const tree = await cached(`categories:${site.siteKey}:${args.language}`, DAY, () => getCategories(site, args.language), logger);
      category = resolveCategory(category, tree, false);
      const scope = category ? tree.filter((node) => node.code === category) : tree;
      subCategory = resolveCategory(subCategory, scope, true);
    }
    const params = { ...args, category, subCategory };
    const key = `positions:${site.siteKey}:${JSON.stringify(params)}`;
    const result = await cached(key, TEN_MINUTES, () => searchPositions(site, params), logger);
    return response({ total: result.totalCount, pageIndex: result.currentPage, pageSize: result.pageSize,
      hasMore: result.currentPage * result.pageSize < result.totalCount, site: site.domain,
      jobs: result.datas.map((job) => mapJob(job, site.baseUrl)) });
  });
  return server;
}
