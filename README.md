# Alibaba Careers MCP Server

阿里系社招岗位 MCP 服务，支持 18 个招聘站点、岗位分类查询、岗位搜索与岗位详情。会话和数据缓存均只保存在进程内。

## Tools

- `list_alibaba_career_sites`：列出站点，默认 `talent-holding.alibaba.com`
- `get_job_filters`：获取岗位分类树
- `search_jobs`：按关键词、分类、地区、部门及分页搜索岗位
- `get_job_detail`：按站点和岗位 ID 获取完整岗位详情，正文不截断

岗位详情工具接受数字或纯数字字符串 ID，`site` 可使用 `siteKey` 或域名并默认阿里控股集团：

```json
{
  "id": "100004023017",
  "site": "holding",
  "language": "zh"
}
```

## stdio / npx

```json
{
  "mcpServers": {
    "alibaba-careers": {
      "command": "npx",
      "args": ["-y", "alibaba-careers-mcp"]
    }
  }
}
```

本仓库本地运行可将 command 改为 `node`，args 设为绝对路径 `dist/src/stdio.js`。

## Local HTTP

```bash
npm install
npm run build
npm start
```

健康检查为 `GET http://localhost:3000/health`，MCP Streamable HTTP 端点为 `http://localhost:3000/mcp`。

## Remote HTTP

可使用 `Dockerfile` / `docker-compose.yml` 部署，或通过 `vercel.json` 部署到 Vercel。远程 MCP 客户端连接部署后的 `/mcp` 地址。

环境变量：`PORT`（默认 3000）、`LOG_LEVEL`（默认 info）。
