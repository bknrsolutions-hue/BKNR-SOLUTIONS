// ======================================================
// BKNR ERP GLOBAL LOADER
// Shows for page navigation and meaningful mutations only.
// ======================================================

(function () {
    let activeRequests = 0;
    let showTimer = null;
    const COMPANY_CACHE_KEY = "bknr_company_name";

    function getCompanyName() {
        return window.BKNR_COMPANY_NAME ||
            document.querySelector('meta[name="company-name"]')?.content ||
            sessionStorage.getItem(COMPANY_CACHE_KEY) ||
            "BKNR ERP";
    }

    function getCompanyInitials(name) {
        const words = String(name || "BK").trim().split(/\s+/).filter(Boolean);
        if (!words.length) return "BK";
        if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
        return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
    }

    function updateLoaderBrand(loader) {
        if (!loader) return;
        const companyName = getCompanyName();
        const mark = loader.querySelector(".loader-brand-mark span");
        const text = loader.querySelector(".loader-text");
        const subtext = loader.querySelector(".loader-subtext");
        if (mark) mark.textContent = getCompanyInitials(companyName);
        if (text) text.textContent = companyName;
        if (subtext) subtext.textContent = "Preparing secure workspace";
    }

    function ensureLoader() {
        let loader = document.getElementById("globalLoader");
        if (!loader && document.body) {
            loader = document.createElement("div");
            loader.id = "globalLoader";
            loader.classList.add("hide");
            loader.innerHTML = `
                <div class="loader-container">
                    <div class="loader-brand-mark" aria-hidden="true">
                        <span>BK</span>
                    </div>
                    <div class="loader-text">BKNR ERP</div>
                    <div class="loader-subtext">Preparing secure workspace</div>
                    <div class="loader-progress" aria-hidden="true"><span></span></div>
                </div>
            `;
            document.body.appendChild(loader);
        }
        updateLoaderBrand(loader);
        return loader;
    }

    async function refreshCompanyName() {
        try {
            const res = await fetch("/auth/session-info", { loader: false, silent: true, credentials: "same-origin" });
            if (!res.ok) return;
            const data = await res.json();
            if (data && data.company_name) {
                sessionStorage.setItem(COMPANY_CACHE_KEY, data.company_name);
                window.BKNR_COMPANY_NAME = data.company_name;
                updateLoaderBrand(document.getElementById("globalLoader"));
            }
        } catch (_) {
            /* Session info is best-effort only. */
        }
    }

    function showLoader(delay = 250) {
        const loader = ensureLoader();
        if (!loader) return;

        clearTimeout(showTimer);
        showTimer = setTimeout(() => {
            loader.style.display = "flex";
            loader.classList.remove("hide");
        }, delay);
    }

    function hideLoader() {
        clearTimeout(showTimer);
        const loader = document.getElementById("globalLoader");
        if (!loader) return;

        loader.classList.add("hide");
        setTimeout(() => {
            if (activeRequests === 0) loader.style.display = "none";
        }, 250);
    }

    function shouldShowForFetch(args) {
        const input = args[0];
        const init = args[1] || {};
        const method = String(init.method || (input && input.method) || "GET").toUpperCase();

        if (init.loader === false || init.silent === true) return false;
        if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;

        return true;
    }

    document.addEventListener("DOMContentLoaded", function () {
        const loader = ensureLoader();
        if (loader) {
            loader.classList.add("hide");
            loader.style.display = "none";
        }
        refreshCompanyName();
    });

    window.addEventListener("beforeunload", function () {
        showLoader(0);
    });

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        const useLoader = shouldShowForFetch(args);
        if (useLoader) {
            activeRequests += 1;
            showLoader();
        }

        try {
            return await originalFetch(...args);
        } finally {
            if (useLoader) {
                activeRequests = Math.max(0, activeRequests - 1);
                if (activeRequests === 0) hideLoader();
            }
        }
    };

    window.showLoader = function () {
        activeRequests += 1;
        showLoader(0);
    };

    window.hideLoader = function () {
        activeRequests = Math.max(0, activeRequests - 1);
        if (activeRequests === 0) hideLoader();
    };
})();
