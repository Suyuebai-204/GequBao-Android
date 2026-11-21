<script setup>
// API 文档：站点原始 HTTP 接口（从 src/services/*.js 实际请求中提取）
// + 应用内 window.api 桥接层（src/api.js，与 Windows 端同签名）
import { ref, computed, watch, onBeforeUnmount } from 'vue'

const BASE = 'https://www.gequbao.com'
const KUWO = 'https://kuwo.cn'

/* ============================================================
 * 一、站点原始 HTTP 接口
 * 来源：services/search.js / song.js / auth.js / cloudFavorites.js /
 *      cloudPlaylist.js / feedback.js 中真实发出的请求。
 * ============================================================ */
const siteApis = [
  /* ---- 搜索与发现 ---- */
  {
    cat: '搜索与发现',
    method: 'POST',
    path: '/api/pre-s',
    name: '搜索建议',
    desc: '输入关键词时返回联想词 / 候选歌曲。站点原生 JSON 接口。',
    auth: false,
    params: [
      { name: 'keyword', type: 'string', required: true, desc: '搜索关键词，不可为空' }
    ],
    headers: 'Content-Type: application/x-www-form-urlencoded · X-Requested-With: XMLHttpRequest · Referer: /',
    returns: `{
  "code": 1,
  "data": {
    "data": {
      "1": [{ "keyword": "候选词", "business_key": "123", "type": 1 }],
      "2": ["相关关键词"]
    }
  }
}`,
    notes: [
      '本地解析时 data.data 为分组对象，键为数字字符串，按数字升序展开',
      'type=1 视为歌曲，business_key 即 musicId；其余视为关键词'
    ]
  },
  {
    cat: '搜索与发现',
    method: 'POST',
    path: '/api/guess-musics',
    name: '猜你想找',
    desc: '搜索页下方「猜你想找」推荐词。站点原生 JSON 接口。',
    auth: false,
    params: [
      { name: 'keyword', type: 'string', required: true, desc: '当前搜索关键词' }
    ],
    headers: 'Content-Type: application/x-www-form-urlencoded · X-Requested-With: XMLHttpRequest · Referer: /s/{keyword}',
    returns: `{
  "code": 1,
  "data": [
    { "keyword": "推荐词", "business_key": "123", "id": 456 }
  ]
}`,
    notes: ['返回数组兼容 data 直接为数组、或 data.data 为数组两种形态']
  },
  {
    cat: '搜索与发现',
    method: 'GET',
    path: '/s/{keyword}',
    name: '搜索结果页',
    desc: '返回搜索结果 HTML，客户端正则解析出歌曲 id / 标题 / 歌手。无独立 JSON 接口。',
    auth: false,
    params: [
      { name: 'keyword', type: 'string', required: true, desc: 'URL 编码后的关键词，路径参数' }
    ],
    headers: 'Accept: text/html · Referer: /',
    returns: 'text/html — 含 <a href="/music/{id}">、<span class="text-primary">、<small class="text-jade"> 等结果节点',
    notes: [
      '关键词含 & 或空格时会依次尝试：原词 → 去 & → 取第一段，最多 3 次',
      '404 视为该变体无结果，继续尝试下一个候选'
    ]
  },
  {
    cat: '搜索与发现',
    method: 'GET',
    path: '/hot-music?page={n}',
    name: '热门推荐',
    desc: '热门曲目列表 HTML，带分页。客户端解析为歌曲数组。',
    auth: false,
    params: [
      { name: 'page', type: 'number', required: false, desc: '页码，默认 1' }
    ],
    headers: 'Accept: text/html · Referer: /',
    returns: 'text/html — 歌曲列表 + 分页标记 <b>当前</b>/<b>总数</b>',
    notes: ['客户端解析为 { list, current, total, hasNext }']
  },
  {
    cat: '搜索与发现',
    method: 'GET',
    path: '/top/{type}?page={n}',
    name: '排行榜',
    desc: '排行榜 HTML。type 决定榜单类型。',
    auth: false,
    params: [
      { name: 'type', type: 'string', required: true, desc: 'week-search（周搜索榜）| week-download（周下载榜）' },
      { name: 'page', type: 'number', required: false, desc: '页码，默认 1' }
    ],
    headers: 'Accept: text/html · Referer: /',
    returns: 'text/html — 周搜索榜为关键词+名次；下载榜为歌曲列表',
    notes: ['周搜索榜返回 { rank, keyword }[]，其余返回歌曲数组']
  },
  {
    cat: '搜索与发现',
    method: 'GET',
    path: '/openapi/v1/www/search/searchKey',
    name: '搜索热词（酷我）',
    desc: '「大家都在搜」热词，来自酷我开放接口，非 gequbao 自有接口。',
    auth: false,
    cross: true,
    params: [
      { name: 'key', type: 'string', required: false, desc: '留空' },
      { name: 'httpsStatus', type: 'number', required: false, desc: '固定 1' },
      { name: 'reqId', type: 'string', required: false, desc: '随机请求 id' },
      { name: 'plat', type: 'string', required: false, desc: '固定 web_www' }
    ],
    headers: `Accept: application/json · Referer: ${KUWO}/`,
    returns: '{ "data": ["热词1", "热词2", ...] }',
    notes: ['原生端可正常获取；纯浏览器环境会被 CORS 拦截，已静默降级']
  },

  /* ---- 歌曲与播放 ---- */
  {
    cat: '歌曲与播放',
    method: 'GET',
    path: '/music/{id}',
    name: '歌曲详情页',
    desc: '歌曲元数据与歌词的唯一来源。页面内嵌 window.appData，客户端解析后得到 playId 与兜底直链。',
    auth: false,
    params: [
      { name: 'id', type: 'number', required: true, desc: '歌曲 id，路径参数' }
    ],
    headers: 'Accept: text/html · Referer: /',
    returns: `text/html — 内嵌 window.appData = JSON.parse('...'), 关键字段：
mp3_id  mp3_title  mp3_author  mp3_cover
mp3_duration  play_id  mp3_url_a  lrc_is_empty
extra_recommend_wap_url / mp3_extra_urls[].share_link`,
    notes: [
      '404 表示歌曲不存在或已下架',
      '网盘地址字段为 base64，需解码后使用',
      '客户端对外产出：{ id, title, artist, cover, durationSec, playId, urlA, lrc }'
    ]
  },
  {
    cat: '歌曲与播放',
    method: 'GET',
    path: '/api/captcha',
    name: '获取人机验证码',
    desc: '播放直链触发人机验证时调用，返回图片 base64 与校验 key。',
    auth: false,
    params: [
      { name: '_', type: 'number', required: false, desc: '随机数，避免缓存' }
    ],
    headers: 'X-Requested-With: XMLHttpRequest · Accept: application/json · Referer: /',
    returns: `{
  "code": 1,
  "data": {
    "key": "校验凭证",
    "img": "data:image/jpeg;base64,..."
  }
}`,
    notes: ['客户端用 OCR 识别图片数字，最多自动重试 4 次']
  },
  {
    cat: '歌曲与播放',
    method: 'POST',
    path: '/member/common-play-url',
    name: '获取播放直链',
    desc: '用详情页解析出的 playId 换取真实音频直链。受人机验证与每日额度限制。',
    auth: false,
    params: [
      { name: 'id', type: 'string', required: true, desc: 'playId，来自 /music/{id} 的 window.appData' },
      { name: 'purpose', type: 'string', required: true, desc: '固定 play' },
      { name: 'captchaCode', type: 'string', required: false, desc: '验证码识别结果，人机验证时必填' },
      { name: 'key', type: 'string', required: false, desc: '验证码 key，与 captchaCode 配套' }
    ],
    headers: 'Content-Type: application/x-www-form-urlencoded · X-Requested-With: XMLHttpRequest · Origin: {BASE} · Referer: /music/{musicId}',
    returns: `{
  "code": 1,
  "data": { "url": "https://...", "is_white_url": false, "ut": false },
  "msg": "success"
}`,
    notes: [
      'code=1 成功；code=2 触发人机验证（客户端映射 CAPTCHA）；code=4 额度/VIP 限制（映射 QUOTA）',
      'Referer 带上 musicId 可提升成功率',
      '直链不可播放时回退到详情页的 mp3_url_a'
    ]
  },

  /* ---- 账号与会员 ---- */
  {
    cat: '账号与会员',
    method: 'POST',
    path: '/member/auth/login',
    name: '登录',
    desc: '表单登录。成败以最终重定向地址判定，而非响应码。',
    auth: false,
    params: [
      { name: 'username', type: 'string', required: true, desc: '账号' },
      { name: 'password', type: 'string', required: true, desc: '密码' },
      { name: 'remember', type: 'string', required: false, desc: '记住登录填 on' }
    ],
    headers: 'Content-Type: application/x-www-form-urlencoded · Referer: /member/auth/login',
    returns: 'text/html — 302 到 /member 成功；落到主页或登录页表示账号密码错误',
    notes: [
      '站点主页、登录页视为失败；其他域名视为链路异常',
      '客户端随后 GET /member 硬校验会话是否真正建立'
    ]
  },
  {
    cat: '账号与会员',
    method: 'GET',
    path: '/member',
    name: '个人中心 / 会话校验',
    desc: '受保护页面。游客会被 302 到登录页，用于验证 Cookie 是否生效、并解析绑定邮箱。',
    auth: true,
    params: [],
    headers: 'Accept: text/html · Referer: /member',
    returns: 'text/html — 个人中心页面；未登录重定向 /member/auth/login',
    notes: ['邮箱用于自动生成 QQ 头像']
  },
  {
    cat: '账号与会员',
    method: 'GET',
    path: '/member/auth/logout',
    name: '退出登录',
    desc: '通知服务端登出，客户端同时清理本地 Cookie 与凭据。',
    auth: true,
    params: [],
    headers: 'Accept: text/html · Referer: /member',
    returns: 'HTTP 200 — 页面内跳转到登录页，非 HTTP 302',
    notes: ['服务端失败不阻塞本地登出']
  },
  {
    cat: '账号与会员',
    method: 'POST',
    path: '/member/security/change-password',
    name: '修改密码',
    desc: 'Laravel AJAX 接口，必须携带 X-Requested-With 头。',
    auth: true,
    params: [
      { name: 'old_password', type: 'string', required: true, desc: '当前密码' },
      { name: 'new_password', type: 'string', required: true, desc: '新密码' },
      { name: 'new_password_confirmation', type: 'string', required: true, desc: '确认新密码' }
    ],
    headers: 'Content-Type: application/x-www-form-urlencoded · X-Requested-With: XMLHttpRequest · Referer: /member',
    returns: `{
  "code": 1,
  "msg": "修改成功"
}`,
    notes: [
      '401 / 419 / 重定向登录页 / 返回登录页 HTML 均视为会话失效',
      '校验错误在 errors 字段（Laravel 标准格式）'
    ]
  },

  /* ---- 云端收藏 ---- */
  {
    cat: '云端收藏',
    method: 'POST',
    path: '/member/music/favorite-list?page={n}',
    name: '收藏列表',
    desc: '分页获取当前用户的云端收藏。',
    auth: true,
    params: [
      { name: 'keyword', type: 'string', required: false, desc: '筛选关键词' },
      { name: 'page', type: 'number', required: false, desc: '页码，>1 时拼到 URL 上' }
    ],
    headers: 'Content-Type: application/x-www-form-urlencoded · X-Requested-With: XMLHttpRequest · Referer: /member',
    returns: `{
  "code": 1,
  "data": {
    "current_page": 1, "last_page": 3, "per_page": 10, "total": 25,
    "data": [{ "music_id": 123, "created_at": "...", "music": { "id": 123, "title": "...", "author": "..." } }]
  }
}`,
    notes: ['播放使用 music.id，而非外层 music_id']
  },
  {
    cat: '云端收藏',
    method: 'POST',
    path: '/member/music/favorite-add',
    name: '添加收藏',
    desc: '把歌曲加入云端收藏。',
    auth: true,
    params: [
      { name: 'music_id', type: 'number', required: true, desc: '站点歌曲 id' }
    ],
    headers: 'X-Requested-With: XMLHttpRequest · Referer: /music/{id}',
    returns: '{ "code": 1, "msg": "收藏成功" }',
    notes: ['Cookie 过期时客户端会静默重登并自动重试一次']
  },
  {
    cat: '云端收藏',
    method: 'POST',
    path: '/member/music/favorite-delete',
    name: '取消收藏',
    desc: '从云端收藏中移除歌曲。',
    auth: true,
    params: [
      { name: 'music_id', type: 'number', required: true, desc: '站点歌曲 id' }
    ],
    headers: 'X-Requested-With: XMLHttpRequest · Referer: /member',
    returns: '{ "code": 1, "msg": "操作成功" }',
    notes: ['与 add 共用会话失效重试逻辑']
  },

  /* ---- 云端歌单 ---- */
  {
    cat: '云端歌单',
    method: 'POST',
    path: '/member/playlist/list?page={n}',
    name: '歌单列表',
    desc: '分页获取当前用户的歌单（文件夹），每页 12 个。',
    auth: true,
    params: [
      { name: 'page', type: 'number', required: false, desc: '页码，>1 时拼到 URL 上' }
    ],
    headers: 'X-Requested-With: XMLHttpRequest · Referer: /member',
    returns: `{
  "code": 1,
  "data": {
    "current_page": 1, "last_page": 1, "total": 3,
    "data": [{ "id": 9, "title": "歌单名", "description": "", "song_count": 12, "created_at": "..." }]
  }
}`,
    notes: []
  },
  {
    cat: '云端歌单',
    method: 'POST',
    path: '/member/playlist/detail?page={n}',
    name: '歌单详情',
    desc: '分页获取歌单内歌曲。列表字段仅用于展示，播放仍需进入 /music/{id} 重新解析。',
    auth: true,
    params: [
      { name: 'playlist_id', type: 'number', required: true, desc: '歌单 id' },
      { name: 'page', type: 'number', required: false, desc: '页码' }
    ],
    headers: 'X-Requested-With: XMLHttpRequest · Referer: /member',
    returns: `{
  "code": 1,
  "data": {
    "data": [{ "music_id": 123, "music": { "id": 123, "title": "...", "author": "...", "pic": "...", "url": "...", "duration": "..." } }]
  }
}`,
    notes: ['缺少 music 信息的条目只保留 music_id，按需再解析详情', '封面 http:// 与 // 开头会统一升为 https']
  },
  {
    cat: '云端歌单',
    method: 'POST',
    path: '/member/playlist/create',
    name: '创建歌单',
    desc: '新建歌单。',
    auth: true,
    params: [
      { name: 'title', type: 'string', required: true, desc: '歌单标题' },
      { name: 'description', type: 'string', required: false, desc: '描述' }
    ],
    headers: 'X-Requested-With: XMLHttpRequest · Referer: /member',
    returns: '{ "code": 1, "msg": "创建成功" }',
    notes: []
  },
  {
    cat: '云端歌单',
    method: 'POST',
    path: '/member/playlist/edit',
    name: '编辑歌单',
    desc: '修改歌单标题与描述。',
    auth: true,
    params: [
      { name: 'id', type: 'number', required: true, desc: '歌单 id' },
      { name: 'title', type: 'string', required: true, desc: '新标题' },
      { name: 'description', type: 'string', required: false, desc: '新描述' }
    ],
    headers: 'X-Requested-With: XMLHttpRequest · Referer: /member',
    returns: '{ "code": 1, "msg": "修改成功" }',
    notes: []
  },
  {
    cat: '云端歌单',
    method: 'POST',
    path: '/member/playlist/delete',
    name: '删除歌单',
    desc: '删除指定歌单。',
    auth: true,
    params: [
      { name: 'id', type: 'number', required: true, desc: '歌单 id' }
    ],
    headers: 'X-Requested-With: XMLHttpRequest · Referer: /member',
    returns: '{ "code": 1, "msg": "删除成功" }',
    notes: []
  },
  {
    cat: '云端歌单',
    method: 'POST',
    path: '/member/playlist/add-song',
    name: '加入歌曲',
    desc: '把歌曲加入指定歌单。',
    auth: true,
    params: [
      { name: 'playlist_id', type: 'number', required: true, desc: '歌单 id' },
      { name: 'music_id', type: 'number', required: true, desc: '歌曲 id' }
    ],
    headers: 'X-Requested-With: XMLHttpRequest · Referer: /music/{id}',
    returns: '{ "code": 1, "msg": "成功加入歌单" }',
    notes: []
  },
  {
    cat: '云端歌单',
    method: 'POST',
    path: '/member/playlist/remove-song',
    name: '移出歌曲',
    desc: '从指定歌单移出歌曲。',
    auth: true,
    params: [
      { name: 'playlist_id', type: 'number', required: true, desc: '歌单 id' },
      { name: 'music_id', type: 'number', required: true, desc: '歌曲 id' }
    ],
    headers: 'X-Requested-With: XMLHttpRequest · Referer: /member',
    returns: '{ "code": 1, "msg": "移出成功" }',
    notes: []
  },

  /* ---- 反馈 ---- */
  {
    cat: '反馈',
    method: 'POST',
    path: '/api/feedback',
    name: '歌曲纠错反馈',
    desc: '提交歌曲信息错误。Cookie 非必需，会话存在时自动附带。',
    auth: false,
    params: [
      { name: 'musicErrType', type: 'string', required: true, desc: '错误描述，最长 30 字' },
      { name: 'musicId', type: 'number', required: true, desc: '当前歌曲 id' }
    ],
    headers: 'Content-Type: application/x-www-form-urlencoded · X-Requested-With: XMLHttpRequest · Origin: {BASE} · Referer: /music/{id}',
    returns: '{ "code": 1, "msg": "你的反馈已提交到后台，我们会尽快处理！" }',
    notes: [
      'retries=0：反馈类请求不自动重试，避免重复提交',
      '4xx 时从响应体提取站点 msg 展示给用户'
    ]
  }
]

