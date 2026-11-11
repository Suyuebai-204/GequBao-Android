<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Icon from './Icon.vue'
import FeedbackModal from './FeedbackModal.vue'
import {
  activeLyricIndex,
  close,
  copyUrl,
  download,
  formatTime,
  next,
  open,
  player,
  playIndex,
  prev,
  progress,
  retry,
  seek,
  setVolume,
  toggle,
  toggleMute,
  cycleRepeat,
  fullCover
} from '../composables/player'
import { isFavorited, toggleFavorited } from '../composables/favoriteMode.js'
import { showToast } from '../composables/toast'
import { openSongMenu } from '../composables/songMenu.js'
import { desktopLyric, toggleDesktopLyric } from '../composables/desktopLyric'
import { feedbackOpen, openFeedback, closeFeedback } from '../composables/feedback'

// 站点启用人机验证时，引导用户到原页面播放
function openInBrowser() {
  const id = player.song?.id
  if (!id) return
  window.api?.openExternal(`https://www.gequbao.com/music/${id}`)
}

// 当前歌曲的更多操作（本地音乐没有 musicId，不提供）
const canMore = computed(() => !!player.song?.id && !player.song?.local)
function openMore() {
  if (canMore.value) openSongMenu(player.song)
}

/* 长按歌曲信息 / 歌词区域等价于点「更多」；不绑定到 .stage，
   避免播放队列（正在播放列表）里的条目长按被误判。 */
let pressTimer = null
let longPressAt = 0
let pressX = 0
let pressY = 0
function clearPressTimer() {
  if (pressTimer) clearTimeout(pressTimer)
  pressTimer = null
}
function onSongTouchStart(e) {
  if (!canMore.value) return
  clearPressTimer()
  longPressAt = 0
  const t = e.touches?.[0]
  if (!t) return
  pressX = t.clientX
  pressY = t.clientY
  pressTimer = setTimeout(() => {
    pressTimer = null
    longPressAt = Date.now()
    navigator.vibrate?.(12)
    openMore()
  }, 500)
}
function onSongTouchMove(e) {
  if (!pressTimer) return
  const t = e.touches?.[0]
  if (t && Math.hypot(t.clientX - pressX, t.clientY - pressY) > 10) clearPressTimer()
}
function onSongContextMenu(e) {
  if (!canMore.value) return
  e.preventDefault()
  longPressAt = Date.now()
  openMore()
}
function consumeLongPress() {
  const fired = Date.now() - longPressAt < 1200
  longPressAt = 0
  return fired
}

const sheetEl = ref(null)
const barEl = ref(null)
const lyricBox = ref(null)
const plListEl = ref(null)

const dragY = ref(0)
const dragging = ref(false)
const seeking = ref(false)
const showLyric = ref(false)
const showPlaylist = ref(false)

// 横屏时歌词与封面常驻同屏显示（不依赖手动切换），用于驱动滚动 / 布局
const landscape = ref(typeof matchMedia === 'function' ? matchMedia('(orientation: landscape)').matches : false)
if (typeof matchMedia === 'function') {
  matchMedia('(orientation: landscape)').addEventListener('change', (e) => { landscape.value = e.matches })
}
// 歌词“可见/应滚动”的条件：手动切换 或 处于横屏
const lyricShown = computed(() => showLyric.value || landscape.value)
function onPlayIndex(i) {
  playIndex(i)
  showPlaylist.value = false
}


let startY = 0

const cover = computed(() => player.song?.cover || '')
const lrc = computed(() => (Array.isArray(player.song?.lrc) ? player.song.lrc : []))
const totalDuration = computed(() => player.duration || player.song?.durationSec || 0)

const faved = computed(() => isFavorited(player.song?.id))
const favBusy = ref(false)
async function onFav() {
  if (favBusy.value) return
  favBusy.value = true
  try {
    const r = await toggleFavorited(player.song)
    if (!r.ok) {
      showToast(r.msg || '操作失败', { type: 'error' })
      return
    }
    showToast(r.msg || (r.added ? '已收藏' : '已取消收藏'), {
      type: r.added ? 'success' : 'info'
    })
  } finally {
    favBusy.value = false
  }
}
const percent = computed(() => `${(progress.value * 100).toFixed(3)}%`)

const repeatLabel = computed(
  () => ({ off: '顺序', all: '列表', one: '单曲' }[player.repeat] || '顺序')
)

