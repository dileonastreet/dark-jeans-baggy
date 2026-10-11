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
const mainProductPhoto = document.querySelector("#main-product-photo");
const defaultProductPhoto = {
  src: mainProductPhoto.getAttribute("src"),
  alt: mainProductPhoto.alt,
};
const galleryReset = document.querySelector("#gallery-reset");
const photoButtons = [...document.querySelectorAll(".thumbnail-select[data-photo]")];

sizeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedSize = button.dataset.size;
    sizeButtons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    orderButton.disabled = false;
    sizeHelp.textContent = `Taille ${selectedSize} sélectionnée.`;
    summarySize.textContent = `· Taille ${selectedSize}`;
  });
});

photoButtons.forEach((button) => {
  button.addEventListener("click", () => {
    mainProductPhoto.src = button.dataset.photo;
    mainProductPhoto.alt = button.dataset.alt || "Pantalon baggy indigo foncé";
    photoButtons.forEach((photoButton) => photoButton.setAttribute("aria-pressed", String(photoButton === button)));
    galleryReset.hidden = false;
  });
});

galleryReset.addEventListener("click", () => {
  mainProductPhoto.src = defaultProductPhoto.src;
  mainProductPhoto.alt = defaultProductPhoto.alt;
  photoButtons.forEach((button) => button.setAttribute("aria-pressed", "false"));
  galleryReset.hidden = true;
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

orderForm.addEventListener("submit", async (event) => {
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
  const submitButton = orderForm.querySelector("#submit-order");
  const submitLabel = "CONFIRMER MA COMMANDE";
  const payload = {
    firstName,
    lastName,
    phone: String(formData.get("phone")).trim(),
    address: String(formData.get("address")).trim(),
    city,
    size: selectedSize,
    website: String(formData.get("website") || "").trim(),
  };

  submitButton.disabled = true;
  submitButton.classList.add("is-loading");
  submitButton.textContent = "ENVOI EN COURS…";
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (response.status !== 200 || result.ok !== true || typeof result.orderId !== "string") {
      throw new Error("Order could not be saved");
    }

    const orderReference = result.orderId.slice(0, 8).toUpperCase();
    successCopy.textContent = `Merci ${firstName} ${lastName}. Votre commande #${orderReference} pour le Dark Indigo Baggy Jeans (taille ${selectedSize}, 250 DH), à livrer à ${city}, est enregistrée.`;
    orderForm.hidden = true;
    successMessage.hidden = false;
  } catch {
    showError("Impossible d’enregistrer la commande pour le moment. Vos informations sont conservées dans le formulaire ; veuillez réessayer.");
  } finally {
    submitButton.disabled = false;
    submitButton.classList.remove("is-loading");
    submitButton.textContent = submitLabel;
  }
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
