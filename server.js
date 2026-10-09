
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Folders ----------
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "prompts.json");

// Create required folders and JSON file.
fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, "[]", "utf8");
}

// ---------- Middleware ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- Read and save prompts ----------
function readPrompts() {
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  const prompts = JSON.parse(raw || "[]");

  if (!Array.isArray(prompts)) {
    throw new Error("data/prompts.json must contain a JSON array.");
  }

  return prompts;
}

function savePrompts(prompts) {
  const tempFile = DATA_FILE + ".tmp";

  fs.writeFileSync(
    tempFile,
    JSON.stringify(prompts, null, 2),
    "utf8"
  );

  fs.renameSync(tempFile, DATA_FILE);
}

// ---------- Image upload settings ----------
const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif"
]);

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, UPLOAD_DIR);
  },

  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const filename =
      Date.now() + "-" + crypto.randomBytes(5).toString("hex") + extension;

    callback(null, filename);
  }
});

const upload = multer({
  storage,

  limits: {
    fileSize: 10 * 1024 * 1024
  },

  fileFilter: (req, file, callback) => {
    if (allowedMimeTypes.has(file.mimetype)) {
      return callback(null, true);
    }

    callback(
      new Error("Unsupported image type. Use JPG, PNG, WEBP, GIF or AVIF.")
    );
  }
});

// ---------- Static website ----------
app.use(express.static(PUBLIC_DIR));

// ---------- GET: Load all prompts ----------
app.get("/api/prompts", (req, res, next) => {
  try {
    const prompts = readPrompts();

    prompts.sort((a, b) => {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    res.json(prompts);
  } catch (error) {
    next(error);
  }
});

// ---------- GET: Load one prompt ----------
app.get("/api/prompts/:id", (req, res, next) => {
  try {
    const prompts = readPrompts();

    const prompt = prompts.find(
      (item) => String(item.id) === String(req.params.id)
    );

    if (!prompt) {
      return res.status(404).json({
        success: false,
        error: "Prompt not found."
      });
    }

    res.json(prompt);
  } catch (error) {
    next(error);
  }
});

// ---------- POST: Publish a prompt ----------
app.post("/api/prompts", upload.single("image"), (req, res, next) => {
  try {
    const title = String(req.body.title || "").trim();
    const promptText = String(
      req.body.prompt || req.body.promptText || ""
    ).trim();

    const category = String(req.body.category || "Other").trim();
    const creator = String(req.body.creator || "Anonymous").trim();

    let tags = req.body.tags || [];

    if (typeof tags === "string") {
      tags = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
    } else if (!Array.isArray(tags)) {
      tags = [];
    }

    if (!title) {
      return res.status(400).json({
        success: false,
        error: "Please enter a title."
      });
    }

    if (!promptText) {
      return res.status(400).json({
        success: false,
        error: "Please enter the prompt text."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "Please select an image."
      });
    }

    const prompts = readPrompts();

    const newPrompt = {
      id: Date.now() + "-" + crypto.randomBytes(4).toString("hex"),
      title,
      prompt: promptText,
      category: category || "Other",
      tags,
      creator: creator || "Anonymous",
      image: "/uploads/" + req.file.filename,
      createdAt: new Date().toISOString(),
      likes: 0
    };

    prompts.unshift(newPrompt);
    savePrompts(prompts);

    return res.status(201).json({
      success: true,
      message: "Prompt published successfully.",
      prompt: newPrompt
    });
  } catch (error) {
    next(error);
  }
});

// ---------- DELETE: Delete a prompt ----------
app.delete("/api/prompts/:id", (req, res, next) => {
  try {
    const id = req.params.id;
    const prompts = readPrompts();

    const index = prompts.findIndex(
      (prompt) => String(prompt.id) === String(id)
    );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: `Prompt not found. ID: ${id}`
      });
    }

    const promptToDelete = prompts[index];

    const updatedPrompts = prompts.filter(
      (prompt) => String(prompt.id) !== String(id)
    );

    // Save the updated feed first.
    savePrompts(updatedPrompts);

    // Remove the associated image from public/uploads.
    if (
      promptToDelete.image &&
      promptToDelete.image.startsWith("/uploads/")
    ) {
      const filename = path.basename(promptToDelete.image);
      const imagePath = path.join(UPLOAD_DIR, filename);

      try {
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      } catch (imageError) {
        console.error("Could not delete image file:", imageError);
      }
    }

    return res.json({
      success: true,
      message: "Prompt deleted successfully.",
      id
    });
  } catch (error) {
    next(error);
  }
});

// ---------- POST: Like a prompt ----------
app.post("/api/prompts/:id/like", (req, res, next) => {
  try {
    const id = req.params.id;
    const prompts = readPrompts();

    const prompt = prompts.find(
      (item) => String(item.id) === String(id)
    );

    if (!prompt) {
      return res.status(404).json({
        success: false,
        error: "Prompt not found."
      });
    }

    prompt.likes = Number(prompt.likes || 0) + 1;
    savePrompts(prompts);

    return res.json({
      success: true,
      likes: prompt.likes
    });
  } catch (error) {
    next(error);
  }
});

// ---------- API 404 handler ----------
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    error: `API route not found: ${req.method} ${req.originalUrl}`
  });
});

// ---------- Website fallback ----------
app.use((req, res) => {
  res.status(404).send("Page not found.");
});

// ---------- Error handler ----------
app.use((error, req, res, next) => {
  console.error("SERVER ERROR:", error);

  if (res.headersSent) {
    return next(error);
  }

  const status = error instanceof multer.MulterError ? 400 : 500;

  return res.status(status).json({
    success: false,
    error: error.message || "Internal server error."
  });
});

// ---------- Start server ----------
app.listen(PORT, () => {
  console.log("------------------------------------");
  console.log("PromptVerse server is running!");
  console.log(`Website: http://localhost:${PORT}`);
  console.log(`API:     http://localhost:${PORT}/api/prompts`);
  console.log("------------------------------------");
});

app.delete("/api/prompts/:id", (req, res, next) => {
  try {
    const id = req.params.id;
    const prompts = readPrompts();

    const index = prompts.findIndex(
      (prompt) => String(prompt.id) === String(id)
    );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: `Prompt not found. ID: ${id}`
      });
    }

    const deletedPrompt = prompts[index];

    prompts.splice(index, 1);
    savePrompts(prompts);

    if (
      deletedPrompt.image &&
      deletedPrompt.image.startsWith("/uploads/")
    ) {
      const filename = path.basename(deletedPrompt.image);
      const imagePath = path.join(UPLOAD_DIR, filename);

      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    return res.json({
      success: true,
      message: "Prompt deleted successfully.",
      id
    });
  } catch (error) {
    next(error);
  }
});