const sheetStyle = computed(() => ({
  transform: player.open ? `translateY(${dragY.value}px)` : 'translateY(100%)'
}))

const statusText = computed(() => {
  if (player.loading) return '正在获取播放地址…'
  if (player.error) return player.error
  if (player.source === 'fallback') return '已使用备用直链播放'
  return ''
})

const downloadLabel = computed(() => {
  const state = player.download
  if (state.active) return state.percent ? `${state.percent}%` : '下载中…'
  return state.message || '下载'
})

const activeLyricText = computed(() => {
  const i = activeLyricIndex.value
  if (i < 0) return ''
  return String(player.song?.lrc?.[i]?.text || '').trim()
})

// 折叠态（仅封面+歌名）下展示的两行歌词预览：当前行 + 下一句，并染色
const lyricPreview = computed(() => {
  const arr = lrc.value
  if (!arr.length) return { cur: '', next: '' }
  const i = activeLyricIndex.value >= 0 ? activeLyricIndex.value : 0
  const cur = String(arr[Math.min(i, arr.length - 1)]?.text || '').trim()
  const next = String(arr[i + 1]?.text || '').trim()
  return { cur, next }
})

function toggleLyric() {
  if (consumeLongPress()) return
  showLyric.value = !showLyric.value
}

function onLyricClick(time) {
  if (consumeLongPress()) return
  seek(time)
}

const copyState = ref('')
async function onCopyUrl() {
  const ok = await copyUrl()
  showToast(ok ? '已复制直链' : '复制失败', { type: ok ? 'success' : 'error' })
  copyState.value = ok ? 'ok' : 'fail'
  setTimeout(() => {
    if (copyState.value === (ok ? 'ok' : 'fail')) copyState.value = ''
  }, 1500)
}

const backdropStyle = computed(() => {
  const c = player.song?.cover
  return c ? { backgroundImage: `url("${c}")` } : {}
})

function onHandleDown(e) {
  if (e.button !== 0 || !player.open) return
  dragging.value = true
  startY = e.clientY
  dragY.value = 0
  window.addEventListener('mousemove', onHandleMove)
  window.addEventListener('mouseup', onHandleUp)
  e.preventDefault()
}

function onHandleMove(e) {
  if (!dragging.value) return
  dragY.value = Math.max(0, e.clientY - startY)
}

function onHandleUp() {
  window.removeEventListener('mousemove', onHandleMove)
  window.removeEventListener('mouseup', onHandleUp)
  if (!dragging.value) return
  dragging.value = false

  const threshold = Math.min(240, Math.max(90, window.innerHeight * 0.18))
  if (dragY.value > threshold) close()
  else dragY.value = 0
}

// 触摸下滑收起（手机端）
function onTouchStart(e) {
  if (!player.open) return
  dragging.value = true
  startY = e.touches[0].clientY
  dragY.value = 0
}
function onTouchMove(e) {
  if (!dragging.value) return
  dragY.value = Math.max(0, e.touches[0].clientY - startY)
}
function onTouchEnd() {
  if (!dragging.value) return
  dragging.value = false
  const threshold = Math.min(240, Math.max(70, window.innerHeight * 0.16))
  if (dragY.value > threshold) close()
  else dragY.value = 0
}

function onTransitionEnd(e) {
  if (e.target === sheetEl.value && !player.open) dragY.value = 0
}

function ratioFromEvent(e) {
  const rect = barEl.value?.getBoundingClientRect()
  if (!rect || !rect.width) return 0
  return Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
}

function onBarDown(e) {
  if (!totalDuration.value) return
  seeking.value = true
  seek(ratioFromEvent(e) * totalDuration.value)
  window.addEventListener('mousemove', onBarMove)
  window.addEventListener('mouseup', onBarUp)
  e.preventDefault()
}

function onBarMove(e) {
  if (seeking.value) seek(ratioFromEvent(e) * totalDuration.value)
}

function onBarUp() {
  seeking.value = false
  window.removeEventListener('mousemove', onBarMove)
  window.removeEventListener('mouseup', onBarUp)
}

