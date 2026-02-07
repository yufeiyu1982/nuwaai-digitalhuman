/**
 * 视频 CDN 播放 + API 自动降级
 *
 * 问题背景：
 *   Pe() 函数将 <video> 的 src 从 API 地址转为 CDN 地址：
 *     api.nuwaai.com/web/document/download?filename=34004/knowledge/.../xxx.mp4
 *     → res.nuwaai.com/nuwa/34004/knowledge/.../xxx.mp4
 *   但 CDN 上的路径结构可能与 filename 不一致，导致 404/403。
 *
 * 方案：
 *   用 MutationObserver 监听 DOM 中新增的 <video> 元素，
 *   - 如果 src 是 CDN 地址，记录其对应的 API 原始地址
 *   - CDN 加载失败时自动回退到 API 地址
 *   - 支持日志输出便于调试
 */
(function () {
  'use strict';

  var CDN_BASE = 'https://res.nuwaai.com/nuwa/';
  var API_BASE = 'https://api.nuwaai.com/web/document/download?filename=';

  // CDN 地址 → API 原始地址
  function cdnToApi(cdnUrl) {
    if (cdnUrl && cdnUrl.indexOf(CDN_BASE) === 0) {
      var filename = cdnUrl.substring(CDN_BASE.length);
      return API_BASE + filename;
    }
    return null;
  }

  // 标记已处理，防止重复绑定
  var HANDLED_ATTR = 'data-cdn-fallback';

  function patchVideo(video) {
    if (video.getAttribute(HANDLED_ATTR)) return;
    video.setAttribute(HANDLED_ATTR, '1');

    var src = video.getAttribute('src') || '';
    if (!src) return;

    // 只处理 CDN 地址的 video
    var apiUrl = cdnToApi(src);
    if (!apiUrl) return;

    // 保存原始 API 地址
    video.setAttribute('data-api-src', apiUrl);
    video.setAttribute('data-cdn-src', src);

    console.log('[CDN-Fallback] 检测到 CDN 视频:', src);

    // 监听加载错误 → 降级到 API
    video.addEventListener('error', function onError() {
      var currentSrc = video.getAttribute('src') || '';
      var fallback = video.getAttribute('data-api-src');

      // 只在 CDN 地址加载失败时降级，避免无限循环
      if (currentSrc.indexOf(CDN_BASE) === 0 && fallback) {
        console.warn('[CDN-Fallback] CDN 加载失败，降级到 API:', fallback);
        video.setAttribute('src', fallback);
        video.load();
        video.play().catch(function () {});
      }
    }, { once: true });
  }

  // 扫描已有的 video 元素
  function scanExisting() {
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      patchVideo(videos[i]);
    }
  }

  // MutationObserver 监听新增的 video 元素
  function startObserver() {
    var observer = new MutationObserver(function (mutations) {
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
            // 子树中可能包含 video
            if (node.querySelectorAll) {
              var innerVideos = node.querySelectorAll('video');
              for (var k = 0; k < innerVideos.length; k++) {
                patchVideo(innerVideos[k]);
              }
            }
          }
        }

        // 属性变化（src 被动态修改时）
        if (mutation.type === 'attributes' &&
            mutation.attributeName === 'src' &&
            mutation.target.tagName === 'VIDEO') {
          // 重新处理
          mutation.target.removeAttribute(HANDLED_ATTR);
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

    return observer;
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      scanExisting();
      startObserver();
    });
  } else {
    scanExisting();
    startObserver();
  }

  console.log('[CDN-Fallback] 视频 CDN 降级模块已加载');
})();
