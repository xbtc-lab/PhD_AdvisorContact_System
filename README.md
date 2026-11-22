# PhD_AdvisorContact_System · V2（申博轻邮重构版）

> **当前分支说明**：`refactor/v2` 为全新的**全栈 TypeScript 重构分支**，聚焦现代化 Web 体验、物理动效、AI-Native 结构化数据、定时网页监听与云函数控制面架构。
> 原 V1 Python 便携版代码完整保留在 `main` 分支，未作改动。

---

## 核心规划文档

关于 V2 版本的完整需求演进、视觉与动效规范（Family 触感 + 轻磨砂玻璃 & 克制微荧光 + `facehash`）、全栈技术选型（`React 19` + `Base UI` + `Motion` + `Vaul` + `Hono` + `Drizzle` + `PostgreSQL 17 / pg-boss / pgvector` + `Vercel AI SDK` + `Crawlee / Defuddle`）、云函数防逆向架构及分阶段路线图，请先阅读：

- [V2 需求、选型与架构设计总文档](docs/V2_ARCHITECTURE_AND_PRD.md)

---

## 当前仓库基础配置

- [mise.toml](mise.toml)：声明托管 `node 26` 与 `pnpm 10`
- [pnpm-workspace.yaml](pnpm-workspace.yaml)：Monorepo 工作区声明（`apps/*`、`packages/*`）
- [package.json](package.json)：统一工作区与 Docker 数据库脚本
- [docker-compose.yml](docker-compose.yml)：本地 PostgreSQL 17 + `pgvector` 单容器配置
- [.env.example](.env.example)：本地开发环境变量模板

---

## 本地开发环境准备（`mise` + WSL2 Docker）

```powershell
# 1. 信任并由 mise 自动安装 Node 26 与 pnpm 10
mise trust
mise install

# 2. 初始化本地环境变量（按需填入 DEEPSEEK_API_KEY）
Copy-Item .env.example .env

# 3. 待 WSL2 与 Docker Desktop 就绪后，一键启动本地 PostgreSQL 17
pnpm db:up
```
