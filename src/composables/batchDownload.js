import { computed, ref } from 'vue'
import { showToast } from './toast.js'
import { player } from './player.js'
import { getDownloadOptions, resolveSongDetail } from './songMenu.js'

const GAP_MS = 300
let batchRunning = false
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function songKey(song) {
  const id = song?.musicId ?? song?.id
  return id == null || id === '' ? '' : String(id)
}

/** 列表页批量选择 + 限流下载：每 0.3 秒启动一首，不等待前一首完成 */
export function useBatchDownload(getSongs) {
  const selecting = ref(false)
  const selectedIds = ref([])
  const downloading = ref(false)
  const total = ref(0)
  const started = ref(0)
  const finished = ref(0)
  const failed = ref(0)

  const songsOf = () => (Array.isArray(getSongs()) ? getSongs() : [])

  const selectedCount = computed(() => selectedIds.value.length)
  const allSelected = computed(() => {
    const ids = songsOf().map(songKey).filter(Boolean)
    return ids.length > 0 && ids.every((id) => selectedIds.value.includes(id))
  })
  const progressText = computed(() => {
    if (!downloading.value) return ''
    const fail = failed.value ? `，失败 ${failed.value}` : ''
    return `已启动 ${started.value}/${total.value}，完成 ${finished.value}${fail}`
  })

  function clearSelection() {
    if (downloading.value) return
    selectedIds.value = []
  }

  function enter() {
    if (downloading.value) return
    selecting.value = true
    clearSelection()
  }

  function exit() {
    if (downloading.value) return
    selecting.value = false
    clearSelection()
  }

  function toggle(song) {
    if (!selecting.value || downloading.value) return
    const key = songKey(song)
    if (!key) {
      showToast('这首歌曲暂无可用 ID，无法批量下载', { type: 'error' })
      return
    }
    const next = new Set(selectedIds.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    selectedIds.value = [...next]
  }

  function selectAll() {
    if (!selecting.value || downloading.value) return
    selectedIds.value = [...new Set(songsOf().map(songKey).filter(Boolean))]
  }

  function invertSelection() {
    if (!selecting.value || downloading.value) return
    const current = new Set(selectedIds.value)
    selectedIds.value = [
      ...new Set(songsOf().map(songKey).filter((key) => key && !current.has(key)))
    ]
  }

  async function downloadOne(song, options) {
    const id = Number(song?.musicId ?? song?.id) || 0
    if (!id) throw new Error('歌曲 ID 无效')

    const { detail, url } = await resolveSongDetail(id)
    if (!url) throw new Error('未获取到可用直链')

    const res = await window.api.player.download({
      musicId: detail.id || id,
      playId: detail.playId,
      url,
      urlA: detail.urlA || '',
      title: detail.title || song.title || `歌曲 #${id}`,
      artist: detail.artist || song.artist || '',
      cover: detail.cover || song.cover || '',
      lrc: Array.isArray(detail.lrc) ? detail.lrc : [],
      downloadCover: options.downloadCover,
      downloadLyric: options.downloadLyric
    })
    if (!res?.ok) throw new Error(res?.error || '下载失败')
    return res
  }

  async function start() {
    if (downloading.value || batchRunning) return
    if (!selecting.value) selecting.value = true

    const selected = new Set(selectedIds.value)
    const targets = songsOf().filter((song) => {
      const key = songKey(song)
      return key && selected.has(key)
    })
    if (!targets.length) {
      showToast('请先选择要下载的歌曲', { type: 'error' })
      return
    }
    if (player.download?.active) {
      showToast('已有下载任务正在进行，请稍后再试', { type: 'error' })
      return
    }

    batchRunning = true
    downloading.value = true
    total.value = targets.length
    started.value = 0
    finished.value = 0
    failed.value = 0
    showToast(`已开始批量下载 ${targets.length} 首，每首间隔 0.3 秒`)

    try {
      const options = await getDownloadOptions()
      const tasks = []
      for (let i = 0; i < targets.length; i++) {
        if (i) await wait(GAP_MS)
        started.value = i + 1
        tasks.push(
          downloadOne(targets[i], options)
            .then(() => { finished.value += 1 })
            .catch((error) => {
              failed.value += 1
              console.warn('[batchDownload] 下载失败', error)
            })
        )
      }
      await Promise.all(tasks)
      showToast(
        `批量下载结束：成功 ${finished.value} 首${failed.value ? `，失败 ${failed.value} 首` : ''}`,
        { type: failed.value ? 'error' : 'success' }
      )
    } catch (error) {
      showToast(error?.message || '批量下载失败', { type: 'error' })
    } finally {
      batchRunning = false
      downloading.value = false
    }
  }

  return {
    selecting,
    selectedIds,
    selectedCount,
    allSelected,
    downloading,
    total,
    started,
    finished,
    failed,
    progressText,
    enter,
    exit,
    clearSelection,
    toggle,
    selectAll,
    invertSelection,
    start
  }
}