/* ============================================================
 * 二、本地桥接层 window.api（src/api.js）
 * 渲染层统一入口，与 Windows 端 Electron preload 同签名。
 * ============================================================ */
const bridgeApis = [
  {
    cat: '桥接层',
    method: 'API',
    path: 'window.api.search',
    name: '搜索',
    desc: '搜索能力统一入口，内部调用 services/search.js。',
    params: [
      { name: 'suggest(keyword)', type: 'Promise<Result>', desc: '搜索建议' },
      { name: 'songs(keyword)', type: 'Promise<Result>', desc: '搜索结果' },
      { name: 'guess(keyword)', type: 'Promise<Result>', desc: '猜你想找' },
      { name: 'hot()', type: 'Promise<Result>', desc: '热词' },
      { name: 'hotMusic(page)', type: 'Promise<Result>', desc: '热门推荐' },
      { name: 'top(type, page)', type: 'Promise<Result>', desc: '排行榜' }
    ],
    returns: '{ ok: true, data: any } | { ok: false, error: string }',
    notes: ['所有方法经 guard() 包装，不向渲染层抛异常']
  },
  {
    cat: '桥接层',
    method: 'API',
    path: 'window.api.player',
    name: '播放与下载',
    desc: '歌曲解析、直链刷新、下载与本地音频地址。',
    params: [
      { name: 'song(musicId)', type: 'Promise<Result>', desc: '一站式获取详情 + 直链' },
      { name: 'refreshUrl(payload)', type: 'Promise<Result>', desc: '刷新失效直链，回退 urlA' },
      { name: 'download(payload)', type: 'Promise<Result>', desc: '下载字节流并落盘' },
      { name: 'localAudioUrl(payload)', type: 'Promise<Result>', desc: '本地音乐 content URI' },
      { name: 'onDownloadProgress(cb)', type: '() => void', desc: '订阅下载进度，返回取消函数' }
    ],
    returns: '{ ok: true, data: any } | { ok: false, error: string }',
    notes: ['原生端下载走 GequbaoPlugin.http 代理，绕开 WebView CORS']
  },
  {
    cat: '桥接层',
    method: 'API',
    path: 'window.api.history',
    name: '播放历史',
    desc: '最近播放记录的本地持久化。',
    params: [
      { name: 'list()', type: 'Promise<Result>', desc: '读取全部记录' },
      { name: 'add(entry)', type: 'Promise<Result>', desc: '追加记录' },
      { name: 'remove(id)', type: 'Promise<Result>', desc: '删除单条' },
      { name: 'clear()', type: 'Promise<Result>', desc: '清空' }
    ],
    returns: '{ ok: true, data: any } | { ok: false, error: string }',
    notes: []
  },
  {
    cat: '桥接层',
    method: 'API',
    path: 'window.api.settings',
    name: '设置',
    desc: '应用设置的读写。',
    params: [
      { name: 'get()', type: 'Promise<Result>', desc: '读取设置' },
      { name: 'set(patch)', type: 'Promise<Result>', desc: '局部更新' }
    ],
    returns: '{ ok: true, data: any } | { ok: false, error: string }',
    notes: []
  },
  {
    cat: '桥接层',
    method: 'API',
    path: 'window.api.library / dialog',
    name: '本地音乐与目录',
    desc: '媒体库扫描与目录选择。',
    params: [
      { name: 'library.scan(dir)', type: 'Promise<Result>', desc: '扫描系统媒体库音频' },
      { name: 'dialog.pickDirectory()', type: 'Promise<Result>', desc: '移动端固定返回空路径，表示扫描整个媒体库' }
    ],
    returns: '{ ok: true, data: any } | { ok: false, error: string }',
    notes: ['首次扫描需 READ_MEDIA_AUDIO 运行时权限']
  },
  {
    cat: '桥接层',
    method: 'API',
    path: 'window.api.theme / window',
    name: '主题与窗口',
    desc: '状态栏、导航栏与窗口控制。移动端多数为空实现。',
    params: [
      { name: 'theme.setNative(theme)', type: 'void', desc: '移动端由 CSS 变量驱动，无需通知原生' },
      { name: 'theme.setStatusBar(opts)', type: 'Promise<Result>', desc: '同步状态栏颜色' },
      { name: 'theme.setNavigationBar(opts)', type: 'Promise<Result>', desc: '同步导航栏颜色' },
      { name: 'window.minimize() / toggleMaximize() / close()', type: 'void', desc: '移动端无窗口概念' },
      { name: 'window.state() / onStateChanged(cb)', type: 'Promise<Result>', desc: '固定返回非最大化' }
    ],
    returns: '{ ok: true, data: any } | { ok: false, error: string }',
    notes: []
  },
  {
    cat: '桥接层',
    method: 'API',
    path: 'window.api.openExternal(url)',
    name: '外部链接',
    desc: '用系统浏览器打开链接。',
    params: [
      { name: 'url', type: 'string', required: true, desc: '仅接受 http / https' }
    ],
    returns: '{ ok: true } | { ok: false, error: string }',
    notes: ['通过 @capacitor/browser 打开']
  }
]

