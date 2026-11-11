<script setup>
import { ref } from 'vue'
import Icon from './Icon.vue'
import PasswordField from './PasswordField.vue'
import { changePassword } from '../services/auth.js'
import { showToast } from '../composables/toast.js'

const emit = defineEmits(['close'])

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  if (!oldPassword.value || !newPassword.value || !confirmPassword.value) {
    error.value = '请填写全部字段'
    return
  }
  if (newPassword.value.length < 6) {
    error.value = '新密码至少 6 位'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = '两次输入的新密码不一致'
    return
  }
  if (newPassword.value === oldPassword.value) {
    error.value = '新密码不能与旧密码相同'
    return
  }

  loading.value = true
  try {
    const r = await changePassword({
      oldPassword: oldPassword.value,
      newPassword: newPassword.value
    })
    if (r.ok) {
      showToast(r.msg || '密码修改成功', { type: 'success' })
      emit('close')
      return
    }
    error.value = r.error || '密码修改失败'
    showToast(error.value, { type: 'error' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="cpw-mask" @click.self="emit('close')">
    <div class="cpw-dialog">
      <header class="cpw-head">
        <Icon name="lock" :size="20" />
        <span>修改密码</span>
        <button class="cpw-close" title="关闭" @click="emit('close')">
          <Icon name="close" :size="18" />
        </button>
      </header>

      <div class="cpw-body">
        <PasswordField
          v-model="oldPassword"
          label="旧密码"
          placeholder="请输入当前密码"
          autocomplete="current-password"
          @enter="submit"
        />

        <PasswordField
          v-model="newPassword"
          label="新密码"
          placeholder="至少 6 位"
          autocomplete="new-password"
          @enter="submit"
        />

        <PasswordField
          v-model="confirmPassword"
          label="确认新密码"
          placeholder="再次输入新密码"
          autocomplete="new-password"
          @enter="submit"
        />

        <p v-if="error" class="err">{{ error }}</p>

        <button class="cpw-submit" :disabled="loading" @click="submit">
          {{ loading ? '提交中…' : '提交修改' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cpw-mask {
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
.cpw-dialog {
  width: min(360px, 92vw);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--shadow-3);
  overflow: hidden;
  animation: dialog-pop 0.2s var(--ease) both;
}
.cpw-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
.cpw-head .cpw-close {
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
.cpw-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}
.err {
  margin: 0;
  font-size: 13px;
  color: #ff5a5a;
}
.cpw-submit {
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
.cpw-submit:disabled {
  opacity: 0.6;
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
