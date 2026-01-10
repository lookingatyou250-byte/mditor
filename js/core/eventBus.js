/**
 * Event Bus - 发布/订阅事件系统
 * 解耦模块间通信，支持未来编辑功能扩展
 */
class EventBus {
  constructor() {
    this.events = new Map();
  }

  /**
   * 订阅事件
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消订阅的函数
   */
  on(event, callback) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event).add(callback);
    
    // 返回取消订阅函数
    return () => this.off(event, callback);
  }

  /**
   * 订阅一次性事件
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  once(event, callback) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      callback.apply(this, args);
    };
    this.on(event, wrapper);
  }

  /**
   * 取消订阅
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  off(event, callback) {
    if (this.events.has(event)) {
      this.events.get(event).delete(callback);
    }
  }

  /**
   * 发布事件
   * @param {string} event - 事件名称
   * @param {...any} args - 传递给回调的参数
   */
  emit(event, ...args) {
    if (this.events.has(event)) {
      this.events.get(event).forEach(callback => {
        try {
          callback.apply(this, args);
        } catch (error) {
          console.error(`Event handler error for "${event}":`, error);
        }
      });
    }
  }

  /**
   * 清除所有事件监听
   */
  clear() {
    this.events.clear();
  }

  /**
   * 获取事件监听器数量
   * @param {string} event - 事件名称
   * @returns {number}
   */
  listenerCount(event) {
    return this.events.has(event) ? this.events.get(event).size : 0;
  }
}

// 全局单例
const eventBus = new EventBus();

// 导出事件常量，便于类型安全
const Events = {
  // 文件事件
  FILE_LOADED: 'file:loaded',
  FILE_ERROR: 'file:error',
  
  // 内容事件
  CONTENT_PARSED: 'content:parsed',
  CONTENT_CHANGED: 'content:changed',  // P1: 编辑
  
  // 渲染事件
  RENDER_COMPLETE: 'render:complete',
  
  // 大纲事件
  OUTLINE_UPDATED: 'outline:updated',
  OUTLINE_NAVIGATE: 'outline:navigate',
  
  // UI 事件
  THEME_CHANGED: 'theme:changed',
  FOCUS_MODE_TOGGLE: 'focusMode:toggle',
  TYPEWRITER_MODE_TOGGLE: 'typewriterMode:toggle',
  SIDEBAR_TOGGLE: 'sidebar:toggle',
  
  // 编辑器事件 (P1)
  EDITOR_INPUT: 'editor:input',
  EDITOR_UNDO: 'editor:undo',
  EDITOR_REDO: 'editor:redo'
};
