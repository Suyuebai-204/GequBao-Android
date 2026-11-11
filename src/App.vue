<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import pkg from '../package.json'
import Icon from './components/Icon.vue'
import SearchBox from './components/SearchBox.vue'
import PlayerSheet from './components/PlayerSheet.vue'
import MobileNav from './components/MobileNav.vue'
import { remoteFocus } from './mobile/remoteFocus.js'
import { player, playTrack, playList, playLocalList, close } from './composables/player'
import { recent, clearRecent } from './composables/recent'
import { openSheet, useSheet, closeSheet } from './composables/sheet'
import { showToast } from './composables/toast'
import { feedbackOpen, closeFeedback } from './composables/feedback'
import { restore } from './services/auth.js'
import { loadFavoriteMode } from './composables/favoriteMode.js'
import { App as CapacitorApp } from '@capacitor/app'
import HotView from './views/HotView.vue'
import LibraryView from './views/LibraryView.vue'
import ChartsView from './views/ChartsView.vue'
import AboutView from './views/AboutView.vue'
import ApiDocView from './views/ApiDocView.vue'
import AccountView from './views/AccountView.vue'
import SettingsView from './views/SettingsView.vue'
import SearchView from './views/SearchView.vue'
import MineView from './views/MineView.vue'
import DiscoverView from './views/DiscoverView.vue'
import FavoritesView from './views/FavoritesView.vue'
import PromoView from './views/PromoView.vue'
import PublicWelfareView from './views/PublicWelfareView.vue'
import ToastHost from './components/ToastHost.vue'
import ActionSheet from './components/ActionSheet.vue'
import SongMenu from './components/SongMenu.vue'
import { closeSongMenuLayer } from './composables/songMenu.js'
import PlaylistsView from './views/PlaylistsView.vue'
import PlaylistDetailView from './views/PlaylistDetailView.vue'

const collapsed = ref(false)
const sheetState = useSheet()

const views = {
  hot: { title: '热门推荐', component: HotView },
  library: { title: '本地音乐', component: LibraryView },
  mine: { title: '我的', component: MineView },
  charts: { title: '排行榜', component: ChartsView },
  about: { title: '关于', component: AboutView },
  apidoc: { title: 'API 文档', component: ApiDocView },
  user: { title: '我的账号', component: AccountView },
  settings: { title: '设置', component: SettingsView },
  search: { title: '搜索结果', component: SearchView },
  recent: { title: '最近播放', component: DiscoverView },
  fav: { title: '我的收藏', component: FavoritesView },
  windows: { title: '影悦', component: PromoView },
  welfare: { title: '公益寻亲', component: PublicWelfareView },
  playlists: { title: '我的歌单', component: PlaylistsView },
  playlist: { title: '歌单详情', component: PlaylistDetailView }
}

const history = ref([{ key: 'hot', payload: null }])
const future = ref([])

const current = computed(() => history.value[history.value.length - 1] ?? { key: 'discover', payload: null })
const canBack = computed(() => history.value.length > 1)
const canForward = computed(() => future.value.length > 0)
const hasMini = computed(() => !!player.song)
const CurrentView = computed(() => views[current.value.key]?.component ?? views.discover.component)
// 三个主要页面（底部导航）：处于这些页面时按返回不再回退，而是提示退出
const mainPages = new Set(['hot', 'charts', 'mine'])
const atTerminal = computed(() => !canBack.value || mainPages.has(current.value.key))
// 子页面：从「我的」进入，打开时隐藏顶部搜索栏与底部导航，仅保留返回按钮
const subPages = new Set(['recent', 'fav', 'playlists', 'playlist', 'library', 'settings', 'about', 'windows', 'welfare', 'apidoc', 'user'])
const isSubPage = computed(() => subPages.has(current.value.key))
// 在 <html> 上同步标记，供全局样式（如迷你播放条贴底）感知导航栏是否隐藏
watch(
  isSubPage,
  (v) => document.documentElement.classList.toggle('is-subpage', v),
  { immediate: true }
)
const reloadCount = ref(0)
const viewKey = computed(
  () => `${current.value.key}|${current.value.payload?.keyword ?? ''}|${current.value.payload?.playlistId ?? ''}|${reloadCount.value}`
)

function reload() {
  reloadCount.value += 1
}
const viewProps = computed(() => {
  const p = current.value.payload || {}
  if (current.value.key === 'search') return { keyword: p.keyword ?? '' }
  if (current.value.key === 'playlist') return { playlistId: p.playlistId ?? 0, title: p.title ?? '' }
  return {}
})

function navigate(key, payload = null) {
  if (current.value.key === key && JSON.stringify(current.value.payload) === JSON.stringify(payload)) return
  history.value.push({ key, payload })
  future.value = []
}
function back() {
  if (!canBack.value) return
  future.value.unshift(history.value.pop())
}
async function clearRecentList() {
  const v = await openSheet({
    title: '清空播放记录',
    options: [{ label: '清空全部', value: 'ok', danger: true }]
  })
  if (v !== 'ok') return
  clearRecent()
  showToast('播放记录已清除', { type: 'success' })
}
function forward() {
  if (!canForward.value) return
  history.value.push(future.value.shift())
}

