<script setup>
import { ref, onMounted } from 'vue'
import { Capacitor } from '@capacitor/core'
import pkg from '../../package.json'

const platform = ref('-')
const native = ref(false)

onMounted(() => {
  try {
    platform.value = Capacitor.getPlatform()
    native.value = Capacitor.isNativePlatform()
  } catch {
    platform.value = 'web'
  }
})
</script>

<template>
  <section class="versions">
    <h2>运行环境</h2>
    <ul>
      <li><span>平台</span><code>{{ platform }}</code></li>
      <li><span>WebView</span><code>{{ native ? 'Android WebView' : '浏览器' }}</code></li>
      <li><span>版本</span><code>{{ pkg.version }}</code></li>
    </ul>
  </section>
</template>

<style scoped>
.versions h2 {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}
.versions ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  font-size: 12px;
}
.versions li {
  display: flex;
  align-items: center;
  gap: 6px;
}
.versions span {
  color: var(--text-3);
}
.versions code {
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--code-bg);
  color: var(--code-text);
}
</style>
