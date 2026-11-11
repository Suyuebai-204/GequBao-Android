<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import Icon from '../components/Icon.vue'
import SongList from '../components/SongList.vue'
import LoginModal from '../components/LoginModal.vue'
import { player } from '../composables/player'
import { getFavoriteIds, useFavorites } from '../composables/favorites.js'
import {
  effectiveMode,
  favoriteMode,
  cloudList,
  loadCloudPage,
  syncCloudFavorites,
  removeFavorited
} from '../composables/favoriteMode.js'
import { showToast } from '../composables/toast.js'
import { openSheet } from '../composables/sheet.js'

const emit = defineEmits(['play-list', 'navigate'])
const { favorites } = useFavorites()

const loading = ref(false)
const error = ref('')
const localSongs = ref([])
const keyword = ref('')
const showLogin = ref(false)
const pendingId = ref(null) // 覆盖「确认弹窗 + 删除请求」全过程，防止连点

const isCloud = computed(() => effectiveMode.value === 'cloud')
const songs = computed(() => (isCloud.value ? cloudList.songs : localSongs.value))
const busy = computed(() => (isCloud.value ? cloudList.loading : loading.value))
const currentError = computed(() =>
  isCloud.value ? (cloudList.error || (cloudList.needLogin ? '登录状态已失效，请重新登录' : '')) : error.value
)
const modeHint = computed(() => {
  if (isCloud.value) return `跟随歌曲宝账号同步，共 ${cloudList.total} 首`
  if (favoriteMode.value === 'cloud') return '已选云端收藏，登录后可同步'
  return '仅保存在本机，无需登录'
})

async function resolve(id) {
  try {
    const res = await window.api.player.song(id)
    if (res?.ok) {
      const d = res.data.detail || {}
      const musicId = d.id ?? id
      return {
        id: musicId,
        musicId,
        title: d.title || '未知歌曲',
        artist: d.artist || '未知歌手',
        cover: d.cover || '',
        durationSec: d.durationSec || 0
      }
    }
  } catch {
    /* 忽略单条失败 */
  }
  return { id, musicId: id, title: `歌曲 #${id}`, artist: '无法加载信息（可能已下架）', cover: '' }
}

async function loadLocal() {
  const ids = getFavoriteIds()
  if (!ids.length) {
    localSongs.value = []
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    localSongs.value = (await Promise.all(ids.map(resolve))).filter(Boolean)
  } catch (e) {
    error.value = e?.message || '加载收藏失败'
    showToast(error.value, { type: 'error' })
  } finally {
    loading.value = false
  }
}

// 云端收藏的加载 / 搜索 / 翻页统一补失败提示；进行中由全局网络提示负责
async function loadPage(opts) {
  const r = await loadCloudPage(opts)
  if (r && !r.ok) showToast(r.msg || r.error || '加载失败', { type: 'error' })
}

async function refresh() {
  if (isCloud.value) {
    await loadPage({ keyword: keyword.value.trim(), page: cloudList.page })
  } else {
    await loadLocal()
  }
}

async function search() {
  if (!isCloud.value) return
  await loadPage({ keyword: keyword.value.trim(), page: 1 })
}

async function goPage(page) {
  if (page < 1 || page > cloudList.lastPage || cloudList.loading) return
  await loadPage({ keyword: keyword.value.trim(), page })
}

async function onRemove(id) {
  if (pendingId.value != null) return
  pendingId.value = id
  try {
    if (isCloud.value) {
      const song = songs.value.find((s) => String(s.id) === String(id))
      const name = song?.title || '这首歌曲'
      const shortName = name.length > 18 ? `${name.slice(0, 18)}…` : name
      const v = await openSheet({
        title: `确定从云端收藏移除「${shortName}」吗？此操作会同步到账号，无法撤销。`,
        options: [{ label: '移除云端收藏', value: 'remove', danger: true }]
      })
      if (v !== 'remove') return
    }
    const r = await removeFavorited(id)
    showToast(r.msg || '操作失败', { type: r.ok ? 'success' : 'error' })
    if (r.ok && !isCloud.value) loadLocal()
  } finally {
    pendingId.value = null
  }
}

function onPlay(index) {
  // 云端列表的 id 即 music.id，交给播放器按 id 拉详情播放
  emit('play-list', { list: songs.value, index })
}

function onLogin() {
  showLogin.value = true
}

function onLoginClose() {
  showLogin.value = false
  syncCloudFavorites(true)
  refresh()
}

watch(effectiveMode, () => {
  keyword.value = ''
  if (isCloud.value) {
    syncCloudFavorites(true)
    loadCloudPage({ keyword: '', page: 1 })
  } else {
    loadLocal()
  }
})
watch(favorites, () => {
  if (!isCloud.value) loadLocal()
}, { deep: true })

onMounted(() => {
  if (isCloud.value) {
    syncCloudFavorites(true)
    loadCloudPage({ keyword: '', page: 1 })
  } else {
    loadLocal()
  }
})
</script>

