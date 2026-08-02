# 阿里巴巴招聘 MCP 服务器设计方案

## Summary

基于腾讯招聘 MCP 服务器的 TypeScript 架构，在 `/Users/eliseo/alibaba-careers-mcp-server` 新建阿里巴巴招聘 MCP 服务。服务支持 `stdio` 和 `streamable-http` 两种接入模式，提供岗位筛选和岗位搜索工具，并针对阿里社招“同接口、多公司域名”的特点做站点注册、按域名会话管理、LRU 数据缓存和浏览器化请求头。

默认站点为 `talent-holding.alibaba.com`，展示名为“阿里控股集团”。默认不持久化 cookie，只在进程内按域名维护临时 cookie / XSRF token；接口数据使用 LRU 缓存，降低访问频率。

## Key Changes

- 使用腾讯项目同类基础结构：
  - `src/index.ts`：HTTP 服务入口，监听 `PORT`
  - `src/stdio.ts`：stdio MCP 入口
  - `src/app.ts`：Express + Streamable HTTP `/mcp` + `/health`
  - `src/server.ts`：创建 MCP server，统一包装工具调用日志
  - `src/logger.ts`：pino 结构化日志，stdio 写 stderr，HTTP 写 stdout/可选日志目录
  - `src/cache.ts`：LRU 缓存封装
  - `api/index.ts`：serverless/Vercel 入口
- 新增阿里专属配置：
  - `src/config.ts` 内定义支持站点注册表，包含 `siteKey`、域名、baseUrl、展示名称。
  - 默认站点设为 `talent-holding.alibaba.com` / “阿里控股集团”。
  - 其他站点为：
    - careers.aliyun.com
    - talent.taotian.com
    - talent.ele.me
    - talent.amap.com
    - aidc-jobs.alibaba.com
    - talent.cainiao.com
    - jobs.hujing-dme.com
    - careers.alihealth.cn
    - jobs.alisports.com
    - talent.dingtalk.com
    - career.fliggy.com
    - hire.freshippo.com
    - talent.lingxigames.com
    - recruitment.t-head.cn
    - careers-tongyi.alibaba.com
    - talent.agtech.com
    - talent.quark.cn

  - 同时支持用户列出的阿里系招聘域名：阿里云、淘天、饿了么、高德、AIDC、菜鸟、虎鲸、阿里健康、阿里体育、钉钉、飞猪、盒马、灵犀互娱、平头哥、通义、AGTech、夸克等。
  - 站点注册表需落实为具体域名清单（目前已实测可用：`talent-holding.alibaba.com`、`hire.freshippo.com` 盒马）；实现阶段对每个域名做一次冒烟验证（GET `/` 能取到 `XSRF-TOKEN` 且 `position/search` 返回 `success:true`），验证失败的站点在注册表标记 `disabled` 并在 `list_alibaba_career_sites` 输出中说明。
  - 请求头模拟浏览器：`accept`、`accept-language`、`content-type`、`origin`、`referer`、`user-agent`、`sec-fetch-*` 等。
- 新增接口层：
  - `src/api/alibaba/session.ts`：按域名获取首页 cookie，提取 `XSRF-TOKEN`，构造 POST 所需 cookie header。
    - 同域名并发请求做 in-flight 去重：同一时刻只发一次首页 GET，共享同一个 Promise。
    - 会话设置进程内 TTL（30 分钟），到期后下次调用自动重新获取。
  - `src/api/alibaba/client.ts`：封装 `category/list` 和 `position/search` POST 调用，自动带 `_csrf` query、cookie、origin/referer。
  - `src/api/alibaba/types.ts`：定义岗位查询参数、原始响应、精简岗位结果、筛选项结构。
  - 响应包络（2026-08-02 在 `talent-holding.alibaba.com` 实测确认）：`{ success, errorMsg, errorCode, content }`；`success !== true` 时抛业务错误并携带 `errorMsg`/`errorCode`。
    - `category/list` 的 `content` 为两级分类树数组：`{ name, code, categories: [{ name, code }] }`，其余字段（`parentId`/`id`/`batchId`/`type`）实测均为 null，可忽略。
    - `position/search` 的 `content` 为 `{ totalCount, currentPage, pageSize, datas[] }`；`hasMore = currentPage * pageSize < totalCount`。
    - 岗位对象实测字段：`id`、`name`、`workLocations[]`、`categories[]`、`categoryName`、`department`、`degree`、`experience`、`requirement`、`description`、`publishTime`/`modifyTime`（epoch 毫秒）、`positionUrl`（相对路径 `/off-campus/position-detail?positionId=...`）等。
  - 遇到 401/403 或业务异常时，清理该域名的进程内会话并重试一次；仍失败则返回清晰错误。
