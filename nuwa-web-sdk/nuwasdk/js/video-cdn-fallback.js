/**
 * 视频播放修复模块
 *
 * 背景：
 *   SDK 中 Pe() 和 video_play 处理器将视频 src 从 API 地址转为 res.nuwaai.com CDN 地址，
 *   但实际文件存储在阿里云 OSS (nuwa-ai.oss-cn-shenzhen.aliyuncs.com)，需要预签名 URL 访问。
 *   res.nuwaai.com/nuwa/ 上不存在这些文件，导致视频无法播放。
 *
 * 解决：
 *   1. 拦截错误的 CDN 转换，直接还原为 API 地址（跳过无效的 CDN 等待）
 *   2. 修复 videoFull 元素在 Vue 渲染前被访问导致的 null 崩溃
 *
 * 当后端 video_play 命令改为返回预签名 OSS URL 后（与平台一致），
 * 此脚本会自动识别为非 CDN 地址，不做任何干预，视频直接播放。
 */
(function () {
  'use strict';

  var BROKEN_CDN = 'https://res.nuwaai.com/nuwa/';
  var API_BASE = 'https://api.nuwaai.com/web/document/download?filename=';

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

  // ==================== Part 2: 拦截错误的 CDN 地址，直接用 API ====================

  function fixVideoSrc(video) {
    var src = video.getAttribute('src') || '';
    if (!src) return;

    // 已经是 OSS 预签名 URL → 不干预，直接播放
    if (src.indexOf('.aliyuncs.com/') !== -1) return;

    // 已经是 API 地址 → 不干预
    if (src.indexOf(API_BASE) === 0) return;

    // 是错误的 CDN 地址 → 还原为 API 地址
    if (src.indexOf(BROKEN_CDN) === 0) {
      var filename = src.substring(BROKEN_CDN.length);
      var apiUrl = API_BASE + filename;
      console.log('[VideoFix] 跳过无效 CDN，直接使用 API:', apiUrl);
      video.setAttribute('src', apiUrl);
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

        // src 属性变化
        if (mutation.type === 'attributes' &&
            mutation.attributeName === 'src' &&
            mutation.target.tagName === 'VIDEO') {
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

  console.log('[VideoFix] 视频播放修复模块已加载');
})();
