<script setup>
import { computed, onActivated, onMounted, ref, watch } from 'vue'
import Icon from '../components/Icon.vue'
import LoginModal from '../components/LoginModal.vue'
import PlaylistModal from '../components/PlaylistModal.vue'
import { openSheet } from '../composables/sheet.js'
import { showToast } from '../composables/toast.js'
import { playlistSongCount, refreshPlaylists, usePlaylists } from '../composables/playlists.js'
import { deletePlaylist } from '../services/cloudPlaylist.js'
import { useAuth } from '../services/auth.js'

const emit = defineEmits(['navigate'])
const auth = useAuth()
const store = usePlaylists()

const showLogin = ref(false)
const modal = ref(null) // { mode: 'create' } | { mode: 'edit', playlist }
const busy = ref(false)

const cards = computed(() => store.items)

function openCreate() {
  if (!auth.loggedIn) {
    showLogin.value = true
    return
  }
  modal.value = { mode: 'create' }
}

function openDetail(p) {
  emit('navigate', 'playlist', { playlistId: p.id, title: p.title })
}

// 新建 / 编辑 / 删除成功后都重新拉一次列表，保证计数与卡片同步
async function onSaved() {
  const s = await refreshPlaylists(true)
  if (s?.error) showToast(s.error, { type: 'error' })
}

// 手动刷新：全局「正在请求…」负责进行中，这里补上这次刷新的结果
async function refresh() {
  const s = await refreshPlaylists(true)
  showToast(s?.error || '歌单已更新', { type: s?.error ? 'error' : 'success' })
}

async function onLoginClose() {
  showLogin.value = false
  if (auth.loggedIn) await refreshPlaylists(true)
}

async function onMore(p) {
  const v = await openSheet({
    title: p.title,
    options: [
      { label: '编辑歌单', value: 'edit', icon: 'edit' },
      { label: '删除歌单', value: 'delete', icon: 'trash', danger: true }
    ]
  })
  if (v === 'edit') {
    modal.value = { mode: 'edit', playlist: p }
    return
  }
  if (v !== 'delete') return

  const sure = await openSheet({
    title: `确定删除「${p.title}」？删除后不可恢复`,
    options: [{ label: '删除', value: 'ok', danger: true }]
  })
  if (sure !== 'ok' || busy.value) return

  busy.value = true
  try {
    const r = await deletePlaylist(p.id)
    if (!r.ok) {
      showToast(r.msg || '删除失败', { type: 'error' })
      return
    }
    showToast(r.msg || '删除成功', { type: 'success' })
    await refreshPlaylists(true)
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  if (auth.loggedIn) refreshPlaylists()
})
onActivated(() => {
  if (auth.loggedIn) refreshPlaylists(true)
})

// App 启动时 restore() 是异步的，登录态晚到或重新登录后补齐数据
watch(() => auth.loggedIn, (v) => {
  if (v) refreshPlaylists(true)
})
</script>

<template>
  <div class="pls-view">
    <div class="card bar">
      <div class="bar-info">
        <span class="bar-title">我的歌单</span>
        <span class="muted bar-sub">共 {{ store.total }} 个歌单 · {{ playlistSongCount }} 首歌曲</span>
      </div>
      <button class="btn btn-subtle" :disabled="store.loading" @click="refresh">
        <Icon name="refresh" :size="14" />刷新
      </button>
      <button class="btn btn-primary" @click="openCreate">
        <Icon name="plus" :size="14" />新建
      </button>
    </div>

    <div v-if="!auth.loggedIn || store.needLogin" class="card state">
      <Icon name="lock" :size="20" />
      <div class="col">
        <p class="state-title">需要登录歌曲宝账号</p>
        <p class="muted">登录后即可查看、创建和管理云端歌单。</p>
      </div>
      <button class="tool-btn" @click="showLogin = true">去登录</button>
    </div>

    <div v-else-if="store.loading && !cards.length" class="card state">
      <span class="muted">正在读取歌单…</span>
    </div>

    <div v-else-if="store.error" class="card state">
      <Icon name="close" :size="18" />
      <div class="col">
        <p class="state-title">加载失败</p>
        <p class="muted">{{ store.error }}</p>
      </div>
      <button class="tool-btn" @click="refresh">重试</button>
    </div>

    <div v-else-if="!cards.length" class="empty muted">
      <Icon name="playlist" :size="32" />
      <p>还没有歌单，点「新建」把喜欢的歌整理成文件夹吧。</p>
      <button class="btn btn-primary" @click="openCreate">
        <Icon name="plus" :size="14" />新建歌单
      </button>
    </div>

    <div v-else class="grid">
      <div v-for="p in cards" :key="p.id" class="pl-card" role="button" tabindex="0" @click="openDetail(p)"
        @keydown.enter="openDetail(p)">
        <div class="pl-card-top">
          <span class="pl-folder"><Icon name="playlist" :size="22" /></span>
          <button class="pl-more" title="编辑 / 删除" aria-label="更多操作" @click.stop="onMore(p)">
            <Icon name="more" :size="18" />
          </button>
        </div>
        <p class="pl-card-title truncate">{{ p.title }}</p>
        <p class="pl-card-desc truncate">{{ p.description || '暂无简介' }}</p>
        <div class="pl-card-foot">
          <span>{{ p.songCount }} 首歌曲</span>
          <span v-if="p.createdAt" class="muted">{{ p.createdAt.slice(0, 10) }}</span>
        </div>
      </div>
    </div>

    <PlaylistModal v-if="modal" :playlist="modal.playlist || null" @close="modal = null" @saved="onSaved" />
    <LoginModal v-if="showLogin" @close="onLoginClose" />
  </div>
</template>

<style scoped>
.pls-view {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bar {
  display: flex;
  align-items: center;
  gap: 8px;
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

.state p.muted,
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

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 56px 16px;
  text-align: center;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.pl-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  cursor: pointer;
  transition: background var(--t), border-color var(--t);
}

.pl-card:active {
  background: var(--surface-active);
  border-color: var(--border-strong);
}

.pl-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.pl-folder {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--accent-soft);
  color: var(--accent);
}

.pl-more {
  display: flex;
  padding: 4px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.pl-card-title {
  margin: 4px 0 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.pl-card-desc {
  margin: 0;
  min-height: 18px;
  font-size: 12px;
  color: var(--text-3);
}

.pl-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

/* 触屏无 hover：去掉粘滞高亮，仅保留按下反馈 */
.bar .btn:hover {
  background: transparent;
  border-color: transparent;
  color: var(--text-3);
}

.bar .btn-primary:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}

@media (max-width: 340px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
