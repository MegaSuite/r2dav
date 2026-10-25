# r2dav 改造实施计划（PLAN）

> 状态：待评审 / 可执行  
> 依据：`AGENTS.md`、当前代码、Cloudflare Pages 实际配置  
> 最后更新：2026-10-25  
> 实施状态：Phase 0–6 已完成。新仓库 `MegaSuite/r2dav`、新 Pages 项目 `r2dav`、自定义域名 `dav.fooa.de` 已上线；旧 `MegaSuite/FlareDrive` 仓库和旧 `flaredrive` Pages 项目已删除。  
> 原则：先补核心能力，再做界面重构；保持 WebDAV 兼容；每阶段可独立验收、独立回滚。

---

## 0. 目标摘要

把当前 FlareDrive 改造成独立的 **r2dav**，完成四件事：

1. **签名直链**：生成无需 Basic Auth、可粘贴到 Clash / 日历 / 任意 HTTP 客户端的文件链接；支持永久或限时访问。
2. **多端界面**：桌面端表格式资源管理器 + 移动端卡片式布局；修复 `View as`、`Sort by` 等无效菜单；支持真实的排序、视图切换和状态持久化。
3. **体验与可靠性**：修复上传失败被标记成功、队列卡死、路径解码错误、静默失败、刷新丢目录、`window.prompt` 交互等问题；补齐路由、错误提示、编辑器、深色模式等。
4. **项目独立**：品牌、包名、文档、部署配置改为 `r2dav`，移除上游关联；保留 MIT 归属与致谢。

---

## 1. 现状分析

### 1.1 已确认的部署事实

通过 Cloudflare 控制台（browser-skill，只读检查）确认：

| 项 | 当前值 |
| --- | --- |
| 代码仓库 | `MegaSuite/FlareDrive`（`longern/FlareDrive` 的 fork） |
| 部署平台 | Cloudflare Pages，项目名 `flaredrive` |
| 生产域名 | `https://flaredrive-83z.pages.dev`；用户确认自定义域名为 `https://dav.fooa.de`（迁移时从旧项目解绑并绑定到新项目） |
| 自动部署 | 开启，生产分支 `main` |
| 构建命令 / 输出 | `npm run build` / `build` |
| 环境变量 | `WEBDAV_USERNAME`、`WEBDAV_PASSWORD`（值不在文档中记录） |
| R2 绑定 | `BUCKET`（控制台显示为通过 wrangler.toml 管理） |
| 当前版本 | 最新提交 `17e74e5 Add MIT License to the project` |

> 实现时不要覆盖既有环境变量和 R2 绑定；新增的 `SHARE_SECRET` 应作为加密变量添加，且不得提交到仓库。

### 1.2 代码结构与现有能力

| 区域 | 文件 | 说明 |
| --- | --- | --- |
| 前端入口 | `src/index.js`、`src/App.tsx` | MUI + React 18 + CRA |
| 文件浏览 | `src/Main.tsx`、`src/FileGrid.tsx` | 当前目录列表、多选、上传入口 |
| 头部 | `src/Header.tsx` | 搜索、更多菜单 |
| 上传 | `src/UploadDrawer.tsx`、`src/app/transfer.ts` | 普通上传、100MB 以上分片上传、缩略图 |
| 队列 | `src/app/transferQueue.tsx` | 串行上传队列 |
| 文本 | `src/TextPadDrawer.tsx` | 仅能新建纯文本 |
| WebDAV | `functions/webdav/*` | PROPFIND/GET/HEAD/PUT/POST/COPY/MOVE/DELETE/MKCOL |
| 工具 | `utils/s3.ts` | S3 签名工具（当前前端未使用） |

现有能力：上传/下载、建目录、搜索当前目录、图片/视频/PDF 缩略图、WebDAV、多选删除/重命名、拖拽上传、分片上传。

### 1.3 关键问题（按影响排序）

| 问题 | 位置 | 影响 |
| --- | --- | --- |
| `View as` / `Sort by` 没有 `onClick`，是死菜单 | `src/Header.tsx:43-44` | 用户明确反馈的核心问题 |
| 只按“文件夹优先”排序，没有字段/方向 | `src/Main.tsx:157-165` | 无法按名称、大小、时间排序 |
| 布局以手机为主：列表卡片、固定 160px 日期、FAB、底部抽屉 | `src/FileGrid.tsx:50,94`、`src/Main.tsx` | 桌面端空间利用率低，不像文件管理器 |
| 分享只调用 `navigator.share` | `src/Main.tsx` 的 `onShare` | 桌面浏览器无反应；不生成可复制的直链 |
| 所有读操作都受 Basic Auth 保护 | `functions/webdav/[[path]].ts:50-70` | Clash/日历无法直接拉取；`WEBDAV_PUBLIC_READ=1` 又会公开全部文件 |
| GET 缺少 CORS、ETag、Last-Modified、Content-Disposition、Range 状态码 | `functions/webdav/get.ts` | 订阅类客户端兼容性差，无法 304/206 |
| MIME 依赖上传时的 `file.type` | `src/app/transfer.ts`、`put.ts`、`post.ts` | 大量扩展名（`.yaml`、`.ics`、`.conf`、`.md`、未知类型等）可能为空或 `application/octet-stream`，客户端可能不识别 |
| 列表路径使用 `decodeURI` 而非 `decodeURIComponent` | `src/app/transfer.ts:40` | 含 `%23`、`%26` 等字符的文件名解析错误 |
| 上传响应未检查 `response.ok` | `src/app/transfer.ts:218` 附近 | 失败可能被标记为完成 |
| 队列失败后未清空 `taskProcessing.current` | `src/app/transferQueue.tsx:89` | 后续任务永久卡住 |
| `createFolder` 吞掉错误，调用方无条件刷新 | `src/app/transfer.ts:245` 附近 | 失败无提示 |
| 使用 `window.prompt` / `window.confirm` | `src/Main.tsx` | 交互不一致、移动端体验差 |
| 目录状态只在内存中 | `src/Main.tsx` 的 `cwd` | 刷新/后退丢失目录，无法深链 |
| 根目录残留旧文件 | `/Main.tsx`、`/TextPadDrawer.tsx` | 与 `src/` 重复，容易误改 |
| Progress 对话框有 Downloads 页签但从未产生下载任务 | `src/ProgressDialog.tsx` | 空功能 |
| manifest 引用不存在的 `favicon.ico`；`index.html` 引用不存在的 `logo192.png` | `public/manifest.json`、`index.html` | PWA/图标异常 |

### 1.4 参考直链分析（AList）

示例：

```text
https://alist.fooa.de/d/Local/config/proxies.yaml?sign=i27Ck9guSal_mwj_7rLgCQER0TBSGCf0Kw2_0MGYda4=:0
```

实际请求结果（已用 curl 验证）：

- `GET` 返回 `200`，`content-disposition: attachment`，`accept-ranges: bytes`，带 `ETag`、`Last-Modified`。
- `sign` 的格式是 `<签名>:<过期时间>`，示例中的 `:0` 表示永久有效。
- 去掉 `sign`、篡改签名或使用错误过期时间，均返回 `401`。

AList 源码也验证了这一点：

