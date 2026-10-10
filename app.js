const sizeButtons = [...document.querySelectorAll(".size-option")];
const orderButton = document.querySelector("#open-order");
const sizeHelp = document.querySelector("#size-help");
const modal = document.querySelector("#order-modal");
const closeButton = document.querySelector("#close-order");
const orderForm = document.querySelector("#order-form");
const errorMessage = document.querySelector("#form-error");
const successMessage = document.querySelector("#success-message");
const successCopy = document.querySelector("#success-copy");
const summarySize = document.querySelector("#summary-size");
let selectedSize = "";
let previouslyFocused = null;

sizeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedSize = button.dataset.size;
    sizeButtons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    orderButton.disabled = false;
    sizeHelp.textContent = `Taille ${selectedSize} sélectionnée.`;
    summarySize.textContent = `· Taille ${selectedSize}`;
  });
});

function openModal() {
  if (!selectedSize) {
    sizeHelp.textContent = "Veuillez sélectionner une taille avant de commander.";
    sizeHelp.classList.add("is-error");
    return;
  }
  sizeHelp.classList.remove("is-error");
  previouslyFocused = document.activeElement;
  summarySize.textContent = `· Taille ${selectedSize}`;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  orderForm.querySelector('[name="lastName"]').focus();
}

function closeModal() {
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  if (!successMessage.hidden) {
    orderForm.reset();
    orderForm.hidden = false;
    successMessage.hidden = true;
    errorMessage.hidden = true;
  }
  if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
}

orderButton.addEventListener("click", openModal);
closeButton.addEventListener("click", closeModal);
document.querySelector("#finish-order").addEventListener("click", closeModal);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modal.hidden) closeModal();
});

function showError(message, field = null) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
  field?.setAttribute("aria-invalid", "true");
  field?.focus();
}

function clearError(event) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
    event.target.removeAttribute("aria-invalid");
  }
  errorMessage.hidden = true;
}
orderForm.addEventListener("input", clearError);
orderForm.addEventListener("change", clearError);

orderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  errorMessage.hidden = true;
  const fields = [...orderForm.querySelectorAll("input, select")];
  const invalid = fields.find((field) => !field.checkValidity());
  if (invalid) {
    showError("Veuillez compléter correctement tous les champs obligatoires.", invalid);
    return;
  }
  if (!selectedSize) {
    closeModal();
    sizeHelp.textContent = "Veuillez choisir une taille avant de confirmer votre demande.";
    sizeHelp.classList.add("is-error");
    return;
  }

  const formData = new FormData(orderForm);
  const firstName = String(formData.get("firstName")).trim();
  const lastName = String(formData.get("lastName")).trim();
  const city = String(formData.get("city"));
  successCopy.textContent = `Merci ${firstName} ${lastName}. Votre demande pour le Dark Indigo Baggy Jeans (taille ${selectedSize}, 250 DH) à livrer à ${city} est prête. Cette démo n’envoie pas vos informations.`;
  orderForm.hidden = true;
  successMessage.hidden = false;
});

document.querySelector("#year").textContent = String(new Date().getFullYear());

const menuButton = document.querySelector(".menu-toggle");
const menuPanel = document.querySelector("#site-menu");
menuButton.addEventListener("click", () => {
  const isOpen = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "Ouvrir le menu" : "Fermer le menu");
  menuPanel.hidden = isOpen;
});
menuPanel.addEventListener("click", (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    menuPanel.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Ouvrir le menu");
  }
});
