// ======================================================
// BKNR ERP GLOBAL LOADER
// Shows a page-shaped ERP shell for navigation and data requests.
// ======================================================

(function () {
    // Guard: only initialize once per browsing context (prevents double spinner
    // when both menu.html parent and child iframe pages include this script)
    if (window.__bknrLoaderInit) return;
    window.__bknrLoaderInit = true;

    let activeRequests = 0;
    let showTimer = null;
    let safetyTimer = null;
    let pageReady = document.readyState === "complete";
    let initialRevealTimer = null;
    const MAX_VISIBLE_MS = 30000;

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
            loader.setAttribute("role", "status");
            loader.setAttribute("aria-live", "polite");
            loader.setAttribute("aria-label", "Loading workspace");
            loader.setAttribute("aria-hidden", "true");
            loader.innerHTML = `
                <div class="loader-container">
                    <div class="loader-adaptive-snapshot" aria-hidden="true"></div>
                    <div class="loader-fallback-shell">
                    <div class="loader-shell-header">
                        <div class="loader-heading-group">
                            <span class="loader-skeleton loader-skeleton-logo"></span>
                            <span class="loader-skeleton loader-skeleton-title"></span>
                        </div>
                        <span class="loader-skeleton loader-skeleton-action"></span>
                    </div>
                    <div class="loader-filter-row" aria-hidden="true">
                        <span class="loader-skeleton"></span><span class="loader-skeleton"></span>
                        <span class="loader-skeleton loader-filter-wide"></span><span class="loader-skeleton loader-filter-button"></span>
                    </div>
                    <div class="loader-skeleton-grid" aria-hidden="true">
                        <span class="loader-skeleton"></span><span class="loader-skeleton"></span><span class="loader-skeleton"></span>
                    </div>
                    <div class="loader-table" aria-hidden="true">
                        <div class="loader-table-head"><span></span><span></span><span></span></div>
                        <div class="loader-table-row"><span></span><span></span><span></span></div>
                        <div class="loader-table-row"><span></span><span></span><span></span></div>
                        <div class="loader-table-row loader-table-row-last"><span></span><span></span><span></span></div>
                    </div>
                    <span class="loader-sr-text">Loading workspace</span>
                    </div>
                </div>
            `;
            document.body.appendChild(loader);
        }
        return loader;
    }

    function buildAdaptiveSkeleton(loader) {
        const snapshot = loader.querySelector(".loader-adaptive-snapshot");
        const fallback = loader.querySelector(".loader-fallback-shell");
        if (!snapshot || !fallback) return;

        const selectors = [
            "[data-skeleton-root]", "main", ".main-content", ".content-wrapper",
            ".page-content", ".dashboard-container", ".report-container",
            ".form-container", "body > .container-fluid", "body > .container", "body"
        ];
        let source = null;
        for (const selector of selectors) {
            source = document.querySelector(selector);
            if (source && !source.closest("#globalLoader") && source.getBoundingClientRect().height > 80) break;
            source = null;
        }

        if (!source) {
            snapshot.replaceChildren();
            snapshot.classList.remove("is-ready");
            fallback.hidden = false;
            return;
        }

        const clone = source === document.body ? document.createElement("div") : source.cloneNode(true);
        if (source === document.body) {
            Array.from(document.body.children).forEach((child) => {
                if (!child.matches("#globalLoader, #appSplash, script, style, link, noscript, .modal, .toast, .swal2-container")) {
                    clone.appendChild(child.cloneNode(true));
                }
            });
        }
        clone.removeAttribute("id");
        clone.classList.add("loader-page-snapshot");
        clone.querySelectorAll("script, style, link, noscript, #globalLoader, .modal, .toast, .swal2-container").forEach((node) => node.remove());
        clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
        clone.querySelectorAll("input, textarea, select").forEach((node) => {
            node.removeAttribute("value");
            node.removeAttribute("placeholder");
            node.disabled = true;
        });
        clone.querySelectorAll("img, canvas, svg, iframe, video").forEach((node) => {
            node.removeAttribute("src");
            node.replaceChildren();
            node.classList.add("loader-media-placeholder");
        });
        clone.querySelectorAll("a, button").forEach((node) => {
            node.removeAttribute("href");
            node.removeAttribute("onclick");
            node.setAttribute("tabindex", "-1");
        });

        snapshot.replaceChildren(clone);
        snapshot.classList.add("is-ready");
        fallback.hidden = true;
    }

    function showLoader(delay = 250) {
        const loader = ensureLoader();
        if (!loader) return;
        buildAdaptiveSkeleton(loader);

        clearTimeout(showTimer);
        showTimer = setTimeout(() => {
            loader.style.display = "flex";
            loader.classList.remove("hide");
            loader.setAttribute("aria-hidden", "false");
            clearTimeout(safetyTimer);
            safetyTimer = setTimeout(() => {
                activeRequests = 0;
                hideLoader();
            }, MAX_VISIBLE_MS);
        }, delay);
    }

    function hideLoader() {
        clearTimeout(showTimer);
        clearTimeout(safetyTimer);
        const loader = document.getElementById("globalLoader");
        if (!loader) return;

        loader.classList.add("hide");
        loader.setAttribute("aria-hidden", "true");
        setTimeout(() => {
            if (activeRequests === 0) loader.style.display = "none";
        }, 250);
    }

    function shouldShowForFetch(args) {
        const input = args[0];
        const init = args[1] || {};
        const method = String(init.method || (input && input.method) || "GET").toUpperCase();

        if (init.loader === false || init.silent === true) return false;
        if (method === "HEAD" || method === "OPTIONS") return false;

        return true;
    }

    function initializeLoader() {
        watchSpinnerIcons();
        const loader = ensureLoader();
        if (loader) {
            if (pageReady) {
                loader.classList.add("hide");
                loader.style.display = "none";
            } else {
                // Render the real page structure as a skeleton while its
                // initial API requests and assets are still resolving.
                buildAdaptiveSkeleton(loader);
                showLoader(0);
            }
        }
        syncFontAwesomeFallback();
        setTimeout(syncFontAwesomeFallback, 1200);
        watchModals();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeLoader, { once: true });
    } else {
        initializeLoader();
    }

    window.addEventListener("load", function () {
        pageReady = true;
        clearTimeout(initialRevealTimer);
        initialRevealTimer = setTimeout(() => {
            if (activeRequests === 0) hideLoader();
        }, 120);
    }, { once: true });

    // A page restored from the browser back-forward cache does not fire a new
    // DOMContentLoaded event. Always reset stale navigation loaders.
    window.addEventListener("pageshow", function (event) {
        if (!event.persisted) return;
        pageReady = true;
        activeRequests = 0;
        hideLoader();
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
                if (activeRequests === 0 && pageReady) hideLoader();
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
