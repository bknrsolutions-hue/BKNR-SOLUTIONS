/**
 * BKNR ERP - Theme Management System
 * ఈ స్క్రిప్ట్ యూజర్ ఎంపికను LocalStorageలో సేవ్ చేస్తుంది.
 */

function toggleTheme() {
    const htmlElement = document.documentElement;
    const currentTheme = htmlElement.getAttribute('data-theme');
    const newTheme = (currentTheme === 'dark') ? 'light' : 'dark';

    // 1. HTML ట్యాగ్‌కి థీమ్ సెట్ చేయడం
    htmlElement.setAttribute('data-theme', newTheme);
    
    // 2. యూజర్ ఎంపికను బ్రౌజర్‌లో సేవ్ చేయడం (అన్ని పేజీలకు వర్తిస్తుంది)
    localStorage.setItem('erp-theme', newTheme);
    
    // 3. బటన్ ఐకాన్ మరియు టెక్స్ట్ మార్చడం
    updateThemeUI(newTheme);
}

function updateThemeUI(theme) {
    const icon = document.getElementById('theme-icon');
    if (icon) {
        if (theme === 'dark') {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
            icon.style.color = '#ffcf40'; // సన్ ఐకాన్ కోసం ఎల్లో కలర్
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
            icon.style.color = 'inherit';
        }
    }
}

// పేజీ లోడ్ అయిన వెంటనే సేవ్ చేసిన థీమ్‌ను అప్లై చేసే Self-Invoking Function
(function() {
    const savedTheme = localStorage.getItem('erp-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    // DOM లోడ్ అయిన తర్వాత ఐకాన్ సెట్ చేయడం
    window.addEventListener('DOMContentLoaded', () => {
        updateThemeUI(savedTheme);
    });
})();