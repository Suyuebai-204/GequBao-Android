<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import Icon from '../components/Icon.vue'
import SongList from '../components/SongList.vue'
import { player } from '../composables/player'
import { showToast } from '../composables/toast.js'
import { useInfiniteScroll } from '../composables/useInfiniteScroll'

const emit = defineEmits(['search', 'play-list'])

const tabs = [
  { type: 'week-search', label: '周搜索榜' },
  { type: 'week-download', label: '周下载榜' }
]
const active = ref('week-download')

// 每个榜单独立缓存：切换 Tab 不刷新，数据暂存以减少请求压力
const states = reactive({
  'week-search': { list: [], page: 0, hasNext: false, totalPages: 1, loading: false, loaded: false, error: '', seq: 0 },
  'week-download': { list: [], page: 0, hasNext: false, totalPages: 1, loading: false, loaded: false, error: '', seq: 0 }
})

const cur = computed(() => states[active.value])
const list = computed(() => cur.value.list)
const page = computed(() => cur.value.page)
const hasNext = computed(() => cur.value.hasNext)
const totalPages = computed(() => cur.value.totalPages)
const type = computed(() => active.value)
const loading = computed(() => cur.value.loading && !cur.value.loaded)
const loadingMore = computed(() => cur.value.loading && cur.value.loaded)
const error = computed(() => cur.value.error)

// 单个榜单的加载（首屏或非首屏追加），用各自 seq 防止竞态导致数据错乱
async function load(t, target, append) {
  const st = states[t]
  if (append) {
    if (st.loading || !st.hasNext) return
  } else {
    if (st.loading) return
    st.error = ''
  }
  const id = ++st.seq
  st.loading = true
  try {
    const res = await window.api.search.top(t, target)
    if (id !== st.seq) return
    if (!res?.ok) {
      if (!append) {
        st.error = res?.error || '加载排行榜失败'
        showToast(st.error, { type: 'error' })
      }
      return
    }
    const data = res.data || {}
    const items = Array.isArray(data.list) ? data.list : []
    st.list = append ? [...st.list, ...items] : items
    st.page = data.current || target
    st.hasNext = !!data.hasNext
    st.totalPages = data.total || 1
    st.loaded = true
  } catch (e) {
    if (id === st.seq && !append) {
      st.error = e?.message || '加载排行榜失败'
      showToast(st.error, { type: 'error' })
    }
  } finally {
    if (id === st.seq) st.loading = false
  }
}

// 进入榜单页：两个榜单各自拉取第一页（初始化），数据暂存
function initTabs() {
  tabs.forEach((t) => {
    const st = states[t.type]
    if (!st.loaded && !st.loading) load(t.type, 1, false)
  })
}

// 上滑到底部才加载当前榜单的下一页
function loadMore() {
  const st = states[active.value]
  if (st.loading || !st.hasNext) return
  return load(active.value, st.page + 1, true)
}
useInfiniteScroll(loadMore, hasNext)

const songItems = computed(() =>
  list.value.map((s, i) => ({
    id: s.musicId || s.id || i,
    title: s.title,
    artist: s.artist,
    cover: s.cover
  }))
)
const activeId = computed(() => player.song?.musicId || player.song?.id)

function onPlay(index) {
  emit('play-list', { list: list.value, index })
}

// 切换 Tab：仅切换显示，不重新请求（数据已缓存）
function onTab(t) {
  if (active.value === t.type) return
  active.value = t.type
  const st = states[t.type]
  if (!st.loaded && !st.loading) load(t.type, 1, false)
}

function retry() {
  load(active.value, 1, false)
}

