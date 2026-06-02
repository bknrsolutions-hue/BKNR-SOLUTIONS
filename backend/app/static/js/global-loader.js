document.addEventListener("DOMContentLoaded", () => {

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

    // Hide after page fully loaded
    setTimeout(() => {
        loader.style.display = "none";
    }, 300);

    // All links
    document.querySelectorAll("a").forEach(link => {

        link.addEventListener("click", function () {

            const href = this.getAttribute("href");

            if (
                href &&
                !href.startsWith("#") &&
                !href.startsWith("javascript:")
            ) {
                loader.style.display = "flex";
            }

        });

    });

    // Forms
    document.querySelectorAll("form").forEach(form => {

        form.addEventListener("submit", () => {
            loader.style.display = "flex";
        });

    });

});

// Browser navigation
window.addEventListener("beforeunload", () => {

    const loader = document.getElementById("globalLoader");

    if (loader) {
        loader.style.display = "flex";
    }

});