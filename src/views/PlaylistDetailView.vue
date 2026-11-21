<script setup>
import { onActivated, onDeactivated, ref, watch } from 'vue'
import Icon from '../components/Icon.vue'
import SongList from '../components/SongList.vue'
import LoginModal from '../components/LoginModal.vue'
import { player } from '../composables/player'
import { openSheet } from '../composables/sheet.js'
import { showToast, dismissToast } from '../composables/toast.js'
import { useBatchDownload } from '../composables/batchDownload.js'
import { fetchPlaylistDetail, removeSongFromPlaylist } from '../services/cloudPlaylist.js'
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
const pendingId = ref(null)

const {
  selecting: batchSelecting,
  selectedIds: batchSelectedIds,
  selectedCount: batchCount,
  downloading: batchDownloading,
  progressText: batchProgress,
  enter: enterBatch,
  exit: exitBatch,
  clearSelection: clearBatch,
  toggle: toggleBatch,
  selectAll: selectAllBatch,
  invertSelection: invertBatch,
  start: startBatch
} = useBatchDownload(() => songs.value)

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
  clearBatch()
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
  if (batchSelecting.value) return
  emit('play-list', { list: songs.value, index })
}

function playAll() {
  if (batchSelecting.value) return
  if (songs.value.length) emit('play-list', { list: songs.value, index: 0 })
}

function goPage(p) {
  if (p < 1 || p > lastPage.value || p === page.value || batchDownloading.value) return
  load(p)
}

async function onRemove(song) {
  if (!song?.id || pendingId.value != null) return
  const name = String(song.title || `歌曲 #${song.id}`)
  const shortName = name.length > 18 ? `${name.slice(0, 18)}…` : name
  const v = await openSheet({
    title: `确定从歌单移出「${shortName}」？此操作会同步到账号，无法撤销。`,
    options: [{ label: '移出', value: 'remove', danger: true }]
  })
  if (v !== 'remove') return

  pendingId.value = song.id
  try {
    const r = await removeSongFromPlaylist({ playlistId: props.playlistId, musicId: song.id })
    if (!r.ok) {
      showToast(r.msg || '移出失败', { type: 'error' })
      return
    }
    // 当前页只剩这一首且不是第一页时退回上一页，避免停在空白页
    const target = songs.value.length === 1 && page.value > 1 ? page.value - 1 : page.value
    await load(target, { announce: true })
  } finally {
    pendingId.value = null
  }
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
onDeactivated(() => exitBatch())

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
      <button class="btn btn-primary" :disabled="!songs.length || batchSelecting" @click="playAll">
        <Icon name="play" :size="14" />播放全部
      </button>
    </div>

    <!-- 批量下载 -->
    <div class="batch-bar card">
      <template v-if="!batchSelecting">
        <button class="tool-btn" :disabled="!songs.length || batchDownloading" @click="enterBatch">
          <Icon name="check" :size="14" />
          批量下载
        </button>
        <span class="muted batch-tip">可选歌曲后批量下载，每首间隔 0.3 秒</span>
      </template>
      <template v-else>
        <div class="batch-actions">
          <button class="tool-btn" :disabled="batchDownloading" @click="selectAllBatch">全选</button>
          <button class="tool-btn" :disabled="batchDownloading" @click="invertBatch">反选</button>
          <button class="tool-btn primary" :disabled="!batchCount || batchDownloading" @click="startBatch">
            <Icon name="download" :size="14" />
            下载
          </button>
          <button class="tool-btn" :disabled="batchDownloading" @click="exitBatch">取消</button>
        </div>
        <div class="batch-status">
          <span class="batch-count">已选 {{ batchCount }} 首</span>
          <span v-if="batchDownloading" class="muted batch-progress">{{ batchProgress }}</span>
          <span v-else class="muted batch-tip">点击歌曲切换选中状态</span>
        </div>
      </template>
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
      <SongList :songs="songs" :active-id="player.song?.id" show-cover :select-mode="batchSelecting"
        :selected-ids="batchSelectedIds" @play="onPlay" @toggle-select="toggleBatch">
        <template #trailing="{ id, song }">
          <button class="row-x" :disabled="pendingId != null"
            :title="String(pendingId) === String(id) ? '正在移出…' : '从歌单移出'"
            :aria-label="String(pendingId) === String(id) ? '正在移出…' : '从歌单移出'"
            @click.stop="onRemove(song)">
            <Icon name="close" :size="13" />
          </button>
        </template>
      </SongList>
      <div v-if="lastPage > 1" class="pager">
        <button class="tool-btn" :disabled="page <= 1 || batchDownloading" @click="goPage(page - 1)">上一页</button>
        <span class="muted">{{ page }} / {{ lastPage }} 页</span>
        <button class="tool-btn" :disabled="page >= lastPage || batchDownloading" @click="goPage(page + 1)">下一页</button>
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
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}

.tool-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.tool-btn.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
}

.batch-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 10px 12px;
}

.batch-actions,
.batch-status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
}

.batch-actions {
  flex: 0 0 auto;
}

.batch-status {
  flex: 1 1 220px;
  min-width: 0;
  justify-content: flex-end;
  margin-left: auto;
}

.batch-tip,
.batch-progress {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  line-height: 1.4;
}

.batch-count {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
}

@media (max-width: 640px) {
  .batch-bar {
    gap: 6px;
    padding: 8px 10px;
  }
  .batch-bar .tool-btn {
    height: 30px;
    padding: 0 9px;
    font-size: 12px;
  }
  .batch-actions,
  .batch-status {
    flex: 1 1 100%;
    width: 100%;
    justify-content: flex-start;
    margin-left: 0;
  }
  .batch-tip,
  .batch-progress {
    flex: 1 1 100%;
  }
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

.row-x {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  transition: background var(--t), color var(--t);
}
.row-x:active { background: color-mix(in srgb, #e5484d 14%, transparent); color: #e5484d; }
.row-x:disabled { opacity: 0.4; cursor: default; }

/* 触屏无 hover：去掉粘滞高亮 */
.bar .btn:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
</style>
