<script setup>
import { nextTick, onMounted, ref } from 'vue'
import Icon from './Icon.vue'
import { createPlaylist, updatePlaylist } from '../services/cloudPlaylist.js'
import { showToast } from '../composables/toast.js'

const props = defineProps({
  // 传入歌单对象表示编辑，null 表示新建
  playlist: { type: Object, default: null }
})
const emit = defineEmits(['close', 'saved'])

const editing = !!props.playlist
const title = ref(props.playlist?.title || '')
const description = ref(props.playlist?.description || '')
const loading = ref(false)
const err = ref('')
const inputEl = ref(null)

onMounted(async () => {
  await nextTick()
  inputEl.value?.focus()
})

async function submit() {
  if (loading.value) return
  const name = title.value.trim()
  if (!name) {
    err.value = '请输入歌单名称'
    return
  }
  loading.value = true
  err.value = ''
  try {
    const payload = { title: name, description: description.value.trim() }
    const r = editing
      ? await updatePlaylist({ id: props.playlist.id, ...payload })
      : await createPlaylist(payload)
    if (!r.ok) {
      err.value = r.msg || '操作失败'
      showToast(err.value, { type: 'error' })
      return
    }
    showToast(r.msg || (editing ? '修改成功' : '创建成功'), { type: 'success' })
    emit('saved')
    emit('close')
  } catch (e) {
    err.value = e?.message || '操作失败，请稍后重试'
    showToast(err.value, { type: 'error' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="pm-mask" @click.self="emit('close')">
    <div class="pm-dialog" role="dialog" aria-modal="true" :aria-label="editing ? '编辑歌单' : '新建歌单'">
      <header class="pm-head">
        <span>{{ editing ? '编辑歌单' : '新建歌单' }}</span>
        <button class="pm-close" title="关闭" aria-label="关闭" @click="emit('close')">
          <Icon name="close" :size="18" />
        </button>
      </header>

      <div class="pm-body">
        <label class="pm-field">
          <span class="pm-label">歌单名称</span>
          <input ref="inputEl" v-model="title" class="control pm-input" type="text" maxlength="30"
            placeholder="给歌单起个名字" @input="err = ''" @keyup.enter="submit" />
        </label>

        <label class="pm-field">
          <span class="pm-label">简介（可选）</span>
          <textarea v-model="description" class="pm-text" rows="3" maxlength="100"
            placeholder="介绍一下这个歌单" @input="err = ''"></textarea>
          <span class="pm-counter">{{ description.length }}/100</span>
        </label>

        <p v-if="err" class="pm-err">{{ err }}</p>
      </div>

      <div class="pm-actions">
        <button class="btn btn-subtle" type="button" @click="emit('close')">取消</button>
        <button class="btn btn-primary pm-submit" type="button" :disabled="loading || !title.trim()" @click="submit">
          {{ loading ? '提交中…' : editing ? '保存修改' : '创建歌单' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pm-mask {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.5);
  animation: pm-in 0.18s ease both;
}

.pm-dialog {
  width: min(400px, 94vw);
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: var(--shadow-3);
  overflow: hidden;
  animation: pm-pop 0.2s var(--ease) both;
}

.pm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.pm-close {
  display: flex;
  padding: 4px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.pm-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.pm-field {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pm-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
}

.pm-input {
  width: 100%;
  height: 40px;
}

.pm-text {
  box-sizing: border-box;
  width: 100%;
  min-height: 84px;
  padding: 10px 12px 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
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

.pm-text:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.pm-text::placeholder {
  color: var(--text-3);
}

.pm-counter {
  position: absolute;
  right: 10px;
  bottom: 8px;
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.pm-err {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}

.pm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 16px 16px;
}

.pm-submit {
  min-width: 104px;
}

/* 触屏无 hover：去掉点击后会粘滞的高亮 */
.pm-actions .btn:hover {
  background: transparent;
  border-color: transparent;
  color: var(--text-3);
}

.pm-actions .btn-primary:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}

@keyframes pm-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes pm-pop {
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
