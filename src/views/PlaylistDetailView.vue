<script setup>
import { onActivated, ref, watch } from 'vue'
import Icon from '../components/Icon.vue'
import SongList from '../components/SongList.vue'
import LoginModal from '../components/LoginModal.vue'
import { player } from '../composables/player'
import { showToast, dismissToast } from '../composables/toast.js'
import { fetchPlaylistDetail } from '../services/cloudPlaylist.js'
import { useAuth } from '../services/auth.js'

const props = defineProps({
  playlistId: { type: [Number, String], default: 0 },
  title: { type: String, default: '歌单' }
})
const emit = defineEmits(['play-list'])

const auth = useAuth()
const songs = ref([])
const loading = ref(false)
const error = ref('')
const needLogin = ref(false)
const page = ref(1)
const lastPage = ref(1)
const total = ref(0)
const showLogin = ref(false)

// 少数条目只有 music_id，没有 title/author/pic：用 songId 再解析一次详情
async function resolve(id) {
  try {
    const res = await window.api.player.song(id)
    if (res?.ok) {
      const d = res.data.detail || {}
      return {
        title: d.title || `歌曲 #${id}`,
        artist: d.artist || '未知歌手',
        cover: d.cover || ''
      }
    }
  } catch {
    /* 单条解析失败不阻塞列表 */
  }
  return { title: `歌曲 #${id}`, artist: '无法加载信息（可能已下架）', cover: '' }
}

let loadSeq = 0

/** announce=true 用于「重新进入歌单」等主动刷新，额外给出刷新成功反馈 */
async function load(p = 1, { announce = false } = {}) {
  if (!props.playlistId) {
    error.value = '缺少歌单 ID'
    return
  }
  const seq = ++loadSeq
  const tip = showToast(announce ? '正在刷新歌单歌曲…' : '正在读取歌单歌曲…', { duration: 0 })
  loading.value = true
  error.value = ''
  needLogin.value = false
  try {
    const r = await fetchPlaylistDetail({ playlistId: props.playlistId, page: p })
    if (seq !== loadSeq) return
    if (!r.ok) {
      needLogin.value = !!r.needLogin
      error.value = r.msg || '加载失败'
      songs.value = []
      showToast(error.value, { type: 'error' })
      return
    }
    page.value = r.page
    lastPage.value = r.lastPage
    total.value = r.total
    songs.value = r.songs

    const missing = r.songs.filter((s) => s.needResolve && s.id)
    if (missing.length) {
      const fixed = await Promise.all(
        missing.map(async (s) => ({ id: s.id, ...(await resolve(s.id)) }))
      )
      if (seq !== loadSeq) return
      const byId = new Map(fixed.map((f) => [String(f.id), f]))
      songs.value = songs.value.map((s) => {
        const f = byId.get(String(s.id))
        return f ? { ...s, title: f.title, artist: f.artist, cover: f.cover || s.cover } : s
      })
    }
    if (announce) showToast('歌单歌曲已更新', { type: 'success' })
  } catch (e) {
    if (seq !== loadSeq) return
    error.value = e?.message || '加载失败'
    showToast(error.value, { type: 'error' })
  } finally {
    dismissToast(tip)
    if (seq === loadSeq) loading.value = false
  }
}

function onPlay(index) {
  emit('play-list', { list: songs.value, index })
}

function playAll() {
  if (songs.value.length) emit('play-list', { list: songs.value, index: 0 })
}

function goPage(p) {
  if (p < 1 || p > lastPage.value || p === page.value) return
  load(p)
}

async function onLoginClose() {
  showLogin.value = false
  if (auth.loggedIn) load(1)
}

watch(() => props.playlistId, () => load(1), { immediate: true })

// keep-alive 会复用同一歌单的实例（viewKey 不变），返回列表页后再次点开时
// setup/watch 都不会重跑；在重新激活时清空并强制拉取，保证看到的是最新歌曲。
// 首次激活与上面的 immediate 加载重复，跳过一次。
let firstActivation = true
onActivated(() => {
  if (firstActivation) {
    firstActivation = false
    return
  }
  songs.value = []
  load(1, { announce: true })
})

// 会话恢复晚于页面挂载时，补拉一次，避免一直停在「需要登录」
watch(() => auth.loggedIn, (v) => {
  if (v && !loading.value && (needLogin.value || !songs.value.length)) load(1)
})
</script>

<template>
  <div class="pd-view">
    <div class="card bar">
      <div class="bar-info">
        <span class="bar-title truncate">{{ title || '歌单' }}</span>
        <span class="muted bar-sub">共 {{ total }} 首歌曲</span>
      </div>
      <button class="btn btn-primary" :disabled="!songs.length" @click="playAll">
        <Icon name="play" :size="14" />播放全部
      </button>
    </div>

    <div v-if="!auth.loggedIn || needLogin" class="card state">
      <Icon name="lock" :size="20" />
      <div class="col">
        <p class="state-title">需要登录歌曲宝账号</p>
        <p class="muted">登录后才能读取这个歌单里的歌曲。</p>
      </div>
      <button class="tool-btn" @click="showLogin = true">去登录</button>
    </div>

    <div v-else-if="loading" class="card state">
      <span class="muted">正在读取歌单歌曲…</span>
    </div>

    <div v-else-if="error" class="card state">
      <Icon name="close" :size="18" />
      <div class="col">
        <p class="state-title">加载失败</p>
        <p class="muted">{{ error }}</p>
      </div>
      <button class="tool-btn" @click="load(page)">重试</button>
    </div>

    <div v-else-if="!songs.length" class="empty muted">
      <Icon name="music" :size="32" />
      <p>这个歌单里还没有歌曲。</p>
    </div>

    <template v-else>
      <SongList :songs="songs" :active-id="player.song?.id" show-cover @play="onPlay" />
      <div v-if="lastPage > 1" class="pager">
        <button class="tool-btn" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
        <span class="muted">{{ page }} / {{ lastPage }} 页</span>
        <button class="tool-btn" :disabled="page >= lastPage" @click="goPage(page + 1)">下一页</button>
      </div>
    </template>

    <LoginModal v-if="showLogin" @close="onLoginClose" />
  </div>
</template>

<style scoped>
.pd-view {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
}

.bar-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bar-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.bar-sub {
  font-size: 12px;
}

.state {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-3);
}

.state-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.col p {
  margin: 0;
  font-size: 12px;
}

.tool-btn {
  flex-shrink: 0;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
}

.tool-btn:disabled {
  opacity: 0.5;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 56px 16px;
  text-align: center;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 6px 0;
  font-size: 13px;
}

/* 触屏无 hover：去掉粘滞高亮 */
.bar .btn:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
</style>
