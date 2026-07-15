/**
 * BKNR ERP - Theme Management System
 * Saves the user's theme preference in LocalStorage.
 */

function toggleTheme() {
    const htmlElement = document.documentElement;
    const currentTheme = htmlElement.getAttribute('data-theme');
    const newTheme = (currentTheme === 'dark') ? 'light' : 'dark';

    // 1. Set the theme on the HTML element.
    htmlElement.setAttribute('data-theme', newTheme);
    
    // 2. Save the user's selection in the browser for all pages.
    localStorage.setItem('erp-theme', newTheme);
    
    // 3. Update the button icon and text.
    updateThemeUI(newTheme);
}

function updateThemeUI(theme) {
    const icon = document.getElementById('theme-icon');
    if (icon) {
        if (theme === 'dark') {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
            icon.style.color = '#ffcf40'; // Yellow for the sun icon.
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
            icon.style.color = 'inherit';
        }
    }
}

// Apply the saved theme immediately when the page loads.
(function() {
    const savedTheme = localStorage.getItem('erp-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    // Set the icon after the DOM loads.
    window.addEventListener('DOMContentLoaded', () => {
        updateThemeUI(savedTheme);
    });
})();
