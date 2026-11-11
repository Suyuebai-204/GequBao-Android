<script setup>
import Icon from './Icon.vue'
import { openSongMenu } from '../composables/songMenu.js'

const props = defineProps({
  songs: { type: Array, required: true },
  showRank: { type: Boolean, default: false },
  showCover: { type: Boolean, default: false },
  activeId: { type: [String, Number], default: null },
  // 本地音乐、正在播放队列不提供「更多」操作
  showMore: { type: Boolean, default: true }
})
const emit = defineEmits(['play', 'more'])

function isActive(song) {
  // 列表 id 可能来自 API（字符串）或本地存储（数字），统一按字符串比较，
  // 否则「当前播放曲目」会因类型不一致而匹配不上，图标与高亮都不出现。
  if (props.activeId == null || song.id == null) return false
  return String(song.id) === String(props.activeId)
}

function onMore(song, index) {
  emit('more', song, index)
  openSongMenu(song)
}

/* 长按 ≡ 点击「更多」：按住 500ms 触发，移动超过 10px 视为滚动并取消；
   触发后吞掉紧随其后的 click，避免同时把这首歌唱起来。 */
const press = { timer: null, x: 0, y: 0, firedAt: 0 }
function pointOf(e) {
  return e.touches?.[0] || e.changedTouches?.[0] || null
}
function stopPressTimer() {
  if (press.timer) clearTimeout(press.timer)
  press.timer = null
}
function onPressStart(e, song, index) {
  if (!props.showMore) return
  stopPressTimer()
  // 新的一次触摸开始，清掉上一次长按的「吞点击」标记，
  // 否则长按后 1.2s 内点其它行会被误吞
  press.firedAt = 0
  const p = pointOf(e)
  if (!p) return
  press.x = p.clientX
  press.y = p.clientY
  press.timer = setTimeout(() => {
    press.timer = null
    press.firedAt = Date.now()
    navigator.vibrate?.(12)
    onMore(song, index)
  }, 500)
}
function onPressMove(e) {
  if (!press.timer) return
  const p = pointOf(e)
  if (p && Math.hypot(p.clientX - press.x, p.clientY - press.y) > 10) stopPressTimer()
}
function onPressEnd() {
  stopPressTimer()
}
function consumeLongPress() {
  const fired = Date.now() - press.firedAt < 1200
  press.firedAt = 0
  return fired
}
function onRowClick(index) {
  if (consumeLongPress()) return
  emit('play', index)
}
function onMoreClick(song, index) {
  press.firedAt = 0
  onMore(song, index)
}
function onContextMenu(e, song, index) {
  if (!props.showMore) return
  e.preventDefault()
  onMore(song, index)
}
</script>

<template>
  <div class="song-list">
    <div
      v-for="(s, i) in songs"
      :key="s.id ?? i"
      class="song-row"
      :class="{ active: isActive(s), 'with-cover': showCover && !!s.cover }"
      role="button"
      tabindex="0"
      :title="`${s.title}${s.artist ? ' - ' + s.artist : ''}（点击播放${showMore ? '，长按查看更多' : ''}）`"
      @click="onRowClick(i)"
      @keydown.enter="onRowClick(i)"
      @keydown.space.prevent="onRowClick(i)"
      @contextmenu="onContextMenu($event, s, i)"
      @touchstart.passive="onPressStart($event, s, i)"
      @touchmove.passive="onPressMove"
      @touchend="onPressEnd"
      @touchcancel="onPressEnd"
    >
      <span class="idx">
        <span v-if="!isActive(s)" class="num" :class="{ top: showRank && i < 3 }">{{ i + 1 }}</span>
        <span v-else class="now-playing" title="正在播放">
          <Icon name="play" :size="12" filled />
        </span>
      </span>

      <img v-if="showCover && s.cover" class="cover" :src="s.cover" :alt="s.title" loading="lazy" />

      <div class="info">
        <span class="title truncate">{{ s.title || '未知歌曲' }}</span>
        <span class="artist truncate">{{ s.artist || '未知歌手' }}</span>
      </div>

      <div class="row-actions">
        <span v-if="s.meta" class="meta">{{ s.meta }}</span>
        <slot name="trailing" :id="s.id" :index="i" :song="s"></slot>
        <button v-if="showMore" class="more-btn" type="button" title="更多操作" aria-label="更多操作"
          @click.stop="onMoreClick(s, i)">
          <Icon name="more" :size="18" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.song-list {
  display: flex;
  flex-direction: column;
}

.song-row {
  display: grid;
  /* 序号 / (封面) / 歌名 / 右侧操作区；操作区内部用 flex，避免列数随按钮增减而错位 */
  grid-template-columns: 26px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border: 0;
  border-radius: var(--radius-md, 10px);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  outline: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  user-select: none;
  transition: background var(--t), border-radius var(--t);
}
.song-row.with-cover {
  grid-template-columns: 26px 42px minmax(0, 1fr) auto;
}
.song-row:focus-visible {
  background: var(--surface-2);
}
.song-row:hover { background: var(--surface-2); }
.song-row.active {
  background: var(--surface-active);
  border-radius: var(--radius);
}
.song-row.active .title { color: var(--accent); }

.idx {
  position: relative;
  width: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  font-size: 13px;
}
.idx .num.top { color: var(--accent); font-weight: 700; }
.idx .now-playing {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
}

.cover {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  object-fit: cover;
  background: var(--surface-2);
}

.info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.title { font-size: 14px; color: var(--text); line-height: 1.3; }
.artist { font-size: 12px; color: var(--text-3); line-height: 1.3; }

.row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  gap: 2px;
}

.meta {
  flex-shrink: 1;
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  max-width: 32vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 安卓原生触感：只保留按下反馈，避免触屏点击后 hover 高亮粘滞 */
.more-btn {
  width: 34px;
  height: 34px;
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
.more-btn:active {
  background: var(--surface-active);
  color: var(--accent);
}

.act { display: none; flex-shrink: 0; }
.play-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
  transition: background var(--t), color var(--t);
}
.play-btn:hover {border-radius: 50%; background: var(--accent); color: var(--on-accent); }

@media (max-width: 767px) {
  .song-row { grid-template-columns: 24px minmax(0, 1fr) auto; padding: 8px 8px; }
  .song-row.with-cover { grid-template-columns: 24px 42px minmax(0, 1fr) auto; }
  .meta { display: none; }
  .act { display: flex; }
}
</style>
