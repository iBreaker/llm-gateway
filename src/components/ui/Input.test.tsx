import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Input } from './Input'

describe('Input Component', () => {
  // 基础渲染测试
  it('renders input element', () => {
    render(<Input placeholder="Enter text" />)
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument()
  })

  // 标签测试
  it('renders with label when provided', () => {
    render(<Input label="Username" />)
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByText('Username')).toBeInTheDocument()
  })

  it('generates id from label when no id provided', () => {
    render(<Input label="Full Name" />)
    const input = screen.getByLabelText('Full Name')
    expect(input).toHaveAttribute('id', 'full-name')
  })

  it('uses provided id over generated one', () => {
    render(<Input label="Email Address" id="custom-email-id" />)
    const input = screen.getByLabelText('Email Address')
    expect(input).toHaveAttribute('id', 'custom-email-id')
  })

  it('renders without label when not provided', () => {
    render(<Input placeholder="No label input" />)
    expect(screen.queryByText('Username')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('No label input')).toBeInTheDocument()
  })

  // 错误状态测试
  it('renders error message when provided', () => {
    render(<Input error="This field is required" />)
    expect(screen.getByText('This field is required')).toBeInTheDocument()
  })

  it('applies error styling when error is present', () => {
    render(<Input error="Invalid input" />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveClass('border-red-300', 'focus:border-red-500', 'focus:ring-red-500')
  })

  it('does not show error message when error is not provided', () => {
    render(<Input />)
    expect(screen.queryByText('This field is required')).not.toBeInTheDocument()
  })

  // 样式测试
  it('applies form-input class by default', () => {
    render(<Input />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveClass('form-input')
  })

  it('applies custom className', () => {
    render(<Input className="custom-input-class" />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveClass('custom-input-class')
  })

  it('combines default and custom classes', () => {
    render(<Input className="custom-class" />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveClass('form-input', 'custom-class')
  })

  // 交互测试
  it('handles value changes', () => {
    const handleChange = jest.fn()
    render(<Input onChange={handleChange} />)
    const input = screen.getByRole('textbox')
    
    fireEvent.change(input, { target: { value: 'new value' } })
    expect(handleChange).toHaveBeenCalledTimes(1)
    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({
      target: expect.objectContaining({ value: 'new value' })
    }))
  })

  it('handles focus and blur events', () => {
    const handleFocus = jest.fn()
    const handleBlur = jest.fn()
    render(<Input onFocus={handleFocus} onBlur={handleBlur} />)
    const input = screen.getByRole('textbox')
    
    fireEvent.focus(input)
    expect(handleFocus).toHaveBeenCalledTimes(1)
    
    fireEvent.blur(input)
    expect(handleBlur).toHaveBeenCalledTimes(1)
  })

  // 属性传递测试
  it('passes through HTML input attributes', () => {
    render(
      <Input 
        type="email"
        placeholder="Enter email"
        required
        data-testid="email-input"
      />
    )
    const input = screen.getByTestId('email-input')
    
    expect(input).toHaveAttribute('type', 'email')
    expect(input).toHaveAttribute('placeholder', 'Enter email')
    expect(input).toBeRequired()
  })

  it('handles disabled state', () => {
    render(<Input disabled />)
    const input = screen.getByRole('textbox')
    expect(input).toBeDisabled()
  })

  // 组合状态测试
  it('renders label, input, and error together', () => {
    render(
      <Input 
        label="Password"
        type="password"
        error="Password is too short"
        placeholder="Enter password"
      />
    )
    
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument()
    expect(screen.getByText('Password is too short')).toBeInTheDocument()
    
    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveClass('border-red-300')
  })

  // 可访问性测试
  it('properly associates label with input', () => {
    render(<Input label="Search" />)
    const label = screen.getByText('Search')
    const input = screen.getByLabelText('Search')
    
    expect(label).toHaveAttribute('for', 'search')
    expect(input).toHaveAttribute('id', 'search')
  })

  it('has proper ARIA attributes when error is present', () => {
    render(<Input error="Invalid format" aria-describedby="error-message" />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('aria-describedby', 'error-message')
  })

  // 边界条件测试
  it('handles empty label gracefully', () => {
    const { container } = render(<Input label="" />)
    // 空标签不应该渲染label元素
    expect(container.querySelector('label')).not.toBeInTheDocument()
  })

  it('handles empty error gracefully', () => {
    const { container } = render(<Input error="" />)
    // 空错误信息不应该渲染错误div
    expect(container.querySelector('.text-red-600')).not.toBeInTheDocument()
  })

  it('generates id for complex label text', () => {
    render(<Input label="Email Address (Required)" />)
    const input = screen.getByLabelText('Email Address (Required)')
    expect(input).toHaveAttribute('id', 'email-address-(required)')
  })

  // 值控制测试
  it('works as controlled component', () => {
    const TestComponent = () => {
      const [value, setValue] = React.useState('')
      return (
        <Input 
          value={value} 
          onChange={(e) => setValue(e.target.value)}
          placeholder="Controlled input"
        />
      )
    }
    
    render(<TestComponent />)
    const input = screen.getByPlaceholderText('Controlled input')
    
    fireEvent.change(input, { target: { value: 'test value' } })
    expect(input).toHaveValue('test value')
  })

  it('works as uncontrolled component', () => {
    render(<Input defaultValue="default text" placeholder="Uncontrolled input" />)
    const input = screen.getByPlaceholderText('Uncontrolled input')
    
    expect(input).toHaveValue('default text')
    
    fireEvent.change(input, { target: { value: 'changed text' } })
    expect(input).toHaveValue('changed text')
  })
})