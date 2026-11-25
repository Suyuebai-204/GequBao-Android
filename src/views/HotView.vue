<script setup>
import { ref, computed, onMounted } from 'vue'
import Icon from '../components/Icon.vue'
import SongList from '../components/SongList.vue'
import { player } from '../composables/player'
import { showToast } from '../composables/toast.js'
import { useInfiniteScroll } from '../composables/useInfiniteScroll'
import { request } from '../services/http.js'
import { openExternalBrowser } from '../utils/openExternal.js'

const emit = defineEmits(['play-list'])

const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const list = ref([])
const page = ref(1)
const hasNext = ref(false)
const totalPages = ref(1)
let seq = 0

async function run(target = 1, append = false) {
  const id = ++seq
  if (append) loadingMore.value = true
  else {
    loading.value = true
    error.value = ''
    list.value = []
  }
  try {
    const res = await window.api.search.hotMusic(target)
    if (id !== seq) return
    if (!res?.ok) {
      error.value = res?.error || '加载热门推荐失败'
      if (!append) showToast(error.value, { type: 'error' })
      return
    }
    const data = res.data || {}
    const items = Array.isArray(data.list) ? data.list : []
    list.value = append ? [...list.value, ...items] : items
    page.value = data.current || target
    hasNext.value = !!data.hasNext
    totalPages.value = data.total || 1
  } catch (e) {
    if (id === seq) {
      error.value = e?.message || '加载热门推荐失败'
      if (!append) showToast(error.value, { type: 'error' })
    }
  } finally {
    if (id === seq) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

function loadMore() {
  if (loadingMore.value || !hasNext.value) return
  return run(page.value + 1, true)
}

// 下滑到底部自动加载下一页
useInfiniteScroll(loadMore, hasNext)

const songs = computed(() =>
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

/* ---- 热门资讯 ---- */
const NEWS_ORIGIN = 'https://www.gequbao.com'
const newsList = ref([])
const newsPage = ref(1)
const newsHasNext = ref(true)
const newsLoading = ref(false)
const newsError = ref('')
const newsPullY = ref(0)
const newsPullReady = ref(false)
const newsScroller = ref(null)
const newsOpen = ref(true)
let newsTouchStartY = null

function toggleNews() {
  newsOpen.value = !newsOpen.value
}

function parseNews(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const seen = new Set()
  const items = []
  doc.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || ''
    if (!/^(\/article\/\d+|https?:\/\/(www\.)?gequbao\.com\/article\/\d+)/i.test(href)) return
    const title = String(a.textContent || '').replace(/\s+/g, ' ').trim()
    if (!title || seen.has(href)) return
    seen.add(href)
    items.push({ title, url: new URL(href, NEWS_ORIGIN).href })
  })
  return items
}

async function loadNews(target = 1, append = false) {
  if (newsLoading.value) return
  newsLoading.value = true
  if (!append) newsError.value = ''
  try {
    const { text } = await request(`${NEWS_ORIGIN}/hot-news?page=${target}`, {
      accept: 'text/html,application/xhtml+xml',
      quiet: true,
      cacheTtl: 120_000,
      staleTtl: 600_000
    })
    const items = parseNews(text)
    if (!items.length) {
      newsHasNext.value = false
      return
    }
    const known = new Set(newsList.value.map((n) => n.url))
    const fresh = items.filter((n) => !known.has(n.url))
    newsList.value = append ? [...newsList.value, ...fresh] : fresh
    newsPage.value = target
    newsHasNext.value = true
  } catch (e) {
    newsError.value = e?.message || '资讯加载失败'
  } finally {
    newsLoading.value = false
    newsPullReady.value = false
    newsPullY.value = 0
  }
}

function refreshNews() {
  if (newsLoading.value) return
  newsList.value = []
  newsPage.value = 1
  newsHasNext.value = true
  loadNews(1, false)
}

function loadMoreNews() {
  if (newsLoading.value || !newsHasNext.value) return
  loadNews(newsPage.value + 1, true)
}

function onNewsScroll(e) {
  const el = e.currentTarget
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) loadMoreNews()
}

function onNewsTouchStart(e) {
  const el = newsScroller.value
  if (!el || el.scrollTop > 0) {
    newsTouchStartY = null
    return
  }
  newsTouchStartY = e.touches[0]?.clientY ?? null
}

function onNewsTouchMove(e) {
  if (newsTouchStartY == null) return
  const delta = (e.touches[0]?.clientY ?? 0) - newsTouchStartY
  if (delta <= 0) {
    newsPullY.value = 0
    newsPullReady.value = false
    return
  }
  e.preventDefault()
  newsPullY.value = Math.min(72, delta * 0.5)
  newsPullReady.value = newsPullY.value >= 44
}

function onNewsTouchEnd() {
  if (newsTouchStartY == null) return
  const ready = newsPullReady.value
  newsTouchStartY = null
  newsPullReady.value = false
  newsPullY.value = 0
  if (ready) refreshNews()
}

function openNews(item) {
  openExternalBrowser(item.url)
}

onMounted(() => {
  run(1, false)
  loadNews(1, false)
})
</script>

