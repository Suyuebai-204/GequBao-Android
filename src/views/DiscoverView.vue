<script setup>
import { onMounted, computed } from 'vue'
import Icon from '../components/Icon.vue'
import SongList from '../components/SongList.vue'
import { recent, loadRecent, removeRecent, formatPlayedAt } from '../composables/recent'

const emit = defineEmits(['play'])

function play(t) {
  emit('play', {
    musicId: t.id,
    title: t.title,
    artist: t.artist,
    cover: t.cover,
    playId: t.playId,
    urlA: t.urlA,
    duration: t.duration,
    durationSec: t.durationSec,
    netdiskUrl: t.netdiskUrl
  })
}

function remove(id) {
  removeRecent(id)
}

const songs = computed(() =>
  recent.list.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist || '未知艺人',
    cover: t.cover || '',
    meta: formatPlayedAt(t.playedAt)
  }))
)
function onPlayIndex(i) {
  play(recent.list[i])
}

onMounted(loadRecent)
</script>

<template>
  <div class="view">
    <p class="recent-sub muted">{{ recent.loaded ? `共 ${recent.list.length} 首` : '加载中…' }}</p>

    <p v-if="recent.error" class="notice error">{{ recent.error }}</p>

    <div v-else-if="recent.loading" class="card state">
      <span class="muted">加载中…</span>
    </div>

    <div v-else-if="!recent.list.length" class="empty muted">
      <Icon name="discover" :size="30" />
      <p>还没有播放记录，播放一首歌后这里会自动出现。</p>
    </div>

    <div v-else>
      <SongList :songs="songs" @play="onPlayIndex">
        <template #trailing="{ id }">
          <button class="row-x" title="移除" @click.stop="remove(id)">
            <Icon name="close" :size="13" />
          </button>
        </template>
      </SongList>
    </div>
  </div>
</template>

<style scoped>
.recent-sub { margin:0 0 0 0; font-size: 13px; }

.notice {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: 13px;
}
.notice.error { background: color-mix(in srgb, #e5484d 12%, transparent); color: #e5484d; }

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 64px 16px;
  text-align: center;
}

.small { font-size: 12px; }

.skel-row {
  height: 36px;
  margin: 2px 0;
}

.row-x {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  transition: background var(--t), color var(--t);
}
.row-x:active { background: color-mix(in srgb, #e5484d 14%, transparent); color: #e5484d; }
</style>
