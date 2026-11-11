<script setup>
import Icon from '../components/Icon.vue'
import LinkCard from '../components/LinkCard.vue'
import { openExternalBrowser } from '../utils/openExternal.js'

const officialSites = [
  {
    name: '民政部・未成年人寻亲公告',
    url: 'https://zwfw.mca.gov.cn/appsv2/cbsSeekingDr/index.html',
    fallbackTitle: '民政一体化政务服务平台',
    fallbackDesc: '原打拐解救儿童寻亲公告迁移入口，官方权威、持续更新'
  },
  {
    name: '民政部·全国救助寻亲网',
    url: 'https://www.mca.gov.cn/lljz/index.html',
    fallbackTitle: '全国救助寻亲网',
    fallbackDesc: '各地救助管理机构发布受助人员寻亲公告，帮助走失人员回归家庭。'
  },
  {
    name: "抖音寻人官方账号",
    url: 'https://mp.toutiao.com/mpeople_search/?ug_route_out_customs_info=%7B%22cert_id%22%3A%2231043330%22%2C%22biz_report_params%22%3A%7B%22search_keyword%22%3A%22%E6%8A%96%E9%9F%B3%E5%AF%BB%E4%BA%BA%20%E5%85%A5%E5%8F%A3%22%2C%22search_id%22%3A%2220261105062720C5A5499701F44A8F3D79%22%2C%22card_id%22%3A%22douyin.douyin_tips.douyin_tips%22%7D%7D&__bullet_trident_starter_session_id=95c12ac0-89d1-4c8f-aee8-aa516048197b&__bullet_trident_call_id=039003fb-280f-4a0d-b786-b0058514e065&disable_auto_expose=1&enable_webview_select_search=1&need_out_animation=right&font_scale=1.0',
    fallbackTitle: '抖音寻人',
    fallbackDesc: '抖音寻人为公益项目，公益热线（24小时响应）：400-140-2108'}
]

const welfareSites = [
  {
    name: '宝贝回家寻子网',
    url: 'https://www.baobeihuijia.com/',
    fallbackTitle: '宝贝回家 — 关爱儿童我们共同的责任',
    fallbackDesc: '国内最大民间寻亲公益组织，志愿者助力，帮助走失儿童回家。'
  },
  {
    name: '让爱回家公益寻人网',
    url: 'https://www.rangaihuijia.com/index.php',
    fallbackTitle: '让爱回家公益寻人网',
    fallbackDesc: '国内老牌正规寻人公益站点，侧重流浪人员、走失人员寻人，独立主站'
  },
  {
    name: '中国寻亲网',
    url: 'https://www.xunqinw.cn/',
    fallbackTitle: '中国寻亲网',
    fallbackDesc: '独立民间寻亲平台；失踪人员、寻家信息汇总'
  }
]

const handleOpen = (url) => openExternalBrowser(url)
</script>

<template>
  <div class="welfare">
    <!-- 顶部说明 -->
    <header class="hero">
      <span class="hero-icon">
        <Icon name="welfare" :size="26" />
      </span>
      <div class="hero-text">
        <h2 class="hero-title">公益寻亲</h2>
        <p class="hero-sub">权威打拐 / 寻亲渠道入口</p>
      </div>
    </header>
    <p class="hero-desc">
      每一条线索都可能帮助一个家庭团圆。点击卡片即可前往官方与公益站点，信息核验与线索提交请在对应网站完成。<br>
      *以下收录站点均已核查其ICP备案信息，请放心使用。
    </p>

    <!-- 官方渠道 -->
    <section class="group">
      <p class="group-title">官方权威渠道</p>
      <LinkCard
        v-for="s in officialSites"
        :key="s.url"
        :site="s"
        @open="handleOpen"
      />
    </section>

    <!-- 民间公益渠道 -->
    <section class="group">
      <p class="group-title">民间公益渠道</p>
      <LinkCard
        v-for="s in welfareSites"
        :key="s.url"
        :site="s"
        @open="handleOpen"
      />
    </section>

    <!-- 免责声明 -->
    <footer class="disclaimer">
      <p>📞 如发现疑似被拐线索，请立即拨打 <strong>110</strong></p>
      <p>
        本页面仅提供官方公益站点快捷入口；所有线索提交与信息核验请在对应官方网站完成，请勿轻信陌生人和不信任的网站。
      </p>
    </footer>
  </div>
</template>

<style scoped>
.welfare {
  max-width: 720px;
  margin: 0 auto;
}

/* 顶部说明 */
.hero {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 16px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: linear-gradient(
    150deg,
    color-mix(in srgb, var(--accent) 18%, var(--surface)),
    var(--surface)
  );
}
.hero-icon {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  color: #fff;
  background: linear-gradient(
    140deg,
    var(--accent),
    color-mix(in srgb, var(--accent) 60%, #000)
  );
  box-shadow: 0 6px 18px color-mix(in srgb, var(--accent) 32%, transparent);
}
.hero-text {
  min-width: 0;
}
.hero-title {
  margin: 0;
  font-size: 21px;
  font-weight: 800;
  letter-spacing: 0.01em;
}
.hero-sub {
  margin: 3px 0 0;
  font-size: 13px;
  color: var(--text-2);
}
.hero-desc {
  margin: 12px 2px 4px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-3);
}

/* 分组 */
.group {
  margin-top: 18px;
}
.group-title {
  margin: 0 0 10px 4px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-3);
}

/* 免责声明 */
.disclaimer {
  margin-top: 22px;
  padding: 14px 12px 4px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  line-height: 1.65;
  color: var(--text-3);
  text-align: center;
}
.disclaimer strong {
  color: #f87171;
}
.disclaimer p {
  margin: 0 0 8px;
}
</style>
