下面是当前脚本涉及的完整接口文档。

**通用认证**

所有 POST 接口都需要先获取 cookie。

前置请求：

```http
GET https://hire.freshippo.com/
```

从返回 cookie 中读取：

```text
XSRF-TOKEN
```

后续 POST 请求需要同时满足：

- URL query 里传 `_csrf={XSRF-TOKEN}`
- Header 里传完整 `Cookie`
- `Cookie` 中包含同一个 `XSRF-TOKEN`

示例：

```http
POST /category/list?_csrf={XSRF_TOKEN}
Host: hire.freshippo.com
Content-Type: application/json
Cookie: XSRF-TOKEN={XSRF_TOKEN}; SESSION=...
```

**1. 岗位类目列表**

```http
POST https://hire.freshippo.com/category/list?_csrf={XSRF_TOKEN}
```

用途：获取岗位分类、子分类等筛选项。

请求 Header：

```http
Content-Type: application/json
Cookie: XSRF-TOKEN={XSRF_TOKEN}; SESSION=...
```

请求 Body：

```json
{
  "channel": "group_official_site",
  "language": "zh"
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|---|---:|---:|---|
| `channel` | string | 是 | 渠道，固定为 `group_official_site` |
| `language` | string | 是 | 语言，中文为 `zh` |

示例 curl：

```bash
curl --request POST \
  --url 'https://hire.freshippo.com/category/list?_csrf={XSRF_TOKEN}' \
  --header 'content-type: application/json' \
  --header 'cookie: XSRF-TOKEN={XSRF_TOKEN}; SESSION={SESSION}; ...' \
  --data '{
    "channel": "group_official_site",
    "language": "zh"
  }'
```

响应用途：

- 返回结果可用于岗位查询接口的筛选条件
- 常见映射关系：
  - 大类填入 `categories`
  - 子类填入 `subCategories`

具体响应字段以接口实际返回为准。

**2. 查询岗位列表**

```http
POST https://hire.freshippo.com/position/search?_csrf={XSRF_TOKEN}
```

用途：分页查询岗位列表，可按关键词、地区、类目、部门等条件筛选。

请求 Header：

```http
Content-Type: application/json
Cookie: XSRF-TOKEN={XSRF_TOKEN}; SESSION=...
```

请求 Body：

```json
{
  "channel": "group_official_site",
  "language": "zh",
  "batchId": "",
  "categories": "",
  "deptCodes": [],
  "key": "",
  "pageIndex": 1,
  "pageSize": 10,
  "regions": "",
  "subCategories": "",
  "shareType": "",
  "shareId": "",
  "myReferralShareCode": ""
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|---|---:|---:|---|
| `channel` | string | 是 | 渠道，固定为 `group_official_site` |
| `language` | string | 是 | 语言，中文为 `zh` |
| `batchId` | string | 否 | 批次 ID，空字符串表示不限 |
| `categories` | string | 否 | 岗位大类，空字符串表示不限 |
| `subCategories` | string | 否 | 岗位子类，空字符串表示不限 |
| `deptCodes` | array | 否 | 部门编码列表，空数组表示不限 |
| `key` | string | 否 | 搜索关键词 |
| `pageIndex` | number | 是 | 页码，从 `1` 开始 |
| `pageSize` | number | 是 | 每页数量 |
| `regions` | string | 否 | 地区筛选，空字符串表示不限 |
| `shareType` | string | 否 | 分享类型，通常为空 |
| `shareId` | string | 否 | 分享 ID，通常为空 |
| `myReferralShareCode` | string | 否 | 内推分享码，通常为空 |

示例 curl：

```bash
curl --request POST \
  --url 'https://hire.freshippo.com/position/search?_csrf={XSRF_TOKEN}' \
  --header 'content-type: application/json' \
  --header 'cookie: XSRF-TOKEN={XSRF_TOKEN}; SESSION={SESSION}; ...' \
  --data '{
    "channel": "group_official_site",
    "language": "zh",
    "batchId": "",
    "categories": "",
    "deptCodes": [],
    "key": "",
    "pageIndex": 1,
    "pageSize": 10,
    "regions": "",
    "subCategories": "",
    "shareType": "",
    "shareId": "",
    "myReferralShareCode": ""
  }'
```

**调用顺序**

```text
GET /
  -> 获取 Cookie 和 XSRF-TOKEN

POST /category/list?_csrf={XSRF_TOKEN}
  -> 获取岗位类目筛选项

POST /position/search?_csrf={XSRF_TOKEN}
  -> 查询岗位列表
```

当前python示例代码 已按这个顺序实现，并且会把 cookie 缓存在同目录 `cookies.txt`，避免每次都重新获取。