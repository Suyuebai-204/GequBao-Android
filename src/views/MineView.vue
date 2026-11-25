<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import Icon from '../components/Icon.vue'
import LoginModal from '../components/LoginModal.vue'
import { recent, loadRecent } from '../composables/recent'
import { favoriteCount } from '../composables/favoriteMode.js'
import { playlistCount, playlistSongCount, refreshPlaylists } from '../composables/playlists.js'
import { useAuth } from '../services/auth.js'
import pkg from '../../package.json'

const emit = defineEmits(['navigate'])

const auth = useAuth()
const showLogin = ref(false)
const avatarFailed = ref(false)

// 登录后自动从 QQ 邮箱补齐头像时，重置旧的加载失败标记以便重试
watch(() => auth.avatar, () => {
  avatarFailed.value = false
})

function onHeroClick() {
  if (auth.loggedIn) emit('navigate', 'user')
  else showLogin.value = true
}

const recentCount = computed(() => recent.list.length)

onMounted(() => {
  if (!recent.loaded && !recent.loading) loadRecent()
  if (auth.loggedIn) refreshPlaylists()
})

// 登录后立即补齐「我的歌单」的数量统计
watch(() => auth.loggedIn, (v) => {
  if (v) refreshPlaylists(true)
})

/* 优先级 P0：个人音乐数据 —— 三宫格统计，页面第一视觉焦点 */
const stats = computed(() => [
  { key: 'recent', label: '最近播放', count: recentCount.value },
  { key: 'fav', label: '我的收藏', count: favoriteCount.value },
  { key: 'playlists', label: '我的歌单', count: playlistCount.value }
])

/* 优先级 P1：常用功能 */
const tools = [
  { key: 'library', label: '本地音乐', icon: 'music', desc: '设备上的音乐文件' }
]

/* 优先级 P2：低频设置 */
const preferences = [
  { key: 'settings', label: '设置', icon: 'settings', desc: '主题、播放与存储' },
  { key: 'about', label: '关于', icon: 'info', desc: '版本与开源信息' }
]

/* 优先级 P3：外部 / 推广入口，视觉降级 */
const external = [
  { key: 'windows', label: '影悦', icon: 'windows', desc: 'Windows 端免费听歌软件' },
  { key: 'welfare', label: '公益寻亲', icon: 'welfare', desc: '权威打拐 / 寻亲渠道入口' }
]

function open(key) {
  emit('navigate', key)
}
</script>

<template>
  <div class="mine">
    <!-- 身份：登录 / 账号入口 -->
    <button class="hero" type="button" @click="onHeroClick">
      <div class="avatar">
        <img v-if="auth.avatar && !avatarFailed" :src="auth.avatar" alt="" @error="avatarFailed = true" />
        <Icon v-else name="music" :size="26" />
      </div>
      <div class="hero-text">
        <h1>{{ auth.loggedIn ? (auth.nickname || auth.username) : '我的音乐' }}</h1>
        <p class="sub" :title="auth.email || undefined">
          {{ auth.email ? '账号已绑定邮箱' : '未绑定邮箱' }}
        </p>
      </div>
      <span class="hero-action">{{ auth.loggedIn ? '账号' : '登录' }}</span>
    </button>

    <!-- P0 个人数据：三宫格 -->
    <section class="stat-card" aria-label="个人音乐数据">
      <button v-for="s in stats" :key="s.key" class="stat" @click="open(s.key)">
        <span class="stat-num">{{ s.count }}</span>
        <span class="stat-label">{{ s.label }}</span>
      </button>
    </section>

    <!-- P1 常用功能 -->
    <section class="group">
      <p class="section-label">音乐</p>
      <div class="list compact">
        <button v-for="e in tools" :key="e.key" class="row-item" @click="open(e.key)">
          <Icon class="ri-icon" :name="e.icon" :size="18" />
          <span class="ri-body">
            <span class="ri-label">{{ e.label }}</span>
            <span class="ri-desc">{{ e.desc }}</span>
          </span>
          <Icon name="chevron" :size="14" class="ri-caret" />
        </button>
      </div>
    </section>

    <!-- P2 低频设置：视觉降一级 -->
    <section class="group">
      <p class="section-label">偏好</p>
      <div class="list compact">
        <button v-for="e in preferences" :key="e.key" class="row-item" @click="open(e.key)">
          <Icon class="ri-icon" :name="e.icon" :size="18" />
          <span class="ri-body">
            <span class="ri-label">{{ e.label }}</span>
            <span class="ri-desc">{{ e.desc }}</span>
          </span>
          <Icon name="chevron" :size="14" class="ri-caret" />
        </button>
      </div>
    </section>

    <!-- P3 外部入口：最次要 -->
    <section class="group">
      <p class="section-label">其他</p>
      <div class="list compact muted-list">
        <button v-for="e in external" :key="e.key" class="row-item" @click="open(e.key)">
          <Icon class="ri-icon" :name="e.icon" :size="18" />
          <span class="ri-body">
            <span class="ri-label">{{ e.label }}</span>
            <span class="ri-desc">{{ e.desc }}</span>
          </span>
          <Icon name="chevron" :size="14" class="ri-caret" />
        </button>
      </div>
    </section>

    <p class="version">歌曲宝 App v{{ pkg.version }}</p>

    <LoginModal v-if="showLogin" @close="showLogin = false" />
  </div>
