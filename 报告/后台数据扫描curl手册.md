# Monad Mate 后台数据扫描 curl 手册

> 生成日期：2026-09-05 ｜ 基于当前 master（8f54086）
>
> 三种访问入口，任选其一：
> - **本地直连**：`http://localhost:9998`（Postman/调试用）
> - **本地代理**：`http://localhost:9999/api`（与前端同链路）
> - **公网**：`https://settling-moonrise-endless.ngrok-free.dev/api`
>
> 下文统一用 `BASE=http://localhost:9998`（可自行替换）。

## 0. 基础健康检查（无需登录）

```bash
# 服务健康
curl -s http://localhost:9998/health

# OpenAPI 规范（全部接口的机器可读清单）
curl -s http://localhost:9998/openapi.json | python3 -m json.tool | head -50

# Swagger 文档（浏览器打开）
open http://localhost:9998/docs
```

## 1. 登录拿 Token（大多数接口需要）

托管钱包验证码登录（development 环境验证码直接返回在响应里）：

```bash
# 第一步：发送验证码
curl -s -X POST $BASE/v1/wallet/login/code \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@test.com"}'
# → {"subject":"email:demo@test.com","code":"376707",...}

# 第二步：提交验证码换 token（code 换成上一步返回的）
curl -s -X POST $BASE/v1/wallet/login/verify \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@test.com","code":"376707"}'
# → {"access_token":"eyJ...","user":{...}}

# 保存 token 供后续使用
TOKEN="eyJ..."   # 替换成真实 token
AUTH="Authorization: Bearer $TOKEN"
```

## 2. 用户信息

```bash
# 当前用户信息
curl -s $BASE/v1/users/me -H "$AUTH"

# 托管钱包账户详情（地址/余额）
curl -s $BASE/v1/wallet/me -H "$AUTH"

# 钱包签名挑战（MetaMask 直连方式）
curl -s -X POST $BASE/v1/users/challenge \
  -H "Content-Type: application/json" \
  -d '{"wallet_address":"0xYourAddress"}'
```

## 3. 搭子请求与匹配（核心业务）

```bash
# 我的搭子请求列表
curl -s $BASE/v1/meetups/requests -H "$AUTH"

# 某条请求的详情（UUID 替换）
curl -s $BASE/v1/meetups/requests/<request_id> -H "$AUTH"

# 某条请求的候选搭子（AI 匹配结果）
curl -s $BASE/v1/meetups/requests/<request_id>/candidates -H "$AUTH"

# 某条请求产生的匹配对
curl -s $BASE/v1/meetups/requests/<request_id>/matches -H "$AUTH"

# 匹配详情
curl -s $BASE/v1/meetups/matches/<match_id> -H "$AUTH"

# AI 活动计划（R3：查看当前计划）
curl -s $BASE/v1/meetups/matches/<match_id>/plan -H "$AUTH"
```

## 4. 偏好设置与 AI 匹配代理

```bash
# 读取我的偏好设置（MBTI/兴趣/性格特质等）
curl -s $BASE/v1/ai/match-agent/preferences -H "$AUTH"

# 匹配建议列表
curl -s $BASE/v1/ai/match-agent/suggestions -H "$AUTH"

# 生成匹配介绍语（走本地 deepseek-r1:32b，约 15s）
curl -s -X POST $BASE/v1/ai/match-agent/intro -H "$AUTH" \
  -H "Content-Type: application/json" -d '{}'
```

## 5. 验证状态（电话/ID）

```bash
# 我的验证状态
curl -s $BASE/v1/verification/me -H "$AUTH"

# 发起电话验证（开发环境验证码返回在响应里）
curl -s -X POST $BASE/v1/verification/phone/start -H "$AUTH" \
  -H "Content-Type: application/json" -d '{"phone":"+8613800138000"}'

# 确认电话验证码
curl -s -X POST $BASE/v1/verification/phone/confirm -H "$AUTH" \
  -H "Content-Type: application/json" -d '{"phone":"+8613800138000","code":"123456"}'

# 提交 ID 验证（stub）
curl -s -X POST $BASE/v1/verification/id/submit -H "$AUTH" \
  -H "Content-Type: application/json" -d '{"id_document_hash":"test-hash"}'
```

## 6. 履约凭证与信用

```bash
# 我的履约凭证列表（SBT）
curl -s $BASE/v1/credentials/me -H "$AUTH"

# 我的信用分
curl -s $BASE/v1/credentials/me/credit -H "$AUTH"
```

## 7. 押金与托管（Stake/Escrow）