/* 触摸拖动进度（手机端） */
function ratioFromTouch(e) {
  const rect = barEl.value?.getBoundingClientRect()
  if (!rect || !rect.width) return 0
  const t = e.touches[0] || e.changedTouches[0]
  if (!t) return 0
  return Math.min(Math.max((t.clientX - rect.left) / rect.width, 0), 1)
}
function onBarTouchStart(e) {
  if (!totalDuration.value) return
  seeking.value = true
  seek(ratioFromTouch(e) * totalDuration.value)
  e.preventDefault()
}
function onBarTouchMove(e) {
  if (seeking.value) {
    seek(ratioFromTouch(e) * totalDuration.value)
    e.preventDefault()
  }
}
function onBarTouchEnd() {
  seeking.value = false
}

function onVolumeInput(e) {
  setVolume(e.target.value)
}

function scrollLyricToActive() {
  const box = lyricBox.value
  const index = activeLyricIndex.value
  if (!box || index < 0) return
  const line = box.children?.[index]
  if (!line) return
  box.scrollTo({
    top: Math.max(0, line.offsetTop - box.clientHeight / 2 + line.offsetHeight / 2),
    behavior: 'smooth'
  })
}

// 打开播放列表时，把当前曲目滚动到可视区中央
watch(showPlaylist, async (on) => {
  if (!on) return
  await nextTick()
  const list = plListEl.value
  const active = list?.querySelector?.('.pl-item.active')
  if (!list || !active) return
  list.scrollTop = Math.max(0, active.offsetTop - list.clientHeight / 2 + active.offsetHeight / 2)
})

watch(activeLyricIndex, async (index) => {
  if (!player.open || !lyricShown.value || index < 0) return
  await nextTick()
  scrollLyricToActive()
})

// 进入横屏（歌词常驻）时把当前行滚动到可视区中央
watch(landscape, async (on) => {
  if (!on || !player.open) return
  await nextTick()
  scrollLyricToActive()
})

// 返回键（含 Escape）统一由 App.vue 的 handleBack 处理，
// 这里不再重复监听，避免同一次返回被处理两次。

watch(
  () => player.open,
  (isOpen) => {
    document.documentElement.classList.toggle('player-open', isOpen)
    // 收起播放页时一并关闭反馈小窗
    if (!isOpen) closeFeedback()
  }
)

watch(
  () => player.song?.id,
  () => {
    if (lyricBox.value) lyricBox.value.scrollTop = 0
  }
)

onBeforeUnmount(() => {
  clearPressTimer()
  window.removeEventListener('mousemove', onHandleMove)
  window.removeEventListener('mouseup', onHandleUp)
  window.removeEventListener('mousemove', onBarMove)
  window.removeEventListener('mouseup', onBarUp)
  document.documentElement.classList.remove('player-open')
})
</script>

