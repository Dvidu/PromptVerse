
"use strict";

const API = "/api/prompts";

const $ = (selector) => document.querySelector(selector);

const grid = $("#promptGrid");
const searchInput = $("#searchInput");
const sortSelect = $("#sortSelect");
const uploadModal = $("#uploadModal");
const detailModal = $("#detailModal");
const uploadForm = $("#uploadForm");
const imageInput = $("#imageInput");
const uploadPreview = $("#uploadPreview");
const uploadPlaceholder = $("#uploadPlaceholder");
const uploadError = $("#uploadError");
const submitBtn = $("#submitBtn");
const toast = $("#toast");

let prompts = [];
let activeCategory = "All";
let savedOnly = false;
let currentDetailId = null;
let toastTimer;
let previewUrl = null;
let deletingIds = new Set();

function readLocalSet(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

const savedIds = readLocalSet("promptverse-saved");
const likedIds = readLocalSet("promptverse-liked");

function saveLocal(key, set) {
  localStorage.setItem(key, JSON.stringify([...set]));
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function shortPrompt(text = "", max = 130) {
  const value = String(text);
  return value.length > max
    ? value.slice(0, max).trim() + "…"
    : value;
}

function showToast(message) {
  if (!toast) {
    console.log(message);
    return;
  }

  toast.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 3000);
}


async function readResponse(response) {
  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    console.error(
      "Server returned non-JSON response:",
      text.slice(0, 500)
    );

    throw new Error(
      `Server returned an invalid response (HTTP ${response.status}). Check the browser console.`
    );
  }

  if (!response.ok) {
    throw new Error(
      data.error || `Request failed (HTTP ${response.status}).`
    );
  }

  return data;
}

function normalizePromptResponse(data) {
  // Supports APIs that return either a prompt directly
  // or an object containing { success, prompt }.
  if (data && data.prompt && !Array.isArray(data.prompt)) {
    return data.prompt;
  }

  return data;
}

async function loadPrompts() {
  $("#loadingMessage")?.classList.remove("hidden");
  $("#errorMessage")?.classList.add("hidden");

  try {
    const response = await fetch(API, {
      headers: { Accept: "application/json" }
    });

    const data = await readResponse(response);

    if (!Array.isArray(data)) {
      throw new Error("The prompts API did not return a list.");
    }

    prompts = data;
    renderPrompts();
  } catch (error) {
    console.error("Load prompts error:", error);

    if ($("#errorMessage")) {
      $("#errorMessage").textContent =
        `${error.message} Make sure the server is running.`;
      $("#errorMessage").classList.remove("hidden");
    }

    if (grid) grid.innerHTML = "";
  } finally {
    $("#loadingMessage")?.classList.add("hidden");
  }
}

function getFilteredPrompts() {
  const query = (searchInput?.value || "").trim().toLowerCase();

  let result = prompts.filter((prompt) => {
    const tags = Array.isArray(prompt.tags) ? prompt.tags : [];

    const searchable = [
      prompt.title,
      prompt.prompt,
      prompt.category,
      prompt.creator,
      ...tags
    ].join(" ").toLowerCase();

    const matchesSearch = searchable.includes(query);

    const matchesCategory =
      activeCategory === "All" ||
      prompt.category === activeCategory;

    const matchesSaved =
      !savedOnly || savedIds.has(String(prompt.id));

    return matchesSearch && matchesCategory && matchesSaved;
  });

  if (sortSelect?.value === "newest") {
    result.sort(
      (a, b) =>
        new Date(b.createdAt || 0) -
        new Date(a.createdAt || 0)
    );
  } else if (sortSelect?.value === "oldest") {
    result.sort(
      (a, b) =>
        new Date(a.createdAt || 0) -
        new Date(b.createdAt || 0)
    );
  } else if (sortSelect?.value === "az") {
    result.sort((a, b) =>
      String(a.title || "").localeCompare(String(b.title || ""))
    );
  }

  return result;
}

