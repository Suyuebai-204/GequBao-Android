<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import Icon from '../components/Icon.vue'
import LoginModal from '../components/LoginModal.vue'
import { recent, loadRecent } from '../composables/recent'
import { favoriteCount } from '../composables/favoriteMode.js'
import { playlistCount, playlistSongCount, refreshPlaylists } from '../composables/playlists.js'
import { useAuth } from '../services/auth.js'
import pkg from "../../package.json"

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
const favCount = favoriteCount

onMounted(() => {
  if (!recent.loaded && !recent.loading) loadRecent()
  if (auth.loggedIn) refreshPlaylists()
})

// 登录后立即补齐「我的歌单」的数量统计
watch(() => auth.loggedIn, (v) => {
  if (v) refreshPlaylists(true)
})

const entries = computed(() => [
  { key: 'recent', label: '最近播放', icon: 'discover', desc: '你近期听过的歌曲', count: recentCount.value },
  { key: 'fav', label: '我的收藏', icon: 'heart', desc: '收藏的喜欢的歌曲', count: favCount.value },
  { key: 'playlists', label: '我的歌单', icon: 'playlist', desc: `共 ${playlistCount.value} 个歌单`, count: playlistSongCount.value },
  { key: 'library', label: '本地音乐', icon: 'music', desc: '设备上的音乐文件' },
  { key: 'settings', label: '设置', icon: 'settings', desc: '主题、播放与存储' },
  { key: 'about', label: '关于', icon: 'info', desc: '版本与开源信息' }
])
const other = [
  { key: 'windows', label: '影悦', icon: 'windows', desc: 'Windows端的免费听歌软件' }
]
const welfare = [
  { key: 'welfare', label: '公益寻亲', icon: 'welfare', desc: '权威打拐 / 寻亲渠道入口' }
]
function open(key) {
  emit('navigate', key)
}
</script>

<template>
  <div class="mine">
    <button class="hero" type="button" @click="onHeroClick">
      <div class="avatar">
        <img v-if="auth.avatar && !avatarFailed" :src="auth.avatar" alt="" @error="avatarFailed = true" />
        <Icon v-else name="music" :size="28" />
      </div>
      <div class="hero-text">
        <h1>{{ auth.loggedIn ? (auth.nickname || auth.username) : '我的音乐' }}</h1>
        <p class="sub" :title="auth.email || undefined">
          {{ auth.email ? "Email: "+ auth.email : '歌曲宝 · 你的随身听' }}
        </p>
      </div>
      <Icon v-if="auth.loggedIn" name="chevron" :size="18" class="hero-caret" />
    </button>

    <!-- 公益寻亲 -->
    <p class="section-label">公益</p>
    <div class="card list">
      <button v-for="(e, i) in welfare" :key="e.key" class="row-item" :class="{ 'is-last': i === welfare.length - 1 }"
        @click="open(e.key)">
        <span class="ri-icon">
          <Icon :name="e.icon" :size="20" />
        </span>
        <span class="ri-body">
          <span class="ri-label">{{ e.label }}</span>
          <span class="ri-desc">{{ e.desc }}</span>
        </span>
        <Icon name="chevron" :size="16" class="ri-caret" />
      </button>
    </div>

    <p class="section-label">我的</p>
    <div class="card list">
      <button v-for="(e, i) in entries" :key="e.key" class="row-item" :class="{ 'is-last': i === entries.length - 1 }"
        @click="open(e.key)">
        <span class="ri-icon">
          <Icon :name="e.icon" :size="20" />
        </span>
        <span class="ri-body">
          <span class="ri-label">{{ e.label }}</span>
          <span class="ri-desc">{{ e.desc }}</span>
        </span>
        <span v-if="e.count != null" class="ri-count">{{ e.count }}</span>
        <Icon name="chevron" :size="16" class="ri-caret" />
      </button>
    </div>
    <!-- 影悦 -->
    <p class="section-label">Windows端</p>
    <div class="card list">
      <button v-for="(e, i) in other" :key="e.key" class="row-item" :class="{ 'is-last': i === other.length - 1 }"
        @click="open(e.key)">
        <span class="ri-icon">
          <Icon :name="e.icon" :size="20" />
        </span>
        <span class="ri-body">
          <span class="ri-label">{{ e.label }}</span>
          <span class="ri-desc">{{ e.desc }}</span>
        </span>
        <Icon name="chevron" :size="16" class="ri-caret" />
      </button>
    </div>
    <!-- info -->
    <p style="align-items: center;justify-content: center;display: flex;color: gray;font-size: 12px;">- 歌曲宝App v{{
      pkg.version }} -</p>

    <LoginModal v-if="showLogin" @close="showLogin = false" />
  </div>
</template>

<style scoped>
.mine {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 头部（点击：未登录→登录，已登录→账号页） */
.hero {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.hero-caret {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--text-3);
}

.avatar {
  width: 58px;
  height: 58px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--accent) 32%, transparent);
  overflow: hidden;
}
/* 头像图片严格适配圆形框，避免大图溢出 */
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.hero-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.hero-text h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.sub {
  margin: 0;
  font-size: 13px;
  color: var(--text-3);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 列表项右侧统计数（说明文字与箭头之间） */
.ri-count {
  flex-shrink: 0;
  min-width: 26px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  text-align: center;
}

/* 分区标题 */
.section-label {
  margin: 0;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--text-3);
}

/* 分组列表（与设置页一致：单卡片 + 发丝分隔线） */
.list {
  padding: 1px 0;
  overflow: hidden;
}

.row-item {
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  padding: 12px 13px;
  border: 0;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  text-align: left;
  transition: background var(--t);
}

.row-item:active {
  background: var(--surface-active);
}

.row-item.is-last {
  border-bottom: 0;
}

.ri-icon {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--accent);
}

.ri-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.ri-label {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}

.ri-desc {
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.3;
}

.ri-caret {
  flex-shrink: 0;
  color: var(--text-3);
}
</style>
