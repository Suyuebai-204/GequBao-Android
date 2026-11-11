<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import PlaylistModal from './PlaylistModal.vue'
import LoginModal from './LoginModal.vue'
import {
  useSongMenu,
  songMenuFaved,
  closeSongMenu,
  menuToggleFavorite,
  menuCopyUrl,
  menuDownload,
  menuOpenPage,
  menuOpenPicker,
  menuRefreshPicker,
  menuPickPlaylist
} from '../composables/songMenu.js'
import { usePlaylists } from '../composables/playlists.js'
import { fullCover } from '../composables/player.js'
import { useAuth } from '../services/auth.js'

const menu = useSongMenu()
const store = usePlaylists()
const auth = useAuth()

const cover = computed(() => fullCover(menu.song?.cover || ''))
const needLogin = computed(() => !auth.loggedIn || store.needLogin)

const actions = computed(() => [
  {
    key: 'fav',
    icon: songMenuFaved.value ? 'heart' : 'heart-outline',
    label: songMenuFaved.value ? '取消收藏' : '收藏歌曲',
    accent: songMenuFaved.value,
    run: menuToggleFavorite
  },
  { key: 'playlist', icon: 'playlist', label: '添加到歌单', run: menuOpenPicker },
  { key: 'copy', icon: 'link', label: '复制直链', run: menuCopyUrl },
  { key: 'download', icon: 'download', label: '下载歌曲', run: menuDownload },
  { key: 'web', icon: 'web', label: '打开歌曲网页', run: menuOpenPage }
])

function onLoginClose() {
  menu.login = false
  if (auth.loggedIn) menuRefreshPicker()
}

async function onPlaylistCreated() {
  menu.create = false
  await menuRefreshPicker()
}
</script>

<template>
  <!-- 更多操作：安卓原生风格底部动作面板 -->
  <transition name="sm-fade">
    <div v-if="menu.open" class="sm-mask" @click.self="closeSongMenu">
      <div class="sm-sheet" role="dialog" aria-modal="true" aria-label="歌曲更多操作">
        <span class="sm-grip"></span>

        <div class="sm-head">
          <img v-if="cover" class="sm-cover" :src="cover" alt="" />
          <span v-else class="sm-cover sm-cover-empty"><Icon name="music" :size="20" /></span>
          <div class="sm-head-text">
            <span class="sm-title truncate">{{ menu.song?.title || '未知歌曲' }}</span>
            <span class="sm-artist truncate">{{ menu.song?.artist || '未知歌手' }}</span>
          </div>
          <button class="sm-close" title="关闭" aria-label="关闭" @click="closeSongMenu">
            <Icon name="close" :size="18" />
          </button>
        </div>

        <div class="sm-actions">
          <button v-for="a in actions" :key="a.key" class="sm-item" :class="{ accent: a.accent }"
            :disabled="menu.busy" @click="a.run">
            <Icon :name="a.icon" :size="20" class="sm-item-icon" />
            <span class="sm-item-label">{{ a.label }}</span>
          </button>
          <button class="sm-cancel" @click="closeSongMenu">取消</button>
        </div>
      </div>
    </div>
  </transition>

  <!-- 二级弹窗：通过 /member/playlist/list 刷新歌单后选择要加入的歌单 -->
  <transition name="sm-fade">
    <div v-if="menu.picker" class="sp-mask" @click.self="menu.picker = false">
      <div class="sp-dialog" role="dialog" aria-modal="true" aria-label="添加到歌单">
        <header class="sp-head">
          <span>添加到歌单</span>
          <button class="sm-close" title="关闭" aria-label="关闭" @click="menu.picker = false">
            <Icon name="close" :size="18" />
          </button>
        </header>
        <p class="sp-sub truncate">选择歌单，把「{{ menu.song?.title || '这首歌曲' }}」加进去</p>

        <div v-if="needLogin" class="sp-state">
          <Icon name="lock" :size="24" />
          <p>登录歌曲宝账号后才能加入云端歌单</p>
          <button class="btn btn-primary" @click="menu.login = true">去登录</button>
        </div>

        <div v-else class="sp-list">
          <p v-if="menu.pickerLoading && !store.items.length" class="sp-hint">正在刷新歌单…</p>
          <p v-else-if="store.error" class="sp-hint">{{ store.error }}</p>
          <p v-else-if="!store.items.length" class="sp-hint">还没有歌单，先新建一个吧</p>

          <button v-for="p in store.items" :key="p.id" class="sp-item" :disabled="menu.adding === p.id"
            @click="menuPickPlaylist(p)">
            <span class="sp-folder"><Icon name="playlist" :size="18" /></span>
            <span class="sp-info">
              <span class="sp-name truncate">{{ p.title }}</span>
              <span class="sp-count">{{ p.songCount }} 首歌曲</span>
            </span>
            <Icon :name="menu.adding === p.id ? 'refresh' : 'plus'" :size="18" class="sp-add" />
          </button>
        </div>

        <div class="sp-actions">
          <button class="btn btn-subtle" @click="menu.create = true">
            <Icon name="plus" :size="15" />新建歌单
          </button>
          <button class="btn btn-subtle" :disabled="menu.pickerLoading || needLogin" @click="menuRefreshPicker">
            <Icon name="refresh" :size="15" />刷新列表
          </button>
        </div>
      </div>
    </div>
  </transition>

  <PlaylistModal v-if="menu.create" @close="menu.create = false" @saved="onPlaylistCreated" />
  <LoginModal v-if="menu.login" @close="onLoginClose" />