/* ---- 视图状态 ---- */
const scope = ref('site')
const scopes = [
  { key: 'site', label: '站点 HTTP 接口' },
  { key: 'bridge', label: '本地桥接' }
]
const activeTab = ref('全部')
const currentList = computed(() => (scope.value === 'site' ? siteApis : bridgeApis))
const cats = computed(() => [...new Set(currentList.value.map((a) => a.cat))])
const tabs = computed(() => ['全部', ...cats.value])
const filtered = computed(() =>
  activeTab.value === '全部' ? currentList.value : currentList.value.filter((a) => a.cat === activeTab.value)
)
const countOf = (t) => (t === '全部' ? currentList.value.length : currentList.value.filter((a) => a.cat === t).length)
watch(scope, () => { activeTab.value = '全部' })

/* 分类 Tab 横向拖动：触摸设备走原生 overflow 滚动，桌面鼠标用 window 级监听补齐。
   不使用 setPointerCapture——它会把 click 的 target 改成容器，导致分类无法点击。 */
const tabsEl = ref(null)
const dragging = ref(false)
const tabDrag = { active: false, startX: 0, startScroll: 0, moved: false }

function onTabWindowMove(e) {
  if (!tabDrag.active) return
  const dx = e.clientX - tabDrag.startX
  if (!tabDrag.moved && Math.abs(dx) > 5) {
    tabDrag.moved = true
    dragging.value = true
  }
  if (tabDrag.moved && tabsEl.value) {
    tabsEl.value.scrollLeft = tabDrag.startScroll - dx
  }
}