<template>
  <section ref="sheetEl" class="sheet" :class="{ open: player.open, dragging }" :style="sheetStyle"
    @transitionend="onTransitionEnd">
    <div class="backdrop" :style="backdropStyle"></div>
    <div class="scrim"></div>

    <header class="sheet-top">
      <button class="icon-btn" title="收起播放页" @click="close">
        <Icon name="down" :size="20" />
      </button>

      <div class="drag" title="按住向下拖动可收起" @mousedown="onHandleDown" @touchstart="onTouchStart" @touchmove="onTouchMove"
        @touchend="onTouchEnd">
        <span class="grip"></span>
      </div>


      <button class="icon-btn" :class="{ active: feedbackOpen }" :disabled="!player.song?.id" title="歌曲反馈"
        @click="openFeedback">
        <Icon name="feedback" :size="18" />
      </button>

      <button class="icon-btn" :disabled="!canMore" title="更多操作" aria-label="更多操作" @click="openMore">
        <Icon name="more" :size="20" />
      </button>

      <button class="icon-btn" :class="{ active: showPlaylist }" title="播放列表" aria-label="播放列表"
        @click="showPlaylist = !showPlaylist">
        <Icon name="playlist" :size="20" />
      </button>
    </header>

    <div class="stage">
      <!-- 黑胶唱片 + 歌曲信息 -->
      <div class="visual" :class="{ hidden: lyricShown }" @contextmenu="onSongContextMenu"
        @touchstart.passive="onSongTouchStart" @touchmove.passive="onSongTouchMove"
        @touchend="clearPressTimer" @touchcancel="clearPressTimer">
        <div class="disc" :class="{ spinning: player.playing }" @click="toggleLyric">
          <img v-if="cover" class="disc-cover" :src="cover" alt="封面" />
          <div v-else class="disc-cover empty">
            <Icon name="music" :size="40" />
          </div>
          <span class="disc-hole"></span>
        </div>

        <div class="meta">
          <h2 class="title truncate" :title="player.song?.title">
            {{ player.song?.title || '未在播放' }}
          </h2>
          <p class="artist truncate" :title="player.song?.artist">
            {{ player.song?.artist || '—' }}
          </p>
        </div>

        <div v-if="lrc.length && !showLyric" class="lyric-preview" @click="toggleLyric">
          <p class="lp-cur truncate">{{ lyricPreview.cur || '纯音乐，请欣赏' }}</p>
          <p v-if="lyricPreview.next" class="lp-next truncate">{{ lyricPreview.next }}</p>
        </div>
      </div>

      <!-- 歌词 -->
      <div ref="lyricBox" class="lyrics" :class="{ visible: lyricShown }" @contextmenu="onSongContextMenu"
        @touchstart.passive="onSongTouchStart" @touchmove.passive="onSongTouchMove"
        @touchend="clearPressTimer" @touchcancel="clearPressTimer">
        <p v-if="!lrc.length" class="lyric-empty">
          {{ player.loading ? '正在加载歌词…' : '暂无歌词' }}
        </p>
        <p v-for="(line, i) in lrc" :key="`${line.time}-${i}`" class="lyric-line"
          :class="{ active: i === activeLyricIndex, passed: i < activeLyricIndex }" @click="onLyricClick(line.time)">
          {{ line.text || '♪' }}
        </p>
      </div>

      <!-- 播放列表：仅在唱片/歌词区域内浮层，不遮挡底部播放控制 -->
      <transition name="pl">
        <div v-if="showPlaylist" class="pl-panel">
          <div class="pl-head">
            <div class="pl-head-text">
              <span class="pl-title">
                播放列表
                <span class="pl-count">{{ player.queue.length }}</span>
              </span>
              <span class="pl-sub truncate">
                {{ player.queue.length ? '正在播放 · ' + (player.queue[player.index]?.title || '未知歌曲') : '暂无歌曲' }}
              </span>
            </div>
            <button class="icon-btn" title="收起播放列表" aria-label="收起播放列表" @click="showPlaylist = false">
              <Icon name="close" :size="18" />
            </button>
          </div>

          <div ref="plListEl" class="pl-list">
            <p v-if="!player.queue.length" class="pl-empty">
              <Icon name="music" :size="28" />
              <span>播放列表还是空的</span>
            </p>
            <button v-for="(t, i) in player.queue" :key="`${t.musicId ?? 'local'}-${i}`" class="pl-item"
              :class="{ active: i === player.index }" @click="onPlayIndex(i)">
              <span class="pl-idx">
                <Icon v-if="i === player.index" name="play" :size="12" />
                <template v-else>{{ i + 1 }}</template>
              </span>
              <span class="pl-cover">
                <img v-if="t.cover" :src="fullCover(t.cover)" alt="" loading="lazy" />
                <Icon v-else name="music" :size="16" />
              </span>
              <span class="pl-info">
                <span class="pl-name truncate">{{ t.title || '未知歌曲' }}</span>
                <span class="pl-artist truncate">{{ t.artist || '未知歌手' }}</span>
              </span>
            </button>
          </div>
        </div>
      </transition>
    </div>

    <!-- 列表打开时遮住外部：首次点击只关闭列表，不会透传给下方控件 -->
    <transition name="pl-fade">
      <div v-if="showPlaylist" class="pl-mask" @click="showPlaylist = false"></div>
    </transition>

    <div class="controls">
      <div class="prog-tools">
        <button class="icon-btn" :class="{ active: showLyric }" title="歌词" @click="toggleLyric">
          <Icon name="lyrics" :size="18" />
        </button>
        <button class="icon-btn" :class="{ active: desktopLyric.enabled }" title="桌面歌词" @click="toggleDesktopLyric">
          <Icon name="float-lyric" :size="18" />
        </button>
      </div>

      <div class="progress-row">
        <span class="time">{{ formatTime(player.currentTime) }}</span>
        <div ref="barEl" class="bar" @mousedown="onBarDown" @touchstart="onBarTouchStart" @touchmove="onBarTouchMove"
          @touchend="onBarTouchEnd">
          <span class="bar-hit"></span>
          <span class="bar-fill" :style="{ width: percent }"></span>
          <span class="bar-knob" :style="{ left: percent }"></span>
        </div>
        <span class="time">{{ formatTime(totalDuration) }}</span>
      </div>


      <div class="btn-row">
        <button class="mode-btn" :class="{ active: faved }" title="收藏" :disabled="favBusy" @click="onFav">
          <Icon name="heart" :size="20" :filled="faved" />
        </button>
        <button class="round-btn" title="上一曲" @click="prev">
          <Icon name="prev" :size="22" filled />
        </button>
        <button class="play-btn" :title="player.playing ? '暂停' : '播放'" @click="toggle">
          <Icon :name="player.playing ? 'pause' : 'play'" :size="26" filled />
        </button>
        <button class="round-btn" title="下一曲" @click="next">
          <Icon name="next" :size="22" filled />
        </button>
        <button class="mode-btn" :class="{ active: player.repeat !== 'off' }" :title="`循环：${repeatLabel}`"
          @click="cycleRepeat">
          <Icon :name="player.repeat === 'one' ? 'repeat-once' : 'repeat'" :size="20" />
        </button>

      </div>

      <div class="status-row">
        <span v-if="statusText" class="status muted">{{ statusText }}</span>
        <button v-if="player.error" class="btn btn-subtle" @click="retry">重试</button>
        <button v-if="player.error && player.song?.id" class="btn btn-subtle" @click="openInBrowser">
          在浏览器打开
        </button>
        <button class="btn btn-subtle" :disabled="!player.url" :title="player.url || ''" @click="onCopyUrl">
          <Icon name="link" :size="14" />
          {{ copyState === 'ok' ? '已复制' : copyState === 'fail' ? '复制失败' : '复制直链' }}
        </button>
        <button class="btn btn-subtle dl-btn" :disabled="player.download.active" title="保存 mp3 直链到本地" @click="download">
          <Icon name="download" :size="14" />
          {{ downloadLabel }}
        </button>
        <a v-if="player.song?.netdiskUrl" class="btn btn-subtle" :href="player.song.netdiskUrl" target="_blank"
          rel="noreferrer" title="在浏览器打开网盘下载页">
          <Icon name="link" :size="14" />
          网盘下载
        </a>
      </div>
    </div>
  </section>

  <transition name="mini">
    <div v-if="player.song && !player.open" class="mini" :title="`${player.song.title} - ${player.song.artist}`"
      @click="open">
      <img v-if="player.song.cover" class="mini-cover" :src="player.song.cover" alt="" />
      <div v-else class="mini-cover mini-cover-empty">
        <Icon name="music" :size="16" />
      </div>

      <div class="mini-text">
        <span class="mini-head">
          <span class="mini-title truncate">{{ player.song.title }}</span>-
          <span class="mini-artist truncaye">{{ player.song.artist ||
            '未知歌手' }}</span>
        </span>
        <span v-if="activeLyricText" class="mini-lyric truncate">{{ activeLyricText }}</span>
      </div>

      <button class="mini-btn" title="上一曲" @click.stop="prev">
        <Icon name="prev" :size="16" filled />
      </button>
      <button class="mini-btn mini-play" :title="player.playing ? '暂停' : '播放'" @click.stop="toggle">
        <Icon :name="player.playing ? 'pause' : 'play'" :size="16" filled />
      </button>
      <button class="mini-btn" title="下一曲" @click.stop="next">
        <Icon name="next" :size="16" filled />
      </button>

      <span class="mini-progress">
        <span class="mini-progress-fill" :style="{ width: percent }"></span>
      </span>
    </div>
  </transition>

  <!-- 反馈小窗放在 .sheet 之外，避免受播放页 transform 影响，遮罩才能覆盖全屏 -->
  <FeedbackModal v-if="feedbackOpen && player.song" :song="player.song" @close="closeFeedback" />
