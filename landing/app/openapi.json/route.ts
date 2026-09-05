// 运行时动态获取：上游 api:9999 是 Docker compose 内网地址，构建期不可达
export const dynamic = 'force-dynamic'

export async function GET() {
  const upstream = 'http://api:9999/openapi.json'
  const res = await fetch(upstream)
  const data = await res.json()
  return Response.json(data)
}
