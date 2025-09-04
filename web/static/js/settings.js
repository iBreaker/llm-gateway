// Settings page functionality
class SettingsManager {
    constructor() {
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadSessionInfo();
        this.initializeI18n();
    }

    bindEvents() {
        // Password change form
        const form = document.getElementById('change-password-form');
        if (form) {
            form.addEventListener('submit', this.handlePasswordChange.bind(this));
        }

        // Password strength checking
        const newPasswordInput = document.getElementById('new-password');
        if (newPasswordInput) {
            newPasswordInput.addEventListener('input', this.checkPasswordStrength.bind(this));
        }

        // Password confirmation checking
        const confirmPasswordInput = document.getElementById('confirm-password');
        if (confirmPasswordInput) {
            confirmPasswordInput.addEventListener('input', this.checkPasswordMatch.bind(this));
        }
    }

    async loadSessionInfo() {
        try {
            // For now, just show current time as login time
            // In a real implementation, you would get this from the server
            const loginTimeElement = document.getElementById('login-time');
            if (loginTimeElement) {
                loginTimeElement.textContent = new Date().toLocaleString();
            }
        } catch (error) {
            console.error('Failed to load session info:', error);
        }
    }

    checkPasswordStrength() {
        const password = document.getElementById('new-password').value;
        const strengthContainer = document.getElementById('password-strength');
        const strengthFill = document.getElementById('strength-fill');
        const strengthText = document.getElementById('strength-text');

        if (!password) {
            strengthContainer.style.display = 'none';
            return;
        }

        strengthContainer.style.display = 'block';

        // Calculate password strength
        let score = 0;
        const checks = {
            length: password.length >= 8,
            lowercase: /[a-z]/.test(password),
            uppercase: /[A-Z]/.test(password),
            numbers: /\d/.test(password),
            special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
        };

        score = Object.values(checks).filter(Boolean).length;

        // Determine strength level
        let strength = 'weak';
        if (score >= 4) strength = 'strong';
        else if (score >= 3) strength = 'good';
        else if (score >= 2) strength = 'fair';

        // Update UI
        strengthFill.className = `strength-fill ${strength}`;
        strengthText.className = `strength-text ${strength}`;
        
        const strengthLabels = {
            weak: 'Weak',
            fair: 'Fair', 
            good: 'Good',
            strong: 'Strong'
        };
        
        strengthText.textContent = strengthLabels[strength];
    }

    checkPasswordMatch() {
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        const matchContainer = document.getElementById('password-match');
        const matchText = document.getElementById('match-text');

        if (!confirmPassword) {
            matchContainer.style.display = 'none';
            return;
        }

        matchContainer.style.display = 'block';
        
        const isMatch = newPassword === confirmPassword;
        matchText.className = isMatch ? 'match-text match' : 'match-text no-match';
        matchText.textContent = isMatch ? '✓ Passwords match' : '✗ Passwords do not match';
    }

    async handlePasswordChange(e) {
        e.preventDefault();

        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        // Validate input
        if (!currentPassword || !newPassword || !confirmPassword) {
            this.showMessage('All fields are required', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            this.showMessage('New passwords do not match', 'error');
            return;
        }

        if (newPassword.length < 6) {
            this.showMessage('New password must be at least 6 characters long', 'error');
            return;
        }

        if (newPassword === currentPassword) {
            this.showMessage('New password must be different from current password', 'error');
            return;
        }

        // Show loading state
        this.setLoading(true);
        this.clearMessage();

        try {
            const response = await fetch('/api/v1/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    old_password: currentPassword,
                    new_password: newPassword
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.showMessage('Password updated successfully!', 'success');
                this.resetForm();
            } else {
                const errorMessage = data.message || 'Failed to update password';
                this.showMessage(errorMessage, 'error');
            }
        } catch (error) {
            console.error('Password change error:', error);
            this.showMessage('Network error. Please try again.', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    setLoading(loading) {
        const form = document.getElementById('change-password-form');
        const submitBtn = form.querySelector('button[type="submit"]');
        const inputs = form.querySelectorAll('input');
        
        if (loading) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Updating...';
            inputs.forEach(input => input.disabled = true);
        } else {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Update Password';
            inputs.forEach(input => input.disabled = false);
        }
    }

    showMessage(message, type = 'info') {
        const messageDiv = document.getElementById('password-message');
        messageDiv.textContent = message;
        messageDiv.className = `message ${type}`;
        messageDiv.style.display = 'block';

        // Auto-hide success messages after 5 seconds
        if (type === 'success') {
            setTimeout(() => {
                messageDiv.style.display = 'none';
            }, 5000);
        }
    }

    clearMessage() {
        const messageDiv = document.getElementById('password-message');
        messageDiv.style.display = 'none';
        messageDiv.textContent = '';
    }

    resetForm() {
        const form = document.getElementById('change-password-form');
        form.reset();
        
        // Hide strength indicators
        document.getElementById('password-strength').style.display = 'none';
        document.getElementById('password-match').style.display = 'none';
        this.clearMessage();
    }

    initializeI18n() {
        if (window.i18n) {
            window.i18n.init();
        }
    }
}

// Password visibility toggle function
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const toggleBtn = input.parentNode.querySelector('.password-toggle');
    
    if (input.type === 'password') {
        input.type = 'text';
        toggleBtn.textContent = '🙈';
    } else {
        input.type = 'password';
        toggleBtn.textContent = '👁️';
    }
}

// Reset form function
function resetForm() {
    const settingsManager = window.settingsManager;
    if (settingsManager) {
        settingsManager.resetForm();
    }
}

// Logout function
async function logout() {
    try {
        const response = await fetch('/api/v1/logout', {
            method: 'POST',
            credentials: 'include'
        });

        // Redirect to login page regardless of response
        // This ensures user is logged out even if server request fails
        window.location.href = '/';
    } catch (error) {
        console.error('Logout error:', error);
        // Still redirect to login page
        window.location.href = '/';
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.settingsManager = new SettingsManager();
});