</template>

<style scoped>
.sheet {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  /* 必须高于主界面顶栏(91)/搜索遮罩(90)/页面悬浮层(100)，
     否则打开播放页时顶栏会盖住顶部这一排按钮；仍低于弹层(150+)。 */
  z-index: 120;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: var(--bg);
  transition: transform 0.3s ease-out;
  will-change: transform;
  pointer-events: none;
}

.sheet.open {
  pointer-events: auto;
}

.sheet.dragging {
  transition: none;
}

.backdrop {
  position: absolute;
  inset: -20%;
  background-size: cover;
  background-position: center;
  filter: blur(38px) saturate(1.2);
  transform: scale(1.1);
  opacity: var(--sheet-backdrop-opacity);
  pointer-events: none;
}

.scrim {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to bottom,
      var(--sheet-vignette),
      transparent 26%,
      transparent 64%,
      var(--sheet-vignette)),
    var(--bg);
  opacity: var(--sheet-scrim-opacity);
  pointer-events: none;
}

.sheet-top {
  position: relative;
  flex-shrink: 0;
  /* 用 min-height 而非固定 height：状态栏安全区是额外叠加的 padding，
     否则刘海屏上 38px 的图标按钮会被安全区挤出可视范围。 */
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  padding-top: env(safe-area-inset-top, 0px);
  z-index: 2;
}