- `server/router.go` 为 `/d/*path` 注册了 `signCheck` 中间件，然后才进入下载处理。
- `server/middlewares/down.go` 读取 `?sign=`，验签失败直接 `401`；是否需要签名由 `SignAll`、存储签名开关或目录密码决定。
- `internal/sign/sign.go` 使用全局 Token 作为 HMAC 密钥。
- `pkg/sign/hmac.go` 的算法是：

```text
sign = base64.URLEncoding(HMAC-SHA256(token, path + ":" + expire)) + ":" + expire
expire = 0 表示永久
```

- 下载处理器返回 `Referrer-Policy: no-referrer`、`Cache-Control: no-store`，并由代理/存储响应提供 `Content-Disposition`、`Accept-Ranges`、`ETag` 等头。

结论：这是 **capability URL（能力链接）**，签名本身即授权，不需要登录。r2dav 应采用同样直观的 `/d/...?sign=...:...` 形式，并在兼容性上做得更好：

- `.yaml` / `.ics` 返回正确 MIME；
- 默认 `inline`，提供 `?download=1` 强制附件；
- 支持 CORS、Range、ETag/304；
- 过期返回明确的 `410`；
- 签名只覆盖路径与过期时间，不泄露账号密码。

### 1.5 为什么 AList 能用，而当前项目不能用

核心不是 R2 或文件本身的问题，而是 **入口和授权模型不同**。

```text
AList：
GET /d/config/proxies.yaml?sign=<HMAC(path:expire)>:0
  → signCheck 中间件验签
  → 验签通过，不需要 Basic Auth
  → 直接读取/代理文件，返回 200

当前项目：
GET /webdav/config/proxies.yaml
  → WebDAV 认证中间件发现没有 Authorization
  → 返回 401 + WWW-Authenticate: Basic realm="WebDAV"
  → 永远到不了 GET 文件处理器
```

已实测当前生产域名：

```text
GET  https://flaredrive-83z.pages.dev/webdav/       → 401
PROPFIND https://flaredrive-83z.pages.dev/webdav/   → 401
```

具体差异：

| 维度 | AList `/d` | 当前项目 `/webdav` |
| --- | --- | --- |
| 路由用途 | 公开下载/分享入口 | WebDAV 协议入口 |
| 默认授权 | 能力链接签名 | HTTP Basic Auth |
| 无凭据访问 | 验签通过即可 | 直接 `401` |
| 单文件授权 | 签名绑定路径 + 过期时间 | 无（要么登录，要么全局公开） |
| 链接过期 | `sign` 内含过期时间 | 无 |
| 分享 UI | 生成签名 URL | `navigator.share` 分享 `/webdav/...`，无签名 |
| 桌面可用 | 复制链接即可 | `navigator.share` 在桌面多数浏览器不可用 |
| 客户端兼容 | Clash/日历可直接 GET | 需要 WebDAV 客户端或手工带 Basic Auth |

当前项目的“分享”按钮只是调用 `navigator.share` 分享一个 `/webdav/...` 地址，并没有做三件事：

1. 生成一个针对该文件的、可验证的 token；
2. 让服务端在无 Basic Auth 时接受这个 token；
3. 返回适合外部客户端的响应头（MIME、Content-Disposition、Range、CORS 等）。

因此外部应用拿到链接后仍然会收到 `401`。把 `WEBDAV_PUBLIC_READ` 设为 `1` 虽然能让 GET 免认证，但那是 **全局公开所有文件**，不是可分享、可过期的单文件链接，而且当前部署并未开启。

> 结论：需要新增一条与 `/webdav` 并列的公开直链路由 `/d/*`，在进入文件读取前完成签名校验；不要削弱 `/webdav` 的认证。

---

## 2. 需求映射与优先级

| 原始需求 | 方案 | 优先级 |
| --- | --- | --- |
| Clash 通过链接获取配置文件 | `GET /d/<path>?sign=...:0`，无需认证，正确 YAML MIME | P0 |
| 日历软件通过链接获取 `.ics` | 同一签名直链，`text/calendar; charset=utf-8`，支持 ETag/304 | P0 |
| 分享链接可复制、可管理 | 分享对话框：永久/限时、复制、二维码、打开、过期提示 | P0 |
| 多端界面 | 桌面表格 + 移动卡片 + 响应式头部/工具栏/底部操作栏 | P0 |
| `Sort by` / `View as` 生效 | 排序状态机 + 列表/网格切换 + localStorage 持久化 | P0 |
| 其他前端优化 | 路由、右键菜单、批量操作、对话框、编辑器、深色模式、错误处理 | P1 |
| 上传/队列可靠性 | 检查响应、失败重试、失败不卡队列、MIME 归一化 | P1 |
| 移除上游、改名 r2dav | 品牌/文档；新建非 fork 仓库；新建 Pages 项目 | P0（发布前） |
| 浏览器调试 Cloudflare | 使用 browser-skill 检查部署、环境变量、构建日志 | P1 |

**不做什么（控制范围）**

- 不引入数据库/KV；签名链接保持无状态。
- 不改变 R2 的 key 结构和 `_$flaredrive$/thumbnails/` 内部前缀（避免迁移旧数据）。
- 不重写 WebDAV 协议，`/webdav` 路径和认证方式保持兼容。
- 不做多用户、OAuth、客户端加密。
- 不做文件夹 ZIP 分享、全库搜索、虚拟滚动——列为 P2，按时间再做。
- 不把 CRA 迁移到 Vite；迁移是独立任务，避免和本次需求耦合。

---

## 3. 核心方案：签名直链

### 3.1 URL 形式

```text
https://<domain>/d/<文件路径>?sign=<签名>:<过期Unix秒>
```

示例：

```text
# 永久有效（推荐给 Clash 订阅、日历订阅）
https://example.com/d/config/proxies.yaml?sign=AbC...:0

# 2027-01-01 00:00:00 UTC 过期
https://example.com/d/calendar/feed.ics?sign=XyZ...:1798761600
```

- 路径按段编码：`encodeURIComponent(segment)`，保留 `/`；签名基于 **解码后的规范 key**，避免编码差异导致验签失败。
- `过期时间` 为 `0` 表示永久；其余为 Unix 秒。
- 可选 `?download=1` 强制 `Content-Disposition: attachment`，不参与签名。
- 文件路径禁止为空、`.`、`..`、以及 `_$flaredrive$/` 内部前缀。

### 3.2 签名算法

```text
key     = SHARE_SECRET（未设置时回退到 SHA-256("r2dav-share-v1:" + WEBDAV_PASSWORD)）
payload = canonicalPath + ":" + expires
sign    = base64url(HMAC-SHA256(key, payload)) + ":" + expires
```

- 与 AList 同构：签名覆盖“路径 + 过期时间”，`:0` 表示永久；URL-safe Base64 可保留 `=` 填充（与 AList 示例一致）。
- 使用 Web Crypto（Workers 原生支持）。
- 验签使用常量时间比较。
- `SHARE_SECRET` 建议通过 `openssl rand -base64 32` 生成，配置在 Cloudflare Pages 的加密变量中。
- 回退机制保证未配置新变量时也能工作；但生产环境必须在文档中要求设置 `SHARE_SECRET`。
- 轮换 `SHARE_SECRET` 会使所有已生成链接失效，这是 v1 的“全局撤销”方式。
- 不把 `WEBDAV_PASSWORD` 直接当 HMAC key，避免密钥复用。

