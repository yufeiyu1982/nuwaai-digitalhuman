  /**
 * NpcTalk 浮动按钮
 * 在页面右下角显示一个黑色圆圈，点击后跳转到数字人对话页面
 */



class NpcTalkFloatingButton {
  constructor(config = {}) {
    this.options = {
      size: 60,                    // 圆圈大小
      color: '#000000',            // 圆圈颜色
      position: config.right,    // 位置：bottom-right, bottom-left, top-right, top-left
      margin: 20,                  // 边距
      zIndex: 9999,               // 层级
      showText: true,             // 是否显示文字
      text: 'AI',                 // 显示的文字
      textColor: '#ffffff',       // 文字颜色
      textSize: 14,               // 文字大小
      borderRadius: '50%',        // 圆角
      shadow: '0 4px 12px rgba(0, 0, 0, 0.3)', // 阴影
      animation: true,            // 是否启用动画
      pulse: true,                // 是否启用脉冲效果
      ...config
    };

    this.npcPage = config.npcPage
    this.isVisible = false;
    this.element = null;
    this.router = null;
    this.digitalUserId=config.avatorid
    this.userId=config.userid
    this.access_token=null
    this.apiKey=config.apiKey
    this.getAccess_token()
    this.init();
  }
  /**
   * 初始化
   */
  init() {
    this.createButton();
    this.setPosition();
    this.bindEvents();
    
    if (this.options.animation) {
      this.addAnimation();
    }
    
    if (this.options.pulse) {
      this.addPulseEffect();
    }
  }

  //获取token
 async getAccess_token(){
  if(!this.apiKey) return
    // let data=await houseApi.post('/web/apiKey/auth',{
    //   secretKey:this.apiKey
    // })
    // localStorage.setItem('token',data.data.data)
  }
  /**
   * 创建按钮元素
   */
  createButton() {
    // 创建主容器
    this.element = document.createElement('div');
    this.element.id = 'npcTalkFloatingButton';
    this.element.className = 'npc-talk-floating-button';
    // 设置样式
    Object.assign(this.element.style, {
      position: 'fixed',
      width: `${this.options.size}px`,
      height: `${this.options.size}px`,
      backgroundColor: this.options.color,
      borderRadius: this.options.borderRadius,
      boxShadow: this.options.shadow,
      cursor: 'pointer',
      zIndex: this.options.zIndex,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      userSelect: 'none',
      transition: 'all 0.3s ease',
      border: 'none',
      outline: 'none'
    });

    // 添加文字
    if (this.options.showText) {
      this.element.textContent = this.options.text;
      this.element.style.color = this.options.textColor;
      this.element.style.fontSize = `${this.options.textSize}px`;
      this.element.style.fontWeight = 'bold';
      this.element.style.fontFamily = 'Arial, sans-serif';
      
    }

    // 添加到页面
  
    document.body.appendChild(this.element);

    // 显示按钮
    this.show();

  }

  /**
   * 设置位置
   */
  setPosition() {
    const { position, margin } = this.options;
    
    switch (position) {
      case 'bottom-right':
        this.element.style.bottom = `${margin}px`;
        this.element.style.right = `${margin}px`;
        break;
      case 'bottom-left':
        this.element.style.bottom = `${margin}px`;
        this.element.style.left = `${margin}px`;
        break;
      case 'top-right':
        this.element.style.top = `${margin}px`;
        this.element.style.right = `${margin}px`;
        break;
      case 'top-left':
        this.element.style.top = `${margin}px`;
        this.element.style.left = `${margin}px`;
        break;
      default:
        this.element.style.bottom = `${margin}px`;
        this.element.style.right = `${margin}px`;
    }
  }


  /**
   * 绑定事件
   */
  bindEvents() {
    // 点击事件
    this.element.addEventListener('click', this.handleClick.bind(this));
    // 触摸事件（移动端）
    this.element.addEventListener('touchstart', this.handleTouchStart.bind(this));
    this.element.addEventListener('touchend', this.handleTouchEnd.bind(this));
    
    // 鼠标悬停效果
    this.element.addEventListener('mouseenter', this.handleMouseEnter.bind(this));
    this.element.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    
    // 键盘事件（无障碍访问）
    this.element.addEventListener('keydown', this.handleKeyDown.bind(this));
    this.element.setAttribute('tabindex', '0');
    this.element.setAttribute('role', 'button');
    this.element.setAttribute('aria-label', '打开数字人对话');
  }

  /**
   * 处理点击事件
   */
  handleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    
    // 添加点击反馈
    this.addClickFeedback();
    
