/**
 * 视频 CDN 播放 + API 自动降级
 *
 * 解决两个问题：
 *   1. video_play 处理器调用 getElementById("videoFull") 时，
 *      Vue 还没渲染该元素，返回 null 导致 .play() 崩溃。
 *      → 通过 patch getElementById 返回安全占位元素避免崩溃。
 *
 *   2. Pe() 将 video src 从 API 转为 CDN 地址，但 CDN 路径不存在。
 *      → 通过 MutationObserver 监听 video 元素，CDN 失败时自动回退 API。
 */
(function () {
  'use strict';

  var CDN_BASE = 'https://res.nuwaai.com/nuwa/';
  var API_BASE = 'https://api.nuwaai.com/web/document/download?filename=';

  // ==================== Part 1: 修复 videoFull null 崩溃 ====================

  var _origGetElementById = document.getElementById.bind(document);

  document.getElementById = function (id) {
    var el = _origGetElementById(id);

    if (id === 'videoFull' && !el) {
      // Vue 尚未渲染 videoFull，返回一个安全的占位 video
      // play() 返回 resolved promise，不会崩溃
      console.warn('[CDN-Fallback] videoFull 尚未渲染，返回占位元素');
      var dummy = document.createElement('video');
      dummy.play = function () { return Promise.resolve(); };
      dummy.load = function () {};
      return dummy;
    }

    return el;
  };

  // ==================== Part 2: CDN → API 自动降级 ====================

  function cdnToApi(cdnUrl) {
    if (cdnUrl && cdnUrl.indexOf(CDN_BASE) === 0) {
      return API_BASE + cdnUrl.substring(CDN_BASE.length);
    }
    return null;
  }

  var HANDLED_ATTR = 'data-cdn-fallback';

  function patchVideo(video) {
    if (video.getAttribute(HANDLED_ATTR)) return;
    video.setAttribute(HANDLED_ATTR, '1');

    var src = video.getAttribute('src') || '';
    if (!src) return;

    var apiUrl = cdnToApi(src);
    if (!apiUrl) return;

    video.setAttribute('data-api-src', apiUrl);
    video.setAttribute('data-cdn-src', src);

    console.log('[CDN-Fallback] 检测到 CDN 视频:', src);

    video.addEventListener('error', function () {
      var currentSrc = video.getAttribute('src') || '';
      var fallback = video.getAttribute('data-api-src');

      if (currentSrc.indexOf(CDN_BASE) === 0 && fallback) {
        console.warn('[CDN-Fallback] CDN 加载失败，降级到 API:', fallback);
        video.setAttribute('src', fallback);
        video.load();
        video.play().catch(function () {});
      }
    }, { once: true });
  }

  // ==================== Part 3: MutationObserver ====================

  function scanExisting() {
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      patchVideo(videos[i]);
    }
  }

  function startObserver() {
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];

        if (mutation.addedNodes) {
          for (var j = 0; j < mutation.addedNodes.length; j++) {
            var node = mutation.addedNodes[j];
            if (node.nodeType !== 1) continue;

            if (node.tagName === 'VIDEO') {
              patchVideo(node);
            }
            if (node.querySelectorAll) {
              var innerVideos = node.querySelectorAll('video');
              for (var k = 0; k < innerVideos.length; k++) {
                patchVideo(innerVideos[k]);
              }
            }
          }
        }

        if (mutation.type === 'attributes' &&
            mutation.attributeName === 'src' &&
            mutation.target.tagName === 'VIDEO') {
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

  console.log('[CDN-Fallback] 视频 CDN 降级模块已加载');
})();