<template>
  <div class="view fav-view">
    <!-- 模式条 -->
    <div class="mode-bar card">
      <div class="mode-info">
        <span class="mode-badge" :class="{ cloud: isCloud }">
          <Icon :name="isCloud ? 'cloud' : 'music'" :size="14" />
          {{ isCloud ? '云端收藏' : '本地收藏' }}
        </span>
        <span class="mode-hint muted" :title="modeHint">{{ modeHint }}</span>
      </div>
      <button class="mode-switch" @click="emit('navigate', 'settings')">
        <Icon name="settings" :size="14" />
        切换方式
      </button>
    </div>

    <!-- 云端：搜索 + 刷新 -->
    <div v-if="isCloud" class="tools">
      <input
        v-model="keyword"
        class="search-input"
        type="search"
        placeholder="搜索云端收藏的歌曲 / 歌手"
        @keyup.enter="search"
      />
      <button class="tool-btn" @click="search">搜索</button>
      <button class="tool-btn" :disabled="busy" @click="refresh">刷新</button>
    </div>

    <!-- 会话失效 -->
    <div v-if="isCloud && cloudList.needLogin" class="card state login-state">
      <Icon name="lock" :size="20" />
      <div class="col" style="gap: 4px">
        <p class="state-title">登录状态已失效</p>
        <p class="muted">云端收藏需要登录账号，请重新登录后再试。</p>
      </div>
      <button class="tool-btn" @click="onLogin">去登录</button>
    </div>

    <div v-else-if="busy" class="card state">
      <span class="muted">正在读取收藏…</span>
    </div>

    <div v-else-if="currentError" class="card state">
      <Icon name="close" :size="18" />
      <div>
        <p class="state-title">加载失败</p>
        <p class="muted">{{ currentError }}</p>
      </div>
      <button class="tool-btn" @click="refresh">重试</button>
    </div>

    <div v-else-if="!songs.length" class="empty muted">
      <Icon name="heart" :size="30" />
      <p v-if="isCloud && keyword">没有匹配「{{ keyword }}」的云端收藏。</p>
      <p v-else-if="isCloud">云端还没有收藏，在播放页点「收藏」即可同步到账号。</p>
      <p v-else>还没有收藏的歌曲。<br />在播放页点「收藏」把喜欢的歌加进来吧。</p>
    </div>

    <template v-else>
      <SongList
        :songs="songs"
        :active-id="player.song?.musicId || player.song?.id"
        @play="onPlay"
      >
        <template #trailing="{ id }">
          <button
            class="remove-btn"
            :disabled="pendingId != null"
            :title="String(pendingId) === String(id) ? '正在移除…' : '取消收藏'"
            @click.stop="onRemove(id)"
          >
            <Icon name="trash" :size="15" />
          </button>
        </template>
      </SongList>

      <!-- 云端分页 -->
      <div v-if="isCloud && cloudList.lastPage > 1" class="pager">
        <button class="tool-btn" :disabled="cloudList.page <= 1" @click="goPage(cloudList.page - 1)">
          上一页
        </button>
        <span class="muted">{{ cloudList.page }} / {{ cloudList.lastPage }} 页</span>
        <button class="tool-btn" :disabled="cloudList.page >= cloudList.lastPage" @click="goPage(cloudList.page + 1)">
          下一页
        </button>
      </div>
    </template>

    <!-- 会话失效时提供登录引导 -->
    <LoginModal v-if="showLogin" @close="onLoginClose" />
  </div>
</template>

<style scoped>
.fav-view {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.state {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-3);
}
.state-title {
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  margin: 0;
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
.mode-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
}
.mode-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.mode-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  flex-shrink: 0;
}
.mode-badge.cloud {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  color: var(--accent);
}
.mode-hint {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mode-switch,
.tool-btn {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  flex-shrink: 0;
}
.mode-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: color var(--t), border-color var(--t), background var(--t), transform var(--t);
}
.mode-switch:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.mode-switch:active {
  transform: scale(0.96);
}
.tool-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

/* 窄屏把说明文字放到第二行，避免被压成省略号 */
@media (max-width: 480px) {
  .mode-bar {
    gap: 10px;
    padding: 10px 12px;
  }
  .mode-info {
    flex-wrap: wrap;
    gap: 4px 8px;
  }
  .mode-hint {
    flex: 1 1 100%;
    font-size: 11px;
    white-space: normal;
  }
}
.tools {
  display: flex;
  gap: 8px;
  align-items: center;
}
.search-input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text);
  font-size: 14px;
  outline: none;
}
.search-input:focus {
  border-color: var(--accent);
}
.login-state {
  justify-content: space-between;
  flex-wrap: wrap;
}
.remove-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  flex-shrink: 0;
}
.remove-btn:hover {
  background: color-mix(in srgb, #ff5a5a 14%, transparent);
  color: #ff5a5a;
}
.remove-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 6px 0;
  font-size: 13px;
}
</style>
