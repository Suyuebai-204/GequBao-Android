<script setup>
import { ref, watch, computed, onMounted } from 'vue'
import Icon from '../components/Icon.vue'
import SongList from '../components/SongList.vue'
import { player } from '../composables/player'
import { showToast } from '../composables/toast.js'

const props = defineProps({
  keyword: { type: String, default: '' }
})
const emit = defineEmits(['search', 'play', 'play-list'])

const loading = ref(false)
const error = ref('')
const list = ref([])
const total = ref(null)
const searched = ref(false)
const slowHint = ref(false)
const usedKeyword = ref('')
const notFound = ref(false)
const guesses = ref([])

let seq = 0
let slowTimer = null
let guessSeq = 0

async function run(kw) {
  const key = String(kw ?? '').trim()
  clearTimeout(slowTimer)
  list.value = []
  total.value = null
  error.value = ''
  slowHint.value = false
  usedKeyword.value = key
  notFound.value = false
  guesses.value = []

  if (!key) {
    searched.value = false
    return
  }

  const id = ++seq
  loading.value = true
  searched.value = true
  slowTimer = setTimeout(() => {
    if (id === seq) slowHint.value = true
  }, 3000)

  try {
    const res = await window.api.search.songs(key)
    if (id !== seq) return
    if (!res?.ok) {
      error.value = res?.error || '搜索失败'
      showToast(error.value, { type: 'error' })
      return
    }
    list.value = Array.isArray(res.data?.list) ? res.data.list : []
    total.value = res.data?.total ?? list.value.length
    usedKeyword.value = res.data?.usedKeyword || key
    notFound.value = !!res.data?.notFound
    loadGuess(usedKeyword.value)
  } catch (e) {
    if (id === seq) {
      error.value = e?.message || '搜索失败'
      showToast(error.value, { type: 'error' })
    }
  } finally {
    clearTimeout(slowTimer)
    if (id === seq) loading.value = false
  }
}

async function loadGuess(kw) {
  const key = String(kw ?? '').trim()
  if (!key) return

  const id = ++guessSeq
  try {
    const res = await window.api.search.guess(key)
    if (id !== guessSeq) return
    guesses.value = res?.ok && Array.isArray(res.data) ? res.data : []
  } catch {
    if (id === guessSeq) guesses.value = []
  }
}

function playGuess(item) {
  if (!item) return
  if (item.musicId) {
    emit('play', { musicId: item.musicId, title: item.searchKeyword || item.label, artist: '' })
    return
  }
  emit('search', item.searchKeyword || item.label)
}

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

watch(() => props.keyword, (v) => run(v), { immediate: true })

onMounted(() => {
  if (!searched.value && props.keyword) run(props.keyword)
})
</script>

<template>
  <div class="view">
    <h1>搜索结果</h1>
    <p class="muted">
      <template v-if="searched">关键词「{{ keyword }}」· 共 {{ total ?? list.length }} 首</template>
      <template v-else>输入关键词开始搜索</template>
    </p>
    <p v-if="usedKeyword && usedKeyword !== keyword && list.length" class="notice">
      「{{ keyword }}」无匹配结果，已自动改用「{{ usedKeyword }}」搜索
    </p>

    <template v-if="loading">
      <div class="table">
        <div class="table-head" style="grid-template-columns: 28px 3fr 2fr 64px">
          <span class="num">#</span>
          <span>标题</span>
          <span>艺术家</span>
          <span class="num" style="text-align: right">ID</span>
        </div>
        <div v-for="i in 8" :key="i" class="table-row" style="grid-template-columns: 28px 3fr 2fr 64px">
          <span class="num">{{ i }}</span>
          <span class="skeleton" style="height: 12px; width: 60%"></span>
          <span class="skeleton" style="height: 12px; width: 40%"></span>
          <span class="skeleton" style="height: 12px; width: 40px; justify-self: end"></span>
        </div>
      </div>
      <p v-if="slowHint" class="muted slow">站点响应较慢，仍在努力加载…</p>
    </template>

    <div v-else-if="error" class="card state">
      <Icon name="close" :size="18" />
      <div>
        <p class="state-title">搜索失败</p>
        <p class="muted">{{ error }}</p>
      </div>
      <button class="btn btn-primary" @click="run(keyword)">重试</button>
    </div>

    <div v-else-if="searched && !list.length" class="card state">
      <Icon name="search" :size="18" />
      <div>
        <p class="state-title">没有找到相关歌曲</p>
        <p class="muted">
          {{
            notFound
              ? '站点返回「无此结果」。试试去掉特殊符号、缩短关键词，或用「歌名 歌手」组合搜索'
              : '试试去掉特殊符号，或用「歌名 歌手」组合搜索'
          }}
        </p>
      </div>
    </div>

    <div v-else-if="list.length">
      <SongList :songs="songs" :active-id="activeId" @play="onPlay" />
    </div>

    <div v-if="guesses.length" class="guess">
      <p class="guess-title">
        <Icon name="hot" :size="14" />
        <span>猜你想找</span>
      </p>
      <div class="guess-grid">
        <button
          v-for="g in guesses"
          :key="`${g.musicId ?? g.id}-${g.label}`"
          class="guess-item"
          :title="`${g.label}（点击播放）`"
          @click="playGuess(g)"
        >
          <span class="truncate guess-name">{{ g.searchKeyword || g.label }}</span>
          <small class="truncate muted">{{ g.label }}</small>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.state {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-3);
}
.state .btn { margin-left: auto; }
.state-title { color: var(--text); font-size: 14px; font-weight: 600; }
.slow { margin: 10px 0 0; }
.notice {
  margin: -8px 0 14px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-left: 2px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-size: 12px;
  color: var(--text-2);
}

.song-row { cursor: pointer; }
.row-play { display: none; color: var(--accent); }
.song-row:hover .row-index { display: none; }
.song-row:hover .row-play { display: inline-block; }
.row-action { display: flex; justify-content: flex-end; }
.row-action .play-btn {
  padding: 2px 8px;
  font-size: 12px;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--t), background var(--t);
}
.song-row:hover .row-action .play-btn { opacity: 1; }

.guess { margin-top: 20px; }
.guess-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}
.guess-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
.guess-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  text-align: left;
  cursor: pointer;
  transition: background var(--t), border-color var(--t);
}
.guess-item:hover { background: var(--surface-active); }
.guess-item:active { border-color: var(--border-strong); }
.guess-name { font-size: 13px; font-weight: 600; color: var(--text); }
</style>
