// ======================================================
// BKNR ERP GLOBAL LOADER
// ======================================================

document.addEventListener("DOMContentLoaded", function () {

    let loader = document.getElementById("globalLoader");

    if (!loader) {

        loader = document.createElement("div");

        loader.id = "globalLoader";

        loader.innerHTML = `
            <div class="loader-spinner"></div>
            <div class="loader-text">Loading...</div>
        `;

        document.body.appendChild(loader);
    }

    // Hide loader after page fully rendered
    loader.style.display = "none";

});


// ======================================================
// PAGE NAVIGATION LOADER
// ======================================================

window.addEventListener("beforeunload", function () {

    const loader = document.getElementById("globalLoader");

    if (loader) {
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
        loader.style.display = "flex";
    }

    try {

        const response = await originalFetch(...args);

        return response;

    } catch (error) {

        throw error;

    } finally {

        if (loader) {
            loader.style.display = "none";
        }

    }
};


// ======================================================
// OPTIONAL: MANUAL CONTROL
// ======================================================

window.showLoader = function () {

    const loader = document.getElementById("globalLoader");

    if (loader) {
        loader.style.display = "flex";
    }

};

window.hideLoader = function () {

    const loader = document.getElementById("globalLoader");

    if (loader) {
        loader.style.display = "none";
    }

};