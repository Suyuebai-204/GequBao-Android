package com.yygzs.gqbs

import android.content.Context
import com.baidu.mobstat.StatService
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.HashMap

@CapacitorPlugin(name = "BaiduStat")
class BaiduStatPlugin : Plugin() {

    private fun appContext(): Context = context.applicationContext

    private fun attributes(call: PluginCall): HashMap<String, String>? {
        val obj = try { call.getObject("attributes") } catch (_: Exception) { null } ?: return null
        val map = HashMap<String, String>()
        val keys = obj.keys()
        while (keys.hasNext()) {
            val key = keys.next() ?: continue
            val value = obj.opt(key) ?: continue
            map[key] = value.toString()
        }
        return if (map.isEmpty()) null else map
    }

    @PluginMethod
    fun onPageStart(call: PluginCall) {
        val page = call.getString("page") ?: run { call.reject("missing page"); return }
        StatService.onPageStart(appContext(), page)
        call.resolve()
    }

    @PluginMethod
    fun onPageEnd(call: PluginCall) {
        val page = call.getString("page") ?: run { call.reject("missing page"); return }
        StatService.onPageEnd(appContext(), page)
        call.resolve()
    }

    @PluginMethod
    fun onEvent(call: PluginCall) {
        val eventId = call.getString("eventId") ?: run { call.reject("missing eventId"); return }
        val label = call.getString("label") ?: run { call.reject("missing label"); return }
        val acc = call.getInt("acc", 1) ?: 1
        val attrs = attributes(call)
        if (attrs != null) {
            StatService.onEvent(appContext(), eventId, label, acc, attrs)
        } else {
            StatService.onEvent(appContext(), eventId, label, acc)
        }
        call.resolve()
    }

    @PluginMethod
    fun onEventStart(call: PluginCall) {
        val eventId = call.getString("eventId") ?: run { call.reject("missing eventId"); return }
        val label = call.getString("label") ?: run { call.reject("missing label"); return }
        StatService.onEventStart(appContext(), eventId, label)
        call.resolve()
    }

    @PluginMethod
    fun onEventEnd(call: PluginCall) {
        val eventId = call.getString("eventId") ?: run { call.reject("missing eventId"); return }
        val label = call.getString("label") ?: run { call.reject("missing label"); return }
        val attrs = attributes(call)
        if (attrs != null) {
            StatService.onEventEnd(appContext(), eventId, label, attrs)
        } else {
            StatService.onEventEnd(appContext(), eventId, label)
        }
        call.resolve()
    }

    @PluginMethod
    fun onEventDuration(call: PluginCall) {
        val eventId = call.getString("eventId") ?: run { call.reject("missing eventId"); return }
        val label = call.getString("label") ?: run { call.reject("missing label"); return }
        val duration = call.getLong("duration", 0L) ?: 0L
        val attrs = attributes(call)
        if (attrs != null) {
            StatService.onEventDuration(appContext(), eventId, label, duration, attrs)
        } else {
            StatService.onEventDuration(appContext(), eventId, label, duration)
        }
        call.resolve()
    }

    @PluginMethod
    fun setDebugOn(call: PluginCall) {
        StatService.setDebugOn(call.getBoolean("enabled", false) == true)
        call.resolve()
    }
}
