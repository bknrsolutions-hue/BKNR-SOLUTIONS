// ======================================================
// BKNR ERP GLOBAL LOADER
// Shows for page navigation and meaningful mutations only.
// ======================================================

(function () {
    let activeRequests = 0;
    let showTimer = null;

    function syncFontAwesomeFallback() {
        if (!document.body) return;

        const probe = document.createElement("i");
        probe.className = "fa-solid fa-circle-check";
        probe.style.cssText = "position:absolute;left:-9999px;top:-9999px;visibility:hidden;";
        document.body.appendChild(probe);

        const family = window.getComputedStyle(probe).fontFamily || "";
        document.body.removeChild(probe);

        document.documentElement.classList.toggle(
            "fa-icons-fallback",
            !/Font Awesome/i.test(family)
        );
    }

    function syncModalOpenState() {
        if (!document.body) return;
        const hasOpenModal = Array.from(document.querySelectorAll(".modal")).some((modal) => {
            const style = window.getComputedStyle(modal);
            return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
        });
        document.body.classList.toggle("modal-open", hasOpenModal);
    }

    function watchModals() {
        if (!document.body || !window.MutationObserver) return;
        syncModalOpenState();
        const observer = new MutationObserver(syncModalOpenState);
        document.querySelectorAll(".modal").forEach((modal) => {
            observer.observe(modal, { attributes: true, attributeFilter: ["class", "style"] });
        });
        observer.observe(document.body, { childList: true, subtree: true });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") setTimeout(syncModalOpenState, 0);
        });
    }

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
        syncFontAwesomeFallback();
        setTimeout(syncFontAwesomeFallback, 1200);
        watchModals();
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

    window.forceHideLoader = function () {
        activeRequests = 0;
        hideLoader();
    };
})();
