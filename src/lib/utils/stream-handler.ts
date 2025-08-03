/**
 * 简化的流式响应处理工具
 * 解决复杂错误处理和资源泄漏问题
 */

/**
 * 流状态管理器
 * 统一管理流的状态，避免重复操作
 */
export class StreamController {
  private _isClosed = false
  private _controller: ReadableStreamDefaultController<any>
  private _encoder = new TextEncoder()

  constructor(controller: ReadableStreamDefaultController<any>) {
    this._controller = controller
  }

  /**
   * 检查流是否已关闭
   */
  get isClosed(): boolean {
    return this._isClosed
  }

  /**
   * 安全地发送数据
   */
  enqueue(data: string): boolean {
    if (this._isClosed) {
      return false
    }

    try {
      this._controller.enqueue(this._encoder.encode(data))
      return true
    } catch (error) {
      // 流已关闭或出现错误
      this._isClosed = true
      return false
    }
  }

  /**
   * 安全地关闭流
   */
  close(): void {
    if (this._isClosed) {
      return
    }

    try {
      this._controller.close()
    } catch (error) {
      // 忽略重复关闭错误，这是正常的
    } finally {
      this._isClosed = true
    }
  }

  /**
   * 安全地发送错误
   */
  error(error: Error): void {
    if (this._isClosed) {
      return
    }

    try {
      this._controller.error(error)
    } catch (controllerError) {
      // 忽略控制器错误，可能已经关闭
    } finally {
      this._isClosed = true
    }
  }
}

/**
 * 流式响应构建器
 * 简化流式响应的创建和错误处理
 */
export class StreamResponseBuilder {
  private headers: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  /**
   * 设置自定义头部
   */
  setHeader(key: string, value: string): this {
    this.headers[key] = value
    return this
  }

  /**
   * 设置多个头部
   */
  setHeaders(headers: Record<string, string>): this {
    Object.assign(this.headers, headers)
    return this
  }

  /**
   * 创建流式响应
   */
  build(handler: (stream: StreamController) => Promise<void>): Response {
    const stream = new ReadableStream({
      async start(controller) {
        const streamController = new StreamController(controller)
        
        try {
          await handler(streamController)
        } catch (error) {
          console.error('Stream processing error:', error)
          streamController.error(error as Error)
        } finally {
          // 确保流始终被正确关闭
          streamController.close()
        }
      }
    })

    return new Response(stream, { headers: this.headers })
  }
}

/**
 * 流数据格式化工具
 */
export class StreamDataFormatter {
  /**
   * 格式化为 SSE (Server-Sent Events) 格式
   */
  static sse(data: any, event?: string, id?: string): string {
    let result = ''
    
    if (id) {
      result += `id: ${id}\n`
    }
    
    if (event) {
      result += `event: ${event}\n`
    }
    
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data)
    result += `data: ${dataStr}\n\n`
    
    return result
  }

  /**
   * 格式化为 JSON Lines 格式
   */
  static jsonl(data: any): string {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data)
    return dataStr + '\n'
  }

  /**
   * 格式化错误消息
   */
  static error(message: string, code?: string): string {
    return this.sse({
      error: {
        message,
        code: code || 'STREAM_ERROR',
        timestamp: new Date().toISOString()
      }
    }, 'error')
  }

  /**
   * 格式化结束消息
   */
  static end(summary?: any): string {
    return this.sse({
      type: 'stream_end',
      summary,
      timestamp: new Date().toISOString()
    }, 'end')
  }
}

/**
 * 流式文本处理器
 * 处理来自上游的流式文本数据
 */
export class StreamTextProcessor {
  private buffer = ''
  private onChunk?: (chunk: string) => void
  private onComplete?: (fullText: string) => void

  constructor(
    options: {
      onChunk?: (chunk: string) => void
      onComplete?: (fullText: string) => void
    } = {}
  ) {
    this.onChunk = options.onChunk
    this.onComplete = options.onComplete
  }

  /**
   * 处理文本块
   */
  processChunk(chunk: string): void {
    this.buffer += chunk
    this.onChunk?.(chunk)
  }

  /**
   * 完成处理
   */
  complete(): string {
    const fullText = this.buffer
    this.onComplete?.(fullText)
    return fullText
  }

  /**
   * 获取当前缓冲区内容
   */
  getBuffer(): string {
    return this.buffer
  }

  /**
   * 清空缓冲区
   */
  clearBuffer(): void {
    this.buffer = ''
  }
}

/**
 * 便捷函数：创建简单的流式响应
 */
export function createStreamResponse(
  handler: (stream: StreamController) => Promise<void>,
  headers?: Record<string, string>
): Response {
  const builder = new StreamResponseBuilder()
  
  if (headers) {
    builder.setHeaders(headers)
  }
  
  return builder.build(handler)
}

/**
 * 便捷函数：创建 SSE 响应
 */
export function createSSEResponse(
  handler: (stream: StreamController) => Promise<void>
): Response {
  return createStreamResponse(handler, {
    'Content-Type': 'text/event-stream',
  })
}

/**
 * 便捷函数：创建错误流响应
 */
export function createErrorStreamResponse(
  error: Error,
  code?: string
): Response {
  return createStreamResponse(async (stream) => {
    stream.enqueue(StreamDataFormatter.error(error.message, code))
  })
}

/**
 * 资源清理辅助函数
 */
export class StreamResourceManager {
  private resources: (() => void)[] = []

  /**
   * 添加需要清理的资源
   */
  addResource(cleanup: () => void): void {
    this.resources.push(cleanup)
  }

  /**
   * 清理所有资源
   */
  cleanup(): void {
    this.resources.forEach(cleanup => {
      try {
        cleanup()
      } catch (error) {
        console.warn('Resource cleanup error:', error)
      }
    })
    this.resources = []
  }
}

/**
 * 使用示例：
 * 
 * const response = createStreamResponse(async (stream) => {
 *   const resources = new StreamResourceManager()
 *   
 *   try {
 *     // 添加需要清理的资源
 *     resources.addResource(() => reader.releaseLock())
 *     
 *     // 处理流数据
 *     for await (const chunk of source) {
 *       if (!stream.enqueue(chunk)) {
 *         break // 流已关闭，停止处理
 *       }
 *     }
 *   } finally {
 *     resources.cleanup()
 *   }
 * })
 */