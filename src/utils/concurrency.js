/**
 * 带并发上限的 map：保持结果顺序，避免 N 个分页请求串行累加 RTT，
 * 同时不给服务端一次性打满连接。
 */
export async function mapLimit(items, limit = 4, worker = async (x) => x) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return []
  const results = new Array(list.length)
  let cursor = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, list.length)) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= list.length) return
      results[i] = await worker(list[i], i)
    }
  })
  await Promise.all(workers)
  return results
}