.icon-btn {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  transition: background var(--t), color var(--t);
}

.icon-btn:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.icon-btn:disabled,
.icon-btn:disabled:hover {
  background: transparent;
  color: var(--text-2);
  opacity: 0.45;
  cursor: default;
}

.icon-btn.active {
  color: var(--accent);
}

.drag {
  flex: 1;
  height: var(--control-h);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  touch-action: none;
}

.drag:active {
  cursor: grabbing;
}

.grip {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: var(--border-strong);
}

.top-hint {
  position: absolute;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 12px;
  pointer-events: none;
}

.stage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 24px 8px;
  /* 不设 z-index：否则会形成层叠上下文，把内部的 .pl-panel(5)
     整体压在列表遮罩(4)下面，面板将无法点击 */
}

.visual {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 22px;
  width: 100%;
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.visual.hidden {
  opacity: 0;
  transform: scale(0.94);
  pointer-events: none;
  position: absolute;
}

.disc {
  position: relative;
  width: min(66vw, 280px);
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 50%, #2c2c31 0 30%, #151517 31% 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 18px 46px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  animation: disc-spin 24s linear infinite;
  animation-play-state: paused;
  cursor: pointer;
}

.disc.spinning {
  animation-play-state: running;
}

.disc-cover {
  width: 60%;
  aspect-ratio: 1;
  border-radius: 50%;
  object-fit: cover;
  background: var(--surface-2);
  box-shadow: 0 0 0 5px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}

.disc-cover.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  background: rgba(255, 255, 255, 0.04);
}

.disc-hole {
  position: absolute;
  width: 11%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--bg);
  box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.45);
}

.meta {
  text-align: center;
  max-width: 100%;
}

.title {
  font-size: 20px;
  font-weight: 600;
  max-width: 80vw;
  margin: 0 auto;
}

.artist {
  margin-top: 6px;
  font-size: 13px;
  color: var(--text-3);
}

.lyric-preview {
  text-align: center;
  max-width: 86vw;
  margin-top: 2px;
  cursor: pointer;
}

.lp-cur {
  margin: 0;
  font-size: 20px;
  line-height: 1.45;
  color: var(--accent);
}

.lp-next {
  margin: 4px 0 0;
  font-size: 16px;
  line-height: 1.4;
  color: var(--text-2);
}

.lyrics {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  padding: 16px 20px;
  text-align: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;
  mask-image: linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent);
}

.lyrics.visible {
  opacity: 1;
  pointer-events: auto;
}

.lyric-empty {
  font-size: 14px;
  color: var(--text-3);
}

.lyric-line {
  margin: 0;
  padding: 7px 8px;
  border-radius: var(--radius-sm);
  font-size: 15px;
  line-height: 1.5;
  color: var(--text-3);
  cursor: pointer;
  transition: color var(--t), background var(--t), font-size var(--t);
}

.lyric-line.passed {
  color: var(--text-2);
}

.lyric-line.active {
  color: var(--accent);
  font-size: 17px;
  font-weight: 600;
}

.controls {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 22px calc(18px + env(safe-area-inset-bottom, 0px));
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.time {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-3);
  min-width: 38px;
  text-align: center;
}

.bar {
  position: relative;
  flex: 1;
  height: 16px;
  display: flex;
  align-items: center;
  cursor: pointer;
  touch-action: none;
}

.bar-hit {
  position: absolute;
  left: 0;
  right: 0;
  height: 4px;
  border-radius: 2px;
  background: var(--slider-track);
}

.bar:hover .bar-hit {
  background: var(--slider-track-hover);
}

.bar-fill {
  position: absolute;
  left: 0;
  height: 4px;
  border-radius: 2px;
  background: var(--accent);
}

