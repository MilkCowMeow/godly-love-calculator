# 网站访问统计

启用日期：2026-10-19。

计算器和角色图鉴使用 Cloudflare Web Analytics，统计由 Cloudflare 后台查看，页面保持原有布局。可按页面路径筛选浏览量、访问次数、访问来源及设备等数据。

后台入口：https://dash.cloudflare.com/911dacf3899e45647be0f137f1f4022f/web-analytics

站点：`milkcowmeow.github.io`。仅在正式站的 `/godly-love-calculator` 路径下加载统计脚本；本地预览及离线文件跳过加载。统计从启用后开始积累。

`src/web_analytics.json` 保存公开的站点上报标识。管理用 API 令牌保留在本地忽略目录，构建与网页仅使用站点上报标识。重新构建两个页面时，构建脚本会自动保留统计接入。

## 验证

- 两页仅增加统计加载代码，原有内容保持一致。
- 验证正式域名、页面路径、本地与离线环境的加载条件。
- 发布后检查脚本加载与统计上报响应。
