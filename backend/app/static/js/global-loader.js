document.addEventListener("DOMContentLoaded", () => {

    // Create Loader
    const loader = document.createElement("div");
    loader.id = "globalLoader";

    loader.innerHTML = `
        <div class="loader-spinner"></div>
        <div class="loader-text">Loading...</div>
    `;

    document.body.appendChild(loader);

    // Page Loaded
    window.addEventListener("load", () => {
        loader.style.display = "none";
    });

    // Link Click
    document.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", () => {
            const href = link.getAttribute("href");

            if (
                href &&
                !href.startsWith("#") &&
                !href.startsWith("javascript:")
            ) {
                loader.style.display = "flex";
            }
        });
    });

    // Form Submit
    document.querySelectorAll("form").forEach(form => {
        form.addEventListener("submit", () => {
            loader.style.display = "flex";
        });
    });

});