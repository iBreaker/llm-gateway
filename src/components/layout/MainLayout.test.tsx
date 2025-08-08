import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import MainLayout from './MainLayout'

// Mock Next.js components
jest.mock('next/link', () => {
  return function MockLink({ children, href, className, ...props }: any) {
    return (
      <a href={href} className={className} {...props}>
        {children}
      </a>
    )
  }
})

jest.mock('next/navigation', () => ({
  usePathname: jest.fn()
}))

// Mock AuthContext
const mockAuthContext = {
  user: null,
  isLoading: false,
  logout: jest.fn()
}

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuthContext
}))

// Mock Lucide React icons
jest.mock('lucide-react', () => ({
  BarChart3: () => <div data-testid="barchart-icon">BarChart3</div>,
  Link: () => <div data-testid="link-icon">Link</div>,
  Key: () => <div data-testid="key-icon">Key</div>,
  TrendingUp: () => <div data-testid="trending-icon">TrendingUp</div>,
  Users: () => <div data-testid="users-icon">Users</div>,
  Settings: () => <div data-testid="settings-icon">Settings</div>
}))

const mockUsePathname = require('next/navigation').usePathname as jest.Mock

// Mock console.log to avoid noise in tests
const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

describe('MainLayout Component', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthContext.user = null
    mockAuthContext.isLoading = false
    mockUsePathname.mockReturnValue('/')
  })

  afterAll(() => {
    consoleSpy.mockRestore()
  })

  // 登录页面测试
  it('renders children directly for login page', () => {
    mockUsePathname.mockReturnValue('/auth/login')
    
    render(
      <MainLayout>
        <div>Login Page Content</div>
      </MainLayout>
    )
    
    expect(screen.getByText('Login Page Content')).toBeInTheDocument()
    expect(screen.queryByText('LLM Gateway')).not.toBeInTheDocument()
  })

  it('renders children directly for login page with trailing slash', () => {
    mockUsePathname.mockReturnValue('/auth/login/')
    
    render(
      <MainLayout>
        <div>Login Page Content</div>
      </MainLayout>
    )
    
    expect(screen.getByText('Login Page Content')).toBeInTheDocument()
    expect(screen.queryByText('LLM Gateway')).not.toBeInTheDocument()
  })

  // 加载状态测试
  it('shows loading spinner when isLoading is true', () => {
    mockAuthContext.isLoading = true
    
    render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
    expect(screen.queryByText('Content')).not.toBeInTheDocument()
  })

  // 未认证状态测试
  it('returns null when user is not authenticated', () => {
    mockAuthContext.user = null
    mockAuthContext.isLoading = false
    
    const { container } = render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    
    expect(container.firstChild).toBeNull()
  })

  // 认证状态下的完整布局测试
  it('renders full layout when user is authenticated', () => {
    mockAuthContext.user = { email: 'test@example.com', id: '1' }
    mockAuthContext.isLoading = false
    mockUsePathname.mockReturnValue('/overview')
    
    render(
      <MainLayout>
        <div>Dashboard Content</div>
      </MainLayout>
    )
    
    // 检查头部
    expect(screen.getByText('LLM Gateway')).toBeInTheDocument()
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
    expect(screen.getByText('退出')).toBeInTheDocument()
    
    // 检查侧边栏导航
    expect(screen.getByText('系统概览')).toBeInTheDocument()
    expect(screen.getByText('上游账号')).toBeInTheDocument()
    expect(screen.getByText('API Keys')).toBeInTheDocument()
    expect(screen.getByText('使用统计')).toBeInTheDocument()
    expect(screen.getByText('用户管理')).toBeInTheDocument()
    expect(screen.getByText('系统配置')).toBeInTheDocument()
    
    // 检查主内容
    expect(screen.getByText('Dashboard Content')).toBeInTheDocument()
  })

  // 导航链接测试
  it('renders navigation links with correct hrefs', () => {
    mockAuthContext.user = { email: 'test@example.com', id: '1' }
    
    render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    
    expect(screen.getByText('系统概览').closest('a')).toHaveAttribute('href', '/overview')
    expect(screen.getByText('上游账号').closest('a')).toHaveAttribute('href', '/accounts')
    expect(screen.getByText('API Keys').closest('a')).toHaveAttribute('href', '/api-keys')
    expect(screen.getByText('使用统计').closest('a')).toHaveAttribute('href', '/stats')
    expect(screen.getByText('用户管理').closest('a')).toHaveAttribute('href', '/users')
    expect(screen.getByText('系统配置').closest('a')).toHaveAttribute('href', '/settings')
  })

  // 导航图标测试
  it('renders navigation icons', () => {
    mockAuthContext.user = { email: 'test@example.com', id: '1' }
    
    render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    
    expect(screen.getByTestId('barchart-icon')).toBeInTheDocument()
    expect(screen.getByTestId('link-icon')).toBeInTheDocument()
    expect(screen.getByTestId('key-icon')).toBeInTheDocument()
    expect(screen.getByTestId('trending-icon')).toBeInTheDocument()
    expect(screen.getByTestId('users-icon')).toBeInTheDocument()
    expect(screen.getByTestId('settings-icon')).toBeInTheDocument()
  })

  // 活跃导航状态测试
  it('applies active styles to current page navigation', () => {
    mockAuthContext.user = { email: 'test@example.com', id: '1' }
    mockUsePathname.mockReturnValue('/overview')
    
    render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    
    const overviewLink = screen.getByText('系统概览').closest('a')
    expect(overviewLink).toHaveClass('bg-zinc-100', 'text-zinc-900')
    
    const accountsLink = screen.getByText('上游账号').closest('a')
    expect(accountsLink).toHaveClass('text-zinc-700', 'hover:bg-zinc-50')
    expect(accountsLink).not.toHaveClass('bg-zinc-100')
  })

  it('applies active styles for api-keys page', () => {
    mockAuthContext.user = { email: 'test@example.com', id: '1' }
    mockUsePathname.mockReturnValue('/api-keys')
    
    render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    
    const apiKeysLink = screen.getByText('API Keys').closest('a')
    expect(apiKeysLink).toHaveClass('bg-zinc-100', 'text-zinc-900')
  })

  it('applies active styles for stats page', () => {
    mockAuthContext.user = { email: 'test@example.com', id: '1' }
    mockUsePathname.mockReturnValue('/stats')
    
    render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    
    const statsLink = screen.getByText('使用统计').closest('a')
    expect(statsLink).toHaveClass('bg-zinc-100', 'text-zinc-900')
  })

  it('applies active styles for users page', () => {
    mockAuthContext.user = { email: 'test@example.com', id: '1' }
    mockUsePathname.mockReturnValue('/users')
    
    render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    
    const usersLink = screen.getByText('用户管理').closest('a')
    expect(usersLink).toHaveClass('bg-zinc-100', 'text-zinc-900')
  })

  it('applies active styles for settings page', () => {
    mockAuthContext.user = { email: 'test@example.com', id: '1' }
    mockUsePathname.mockReturnValue('/settings')
    
    render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    
    const settingsLink = screen.getByText('系统配置').closest('a')
    expect(settingsLink).toHaveClass('bg-zinc-100', 'text-zinc-900')
  })

  // 退出功能测试
  it('calls logout when logout button clicked', () => {
    mockAuthContext.user = { email: 'test@example.com', id: '1' }
    
    render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    
    const logoutButton = screen.getByText('退出')
    fireEvent.click(logoutButton)
    
    expect(mockAuthContext.logout).toHaveBeenCalledTimes(1)
  })

  // 布局结构测试
  it('has correct layout structure', () => {
    mockAuthContext.user = { email: 'test@example.com', id: '1' }
    
    const { container } = render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    
    // 检查主容器
    expect(container.querySelector('.min-h-screen.bg-zinc-50')).toBeInTheDocument()
    
    // 检查头部
    expect(container.querySelector('header.bg-white.border-b')).toBeInTheDocument()
    
    // 检查侧边栏
    expect(container.querySelector('aside.w-56.bg-white')).toBeInTheDocument()
    
    // 检查主内容区
    expect(container.querySelector('main.flex-1.p-6')).toBeInTheDocument()
  })

  // 响应式设计测试
  it('applies responsive classes correctly', () => {
    mockAuthContext.user = { email: 'test@example.com', id: '1' }
    
    const { container } = render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    
    const header = container.querySelector('header')
    const headerContainer = header?.querySelector('.max-w-7xl.mx-auto.px-6')
    expect(headerContainer).toBeInTheDocument()
    
    const headerFlex = headerContainer?.querySelector('.flex.justify-between.items-center.h-14')
    expect(headerFlex).toBeInTheDocument()
  })

  // 用户信息显示测试
  it('displays user email in header', () => {
    mockAuthContext.user = { email: 'user@company.com', id: '2' }
    
    render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    
    expect(screen.getByText('user@company.com')).toBeInTheDocument()
  })

  // 导航悬停状态测试
  it('applies hover styles to navigation links', () => {
    mockAuthContext.user = { email: 'test@example.com', id: '1' }
    mockUsePathname.mockReturnValue('/other-page')
    
    render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    
    const overviewLink = screen.getByText('系统概览').closest('a')
    expect(overviewLink).toHaveClass('hover:bg-zinc-50')
  })

  // 图标颜色状态测试
  it('applies correct icon colors for active and inactive states', () => {
    mockAuthContext.user = { email: 'test@example.com', id: '1' }
    mockUsePathname.mockReturnValue('/overview')
    
    const { container } = render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    
    // 活跃页面的图标应该有较深的颜色
    const activeIcon = screen.getByTestId('barchart-icon').parentElement
    expect(activeIcon).toHaveClass('text-zinc-600')
    
    // 非活跃页面的图标应该有较浅的颜色
    const inactiveIcon = screen.getByTestId('link-icon').parentElement
    expect(inactiveIcon).toHaveClass('text-zinc-400')
  })

  // 侧边栏尺寸测试
  it('has correct sidebar width and minimum height', () => {
    mockAuthContext.user = { email: 'test@example.com', id: '1' }
    
    const { container } = render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    
    const sidebar = container.querySelector('aside')
    expect(sidebar).toHaveClass('w-56', 'min-h-[calc(100vh-56px)]')
  })

  // 主内容区测试
  it('renders children in main content area with correct styling', () => {
    mockAuthContext.user = { email: 'test@example.com', id: '1' }
    
    const { container } = render(
      <MainLayout>
        <div data-testid="main-content">Test Content</div>
      </MainLayout>
    )
    
    const mainElement = container.querySelector('main')
    expect(mainElement).toHaveClass('flex-1', 'p-6', 'bg-zinc-50')
    expect(screen.getByTestId('main-content')).toBeInTheDocument()
  })

  // 边界情况测试
  it('handles undefined user email gracefully', () => {
    mockAuthContext.user = { id: '1' } // 没有email字段
    
    expect(() => {
      render(
        <MainLayout>
          <div>Content</div>
        </MainLayout>
      )
    }).not.toThrow()
  })

  it('handles empty pathname gracefully', () => {
    mockAuthContext.user = { email: 'test@example.com', id: '1' }
    mockUsePathname.mockReturnValue('')
    
    expect(() => {
      render(
        <MainLayout>
          <div>Content</div>
        </MainLayout>
      )
    }).not.toThrow()
  })

  // 无障碍性测试
  it('has proper semantic HTML structure', () => {
    mockAuthContext.user = { email: 'test@example.com', id: '1' }
    
    const { container } = render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    
    expect(container.querySelector('header')).toBeInTheDocument()
    expect(container.querySelector('nav')).toBeInTheDocument()
    expect(container.querySelector('main')).toBeInTheDocument()
    expect(container.querySelector('aside')).toBeInTheDocument()
  })

  it('has accessible navigation list structure', () => {
    mockAuthContext.user = { email: 'test@example.com', id: '1' }
    
    const { container } = render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    
    const nav = container.querySelector('nav')
    const list = nav?.querySelector('ul')
    const listItems = nav?.querySelectorAll('li')
    
    expect(list).toBeInTheDocument()
    expect(listItems).toHaveLength(6) // 6个导航项目
  })
})