function stopTabDrag() {
  tabDrag.active = false
  dragging.value = false
  window.removeEventListener('pointermove', onTabWindowMove)
  window.removeEventListener('pointerup', stopTabDrag)
}

function onTabPointerDown(e) {
  if (e.pointerType !== 'mouse' || e.button !== 0) return
  const el = tabsEl.value
  if (!el) return
  tabDrag.active = true
  tabDrag.startX = e.clientX
  tabDrag.startScroll = el.scrollLeft
  tabDrag.moved = false
  window.addEventListener('pointermove', onTabWindowMove)
  window.addEventListener('pointerup', stopTabDrag)
}

function onTabClickCapture(e) {
  // 仅拖动后吞掉误触的普通点击；正常点击不拦截，分类照常切换
  if (!tabDrag.moved) return
  e.preventDefault()
  e.stopPropagation()
  tabDrag.moved = false
}

onBeforeUnmount(stopTabDrag)
</script>

<template>
  <div class="view">
    <div class="col" style="gap: var(--space-4); max-width: 800px">
      <!-- 概述 -->
      <section class="card overview">
        <h2 class="title">API 文档</h2>
        <p class="muted desc">
          站点原始 HTTP 接口共 <b>{{ siteApis.length }}</b> 个，基础地址
          <code class="mono">{{ BASE }}</code>；热词接口使用
          <code class="mono">{{ KUWO }}</code>。下方卡片仅列出路径，<code class="mono">{BASE}</code> 即上方站点基础地址。所有接口均从应用实际请求中提取，
          与服务端保持一致；另有 <b>{{ bridgeApis.length }}</b> 组本地桥接接口供渲染层调用。
        </p>
        <div class="legend">
          <span class="legend-item"><i class="dot-need"></i>需要登录 Cookie</span>
          <span class="legend-item"><i class="dot-free"></i>无需登录</span>
          <span class="legend-item"><code class="mono">code=1</code> 表示业务成功</span>
        </div>
      </section>

      <!-- 双层切换 -->
      <div class="scope-bar">
        <button
          v-for="s in scopes"
          :key="s.key"
          class="scope-btn"
          :class="{ active: s.key === scope }"
          @click="scope = s.key"
        >
          {{ s.label }}
        </button>
      </div>

      <!-- 分类 Tab（支持横向拖动，吸顶时可查看被截断的分类） -->
      <div
        ref="tabsEl"
        class="tabs"
        :class="{ dragging }"
        @pointerdown="onTabPointerDown"
        @click.capture="onTabClickCapture"
      >
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
      <section v-for="api in filtered" :key="api.method + api.path" class="card api-card">
        <div class="api-signature">
          <code class="mono api-path">
            <span class="method" :class="api.method.toLowerCase()">{{ api.method }}</span>
            <span class="path-text">{{ api.path }}</span>
          </code>
          <span class="tag">{{ api.cat }}</span>
        </div>

        <div class="api-heading">
          <h3 class="api-name">{{ api.name }}</h3>
          <span v-if="scope === 'site'" class="auth" :class="{ need: api.auth }">
            {{ api.auth ? '需登录' : '公开' }}
          </span>
        </div>

        <p class="api-desc">{{ api.desc }}</p>

        <!-- 请求头 -->
        <div v-if="api.headers" class="api-block">
          <div class="block-title"><span class="dot"></span>请求头 · Headers</div>
          <pre class="api-return mono">{{ api.headers }}</pre>
        </div>

        <!-- 参数 -->
        <div v-if="api.params.length" class="api-block">
          <div class="block-title"><span class="dot"></span>参数 · Parameters</div>
          <div class="param-list">
            <div v-for="p in api.params" :key="p.name" class="param-row">
              <div class="param-head">
                <code class="mono param-name">{{ p.name }}</code>
                <code class="mono param-type">{{ p.type }}</code>
                <span v-if="p.required" class="required">必填</span>
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
  gap: var(--space-3);
}
.title {
  margin: 0;
  font-size: var(--fs-h2);
  font-weight: 600;
  color: var(--text);
}
.desc {
  margin: 0;
  font-size: var(--fs-body);
  line-height: var(--lh-body);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  font-size: var(--fs-caption);
  color: var(--text-3);
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}
.dot-need,
.dot-free {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-pill);
  display: inline-block;
}
.dot-need { background: var(--accent); }
.dot-free { background: var(--border-strong); }

