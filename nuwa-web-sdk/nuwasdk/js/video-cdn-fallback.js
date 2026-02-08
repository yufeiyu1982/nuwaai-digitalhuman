/**
 * 视频播放修复模块 v3
 *
 * 背景：
 *   SDK 中 Pe() 和 video_play 处理器将视频 src 从 API 地址转为 res.nuwaai.com CDN 地址，
 *   但实际文件存储在阿里云 OSS (nuwa-ai.oss-cn-shenzhen.aliyuncs.com)，需要预签名 URL 访问。
 *   res.nuwaai.com/nuwa/ 上不存在这些文件，导致视频无法播放。
 *
 * 已验证事实（v2 测试结论）：
 *   - API /web/document/download 是纯代理，不会 302 重定向到 OSS
 *   - /web/document/presignUrl 和 /web/document/getUrl 接口不存在 (404)
 *   - 因此客户端无法自行获取预签名 URL，只能使用 API 代理地址
 *
 * 解决策略：
 *   1. 拦截错误的 CDN 转换，同步立即还原为 API 地址（零延迟，无网络请求）
 *   2. 修复 videoFull 元素在 Vue 渲染前被访问导致的 null 崩溃
 *   3. 防止 MutationObserver 触发无限循环
 *
 * 当后端 video_play 命令改为返回预签名 OSS URL 后（与平台一致），
 * 此脚本会自动识别为 OSS 地址，不做任何干预，视频直接播放。
 *
 * 要彻底解决播放速度问题，需要后端配合：
 *   方案A: WebSocket video_play 命令直接返回预签名 OSS URL（推荐，与平台一致）
 *   方案B: 后端新增 /web/document/presignUrl?filename=xxx 接口返回预签名 URL
 *   方案C: /web/document/download 改为 302 重定向到预签名 OSS URL（而非代理转发）
 */
(function () {
  'use strict';

  var BROKEN_CDN = 'https://res.nuwaai.com/nuwa/';
  var API_BASE = 'https://api.nuwaai.com/web/document/download?filename=';
  var OSS_MARKER = '.aliyuncs.com/';

  // 标记：由本模块设置的 src，MutationObserver 应忽略
  var settingFromFix = false;

  // ==================== Part 1: 修复 videoFull null 崩溃 ====================

  var _origGetElementById = document.getElementById.bind(document);

  document.getElementById = function (id) {
    var el = _origGetElementById(id);

    if (id === 'videoFull' && !el) {
      console.warn('[VideoFix] videoFull 尚未渲染，返回占位元素');
      var dummy = document.createElement('video');
      dummy.play = function () { return Promise.resolve(); };
      dummy.load = function () {};
      return dummy;
    }

    return el;
  };

  // ==================== Part 2: 同步修复视频 src ====================

  function fixVideoSrc(video) {
    var src = video.getAttribute('src') || '';
    if (!src) return;

    // 已经是 OSS 预签名 URL → 不干预，直接快速播放
    if (src.indexOf(OSS_MARKER) !== -1) return;

    // 已经是 API 地址 → 不干预（这是当前能用的最佳地址）
    if (src.indexOf(API_BASE) === 0) return;

    // 是错误的 CDN 地址 → 同步还原为 API 地址
    if (src.indexOf(BROKEN_CDN) === 0) {
      var filename = src.substring(BROKEN_CDN.length);
      var apiUrl = API_BASE + filename;
      console.log('[VideoFix] 跳过无效 CDN，直接使用 API:', apiUrl);

      settingFromFix = true;
      video.setAttribute('src', apiUrl);
      settingFromFix = false;

      video.load();
      video.play().catch(function () {});
    }
  }

  // ==================== Part 3: MutationObserver ====================

  var HANDLED = 'data-video-fixed';

  function patchVideo(video) {
    if (video.getAttribute(HANDLED)) return;
    video.setAttribute(HANDLED, '1');
    fixVideoSrc(video);
  }

  function scanExisting() {
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      patchVideo(videos[i]);
    }
  }

  function startObserver() {
    var observer = new MutationObserver(function (mutations) {
      // 如果是本模块自己设置的 src，跳过（防止循环）
      if (settingFromFix) return;

      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];

        // 新增节点
        if (mutation.addedNodes) {
          for (var j = 0; j < mutation.addedNodes.length; j++) {
            var node = mutation.addedNodes[j];
            if (node.nodeType !== 1) continue;

            if (node.tagName === 'VIDEO') {
              patchVideo(node);
            }
            if (node.querySelectorAll) {
              var inner = node.querySelectorAll('video');
              for (var k = 0; k < inner.length; k++) {
                patchVideo(inner[k]);
              }
            }
          }
        }

        // src 属性变化（由外部代码设置，如 SDK 的 Pe() 或 video_play 处理器）
        if (mutation.type === 'attributes' &&
            mutation.attributeName === 'src' &&
            mutation.target.tagName === 'VIDEO') {
          // 重置 handled 标记，重新检查新的 src
          mutation.target.removeAttribute(HANDLED);
          patchVideo(mutation.target);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src']
    });
  }

  // ==================== 启动 ====================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      scanExisting();
      startObserver();
    });
  } else {
    scanExisting();
    startObserver();
  }

  console.log('[VideoFix] 视频播放修复模块 v3 已加载（同步修复，无额外网络请求）');
})();