<template>
  <div class="view">
    <section class="news-block">
      <header class="news-head">
        <h3 class="news-toggle" role="button" tabindex="0" :aria-expanded="newsOpen" @click="toggleNews"
          @keydown.enter="toggleNews" @keydown.space.prevent="toggleNews">
          热门资讯
          <Icon class="news-caret" :class="{ collapsed: !newsOpen }" name="down" :size="14" />
        </h3>
        <button class="news-refresh" title="刷新" :disabled="newsLoading" @click="refreshNews">
          <Icon name="refresh" :size="16" :class="{ spinning: newsLoading }" />
        </button>
      </header>

      <div
        v-show="newsOpen"
        ref="newsScroller"
        class="news-scroller"
        @scroll="onNewsScroll"
        @touchstart.passive="onNewsTouchStart"
        @touchmove="onNewsTouchMove"
        @touchend="onNewsTouchEnd"
        @touchcancel="onNewsTouchEnd"
      >
        <div class="news-pull" :style="{ height: `${newsPullY}px` }">
          {{ newsPullReady ? '松开刷新' : '下拉刷新' }}
        </div>

        <div v-if="newsLoading && !newsList.length" class="news-state muted">加载中…</div>
        <div v-else-if="newsError && !newsList.length" class="news-state muted">
          <span>{{ newsError }}</span>
          <button class="btn btn-subtle" @click="refreshNews">重试</button>
        </div>
        <template v-else>
          <button v-for="(item, i) in newsList" :key="item.url" class="news-item" :title="item.title" @click="openNews(item)">
            <span class="news-idx">{{ i + 1 }}</span>
            <span class="news-title truncate">{{ item.title }}</span>
            <Icon class="news-arrow" name="chevron" :size="14" />
          </button>
          <p class="news-foot muted small">
            {{ newsLoading ? '加载中…' : newsHasNext ? '上滑加载下一页' : `共 ${newsList.length} 条 · 已到底` }}
          </p>
        </template>
      </div>
    </section>

    <header class="hot-head">
      <h3>热门推荐</h3>
      <span class="muted small">
        {{ list.length ? `第 ${page} / ${totalPages} 页 · 共 ${list.length} 首` : '为你精选的站内热门曲目' }}
      </span>
    </header>

    <div v-if="loading" class="card state">
      <span class="muted">加载中…</span>
    </div>

    <div v-else-if="error" class="card state">
      <Icon name="close" :size="18" />
      <div>
        <p class="state-title">加载失败</p>
        <p class="muted">{{ error }}</p>
      </div>
      <button class="btn btn-primary" @click="run">重试</button>
    </div>

    <div v-else-if="!list.length" class="empty muted">
      <Icon name="hot" :size="30" />
      <p>暂时没有热门推荐数据。</p>
    </div>

    <div v-else>
      <SongList :songs="songs" :active-id="activeId" @play="onPlay" />
      <div class="list-foot">
        <span class="muted small">
          {{ hasNext ? (loadingMore ? '加载中…' : '下滑加载更多') : `已经到底了 · 共 ${totalPages} 页` }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: 64px var(--space-4);
  text-align: center;
}
.state {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--text-3);
}
.state .btn { margin-left: auto; }
.state-title { color: var(--text); font-size: var(--fs-title); font-weight: 600; }

.list-foot { display: flex; justify-content: center; align-items: center; min-height: 40px; margin-top: var(--space-3); }
.small { font-size: var(--fs-caption); }

/* 资讯区：无背景块、无边框，靠间距与下方歌曲列表分组 */
.news-block { margin-bottom: var(--space-6); }
.news-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 0 var(--space-1) var(--space-2);
}
.news-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  margin: 0;
  font-size: var(--fs-title);
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
  user-select: none;
}
.news-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius-md);
}
.news-caret {
  color: var(--text-3);
  transition: transform var(--t);
}
.news-caret.collapsed {
  transform: rotate(-90deg);
}
.news-refresh {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  transition: color var(--t), background var(--t);
}
.news-refresh:not(:disabled):hover {
  background: var(--surface-active);
  color: var(--accent);
}
.news-refresh:disabled { opacity: 0.5; cursor: default; }
.news-refresh .spinning { animation: news-spin 0.9s linear infinite; }
@keyframes news-spin { to { transform: rotate(360deg); } }

.news-scroller {
  /* 约 3 行，避免占满首屏 */
  max-height: 104px;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.news-scroller::-webkit-scrollbar { display: none; }
.news-pull {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: var(--fs-caption);
  color: var(--text-3);
  transition: height 0.12s ease;
}
.news-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-1);
  border: 0;
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
/* 序号：纯数字，不加背景块 */
.news-idx {
  width: 18px;
  flex: none;
  color: var(--text-3);
  font-size: var(--fs-caption);
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.news-title { flex: 1; min-width: 0; font-size: var(--fs-body); line-height: var(--lh-tight); }
.news-arrow { flex-shrink: 0; color: var(--text-3); }
.news-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 96px;
}
.news-foot { margin: var(--space-1) var(--space-1) 0; text-align: right; }

.hot-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  margin: 0 var(--space-1) var(--space-3);
}
.hot-head h3 { margin: 0; font-size: var(--fs-h2); font-weight: 600; color: var(--text); }

:deep(.song-row:not(.active):hover) {
  background: transparent;
}
</style>
