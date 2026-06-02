// Show immediately
const loader = document.createElement("div");

loader.id = "globalLoader";

loader.innerHTML = `
<div class="loader-spinner"></div>
<div class="loader-text">Loading...</div>
`;

document.body.appendChild(loader);

// Hide only after ALL page resources loaded
window.addEventListener("load", function () {

    loader.style.display = "none";

});

// Show on navigation
document.addEventListener("click", function(e){

    const link = e.target.closest("a");

    if(
        link &&
        link.href &&
        !link.href.includes("#") &&
        !link.href.startsWith("javascript:")
    ){
        loader.style.display = "flex";
    }

});

// Show on form submit
document.addEventListener("submit", function(){

    loader.style.display = "flex";

});