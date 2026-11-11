// 在系统浏览器中打开外部链接（安卓优先用 Capacitor Browser，回退到 window.open）
export async function openExternalBrowser(url) {
  try {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url, presentationStyle: 'popover' })
    return
  } catch {
    // Capacitor 不可用（如桌面开发环境）时回退
  }
  try {
    const w = window.open(url, '_blank', 'noopener')
    if (!w) location.href = url
  } catch {
    location.href = url
  }
}