### 3.3 创建链接 API

```http
POST /api/share
Authorization: Basic <WEBDAV_USERNAME:WEBDAV_PASSWORD>
Content-Type: application/json

{
  "path": "config/proxies.yaml",
  "expiresIn": 0
}
```

响应：

```json
{
  "url": "https://example.com/d/config/proxies.yaml?sign=...:0",
  "path": "config/proxies.yaml",
  "expiresAt": null
}
```

规则：

- 仅允许文件，不允许目录（返回 `400 IS_DIRECTORY`）。
- 文件不存在返回 `404`；内部前缀返回 `400`。
- `expiresIn`：`0`/`null` 永久；正整数秒；上限 365 天。
- 复用 WebDAV 的 Basic Auth；`WEBDAV_PUBLIC_READ` 不影响“创建链接”的权限。
- 增加同源校验（`Origin` / `Sec-Fetch-Site`），防止跨站表单触发；响应 `Cache-Control: no-store`。
- 可选：`GET /api/share` 返回 `{ enabled, secretSource: "env" | "password" }` 供 UI 提示，不要返回密钥。

UI 调用示例：

```ts
const res = await fetch("/api/share", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ path, expiresIn }),
});
```

> 浏览器已缓存同源 Basic Auth 凭据，正常情况下 `fetch` 会自动携带；若未携带，服务端返回 `401` 和 `WWW-Authenticate`，浏览器会弹出登录框后重试。实现后必须实测。

### 3.4 直链响应行为

| 场景 | 状态码 | 说明 |
| --- | --- | --- |
| 正常 GET/HEAD | `200` | 完整内容 |
| Range 请求 | `206` | 带 `Content-Range` |
| ETag / If-Modified-Since 命中 | `304` | 无 body |
| 缺少签名 | `401` | 不暴露文件是否存在 |
| 签名错误/路径被篡改 | `401` | 统一错误，避免枚举 |
| 签名过期 | `410` | 明确提示链接失效 |
| 文件不存在 | `404` |  |
| 目录 | `404` | 直链只面向文件 |
| 非法路径 / 内部前缀 | `400` |  |
| Range 不可满足 | `416` |  |
| 非 GET/HEAD/OPTIONS | `405` |  |

响应头：

| Header | 值 |
| --- | --- |
| `Content-Type` | 推断后的 MIME，见 3.5 |
| `Content-Disposition` | 默认 `inline; filename*=UTF-8''...`；`download=1` 时为 `attachment` |
| `ETag` | `obj.httpEtag` |
| `Last-Modified` | `obj.uploaded.toUTCString()` |
| `Accept-Ranges` | `bytes` |
| `Content-Length` | 对象/Range 长度 |
| `Content-Range` | Range 请求时 |
| `Cache-Control` | `private, max-age=60, must-revalidate`（避免 CDN 缓存已过期/已撤销链接） |
| `Access-Control-Allow-Origin` | `*` |
| `Access-Control-Expose-Headers` | `Content-Length, Content-Type, Content-Range, Accept-Ranges, ETag, Last-Modified, Content-Disposition` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |

`OPTIONS` 返回 `204`，允许 `GET, HEAD, OPTIONS`，允许请求头 `Range, If-None-Match, If-Modified-Since`。

### 3.5 MIME 归一化（通用，不限于 YAML/ICS）

问题：浏览器和 WebDAV 客户端提供的 `Content-Type` 可能为空、为 `application/octet-stream` 或与扩展名不符；不能只针对 `.yaml`、`.ics` 做单点特判。

#### 设计原则

1. **集中式扩展名注册表**：维护完整的 `extension → MIME` 映射，覆盖文本、配置、日历、Office、图片、音视频、压缩包、字体、二进制等常见类别。推荐以 `mime-db` 为数据源生成精简映射，而不是手写少量类型。
2. **单一来源**：用脚本从 `mime-db` 生成 `src/shared/mime-map.ts` 与 `functions/lib/mime-map.ts`（两份内容一致，避免前后端不一致）；生成文件带 “do not edit” 注释，CI 检查是否需要重新生成。
3. **解析顺序**：
   - 目录对象 → `application/x-directory`；
   - 已知扩展名 → 映射表（对文本/配置/代码/日历类型尤其重要）；
   - 扩展名未知或没有扩展名 → R2 中已有的具体 MIME；
   - 仍无 → `application/octet-stream`。
4. **媒体类型优先**：对 `.ts`、`.m4v` 等有歧义的扩展名，如果 R2 中已有具体的 `video/*`、`audio/*`、`image/*` 类型，则保留该类型；否则按代码/文本处理（例如 `.ts` 默认 `text/plain`）。
5. **少而明确的覆盖表**：生成映射后，对兼容性敏感的类型做覆盖：
   - `.yaml` / `.yml` → `text/yaml`（比 `application/yaml` 对 Clash 等更稳）
   - `.ics` / `.ical` → `text/calendar`
   - `.conf` / `.cfg` / `.env` / `.ovpn` → `text/plain`
   - `.md` → `text/markdown`
   - 其余以 `mime-db` 为准。
6. **charset**：文本类（`text/*` 以及 `application/json`、`application/yaml`、`application/toml`、`application/xml`、`image/svg+xml` 等）补 `; charset=utf-8`；二进制类型不加。
7. **上传时归一化**：前端按 `file.type`（若为具体类型）或文件名推断设置 `content-type`；后端 `PUT` / multipart 创建时再兜底一次。
8. **旧对象只推断不重写**：`PROPFIND` 对已存在对象返回推断后的类型，保证图标/类型列正确；不批量改写 R2 元数据。

#### 覆盖类别（示例，非穷举）

| 类别 | 示例扩展名 | 结果 |
| --- | --- | --- |
| 文本/配置 | `.txt` `.log` `.md` `.yaml` `.yml` `.toml` `.ini` `.conf` `.env` `.properties` `.csv` `.tsv` `.xml` `.json` `.html` `.css` `.js` `.ts` `.sh` `.sql` `.diff` `.patch` | 对应 MIME + charset |
| 日历/联系人 | `.ics` `.ical` `.vcf` | `text/calendar` / `text/vcard` |
| 文档 | `.pdf` `.doc` `.docx` `.xls` `.xlsx` `.ppt` `.pptx` `.odt` `.ods` `.odp` `.epub` `.rtf` | 对应 MIME |
| 图片 | `.png` `.jpg` `.jpeg` `.gif` `.webp` `.avif` `.svg` `.bmp` `.ico` `.tif` `.tiff` `.heic` `.heif` | 对应 MIME |
| 音频 | `.mp3` `.m4a` `.aac` `.flac` `.wav` `.ogg` `.opus` `.wma` | 对应 MIME |
| 视频 | `.mp4` `.m4v` `.webm` `.mkv` `.mov` `.avi` `.wmv` `.flv` `.mpg` `.mpeg` | 对应 MIME |
| 压缩包 | `.zip` `.tar` `.gz` `.tgz` `.bz2` `.xz` `.7z` `.rar` `.zst` | 对应 MIME |
| 字体/二进制 | `.woff` `.woff2` `.ttf` `.otf` `.eot` `.wasm` `.apk` `.ipa` `.exe` `.dmg` `.iso` `.torrent` | 对应 MIME 或 `application/octet-stream` |
| 未知 | 任意 | R2 具体类型 → 否则 `application/octet-stream` |

