// ======================================================
// BKNR ERP GLOBAL LOADER + DAILY QUOTE SYSTEM
// ======================================================

document.addEventListener("DOMContentLoaded", function () {

    let loader = document.getElementById("globalLoader");

    if (!loader) {

        loader = document.createElement("div");

        loader.id = "globalLoader";

        loader.innerHTML = `
            <div class="loader-container">

                <div class="loader-spinner"></div>

                <div class="loader-text">
                    BKNR ERP
                </div>

                <div class="loader-subtext">
                    Enterprise Resource Planning
                </div>

                <div class="loader-quote" id="dailyQuote">
                    Loading today's insight...
                </div>

            </div>
        `;

        document.body.appendChild(loader);
    }

    // ==================================================
    // DAILY QUOTE ENGINE
    // ==================================================

    const quotes = [

        "Operational Excellence Starts with Visibility.",
        "What Gets Measured Gets Improved.",
        "Inventory Accuracy Protects Profit.",
        "Quality Is Everyone's Responsibility.",
        "Every Batch Matters.",
        "Data Drives Better Decisions.",
        "Discipline Creates Results.",
        "Great Companies Run On Great Systems.",
        "Excellence Is A Daily Habit.",
        "Small Improvements Create Big Results.",
        "Efficiency Is The Foundation Of Growth.",
        "Leadership Begins With Accountability.",
        "Consistency Beats Perfection.",
        "Technology Enables Scale.",
        "Strong Processes Create Strong Results.",
        "Accuracy Today Prevents Problems Tomorrow.",
        "Measure. Improve. Repeat.",
        "Productivity Is Never An Accident.",
        "Success Is Built Daily.",
        "Execution Matters More Than Intention.",
        "Continuous Improvement Never Ends.",
        "Quality Creates Customer Trust.",
        "Good Data Creates Great Decisions.",
        "Profit Follows Process.",
        "Focus On Progress Every Day.",
        "Teamwork Drives Excellence.",
        "Reliability Builds Reputation.",
        "Operational Discipline Creates Growth.",
        "Think Long Term. Execute Daily.",
        "Every Detail Matters."
    ];

    function setDailyQuote() {

        const quoteEl = document.getElementById("dailyQuote");

        if (!quoteEl) return;

        const today = new Date();

        const start = new Date(
            today.getFullYear(),
            0,
            0
        );

        const diff = today - start;

        const dayOfYear = Math.floor(
            diff / (1000 * 60 * 60 * 24)
        );

        quoteEl.textContent =
            quotes[(dayOfYear - 1) % quotes.length];
    }

    setDailyQuote();

    // ==================================================
    // PAGE READY
    // ==================================================

    loader.classList.add("hide");

});


// ======================================================
// PAGE NAVIGATION LOADER
// ======================================================

window.addEventListener("beforeunload", function () {

    const loader = document.getElementById("globalLoader");

    if (loader) {
        loader.classList.remove("hide");
        loader.style.display = "flex";
    }

});


// ======================================================
// AJAX / FETCH LOADER
// ======================================================

const originalFetch = window.fetch;

window.fetch = async (...args) => {

    const loader = document.getElementById("globalLoader");

    if (loader) {
        loader.classList.remove("hide");
        loader.style.display = "flex";
    }

    try {

        return await originalFetch(...args);

    } catch (error) {

        throw error;

    } finally {

        if (loader) {

            setTimeout(() => {

                loader.classList.add("hide");

            }, 300);

        }

    }

};


// ======================================================
// MANUAL CONTROLS
// ======================================================

window.showLoader = function () {

    const loader = document.getElementById("globalLoader");

    if (loader) {

        loader.classList.remove("hide");
        loader.style.display = "flex";

    }

};

window.hideLoader = function () {

    const loader = document.getElementById("globalLoader");

    if (loader) {

        loader.classList.add("hide");

    }

};