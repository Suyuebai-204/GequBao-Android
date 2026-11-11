<script setup>
import { ref } from 'vue'
import Icon from '../components/Icon.vue'
import ChangePasswordModal from '../components/ChangePasswordModal.vue'
import CookieModal from '../components/CookieModal.vue'
import { useAuth, logout, RESET_PWD_URL } from '../services/auth.js'
import { openExternalBrowser } from '../utils/openExternal.js'
import { showToast } from '../composables/toast.js'
import { openSheet } from '../composables/sheet.js'

const emit = defineEmits(['navigate'])
const auth = useAuth()
const avatarFailed = ref(false)
const showChangePwd = ref(false)
const showCookie = ref(false)

async function doLogout() {
  const v = await openSheet({
    title: '确定退出登录吗？',
    options: [
      { label: '确认', value: 'logout', danger: true }
    ]
  })
  if (v !== 'logout') return
  await logout()
  showToast('已退出登录', { type: 'success' })
  emit('navigate', 'mine')
}

</script>

<template>
  <div class="view account">
    <section class="card profile">
      <div class="avatar">
        <img v-if="auth.avatar && !avatarFailed" :src="auth.avatar" alt="" @error="avatarFailed = true" />
        <Icon v-else name="music" :size="28" />
      </div>
      <div class="info">
        <div class="name">{{ auth.nickname || auth.username }}</div>
        <p v-if="auth?.email" class="qq">Email: {{ auth.email }}</p>
        <p v-else class="qq" >尚未绑定邮箱</p>
      </div>
    </section>

    <p class="section-label">账号</p>
    <div class="card list">
      <button class="row-item" @click="showChangePwd = true">
        <span class="ri-icon"><Icon name="lock" :size="20" /></span>
        <span class="ri-body">
          <span class="ri-label">修改密码</span>
          <span class="ri-desc">更新登录密码</span>
        </span>
        <Icon name="chevron" :size="16" class="ri-caret" />
      </button>
      <button class="row-item" @click="openExternalBrowser(RESET_PWD_URL)">
        <span class="ri-icon"><Icon name="lock" :size="20" /></span>
        <span class="ri-body">
          <span class="ri-label">忘记密码</span>
          <span class="ri-desc">通过绑定邮箱找回</span>
        </span>
        <Icon name="chevron" :size="16" class="ri-caret" />
      </button>
      <button class="row-item is-last" @click="showCookie = true">
        <span class="ri-icon"><Icon name="info" :size="20" /></span>
        <span class="ri-body">
          <span class="ri-label">Cookie</span>
          <span class="ri-desc">查看当前账号会话凭证</span>
        </span>
        <Icon name="chevron" :size="16" class="ri-caret" />
      </button>
    </div>

    <p class="section-label">操作</p>
    <div class="card list">
      <button class="row-item is-last danger" @click="doLogout">
        <span style="color: red;margin: 0 8px;"><Icon name="close" :size="20" /></span>
        <span class="ri-body">
          <span class="ri-label">退出登录</span>
        </span>
      </button>
    </div>

    <ChangePasswordModal v-if="showChangePwd" @close="showChangePwd = false" />
    <CookieModal v-if="showCookie" @close="showCookie = false" />
  </div>
</template>

<style scoped>
.account {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.profile {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
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
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.name {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
}
.uid {
  margin: 0;
  font-size: 13px;
  color: var(--text-3);
}
.qq {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}

.section-label {
  margin: 0;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
}
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
.row-item.is-last {
  border-bottom: 0;
}
.row-item.danger .ri-label {
  color: #ff5a5a;
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