#### 安全与 Content-Disposition

直接链接默认根据类型选择 `inline` 或 `attachment`，避免用户上传的主动内容在站点同源下执行脚本：

- **inline 安全列表**：`text/plain`、`text/markdown`、`text/csv`、`text/calendar`、`text/vcard`、`text/yaml`、`application/json`、`application/yaml`、`application/toml`、`image/*`（不含 SVG）、`audio/*`、`video/*`、`application/pdf`。
- **强制 attachment**：`text/html`、`application/xhtml+xml`、`image/svg+xml`、`text/xml`、`application/xml`、`application/javascript`、Office 文档、压缩包、字体、未知二进制。
- `?download=1` 对所有类型强制 `attachment`。
- 所有响应带 `X-Content-Type-Options: nosniff`。
- 若需要在浏览器内预览 HTML/SVG，应放在独立源或使用 sandbox，不直接在 r2dav 同源内联。

> 该逻辑适用于 `.yaml`、`.ics`，也同样适用于 `.json`、`.md`、`.pdf`、`.png`、`.zip`、`.html`、`.svg`、`.woff2`、未知扩展名等所有文件。

注意：`/d` 使用上述安全策略；`/webdav` 为兼容 WebDAV 协议保持原有响应，不在 v1 强行改写。前端“打开”HTML/SVG 等主动内容时改为下载或 sandbox 预览，避免在同源直接执行。

### 3.6 安全与兼容性

安全：

- 链接是 bearer token：拿到链接即可读；UI 必须提示“任何获得链接的人都能访问”。
- 默认永久，适合订阅；提供 1 小时/1 天/7 天/30 天选项。
- 不记录完整签名到日志/分析；不把签名写入 `Referer`（设置 `no-referrer`）。
- 生产建议对 `/d/*` 配置 Cloudflare WAF 速率限制。
- 撤销采用业界常见的 **无状态签名 URL** 模型（类似 S3 presigned URL）：链接本身带过期时间，服务端不保存链接状态；需要“全部失效”时轮换 `SHARE_SECRET`。单个链接的精确撤销需要额外状态（R2/KV/D1 索引），列为 P2，不作为 v1 目标。
- 不削弱现有 WebDAV 认证；`WEBDAV_PUBLIC_READ=1` 的语义保持不变。
- 若生产域名启用了 Cloudflare Access，必须把 `/d/*` 排除，否则 Clash/日历会被 Access 拦截。

兼容：

- `/webdav/<path>` 路径、Basic Auth、`WEBDAV_PUBLIC_READ` 全部保持。
- 现有缩略图路径 `_$flaredrive$/thumbnails/...` 保持，不迁移。
- 现有前端打开文件仍走 `/webdav`；只有“分享/直链”走 `/d`。
- 新路由只增加 `/d/*` 和 `/api/share`，不影响现有客户端。

---

## 4. 前端方案

### 4.1 信息架构

```text
App
├── Header（品牌 / 搜索 / 上传 / 新建 / 更多 / 主题）
├── Breadcrumb + 工具栏（路径 / 数量 / 视图切换 / 排序 / 刷新）
├── FileExplorer
│   ├── FileTable（桌面）
│   ├── FileGrid（桌面网格 / 移动卡片）
│   └── EmptyState / LoadingState
├── SelectionBar（多选时）
├── ContextMenu（右键 / 长按 / 行尾菜单）
├── UploadManager / ProgressDialog
├── TextEditorDrawer
└── Dialogs（新建 / 重命名 / 删除确认 / 分享 / 移动 / 详情）
```

### 4.2 响应式布局

断点建议：

- `< 600px`：手机，卡片列表 + 底部 FAB + 底部多选栏；对话框全屏。
- `600–900px`：平板，网格/紧凑列表；工具栏折叠。
- `> 900px`：桌面，表格 + 行内操作 + 顶部工具栏；隐藏 FAB。

桌面示意：

```text
┌──────────────────────────────────────────────────────────────┐
│ r2dav    [搜索………………]   [刷新] [上传] [新建文件夹] [⋯]      │
├──────────────────────────────────────────────────────────────┤
│ 🏠 / config / proxies.yaml       12 项   [列表|网格] [排序▾] │
├──────────────────────────────────────────────────────────────┤
│ ☐ 名称 ▲          类型     大小      修改时间       操作     │
│ ☐ 📁 assets       文件夹    —         2026-10-20    ⋯        │
│ ☐ 📄 proxies.yaml YAML      1.8 KB    2026-10-20    ⋯        │
└──────────────────────────────────────────────────────────────┘
```

移动示意：

```text
┌──────────────────────────┐
│ r2dav            [🔍][⋯] │
│ 🏠 / config              │
│ [搜索…………………]          │
├──────────────────────────┤
│ 📁 assets           >    │
│ 📄 proxies.yaml  1.8 KB  │
│ 📄 feed.ics      2.1 KB  │
│                          │
│                    [＋]  │
└──────────────────────────┘
```

要求：

- 不再使用固定 `minWidth: 160px` 的日期列；桌面表格按内容伸缩，窄屏隐藏次要列。
- 头部、面包屑、工具栏在移动端可换行/横向滚动。
- 所有图标按钮有 `aria-label`，触控目标 ≥ 44px。
- 拖拽上传覆盖层覆盖内容区，显示目标目录。

### 4.3 排序与视图（修复死菜单）

排序状态：

```ts
type SortField = "name" | "modified" | "size" | "type";
type SortDirection = "asc" | "desc";
interface SortState {
  field: SortField;
  direction: SortDirection;
  foldersFirst: boolean; // 默认 true
}
```

规则：

- 文件夹始终优先（可配置），文件夹之间也按当前字段排序。
- 名称使用 `Intl.Collator(undefined, { numeric: true, sensitivity: "base" })`，支持中文/数字自然排序。
- 相同值用名称做稳定兜底。
- 搜索过滤在排序前执行。
- `Sort by` 菜单：四个字段 + 当前项打勾；点击当前字段切换升降序；显示 ▲/▼。
- 桌面表头也可点击排序。
- 排序状态持久化到 `localStorage`（如 `r2dav:sort`）。

视图状态：

```ts
type ViewMode = "list" | "grid";
```

- 桌面默认 `list`，移动默认 `grid`（卡片），但用户手动切换后持久化。
- `View as` 菜单提供列表/网格；工具栏提供图标切换。
- 网格使用 `repeat(auto-fill, minmax(180px, 1fr))`，不做固定列数。
- 持久化键：`r2dav:view`。

### 4.4 选择与操作

- 行首复选框；点击行打开（文件夹进入、文件预览/新标签打开）。
- Shift + 点击范围选择；Ctrl/Cmd + 点击追加；Ctrl/Cmd + A 全选；Esc 清空。
- 右键 / 长按 / 行尾 `⋯` 打开上下文菜单：
  - 打开 / 预览
  - 下载
  - 分享（生成直链）
  - 重命名
  - 复制 / 剪切 / 粘贴
  - 复制路径
  - 详情
  - 删除
