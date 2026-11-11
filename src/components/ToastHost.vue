<script setup>
import { useToast } from '../composables/toast'
const toast = useToast()
</script>

<template>
  <div class="toast-host">
    <transition-group name="toast">
      <div v-for="t in toast.items" :key="t.id" class="toast" :class="`toast-${t.type}`">
        {{ t.message }}
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  /* 状态提示必须压过所有布局：播放页 120、ActionSheet 150、退出确认 200、
     SongMenu 260/280、各类 Modal 300。置于根层叠上下文的最顶层，
     解析中/复制/下载/加入歌单等提示在任何弹窗打开时都可见。 */
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  pointer-events: none;
}
.toast {
  max-width: 78vw;
  padding: 11px 20px;
  border-radius: 999px;
  background: rgba(22, 22, 26, 0.92);
  color: #fff;
  font-size: 13px;
  line-height: 1.4;
  text-align: center;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(6px);
}
.toast-error {
  background: rgba(190, 46, 52, 0.95);
}
.toast-success {
  background: rgba(38, 142, 82, 0.95);
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.96);
}
</style>
