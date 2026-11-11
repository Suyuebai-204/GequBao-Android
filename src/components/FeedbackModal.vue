<script setup>
import { nextTick, onMounted, ref } from 'vue'
import Icon from './Icon.vue'
import { FEEDBACK_MAX_LEN, submitFeedback } from '../services/feedback.js'
import { showToast } from '../composables/toast.js'

const props = defineProps({
  song: { type: Object, default: null }
})
const emit = defineEmits(['close'])

const text = ref('')
const err = ref('')
const loading = ref(false)
const inputEl = ref(null)

// 锁定打开小窗时的歌曲，避免自动切歌后把反馈投到别的歌曲上
const target = props.song
const songName = [target?.title || '未知歌曲', target?.artist].filter(Boolean).join('-')

onMounted(async () => {
  await nextTick()
  inputEl.value?.focus()
})

async function submit() {
  if (loading.value || !text.value.trim()) return
  loading.value = true
  err.value = ''
  try {
    const r = await submitFeedback(target?.id, text.value)
    if (!r.ok) {
      err.value = r.msg || '提交失败'
      showToast(err.value, { type: 'error' })
      return
    }
    emit('close')
    showToast(r.msg || '反馈已提交', { type: 'success' })
  } catch (e) {
    err.value = e?.message || '网络请求失败，请稍后重试'
    showToast(err.value, { type: 'error' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="fb-mask" @click.self="emit('close')">
    <div class="fb-dialog" role="dialog" aria-modal="true" aria-label="歌曲反馈">
      <button class="fb-close" title="关闭" aria-label="关闭" @click="emit('close')">
        <Icon name="close" :size="18" />
      </button>

      <p class="fb-song" style="margin: 0;" :title="songName">
        <span class="fb-label">当前歌曲：</span><span class="fb-name truncate">{{ songName }}</span>
      </p>
      <span style="margin: 0 24px 14px 0;font-size: small;color: gray;">如无法下载或有错误，请刷新重试或在此反馈</span>
      <textarea ref="inputEl" v-model="text" class="fb-text" :maxlength="FEEDBACK_MAX_LEN" rows="3"
        placeholder="请输入错误描述（30个字符内）" @input="err = ''"></textarea>

      <p v-if="err" class="fb-err">{{ err }}</p>

      <div class="fb-foot">
        <span class="fb-count">{{ text.length }}/{{ FEEDBACK_MAX_LEN }}</span>
        <button class="fb-submit" type="button" :disabled="loading || !text.trim()" @click="submit">
          {{ loading ? '提交中…' : '提交反馈' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fb-mask {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.5);
  animation: fb-mask-in 0.18s ease both;
}

.fb-dialog {
  position: relative;
  width: min(420px, 92vw);
  padding: 20px 16px 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-3);
  animation: fb-pop 0.2s var(--ease) both;
}

.fb-close {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  padding: 4px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.fb-song {
  display: flex;
  align-items: baseline;
  margin: 0 24px 14px 0;
  font-size: 14px;
  line-height: 1.5;
}

.fb-label {
  flex-shrink: 0;
  color: var(--accent);
  font-weight: 600;
}

.fb-name {
  min-width: 0;
  color: var(--danger);
  font-weight: 600;
}

.fb-text {
  box-sizing: border-box;
  width: 100%;
  min-height: 88px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  -webkit-user-select: text;
  user-select: text;
}

.fb-text:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.fb-text::placeholder {
  color: var(--text-3);
}

.fb-err {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--danger);
}

.fb-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 14px;
}

.fb-count {
  margin-right: auto;
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.fb-submit {
  min-width: 96px;
  height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--t);
}

.fb-submit:disabled {
  opacity: 0.5;
  cursor: default;
}

@keyframes fb-mask-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes fb-pop {
  from {
    transform: scale(0.94);
    opacity: 0;
  }

  to {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
