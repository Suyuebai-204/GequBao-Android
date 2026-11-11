<script setup>
import { ref, computed } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, required: true },
  placeholder: { type: String, default: '' },
  autocomplete: { type: String, default: 'off' },
  // 默认隐藏密码（圆点）；传 true 可改为默认明文显示
  defaultVisible: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'enter'])

const visible = ref(props.defaultVisible)
const inputEl = ref(null)
const inputType = computed(() => (visible.value ? 'text' : 'password'))
const focusInput = () => inputEl.value?.focus()
// 明文时给「划线眼睛」（点击可隐藏），隐藏时给「睁眼」（点击可显示）
const iconName = computed(() => (visible.value ? 'visibility-off' : 'visibility'))
const toggleText = computed(() => (visible.value ? '隐藏密码' : '显示密码'))
</script>

<template>
  <div class="field">
    <span class="fl" @click="focusInput">{{ label }}</span>
    <span class="pw-wrap">
      <input
        ref="inputEl"
        :value="modelValue"
        :type="inputType"
        :autocomplete="autocomplete"
        :placeholder="placeholder"
        :aria-label="label"
        spellcheck="false"
        autocapitalize="off"
        autocorrect="off"
        @input="emit('update:modelValue', $event.target.value)"
        @keyup.enter="emit('enter')"
      />
      <button
        class="pw-toggle"
        type="button"
        :title="toggleText"
        :aria-label="toggleText"
        :aria-pressed="visible"
        @mousedown.prevent
        @click="visible = !visible"
      >
        <Icon :name="iconName" :size="18" />
      </button>
    </span>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fl {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  cursor: pointer;
}
.pw-wrap {
  position: relative;
  display: block;
}
.pw-wrap input {
  display: block;
  box-sizing: border-box;
  width: 100%;
  height: 42px;
  padding: 0 44px 0 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
  color: var(--text);
  font-size: 14px;
  outline: none;
  transition: border-color var(--t);
}
.pw-wrap input:focus {
  border-color: var(--accent);
}
.pw-toggle {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: color var(--t);
}
.pw-toggle:hover {
  color: var(--text);
}
.pw-toggle:active {
  color: var(--accent);
}
.pw-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
</style>
