<script setup>
import { ref, onMounted } from 'vue'
import Icon from './Icon.vue'
import PasswordField from './PasswordField.vue'
import { login, loadSavedCred, useAuth, RESET_PWD_URL, REGISTER_URL } from '../services/auth.js'
import { openExternalBrowser } from '../utils/openExternal.js'
import { showToast } from '../composables/toast.js'

const emit = defineEmits(['close'])
const auth = useAuth()

const username = ref('')
const password = ref('')
const qq = ref('')
const remember = ref(false)

onMounted(async () => {
  const saved = await loadSavedCred()
  username.value = saved.username
  password.value = saved.password
  remember.value = saved.remember
})

async function submit() {
  if (!username.value.trim() || !password.value) {
    auth.error = '请输入账号和密码'
    return
  }
  const r = await login({
    username: username.value.trim(),
    password: password.value,
    remember: remember.value,
    qq: qq.value.trim()
  })
  if (r.ok) {
    showToast('登录成功', { type: 'success' })
    emit('close')
    return
  }
  showToast(r.error || auth.error || '登录失败', { type: 'error' })
}

function forgotPassword() {
  openExternalBrowser(RESET_PWD_URL)
}

function register() {
  openExternalBrowser(REGISTER_URL)
}
</script>

<template>
  <div class="login-mask" @click.self="emit('close')">
    <div class="login-dialog">
      <header class="ld-head">
        <Icon name="music" :size="20" />
        <span>登录歌曲宝</span>
        <button class="ld-close" title="关闭" @click="emit('close')">
          <Icon name="close" :size="18" />
        </button>
      </header>

      <div class="ld-body">
        <label class="field">
          <span class="fl">账号</span>
          <input
            v-model="username"
            type="text"
            autocomplete="username"
            placeholder="歌曲宝账号"
            @keyup.enter="submit"
          />
        </label>

        <PasswordField
          v-model="password"
          label="密码"
          placeholder="密码"
          autocomplete="current-password"
          @enter="submit"
        />

        <label class="field">
          <span class="fl">QQ号(仅用于头像展示)</span>
          <input
            v-model="qq"
            type="text"
            inputmode="numeric"
            placeholder="可选，留空用默认头像"
            @keyup.enter="submit"
          />
        </label>

        <label class="remember">
          <input type="checkbox" v-model="remember" />
          <span>记住密码（明文保存在本机，便于下次直接登录）</span>
        </label>

        <p v-if="auth.error" class="err">{{ auth.error }}</p>

         <button class="ld-submit" :disabled="auth.loading" @click="submit">
          {{ auth.loading ? '登录中…' : '登录' }}
        </button>

        <div class="ld-links">
          <button class="ld-link" type="button" @click="forgotPassword">忘记密码？</button>
          <span class="ld-link-sep" aria-hidden="true"></span>
          <button class="ld-link is-primary" type="button" @click="register">注册账号</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-mask {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.5);
  animation: mask-in 0.18s ease both;
}
.login-dialog {
  width: min(360px, 92vw);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--shadow-3);
  overflow: hidden;
  animation: dialog-pop 0.2s var(--ease) both;
}
.ld-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
.ld-head .ld-close {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
}
.ld-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fl {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}
.field input {
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
  color: var(--text);
  font-size: 14px;
  outline: none;
  transition: border-color var(--t);
}
.field input:focus {
  border-color: var(--accent);
}
.remember {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-2);
}
.remember input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}
.err {
  margin: 0;
  font-size: 13px;
  color: #ff5a5a;
}
.ld-submit {
  height: 44px;
  border: 0;
  border-radius: 12px;
  background: var(--accent);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--t);
}
.ld-submit:disabled {
  opacity: 0.6;
}
.ld-links {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: -2px;
}
.ld-link {
  padding: 2px 4px;
  border: 0;
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  transition: color var(--t);
}
.ld-link.is-primary {
  color: var(--accent);
  font-weight: 600;
}
.ld-link:hover {
  color: var(--accent);
}
.ld-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 6px;
}
.ld-link-sep {
  width: 1px;
  height: 12px;
  background: var(--border);
}

@keyframes mask-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
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
</style>
