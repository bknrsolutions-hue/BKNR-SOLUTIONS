// ======================================================
// BKNR ERP APP SPLASH
// One business motivation quote for each day of the year.
// ======================================================

(function () {
    const quoteOpeners = [
        "Build the process before you chase the result",
        "Small improvements compound into operational power",
        "Clarity turns daily work into measurable progress",
        "A disciplined team makes complex work look simple",
        "Quality grows when every hand respects the next step",
        "Strong businesses are built on repeatable habits",
        "The best reports are born from clean daily entries",
        "Focus converts effort into visible performance",
        "Speed matters most when accuracy travels with it",
        "Every batch is a chance to raise the standard",
        "Good decisions begin with trusted data",
        "Consistency is the quiet engine of growth",
        "A clear dashboard creates a calmer business",
        "Profit follows teams that measure the right things",
        "Operational excellence is built one shift at a time"
    ];

    const quoteMiddles = [
        "keep the numbers honest",
        "protect the workflow",
        "remove one delay",
        "finish the important task first",
        "make the handover cleaner",
        "review the exception early",
        "turn feedback into action",
        "track what truly matters",
        "simplify the next decision",
        "align people with priorities",
        "close the loop today",
        "make quality visible",
        "convert activity into output",
        "respect time and material",
        "raise the baseline"
    ];

    const quoteClosers = [
        "and the business moves with confidence.",
        "and growth becomes easier to manage.",
        "and tomorrow starts with less friction.",
        "and the team earns trust faster.",
        "and every department feels the lift.",
        "and performance becomes predictable.",
        "and leadership sees the truth sooner.",
        "and execution gets sharper.",
        "and waste loses room to hide.",
        "and customers feel the discipline.",
        "and cash flow gets stronger.",
        "and the standard becomes culture.",
        "and decisions become lighter.",
        "and the day ends cleaner.",
        "and progress becomes visible."
    ];

    function dayOfYear(date) {
        const start = new Date(date.getFullYear(), 0, 0);
        const diff = date - start + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60000);
        return Math.floor(diff / 86400000);
    }

    function dailyQuote(date) {
        const day = dayOfYear(date) - 1;
        const opener = quoteOpeners[day % quoteOpeners.length];
        const middle = quoteMiddles[(Math.floor(day / quoteOpeners.length) + day) % quoteMiddles.length];
        const closer = quoteClosers[(Math.floor(day / (quoteOpeners.length * quoteMiddles.length)) + day) % quoteClosers.length];
        return `${opener}; ${middle}, ${closer}`;
    }

    function hideSplash() {
        const splash = document.getElementById("appSplash");
        if (!splash) return;
        splash.classList.add("hide");
        setTimeout(() => splash.remove(), 520);
    }

    document.addEventListener("DOMContentLoaded", function () {
        const splash = document.getElementById("appSplash");
        if (!splash) return;

        const quoteEl = document.getElementById("appSplashQuote");
        if (quoteEl) quoteEl.textContent = dailyQuote(new Date());

        const minShowMs = 1250;
        if (document.readyState === "complete") {
            setTimeout(hideSplash, minShowMs);
        } else {
            window.addEventListener("load", () => setTimeout(hideSplash, minShowMs), { once: true });
            setTimeout(hideSplash, 2600);
        }
    });
})();
