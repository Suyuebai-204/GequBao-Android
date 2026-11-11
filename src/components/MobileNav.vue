<template>
  <nav class="mobile-nav">
    <button
      class="nav-btn"
      :class="{ active: current === 'hot' }"
      @click="go('hot')"
    >
      <Icon name="hot" :size="24" />
      <span class="nav-label">热门</span>
    </button>

    <button
      class="nav-btn"
      :class="{ active: current === 'charts' }"
      @click="go('charts')"
    >
      <Icon name="charts" :size="24" />
      <span class="nav-label">榜单</span>
    </button>

    <button
      class="nav-btn"
      :class="{ active: current === 'mine' }"
      @click="go('mine')"
    >
      <Icon name="library" :size="24" />
      <span class="nav-label">我的</span>
    </button>
  </nav>
</template>

<script setup>
import Icon from './Icon.vue'
const props = defineProps({ current: String })
const emit = defineEmits(['navigate'])

function go(key) {
  emit('navigate', key)
}
</script>

<style scoped>
.mobile-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 6px 10px calc(6px + env(safe-area-inset-bottom, 0px));
  background: var(--surface);
  border-top: 1px solid var(--border);
  --nav-h: 58px;
  height: calc(var(--nav-h) + env(safe-area-inset-bottom, 0px));
}

.nav-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  flex: 1;
  max-width: 110px;
  height: 46px;
  border: 0;
  background: transparent;
  color: var(--text-3);
  font-size: 11px;
  cursor: pointer;
  border-radius: 12px;
  transition: color var(--t), background var(--t);
}
.nav-btn.active {
  color: var(--accent);
}
.nav-btn:active {
  background: var(--surface-active);
}
.nav-label {
  line-height: 1;
}
.nav-btn :deep(svg) {
  width: 24px;
  height: 24px;
  stroke-width: 1.7;
}

/* 宽屏 / TV：导航从"底部悬浮条"变为"左侧固定栏"，不再遮盖内容 */
:global(html.is-wide) .mobile-nav,
:global(html.is-tv) .mobile-nav {
  right: auto;
  top: 0;
  height: 100%;
  padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px));
}
</style>
