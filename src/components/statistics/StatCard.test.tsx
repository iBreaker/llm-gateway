import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { StatCard, MultiStatCard, ProgressCard } from './StatCard'

describe('StatCard Component', () => {
  // 基础渲染测试
  it('renders title and value', () => {
    render(<StatCard title="Total Users" value={1234} />)
    expect(screen.getByText('TOTAL USERS')).toBeInTheDocument()
    expect(screen.getByText('1,234')).toBeInTheDocument()
  })

  it('renders string value correctly', () => {
    render(<StatCard title="Status" value="Active" />)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders number value with locale formatting', () => {
    render(<StatCard title="Revenue" value={123456.78} />)
    expect(screen.getByText('123,456.78')).toBeInTheDocument()
  })

  // 可选属性测试
  it('renders subtitle when provided', () => {
    render(<StatCard title="Users" value={100} subtitle="Active users this month" />)
    expect(screen.getByText('Active users this month')).toBeInTheDocument()
  })

  it('renders icon when provided', () => {
    render(<StatCard title="Users" value={100} icon="👥" />)
    expect(screen.getByRole('img', { name: 'Users' })).toBeInTheDocument()
    expect(screen.getByText('👥')).toBeInTheDocument()
  })

  // 趋势指示器测试
  it('renders trend indicator for upward trend', () => {
    render(<StatCard title="Sales" value={1000} change={15.5} trend="up" />)
    expect(screen.getByText('15.5%')).toBeInTheDocument()
    const trendElement = screen.getByText('15.5%').parentElement
    expect(trendElement).toHaveClass('text-green-600')
  })

  it('renders trend indicator for downward trend', () => {
    render(<StatCard title="Sales" value={1000} change={-8.2} trend="down" />)
    expect(screen.getByText('8.2%')).toBeInTheDocument() // 显示绝对值
    const trendElement = screen.getByText('8.2%').parentElement
    expect(trendElement).toHaveClass('text-red-600')
  })

  it('renders trend indicator for stable trend', () => {
    render(<StatCard title="Sales" value={1000} change={0} trend="stable" />)
    expect(screen.getByText('持平')).toBeInTheDocument()
    const trendElement = screen.getByText('持平').parentElement
    expect(trendElement).toHaveClass('text-gray-600')
  })

  // 加载状态测试
  it('renders loading skeleton when loading is true', () => {
    render(<StatCard title="Users" value={100} loading={true} />)
    const loadingElement = screen.getByRole('generic')
    expect(loadingElement).toHaveClass('animate-pulse')
    expect(screen.queryByText('USERS')).not.toBeInTheDocument()
  })

  // 点击功能测试
  it('renders as button when onClick is provided', () => {
    const handleClick = jest.fn()
    render(<StatCard title="Clickable" value={100} onClick={handleClick} />)
    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
    expect(button).toHaveClass('cursor-pointer', 'hover:shadow-md')
  })

  it('handles click events', () => {
    const handleClick = jest.fn()
    render(<StatCard title="Clickable" value={100} onClick={handleClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('renders as div when onClick is not provided', () => {
    render(<StatCard title="Static" value={100} />)
    const container = screen.getByText('STATIC').closest('div')
    expect(container).not.toHaveClass('cursor-pointer')
  })

  // 可访问性测试
  it('has proper focus styles when clickable', () => {
    render(<StatCard title="Focusable" value={100} onClick={() => {}} />)
    const button = screen.getByRole('button')
    expect(button).toHaveClass('focus:outline-none', 'focus:ring-2', 'focus:ring-blue-500')
  })
})

describe('MultiStatCard Component', () => {
  const mockStats = [
    { label: 'Active Users', value: 1234, change: 12.5, trend: 'up' as const },
    { label: 'New Signups', value: 89, change: -5.2, trend: 'down' as const },
    { label: 'Retention Rate', value: '85%', change: 0, trend: 'stable' as const }
  ]

  it('renders title and all stats', () => {
    render(<MultiStatCard title="User Metrics" stats={mockStats} />)
    expect(screen.getByText('User Metrics')).toBeInTheDocument()
    expect(screen.getByText('Active Users')).toBeInTheDocument()
    expect(screen.getByText('New Signups')).toBeInTheDocument()
    expect(screen.getByText('Retention Rate')).toBeInTheDocument()
  })

  it('renders stat values correctly', () => {
    render(<MultiStatCard title="Metrics" stats={mockStats} />)
    expect(screen.getByText('1,234')).toBeInTheDocument()
    expect(screen.getByText('89')).toBeInTheDocument()
    expect(screen.getByText('85%')).toBeInTheDocument()
  })

  it('renders trend indicators for each stat', () => {
    render(<MultiStatCard title="Metrics" stats={mockStats} />)
    expect(screen.getByText('12.5%')).toBeInTheDocument() // up trend
    expect(screen.getByText('5.2%')).toBeInTheDocument() // down trend (absolute value)
    expect(screen.getByText('持平')).toBeInTheDocument() // stable trend
  })

  it('renders icon when provided', () => {
    render(<MultiStatCard title="Metrics" stats={mockStats} icon="📊" />)
    expect(screen.getByRole('img', { name: 'Metrics' })).toBeInTheDocument()
  })

  it('renders loading skeleton when loading is true', () => {
    render(<MultiStatCard title="Metrics" stats={mockStats} loading={true} />)
    const loadingElement = screen.getByRole('generic')
    expect(loadingElement).toHaveClass('animate-pulse')
    expect(screen.queryByText('Metrics')).not.toBeInTheDocument()
  })

  it('handles empty stats array', () => {
    render(<MultiStatCard title="Empty Stats" stats={[]} />)
    expect(screen.getByText('Empty Stats')).toBeInTheDocument()
    expect(screen.queryByText('Active Users')).not.toBeInTheDocument()
  })
})

describe('ProgressCard Component', () => {
  it('renders title, current and target values', () => {
    render(<ProgressCard title="Sales Goal" current={750} target={1000} unit="$" />)
    expect(screen.getByText('Sales Goal')).toBeInTheDocument()
    expect(screen.getByText('750$')).toBeInTheDocument()
    expect(screen.getByText('/ 1,000$')).toBeInTheDocument()
  })

  it('calculates and displays correct percentage', () => {
    render(<ProgressCard title="Progress" current={300} target={500} />)
    expect(screen.getByText('60.0%')).toBeInTheDocument()
  })

  it('displays progress bar with correct width', () => {
    render(<ProgressCard title="Progress" current={300} target={500} />)
    const progressBar = screen.getByRole('generic').querySelector('.bg-blue-500')
    expect(progressBar).toHaveStyle({ width: '60%' })
  })

  it('handles over-target scenario', () => {
    render(<ProgressCard title="Over Goal" current={1200} target={1000} />)
    expect(screen.getByText('120.0%')).toBeInTheDocument()
    expect(screen.getByText('超出目标')).toBeInTheDocument()
    
    const progressBar = screen.getByRole('generic').querySelector('.bg-red-500')
    expect(progressBar).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    render(
      <ProgressCard 
        title="Goal" 
        current={50} 
        target={100} 
        description="Monthly sales target"
      />
    )
    expect(screen.getByText('Monthly sales target')).toBeInTheDocument()
  })

  it('renders icon when provided', () => {
    render(<ProgressCard title="Goal" current={50} target={100} icon="🎯" />)
    expect(screen.getByRole('img', { name: 'Goal' })).toBeInTheDocument()
  })

  it('applies correct color scheme', () => {
    render(<ProgressCard title="Green Goal" current={50} target={100} color="green" />)
    const progressBar = screen.getByRole('generic').querySelector('.bg-green-500')
    expect(progressBar).toBeInTheDocument()
  })

  it('handles zero target gracefully', () => {
    render(<ProgressCard title="Zero Target" current={100} target={0} />)
    expect(screen.getByText('0.0%')).toBeInTheDocument()
  })

  it('handles zero current gracefully', () => {
    render(<ProgressCard title="Zero Progress" current={0} target={100} />)
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('0.0%')).toBeInTheDocument()
  })

  it('caps percentage at 100% for display', () => {
    render(<ProgressCard title="Max Progress" current={1500} target={1000} />)
    const progressBar = screen.getByRole('generic').querySelector('.bg-red-500')
    expect(progressBar).toHaveStyle({ width: '100%' }) // 即使超过也不显示超过100%宽度
  })
})