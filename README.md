# 歌曲宝 · 安卓手机 / 电视端

基于 Windows 端 Vue3 + Electron 项目（`H:\GequBao`）移植的安卓版本，采用 **Capacitor 6 + Vite + Vue3** 技术栈。
同一套渲染层代码（`views / components / composables`）零改动复用，业务逻辑通过 `window.api` 桥接层移植到浏览器/原生环境，
并针对手机触屏与 Android TV 遥控器做最小适配。

> 适配方案详见：`歌曲宝-安卓手机电视端适配开发方案.md`

---

## 一、架构映射（与 Windows 端对照）

| Windows 端 | 安卓端（本项目） | 说明 |
| --- | --- | --- |
| `main/*.js`（Node 业务） | `src/services/*.js` | 纯 JS 移植：抓取/搜索解析/歌曲解析/OCR/本地库/历史/设置 |
| `preload/index.js`（ipc 桥） | `src/api.js` + `src/native/bridge.js` | 实现同签名的 `window.api`，内部调用 services 或原生插件 |
| Electron `BrowserWindow` | Capacitor `BridgeActivity` + Android WebView | 渲染层运行在 WebView |
| `fs` / `localStorage` | `@capacitor/preferences` / `@capacitor/filesystem` | 历史记录、设置、下载落盘 |
| 无（桌面直连） | `GequbaoPlugin.http`（Java 代理） | **绕开 WebView 的 CORS 限制**，是站点抓取能跑通的关键 |
| 系统文件遍历 | `GequbaoPlugin.scanLibrary`（MediaStore） | 扫描系统媒体库 |
| 系统下载目录 | `GequbaoPlugin.saveToDownloads`（MediaStore） | 导出到「下载/歌曲宝」 |
| 无 | `MusicControlsPlugin` + 前台服务 | 后台播放、锁屏/通知栏控制、耳机按键 |

---

## 二、目录结构

```
h:\GequBao Android\
├─ index.html / vite.config.js / capacitor.config.json / package.json
├─ src\
│  ├─ main.js                 # 启动：注入 window.api、TV 检测、主题、播放器初始化
│  ├─ App.vue                 # 手机/TV 外壳：顶部搜索栏 + 底栏/左栏导航 + 视图切换
│  ├─ api.js                  # window.api 实现（与 Windows 端同签名）
│  ├─ services\               # 移植自 main/，浏览器化
│  │  ├─ http.js  search.js  song.js  library.js  store.js  settings.js
│  ├─ composables\            # 直接复用渲染层（player / recent / theme）
│  ├─ components\             # Icon / SearchBox / PlayerSheet / MobileNav / Versions
│  ├─ views\                  # Discover / Hot / Charts / Search / Library / Settings / About
│  ├─ native\bridge.js        # 原生插件桥（Gequbao / MusicControls），含浏览器兜底
│  ├─ mobile\remoteFocus.js   # TV 遥控器 D-pad 焦点管理
│  └─ assets\main.css         # 全局样式（含手机/TV 适配）
└─ android\                   # Capacitor 生成的原生工程（已含自定义插件）
   └─ app\src\main\java\com\gequbao\app\
      ├─ MainActivity.kt
      ├─ GequbaoPlugin.kt      # http 代理 / 媒体库扫描 / 下载导出
      └─ MusicControlsPlugin.kt# 后台播放 + 通知栏/锁屏控制
```

---

## 三、本地开发（Web）

```bash
npm install
npm run dev        # 浏览器中预览（http://localhost:5173）
npm run build      # 产物输出到 dist/
```
> 浏览器环境没有原生插件，`Gequbao.http / scanLibrary` 会走安全兜底（本地音乐为空、跨域接口可能失败），
> 仅用于 UI 联调。真机抓取/播放请打 APK。

---

## 四、构建安卓 APK（手机 / TV 同一包）

需要 **Android SDK（API 34 编译、minSdk 适配）+ JDK 17 + Gradle**（本机当前未安装，故 APK 需你侧执行）。

