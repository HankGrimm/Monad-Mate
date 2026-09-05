---
name: "aibuddy-docker-ops"
description: "Manage the AiBuddy (Monad Mate) Docker deployment: start/stop/rebuild the 6-container Hackathon stack, debug port/proxy issues (9999 frontend, 9998 API). Invoke when user asks to deploy, restart, stop, rebuild, or troubleshoot this project's Docker environment."
---

# AiBuddy Docker 运行环境管理

AiBuddy/Monad Mate 项目的完整 Docker 部署运维知识。

## 架构总览

集群名 `hackathon`，定义于 `backend/docker-compose.yml`，7 个容器统一 `Hackathon_` 前缀命名，共享网络 `Hackathon_network`：

| 容器 | 镜像 | 宿主机端口 | 用途 |
|---|---|---|---|
| Hackathon_landing | hackathon-landing:latest | **9999** → 3000 | Next.js 营销页（含 /api、/app 反向代理，唯一公网出口） |
| Hackathon_app | hackathon-app:latest | 无 | Next.js 应用界面（登录/匹配/打卡等，basePath=/app，容器内 3001） |
| Hackathon_api | hackathon-aibuddy:latest | **9998** → 9999 | FastAPI 后端（直连调试口） |
| Hackathon_worker | hackathon-aibuddy:latest | 无 | Celery worker |
| Hackathon_beat | hackathon-aibuddy:latest | 无 | Celery 定时任务 |
| Hackathon_db | postgres:16-alpine | 无 | Postgres 16 |
| Hackathon_redis | redis:7-alpine | 无 | Redis 7 |

## 端口与路由约定（关键）

