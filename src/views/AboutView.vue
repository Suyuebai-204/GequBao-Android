<script setup>
import { ref } from 'vue'
import pkg from '../../package.json'
import Icon from '../components/Icon.vue'
import wxzsm from '../images/wxzsm.png'
import zfb from '../images/zfb.png'

const emit = defineEmits(['navigate'])

const APP_NAME = '歌曲宝'
const DEVELOPER = '苏月白'
const QQ = 3608714354
const REPO_URL = 'https://gitee.com/suyuebai/gequ-bao-android'
const SITE_URL = 'https://www.gequbao.com'

const stack = [
  { label: 'Capacitor', desc: '安卓原生壳' },
  { label: 'Vue 3', desc: '界面与状态' },
  { label: 'Vite', desc: '构建工具' },
  { label: 'WebView', desc: '渲染与播放' },
  { label: 'tesseract.js', desc: '验证码识别' },
  { label: 'MediaStore', desc: '本地媒体库' }
]

function open(url) {
  window.api?.openExternal?.(url)
}
// 赏赞二维码预览：优先用原生大图查看（若已实现），否则回退到网页内弹窗
const reward = ref(null)
function previewReward(title, src) {
  if (window.api?.showImage) {
    window.api.showImage(src)
  } else {
    reward.value = { title, src }
  }
}
function closeReward() {
  reward.value = null
}
</script>

<template>
  <div class="view">

    <div class="col" style="gap: 14px; max-width: 620px">
      <section class="card col" style="gap: 1px">
        <div class="row" style="gap: 12px">
          <div class="logo">
            <Icon name="music" :size="22" />
          </div>
          <div class="col" style="gap: 2px">
            <div class="app-title">
              <span class="app-name">{{ APP_NAME }}</span>
              <span class="app-badge">重制版</span>
            </div>
            <span class="muted">v{{ pkg.version }} • Android</span>
          </div>
        </div>
        <p class="muted" style="font-size: 13px; line-height: 1.6">
          一款简洁的安卓音乐播放器：支持在线搜索、热门推荐、排行榜、与云端歌曲。
        </p>
      </section>

      <section class="card col" style="gap: 1px">
        <h2>开发者</h2>
        <div class="row" style="gap: 8px;">
          <!-- 头像 -->
          <img :src="`http://q1.qlogo.cn/g?b=qq&nk=${QQ}&s=640`" alt="头像"
            style="width: 50px; height: 50px; border-radius: 50%;">
          <div style="display: flex; flex-direction: column">
            <span>{{ DEVELOPER }}</span>
            <span class="muted">Suyuebai-wys@outlook.com</span>
          </div>
          <div>
            <Icon name="share" :size="14" />
          </div>
        </div>
        <div
          style="color: gray;font-size: 12px;margin-top: 8px; padding: 10px; border-radius: 10px;border: 1px solid rgba(128,128,128,0.2);">
          <b>开发者留言：</b><br>
          &emsp;1.之前的<u>歌曲宝App</u><b>（Lua语言开发）</b>是我用手机编程工具做的，所以限制很多，基本是纯手搓，很多性能和功能的问题不能很好的解决；<br>
          &emsp;2.所以，在学习新语言后就把它停更了，现在采用新语言和新框架进行开发，得益于AI的帮助，很多问题都能解决，方便许多；<br>
          &emsp;3.因歌曲宝站点本身的原因，歌曲不全，音质单一且很低，这是正常的；<br>
          &emsp;4.如果对你有帮助，请给个Star或者分享给朋友，谢谢。
        </div>
        <!-- 二维码赞赏 -->
        <div class="reward-row">
          <button class="btn btn-primary" @click="previewReward('微信赞赏', wxzsm)">
            微信赞赏
          </button>
          <button class="btn" style="background: #966ee4;color: #fff;" @click="open('https://afdian.com/a/suyuebai')">
            爱发电
          </button>
          <button class="btn" @click="previewReward('支付宝赞赏', zfb)">
            支付宝赞赏
          </button>
        </div>

      </section>
      <!-- Api文档 -->
      <section class="card col" style="gap: 1px">
        <h2>Api文档</h2>
        <button class="api-entry" @click="emit('navigate', 'apidoc')">
          <span class="api-entry-icon">
            <Icon name="code" :size="18" />
          </span>
          <span class="col api-entry-text">
            <span class="api-entry-title">接口说明（本地）</span>
            <span class="muted small">song 服务的详情 / 直链 / 下载接口</span>
          </span>
          <Icon name="chevron" :size="18" class="api-entry-chevron" />
        </button>
      </section>

      <section class="card col" style="gap: 1px">
        <h2>开源仓库</h2>
        <div class="row" style="gap: 8px">
          <button class="btn btn-primary" @click="open(REPO_URL)">
            <Icon name="link" :size="14" />
            Gitee 仓库
          </button>
          <button class="btn" @click="open(SITE_URL)">
            <Icon name="discover" :size="14" />
            数据来源站点
          </button>
        </div>
      </section>

      <section class="card col" style="gap: 1px">
        <h2>技术栈</h2>
        <div class="stack-grid">
          <div v-for="item in stack" :key="item.label" class="stack-item">
            <span class="badge">{{ item.label }}</span>
            <span class="muted small">{{ item.desc }}</span>
          </div>
        </div>
      </section>

      <section class="card col">
        <h2 style="margin-bottom: 5px;">免责声明</h2>
        <p class="muted" style="font-size: 13px; line-height: 1.7">
          <b>开发者说：</b>本软件为学习交流用途的个人项目，音频数据均来自第三方公开站点，版权归原始权利方所有。
          请支持正版音乐。如果你是权利方并对内容有异议，请通过仓库 Issue 联系。<br>
          <b>站点声明：</b>本站为非营利性音乐分享网站，所有数据均系网友搜集自互联网后分享.
          音频版权来自各网站,本站不提供任何音频存储和贩卖服务,旨在音乐交流分享,支持购买正版专辑.
          如涉及侵权请联系我们删除.
          联系tg: yssmy
        </p>
      </section>
    </div>
  </div>

  <!-- 赏赞二维码预览 -->
  <Teleport to="body">
    <transition name="fade">
      <div v-if="reward" class="reward-mask" @click.self="closeReward">
        <div class="reward-sheet">
          <button class="reward-close" @click="closeReward" aria-label="关闭">
            <Icon name="close" :size="18" />
          </button>
          <p class="reward-title">{{ reward.title }}</p>
          <img :src="reward.src" class="reward-qr" alt="二维码" />
          <p class="reward-hint">截图后，用对应 App 扫码即可</p>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
