<script setup>
import { ref } from 'vue'
import Icon from './Icon.vue'
import { getAccountCookie, useAuth } from '../services/auth.js'
import { copyText } from '../utils/copyText.js'
import { showToast } from '../composables/toast.js'

const emit = defineEmits(['close'])
const auth = useAuth()

const confirmed = ref(false)
const loading = ref(false)
const cookie = ref('')
const copied = ref(false)

async function reveal() {
  loading.value = true
  try {
    cookie.value = await getAccountCookie()
  } catch {
    cookie.value = ''
  } finally {
    loading.value = false
    confirmed.value = true
  }
}

async function copy() {
  if (!cookie.value) return
  const ok = await copyText(cookie.value)
  if (!ok) {
    showToast('复制失败，请长按文本手动复制', { type: 'error' })
    return
  }
  copied.value = true
  showToast('已复制到剪贴板', { type: 'success' })
  setTimeout(() => {
    copied.value = false
  }, 2000)
}
</script>

<template>
  <div class="ck-mask" @click.self="emit('close')">
    <div class="ck-dialog">
      <header class="ck-head">
        <Icon name="lock" :size="20" />
        <span>会话 Cookie</span>
        <button class="ck-close" title="关闭" @click="emit('close')">
          <Icon name="close" :size="18" />
        </button>
      </header>

      <!-- 第一步：风险确认，此时 Cookie 尚未渲染进 DOM -->
      <div v-if="!confirmed" class="ck-body">
        <div class="ck-warn">
          <p class="ck-warn-title">风险提示</p>
          <p>Cookie 等同于你的账号登录凭证。拿到它的人可以在其他设备直接登录你的账号，无需密码。</p>
          <ul>
            <li>请勿截图、转发给他人或粘贴到任何第三方</li>
            <li>若不慎泄露，请立即修改密码使会话失效</li>
            <li>仅建议在本机调试时使用</li>
            <li>不过不需过于担心，歌曲宝的cookie时效性很短暂</li>
          </ul>
        </div>
        <div class="ck-actions">
          <button class="ck-btn ghost" type="button" @click="emit('close')">取消</button>
          <button class="ck-btn" type="button" :disabled="loading" @click="reveal">
            {{ loading ? '读取中…' : '我已了解，查看' }}
          </button>
        </div>
      </div>

      <!-- 第二步：确认后展示，可复制 -->
      <div v-else class="ck-body">
        <p class="ck-meta">
          账号：{{ auth.username || '未登录' }} · {{ cookie.length }} 字符
        </p>
        <textarea
          v-if="cookie"
          class="ck-text"
          :value="cookie"
          readonly
          spellcheck="false"
          @focus="$event.target.select()"
        ></textarea>
        <p v-else class="ck-empty">当前没有可用的会话 Cookie，请重新登录后再试。</p>
        <div class="ck-actions">
          <button class="ck-btn ghost" type="button" @click="emit('close')">关闭</button>
          <button class="ck-btn" type="button" :disabled="!cookie" @click="copy">
            {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ck-mask {
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
.ck-dialog {
  width: min(400px, 94vw);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--shadow-3);
  overflow: hidden;
  animation: dialog-pop 0.2s var(--ease) both;
}
.ck-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
.ck-close {
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
.ck-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}
.ck-warn {
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, #ff9f43 40%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, #ff9f43 10%, var(--surface-2));
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-2);
}
.ck-warn p {
  margin: 0 0 6px;
}
.ck-warn-title {
  font-size: 14px;
  font-weight: 700;
  color: #e8890c;
}
.ck-warn ul {
  margin: 0;
  padding-left: 18px;
}
.ck-warn li {
  margin: 2px 0;
}
.ck-meta {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
  word-break: break-all;
}
.ck-text {
  box-sizing: border-box;
  width: 100%;
  min-height: 120px;
  max-height: 40vh;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
  color: var(--text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
  resize: vertical;
  outline: none;
  -webkit-user-select: text;
  user-select: text;
}
.ck-text:focus {
  border-color: var(--accent);
}
.ck-empty {
  margin: 0;
  padding: 18px 12px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  text-align: center;
  font-size: 13px;
  color: var(--text-3);
}
.ck-actions {
  display: flex;
  gap: 10px;
}
.ck-btn {
  flex: 1;
  height: 42px;
  border: 0;
  border-radius: 10px;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--t);
}
.ck-btn.ghost {
  background: var(--surface-2);
  color: var(--text-2);
  border: 1px solid var(--border);
}
.ck-btn:disabled {
  opacity: 0.55;
  cursor: default;
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
