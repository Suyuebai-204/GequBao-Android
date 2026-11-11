<script setup>
import { ref, computed, onMounted } from 'vue'
import Versions from '../components/Versions.vue'
import Icon from '../components/Icon.vue'
import { getSavedTheme, applyTheme } from '../composables/theme'
import { player, setVolume, setRepeat, setAutoOpenPlayer } from '../composables/player'
import { desktopLyric, toggleDesktopLyric } from '../composables/desktopLyric'
import { loadRecent } from '../composables/recent'
import { openSheet } from '../composables/sheet'
import { showToast } from '../composables/toast'
import { favoriteMode, effectiveMode, setFavoriteMode, syncCloudFavorites } from '../composables/favoriteMode.js'
import { useAuth } from '../services/auth.js'

const emit = defineEmits(['navigate'])
const auth = useAuth()

const theme = ref(getSavedTheme())
const isMobile = !!window.isMobile
const volume = computed({
  get: () => Math.round(player.volume * 100),
  set: (v) => setVolume(Number(v) / 100)
})
const repeatMode = ref(player.repeat)
const autoOpen = ref(false)
const autoStart = ref(false)
const downloadDir = ref('')
const downloadCover = ref(true)
const downloadLyric = ref(true)
const clearMessage = ref('')

async function chooseTheme() {
  const opts = [
    { label: '深色', value: 'dark', active: theme.value === 'dark' },
    { label: '浅色（默认）', value: 'light', active: theme.value === 'light' },
    { label: '跟随系统', value: 'system', active: theme.value === 'system' }
  ]
  const v = await openSheet({ title: '主题方案', options: opts })
  if (v == null) return
  theme.value = v
  applyTheme(v, true)
}

async function chooseRepeat() {
  const opts = [
    { label: '顺序播放', value: 'off', active: repeatMode.value === 'off' },
    { label: '列表循环', value: 'all', active: repeatMode.value === 'all' },
    { label: '单曲循环', value: 'one', active: repeatMode.value === 'one' }
  ]
  const v = await openSheet({ title: '循环模式', options: opts })
  if (v == null) return
  repeatMode.value = v
  setRepeat(v)
}

async function chooseAutoOpen() {
  const opts = [
    { label: '关闭', value: '0', active: !autoOpen.value },
    { label: '开启', value: '1', active: autoOpen.value }
  ]
  const v = await openSheet({ title: '播放时自动展开', options: opts })
  if (v == null) return
  autoOpen.value = v === '1'
  setAutoOpenPlayer(autoOpen.value)
}

async function chooseFavoriteMode() {
  const opts = [
    { label: '本地收藏（默认，无需登录）', value: 'local', active: favoriteMode.value !== 'cloud' },
    { label: '云端收藏（跟随歌曲宝账号）', value: 'cloud', active: favoriteMode.value === 'cloud' }
  ]
  const v = await openSheet({ title: '收藏方式', options: opts })
  if (v == null || v === favoriteMode.value) return
  if (v === 'cloud' && !auth.loggedIn) {
    showToast('请先登录歌曲宝账号，再切换为云端收藏', { type: 'info' })
    return
  }
  await setFavoriteMode(v)
  if (v === 'cloud') syncCloudFavorites(true)
  showToast(v === 'cloud' ? '已切换为云端收藏' : '已切换为本地收藏', { type: 'success' })
}

function goAbout() {
  emit('navigate', 'about')
}

function onAutoStartChange(e) {
  autoStart.value = e.target.value === '1'
  window.api.settings.set({ autoStart: autoStart.value }).catch(() => { })
}

function onDownloadCoverChange(e) {
  downloadCover.value = e.target.checked
  window.api.settings.set({ downloadCover: downloadCover.value }).catch(() => { })
}

function onDownloadLyricChange(e) {
  downloadLyric.value = e.target.checked
  window.api.settings.set({ downloadLyric: downloadLyric.value }).catch(() => { })
}

async function pickDownloadDir() {
  const res = await window.api.dialog.pickDirectory('选择下载保存目录')
  if (!res?.ok || res.canceled || !res.path) return
  downloadDir.value = res.path
  window.api.settings.set({ downloadDir: res.path }).catch(() => { })
}

async function clearHistory() {
  const v = await openSheet({
    title: '清空播放记录',
    options: [
      { label: '清空全部', value: 'ok', danger: true }
    ]
  })
  if (v !== 'ok') return
  clearMessage.value = ''
  const res = await window.api.history.clear().catch(() => null)
  if (res?.ok) {
    await loadRecent()
    showToast('播放记录已清除', { type: 'success' })
    clearMessage.value = '播放记录已清除'
    setTimeout(() => {
      clearMessage.value = ''
    }, 2500)
  } else {
    showToast(res?.error || '清除失败', { type: 'error' })
    clearMessage.value = res?.error || '清除失败'
  }
}

onMounted(async () => {
  const res = await window.api.settings.get().catch(() => null)
  if (res?.ok) {
    autoStart.value = !!res.data.autoStart
    autoOpen.value = !!res.data.autoOpenPlayer
    downloadDir.value = res.data.downloadDir || ''
    downloadCover.value = res.data.downloadCover ?? true
    downloadLyric.value = res.data.downloadLyric ?? true
    if (['off', 'all', 'one'].includes(res.data.repeatMode)) repeatMode.value = res.data.repeatMode
  }
})
</script>

