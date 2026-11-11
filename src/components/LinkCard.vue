<template>
  <div
    class="card"
    role="button"
    tabindex="0"
    @click="onClick"
    @keyup.enter="onClick"
  >
    <!-- 加载态 -->
    <div v-if="loading" class="skeleton">
      <div class="sk-title"></div>
      <div class="sk-desc"></div>
    </div>

    <template v-else>
      <div class="card-title">
        <span class="icon">{{ initial }}</span>
        <span class="name">{{ meta.title || site.fallbackTitle }}</span>
      </div>
      <p class="card-desc">{{ meta.desc || site.fallbackDesc }}</p>
      <div class="card-footer">
        <span class="source">来源：{{ site.name }}</span>
        <span class="arrow">前往 →</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({ site: { type: Object, required: true } })
const emit = defineEmits(['open'])

const loading = ref(true)
const meta = ref({ title: '', desc: '' })

// 后端代理地址：部署 server.js（见公益寻亲开发方案）后填入，例如
//   https://your-proxy.com/api/fetch-meta
// 留空则不做网络请求，直接使用下方预设文案，页面照常可用。
const PROXY_BASE = ''

const initial = props.site.name.charAt(0)

const fetchMeta = async () => {
  if (!PROXY_BASE) {
    loading.value = false
    return
  }
  try {
    const r = await fetch(`${PROXY_BASE}?url=${encodeURIComponent(props.site.url)}`)
    if (!r.ok) throw new Error('proxy error')
    const data = await r.json()
    meta.value = data
  } catch {
    // 失败一律走兜底文案，页面永不卡在骨架屏
    meta.value = { title: '', desc: '' }
  } finally {
    loading.value = false
  }
}

const onClick = () => emit('open', props.site.url)

onMounted(fetchMeta)
</script>

<style scoped>
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: background var(--t), border-color var(--t), transform var(--t);
}
.card:active {
  background: var(--surface-active);
  transform: scale(0.99);
}

.skeleton .sk-title {
  height: 16px;
  width: 60%;
  background: var(--surface-active);
  border-radius: 6px;
  margin-bottom: 10px;
}
.skeleton .sk-desc {
  height: 13px;
  width: 100%;
  background: var(--surface-active);
  border-radius: 6px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.icon {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  color: var(--accent);
  font-size: 15px;
  font-weight: 700;
}
.name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.35;
}

.card-desc {
  font-size: 13px;
  color: var(--text-3);
  line-height: 1.55;
  margin: 0 0 10px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
}
.source {
  color: var(--text-3);
}
.arrow {
  color: var(--accent);
  font-weight: 600;
}
</style>