/* 双层切换 */
.scope-bar {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}
.scope-btn {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  font-size: var(--fs-body);
  cursor: pointer;
  transition: background var(--t), color var(--t);
}
.scope-btn.active {
  background: var(--surface);
  color: var(--accent);
  font-weight: 600;
  box-shadow: var(--shadow-1);
}

/* Tab 栏：滚动时吸顶，方便在长列表中随时切换分类 */
.tabs {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  padding: var(--space-2) 0;
  /* 不透明背景，防止下方卡片从 Tab 缝隙透出 */
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  scrollbar-width: none;
  cursor: grab;
  user-select: none;
}
.tabs.dragging {
  cursor: grabbing;
  scroll-behavior: auto;
}
.tabs::-webkit-scrollbar {
  display: none;
}
.tab {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--text-2);
  font-size: var(--fs-body);
  cursor: pointer;
  transition: background var(--t), color var(--t), border-color var(--t);
}
.tab.active {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent);
  font-weight: 600;
}
.tab-count {
  font-size: var(--fs-caption);
  padding: 0 var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--text-2);
}
.tab.active .tab-count {
  background: var(--accent);
  color: var(--on-accent);
}

/* 接口卡片 */
.api-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.api-signature {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
.api-path {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  background: transparent;
  padding: 0;
  color: var(--text);
  word-break: break-all;
}
.method {
  flex-shrink: 0;
  font-size: var(--fs-caption);
  font-weight: 600;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--space-1);
  background: var(--accent-soft);
  color: var(--accent);
}
.method.post,
.method.api {
  background: var(--surface-active);
  color: var(--text-2);
}
.path-text { min-width: 0; }
.tag {
  flex-shrink: 0;
  font-size: var(--fs-caption);
  font-weight: 600;
  color: var(--accent);
  background: var(--surface-active);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  white-space: nowrap;
}
.api-heading {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.api-name {
  margin: 0;
  font-size: var(--fs-title);
  font-weight: 600;
  color: var(--text);
}
.auth {
  font-size: var(--fs-caption);
  color: var(--text-3);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
}
.auth.need {
  color: var(--accent);
  border-color: var(--accent);
}
.api-desc {
  margin: 0;
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  color: var(--text-2);
}

/* 区块 */
.api-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.block-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--fs-caption);
  font-weight: 600;
  color: var(--text-3);
}
.block-title .dot {
  width: var(--space-1);
  height: var(--space-4);
  border-radius: var(--space-1);
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
  gap: var(--space-1);
  padding: var(--space-3) 0;
  border-bottom: 1px dashed var(--border);
}
.param-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.param-head {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.param-name {
  font-size: var(--fs-body);
  font-weight: 600;
  color: var(--text);
}
.param-type {
  font-size: var(--fs-caption);
  color: var(--accent);
  background: var(--surface-active);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--space-1);
}
.required {
  font-size: var(--fs-caption);
  color: var(--text-3);
}
.param-desc {
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}

/* 返回码块 */
.api-return {
  margin: 0;
  padding: var(--space-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
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
  gap: var(--space-2);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
  color: var(--text-2);
}
.api-notes li {
  position: relative;
  padding-left: var(--space-4);
}
.api-notes li::before {
  content: '';
  position: absolute;
  left: var(--space-1);
  top: var(--space-2);
  width: var(--space-1);
  height: var(--space-1);
  border-radius: var(--radius-pill);
  background: var(--accent);
}

/* 行内代码 */
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: var(--fs-caption);
  background: var(--surface-2);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--space-1);
  color: var(--text);
  word-break: break-all;
}
</style>
