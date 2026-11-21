<script setup>
import Icon from './Icon.vue'
import { openSongMenu } from '../composables/songMenu.js'

const props = defineProps({
  songs: { type: Array, required: true },
  showRank: { type: Boolean, default: false },
  showCover: { type: Boolean, default: false },
  activeId: { type: [String, Number], default: null },
  // 本地音乐、正在播放队列不提供「更多」操作
  showMore: { type: Boolean, default: true },
  // 批量选择模式：点击行切换选中态，不再播放/弹出更多菜单
  selectMode: { type: Boolean, default: false },
  selectedIds: { type: Array, default: () => [] }
})
const emit = defineEmits(['play', 'more', 'toggle-select'])

function isActive(song) {
  // 列表 id 可能来自 API（字符串）或本地存储（数字），统一按字符串比较，
  // 否则「当前播放曲目」会因类型不一致而匹配不上，图标与高亮都不出现。
  if (props.activeId == null || song.id == null) return false
  return String(song.id) === String(props.activeId)
}

function isSelected(song) {
  const id = song?.musicId ?? song?.id
  if (id == null) return false
  return props.selectedIds.some((v) => String(v) === String(id))
}

function onMore(song, index) {
  emit('more', song, index)
  openSongMenu(song)
}

function toggleSelect(song, index) {
  emit('toggle-select', song, index)
}

/* 长按 ≡ 点击「更多」：按住 500ms 触发，移动超过 10px 视为滚动并取消；
   触发后吞掉紧随其后的 click，避免同时把这首歌唱起来。
   批量选择模式下长按等价于点选。 */
const press = { timer: null, x: 0, y: 0, firedAt: 0 }
function pointOf(e) {
  return e.touches?.[0] || e.changedTouches?.[0] || null
}
function stopPressTimer() {
  if (press.timer) clearTimeout(press.timer)
  press.timer = null
}
function onPressStart(e, song, index) {
  if (!props.selectMode && !props.showMore) return
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
    if (props.selectMode) toggleSelect(song, index)
    else onMore(song, index)
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
function onRowClick(index, song) {
  if (consumeLongPress()) return
  if (props.selectMode) {
    toggleSelect(song, index)
    return
  }
  emit('play', index)
}
function onMoreClick(song, index) {
  press.firedAt = 0
  if (props.selectMode) {
    toggleSelect(song, index)
    return
  }
  onMore(song, index)
}
function onContextMenu(e, song, index) {
  if (!props.showMore && !props.selectMode) return
  e.preventDefault()
  if (props.selectMode) {
    toggleSelect(song, index)
    return
  }
  onMore(song, index)
}
</script>

<template>
  <div class="song-list">
    <div v-for="(s, i) in songs" :key="s.id ?? i" class="song-row"
      :class="{ active: isActive(s), 'with-cover': showCover && !!s.cover, 'select-mode': selectMode, selected: selectMode && isSelected(s) }"
      :role="selectMode ? 'checkbox' : 'button'" :aria-checked="selectMode ? isSelected(s) : undefined" tabindex="0"
      :title="selectMode ? `选择「${s.title || '未知歌曲'}」` : `${s.title}${s.artist ? ' - ' + s.artist : ''}（点击播放${showMore ? '，右键查看更多' : ''}）`"
      @click="onRowClick(i, s)" @keydown.enter="onRowClick(i, s)" @keydown.space.prevent="onRowClick(i, s)"
      @contextmenu="onContextMenu($event, s, i)" @touchstart.passive="onPressStart($event, s, i)"
      @touchmove.passive="onPressMove" @touchend="onPressEnd" @touchcancel="onPressEnd">
      <span class="idx">
        <template v-if="selectMode">
          <span class="check-box" :class="{ checked: isSelected(s) }">
            <Icon v-if="isSelected(s)" name="check" :size="13" />
          </span>
        </template>
        <template v-else>
          <span v-if="!isActive(s)" class="num" :class="{ top: showRank && i < 3 }">{{ i + 1 }}</span>
          <span v-else class="now-playing" title="正在播放">
            <Icon name="play" :size="12" filled />
          </span>
        </template>
      </span>

      <img v-if="showCover && s.cover" class="cover" :src="s.cover" :alt="s.title" loading="lazy" />

      <div class="info">
        <span class="title truncate">{{ s.title || '未知歌曲' }}</span>
        <span class="artist truncate">{{ s.artist || '未知歌手' }}</span>
      </div>

      <div class="row-actions">
        <span v-if="s.meta" class="meta">{{ s.meta }}</span>
        <slot v-if="!selectMode" name="trailing" :id="s.id" :index="i" :song="s"></slot>
        <button v-if="showMore && !selectMode" class="more-btn" type="button" title="更多操作" aria-label="更多操作"
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
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  outline: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  user-select: none;
  transition: background var(--t);
}

.song-row.with-cover {
  grid-template-columns: 28px 44px minmax(0, 1fr) auto;
}

.song-row:focus-visible {
  background: var(--surface-2);
}

.song-row:hover {
  background: var(--surface-2);
}

.song-row.active {
  background: var(--accent-soft);
}

.song-row.active .title {
  color: var(--accent);
  font-weight: 600;
}

.song-row.select-mode {
  cursor: default;
}

.song-row.selected {
  background: var(--accent-soft);
}

.check-box {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-strong);
  border-radius: var(--space-1);
  background: var(--surface);
  color: transparent;
  transition: background var(--t), border-color var(--t), color var(--t);
}

.check-box.checked {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
}

.idx {
  position: relative;
  width: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  font-size: var(--fs-caption);
}

.idx .num.top {
  color: var(--accent);
  font-weight: 700;
}

.idx .now-playing {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-pill);
  background: var(--accent-soft);
  color: var(--accent);
}

.cover {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  object-fit: cover;
  background: var(--surface-2);
}

.info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.title {
  font-size: var(--fs-title);
  color: var(--text);
  line-height: var(--lh-tight);
}

.artist {
  font-size: var(--fs-caption);
  color: var(--text-3);
  line-height: var(--lh-tight);
}

.row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  gap: var(--space-1);
}

.meta {
  flex-shrink: 1;
  font-size: var(--fs-caption);
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  max-width: 32vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 安卓原生触感：只保留按下反馈，避免触屏点击后 hover 高亮粘滞 */
.more-btn {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--icon);
  cursor: pointer;
}

.more-btn:active {
  background: var(--surface-active);
  color: var(--accent);
}

.act {
  display: none;
  flex-shrink: 0;
}

.play-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
  transition: background var(--t), color var(--t);
}

.play-btn:hover {
  background: var(--accent);
  color: var(--on-accent);
}

@media (max-width: 767px) {
  .song-row {
    grid-template-columns: 28px minmax(0, 1fr) auto;
    padding: var(--space-2);
  }

  .song-row.with-cover {
    grid-template-columns: 28px 44px minmax(0, 1fr) auto;
  }

  .meta {
    display: none;
  }

  .act {
    display: flex;
  }
}
</style>
