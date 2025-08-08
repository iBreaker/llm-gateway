import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Button } from './Button'

describe('Button Component', () => {
  // 基础渲染测试
  it('renders button with text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  // 变体测试
  it('renders primary variant by default', () => {
    render(<Button>Primary Button</Button>)
    const button = screen.getByText('Primary Button')
    expect(button).toHaveClass('bg-blue-600')
  })

  it('renders secondary variant correctly', () => {
    render(<Button variant="secondary">Secondary Button</Button>)
    const button = screen.getByText('Secondary Button')
    expect(button).toHaveClass('bg-gray-100')
  })

  it('renders outline variant correctly', () => {
    render(<Button variant="outline">Outline Button</Button>)
    const button = screen.getByText('Outline Button')
    expect(button).toHaveClass('bg-white', 'border-gray-300')
  })

  // 尺寸测试
  it('renders medium size by default', () => {
    render(<Button>Medium Button</Button>)
    const button = screen.getByText('Medium Button')
    expect(button).toHaveClass('px-4', 'py-2')
  })

  it('renders small size correctly', () => {
    render(<Button size="sm">Small Button</Button>)
    const button = screen.getByText('Small Button')
    expect(button).toHaveClass('px-3', 'py-1.5')
  })

  it('renders large size correctly', () => {
    render(<Button size="lg">Large Button</Button>)
    const button = screen.getByText('Large Button')
    expect(button).toHaveClass('px-6', 'py-3')
  })

  // 交互测试
  it('handles click events', () => {
    const handleClick = jest.fn()
    render(<Button onClick={handleClick}>Clickable Button</Button>)
    
    fireEvent.click(screen.getByText('Clickable Button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  // 禁用状态测试
  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled Button</Button>)
    const button = screen.getByText('Disabled Button')
    expect(button).toBeDisabled()
  })

  it('is disabled when isLoading is true', () => {
    render(<Button isLoading>Loading Button</Button>)
    const button = screen.getByText('Loading Button')
    expect(button).toBeDisabled()
  })

  // 加载状态测试
  it('shows loading spinner when isLoading is true', () => {
    render(<Button isLoading>Loading Button</Button>)
    const spinner = screen.getByRole('button').querySelector('svg')
    expect(spinner).toBeInTheDocument()
    expect(spinner).toHaveClass('animate-spin')
  })

  it('does not show loading spinner when isLoading is false', () => {
    render(<Button isLoading={false}>Normal Button</Button>)
    const spinner = screen.getByRole('button').querySelector('svg')
    expect(spinner).not.toBeInTheDocument()
  })

  // 自定义类名测试
  it('applies custom className', () => {
    render(<Button className="custom-class">Custom Button</Button>)
    const button = screen.getByText('Custom Button')
    expect(button).toHaveClass('custom-class')
  })

  // 属性传递测试
  it('passes through HTML button attributes', () => {
    render(<Button type="submit" data-testid="submit-button">Submit</Button>)
    const button = screen.getByTestId('submit-button')
    expect(button).toHaveAttribute('type', 'submit')
  })

  // 可访问性测试
  it('has proper focus ring classes', () => {
    render(<Button>Focusable Button</Button>)
    const button = screen.getByText('Focusable Button')
    expect(button).toHaveClass('focus:ring-2', 'focus:ring-offset-2')
  })

  // 边界条件测试
  it('handles empty children gracefully', () => {
    render(<Button></Button>)
    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
    expect(button).toBeEmptyDOMElement()
  })

  it('handles multiple children', () => {
    render(
      <Button>
        <span>Icon</span>
        Text
      </Button>
    )
    const button = screen.getByRole('button')
    expect(button).toContainHTML('<span>Icon</span>')
    expect(button).toHaveTextContent('IconText')
  })

  // 组合状态测试
  it('combines loading and disabled states correctly', () => {
    render(<Button isLoading disabled>Combined State</Button>)
    const button = screen.getByText('Combined State')
    expect(button).toBeDisabled()
    
    const spinner = button.querySelector('svg')
    expect(spinner).toBeInTheDocument()
  })

  // 事件处理边界测试
  it('does not call onClick when disabled', () => {
    const handleClick = jest.fn()
    render(<Button onClick={handleClick} disabled>Disabled Click</Button>)
    
    fireEvent.click(screen.getByText('Disabled Click'))
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('does not call onClick when loading', () => {
    const handleClick = jest.fn()
    render(<Button onClick={handleClick} isLoading>Loading Click</Button>)
    
    fireEvent.click(screen.getByText('Loading Click'))
    expect(handleClick).not.toHaveBeenCalled()
  })
})