</template>

<style scoped>
.sm-mask,
.sp-mask {
  position: fixed;
  inset: 0;
}

.sm-mask {
  background: rgba(0, 0, 0, 0.48);
  z-index: 260;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sp-mask {
  z-index: 280;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  /* 叠在动作面板之上，颜色调浅避免两层遮罩过暗 */
  background: rgba(0, 0, 0, 0.3);
}

.sm-sheet {
  width: 100%;
  max-width: 480px;
  margin: 0 8px calc(8px + env(safe-area-inset-bottom, 0px));
  padding: 6px 8px 10px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface);
  box-shadow: var(--shadow-3);
  animation: sm-up 0.24s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.sm-grip {
  display: block;
  width: 36px;
  height: 4px;
  margin: 2px auto 8px;
  border-radius: 2px;
  background: var(--border-strong);
}

.sm-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px 12px;
  border-bottom: 1px solid var(--border);
}

.sm-cover {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  object-fit: cover;
  background: var(--surface-2);
}

.sm-cover-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
}

.sm-head-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.sm-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.sm-artist {
  font-size: 12px;
  color: var(--text-3);
}

.sm-close {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.sm-close:active {
  background: var(--surface-active);
}

.sm-actions {
  padding-top: 6px;
}

.sm-item {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  height: 50px;
  padding: 0 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--text);
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}

/* 触屏无 hover：只保留按下反馈，避免高亮粘滞 */
.sm-item:active:not(:disabled) {
  background: var(--surface-active);
}

.sm-item:disabled {
  opacity: 0.55;
  cursor: default;
}

.sm-item-icon {
  flex-shrink: 0;
  color: var(--text-3);
}

.sm-item.accent,
.sm-item.accent .sm-item-icon {
  color: var(--accent);
}

.sm-item-label {
  flex: 1;
  min-width: 0;
}

.sm-cancel {
  width: 100%;
  height: 46px;
  margin-top: 6px;
  border: 0;
  border-radius: 12px;
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 15px;
  cursor: pointer;
}

.sm-cancel:active {
  background: var(--surface-active);
}

.sp-dialog {
  width: min(400px, 94vw);
  max-height: min(76vh, 560px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: var(--shadow-3);
  animation: sm-pop 0.2s var(--ease) both;
}

.sp-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 12px 12px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.sp-sub {
  flex-shrink: 0;
  margin: 0;
  padding: 10px 16px 4px;
  font-size: 12px;
  color: var(--text-3);
}

.sp-list,
.sp-state {
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px 10px 10px;
}

.sp-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-3);
  font-size: 13px;
}

.sp-state p {
  margin: 0;
  text-align: center;
}

.sp-hint {
  margin: 0;
  padding: 22px 8px;
  text-align: center;
  font-size: 13px;
  color: var(--text-3);
}

.sp-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  text-align: left;
  color: var(--text);
  cursor: pointer;
}

.sp-item:active:not(:disabled) {
  background: var(--surface-active);
}

.sp-item:disabled {
  opacity: 0.6;
  cursor: default;
}

.sp-folder {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent);
}

.sp-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sp-name {
  font-size: 14px;
  font-weight: 500;
}

.sp-count {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.sp-add {
  flex-shrink: 0;
  color: var(--accent);
}

.sp-actions {
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  padding: 10px 12px calc(12px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--border);
}

.sp-actions .btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

/* 触屏无 hover：去掉点击后粘滞的高亮 */
.sp-actions .btn:hover {
  background: transparent;
  border-color: transparent;
  color: var(--text-3);
}

.sp-actions .btn:active:not(:disabled) {
  background: var(--surface-active);
  color: var(--text);
}

.sm-fade-enter-active,
.sm-fade-leave-active {
  transition: opacity 0.2s ease;
}

.sm-fade-enter-from,
.sm-fade-leave-to {
  opacity: 0;
}

@keyframes sm-up {
  from {
    transform: translateY(24px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes sm-pop {
  from {
    transform: scale(0.94);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
