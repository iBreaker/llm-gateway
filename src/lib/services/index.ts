/**
 * 服务层入口文件
 * 提供统一的服务导出
 */

export * from './userService';
export * from './accountService';
export * from './apiKeyService';
export * from './usageService';

// 服务层通用类型定义
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

// 服务层通用错误类
export class ServiceError extends Error {
  constructor(
    message: string,
    public code: string = 'SERVICE_ERROR',
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

// 通用分页参数
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

// 通用排序参数
export interface SortParams {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}