- 多选底部/浮动工具栏：计数、下载、分享（仅单文件）、移动、删除、取消。
- 文件夹：下载、分享禁用并给出提示（P2 再做 ZIP/目录分享）。
- 删除使用确认对话框，列出文件名；多文件用 `Promise.allSettled` 并汇总失败。
- 移动/复制优先实现“复制/剪切 + 粘贴到当前目录”，复用现有 `COPY`/`MOVE`，目标目录选择器可作为 P2。

### 4.5 路由与状态

- 使用轻量 hash 路由：`#/`、`#/config`、`#/config/sub`。
- 每段 `encodeURIComponent`；解析后得到 `cwd`。
- 监听 `hashchange`，支持前进/后退；刷新后保持目录。
- 无效路径回退到根目录并提示。
- 不引入 react-router；用一个 `useHashPath` hook。
- 目录数据用 `useDirectory(cwd)`：
  - `AbortController` 取消过期请求；
  - 保留旧列表同时显示加载态，避免闪烁；
  - 暴露 `refresh()`、`loading`、`error`；
  - 401/403/404/5xx 映射为可读错误。
- 偏好（主题/视图/排序）用 `PreferencesContext` + localStorage。
- 通知用 `NotificationContext`（Snackbar 队列，支持 success/error/info）。

### 4.6 对话框与编辑器

用 MUI `Dialog` 替换 `window.prompt` / `window.confirm`：

| 对话框 | 功能 |
| --- | --- |
| `CreateFolderDialog` | 名称校验（非空、不含 `/`）、错误提示 |
| `RenameDialog` | 预填原名、校验、`412` 冲突提示 |
| `ConfirmDeleteDialog` | 文件列表、不可恢复提示、执行中状态 |
| `ShareDialog` | 过期时间、生成、复制、二维码、打开、失效说明 |
| `FileDetailsDialog` | 路径、大小、类型、修改时间、ETag、复制路径 |
| `MoveDialog`（P2） | 目录选择器 |

`ShareDialog` 细节：

- 过期选项：永久（默认）、1 小时、1 天、7 天、30 天、自定义。
- 生成后显示完整 URL + 复制按钮 + 二维码（新增 `qrcode.react`）。
- 显示“任何获得链接的人均可访问，直到过期或密钥轮换”。
- 目录/多选时禁用，并提示“仅支持单个文件”。
- 失败时显示具体原因（401/404/503/密钥未配置）。
- 移动端保留 `navigator.share` 作为次级按钮，桌面以复制为主。

`TextEditorDrawer`（由 TextPad 升级）：

- 新建文本文件：文件名 + 内容，按扩展名推断 MIME。
- 编辑现有文本文件：右键/双击文本文件，GET 内容后载入；保存走 PUT。
- 支持 `.yaml`、`.yml`、`.json`、`.ics`、`.txt`、`.md`、`.conf`、`.toml` 等。
- 移动端全屏，桌面宽度自适应（不再固定 400px）。
- 未保存关闭时确认；超过 2MB 的文本建议下载后用本地编辑器。
- 可选简单预览（图片/视频/PDF），P1 可先只做文本编辑。

### 4.7 主题、无障碍与 PWA

- 主题：跟随系统 + 手动切换，持久化 `r2dav:theme`；MUI `palette.mode`。
- 深色模式下修正拖拽遮罩、边框、缩略图背景。
- 语义化表格、`aria-current` 面包屑、`aria-live` 加载/错误、对话框焦点管理。
- 支持 `prefers-reduced-motion`。
- 修复 `public/manifest.json`：名称 `r2dav`、正确的 favicon/图标、主题色 `#f38020`。
- 修复 `public/index.html` 标题、描述、缺失图标引用。
- 不引入 Service Worker（避免缓存受保护内容）。

---

## 5. 可靠性与后端修复

| 问题 | 修复 |
| --- | --- |
| 列表解码 | `decodeURI` → `decodeURIComponent`；对 href 逐段解码 |
| 上传失败被当成功 | `xhrFetch` / `multipartUpload` 检查 `response.ok`，非 2xx 抛出带状态码的错误 |
| 分片重试不完整 | 对 429/5xx/网络错误重试；非可重试错误立即失败 |
| 队列卡死 | 任务加唯一 `id`；`.finally` 中清空 `taskProcessing`；支持失败重试/取消 |
| 进度对话框 | 移除无人使用的 Downloads 页签，或实现下载任务；v1 建议只保留 Uploads |
| 新建目录静默失败 | 返回结果/抛错，成功后才刷新 |
| 重命名冲突 | MOVE 的 `Overwrite: F`，412 时提示“目标已存在” |
| 删除部分失败 | `allSettled` + 汇总失败项 |
| 401/403 | 明确提示“凭据错误/WebDAV 未启用”，而不是笼统 Failed to fetch |
| 大目录 | 先做 memo/懒加载缩略图；P2 再虚拟滚动 |
| 上传覆盖 | 可选：上传前 HEAD 检查并确认覆盖 |
| 文件夹拖拽 | P1：支持 `webkitGetAsEntry` 递归上传，保留目录结构 |
| 缩略图孤儿 | 记录为已知问题；P2 做引用检查/清理任务 |

后端同时改进：

- 抽取 `functions/lib/auth.ts`（Basic Auth、UTF-8、常量时间比较）。
- 抽取 `functions/lib/share.ts`（签名/验签/路径校验）。
- 抽取 `functions/lib/mime.ts`（扩展名推断）。
- `webdav/get.ts`：补 ETag/Last-Modified/Accept-Ranges/Range 206/304；保留缩略图长缓存。
- `webdav/head.ts`：返回与 GET 一致的元数据。
- `webdav/propfind.ts`：MIME 兜底；保持 `fd:thumbnail` 命名空间不变。
- `webdav/put.ts` / `post.ts`：MIME 兜底。
- `webdav/[[path]].ts`：改用共享 auth helper，行为不变。
- 清理根目录旧 `Main.tsx`、`TextPadDrawer.tsx`。

---

## 6. 项目独立化（r2dav）

### 6.1 当前状态

- 当前 `origin` 是 `MegaSuite/FlareDrive`，它是 `longern/FlareDrive` 的 fork。
- 没有配置 `upstream` remote。
- GitHub 上 fork 关系仍然存在；单纯改名仍会显示 “forked from longern/FlareDrive”。

**已确认采用方案 B：新建非 fork 仓库 `MegaSuite/r2dav`，推送现有历史，重新创建 Cloudflare Pages 项目。**

- 不复用旧 fork 的 GitHub 关联，避免继续显示 “forked from longern/FlareDrive”。
- 旧 fork 和旧 Pages 项目保留到新项目验证通过；删除/归档旧仓库前必须再次得到用户确认。
- 如果 GitHub 新建仓库或 Pages 重连遇到平台限制，再回退到“重命名 fork + 保留旧 Pages 项目”的保底方案。

### 6.2 品牌与文档改动

