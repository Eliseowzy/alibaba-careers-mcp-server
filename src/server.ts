import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { cached } from "./cache.js";
import { CAREER_SITES, resolveSite } from "./config.js";
import type { Logger } from "./logger.js";
import { getCategories, getPositionDetail, searchPositions } from "./api/alibaba/client.js";
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

function absoluteJobUrl(job: RawJob, baseUrl: string): string {
  const path = job.positionUrl ?? "";
  if (/^https?:\/\//.test(path)) return path;
  if (path) return `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  return `${baseUrl}/off-campus/position-detail?positionId=${encodeURIComponent(String(job.id))}`;
}

function withoutNullish<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined)) as Partial<T>;
}

function mapJob(job: RawJob, baseUrl: string) {
  return {
    id: job.id, title: job.name, city: (job.workLocations ?? []).join(", "), category: job.categories ?? [],
    subCategory: job.categoryName, department: job.department, degree: job.degree, experience: job.experience,
    updateTime: job.modifyTime ? new Date(job.modifyTime).toISOString() : undefined,
    url: absoluteJobUrl(job, baseUrl),
    requirement: truncate(job.requirement), description: truncate(job.description)
  };
}

function mapJobDetail(job: RawJob, site: ReturnType<typeof resolveSite>) {
  return withoutNullish({
    site: site.domain,
    displayName: site.displayName,
    id: job.id,
    title: job.name,
    status: job.status,
    code: job.code,
    city: (job.workLocations ?? []).join(", "),
    workLocations: job.workLocations ?? [],
    interviewLocations: job.interviewLocations,
    category: job.categories ?? [],
    subCategory: job.categoryName,
    department: job.department,
    degree: job.degree,
    experience: job.experience,
    tags: job.tags,
    positionType: job.positionType,
    project: job.project,
    publishTime: job.publishTime ? new Date(job.publishTime).toISOString() : undefined,
    updateTime: job.modifyTime ? new Date(job.modifyTime).toISOString() : undefined,
    url: absoluteJobUrl(job, site.baseUrl),
    requirement: job.requirement,
    description: job.description
  });
}

const SERVER_ICON_DATA_URI =
  "data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjA0OCAxMDI0IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0xMTgzLjI4OTE1MTg3IDg0OC4wNTMzMTM3NWMyNzcuMzcyODI1MzEtMTcuODQyMjgwNjMgNTMyLjYzODI4MjE5LTExNC42OTUyOTc4MSA3NjgtMjE1Ljk5MTExNDM3LTE2MS4zNjI0NTg3NSAxMDcuOTc3Nzg1OTQtOTgwLjE1MjUzNjU2IDUxOC43NzY3NDkzOC05ODUuNjYxNjA2MjUgMjM5LjM0MjQ2NTYyIDEuMDY2MjcyMTktMzQuNDc2MTIgMTUuNDYwOTQwNjItNzIuMzY0MzA5NjkgNDQuMTc5MTkyNS0xMTMuNTU3OTQxNTYgMjUuNDEyODA5NjktNDAuMDU2Mjc1NjMgNjEuODc5MzA0MDYtODAuMTQ4MDkzNzUgOTguMzQ1Nzk4NDQtMTIzLjU4MDg5NTYzIDU2LjM3MDIzMzQ0LTY1LjY4MjM0MDMxIDE5NS41ODk3ODEyNS0yMTguMTk0NzQyODEgMjQzLjEwOTk1ODQ0LTMxMi44MDg1OSA4Ljg1MDA1NTMxLTE3LjgwNjczODEyIDE0LjM1OTEyNTk0LTM0LjUxMTY2MjUgMTYuNTYyNzU1MzEtNDguOTc3NDE1OTQgNS41NDQ2MTMxMi04NC41OTA4OTIxOS0xMDEuNjUxMjQwNjItMTE4LjAwMDc0LTI2MC43NzQ1Mjg0NC0xNjIuNTM1MzU2NTZsLTMwLjkyMTg4MDMxIDE4LjkwODU1MTg4IDU5LjY3NTY3NTYzIDQ4Ljk3NzQxNTkzQzg2Ny4yNDYyMDQ2OSAyMjUuNzA2MDM0MzggNzA1Ljk1NDgzMTg3IDI3NS44MjA4MDc1IDUxMC4zNjUwNDk2OSAzNDQuODQ0MTMxNTZsMjcuNjE2NDM5MDYgNzAuMTI1MTM4NzUtOTguMzQ1Nzk4NDQgOTYuODUzMDE4MTNjMTYuNTYyNzU0MzcgMy4zNDA5ODQ2OSAxODcuODQxNTQwNjIgNjEuMjM5NTQwOTQgMzY0LjY2NDkzOTA2LTYzLjQ0MzE2OTM4bDEuMDY2MjcyMTktMS4xMzczNTcxOCAyLjIzOTE3LTIuMjAzNjI3NWMtNS41NDQ2MTMxMi04Ljg4NTU5NzgxLTE2LjU5ODI5Njg3LTE4Ljk0NDA5NDM3LTMyLjA1OTIzNzUtMzEuMTcwNjc3ODIgNTMuMDY0NzkxMjUgMy4zNDA5ODQ2OSA4NS4wODg0ODUzMSA1MC4xMTQ3NzIxOSA3OS41Nzk0MTU2MyA5Ny45NTQ4MzE4OGgtMjMuMjA5MTgyMTljMS4wNjYyNzIxOS0xNi43MDQ5MjQzOC0zLjMwNTQ0MjE5LTMyLjI3MjQ5MTU2LTcuNzQ4MjQxNTYtNDQuNTM0NjE3NS0xMzcuMDE1OTIwMzEgMTAyLjQzMzE3MjgxLTI5Ny4yNDEwMjE4OCAxMTUuNzk3MTEyNS00MzMuMTU1MTI3NSA2Ny44ODU5Njg3NXYxMjAuMjc1NDUzNDRjLTY3LjQyMzkxNzE5IDIzLjM1MTM1MTI1LTE4Mi4zMzI0NjkwNiA5Ni44NTMwMTcxOS0xODIuMzMyNDY5MDcgMTY2Ljk3ODE1NTkzIDQuNDA3MjU2ODcgMzQuNTExNjYyNSAyMC45NzAwMTEyNSA0Ni43NzM3ODc1IDM3LjU2ODMwODEzIDU1LjY1OTM4NTMxIDE1MC4yNzMyMzI1IDg1LjcyODI0ODQ0IDU1Ni45NDkyNzgxMy0zMS4xNzA2Nzc4MSA1NTUuODExOTIwOTQtMzEuMTcwNjc2ODdDNjU2LjIzMTAyNTMxIDkyMi42MjEyNTA5NCA1MTEuNDY2ODY0MzcgOTgyLjc1ODk3ODEyIDI5Ny4wNzUxNTc4MSA5OTEuNjQ0NTc1OTRjLTI4My45ODM3MDk2OS01LjU4MDE1NTYyLTMyNC44NTc0Ni0xOTUuOTQ1MjA1MzEtMTkzLjM1MDYxMTI1LTM5NC4wOTQwMzkwNyAxMjcuMDY0MDUwMzEtMjAwLjM4ODAwNDY5IDMyNy4wNjEwODg0NC0zNzguNTI2NDcxODggNjQ2LjQwOTQ3NzgxLTQ5Mi4wODQ0MTM0M0M4NDIuOTcwNzUxMjUgNzIuMDU2Mjc1NjMgOTc4Ljg4NDg1NzgxIDM1LjM0MDk4NDY5IDExMTAuMzkxNzA2NTYgMzJjMTg4Ljk0MzM1NDM4IDAgMzcyLjM3NzYzODEyIDU2Ljc2MTIgMzYwLjIyMjE0MDYzIDI0MC40Nzk4MjE4OC04Ljg1MDA1NTMxIDE0MS4zODc2MzM3NS0yMDUuNTQxNjUxMjUgMzM1LjA5MzY2OTA2LTMxMS42MzU2OTEyNSA0NzcuNTgzMTE3NS00Ni4zODI4MjA5NCA2MS4yMzk1NDA5NC01NC4xMzEwNjI1IDEwMy41MzQ5ODc1IDI0LjMxMDk5NTkzIDk3Ljk1NDgzMTg3ek0xMzYyLjM1MTcyMTI1IDIwNS42MjQ1ODM3NWM0My40NjgzNDUzMSAxNi43MDQ5MjQzOCA1NS44NzI2MzkzNyAzNS42NDkwMTg3NSA0My40NjgzNDUzMSA1NS42NTkzODUzMSAxMi40Mzk4Mzc1LTIyLjI0OTUzNzUgMC00MS4xNTgwODkzNy00My40NjgzNDUzMS01NS42NTkzODUzMXoiIGZpbGw9IiNmZjY2MDAiLz48L3N2Zz4=";

export function createMcpServer(logger: Logger): McpServer {
  const server = new McpServer({
    name: "alibaba-careers",
    title: "阿里巴巴招聘",
    version: "1.1.1",
    websiteUrl: "https://talent-holding.alibaba.com",
    icons: [
      {
        src: SERVER_ICON_DATA_URI,
        mimeType: "image/svg+xml",
        sizes: ["any"]
      }
    ]
  });

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

  server.registerTool("get_job_detail", {
    description: "查询指定阿里招聘站点的完整岗位详情。岗位 ID 可从 search_jobs 结果获取。",
    inputSchema: {
      id: z.union([
        z.number().int().positive().safe(),
        z.string().regex(/^\d+$/, "岗位 ID 必须是纯数字字符串")
      ]).describe("岗位 ID，接受正整数或纯数字字符串"),
      site: z.string().optional().describe("站点 siteKey 或域名，默认阿里控股集团"),
      language: z.literal("zh").default("zh")
    }
  }, async ({ id, site: siteValue, language }) => {
    const site = resolveSite(siteValue);
    const normalizedId = String(id);
    logger.info({ tool: "get_job_detail", site: site.domain, id: normalizedId }, "tool call");
    const detail = await cached(
      `detail:${site.siteKey}:${language}:${normalizedId}`,
      TEN_MINUTES,
      () => getPositionDetail(site, { id: normalizedId, language }),
      logger
    );
    return response(mapJobDetail(detail, site));
  });
  return server;
}
