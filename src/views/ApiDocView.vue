<script setup>
// 本地 API 文档：总结 src/services/song.js 对外暴露的接口
// 数据来源：移植自 Windows 端 main/song.js，对接数据源站点 https://www.gequbao.com
import { ref, computed } from 'vue'

const BASE = 'https://www.gequbao.com'

const apis = [
  {
    cat: '详情解析',
    name: 'getSongDetail(musicId)',
    desc: '解析歌曲详情页 HTML，提取元数据与歌词，返回结构化的歌曲信息。',
    params: [
      { name: 'musicId', type: 'string | number', desc: '歌曲 id；内部只取数字部分（如 "123-abc" → 123）' }
    ],
    returns: '{ id, title, artist, cover, duration, durationSec, playId, urlA, netdiskUrl, lrcEmpty, lrc }',
    notes: [
      '404 抛出「歌曲不存在或已下架」',
      'lrc 为 [{ time: 秒, text }] 数组，由 parseLrc 解析',
      'playId 用于后续获取实时直链；urlA 为兜底直链'
    ]
  },
  {
    cat: '详情解析',
    name: 'parseLrc(text)',
    desc: '将 LRC 文本解析为带时间戳的歌词数组；一行多时间戳会展开，整体按时间升序并去重。',
    params: [
      { name: 'text', type: 'string', desc: '原始歌词文本' }
    ],
    returns: 'Array<{ time: number, text: string }>',
    notes: [
      '无时间戳的纯文本行会沿用上一行时间',
      '相同时间戳已做去重合并'
    ]
  },
  {
    cat: '播放直链',
    name: 'getPlayUrl(playId, musicId = "")',
    desc: '向站点请求播放直链；遇到人机验证会自动 OCR 识别并重试（最多 4 次）。',
    params: [
      { name: 'playId', type: 'string', desc: '播放凭证，来自 getSongDetail 返回的 playId' },
      { name: 'musicId', type: 'string', desc: '可选，用于构造 Referer 提升成功率' }
    ],
    returns: '{ url: string, isWhiteUrl: boolean, ut: boolean }',
    notes: [
      '失败抛出错误：CAPTCHA = 人机验证未通过；QUOTA = 播放额度 / VIP 限制',
      '调用方需 catch 这两个错误码并提示用户'
    ]
  },
  {
    cat: '播放直链',
    name: 'openSong(musicId)',
    desc: '一站式获取可播放对象：先取详情、再取直链；直链不可用（或不可播放）时回退到 urlA。',
    params: [
      { name: 'musicId', type: 'string | number', desc: '歌曲 id' }
    ],
    returns: '{ detail, url, source }  // source ∈ "api" | "fallback"',
    notes: [
      'CAPTCHA / QUOTA 错误会向上抛出',
      'url 为空时抛出「未获取到可用的播放地址」'
    ]
  },
  {
    cat: '播放直链',
    name: 'refreshPlayUrl(playId, musicId = "", urlA = "")',
    desc: '刷新已失效的播放地址：优先重新请求 API 直链，失败则回退到 urlA。',
    params: [
      { name: 'playId', type: 'string', desc: '播放凭证' },
      { name: 'musicId', type: 'string', desc: '可选，用于构造 Referer' },
      { name: 'urlA', type: 'string', desc: '兜底直链' }
    ],
    returns: '{ url, source }',
    notes: [
      'API 与 urlA 均失败时抛出「播放地址已失效」'
    ]
  },
  {
    cat: '工具',
    name: 'safeFileName(input, fallback = "music")',
    desc: '把任意字符串规范化为安全的文件名，去除系统非法字符并限制长度。',
    params: [
      { name: 'input', type: 'string', desc: '原始文件名' },
      { name: 'fallback', type: 'string', desc: '结果为空时的兜底名' }
    ],
    returns: 'string',
    notes: [
      '去除 \\ / : * ? " < > | 及换行 / 制表符',
      '结果截断至 120 字符'
    ]
  },
  {
    cat: '下载',
    name: 'downloadToFile(url, onProgress)',
    desc: '以流式方式下载直链为 Blob，边下载边回调进度（0–100）；落盘交由上层（原生桥 / MediaStore）完成。',
    params: [
      { name: 'url', type: 'string', desc: '直链地址' },
      { name: 'onProgress', type: '(pct: number) => void', desc: '进度回调；0–99 表示下载中，100 表示完成' }
    ],
    returns: '{ blob: Blob, total: number, received: number }',
    notes: [
      '直链失效时响应 content-type 为 html，抛出「直链已失效」',
      '空内容抛出「下载内容为空」'
    ]
  }
]

// 按类别生成 Tab（全部 + 去重类别）
const cats = [...new Set(apis.map((a) => a.cat))]
const tabs = ['全部', ...cats]
const activeTab = ref('全部')