- `http://localhost:9999` — 营销页（唯一出口）；`/api/*` → 容器内网 `http://api:9999/*`；`/app/*` → `http://app:3001/app/*`（浏览器全程只碰 9999）
- `http://localhost:9999/app` — 应用界面（登录/匹配/打卡），app 用 `basePath: '/app'` 避免与 landing 的 `/_next/` 资源冲突
- app 页面内 `fetch('/api/v1/...')` 相对路径 → 浏览器请求 9999/api/v1/* → landing 转发 → 后端 /v1/*（后端业务路由前缀是 /v1，不带 /api）
- `http://localhost:9999/api/docs` — Swagger 文档（经代理）
- `http://localhost:9998/docs` — Swagger 文档（后端直连，Postman/curl 用）
- 前端组件中 API_URL 必须用相对路径 `"/api"`，禁止写死 localhost/IP
- Next.js standalone 容器必须显式 `ENV PORT=xxx`，否则 server.js 默认监听 3000（app 踩过此坑）

## 关键配置文件

1. **根目录 `Dockerfile`** — 后端镜像（compose 的 build context 指向项目根，复用此文件）。`backend/Dockerfile` 是废弃旧文件，端口 8000，勿用
2. **`backend/docker-compose.yml`** — 集群定义。要点：
   - api 服务启动命令带 `--root-path=/api`（否则代理后 Swagger 页空白）
   - `environment` 里覆盖 `DATABASE_URL=postgresql://monadmate:monadmate@db:5432/monadmate` 和 `REDIS_URL=redis://redis:6379/0`（容器内 localhost 不可达，环境变量优先级高于 .env）
   - db/redis 有 healthcheck，api/worker/beat 等健康后才启动
   - db/redis 不映射宿主机端口（避免与本机服务冲突）
3. **`backend/.env`** — 应用配置（Monad 测试网私钥、合约地址、SECRET_KEY）。改动后 `docker compose up -d` 生效
4. **`landing/next.config.mjs`** — rewrites 规则 `/api/:path*` → `http://api:9999/:path*`
5. **数据卷 `Hackathon_postgres_data`** — 数据库持久化，`docker compose down` 不删除，`down -v` 才删

## 常用命令（在 backend/ 目录执行）

```bash
cd /home/xzh/Hackathon/AiBuddy/backend

docker compose up -d        # 启动/应用配置变更
docker compose stop         # 停止（保留容器）
docker compose start        # 再次启动
docker compose down         # 删除容器（保留数据卷）
docker compose down -v      # 删除容器+数据库数据（慎用）
docker compose ps           # 查看状态
docker logs -f Hackathon_api     # 看后端日志（landing/worker/beat/db 同理）
```

## 重建镜像（代码改动后）

**必须用经典构建器**（本机 buildx 容器构建器直连 Docker Hub 超时，daemon 镜像加速正常）：

```bash
# 后端镜像（根 Dockerfile，context 是项目根）
DOCKER_BUILDKIT=0 docker build -t hackathon-aibuddy:latest /home/xzh/Hackathon/AiBuddy

# 前端镜像
DOCKER_BUILDKIT=0 docker build -t hackathon-landing:latest /home/xzh/Hackathon/AiBuddy/landing

# 应用界面镜像（app/，登录/匹配/打卡）
DOCKER_BUILDKIT=0 docker build -t hackathon-app:latest /home/xzh/Hackathon/AiBuddy/app

# 应用重启
cd /home/xzh/Hackathon/AiBuddy/backend && docker compose up -d
```

注意：`docker compose up -d --build` 会走 buildx 构建并因网络失败，所以先手动 build 再 up。

## 验证部署（按顺序）

```bash
curl -s http://localhost:9999/            # 前端 HTTP 200
curl -s http://localhost:9999/api/health  # {"status":"ok",...}（转发链路）
curl -s -o /dev/null -w "%{http_code}" http://localhost:9999/api/docs          # 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:9999/api/openapi.json  # 200（root-path 生效）
curl -s http://localhost:9998/health      # 后端直连
docker logs Hackathon_worker 2>&1 | tail  # "celery@... ready"
```

## 数据库操作

```bash
# 容器内 psql
docker exec -it Hackathon_db psql -U monadmate -d monadmate
# 查表（应用启动时 create_all 自动建表，约 15 张 sm_* 表）
docker exec Hackathon_db psql -U monadmate -d monadmate -c "\dt"
```

## 演示数据

```bash
docker exec Hackathon_api python scripts/demo_seed.py --base-url http://localhost:9998
```
（demo_seed.py 在项目根 scripts/ 下，需确认容器内路径；若不在镜像中，用 `python scripts/demo_seed.py --base-url http://localhost:9998` 在宿主机跑）

## 已知坑（排障速查）

| 症状 | 原因/解决 |
|---|---|
| 构建失败 `dial tcp registry-1.docker.io timeout` | buildx 构建器不走镜像加速，改用 `DOCKER_BUILDKIT=0` |
| compose 项目名校验失败 `Does not match pattern` | 顶层 `name:` 必须小写（容器名可以大写） |
| api 容器反复重启连不上数据库 | .env 里 DATABASE_URL 是 localhost，确认 compose environment 覆盖为 `db` |
| worker/beat 启动即退 `ModuleNotFoundError: celery` | requirements.txt 缺 celery[redis]，需重建镜像 |
| 代理后 /api/docs 打不开或空白 | api 启动命令缺 `--root-path=/api` |
| 前端按钮跳转到错误地址 | 组件里 API_URL 写死了绝对地址，改回 `"/api"` |
| 改了 .env 不生效 | `docker compose up -d` 重建容器（不是 restart） |

## 本地模型服务（LLM + embeddings，2026-09-05 接入）

| 服务 | 地址（容器内视角） | 用途 |
|---|---|---|
| Ollama deepseek-r1:32b | http://172.20.0.1:11434（宿主机 127.0.0.1:11434） | 匹配介绍生成、meetup 计划生成（generate_match_intro / generate_plan_completion，经 _ollama_chat helper） |
| Xinference bge-large-zh-v1.5 | http://172.20.0.1:9997（宿主机 127.0.0.1:9997） | 语义向量（/v1/embeddings，OpenAI 兼容，1024 维） |

- 172.20.0.1 = Hackathon_network 网关（容器访问宿主机服务）；网关变了查：`docker network inspect Hackathon_network | grep Gateway`
- 默认值内建在 backend/app/core/config.py 和 ainative_service.py（因为本环境 compose 的 environment 新增键注入不可靠，见下）
- embeddings 维度 1024（bge-large-zh-v1.5），preference_memory_service 存 JSON 列无需迁移；cosine 对维度不等安全返回 0
- 两个 .env 分工：根 `.env` = 本地服务全局配置（OLLAMA_*/EMBEDDINGS_* 等）；`backend/.env` = 后端合约配置（Monad 合约/私钥/阈值），compose 实际加载的是 backend/.env（env_file: .env）
- LLM 推理耗时：deepseek-r1:32b 单次生成约 15s（intro）/更久（plan），超时设 180s/300s
- 中断恢复注意：曾发生过编辑被部分回退（generate_match_intro/generate_plan_completion 变回 AINative 旧版），改完代码后建议 grep 确认关键改动还在再构建

| 症状 | 原因/解决 |
|---|---|
| compose env_file 用列表形式不生效 | 本环境只支持单字符串 `env_file: .env`，列表被静默忽略 |
| compose environment 新增键不进容器（老键正常） | 本环境已知怪癖，force-recreate/删容器重建均无效；新增配置只能写进代码默认值（config.py）或 backend/.env |
| host.docker.internal 不解析 | extra_hosts 在本环境无效；用网关 IP 172.20.0.1 直连 |

## 技术栈备忘

后端 FastAPI + SQLAlchemy + Celery + Web3(Monad testnet, chain 10143)；前端 Next.js 14 standalone；数据库自动建表（lifespan create_all，alembic 仅占位）。backend/.env 含测试网私钥（仅演示用）。