    // 跳转到 NpcTalk 页面
    this.navigateToNpcTalk();
  }

  /**
   * 处理触摸开始
   */
  handleTouchStart(event) {
    event.preventDefault();
    this.element.style.transform = 'scale(0.95)';
  }

  /**
   * 处理触摸结束
   */
  handleTouchEnd(event) {
    event.preventDefault();
    this.element.style.transform = 'scale(1)';
    this.navigateToNpcTalk();
  }

  /**
   * 处理鼠标悬停
   */
  handleMouseEnter() {
    this.element.style.transform = 'scale(1.1)';
    this.element.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.4)';
  }

  /**
   * 处理鼠标离开
   */
  handleMouseLeave() {
    this.element.style.transform = 'scale(1)';
    this.element.style.boxShadow = this.options.shadow;
  }

  /**
   * 处理键盘事件
   */
  handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.navigateToNpcTalk();
    }
  }

  /**
   * 添加点击反馈
   */
  addClickFeedback() {
    // 创建涟漪效果
    const ripple = document.createElement('div');
    ripple.className = 'npc-talk-ripple';
    ripple.style.cssText = `
      position: absolute;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.6);
      transform: scale(0);
      animation: npc-talk-ripple 0.6s linear;
      pointer-events: none;
    `;
    const rect = this.element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = rect.width / 2 - size / 2;
    const y = rect.height / 2 - size / 2;
    
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    
    this.element.appendChild(ripple);
    
    // 动画结束后移除
    setTimeout(() => {
      if (ripple.parentNode) {
        ripple.parentNode.removeChild(ripple);
      }
    }, 600);
  }

  /**
   * 跳转到 NpcTalk 页面
   */
  navigateToNpcTalk() {
    try {
      
      window.location.href = this.npcPage+'?id='+this.digitalUserId+'&userId='+this.userId;  
    } catch (error) {
      console.error('页面跳转失败:', error);
      
    }
  }

  /**
   * 添加动画
   */
  addAnimation() {
    // 添加 CSS 动画
    const style = document.createElement('style');
    style.textContent = `
      @keyframes npc-talk-ripple {
        to {
          transform: scale(4);
          opacity: 0;
        }
      }
      
      @keyframes npc-talk-bounce {
        0%, 20%, 53%, 80%, 100% {
          transform: translate3d(0, 0, 0);
        }
        40%, 43% {
          transform: translate3d(0, -8px, 0);
        }
        70% {
          transform: translate3d(0, -4px, 0);
        }
        90% {
          transform: translate3d(0, -2px, 0);
        }
      }
      
      .npc-talk-floating-button {
        animation: npc-talk-bounce 2s infinite;
      }
    `;
    
    document.head.appendChild(style);
  }

  /**
   * 添加脉冲效果
   */
  addPulseEffect() {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes npc-talk-pulse {
        0% {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        50% {
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        }
        100% {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
      }
      .npc-talk-floating-button {
        animation: npc-talk-pulse 2s infinite;
      }
    `;
    
    document.head.appendChild(style);
  }

  /**
   * 显示按钮
   */
  show() {
    if (this.element) {
      this.element.style.display = 'flex';
      this.isVisible = true;
    } else {
      
    }
  }

  /**
   * 隐藏按钮
   */
  hide() {
    if (this.element) {
      this.element.style.display = 'none';
      this.isVisible = false;
    }
  }

  /**
   * 切换显示状态
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * 更新配置
   */
  updateOptions(newOptions) {
    this.options = { ...this.options, ...newOptions };
    
    if (this.element) {
      // 更新样式
      if (newOptions.size) {
        this.element.style.width = `${newOptions.size}px`;
        this.element.style.height = `${newOptions.size}px`;
      }
      
      if (newOptions.color) {
        this.element.style.backgroundColor = newOptions.color;
      }
      
      if (newOptions.position || newOptions.margin) {
        this.setPosition();
      }
      
      if (newOptions.text && newOptions.showText) {
        this.element.textContent = newOptions.text;
      }
    }
  }

  /**
   * 销毁按钮
   */
  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
      this.element = null;
    }
  }
}

// 创建全局实例
let globalInstance = null;
/**
 * 初始化浮动按钮
 * @param {Object} options 配置选项
 * @returns {NpcTalkFloatingButton} 按钮实例
 */
 function initNpcTalkFloatingButton(options = {}) {
  if (globalInstance) {
    globalInstance.destroy();
  }
  
  globalInstance = new NpcTalkFloatingButton(options);
  return globalInstance;
}

/**
 * 显示浮动按钮
 */
 function showNpcTalkFloatingButton() {
  if (globalInstance) {
    globalInstance.show();
  }
}

/**
 * 隐藏浮动按钮
 */
 function hideNpcTalkFloatingButton() {
  if (globalInstance) {
    globalInstance.hide();
  }
}

/**
 * 切换浮动按钮显示状态
 */
 function toggleNpcTalkFloatingButton() {
  if (globalInstance) {
    globalInstance.toggle();
  }
}

/**
 * 销毁浮动按钮
 */
 function destroyNpcTalkFloatingButton() {
  if (globalInstance) {
    globalInstance.destroy();
    globalInstance = null;
  }
}


window.NpcTalkFloatingButton=NpcTalkFloatingButton