const filtered = computed(() =>
  activeTab.value === '全部' ? apis : apis.filter((a) => a.cat === activeTab.value)
)
const countOf = (t) =>
  t === '全部' ? apis.length : apis.filter((a) => a.cat === t).length
</script>

<template>
  <div class="view">
    <div class="col" style="gap: 14px; max-width: 760px">
      <!-- 概述 -->
      <section class="card overview">
        <h2 class="title">API 文档</h2>
        <p class="muted desc">
          歌曲解析服务 <code class="mono">{{ BASE }}</code> 对外接口（共 {{ apis.length }} 个）。
          直链获取可能触发<b>人机验证</b>或<b>播放额度</b>限制，调用方需按错误码
          <code class="mono">CAPTCHA</code> / <code class="mono">QUOTA</code> 做兜底。
        </p>
      </section>

      <!-- Tab 管理 -->
      <div class="tabs">
        <button
          v-for="t in tabs"
          :key="t"
          class="tab"
          :class="{ active: t === activeTab }"
          @click="activeTab = t"
        >
          {{ t }}<span class="tab-count">{{ countOf(t) }}</span>
        </button>
      </div>

      <!-- 接口卡片 -->
      <section v-for="api in filtered" :key="api.name" class="card api-card">
        <!-- 函数签名 -->
        <div class="api-signature">
          <code class="mono api-name">{{ api.name }}</code>
          <span class="tag">{{ api.cat }}</span>
        </div>

        <p class="api-desc">{{ api.desc }}</p>

        <!-- 参数 -->
        <div v-if="api.params.length" class="api-block">
          <div class="block-title"><span class="dot"></span>参数 · Parameters</div>
          <div class="param-list">
            <div v-for="p in api.params" :key="p.name" class="param-row">
              <div class="param-head">
                <code class="mono param-name">{{ p.name }}</code>
                <code class="mono param-type">{{ p.type }}</code>
              </div>
              <div class="param-desc muted">{{ p.desc }}</div>
            </div>
          </div>
        </div>

        <!-- 返回 -->
        <div class="api-block">
          <div class="block-title"><span class="dot"></span>返回 · Returns</div>
          <pre class="api-return mono">{{ api.returns }}</pre>
        </div>

        <!-- 注意 -->
        <div v-if="api.notes.length" class="api-block">
          <div class="block-title"><span class="dot"></span>注意 · Notes</div>
          <ul class="api-notes">
            <li v-for="(n, i) in api.notes" :key="i">{{ n }}</li>
          </ul>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* 概述 */
.overview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}
.desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
}

/* Tab 栏 */
.tabs {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 0;
  background: var(--bg);
  scrollbar-width: none;
}
.tabs::-webkit-scrollbar {
  display: none;
}
.tab {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  transition: background var(--t), color var(--t), border-color var(--t);
}
.tab.active {
  background: var(--surface-active);
  color: var(--accent);
  border-color: var(--accent);
  font-weight: 600;
}
.tab-count {
  font-size: 11px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-2);
}
.tab.active .tab-count {
  background: var(--accent);
  color: #fff;
}

/* 接口卡片：正规 API 参考样式 */
.api-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
/* 函数签名：等宽代码块 + 类别标签 */
.api-signature {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.api-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent);
  line-height: 1.5;
  word-break: break-all;
  background: transparent;
  padding: 0;
}
.tag {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  background: var(--surface-active);
  padding: 3px 10px;
  border-radius: 999px;
  white-space: nowrap;
}
.api-desc {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--text);
}
/* 区块标题（中英双语 + 强调点） */
.api-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.block-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-2);
}
.block-title .dot {
  width: 4px;
  height: 14px;
  border-radius: 2px;
  background: var(--accent);
}
/* 参数表 */
.param-list {
  display: flex;
  flex-direction: column;
}
.param-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 0;
  border-bottom: 1px dashed var(--border);
}
.param-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.param-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.param-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}
.param-type {
  font-size: 11.5px;
  color: var(--accent);
  background: var(--surface-active);
  padding: 1px 6px;
  border-radius: 4px;
}
.param-desc {
  font-size: 12.5px;
  line-height: 1.6;
}
/* 返回值：代码块 */
.api-return {
  margin: 0;
  padding: 10px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-all;
}
/* 注意列表 */
.api-notes {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-2);
}
.api-notes li {
  position: relative;
  padding-left: 16px;
}
.api-notes li::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 8px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
}

/* 行内代码 */
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 12.5px;
  background: var(--surface-2);
  padding: 1px 5px;
  border-radius: 5px;
  color: var(--text);
  word-break: break-all;
}
</style>