.bar-knob {
  position: absolute;
  width: 12px;
  height: 12px;
  margin-left: -6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  opacity: 0;
  transition: opacity var(--t);
}

.bar:hover .bar-knob,
.bar:active .bar-knob {
  opacity: 1;
}

.volume-row {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 340px;
  width: 100%;
  margin: 0 auto;
}

.mini-volume {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  transition: background var(--t), color var(--t);
}

.mini-volume:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.volume-range {
  flex: 1;
  height: 4px;
}

.btn-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 22px;
}

.round-btn {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  transition: background var(--t), transform var(--t);
}

.round-btn:hover {
  background: var(--surface-hover);
}

.round-btn:active {
  background: var(--surface-active);
  transform: scale(0.96);
}

.play-btn {
  width: 60px;
  height: 60px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
  box-shadow: 0 8px 22px color-mix(in srgb, var(--accent) 45%, transparent);
  cursor: pointer;
  transition: background var(--t), transform var(--t);
}

.play-btn:hover {
  background: var(--accent-hover);
}

.play-btn:active {
  transform: scale(0.95);
}

.mode-btn {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  transition: color var(--t), background var(--t);
}

.mode-btn.active {
  color: var(--accent);
}

.mode-btn:active {
  background: var(--surface-active);
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 28px;
}

/* 触屏点击后 :hover 会粘滞，导致这排按钮一直保留高亮态；
   这里去掉 hover 高亮（含禁用态），仅保留 :active 的瞬时按下反馈。 */
.status-row .btn:hover {
  background: transparent;
  border-color: transparent;
  color: var(--text-3);
}

.status-row .btn:active:not(:disabled) {
  background: var(--surface-active);
  color: var(--text);
}

.status {
  font-size: 12px;
}

.dl-btn {
  min-width: 86px;
  font-variant-numeric: tabular-nums;
}

.dl-btn:disabled {
  opacity: 0.7;
}

/* ---------- 迷你播放条 ---------- */
.mini {
  position: fixed;
  left: 50%;
  bottom: calc(var(--mini-bottom, 72px) + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  z-index: 40;
  width: min(720px, calc(100% - 28px));
  height: 60px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px 0 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  overflow: hidden;
  cursor: pointer;
  transition: border-color var(--t), background var(--t);
}

.mini:hover {
  border-color: var(--text-3);
  background: var(--surface-2);
}

.mini-cover {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  object-fit: cover;
  background: var(--surface-2);
}

.mini-cover-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
}

.mini-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  line-height: 1.25;
}

.mini-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
}

.mini-title {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.mini-artist {
  display: inline-block;
  white-space: nowrap;
  color: gray;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mini-lyric {
  font-size: 11px;
  color: var(--text-3);
}

.mini-btn {
  width: var(--control-h);
  height: var(--control-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  transition: background var(--t), color var(--t);
}

.mini-btn:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.mini-btn:active {
  background: var(--surface-active);
}

.mini-play {
  width: auto;
  height: auto;
  padding: 8px;
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--on-accent);
}

.mini-play:hover {
  background: var(--accent-hover);
  color: var(--on-accent);
}

.mini-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: var(--surface-2);
}

.mini-progress-fill {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.2s linear;
}

.mini-enter-active,
.mini-leave-active {
  transition: opacity 0.25s ease-out, transform 0.25s ease-out;
}

.mini-enter-from,
.mini-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(16px);
}

@keyframes disc-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---------- 响应式 ---------- */
@media (min-height: 680px) {
  .disc {
    width: min(56vh, 300px);
  }
}

@media (max-height: 560px) {
  .stage {
    padding-top: 0;
  }

  .visual {
    gap: 12px;
  }

  .disc {
    width: min(40vh, 200px);
  }

  .title {
    font-size: 17px;
  }
}

