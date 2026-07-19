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
            fallback.hidden = true;
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
        if (!loader.querySelector(".loader-adaptive-snapshot.is-ready")) return;

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
            if (pageReady || document.getElementById("appSplash")) {
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

    let sessionRedirecting = false;
    function redirectExpiredSession() {
        if (sessionRedirecting || window.location.pathname.startsWith("/auth/login")) return;
        sessionRedirecting = true;
        try {
            if (window.top && window.top !== window) {
                window.top.location.replace("/auth/login");
            } else {
                window.location.replace("/auth/login");
            }
        } catch (error) {
            window.location.replace("/auth/login");
        }
    }

    function isExpiredSessionResponse(response) {
        return response && (
            response.status === 401
            || (response.redirected && String(response.url || "").includes("/auth/login"))
        );
    }

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        const useLoader = shouldShowForFetch(args);
        if (useLoader) {
            activeRequests += 1;
            showLoader();
        }

        try {
            const response = await originalFetch(...args);
            if (isExpiredSessionResponse(response)) redirectExpiredSession();
            return response;
        } finally {
            if (useLoader) {
                activeRequests = Math.max(0, activeRequests - 1);
                if (activeRequests === 0 && pageReady) hideLoader();
            }
        }
    };

    if (!window.__bknrSessionXhrGuard) {
        window.__bknrSessionXhrGuard = true;
        const nativeXhrOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (...args) {
            this.addEventListener("loadend", () => {
                const redirectedToLogin = String(this.responseURL || "").includes("/auth/login");
                if (this.status === 401 || redirectedToLogin) redirectExpiredSession();
            }, { once: true });
            return nativeXhrOpen.apply(this, args);
        };
    }

    let sessionProbeActive = false;
    async function probeActiveSession() {
        if (sessionProbeActive || document.visibilityState === "hidden") return;
        sessionProbeActive = true;
        try {
            const response = await originalFetch("/auth/session-info", {
                cache: "no-store",
                credentials: "include",
                headers: { "Accept": "application/json" },
            });
            if (isExpiredSessionResponse(response)) {
                redirectExpiredSession();
                return;
            }
            if (response.ok) {
                const payload = await response.clone().json();
                if (!payload.authenticated) redirectExpiredSession();
            }
        } catch (error) {
            // Keep the current page during transient connectivity failures.
        } finally {
            sessionProbeActive = false;
        }
    }
    if (window.top === window.self) {
        window.setInterval(probeActiveSession, 15000);
        window.addEventListener("focus", probeActiveSession);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") probeActiveSession();
        });
    }

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

    window.BKNRSaveAndContinue = function (message) {
        const reopenKey = `bknr:new-entry:${window.location.pathname}`;
        sessionStorage.setItem(reopenKey, "1");
        const confirmation = window.Swal
            ? Swal.fire({
                title: "Saved Successfully",
                text: message || "Record saved successfully.",
                icon: "success",
                confirmButtonText: "Add Next",
                allowOutsideClick: false,
            })
            : Promise.resolve(window.alert(message || "Record saved successfully."));
        return Promise.resolve(confirmation).then(() => window.location.reload());
    };

    function openAuditRecord(recordId, auditItem) {
        if (recordId === null || recordId === undefined || recordId === "") return false;
        const safeId = window.CSS && window.CSS.escape
            ? window.CSS.escape(String(recordId))
            : String(recordId).replace(/["\\]/g, "\\$&");
        const row = document.querySelector(
            `[data-record-id="${safeId}"], [data-row-id="${safeId}"], tr[data-id="${safeId}"]`
        );
        if (!row) return false;

        const panel = auditItem && auditItem.closest
            ? auditItem.closest(".audit-panel, .attendance-modal-overlay, .attendance-drawer-backdrop, .modal, [role='dialog']")
            : null;
        if (panel) {
            panel.style.display = "none";
            panel.classList.remove("show", "open", "active");
        }

        row.style.removeProperty("display");
        row.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        if (typeof row.click === "function") row.click();
        const oldOutline = row.style.outline;
        const oldOffset = row.style.outlineOffset;
        row.style.outline = "3px solid #f59e0b";
        row.style.outlineOffset = "-2px";
        window.setTimeout(() => {
            row.style.outline = oldOutline;
            row.style.outlineOffset = oldOffset;
        }, 2400);
        return true;
    }

    window.openAuditRecord = function (recordId) {
        return openAuditRecord(recordId, null);
    };

    window.svbkSecureDownload = async function (url, label, method = "GET") {
        const downloadLabel = label || "this file";
        if (!window.confirm(`Admin OTP verification is required to download ${downloadLabel}. Send OTP?`)) return false;
        try {
            const generateResponse = await fetch("/data-management/generate-otp", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "download", module: downloadLabel })
            });
            const generated = await generateResponse.json();
            if (!generateResponse.ok || !generated.success) throw new Error(generated.error || "Unable to send Admin OTP");
            const otp = window.prompt(`${generated.message}\nEnter the 6-digit Admin OTP:`);
            if (!otp) return false;
            const verifyResponse = await fetch("/data-management/verify-otp", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "download", otp: otp.trim() })
            });
            const verified = await verifyResponse.json();
            if (!verifyResponse.ok || !verified.success || !verified.download_token) {
                throw new Error(verified.error || "Invalid Admin OTP");
            }
            const response = await fetch(url, {
                method,
                credentials: "include",
                headers: { "X-SVBK-Download-Token": verified.download_token, "Accept": "application/json" }
            });
            if (!response.ok) {
                const failure = await response.json().catch(() => ({}));
                throw new Error(failure.detail || failure.error || "Download failed");
            }
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            const disposition = response.headers.get("content-disposition") || "";
            const match = disposition.match(/filename="?([^";]+)"?/i);
            anchor.href = objectUrl;
            anchor.download = match?.[1] || downloadLabel.replace(/[^a-z0-9]+/gi, "_");
            anchor.style.display = "none";
            document.body.appendChild(anchor);
            anchor.click();
            window.setTimeout(() => {
                anchor.remove();
                URL.revokeObjectURL(objectUrl);
            }, 1500);
            return true;
        } catch (error) {
            window.alert(error.message || "Download failed");
            return false;
        }
    };

    document.addEventListener("click", (event) => {
        const item = event.target.closest(
            "[data-audit-record-id], .audit-item, .audit-log-item, .attendance-audit-body article"
        );
        if (!item) return;
        const text = item.textContent || "";
        const match = text.match(/(?:Row\s*ID|Record(?:\s*ID)?|ID\s*Ref)\s*[:#]?\s*#?(\d+)/i);
        const recordId = item.dataset.auditRecordId || (match ? match[1] : "");
        if (!recordId) return;
        item.setAttribute("role", "button");
        item.setAttribute("tabindex", "0");
        openAuditRecord(recordId, item);
    });

    function reopenNewEntryAfterSave() {
        const reopenKey = `bknr:new-entry:${window.location.pathname}`;
        if (sessionStorage.getItem(reopenKey) !== "1") return;
        sessionStorage.removeItem(reopenKey);
        setTimeout(() => {
            if (typeof window.openModal === "function") window.openModal();
            const form = document.querySelector("#entryModal form, form[id$='Form']");
            const firstField = form?.querySelector("input:not([type='hidden']):not([readonly]), select:not([disabled]), textarea:not([readonly])");
            firstField?.focus();
        }, 80);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", reopenNewEntryAfterSave, { once: true });
    } else {
        reopenNewEntryAfterSave();
    }
})();