/* 标题与徽标用 flex 垂直居中，避免 inline-flex 基线对齐造成上下偏移 */
.app-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.app-name {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
}
.app-badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 1px 5px;
  border-radius: 5px;
  background: rgba(128, 128, 128, 0.25);
  color: var(--text-2);
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
}

.logo {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  background: var(--surface-active);
  color: var(--accent);
}

.stack-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px 16px;
}

.stack-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-active);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.small {
  font-size: 12px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* API 文档入口（跳转本地文档页） */
.api-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 6px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.api-entry-icon {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius);
  background: var(--surface-active);
  color: var(--accent);
}

.api-entry-text {
  flex: 1;
  min-width: 0;
  gap: 2px;
}

.api-entry-title {
  font-weight: 600;
  font-size: 14px;
}

.api-entry-chevron {
  flex-shrink: 0;
  color: var(--text-3);
}

.api-ext {
  width: 100%;
  justify-content: center;
  margin-top: 2px;
}

.reward-row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
/* 三个赞赏按钮等分整行，随容器宽度自适应 */
.reward-row .btn {
  flex: 1 1 0;
  min-width: 0;
  padding: 0 6px;
  white-space: nowrap;
  text-align: center;
}

@media (max-width: 360px) {
  .reward-row { gap: 6px; }
  .reward-row .btn { padding: 0 4px; font-size: 12px; }
}

.reward-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, .55);
}

.reward-sheet {
  position: relative;
  width: 100%;
  max-width: 300px;
  padding: 22px 20px 18px;
  text-align: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 12px 40px rgba(0, 0, 0, .35);
}

.reward-close {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-3);
  border-radius: 8px;
  cursor: pointer;
}

.reward-close:active {
  background: var(--surface-active);
}

.reward-title {
  margin: 2px 0 14px;
  font-size: 15px;
  font-weight: 700;
}

.reward-qr {
  width: 210px;
  height: 210px;
  max-width: 100%;
  border-radius: 12px;
  background: #fff;
  object-fit: contain;
}

.reward-hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.5;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity .18s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