<template>
  <div class="view">

    <div class="col" style="gap: 14px; max-width: 620px">
      <section class="card col" style="gap: 12px">
        <h2>常规</h2>

        <div class="row between item">
          <div class="col" style="gap: 2px">
            <span>主题</span>
            <span class="muted">界面配色方案</span>
          </div>
          <button class="control" @click="chooseTheme">
            <span>{{ { dark: '深色', light: '浅色', system: '跟随系统' }[theme] }}</span>
            <Icon name="chevron" :size="14" class="caret" />
          </button>
        </div>

        <div class="row between item">
          <div class="col" style="gap: 2px">
            <span>收藏方式</span>
            <span class="muted">
              {{ effectiveMode === 'cloud' ? '云端收藏，跟随账号同步' : (favoriteMode === 'cloud' ? '已选云端，登录后可同步' : '本地收藏，仅保存在本机')
              }}
            </span>
          </div>
          <button class="control" @click="chooseFavoriteMode">
            <span>{{ favoriteMode === 'cloud' ? '云端收藏' : '本地收藏' }}</span>
            <Icon name="chevron" :size="14" class="caret" />
          </button>
        </div>

      </section>

      <section class="card col" style="gap: 12px">
        <h2>播放</h2>

        <div class="row between item">
          <div class="col" style="gap: 2px">
            <span>默认音量</span>
            <span class="muted">启动时恢复该音量</span>
          </div>
          <div class="row" style="gap: 8px">
            <input v-model.number="volume" type="range" min="0" max="100"
              :style="{ width: '140px', '--fill': `${volume}%` }" />
            <span class="num" style="width: 34px; text-align: right">{{ volume }}%</span>
          </div>
        </div>

        <div class="row between item">
          <div class="col" style="gap: 2px">
            <span>循环模式</span>
            <span class="muted">列表播完后的行为</span>
          </div>
          <button class="control" @click="chooseRepeat">
            <span>{{ { off: '顺序播放', all: '列表循环', one: '单曲循环' }[repeatMode] }}</span>
            <Icon name="chevron" :size="14" class="caret" />
          </button>
        </div>

        <div class="row between item">
          <div class="col" style="gap: 2px">
            <span>播放时自动展开</span>
            <span class="muted">播放新歌时自动打开播放页</span>
          </div>
          <button class="control" @click="chooseAutoOpen">
            <span>{{ autoOpen ? '开启' : '关闭' }}</span>
            <Icon name="chevron" :size="14" class="caret" />
          </button>
        </div>

        <div class="row between item">
          <div class="col" style="gap: 2px">
            <div class="row" style="gap: 4px;">
              <span>桌面歌词</span>
              <div style="
  border-radius: 5px;
  background: rgba(128,128,128,0.25);
  color: var(--text-2);
  font-size: 11px;
  padding: 1px 4px;
  display: inline-flex;
  align-items: center;
">
                测试
              </div>

            </div>
            <span class="muted">在其它应用上方显示当前歌词</span>
          </div>
          <label class="switch">
            <input type="checkbox" :checked="desktopLyric.enabled" @change="toggleDesktopLyric" />
            <span class="slider"></span>
          </label>
        </div>
      </section>

      <section class="card col" style="gap: 12px">
        <h2>下载</h2>

        <div class="row between item">
          <div class="col" style="gap: 2px">
            <span>同时下载封面</span>
            <span class="muted">下载歌曲时一并保存封面图片</span>
          </div>
          <label class="switch">
            <input type="checkbox" :checked="downloadCover" @change="onDownloadCoverChange" />
            <span class="slider"></span>
          </label>
        </div>

        <div class="row between item">
          <div class="col" style="gap: 2px">
            <span>同时下载歌词</span>
            <span class="muted">下载歌曲时一并保存歌词文件</span>
          </div>
          <label class="switch">
            <input type="checkbox" :checked="downloadLyric" @change="onDownloadLyricChange" />
            <span class="slider"></span>
          </label>
        </div>

        <p class="muted small" style="margin: 2px 0 0">
          下载内容默认保存到系统「Download / 歌曲宝」文件夹。
        </p>
      </section>

      <section class="card col" style="gap: 12px">
        <h2>存储</h2>

        <div class="row between item" v-if="!isMobile">
          <div class="col" style="gap: 2px; min-width: 0">
            <span>下载目录</span>
            <span class="muted truncate">
              {{ downloadDir || '默认保存到系统「音乐」文件夹' }}
            </span>
          </div>
          <button class="btn" style="flex-shrink: 0" @click="pickDownloadDir">更改</button>
        </div>

        <div class="row between item">
          <div class="col" style="gap: 2px">
            <span>清除播放记录</span>
            <span class="muted">清空「最近播放」的全部历史</span>
          </div>
          <div class="row" style="gap: 8px">
            <span v-if="clearMessage" class="muted small">{{ clearMessage }}</span>
            <button class="btn" @click="clearHistory">清除</button>
          </div>
        </div>
      </section>

      <section class="card">
        <Versions />
      </section>
    </div>
  </div>
</template>

<style scoped>
.control {
  width: 160px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  transition: background var(--t), border-color var(--t);
}

.control:hover,
.control:active {
  background: var(--surface-active);
}

.caret {
  color: var(--text-3);
  flex-shrink: 0;
}

.item {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.item:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.num {
  font-variant-numeric: tabular-nums;
  color: var(--text-3);
}

.small {
  font-size: 12px;
}

/* 开关切换 */
.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 26px;
  flex-shrink: 0;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  inset: 0;
  cursor: pointer;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  transition: background var(--t), border-color var(--t);
}

.slider::before {
  content: "";
  position: absolute;
  width: 20px;
  height: 20px;
  left: 2px;
  top: 2px;
  background: var(--text-3);
  border-radius: 50%;
  transition: transform var(--t), background var(--t);
}

.switch input:checked+.slider {
  background: var(--accent);
  border-color: var(--accent);
}

.switch input:focus-visible+.slider {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.switch input:checked+.slider::before {
  transform: translateX(18px);
  background: var(--on-accent);
}
</style>