function renderPrompts() {
  if (!grid) return;

  const filtered = getFilteredPrompts();

  if ($("#promptCount")) {
    $("#promptCount").textContent = prompts.length;
  }

  if ($("#savedCount")) {
    $("#savedCount").textContent = savedIds.size;
  }

  if ($("#resultText")) {
    $("#resultText").textContent =
      `${filtered.length} ${filtered.length === 1 ? "prompt" : "prompts"} found`;
  }

  if ($("#feedTitle")) {
    $("#feedTitle").textContent = savedOnly
      ? "Your saved prompts"
      : "Explore the feed";
  }

  $("#emptyState")?.classList.toggle(
    "hidden",
    filtered.length !== 0
  );

  grid.innerHTML = filtered.map((p) => {
    const id = String(p.id);
    const tags = Array.isArray(p.tags) ? p.tags : [];
    const isSaved = savedIds.has(id);
    const isDeleting = deletingIds.has(id);

    return `
      <article class="prompt-card" data-card="${escapeHTML(id)}">
        <div
          class="card-image-wrap"
          data-detail="${escapeHTML(id)}"
          role="button"
          tabindex="0"
        >
          <img
            class="card-image"
            src="${escapeHTML(p.image || "")}"
            alt="${escapeHTML(p.title || "Prompt image")}"
            loading="lazy"
            onerror="this.style.opacity='0.15'"
          >

          <div class="image-overlay"></div>

          <button
            class="save-btn ${isSaved ? "saved" : ""}"
            data-save="${escapeHTML(id)}"
            type="button"
            aria-label="${isSaved ? "Unsave" : "Save"} prompt"
          >${isSaved ? "♥" : "♡"}</button>
        </div>

        <div class="card-copy">
          <h3
            class="card-title"
            data-detail="${escapeHTML(id)}"
            role="button"
            tabindex="0"
          >${escapeHTML(p.title || "Untitled prompt")}</h3>

          <p class="card-prompt">
            ${escapeHTML(shortPrompt(p.prompt || ""))}
          </p>

          <div class="card-footer">
            <div class="creator">
              <span class="creator-avatar">
                ${escapeHTML(
                  String(p.creator || "P").slice(0, 1).toUpperCase()
                )}
              </span>
              <span>${escapeHTML(p.creator || "Creator")}</span>
            </div>

            <button
              class="copy-btn"
              data-copy="${escapeHTML(id)}"
              type="button"
            >▣ Copy prompt</button>

            <button
              class="delete-btn"
              data-delete="${escapeHTML(id)}"
              type="button"
              ${isDeleting ? "disabled" : ""}
            >${isDeleting ? "Deleting..." : "🗑 Delete"}</button>
          </div>

          ${tags.length ? `
            <div class="card-tags">
              ${tags.slice(0, 3).map((tag) =>
                `<span class="tag">#${escapeHTML(tag)}</span>`
              ).join("")}
            </div>
          ` : ""}
        </div>
      </article>
    `;
  }).join("");

  updateCategoryButtons();
}

function updateCategoryButtons() {
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.classList.toggle(
      "active",
      !savedOnly && button.dataset.category === activeCategory
    );
  });

  $("#exploreBtn")?.classList.toggle("active", !savedOnly);
  $("#savedBtn")?.classList.toggle("active", savedOnly);
}

function openModal(modal) {
  if (!modal) return;

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  modal.classList.add("hidden");

  if (modalId === "detailModal") {
    currentDetailId = null;
  }

  if (
    uploadModal?.classList.contains("hidden") &&
    detailModal?.classList.contains("hidden")
  ) {
    document.body.style.overflow = "";
  }
}

function openUploadModal() {
  uploadForm?.reset();

  uploadError?.classList.add("hidden");
  uploadPreview?.classList.add("hidden");
  uploadPlaceholder?.classList.remove("hidden");

  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  openModal(uploadModal);
}

function toggleSaved(id) {
  id = String(id);

  if (savedIds.has(id)) {
    savedIds.delete(id);
    showToast("Removed from saved prompts.");
  } else {
    savedIds.add(id);
    showToast("Prompt saved!");
  }

  saveLocal("promptverse-saved", savedIds);
  renderPrompts();

  if (String(currentDetailId) === id) {
    updateDetailButtons(id);
  }
}

function updateDetailButtons(id) {
  const button = $("#detailSave");
  if (!button) return;

  button.textContent = savedIds.has(String(id))
    ? "♥ Saved"
    : "♡ Save";
}

