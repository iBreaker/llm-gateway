/**
 * 基础 Repository 接口
 * 定义所有 Repository 的通用方法
 */
export interface BaseRepository<T, CreateData, UpdateData> {
  /**
   * 根据 ID 查找实体
   */
  findById(id: number): Promise<T | null>

  /**
   * 查找多个实体
   */
  findMany(where?: Record<string, any>, options?: QueryOptions): Promise<T[]>

  /**
   * 创建实体
   */
  create(data: CreateData): Promise<T>

  /**
   * 更新实体
   */
  update(id: number, data: UpdateData): Promise<T | null>

  /**
   * 删除实体
   */
  delete(id: number): Promise<boolean>

  /**
   * 检查实体是否存在
   */
  exists(id: number): Promise<boolean>

  /**
   * 计数
   */
  count(where?: Record<string, any>): Promise<number>
}

export interface QueryOptions {
  limit?: number
  offset?: number
  orderBy?: { field: string; direction: 'asc' | 'desc' }[]
}