- 数据缓存策略：
  - `category/list` 缓存 24 小时，key 包含 `site` 和 `language`。
  - `position/search` 缓存 10 分钟，key 包含 `site`、分页和所有筛选参数。
  - cookie / XSRF token 不进入 LRU 数据缓存，也不写入仓库文件。
- MCP 工具：
  - `list_alibaba_career_sites`：返回支持的公司招聘站点清单，并标明默认站点“阿里控股集团”。
  - `get_job_filters`：查询指定站点的岗位分类/子分类筛选项，默认中文。
  - `search_jobs`：搜索指定站点社招岗位，支持 `keyword`、`site`、`category`、`subCategory`、`regions`、`deptCodes`、`pageIndex`、`pageSize`、`language`。
  - `category` / `subCategory` 支持直接传接口 code，同时支持中文名称到 code 的解析（分类树结构实测稳定）。
  - 名称解析歧义处理：实测存在同级重名子分类（如“技术类”下有两个“综合”，code 410 / 704），名称命中多个 code 时返回工具级错误，列出全部候选 `名称(code)` 并提示改传 code。
  - `regions` / `deptCodes` 目前没有已知的字典接口可查询可选值，第一版仅透传调用方已知的原始值，工具参数描述中注明“需自行提供接口原始值”；后续发现字典接口再补充名称解析。
- 输出格式：
  - 搜索结果统一精简为 `{ total, pageIndex, pageSize, hasMore, site, jobs }`（`total` 取 `totalCount`）。
  - 单个岗位字段映射：`id←id`、`title←name`、`city←workLocations` 拼接、`category←categories`、`subCategory←categoryName`、`department←department`、`degree←degree`、`experience←experience`、`updateTime←modifyTime`（epoch 毫秒转 ISO 字符串）。
  - `url = https://{站点域名}{positionUrl}`（`positionUrl` 实测为相对路径）。
  - `requirement` / `description` 实测每条数百字，默认各截断至 200 字符并加省略号，控制单页 10 条时的输出体积；不输出 `raw` 原始对象。
- 文档与工程文件：
  - 新增 `package.json`、`tsconfig.json`、`README.md`、`Dockerfile`、`docker-compose.yml`、`vercel.json`。
  - README 说明三种使用方式：npx/stdio、本地 HTTP、远程 Streamable HTTP。

## Test Plan

- `npm install` 后运行 `npm run build`，确保 TypeScript 编译通过。
- 本地启动 `npm run dev`，检查 `GET /health` 返回 `{ "status": "ok" }`。
- 使用 MCP inspector 或等价客户端验证：
  - `list_alibaba_career_sites` 返回全部站点，默认站点为 `talent-holding.alibaba.com`。
  - `get_job_filters` 默认站点可返回分类数据。
  - `search_jobs` 默认站点空关键词可返回第一页岗位。
  - 同一查询重复调用命中缓存，日志出现 cache hit。
  - 切换 `site` 后缓存和 cookie 会话互不串用。
- 异常场景：
  - 传入不支持的 `site` 返回工具级错误和可用站点提示。
  - `category` 传重名分类名称（如“综合”）时返回歧义错误并列出候选 code。
  - 上游 403 时自动刷新一次 cookie；二次失败返回明确错误。
  - `pageSize` 超限时由 zod 校验阻止，默认上限设为 20。

## Assumptions

- `docs/api.md` 中描述的 `category/list` 和 `position/search` 路径、CSRF 机制适用于 `talent-holding.alibaba.com` 及列出的阿里系招聘域名；若个别域名接口路径不同，先在站点注册表中保留禁用/错误提示，再单独适配。
- 已于 2026-08-02 用 curl 实测 `talent-holding.alibaba.com` 全链路：GET `/` 返回 `XSRF-TOKEN` + `SESSION` cookie，`category/list` 与 `position/search`（totalCount≈569）均返回 `success:true`。
- `language` 仅确认 `zh` 可用；`en` 取值待实现时验证，验证前工具参数只接受 `zh`。
- `channel` 默认固定为 `group_official_site`，`language` 默认 `zh`。
- 只实现社招岗位查询；不扩展校招、投递、登录、收藏或内推功能。
- 为避免泄漏和文件污染，cookie 默认只做进程内缓存，不落盘；数据缓存使用内存 LRU。
- 项目风格优先复用腾讯 MCP 服务器的 TypeScript + 官方 MCP SDK + Express + pino + lru-cache 方案。