function openDetail(id) {
  id = String(id);

  const p = prompts.find(
    (item) => String(item.id) === id
  );

  if (!p) return;

  currentDetailId = id;

  if ($("#detailImage")) {
    $("#detailImage").src = p.image || "";
    $("#detailImage").alt = p.title || "Prompt image";
  }

  if ($("#detailTitle")) {
    $("#detailTitle").textContent = p.title || "";
  }

  if ($("#detailPrompt")) {
    $("#detailPrompt").textContent = p.prompt || "";
  }

  if ($("#detailCategory")) {
    $("#detailCategory").textContent = p.category || "Other";
  }

  if ($("#detailCreator")) {
    $("#detailCreator").textContent =
      `By ${p.creator || "Creator"}`;
  }

  if ($("#detailTags")) {
    const tags = Array.isArray(p.tags) ? p.tags : [];

    $("#detailTags").innerHTML = tags.map((tag) =>
      `<span class="tag">#${escapeHTML(tag)}</span>`
    ).join("");
  }

  updateDetailButtons(id);
  openModal(detailModal);
}

async function copyPrompt(id) {
  const p = prompts.find(
    (item) => String(item.id) === String(id)
  );

  if (!p) return;

  try {
    await navigator.clipboard.writeText(p.prompt || "");
    showToast("Prompt copied to clipboard!");
  } catch {
    const textarea = document.createElement("textarea");

    textarea.value = p.prompt || "";
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";

    document.body.appendChild(textarea);
    textarea.select();

    const success = document.execCommand("copy");
    textarea.remove();

    showToast(
      success ? "Prompt copied!" : "Could not copy prompt."
    );
  }
}

/* DELETE PROMPT */