// 退出确认：在主页面再次按返回时弹窗，2 秒内再次按返回则退出应用
const exitDialogVisible = ref(false)
let exitTimer = null
function showExitDialog() {
  exitDialogVisible.value = true
  clearTimeout(exitTimer)
  exitTimer = setTimeout(() => { exitDialogVisible.value = false }, 5000)
}
function hideExitDialog() {
  exitDialogVisible.value = false
  clearTimeout(exitTimer)
}
function exitApp() {
  hideExitDialog()
  if (window.isMobile) CapacitorApp.exitApp()
}
function search(keyword) {
  navigate('search', { keyword: String(keyword ?? '').trim() })
}

const searchBoxRef = ref(null)
const searchExpanded = ref(false)
function expandSearch() {
  searchExpanded.value = true
  nextTick(() => searchBoxRef.value?.focus?.())
}
function collapseSearch() {
  searchExpanded.value = false
}
function onSearchSubmit(keyword) {
  search(keyword)
  searchExpanded.value = false
}

function playItem(track) {
  playTrack(track)
}
function playListAt(payload) {
  if (payload?.local) playLocalList(payload.list, payload.index ?? 0)
  else playList(payload?.list, payload?.index ?? 0)
}

const contentEl = ref(null)
watch(viewKey, async () => {
  await nextTick()
  contentEl.value?.scrollTo({ top: 0 })
})

/* 返回键统一入口：TV 遥控器的 Escape 与 Android 的 backButton 都走这里。
   同一次物理返回在部分设备上会同时触发这两个通道，若不去重，第二次
   会看到「播放页已关闭」而直接落到弹出退出确认框的分支。 */
let lastBackAt = 0
function handleBack() {
  // 同一次物理按键的两个通道只消费一次，避免刚弹出的退出框被立刻关掉
  const now = Date.now()
  if (now - lastBackAt < 250) return
  lastBackAt = now

  // 由最上层弹窗到页面依次关闭，每次返回只处理一层
  if (closeSongMenuLayer()) return
  if (exitDialogVisible.value) {
    hideExitDialog()
    return
  }
  if (sheetState.open) {
    closeSheet(null)
    return
  }
  if (feedbackOpen.value) {
    closeFeedback()
    return
  }
  if (searchExpanded.value) {
    collapseSearch()
    return
  }
  if (player.open || document.documentElement.classList.contains('player-open')) {
    close()
    return
  }
  if (!atTerminal.value) {
    back()
    return
  }
  // 主页面按返回：仅弹出退出确认框，绝不自行退出
  showExitDialog()
}

function onGlobalKey(e) {
  if (e.key !== 'Escape') return
  handleBack()
}
window.addEventListener('keydown', onGlobalKey)

// 启动时恢复上次登录会话（仅重灌 cookie，不触发网络），随后加载收藏模式
onMounted(async () => {
  await restore().catch(() => {})
  await loadFavoriteMode().catch(() => {})
})

function handleHardwareBack() {
  handleBack()
}
if (window.isMobile) {
  CapacitorApp.addListener('backButton', handleHardwareBack)
}
</script>

<template>
  <div class="app-root" v-remote-focus :class="{ 'has-mini': hasMini, 'is-subpage': isSubPage }">
    <header v-if="!isSubPage" class="topbar">
      <Icon name="music" :size="30" filled class="topbar-logo" />
      <div style="display: grid;">
        <span class="topbar-title truncate">歌曲宝</span>
        <span class="topbar-subtitle truncate">Gequbao.com</span>
      </div>

      <div class="topbar-actions">
        <SearchBox v-if="searchExpanded" ref="searchBoxRef" @search="onSearchSubmit" @play="playItem" />
        <button v-if="!searchExpanded" class="icon-btn" title="搜索" @click="expandSearch">
          <Icon name="search" :size="18" />
        </button>
        <button v-else class="icon-btn" title="收起" @click="collapseSearch">
          <Icon name="close" :size="18" />
        </button>
        <span class="muted version">v{{ pkg.version }}</span>
      </div>
    </header>

    <!-- 搜索展开时：透明遮罩拦截栏外点击，避免误触导航/内容，点击即收起搜索 -->
    <div v-if="searchExpanded" class="search-backdrop" @click="collapseSearch"></div>

    <div class="layout">
      <MobileNav v-if="!isSubPage" :current="current.key" @navigate="(key) => navigate(key)" />

      <main class="main">
        <div v-if="isSubPage" class="subpage-head">
          <button class="icon-btn back" title="返回" @click="back">
            <Icon name="back" :size="22" />
          </button>
          <span class="subpage-title truncate">{{ current.key === 'playlist' ? (current.payload?.title || '歌单详情') : views[current.key]?.title }}</span>
          <button
            v-if="current.key === 'recent' && recent.list.length"
            class="btn btn-subtle danger subpage-action"
            title="清空"
            @click="clearRecentList"
          >
            <Icon name="trash" :size="14" />
            清空
          </button>
        </div>
        <section ref="contentEl" class="content">
          <div class="content-inner">
            <transition name="view" mode="out-in">
              <keep-alive :max="20">
                <component :is="CurrentView" :key="viewKey" v-bind="viewProps" @search="search" @play="playItem"
                  @play-list="playListAt" @navigate="(k, p) => navigate(k, p)" />
              </keep-alive>
            </transition>
          </div>
        </section>
      </main>
    </div>

    <PlayerSheet />
    <ToastHost />
    <ActionSheet />
    <SongMenu />

    <transition name="exit-fade">
      <div v-if="exitDialogVisible" class="exit-mask" @click.self="hideExitDialog">
        <div class="exit-dialog">
          <div class="exit-head">
            <Icon name="info" :size="20" style="margin-bottom: 15px;" />
            <p class="exit-text">确定要退出歌曲宝吗？</p>
          </div>
          <div class="exit-actions">
            <button class="exit-btn" @click="hideExitDialog">取消</button>
            <button class="exit-btn primary" @click="exitApp">退出</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.app-root {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.topbar {
  position: relative;
  z-index: 91;
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  padding-top: env(safe-area-inset-top, 0);
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}

/* 搜索展开时的透明遮罩：拦截栏外点击，避免误触导航/内容（点击即收起搜索） */
.search-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
}