| 位置 | 改动 |
| --- | --- |
| `package.json` | `name: "r2dav"`、版本、description、repository |
| `public/index.html` | `<title>r2dav</title>`、description、theme-color |
| `public/manifest.json` | `name`/`short_name` 改为 r2dav，修复图标 |
| `src/Header.tsx` | 品牌文字/图标改为 r2dav |
| `README.md` | 重写：功能、部署、环境变量、直链用法、安全、限制、致谢 |
| `LICENSE` | 保留原 MIT 版权声明，增加衍生项目说明 |
| `NOTICE` / README 致谢 | 注明基于 FlareDrive（Siyu Long）与 r2-webdav |
| `_$flaredrive$/` | **保留**，避免缩略图迁移；文档说明内部标识不变 |
| `AGENTS.md` | 保持本地忽略，不纳入仓库 |

新增/更新文档：

- `.dev.vars.example`：`WEBDAV_USERNAME`、`WEBDAV_PASSWORD`、`WEBDAV_PUBLIC_READ`、`SHARE_SECRET`。
- `.nvmrc` / `engines`：Node 20。
- README 中给出 Clash `proxy-providers` 与日历订阅示例。
- 明确限制：WebDAV 大文件 ≥128MB 需走 Web UI 分片上传；直链仅文件；无单链接撤销。

### 6.3 仓库与 Pages 迁移顺序（方案 B）

1. 所有功能完成并验证；保留旧 `MegaSuite/FlareDrive` 和旧 Pages 项目 `flaredrive` 不动。
2. 更新品牌、文档、包名，提交到当前 `main`。
3. 新建非 fork 仓库 `MegaSuite/r2dav`：
   - 用 `gh repo create MegaSuite/r2dav --public` 创建空仓库（不要用 fork）。
   - 将本地 `origin` 指向新仓库，推送 `main` 和 tag：
     ```bash
     git remote set-url origin https://github.com/MegaSuite/r2dav.git
     git push -u origin main --tags
     ```
   - 确认 `git remote -v` 只有 `r2dav`，没有 `upstream`；GitHub 页面不再显示 fork 父仓库。
4. 新建 Cloudflare Pages 项目 `r2dav`：
   - 连接 GitHub 仓库 `MegaSuite/r2dav`，生产分支 `main`。
   - Framework preset 选择 None；构建命令 `npm run build`；输出目录 `build`。
   - 添加环境变量：沿用旧的 `WEBDAV_USERNAME`、`WEBDAV_PASSWORD`；新增加密变量 `SHARE_SECRET`；按需添加 `WEBDAV_PUBLIC_READ`。
   - 添加 R2 绑定：变量名 `BUCKET`，指向原 R2 桶。若控制台提示绑定需通过 `wrangler.toml` 管理，使用最小配置并先验证，不要覆盖已有环境变量。
   - 首次部署后记下实际 `*.pages.dev` 域名。
5. 自定义域名：先把 `dav.fooa.de` 从旧 Pages 项目解绑，再绑定到新项目 `r2dav`；等待 DNS/证书生效，验证 HTTPS 和直链。
6. 在新项目上验证 `/`、`/webdav`、`/d/...`、分享对话框、排序/视图、上传、`https://dav.fooa.de`。
7. 验证通过后，按用户确认删除旧 fork `MegaSuite/FlareDrive` 和旧 Pages 项目 `flaredrive`。
8. 打 tag，更新 README 中的部署链接和仓库地址。
9. 本地目录 `/root/FlareDrive` 的重命名放到最后，避免当前会话工作目录失效；可手动 `mv` 为 `/root/r2dav`。

### 6.4 Phase 6 完成记录

- 新仓库：`MegaSuite/r2dav`（非 fork）。
- 新 Pages 项目：`r2dav`，生产域名 `https://r2dav.pages.dev`，自定义域名 `https://dav.fooa.de`（活动，SSL 已启用）。
- R2 绑定：`BUCKET` → `flaredrive` 桶。
- 环境变量：`WEBDAV_USERNAME`、`WEBDAV_PASSWORD`、`SHARE_SECRET`（Production）。
- 生产验证：首页、PROPFIND/WebDAV、上传/删除、分享对话框、`.yaml` 直链、`.ics` 直链、自定义域名直链均通过。
- 旧 Pages 项目 `flaredrive` 已删除；旧 GitHub 仓库 `MegaSuite/FlareDrive` 已删除。
- 自动部署：从 `MegaSuite/r2dav` 的 `main` 分支构建并发布。

---

## 7. 实施阶段

### Phase 0：基线、部署确认与安全准备（P0）

- [ ] 创建分支 `feat/r2dav`。
- [ ] `npm ci`、`npx tsc --noEmit`、`CI=true npm run build` 跑通基线。
- [ ] 记录当前 `/webdav` 的 PROPFIND/GET/PUT 行为作为回归基线。
- [ ] 通过 browser-skill 确认 Pages 项目、环境变量、R2 绑定（只读，不修改值）。
- [ ] 新增 `.dev.vars.example`、`.nvmrc`；确认 `.gitignore` 忽略 `.dev.vars`、`.wrangler`。
- [ ] 生成 `SHARE_SECRET`（不提交），准备在部署阶段写入 Pages。

**验收**：基线构建通过；部署配置有记录；仓库无新密钥泄露。

### Phase 1：签名直链后端（P0）

- [ ] 新增 `functions/lib/share.ts`：HMAC 签名、验签、路径规范化、常量时间比较、过期判断。
- [ ] 新增 `functions/lib/auth.ts`：Basic Auth、UTF-8、401 响应；`webdav/[[path]].ts` 复用。
- [ ] 新增 `scripts/gen-mime.mjs` + `mime-db` devDependency：生成 `src/shared/mime-map.ts` 与 `functions/lib/mime-map.ts`，并加 CI 一致性检查。
- [ ] 新增 `functions/lib/mime.ts`：通用 MIME 解析、覆盖表、charset、媒体类型优先、inline/attachment 安全策略。
- [ ] 新增 `functions/api/share.ts`：POST 创建链接，校验文件/目录/内部路径/过期时间/同源。
- [ ] 新增 `functions/d/[[path]].ts`：GET/HEAD/OPTIONS、CORS、Range、ETag/304、Content-Disposition、通用 MIME。
- [ ] 改造 `functions/webdav/get.ts`、`head.ts`、`propfind.ts`、`put.ts`、`post.ts`（MIME/Range/ETag）。
- [ ] 增加 `scripts/verify-share.sh`（或 `.mjs`）自动跑 curl 矩阵，凭据从环境变量读取。

**验收**：

- 用 Basic Auth 创建永久/限时链接成功。
- 无认证 GET 返回文件；MIME 不限于示例：`.yaml`、`.ics`、`.json`、`.md`、`.pdf`、`.png`、`.zip`、`.html`、`.svg`、未知扩展名均按 3.5 规则返回。
- 无签名/篡改/路径替换 → 401；过期 → 410；Range → 206；ETag → 304。
- 目录、内部前缀、`..` 被拒绝。
- 现有 WebDAV 全部方法回归通过。

### Phase 2：前端基础设施与 bug 修复（P0/P1）