async function deletePrompt(id) {
  id = String(id);

  if (deletingIds.has(id)) return;

  const promptExists = prompts.some(
    (prompt) => String(prompt.id) === id
  );

  if (!promptExists) {
    showToast("Prompt not found in the current feed.");
    return;
  }

  if (!window.confirm("Are you sure you want to delete this prompt?")) {
    return;
  }

  deletingIds.add(id);
  renderPrompts();

  try {
    const response = await fetch(
      `${API}/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: { Accept: "application/json" }
      }
    );

    const data = await readResponse(response);

    // Only update the feed after the server confirms success.
    prompts = prompts.filter(
      (prompt) => String(prompt.id) !== id
    );

    savedIds.delete(id);
    likedIds.delete(id);

    saveLocal("promptverse-saved", savedIds);
    saveLocal("promptverse-liked", likedIds);

    if (String(currentDetailId) === id) {
      closeModal("detailModal");
    }

    renderPrompts();
    showToast(data.message || "Prompt deleted successfully!");

    // Verify the updated list from the server.
    await loadPrompts();
  } catch (error) {
    console.error("Delete prompt error:", error);
    showToast(error.message || "Could not delete prompt.");
  } finally {
    deletingIds.delete(id);
    renderPrompts();
  }
}

/* OPEN UPLOAD MODALS */

$("#openUpload")?.addEventListener("click", openUploadModal);
$("#heroCreate")?.addEventListener("click", openUploadModal);
$("#emptyCreate")?.addEventListener("click", openUploadModal);

/* SEARCH AND FILTERS */

searchInput?.addEventListener("input", renderPrompts);
sortSelect?.addEventListener("change", renderPrompts);

$("#clearSearch")?.addEventListener("click", () => {
  if (!searchInput) return;

  searchInput.value = "";
  renderPrompts();
  searchInput.focus();
});

$("#categoryList")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;

  activeCategory = button.dataset.category;
  savedOnly = false;
  renderPrompts();
});

$("#exploreBtn")?.addEventListener("click", () => {
  savedOnly = false;
  activeCategory = "All";
  renderPrompts();
});

$("#savedBtn")?.addEventListener("click", () => {
  savedOnly = true;
  renderPrompts();
});

/* DARK MODE */

if (localStorage.getItem("promptverse-theme") === "dark") {
  document.body.classList.add("dark");
}

function updateThemeButton() {
  const button = $("#themeBtn");
  if (!button) return;

  button.textContent =
    document.body.classList.contains("dark") ? "☀" : "☾";
}

updateThemeButton();

$("#themeBtn")?.addEventListener("click", () => {
  document.body.classList.toggle("dark");

  localStorage.setItem(
    "promptverse-theme",
    document.body.classList.contains("dark") ? "dark" : "light"
  );

  updateThemeButton();
});

/* CARD ACTIONS AND MODAL CLOSE BUTTONS */

document.addEventListener("click", (event) => {
  const close = event.target.closest("[data-close]");
  const deleteButton = event.target.closest("[data-delete]");
  const copy = event.target.closest("[data-copy]");
  const save = event.target.closest("[data-save]");
  const detail = event.target.closest("[data-detail]");

  if (close) {
    closeModal(close.dataset.close);
    return;
  }

  if (deleteButton) {
    event.preventDefault();
    event.stopPropagation();

    deletePrompt(deleteButton.dataset.delete);
    return;
  }

  if (copy) {
    event.preventDefault();
    event.stopPropagation();

    copyPrompt(copy.dataset.copy);
    return;
  }

  if (save) {
    event.preventDefault();
    event.stopPropagation();

    toggleSaved(save.dataset.save);
    return;
  }

  if (detail) {
    openDetail(detail.dataset.detail);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal("uploadModal");
    closeModal("detailModal");
  }

  if (
    (event.key === "Enter" || event.key === " ") &&
    event.target.matches(".card-image-wrap, .card-title")
  ) {
    event.preventDefault();
    openDetail(event.target.dataset.detail);
  }
});

/* DETAIL MODAL ACTIONS */

$("#detailCopy")?.addEventListener("click", () => {
  if (currentDetailId !== null) {
    copyPrompt(currentDetailId);
  }
});

$("#detailSave")?.addEventListener("click", () => {
  if (currentDetailId !== null) {
    toggleSaved(currentDetailId);
  }
});

$("#detailDelete")?.addEventListener("click", () => {
  if (currentDetailId !== null) {
    deletePrompt(currentDetailId);
  }
});

/* IMAGE PREVIEW */

imageInput?.addEventListener("change", () => {
  const file = imageInput.files?.[0];

  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  if (!file) {
    uploadPreview?.classList.add("hidden");
    uploadPlaceholder?.classList.remove("hidden");
    return;
  }

  if (!file.type.startsWith("image/")) {
    imageInput.value = "";
    showUploadError("Please choose an image file.");
    return;
  }

  if (file.size > 8 * 1024 * 1024) {
    imageInput.value = "";
    showUploadError("Image must be smaller than 8 MB.");
    return;
  }

  previewUrl = URL.createObjectURL(file);

  if (uploadPreview) {
    uploadPreview.src = previewUrl;
    uploadPreview.classList.remove("hidden");
  }

  uploadPlaceholder?.classList.add("hidden");
  uploadError?.classList.add("hidden");
});

function showUploadError(message) {
  if (!uploadError) {
    showToast(message);
    return;
  }

  uploadError.textContent = message;
  uploadError.classList.remove("hidden");
}

/* PUBLISH PROMPT */

uploadForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  uploadError?.classList.add("hidden");

  if (!imageInput?.files?.[0]) {
    showUploadError("Please choose an image.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Publishing...";

  try {
    const formData = new FormData(uploadForm);

    const response = await fetch(API, {
      method: "POST",
      body: formData
    });

    const data = await readResponse(response);
    const createdPrompt = normalizePromptResponse(data);

    if (!createdPrompt || !createdPrompt.id) {
      throw new Error(
        "Prompt was submitted, but the server response is missing its ID."
      );
    }

    // Avoid duplicate entries.
    prompts = prompts.filter(
      (prompt) => String(prompt.id) !== String(createdPrompt.id)
    );

    prompts.unshift(createdPrompt);

    savedOnly = false;
    activeCategory = "All";

    if (searchInput) searchInput.value = "";
    if (sortSelect) sortSelect.value = "newest";

    closeModal("uploadModal");
    renderPrompts();

    showToast(data.message || "Your prompt has been published!");

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }

    // Reload the authoritative list from the server.
    await loadPrompts();
  } catch (error) {
    console.error("Publish prompt error:", error);

    showUploadError(
      error.message || "Could not publish prompt."
    );
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Publish prompt ↗";
  }
});

/* INITIAL LOAD */

loadPrompts();