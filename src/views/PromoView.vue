<script setup>
import Icon from '../components/Icon.vue'

// TODO: 替换为影悦真实官网 / 下载地址
const officialUrl = 'https://gitee.com/suyuebai/yy-music'
const yyMusicUrl = 'https://gitee.com/suyuebai/yy-music/releases'
const isHidden = false // 暂时隐藏

const features = [
  { icon: 'music', title: '完全免费', desc: '无会员、无付费，免费畅听所有音质歌曲' },
  { icon: 'close', title: '纯净无广告', desc: '没有开屏与插播广告，专注听歌' },
  { icon: 'volume', title: '高码率音质', desc: '支持高码率与无损音源' },
  { icon: 'lyrics', title: '歌词', desc: '逐字高亮歌词、人性化桌面歌词' },
  { icon: 'library', title: '本地 + 在线', desc: '本地曲库管理与在线搜索一站搞定' },
  { icon: 'heart', title: '轻量流畅', desc: '占用低、启动快，老旧电脑也顺滑' },
  { icon: 'windows', title: '云端控制', desc: '可以登录你的KW账号进行管理歌单（创建收藏等）' },
  { icon: 'music', title: '评论', desc: '支持发布、回复、点赞、删除、举报评论' }
]

async function goExternal(url) {
  try {
    if (window.api?.openExternal) {
      const r = await window.api.openExternal(url)
      if (r?.ok) return
    }
  } catch { /* 回退到浏览器打开 */ }
  window.open(url, '_blank', 'noopener')
}

function goDownload() { goExternal(yyMusicUrl) }
function goSite() { goExternal(officialUrl) }
</script>

<template>
  <div class="promo">
    <!-- Hero -->
    <section class="hero">
      <div class="logo">
        <Icon name="windows" :size="42" />
      </div>
      <h1 class="app-name">影悦</h1>
      <p class="tagline">Windows 端的免费听歌软件</p>
      <p class="slogan">无广告 · 全免费 · 无损音质</p>
      <div class="cta">
        <button class="pbtn primary" @click="goDownload">
          <Icon name="download" :size="18" />
          免费下载
        </button>
        <button class="pbtn ghost" @click="goSite">
          <Icon name="link" :size="18" />
          官方网站
        </button>
      </div>
      <p class="plat">推荐系统 Windows 10 / 11<br>开发者：苏月白
      </p>
    </section>

    <!-- 功能亮点 -->
    <section class="card feat-grid">
      <div v-for="f in features" :key="f.title" class="feat">
        <span class="feat-ic">
          <Icon :name="f.icon" :size="22" />
        </span>
        <div class="feat-text">
          <p class="feat-title">{{ f.title }}</p>
          <p class="feat-desc">{{ f.desc }}</p>
        </div>
      </div>
    </section>

    <!-- 与歌曲宝的关系 -->
    <section class="card note">
      <h2>与「歌曲宝」对比</h2>
      <p>
        影悦 采用官方接口，歌曲齐全，歌单、mv、歌手、评论功能、音质等数据直连官方，功能一应俱全，稳定不卡顿；
        「免费、无广告、专注听歌」的理念。在电脑上也能享受和手机一致的听歌体验。
      </p>
    </section>

    <!-- 底部行动号召 -->
    <section class="card cta-card" v-if="isHidden">
      <p class="cta-card-title">立即在电脑上听歌</p>
      <p class="cta-card-desc">免费下载影悦，把喜欢的歌搬到大屏幕。</p>
      <button class="pbtn primary block" @click="goDownload">
        <Icon name="download" :size="18" />
        下载 Windows 版
      </button>
    </section>

    <p class="foot">影悦推广</p>
  </div>
</template>

<style scoped>
.promo {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Hero */
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  padding: 30px 20px 26px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: linear-gradient(150deg,
      color-mix(in srgb, var(--accent) 24%, var(--surface)),
      var(--surface));
}

.logo {
  width: 76px;
  height: 76px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(140deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #000));
  box-shadow: 0 8px 22px color-mix(in srgb, var(--accent) 36%, transparent);
}

.app-name {
  margin: 6px 0 0;
  font-size: 30px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.tagline {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.slogan {
  margin: 0;
  font-size: 13px;
  color: var(--text-3);
  line-height: 1.5;
  max-width: 320px;
}

.cta {
  display: flex;
  gap: 10px;
  margin-top: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.plat {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-3);
}

/* 按钮 */
.pbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 40px;
  padding: 0 18px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--t), border-color var(--t), transform var(--t);
}

.pbtn:active {
  transform: scale(0.98);
}

.pbtn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}

.pbtn.primary:active {
  background: color-mix(in srgb, var(--accent) 88%, #000);
}

.pbtn.ghost {
  background: transparent;
}

.pbtn.block {
  width: 100%;
}

/* 功能网格 */
.feat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 14px;
  padding: 16px 16px;
}

.feat {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
}

.feat:nth-last-child(-n + 2) {
  border-bottom: 0;
}

.feat-ic {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 11px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}

.feat-text {
  min-width: 0;
}

.feat-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}

.feat-desc {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.45;
}

/* 说明卡 */
.note {
  padding: 16px 18px;
}

.note h2 {
  margin: 0 0 8px;
  font-size: 16px;
}

.note p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-2);
}

/* 底部 CTA */
.cta-card {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: center;
}

.cta-card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.cta-card-desc {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--text-3);
}

.foot {
  margin: 2px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-3);
}

@media (max-width: 380px) {
  .feat-grid {
    grid-template-columns: 1fr;
  }

  .feat:nth-last-child(2) {
    border-bottom: 1px solid var(--border);
  }
}
</style>