```bash
# 押金要求（各类场景的门槛金额）
curl -s $BASE/v1/stakes/deposit-requirements -H "$AUTH"

# 我的押金记录
curl -s $BASE/v1/stakes/me -H "$AUTH"
```

## 8. 见面打卡与信誉

```bash
# 我的打卡记录
curl -s $BASE/v1/attestations/me -H "$AUTH"

# 我的信誉分
curl -s $BASE/v1/reputation/me -H "$AUTH"

# 某个 persona 的公开信誉
curl -s $BASE/v1/reputation/persona/<persona_id>
```

## 9. 安全（举报/拉黑）

```bash
# 我的举报列表
curl -s $BASE/v1/safety/reports -H "$AUTH"
```

## 10. Moment NFT

```bash
# 我的 Moment NFT 列表
curl -s $BASE/v1/nfts/moments -H "$AUTH"
```

## 11. 房间（Rooms，旧版群组功能）

```bash
# 房间列表（公开，无需登录）
curl -s $BASE/v1/rooms

# 房间发现
curl -s $BASE/v1/rooms/discover

# 我加入的房间成员（需登录）
curl -s $BASE/v1/rooms/<room_id>/members -H "$AUTH"
```

## 12. 数据库直查（Docker 内 psql，绕过 API）

```bash
# 进入交互式 psql
docker exec -it Hackathon_db psql -U monadmate -d monadmate

# 各表数据量统计
docker exec Hackathon_db psql -U monadmate -d monadmate -c "
SELECT 'users' t, count(*) FROM sm_users
UNION ALL SELECT 'personas', count(*) FROM sm_personas
UNION ALL SELECT 'preferences', count(*) FROM sm_user_preferences
UNION ALL SELECT 'meetup_requests', count(*) FROM sm_meetup_requests
UNION ALL SELECT 'meetup_matches', count(*) FROM sm_meetup_request_matches
UNION ALL SELECT 'meetup_plans', count(*) FROM sm_meetup_plans
UNION ALL SELECT 'stakes', count(*) FROM sm_stakes
UNION ALL SELECT 'attestations', count(*) FROM sm_meetup_attestations
UNION ALL SELECT 'credentials', count(*) FROM sm_fulfilment_credentials
UNION ALL SELECT 'reports', count(*) FROM sm_reports
UNION ALL SELECT 'moment_nfts', count(*) FROM sm_moment_nfts;"

# 查用户表（最近注册）
docker exec Hackathon_db psql -U monadmate -d monadmate -c \
  "SELECT id, wallet_address, email, verification_level, created_at FROM sm_users ORDER BY created_at DESC LIMIT 10;"

# 查偏好设置（含 1024 维 embedding 向量长度）
docker exec Hackathon_db psql -U monadmate -d monadmate -c \
  "SELECT user_id, intent_mode, jsonb_array_length(embedding_vector::jsonb) AS dim, updated_at FROM sm_user_preferences ORDER BY updated_at DESC LIMIT 10;"

# 查搭子请求
docker exec Hackathon_db psql -U monadmate -d monadmate -c \
  "SELECT id, user_id, status, venue_type, created_at FROM sm_meetup_requests ORDER BY created_at DESC LIMIT 10;"

# 查 AI 活动计划
docker exec Hackathon_db psql -U monadmate -d monadmate -c \
  "SELECT id, match_id, source, created_at FROM sm_meetup_plans ORDER BY created_at DESC LIMIT 10;"

# 查押金记录
docker exec Hackathon_db psql -U monadmate -d monadmate -c \
  "SELECT id, user_id, stake_type, amount_mon, status, created_at FROM sm_stakes ORDER BY created_at DESC LIMIT 10;"

# 全部表清单
docker exec Hackathon_db psql -U monadmate -d monadmate -c "\dt"
```

## 附：快速全量扫描脚本（一键体检）

```bash
BASE=http://localhost:9998
echo "── 服务健康 ──";        curl -s $BASE/health
echo; echo "── 房间列表 ──";  curl -s $BASE/v1/rooms | head -c 200
echo; echo "── 未登录接口鉴权检查(应401) ──"
for p in /v1/users/me /v1/meetups/requests /v1/verification/me /v1/credentials/me/credit /v1/safety/reports; do
  printf "%-40s %s\n" $p "$(curl -s -o /dev/null -w '%{http_code}' $BASE$p)"
done
echo "── 数据库数据量 ──"
docker exec Hackathon_db psql -U monadmate -d monadmate -t -c \
  "SELECT 'users:'||count(*) FROM sm_users UNION ALL SELECT 'requests:'||count(*) FROM sm_meetup_requests UNION ALL SELECT 'plans:'||count(*) FROM sm_meetup_plans;"
```
