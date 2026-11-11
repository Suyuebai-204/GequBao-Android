<script setup>
import { ref, computed, onMounted } from 'vue'
import Icon from '../components/Icon.vue'
import SongList from '../components/SongList.vue'
import { player } from '../composables/player'
import { showToast } from '../composables/toast.js'
import { useInfiniteScroll } from '../composables/useInfiniteScroll'

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

onMounted(() => run(1, false))
</script>

<template>
  <div class="view">
    <h3 style="margin: 0;">热门推荐</h3>
    <p class="muted">
      {{ list.length ? `第 ${page} / ${totalPages} 页 · 共 ${list.length} 首` : '为你精选的站内热门曲目' }}
    </p>

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
.state .btn { margin-left: auto; }
.state-title { color: var(--text); font-size: 14px; font-weight: 600; }

.list-foot { display: flex; justify-content: center; align-items: center; min-height: 40px; margin-top: 12px; }
.small { font-size: 12px; }
</style>
