/**
 * 统一的ID类型转换工具
 * 解决BigInt/String转换不一致问题
 */

/**
 * 将各种ID输入转换为BigInt
 * @param id - 可以是string、number或BigInt
 * @returns BigInt格式的ID
 * @throws Error 如果输入无效
 */
export function toBigInt(id: string | number | bigint): bigint {
  if (typeof id === 'bigint') {
    return id
  }
  
  if (typeof id === 'number') {
    if (!Number.isInteger(id) || id < 0) {
      throw new Error(`Invalid ID: ${id}. ID must be a positive integer.`)
    }
    return BigInt(id)
  }
  
  if (typeof id === 'string') {
    // 检查是否为有效的数字字符串
    if (!/^\d+$/.test(id.trim())) {
      throw new Error(`Invalid ID: ${id}. ID must be a numeric string.`)
    }
    
    const num = parseInt(id.trim(), 10)
    if (num < 0) {
      throw new Error(`Invalid ID: ${id}. ID must be positive.`)
    }
    
    return BigInt(id.trim())
  }
  
  throw new Error(`Invalid ID type: ${typeof id}. Expected string, number, or bigint.`)
}

/**
 * 将BigInt转换为字符串
 * @param id - BigInt格式的ID
 * @returns 字符串格式的ID
 */
export function toStringId(id: bigint): string {
  return id.toString()
}

/**
 * 检查ID是否有效
 * @param id - 要检查的ID
 * @returns boolean
 */
export function isValidId(id: unknown): id is string | number | bigint {
  try {
    if (id === null || id === undefined) {
      return false
    }
    
    if (typeof id === 'bigint') {
      return id >= BigInt(0)
    }
    
    if (typeof id === 'number') {
      return Number.isInteger(id) && id >= 0
    }
    
    if (typeof id === 'string') {
      return /^\d+$/.test(id.trim()) && parseInt(id.trim(), 10) >= 0
    }
    
    return false
  } catch {
    return false
  }
}

/**
 * 安全地将ID转换为BigInt，如果无效则返回null
 * @param id - 要转换的ID
 * @returns BigInt或null
 */
export function safeToBigInt(id: unknown): bigint | null {
  try {
    if (!isValidId(id)) {
      return null
    }
    return toBigInt(id)
  } catch {
    return null
  }
}

/**
 * 格式化ID数组为字符串数组
 * @param ids - BigInt数组
 * @returns string数组
 */
export function formatIdArray(ids: bigint[]): string[] {
  return ids.map(id => toStringId(id))
}

/**
 * 解析ID数组为BigInt数组
 * @param ids - string或number数组
 * @returns BigInt数组
 */
export function parseIdArray(ids: (string | number)[]): bigint[] {
  return ids.map(id => toBigInt(id))
}

/**
 * 用于数据库实体的通用格式化函数
 * 将包含BigInt ID的实体转换为字符串ID格式
 */
export function formatEntityWithId<T extends Record<string, any>>(
  entity: T & { id: bigint }
): T & { id: string } {
  return {
    ...entity,
    id: toStringId(entity.id)
  }
}

/**
 * 批量格式化包含BigInt ID的实体数组
 */
export function formatEntitiesWithIds<T extends Record<string, any>>(
  entities: (T & { id: bigint })[]
): (T & { id: string })[] {
  return entities.map(entity => formatEntityWithId(entity))
}

/**
 * 用于请求参数的ID解析
 * 常用于API路由中解析路径参数
 */
export function parseRequestId(id: string | string[] | undefined): bigint {
  if (Array.isArray(id)) {
    throw new Error('Expected single ID, got array')
  }
  
  if (!id) {
    throw new Error('ID is required')
  }
  
  return toBigInt(id)
}

/**
 * 类型安全的ID比较
 */
export function compareIds(id1: string | number | bigint, id2: string | number | bigint): boolean {
  try {
    return toBigInt(id1) === toBigInt(id2)
  } catch {
    return false
  }
}