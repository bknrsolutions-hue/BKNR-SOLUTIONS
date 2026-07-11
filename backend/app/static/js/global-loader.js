// ======================================================
// BKNR ERP GLOBAL LOADER
// Shows for page navigation and meaningful mutations only.
// ======================================================

(function () {
    // Guard: only initialize once per browsing context (prevents double spinner
    // when both menu.html parent and child iframe pages include this script)
    if (window.__bknrLoaderInit) return;
    window.__bknrLoaderInit = true;

    let activeRequests = 0;
    let showTimer = null;

    function injectSkeletonLoaderStyle() {
        if (document.getElementById("bknrSkeletonLoaderStyle")) return;
        const style = document.createElement("style");
        style.id = "bknrSkeletonLoaderStyle";
        style.textContent = `
            .bknr-inline-skeleton,
            html body i.fa-solid.fa-spinner.fa-spin,
            html body i.fa-solid.fa-circle-notch.fa-spin,
            html body i.fa-spinner.fa-spin,
            html body i.fa-circle-notch.fa-spin,
            html body .swal2-loader {
                position: relative !important;
                display: inline-block !important;
                width: 38px !important;
                height: 8px !important;
                min-width: 38px !important;
                min-height: 8px !important;
                overflow: hidden !important;
                border: 0 !important;
                border-radius: 999px !important;
                background: var(--loader-skeleton-base, var(--border, #e2e8f0)) !important;
                color: transparent !important;
                font-size: 0 !important;
                line-height: 0 !important;
                animation: none !important;
                vertical-align: middle !important;
            }
            html body .swal2-loader {
                width: 74px !important;
                height: 10px !important;
                min-width: 74px !important;
                min-height: 10px !important;
            }
            .bknr-inline-skeleton::before,
            .bknr-inline-skeleton::after,
            html body i.fa-spinner.fa-spin::before,
            html body i.fa-circle-notch.fa-spin::before,
            html body i.fa-spinner.fa-spin::after,
            html body i.fa-circle-notch.fa-spin::after,
            html body .swal2-loader::after {
                content: "" !important;
                position: absolute !important;
                inset: 0 !important;
                transform: translateX(-100%);
                background: linear-gradient(90deg, transparent, var(--loader-skeleton-shine, var(--header-bg, #f8fafc)), transparent);
                animation: bknrRuntimeSkeletonShimmer 1.15s ease-in-out infinite !important;
            }
            @keyframes bknrRuntimeSkeletonShimmer {
                to { transform: translateX(100%); }
            }
        `;
        document.head.appendChild(style);
    }

    function convertSpinnerIcons(root = document) {
        if (!root.querySelectorAll) return;
        root.querySelectorAll("i.fa-spin.fa-spinner, i.fa-spin.fa-circle-notch").forEach((icon) => {
            icon.classList.remove("fa-spin", "fa-spinner", "fa-circle-notch", "fa-solid", "fa");
            icon.classList.add("bknr-inline-skeleton");
            icon.setAttribute("aria-hidden", "true");
        });
    }

    function watchSpinnerIcons() {
        injectSkeletonLoaderStyle();
        convertSpinnerIcons();
        if (!document.body || !window.MutationObserver) return;
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) convertSpinnerIcons(node);
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

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
                    <div class="loader-skeleton loader-skeleton-title"></div>
                    <div class="loader-skeleton loader-skeleton-line"></div>
                    <div class="loader-skeleton loader-skeleton-line short"></div>
                    <div class="loader-skeleton-grid">
                        <span class="loader-skeleton"></span>
                        <span class="loader-skeleton"></span>
                        <span class="loader-skeleton"></span>
                    </div>
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
        watchSpinnerIcons();
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