.topbar-title {
  font-size: 18px;
  font-weight: 600;
  min-width: 0;
}
.topbar-subtitle {
  font-size: 10px;
  line-height: 1;
  color: gray;
}
.topbar-logo {
  flex-shrink: 0;
  color: var(--accent);
}

.topbar-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.topbar-actions :deep(.search-box) {
  flex: 1 1 200px;
  max-width: min(420px, 72vw);
}

.spacer {
  flex: 1;
}

.version {
  font-size: 12px;
  flex-shrink: 0;
}

.content {
  flex: 1;
  min-height: 0;
  padding: 16px 16px 92px;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.content::-webkit-scrollbar {
  width: 0;
  height: 0;
}

/* 子页面：隐藏顶栏/底栏后，提供带返回按钮的精简头 */
.subpage-head {
  flex-shrink: 0;
  height: 52px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  padding-top: env(safe-area-inset-top, 0);
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.subpage-head .back { margin-left: -6px; }
.subpage-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text);
  min-width: 0;
}
.app-root.is-subpage .content {
  padding: 16px 16px 24px;
}
/* 子页面播放迷你条浮起时，给底部留出空间 */
.app-root.is-subpage.has-mini .content {
  padding-bottom: 88px;
}
/* 子页面下隐藏各视图自身的标题（已由子页头展示），避免重复 */
.app-root.is-subpage .content :deep(h1) {
  display: none;
}
.subpage-action { margin-left: auto; }

/* TV：横屏大屏，四周安全边距，列表区域更宽 */
:global(html.is-tv) .content {
  padding: 24px 5vw 96px;
}

:global(html.is-tv) .topbar {
  height: 64px;
}

:global(html.is-tv) .topbar-title {
  font-size: 22px;
}

/* 宽屏（平板 / 横屏）：内容区留白更充足 */
:global(html.is-wide) .content {
  padding: 20px 28px 92px;
}

/* 焦点高亮：TV 遥控器选中态（放大 + 发光边框） */
:global(html.is-tv) [tabindex]:focus-visible,
:global(html.is-tv) button:focus-visible,
:global(html.is-tv) a:focus-visible,
:global(html.is-tv) input:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
  transform: scale(1.04);
  transition: transform var(--t);
}

/* 退出确认弹窗 */
.exit-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  animation: mask-in 0.18s ease both;
}

.exit-dialog {
  width: min(300px, 80vw);
  padding: 20px 18px 14px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: var(--shadow-3);
  text-align: center;
  animation: dialog-pop 0.2s var(--ease) both;
}

.exit-dialog svg {
  color: var(--accent);
}

.exit-head {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
}

.exit-text {
  margin: 0 0 16px;
  font-size: 15px;
  color: var(--text);
  text-align: center;
}

.exit-actions {
  display: flex;
  gap: 10px;
}

.exit-btn {
  flex: 1;
  height: 40px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-2);
  color: var(--text);
  font-size: 14px;
  cursor: pointer;
  transition: background var(--t), filter var(--t);
}

.exit-btn:hover {
  background: var(--surface-active);
}

.exit-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.exit-btn.primary:hover {
  filter: brightness(0.95);
}

@keyframes dialog-pop {
  from {
    transform: scale(0.9);
    opacity: 0;
  }

  to {
    transform: scale(1);
    opacity: 1;
  }
}

.exit-fade-leave-active {
  transition: opacity 0.18s ease;
}

.exit-fade-leave-to {
  opacity: 0;
}
</style>
