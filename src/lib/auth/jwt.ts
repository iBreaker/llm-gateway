import { SignJWT, jwtVerify } from 'jose'
import { getConfig } from '@/lib/config'

export interface JWTPayload {
  userId: string
  email: string
  role: string
  iat?: number
  exp?: number
}

/**
 * 生成 JWT Token
 */
export async function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string> {
  const secret = await getConfig('security.jwt_secret')
  const secretKey = new TextEncoder().encode(secret)
  
  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secretKey)
    
  return jwt
}

/**
 * 验证 JWT Token
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const secret = await getConfig('security.jwt_secret')
    const secretKey = new TextEncoder().encode(secret)
    
    const { payload } = await jwtVerify(token, secretKey)
    return payload as JWTPayload
  } catch (error) {
    console.error('JWT verification failed:', error)
    return null
  }
}

/**
 * 从请求头中提取 Token
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.substring(7)
}