```bash
# 1. 已生成 android/ 工程并完成插件注册，下面同步最新 web 产物
npx cap sync android

# 2. 用 Android Studio 打开 android/ 目录，连设备或 TV，点击 Run；或命令行：
cd android
./gradlew assembleDebug          # 调试包
./gradlew assembleRelease        # 正式包（需自签或 Play 签名）
```

### TV 打包注意
- `AndroidManifest.xml` 已声明 `LEANBACK_LAUNCHER` 入口与 `android.software.leanback` 特性（`touchscreen` 设为 `required=false`），
  同一 APK 可同时安装到手机与电视。
- TV 横屏大字体由 `html.is-tv` 全局样式驱动；原生在启动时注入 `window.isTV`（见 `src/mobile/tv.js`，UA 兜底）。
- TV 横幅：`android/app/src/main/res/drawable/tv_banner.xml`（当前为渐变底 + 应用图标占位，
  建议替换为带「歌曲宝」字样的 320×180 正式 PNG）。

---

## 四点五、响应式布局（平板 / 横屏 / TV）

布局由三个运行时标记驱动（`src/mobile/tv.js`），纯 CSS 切换，无 JS 分支渲染：

| 标记 | 触发条件 | 布局形态 |
| --- | --- | --- |
| 默认（无标记） | 竖屏手机 / 窄窗口 | 顶部搜索栏 + 内容 + **底部导航栏** |
| `html.is-wide` | 横屏且宽 ≥640px，或宽 ≥900px | **左侧紧凑图标栏（76px）** + 内容限宽 1100px 居中 |
| `html.is-tv` | TV 设备 | 左侧**大字导航栏（200px）** + 大字号 + D-pad 焦点 |

播放页（`PlayerSheet.vue`）同步自适应（参考酷我播放页）：

- **竖屏**：单列 —— 封面居上、歌词居下滚动，隐藏音量条（用实体音量键）；
- **横屏**：双列 —— 歌词居左、封面与播放控制在右；
- **矮横屏（手机横屏）**：进一步紧凑（缩小封面/字号/内边距）；
- 播放页顶部把手支持**触摸下滑收起**（`touch-action: none` 保证手势可靠）。

迷你播放条在宽屏下自动避开左侧导航栏，在内容区域内居中。

---

## 五、已知限制 / 后续工作

1. **后台连续播放**：当前音频仍在 WebView 的 `<audio>` 中解码，前台服务 + MediaSession 可让大多数机型在锁屏后继续播放。
   **关于 ExoPlayer 接管**：已评估，暂缓 —— 原生播放器需要重写整个播放链路（播放/暂停/seek/进度回传/歌词同步全部改为跨桥通信），
   且本机无 Android SDK 无法编译验证，风险较高。当前锁屏/通知栏控制已可用；如需绝对稳定后台，建议在真机验证后按
   「`MusicControlsPlugin` 扩展 ExoPlayer + JS 侧增加 native-player 模式开关」的方向迭代。
2. **本地音乐权限**：`READ_MEDIA_AUDIO` 需运行时授权；首次进入「本地音乐」会触发系统授权弹窗，授予后重扫即可。
3. **验证码 OCR**：`tesseract.js` 浏览器版首次需联网下载英文训练数据并缓存（IndexedDB）。
4. **「大家都在搜」**：数据源为 `kuwo.cn` 跨域接口，原生端可正常获取，纯浏览器环境会被 CORS 拦截（已静默降级）。
5. **TV 列表行焦点**：D-pad 通过 `remoteFocus` 指令按几何位置跳转；如个别页面体验不佳，可在对应视图补 `tabindex="0"`。

---

## 六、与 Windows 端的差异点（便于维护）

- `window.api` 全部返回 `{ ok, data }` / `{ ok, error }`，渲染层无需改动。
- `localSrc`：桌面端用 `localmusic://` 协议，移动端直接返回 content URI 交给 `<audio>`。
- `dialog.pickDirectory`：移动端返回空路径，表示「扫描整个系统媒体库」。
- `theme.setNative`：移动端由 CSS 变量驱动，原生无需处理。
