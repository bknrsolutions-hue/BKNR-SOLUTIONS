// ======================================================
// BKNR ERP PREMIUM CHART ENGINE
// Shared Chart.js defaults used across dashboards.
// ======================================================

(function () {
    if (!window.Chart) return;

    const palette = [
        "#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
        "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#6366f1"
    ];

    function theme() {
        const doc = document.documentElement;
        const mode = doc.getAttribute("data-theme") || "light";
        const dark = mode === "dark";
        return {
            dark,
            text: dark ? "#cbd5e1" : "#475569",
            muted: dark ? "#94a3b8" : "#64748b",
            grid: dark ? "rgba(148, 163, 184, 0.18)" : "rgba(148, 163, 184, 0.28)",
            surface: dark ? "rgba(15, 23, 42, 0.92)" : "rgba(255, 255, 255, 0.96)",
            border: dark ? "rgba(148, 163, 184, 0.22)" : "rgba(148, 163, 184, 0.32)"
        };
    }

    function setDatasetDefaults(dataset, index) {
        if (!dataset) return dataset;
        const color = palette[index % palette.length];

        if (!dataset.backgroundColor) dataset.backgroundColor = color;
        if (!dataset.borderColor) dataset.borderColor = color;
        if (dataset.type === "line" || dataset.borderColor || dataset.fill !== undefined) {
            dataset.borderWidth = dataset.borderWidth ?? 2;
            dataset.tension = dataset.tension ?? 0.38;
            dataset.pointRadius = dataset.pointRadius ?? 2;
            dataset.pointHoverRadius = dataset.pointHoverRadius ?? 4;
        } else {
            dataset.borderRadius = dataset.borderRadius ?? 7;
            dataset.borderSkipped = dataset.borderSkipped ?? false;
            dataset.maxBarThickness = dataset.maxBarThickness ?? 34;
        }
        return dataset;
    }

    function isPlainObject(value) {
        return value && typeof value === "object" && !Array.isArray(value);
    }

    function mergeDeep(base, override) {
        const output = { ...base };
        Object.keys(override || {}).forEach((key) => {
            if (isPlainObject(output[key]) && isPlainObject(override[key])) {
                output[key] = mergeDeep(output[key], override[key]);
            } else {
                output[key] = override[key];
            }
        });
        return output;
    }

    function premiumOptions(options = {}) {
        const t = theme();
        const merged = {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: "top",
                    labels: {
                        color: t.text,
                        boxWidth: 10,
                        boxHeight: 10,
                        usePointStyle: true,
                        pointStyle: "rectRounded",
                        padding: 12,
                        font: { family: "Plus Jakarta Sans", size: 10, weight: "700" }
                    }
                },
                tooltip: {
                    backgroundColor: t.surface,
                    titleColor: t.text,
                    bodyColor: t.text,
                    borderColor: t.border,
                    borderWidth: 1,
                    padding: 10,
                    displayColors: true,
                    titleFont: { family: "Plus Jakarta Sans", size: 11, weight: "800" },
                    bodyFont: { family: "Plus Jakarta Sans", size: 10, weight: "700" }
                }
            },
            scales: {
                x: {
                    grid: { display: false, color: t.grid },
                    border: { display: false },
                    ticks: {
                        color: t.muted,
                        maxRotation: 0,
                        autoSkip: true,
                        font: { family: "Plus Jakarta Sans", size: 10, weight: "700" }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: t.grid, drawBorder: false },
                    border: { display: false },
                    ticks: {
                        color: t.muted,
                        font: { family: "Plus Jakarta Sans", size: 10, weight: "700" }
                    }
                }
            }
        };

        return mergeDeep(merged, options);
    }

    function create(ctx, config) {
        const next = {
            ...config,
            data: {
                ...(config.data || {}),
                datasets: (config.data?.datasets || []).map(setDatasetDefaults)
            },
            options: premiumOptions(config.options || {})
        };
        return new Chart(ctx, next);
    }

    window.BKNRCharts = {
        colors: palette,
        theme,
        options: premiumOptions,
        dataset: setDatasetDefaults,
        create
    };

    Chart.defaults.color = theme().text;
    Chart.defaults.borderColor = theme().grid;
    Chart.defaults.font.family = "Plus Jakarta Sans, Inter, sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.font.weight = "700";
})();
