/**
 * 视频播放修复模块 v2
 *
 * 背景：
 *   SDK 中 Pe() 和 video_play 处理器将视频 src 从 API 地址转为 res.nuwaai.com CDN 地址，
 *   但实际文件存储在阿里云 OSS (nuwa-ai.oss-cn-shenzhen.aliyuncs.com)，需要预签名 URL 访问。
 *   res.nuwaai.com/nuwa/ 上不存在这些文件，导致视频无法播放。
 *
 * 解决：
 *   1. 拦截错误的 CDN 转换，还原为 API 地址
 *   2. 尝试通过 API 获取预签名 OSS URL，实现直连快速播放
 *   3. 若获取预签名 URL 失败，退回到 API 代理地址（能播但较慢）
 *   4. 修复 videoFull 元素在 Vue 渲染前被访问导致的 null 崩溃
 *
 * 当后端 video_play 命令改为返回预签名 OSS URL 后（与平台一致），
 * 此脚本会自动识别为非 CDN 地址，不做任何干预，视频直接播放。
 */
(function () {
  'use strict';

  var BROKEN_CDN = 'https://res.nuwaai.com/nuwa/';
  var API_BASE = 'https://api.nuwaai.com/web/document/download?filename=';
  var OSS_MARKER = '.aliyuncs.com/';

  // 预签名 URL 缓存 (filename → presigned OSS URL)
  var presignedCache = {};

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

  // ==================== Part 2: 尝试获取预签名 OSS URL ====================

  /**
   * 从 filename 提取文件路径
   * 输入: "34004/knowledge/2005842614496083969/xxx.mp4"
   * 或 CDN URL / API URL
   */
  function extractFilename(src) {
    if (src.indexOf(BROKEN_CDN) === 0) {
      return src.substring(BROKEN_CDN.length);
    }
    if (src.indexOf(API_BASE) === 0) {
      return src.substring(API_BASE.length);
    }
    return null;
  }

  /**
   * 尝试通过 fetch 请求 API download 地址，检测是否 302 重定向到 OSS 预签名 URL。
   * 如果 API 返回的 response.url 包含 aliyuncs.com，说明发生了重定向，
   * 浏览器 fetch 默认会 follow redirect，最终 response.url 就是 OSS 预签名 URL。
   *
   * 同时支持 API 返回 JSON 格式的预签名 URL（某些后端实现方式）。
   */
  function resolvePresignedUrl(filename, callback) {
    // 检查缓存
    if (presignedCache[filename]) {
      console.log('[VideoFix] 命中预签名 URL 缓存:', filename);
      callback(presignedCache[filename]);
      return;
    }

    var apiUrl = API_BASE + filename;
    var token = null;
    try { token = localStorage.getItem('token') || localStorage.getItem('access_token'); } catch (e) {}

    var headers = {};
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    // 方法1: 用 HEAD 请求检测重定向（最快，不下载文件内容）
    fetch(apiUrl, {
      method: 'HEAD',
      headers: headers,
      redirect: 'follow'
    }).then(function (resp) {
      // 如果 fetch follow 了 302 重定向，resp.url 会是最终的 OSS URL
      if (resp.url && resp.url.indexOf(OSS_MARKER) !== -1) {
        console.log('[VideoFix] 通过 HEAD redirect 获取到 OSS URL:', resp.url);
        presignedCache[filename] = resp.url;
        callback(resp.url);
        return;
      }

      // 方法2: 检查 response header 是否包含 Location（某些 CORS 配置下可见）
      var location = resp.headers.get('Location') || resp.headers.get('location');
      if (location && location.indexOf(OSS_MARKER) !== -1) {
        console.log('[VideoFix] 通过 Location header 获取到 OSS URL:', location);
        presignedCache[filename] = location;
        callback(location);
        return;
      }

      // 方法3: 尝试调用专门的预签名 URL API（如果存在）
      // GET /web/document/presignUrl?filename=xxx 或类似接口
      tryPresignApi(filename, token, function (ossUrl) {
        if (ossUrl) {
          callback(ossUrl);
        } else {
          // 所有方法都失败，退回 API 代理地址
          console.log('[VideoFix] 无法获取预签名 URL，使用 API 代理:', apiUrl);
          callback(apiUrl);
        }
      });
    }).catch(function (err) {
      console.warn('[VideoFix] HEAD 请求失败:', err.message);
      // 网络错误，直接退回 API 代理
      callback(apiUrl);
    });
  }

  /**
   * 尝试调用可能存在的预签名 URL 接口
   */
  function tryPresignApi(filename, token, callback) {
    var presignEndpoints = [
      'https://api.nuwaai.com/web/document/presignUrl?filename=' + encodeURIComponent(filename),
      'https://api.nuwaai.com/web/document/getUrl?filename=' + encodeURIComponent(filename)
    ];

    var tried = 0;
    var found = false;

    function tryNext() {
      if (tried >= presignEndpoints.length || found) {
        if (!found) callback(null);
        return;
      }

      var url = presignEndpoints[tried++];
      var headers = { 'Accept': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      fetch(url, { method: 'GET', headers: headers })
        .then(function (resp) {
          if (!resp.ok) { tryNext(); return; }
          return resp.json();
        })
        .then(function (data) {
          if (!data) { tryNext(); return; }
          // 尝试多种常见响应格式
          var ossUrl = data.data || data.url || data.presignedUrl || data.downloadUrl;
          if (ossUrl && typeof ossUrl === 'string' && ossUrl.indexOf(OSS_MARKER) !== -1) {
            console.log('[VideoFix] 通过 presign API 获取到 OSS URL:', ossUrl);
            presignedCache[filename] = ossUrl;
            found = true;
            callback(ossUrl);
          } else {
            tryNext();
          }
        })
        .catch(function () { tryNext(); });
    }

    tryNext();
  }

  // ==================== Part 3: 修复视频 src ====================

  function fixVideoSrc(video) {
    var src = video.getAttribute('src') || '';
    if (!src) return;

    // 已经是 OSS 预签名 URL → 不干预，直接播放
    if (src.indexOf(OSS_MARKER) !== -1) return;

    // 已标记为正在解析 → 不重复处理
    if (video.getAttribute('data-resolving') === '1') return;

    var filename = extractFilename(src);

    // 已经是 API 地址且没有更好的选项 → 尝试解析预签名 URL
    if (filename) {
      video.setAttribute('data-resolving', '1');
      console.log('[VideoFix] 正在为视频解析预签名 URL:', filename);

      resolvePresignedUrl(filename, function (resolvedUrl) {
        video.removeAttribute('data-resolving');

        var currentSrc = video.getAttribute('src') || '';
        // 如果在异步期间 src 已变化（如用户切换了视频），不再更新
        if (currentSrc !== src && currentSrc.indexOf(OSS_MARKER) !== -1) return;

        if (resolvedUrl !== src) {
          console.log('[VideoFix] 设置视频 src:', resolvedUrl.substring(0, 80) + '...');
          video.setAttribute('src', resolvedUrl);
          video.load();
          video.play().catch(function () {});
        }
      });
      return;
    }

    // 不认识的 URL 格式 → 不干预
  }

  // ==================== Part 4: MutationObserver ====================

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

  console.log('[VideoFix] 视频播放修复模块 v2 已加载（含预签名 URL 解析）');
})();
