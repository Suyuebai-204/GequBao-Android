package com.yygzs.gqbs

import android.app.Application
import com.baidu.mobstat.StatService

class GequbaoApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // 自动埋点版 SDK：统计 Activity 页面；WebView 页面由 BaiduStat 插件手动上报。
        StatService.autoTrace(this, true, false)
    }
}