- [ ] 新增 `src/app/types.ts`、`api.ts`、`mime.ts`、`router.ts`、`preferences.tsx`、`notifications.tsx`。
- [ ] `src/app/mime.ts` 使用生成的通用映射：MimeIcon、类型列、文本编辑器可编辑判断、上传 Content-Type 全部复用。
- [ ] `fetchPath` 改为 `decodeURIComponent`，补 401/403/5xx 错误映射。
- [ ] `transfer.ts`：检查 `response.ok`、MIME 归一化、分片错误重试。
- [ ] `transferQueue.tsx`：任务 `id`、失败清空、重试/取消、避免竞态。
- [ ] `createFolder` / `rename` / `delete` 返回明确结果。
- [ ] 删除根目录旧 `Main.tsx`、`TextPadDrawer.tsx`。
- [ ] `ProgressDialog` 移除空的 Downloads 页签（或实现下载任务）。

**验收**：现有浏览/上传/下载/新建/删除/重命名不回归；失败上传不再显示完成；失败后队列可继续。

### Phase 3：响应式界面与排序/视图（P0）

- [ ] 重构 `Header`：品牌、搜索、刷新、上传、新建、更多、主题。
- [ ] 新增 `Breadcrumb`、`FileTable`、`FileGrid`（桌面网格/移动卡片）、`SortMenu`、`ViewToggle`。
- [ ] 实现排序状态机 + localStorage；表头点击排序。
- [ ] 实现列表/网格切换 + localStorage；默认值按断点。
- [ ] 实现选择模型（单选/多选/Shift/Ctrl+A/Esc）。
- [ ] 实现上下文菜单与行尾操作菜单。
- [ ] 实现多选工具栏（桌面浮动、移动底部）。
- [ ] 响应式调整：隐藏次要列、面包屑滚动、移动端 FAB、全屏对话框。
- [ ] 空状态、加载骨架、搜索无结果状态。

**验收**：360/768/1440 三种宽度可用；`Sort by` 四个字段和升降序全部生效并在刷新后保留；`View as` 生效并保留；无死菜单。

### Phase 4：分享、编辑器与批量操作（P0/P1）

- [ ] `ShareDialog`：过期选项、创建、复制、二维码、打开、错误提示。
- [ ] 引入 `qrcode.react`；保留 `navigator.share` 作为移动端次级入口。
- [ ] 单文件分享入口（行菜单、右键、多选单选）；目录/多选禁用提示。
- [ ] `TextEditorDrawer`：新建/编辑文本文件，扩展名推断 MIME，未保存确认。
- [ ] 文本预览/编辑入口：`.yaml`、`.ics`、`.json`、`.md` 等。
- [ ] 复制/剪切/粘贴（COPY/MOVE）与错误提示。
- [ ] `FileDetailsDialog`（可选）。

**验收**：从 UI 生成永久和 1 小时链接，复制后无认证可下载；二维码可扫；编辑 `proxies.yaml`/`feed.ics` 后直链内容更新；移动/复制成功。

### Phase 5：体验打磨与可靠性（P1）

- [ ] 新建/重命名/删除确认对话框，替换 `window.prompt/confirm`。
- [ ] Snackbar 队列、全局错误边界、友好错误映射。
- [ ] 上传：文件夹拖拽、覆盖确认、失败重试、进度汇总。
- [ ] 深色模式 + 系统跟随。
- [ ] PWA/manifest/index.html/图标修复。
- [ ] 无障碍：aria、键盘、焦点、对比度、减少动画。
- [ ] 性能：行组件 memo、缩略图懒加载；大目录按需虚拟化（P2）。
- [ ] 可选：全库搜索、虚拟滚动、i18n（P2）。

**验收**：无明显控制台错误；键盘可完成浏览/选择/删除；深色模式可读；移动端触控目标合格；上传失败有明确提示。

### Phase 6：品牌化、文档与独立发布（P0）

- [ ] 更新 `package.json`、`index.html`、`manifest.json`、Header 品牌。
- [ ] 重写 README：功能、部署、环境变量、直链 API、Clash/日历示例、安全与限制、致谢。
- [ ] 添加 `NOTICE`/版权说明，保留 MIT。
- [ ] 更新 `.dev.vars.example`、`.nvmrc`；可选 GitHub Actions CI（typecheck + build）。
- [ ] 新建非 fork 仓库 `MegaSuite/r2dav`，推送 `main` 和 tag；更新 `origin`，确认无上游 remote。
- [ ] 新建 Cloudflare Pages 项目 `r2dav`，配置构建、环境变量、`BUCKET` 绑定，添加 `SHARE_SECRET`，完成首次部署。
- [ ] 生产环境回归：首页、WebDAV、直链、分享、排序/视图、上传。
- [ ] 验证通过后，再与用户确认是否归档/删除旧 fork 和旧 Pages 项目。
- [ ] 打 tag，记录发布说明。

**验收**：新仓库 `MegaSuite/r2dav` 为非 fork；新 Pages 项目可访问；直链在真实域名上工作；README 可让新用户独立部署；旧仓库/旧 Pages 项目处置已获用户确认。

---

## 8. 验收与测试

### 8.1 本地命令

```bash
npm ci
npx tsc --noEmit
CI=true npm run build

# 本地全栈（需要 Wrangler，按实际版本调整参数）
npx wrangler pages dev build --r2 BUCKET --port 8788

# 直链冒烟测试
BASE_URL=http://127.0.0.1:8788 \
WEBDAV_USERNAME=... WEBDAV_PASSWORD=... \
./scripts/verify-share.sh
```

### 8.2 直链 curl 矩阵

| # | 场景 | 期望 |
| --- | --- | --- |
| 1 | Basic Auth POST `/api/share` | 200，返回 URL |
| 2 | 无认证 GET 返回 URL | 200，内容一致 |
| 3 | `.yaml` 直链 | `text/yaml; charset=utf-8` |
| 4 | `.ics` 直链 | `text/calendar; charset=utf-8`，body 含 `BEGIN:VCALENDAR` |
| 5 | HEAD | 200，无 body，有 ETag/Last-Modified |
| 6 | `Range: bytes=0-99` | 206 + `Content-Range` + 100 字节 |
| 7 | `If-None-Match` | 304 |
| 8 | 篡改签名 | 401 |
| 9 | 用 A 的签名访问 B | 401 |
| 10 | `expiresIn=1`，等待 2 秒 | 410 |
| 11 | 无 `sign` | 401 |
| 12 | 目录创建分享 | 400 |
| 13 | `_$flaredrive$/...` | 400/404 |
| 14 | `../` 路径 | 400 |
| 15 | `OPTIONS` + Origin | 204 + CORS 头 |
| 16 | `?download=1` | `Content-Disposition: attachment` |
| 17 | 旧 `/webdav` PROPFIND + Basic Auth | 207，行为不变 |
| 18 | 旧 WebDAV PUT/MOVE/DELETE | 正常 |
| 19 | `WEBDAV_PUBLIC_READ=1` 时 `/webdav` GET | 无需认证，行为不变 |

#### 8.2.1 MIME 子矩阵（不限于示例类型）

