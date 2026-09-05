---
name: "aibuddy-docker-ops"
description: "Manage the AiBuddy (Monad Mate) Docker deployment: start/stop/rebuild the 6-container Hackathon stack, debug port/proxy issues (9999 frontend, 9998 API). Invoke when user asks to deploy, restart, stop, rebuild, or troubleshoot this project's Docker environment."
---

# AiBuddy Docker 运行环境管理

AiBuddy/Monad Mate 项目的完整 Docker 部署运维知识。

## 架构总览

集群名 `hackathon`，定义于 `backend/docker-compose.yml`，6 个容器统一 `Hackathon_` 前缀命名，共享网络 `Hackathon_network`：

| 容器 | 镜像 | 宿主机端口 | 用途 |
|---|---|---|---|
| Hackathon_landing | hackathon-landing:latest | **9999** → 3000 | Next.js 前端（含 /api 反向代理） |
| Hackathon_api | hackathon-aibuddy:latest | **9998** → 9999 | FastAPI 后端（直连调试口） |
| Hackathon_worker | hackathon-aibuddy:latest | 无 | Celery worker |
| Hackathon_beat | hackathon-aibuddy:latest | 无 | Celery 定时任务 |
| Hackathon_db | postgres:16-alpine | 无 | Postgres 16 |
| Hackathon_redis | redis:7-alpine | 无 | Redis 7 |

## 端口与路由约定（关键）

- `http://localhost:9999` — 前端页面；`/api/*` 由 Next.js rewrites 转发到容器内网 `http://api:9999/*`（浏览器全程只碰 9999）
- `http://localhost:9999/api/docs` — Swagger 文档（经代理）
- `http://localhost:9998/docs` — Swagger 文档（后端直连，Postman/curl 用）
- 前端组件中 API_URL 必须用相对路径 `"/api"`，禁止写死 localhost/IP

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

## 技术栈备忘

后端 FastAPI + SQLAlchemy + Celery + Web3(Monad testnet, chain 10143)；前端 Next.js 14 standalone；数据库自动建表（lifespan create_all，alembic 仅占位）。backend/.env 含测试网私钥（仅演示用）。