onMounted(initTabs)
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h3 style="margin: 0;">排行榜</h3>
      <div class="tabs">
        <button v-for="t in tabs" :key="t.type" class="tab" :class="{ active: active === t.type }" @click="onTab(t)">
          {{ t.label }}
        </button>
      </div>
    </div>

    <p class="muted">
      <template v-if="type === 'week-search'">本周搜索热度最高的关键词</template>
      <template v-else-if="type === 'week-download'">本周下载量最高的歌曲</template>
      <template v-else>站内热门榜单</template>
      <span v-if="list.length"> · 第 {{ page }} / {{ totalPages }} 页</span>
    </p>

    <div v-if="loading" class="table">
      <div class="table-head" style="grid-template-columns: 56px 3fr 2fr 72px">
        <span class="num">排名</span>
        <span>标题</span>
        <span>艺术家</span>
        <span class="num" style="text-align: right">操作</span>
      </div>
      <div v-for="i in 8" :key="i" class="table-row" style="grid-template-columns: 56px 3fr 2fr 72px">
        <span class="skeleton" style="height: 12px; width: 28px"></span>
        <span class="skeleton" style="height: 12px; width: 60%"></span>
        <span class="skeleton" style="height: 12px; width: 40%"></span>
        <span class="skeleton" style="height: 12px; width: 40px; justify-self: end"></span>
      </div>
    </div>

    <div v-else-if="error" class="card state">
      <Icon name="close" :size="18" />
      <div>
        <p class="state-title">加载失败</p>
        <p class="muted">{{ error }}</p>
      </div>
      <button class="btn btn-primary" @click="retry()">重试</button>
    </div>

    <div v-else-if="!list.length" class="empty muted">
      <Icon name="charts" :size="30" />
      <p>暂时没有榜单数据。</p>
    </div>

    <div v-else-if="type === 'week-download'" class="list-wrap">
      <SongList :songs="songItems" show-rank :active-id="activeId" @play="onPlay" />
      <div class="list-foot">
        <span class="muted small">
          {{ hasNext ? (loadingMore ? '加载中…' : '下滑加载更多') : `已经到底了 · 共 ${totalPages} 页` }}
        </span>
      </div>
    </div>

    <div v-else class="list-wrap">
      <div class="kw-list">
        <button v-for="(it, i) in list" :key="it.keyword" class="kw-row" :title="`搜索「${it.keyword}」`"
          @click="emit('search', it.keyword)">
          <span class="rank" :class="{ top: i < 3 }">{{ it.rank ?? i + 1 }}</span>
          <span class="kw truncate">{{ it.keyword }}</span>
          <span class="row-action">
            <button class="ghost-btn" @click.stop="emit('search', it.keyword)">
              <Icon name="search" :size="14" />
              搜索
            </button>
          </span>
        </button>
      </div>
      <div class="list-foot">
        <span class="muted small">
          {{ hasNext ? (loadingMore ? '加载中…' : '下滑加载更多') : `已经到底了 · 共 ${totalPages} 页` }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.view-head {
  display: flex;
  align-items: baseline;
  /* gap: 16px; */
  flex-wrap: wrap;
}

.tabs {
  display: flex;
  gap: 4px;
}

.tab {
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  transition: background var(--t), color var(--t);
}

/* .tab:hover { background: var(--surface-hover); color: var(--text); } */
.tab.active {
  background: var(--surface-active);
  color: var(--text);
  font-weight: 600;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 64px 16px;
  text-align: center;
}

.state {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-3);
}

.state .btn {
  margin-left: auto;
}

.state-title {
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
}

.lead {
  color: var(--accent);
  font-weight: 700;
}

.kw-list {
  display: flex;
  flex-direction: column;
}

.kw-row {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px 10px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--t);
}

.kw-row:hover {
  background: var(--surface-2);
}

.rank {
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  font-size: 14px;
  text-align: center;
}

.rank.top {
  color: var(--accent);
  font-weight: 700;
}

.kw {
  font-size: 14px;
  color: var(--text);
}

.song-row {
  cursor: pointer;
}

.kw-row {
  cursor: pointer;
}

.row-action {
  display: flex;
  justify-content: flex-end;
}

.row-action .play-btn {
  padding: 2px 8px;
  font-size: 12px;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--t), background var(--t);
}

.row-action .ghost-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 999px;
  cursor: pointer;
  transition: background var(--t), color var(--t), border-color var(--t);
}

.row-action .ghost-btn:active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.song-row:hover .row-action .play-btn {
  opacity: 1;
}

.list-wrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.list-foot {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 40px;
}

.small {
  font-size: 12px;
}
</style>