| 文件 | 期望 |
| --- | --- |
| `config.yaml` / `CONFIG.YAML` | `text/yaml; charset=utf-8` |
| `feed.ics` | `text/calendar; charset=utf-8` |
| `data.json` | `application/json; charset=utf-8` |
| `README.md` | `text/markdown; charset=utf-8` |
| `manual.pdf` | `application/pdf`，默认 inline |
| `photo.png` | `image/png`，默认 inline |
| `archive.zip` | `application/zip`，默认 attachment |
| `page.html` | `text/html`，强制 attachment + `nosniff` |
| `icon.svg` | `image/svg+xml`，强制 attachment |
| `font.woff2` | `font/woff2`，attachment |
| `script.ts`（上传时无 MIME） | `text/plain; charset=utf-8` |
| `video.ts`（存储为 `video/mp2t`） | 保留 `video/mp2t` |
| `noext`（存储为 `image/png`） | `image/png` |
| `unknown.xyz`（存储为 `application/pdf`） | `application/pdf` |
| `unknown.xyz`（无存储类型） | `application/octet-stream` |
| `config.yaml?download=1` | `Content-Disposition: attachment` |

### 8.3 UI 验收矩阵

- 视口：`360×800`、`768×1024`、`1440×900`。
- 排序：名称/时间/大小/类型 × 升/降；文件夹优先；刷新后保留。
- 视图：列表/网格切换；刷新后保留；移动端默认卡片。
- 路由：`#/config` 刷新保持；前进/后退；无效路径回退。
- 选择：单击、Ctrl/Cmd、Shift 范围、全选、Esc、右键、长按。
- 操作：新建/重命名/删除/复制/剪切/粘贴/详情。
- 分享：永久/1 小时；复制；二维码；打开；错误提示。
- 编辑器：新建/编辑多种文本类型（`.yaml`、`.json`、`.md`、`.conf`、`.ics` 等），保存后直链更新；未保存确认。
- 类型展示：图片/视频/音频/PDF/压缩包/日历/代码等图标和类型列正确；未知类型有兜底图标。
- 上传：小文件、>100MB 分片、图片缩略图、拖拽文件夹、失败重试。
- 主题：浅色/深色/系统跟随；刷新保留。
- 无障碍：Tab 顺序、aria-label、对话框焦点、对比度。
- 控制台无 error；`tsc`/build 无错误。

### 8.4 部署验收

- 推送 `main` 后 Pages 自动构建成功。
- `SHARE_SECRET` 已配置（或在 UI 中明确提示未配置）。
- 生产域名上创建链接并用 `curl` 无认证拉取成功。
- 真实 Clash 客户端或等价 curl 请求可读取 YAML。
- 日历订阅 URL 返回 `text/calendar` 且内容完整。
- 旧 WebDAV 客户端仍可连接。
- 仓库改名/迁移后自动部署仍正常。

---

## 9. 风险与回滚

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 仓库改名/迁移导致 Pages 集成断开 | 无法自动部署 | 先验证再删除旧项目；必要时重连 Git；保留旧仓库直到新部署成功 |
| 新增 `wrangler.toml` 覆盖控制台绑定 | R2/环境变量失效 | 不添加真实 `wrangler.toml`；只提供 example；绑定继续由控制台管理 |
| `SHARE_SECRET` 未设置 | 使用密码派生 key；换密码导致链接失效 | 文档标红要求配置；UI 提示 secretSource |
| 签名链接泄露 | 任何持有者可读 | 默认提示风险；支持过期；轮换 secret；WAF 限速 |
| CDN 缓存过期链接 | 过期后仍可访问 | 使用 `private` 缓存 + 短 max-age + 重新验证 |
| MIME 推断错误 | 各类客户端解析/预览失败（不只日历） | 通用映射 + 覆盖表 + 歧义扩展名策略 + MIME 子矩阵 + 真实客户端验证 |
| Basic Auth 未随 `/api/share` 发送 | 分享按钮 401 | 实测；401 时提示重新登录；必要时引导先访问 `/webdav` 触发认证 |
| Cloudflare Access 拦截 `/d/*` | Clash/日历失败 | 文档说明；Access 策略排除 `/d/*` |
| 大目录渲染卡顿 | 移动端体验差 | memo/懒加载；P2 虚拟滚动 |
| 删除缩略图孤儿 | 存储浪费 | 记录为已知问题；P2 引用检查/清理 |
| 多文件下载被浏览器拦截 | 下载不完整 | 顺序触发 + 提示；P2 做 ZIP |
| fork 关系仍在 | 不符合“独立” | 已确认采用方案 B：新建非 fork 仓库；旧仓库删除需再次确认 |

回滚策略：

- 所有改动在功能分支完成；合并前保留当前生产部署。
- 若直链路由异常，可单独回滚 `/d` 和 `/api/share`，不影响 WebDAV。
- 若改名/迁移失败，GitHub 重命名可改回；Pages 可重连旧仓库。
- 泄露风险时立即轮换 `SHARE_SECRET`（所有链接失效）。

---

## 10. 已确认决策与待确认事项

### 10.1 已确认

| # | 决策 |
| --- | --- |
| 1 | 采用方案 B：新建非 fork 仓库 `MegaSuite/r2dav`，不复用 fork 关联。 |
| 2 | 新建独立的 Cloudflare Pages 项目 `r2dav`，不复用旧项目名。 |
| 3 | 分享链接有效期做成 **可选择项**：永久、1 小时、1 天、7 天、30 天、自定义；默认永久。 |
| 4 | 撤销采用业界常见的无状态签名 URL 模型：链接带过期时间，服务端不保存状态；需要全部失效时轮换 `SHARE_SECRET`。v1 不做单链接精确撤销。 |
| 5 | 直链使用独立 `/d/*` 路由与 HMAC 签名，不削弱 `/webdav` 的 Basic Auth；AList 分析结论已写入 1.4/1.5。 |
| 6 | v1 不做文件夹分享/ZIP，只分享单个文件。 |
| 7 | UI 先保持英文，不做中英切换。 |
| 8 | 新 Pages 项目绑定自定义域名 `dav.fooa.de`（从旧项目迁移）。 |
| 9 | 新项目验证通过后，删除旧 fork `MegaSuite/FlareDrive` 和旧 Pages 项目 `flaredrive`。 |

### 10.2 后续可选（不阻塞 v1）

1. 文件夹分享/ZIP。
2. 中英切换。
3. 单链接精确撤销（需要 R2/KV/D1 状态）。
4. 更细的 UI 主题/密度配置。

---

## 11. 完成定义（Definition of Done）

- [ ] P0 全部完成：签名直链、分享 UI、排序/视图、响应式布局、生产部署。
- [ ] P1 主体完成：路由、对话框、右键菜单、编辑器、上传可靠性、深色模式、错误处理。
- [ ] `npx tsc --noEmit` 与 `CI=true npm run build` 通过。
- [ ] 直链 curl 矩阵全部通过；`.yaml`/`.ics` 在真实域名上可被无认证读取。
- [ ] 旧 WebDAV 功能无回归。
- [ ] 360/768/1440 三档 UI 验收通过；`Sort by`/`View as` 不再失效。
- [ ] README 可指导新用户独立部署；环境变量、直链 API、安全限制写清楚。
- [ ] 新仓库 `MegaSuite/r2dav` 为非 fork、无上游 remote；新 Cloudflare Pages 项目 `r2dav` 自动部署正常。
- [ ] 无密钥提交；MIT 归属保留；旧仓库/旧项目处置已获用户确认。
