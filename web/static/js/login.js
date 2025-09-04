// Login page functionality
class LoginManager {
    constructor() {
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkExistingAuth();
        this.initializeI18n();
    }

    bindEvents() {
        const form = document.getElementById('login-form');
        if (form) {
            form.addEventListener('submit', this.handleLogin.bind(this));
        }

        // Handle Enter key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const form = document.getElementById('login-form');
                if (form) {
                    form.dispatchEvent(new Event('submit'));
                }
            }
        });
    }

    async checkExistingAuth() {
        try {
            const response = await fetch('/api/v1/health', {
                credentials: 'include'
            });
            
            if (response.ok) {
                // User is already authenticated, redirect to main page
                window.location.href = '/';
                return;
            }
        } catch (error) {
            // Not authenticated, stay on login page
            console.log('Not authenticated, showing login form');
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const password = document.getElementById('password').value;
        const submitBtn = document.querySelector('.login-btn');
        const errorDiv = document.getElementById('error-message');
        
        // Validate input
        if (!password.trim()) {
            this.showError('Please enter your password');
            return;
        }

        // Show loading state
        this.setLoading(true);
        this.clearError();

        try {
            const response = await fetch('/api/v1/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    password: password
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Login successful
                this.showSuccess('Login successful! Redirecting...');
                
                // Redirect to main page after a short delay
                setTimeout(() => {
                    window.location.href = '/';
                }, 1000);
            } else {
                // Login failed
                const errorMessage = data.message || 'Login failed. Please check your password.';
                this.showError(errorMessage);
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showError('Network error. Please try again.');
        } finally {
            this.setLoading(false);
        }
    }

    setLoading(loading) {
        const submitBtn = document.querySelector('.login-btn');
        if (loading) {
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;
        } else {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    }

    showError(message) {
        const errorDiv = document.getElementById('error-message');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        errorDiv.className = 'error-message';
    }

    showSuccess(message) {
        const errorDiv = document.getElementById('error-message');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        errorDiv.className = 'success-message';
    }

    clearError() {
        const errorDiv = document.getElementById('error-message');
        errorDiv.style.display = 'none';
        errorDiv.textContent = '';
    }

    initializeI18n() {
        // Initialize i18n if available
        if (window.I18n) {
            window.I18n.init();
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LoginManager();
});

// Add some utility functions for better UX
function handlePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const toggleBtn = document.querySelector('.password-toggle');
    
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            toggleBtn.textContent = type === 'password' ? '👁️' : '🙈';
        });
    }
}

// Auto-clear error messages after typing
document.addEventListener('DOMContentLoaded', () => {
    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        passwordInput.addEventListener('input', () => {
            const errorDiv = document.getElementById('error-message');
            if (errorDiv.style.display === 'block') {
                errorDiv.style.display = 'none';
            }
        });
    }
});