</template>

<style scoped>
.mine {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

/* ---------- 身份 ---------- */
.hero {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-2) var(--space-1);
  border: 0;
  border-radius: var(--radius-lg);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.hero:active {
  background: var(--surface-active);
}
.avatar {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-pill);
  color: var(--accent);
  background: var(--surface-2);
  overflow: hidden;
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.hero-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  flex: 1;
}
.hero-text h1 {
  margin: 0;
  font-size: var(--fs-h2);
  font-weight: 600;
  color: var(--text);
}
.sub {
  margin: 0;
  font-size: var(--fs-caption);
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hero-action {
  flex-shrink: 0;
  font-size: var(--fs-caption);
  color: var(--accent);
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--accent);
  border-radius: var(--radius-pill);
}

/* ---------- P0 三宫格统计 ---------- */
.stat-card {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-1);
  overflow: hidden;
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-4) var(--space-2);
  border: 0;
  border-right: 1px solid var(--border);
  background: transparent;
  cursor: pointer;
  transition: background var(--t);
}
.stat:last-child {
  border-right: 0;
}
/* 鼠标点击不留默认黑框；仅键盘导航显示主色焦点环 */
.stat:focus {
  outline: none;
}
.stat:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.stat:active {
  background: var(--surface-active);
}
.stat-num {
  font-size: var(--fs-h2);
  font-weight: 600;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.stat-label {
  font-size: var(--fs-caption);
  color: var(--text-3);
}

/* ---------- 分组 ---------- */
.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.section-label {
  margin: 0;
  padding: 0 var(--space-1);
  font-size: var(--fs-caption);
  font-weight: 600;
  color: var(--text-3);
}
.list {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-1);
  overflow: hidden;
}
.row-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  cursor: pointer;
  text-align: left;
  transition: background var(--t);
}
.row-item:last-child {
  border-bottom: 0;
}
.row-item:active {
  background: var(--surface-active);
}
/* 图标统一线性中性色，不用彩色背景块 */
.ri-icon {
  flex-shrink: 0;
  display: flex;
  color: var(--icon);
}
.ri-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  flex: 1;
}
.ri-label {
  font-size: var(--fs-title);
  font-weight: 500;
  line-height: var(--lh-tight);
}
.ri-desc {
  font-size: var(--fs-caption);
  color: var(--text-3);
  line-height: var(--lh-tight);
}
.ri-caret {
  flex-shrink: 0;
  color: var(--text-3);
}

/* P2 / P3：行更矮、字号更小，视觉降一级 */
.list.compact .row-item {
  padding: var(--space-2) var(--space-4);
}
.list.compact .ri-label {
  font-size: var(--fs-body);
}
.list.compact .ri-desc {
  font-size: var(--fs-caption);
}
/* P3 再降一级：文字与图标用中性 500 */
.muted-list .ri-icon,
.muted-list .ri-label,
.muted-list .ri-caret {
  color: var(--text-3);
}

.version {
  margin: 0;
  padding: var(--space-4) 0 var(--space-2);
  text-align: center;
  font-size: var(--fs-caption);
  color: var(--text-3);
}
</style>