@media (orientation: landscape) {

  /* 左右分栏：歌词常驻左侧、封面 + 信息在右侧（参考横屏播放页布局） */
  .stage {
    flex-direction: row;
    align-items: center;
    gap: clamp(14px, 3.5vw, 48px);
    padding: 6px 4vw;
  }

  .lyrics {
    position: relative;
    inset: auto;
    order: 1;
    flex: 1 1 46%;
    align-self: stretch;
    min-height: 0;
    text-align: left;
    padding: 6px 6px;
    opacity: 1;
    pointer-events: auto;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .lyric-line {
    padding: 4px 8px;
    font-size: clamp(13px, 1.9vh, 16px);
  }

  .lyric-line.active {
    font-size: clamp(15px, 2.3vh, 19px);
  }

  /* 封面 + 歌曲信息在右侧：尺寸随视口比例缩放，大屏不过大、小屏不挤压 */
  .visual {
    order: 2;
    flex: 0 1 auto;
    width: min(46vh, 32vw, 320px);
    gap: clamp(8px, 1.6vh, 16px);
  }

  .visual.hidden {
    position: static;
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }

  .disc {
    width: 100%;
    cursor: default;
  }

  .title {
    font-size: clamp(15px, 2.6vh, 22px);
  }

  .artist {
    margin-top: 3px;
    font-size: clamp(11px, 1.6vh, 14px);
  }

  /* 两行歌词预览与横屏下的歌词切换按钮已无意义（歌词与封面同屏展示） */
  .lyric-preview {
    display: none;
  }

  .controls .prog-tools {
    display: none;
  }

  /* 底部控制区随高度比例缩放，按钮不被挤压 */
  .controls {
    gap: clamp(6px, 1.4vh, 12px);
    padding: 0 clamp(14px, 5vw, 64px) calc(10px + env(safe-area-inset-bottom, 0px));
  }

  .btn-row {
    gap: clamp(14px, 3vw, 28px);
  }

  .play-btn {
    width: clamp(48px, 7vh, 60px);
    height: clamp(48px, 7vh, 60px);
  }

  .round-btn {
    width: clamp(38px, 5.5vh, 48px);
    height: clamp(38px, 5.5vh, 48px);
  }
}

/* ---------- 进度条上方的歌词切换 ---------- */
.prog-tools {
  display: flex;
  justify-content: flex-end;
}

/* 点击列表外部：遮罩吃掉这次点击，只关闭列表，不触发下方控件 */
.pl-mask {
  position: absolute;
  inset: 0;
  z-index: 4;
  background: rgba(0, 0, 0, 0.18);
}

.pl-fade-enter-active,
.pl-fade-leave-active {
  transition: opacity 0.2s ease;
}

/* 关闭动画期间立即放行点击，避免遮罩/列表吃掉后续操作 */
.pl-fade-leave-active,
.pl-leave-active {
  pointer-events: none;
}

.pl-fade-enter-from,
.pl-fade-leave-to {
  opacity: 0;
}

/* 播放列表：卡片式浮层，仍限制在 .stage 内，不遮挡底部控制区 */
.pl-panel {
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 0;
  right: 0;
  width: min(560px, calc(100% - 16px));
  margin-inline: auto;
  z-index: 5;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-3);
}

.pl-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px 10px 14px;
  border-bottom: 1px solid var(--border);
}

.pl-head-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pl-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.pl-count {
  padding: 0 7px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-3);
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.pl-sub {
  font-size: 12px;
  color: var(--text-3);
}

.pl-list {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px 8px 12px;
  scrollbar-width: none;
}

.pl-list::-webkit-scrollbar {
  display: none;
}

.pl-empty {
  min-height: 140px;
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-3);
  font-size: 13px;
}

.pl-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  text-align: left;
  color: var(--text-2);
  cursor: pointer;
  transition: background var(--t), color var(--t);
}

.pl-item + .pl-item {
  margin-top: 2px;
}

/* 触屏无 hover，去掉点击后会粘滞的 hover 高亮，只保留按下反馈 */
.pl-item:active {
  background: var(--surface-active);
}

.pl-item.active {
  color: var(--accent);
  background: var(--accent-soft);
}

.pl-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 3px;
  height: 22px;
  border-radius: 0 3px 3px 0;
  background: var(--accent);
  transform: translateY(-50%);
}

.pl-idx {
  width: 22px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-3);
}

.pl-item.active .pl-idx {
  color: var(--accent);
}

.pl-cover {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text-3);
}

.pl-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pl-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}

.pl-name {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.35;
  color: var(--text);
}

.pl-item.active .pl-name {
  color: var(--accent);
  font-weight: 600;
}

.pl-artist {
  font-size: 12px;
  line-height: 1.3;
  color: var(--text-3);
}

.pl-item.active .pl-artist {
  color: var(--accent);
  opacity: 0.8;
}

.pl-enter-active,
.pl-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.pl-enter-from,
.pl-leave-to {
  transform: translateY(18px);
  opacity: 0;
}
</style>
