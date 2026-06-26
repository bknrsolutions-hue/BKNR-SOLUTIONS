// ======================================================
// BKNR ERP GLOBAL LOADER
// Shows for page navigation and meaningful mutations only.
// ======================================================

(function () {
    let activeRequests = 0;
    let showTimer = null;

    function ensureLoader() {
        let loader = document.getElementById("globalLoader");
        if (!loader && document.body) {
            loader = document.createElement("div");
            loader.id = "globalLoader";
            loader.classList.add("hide");
            loader.innerHTML = `
                <div class="loader-container">
                    <div class="loader-spinner"></div>
                </div>
            `;
            document.body.appendChild(loader);
        }
        return loader;
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
