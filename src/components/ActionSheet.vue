<script setup>
import { useSheet, closeSheet } from '../composables/sheet'
import Icon from './Icon.vue'

const sheet = useSheet()

function pick(opt) {
  closeSheet(opt.value)
}
function dismiss() {
  closeSheet(null)
}
</script>

<template>
  <transition name="sheet-fade">
    <div v-if="sheet.open" class="sheet-mask" @click.self="dismiss">
      <div class="action-sheet">
        <div v-if="sheet.title" class="as-title">{{ sheet.title }}</div>
        <button
          v-for="opt in sheet.options"
          :key="opt._i"
          class="as-item"
          :class="{ active: opt.active, danger: opt.danger }"
          @click="pick(opt)"
        >
          <Icon v-if="opt.icon" :name="opt.icon" :size="18" />
          <span class="as-label">{{ opt.label }}</span>
          <Icon v-if="opt.active" name="check" :size="18" class="as-check" />
        </button>
        <button class="as-cancel" @click="dismiss">取消</button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: mask-in 0.2s ease both;
}
.action-sheet {
  width: 100%;
  max-width: 480px;
  margin: 0 8px 8px;
  padding: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--shadow-3);
  animation: sheet-up 0.24s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.as-title {
  text-align: center;
  font-size: 13px;
  color: var(--text-3);
  padding: 10px 8px 6px;
}
.as-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 48px;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 15px;
  border-radius: 12px;
  cursor: pointer;
  transition: background var(--t);
}
.as-item:active {
  background: var(--surface-active);
}
.as-item.active {
  color: var(--accent);
  font-weight: 600;
}
.as-item.danger {
  color: #e5484d;
}
.as-item.danger:active {
  background: color-mix(in srgb, #e5484d 12%, transparent);
}
.as-check {
  margin-left: 2px;
}
.as-cancel {
  margin-top: 6px;
  width: 100%;
  height: 48px;
  border: 0;
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 15px;
  border-radius: 12px;
  cursor: pointer;
  transition: background var(--t);
}
.as-cancel:active {
  background: var(--surface-active);
}
@keyframes mask-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes sheet-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
.sheet-fade-leave-active {
  transition: opacity 0.2s ease;
}
.sheet-fade-leave-to {
  opacity: 0;
}
</style>
