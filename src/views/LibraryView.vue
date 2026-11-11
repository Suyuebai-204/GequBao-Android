<script setup>
import { computed, ref, onMounted } from 'vue'
import Icon from '../components/Icon.vue'
import SongList from '../components/SongList.vue'
import { player } from '../composables/player'

const emit = defineEmits(['play-list'])

const dir = ref('')
const list = ref([])
const totalSizeText = ref('')
const loading = ref(false)
const scanning = ref(false)
const error = ref('')
const filter = ref('')
let seq = 0

const filtered = computed(() => {
  const kw = filter.value.trim().toLowerCase()
  if (!kw) return list.value
  return list.value.filter(
    (item) =>
      item.title?.toLowerCase().includes(kw) ||
      item.artist?.toLowerCase().includes(kw) ||
      item.album?.toLowerCase().includes(kw)
  )
})

async function scan() {
  const id = ++seq
  loading.value = true
  error.value = ''
  try {
    // 移动端始终扫描系统媒体库（空参数表示全库）
    const res = await window.api.library.scan('')
    if (id !== seq) return
    if (!res?.ok) {
      error.value = res?.error || '扫描失败'
      list.value = []
      return
    }
    dir.value = res.data.dir
    list.value = res.data.list || []
    totalSizeText.value = res.data.totalSizeText || ''
  } catch (e) {
    if (id === seq) error.value = e?.message || '扫描失败'
  } finally {
    if (id === seq) loading.value = false
  }
}

onMounted(() => {
  scan()
})

const songItems = computed(() =>
  filtered.value.map((s) => ({
    id: s.path || s.id,
    title: s.title,
    artist: s.artist || '-',
    meta: [s.year, s.sizeText, s.format].filter(Boolean).join(' · ')
  }))
)
const activeId = computed(() => player.song?.id)

function onPlay(index) {
  emit('play-list', { list: filtered.value, index, local: true })
}
</script>

<template>
  <div class="view">
    <p class="muted" style="margin: 0 0 12px;">
      <template v-if="dir">{{ dir }} · {{ list.length }} 个文件 · 共 {{ totalSizeText }}</template>
      <template v-else>正在读取系统媒体库中的音频文件…</template>
    </p>

    <div class="row">
      <input v-model="filter" class="filter" placeholder="筛选标题 / 歌手 / 专辑" />
      <button class="btn btn-primary" :disabled="scanning" @click="scan">
        {{ dir ? '重新扫描' : '扫描本地音乐' }}
      </button>
    </div>

    <div v-if="loading" class="card state">
      <span class="muted">正在读取媒体库…</span>
    </div>

    <div v-else-if="error" class="card state">
      <Icon name="close" :size="18" />
      <div>
        <p class="state-title">扫描失败</p>
        <p class="muted">{{ error }}</p>
      </div>
      <button class="btn btn-primary" @click="scan">重试</button>
    </div>

    <div v-else-if="!filtered.length" class="empty muted">
      <Icon name="music" :size="30" />
      <p>{{ list.length ? '没有匹配的曲目。' : '系统媒体库里还没有找到音频文件。' }}</p>
    </div>

    <div v-else>
      <SongList :songs="songItems" :active-id="activeId" :show-more="false" @play="onPlay" />
    </div>
  </div>
</template>

<style scoped>
.row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.filter { flex: 1 1 auto; min-width: 0; }
.btn { flex-shrink: 0; white-space: nowrap; }
.empty { gap: 12px; }
.state {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-3);
}
.state .btn { margin-left: auto; }
.state-title { color: var(--text); font-size: 14px; font-weight: 600; }

.song-row { cursor: pointer; }
.row-play { display: none; color: var(--accent); }
.song-row:hover .row-index { display: none; }
.song-row:hover .row-play { display: inline-block; }

.small { font-size: 12px; }
.skel-row { height: 36px; margin: 2px 0; }
</style>
