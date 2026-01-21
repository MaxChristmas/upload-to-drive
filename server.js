import "dotenv/config";
import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

const app = express();
app.set("trust proxy", 1);

cloudinary.config();
app.use(express.urlencoded({ extended: true }));

/**
 * Limite 3 uploads / jour / IP (mémoire)
 */
const dailyCounts = new Map();

function getClientIp(req) {
  return (req.headers["x-forwarded-for"]?.toString().split(",")[0] || req.ip || "unknown").trim();
}
function todayKey(req) {
  return `${getClientIp(req)}:${new Date().toISOString().slice(0, 10)}`;
}
function getDailyCount(req) {
  return dailyCounts.get(todayKey(req)) || 0;
}
function incrementDailyCount(req) {
  const key = todayKey(req);
  dailyCounts.set(key, (dailyCounts.get(key) || 0) + 1);
}

/**
 * Multer : JPG / PNG < 10MB
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ["image/jpeg", "image/png"];
    if (!ok.includes(file.mimetype)) return cb(new Error("FORMAT_NOT_ALLOWED"));
    cb(null, true);
  },
});

const safe = (s) =>
  String(s || "")
    .trim()
    .replace(/[^\p{L}\p{N}\-_ ]/gu, "")
    .replace(/\s+/g, "_")
    .slice(0, 60);

/**
 * HTML page
 */
function renderPage({ error = "", info = "" } = {}) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Upload photo</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; max-width: 640px; margin: 40px auto; padding: 0 16px; }
  form { display: grid; gap: 12px; padding: 16px; border: 1px solid #ddd; border-radius: 12px; }
  input, button { padding: 10px; font-size: 16px; }
  button { cursor: pointer; }
  .small { color: #555; font-size: 13px; }
  .err { color: #b00020; background: #fff2f2; border: 1px solid #ffd0d0; padding: 10px; border-radius: 10px; }
  .ok  { color: #0a5; background: #f1fff7; border: 1px solid #c7f5dd; padding: 10px; border-radius: 10px; }
  .pick-grid { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
  @media (max-width:520px){ .pick-grid{grid-template-columns:1fr;} }
  .file-label {
    display: block;
    padding: 14px;
    border: 1px dashed #ccc;
    border-radius: 10px;
    cursor: pointer;
    background: #fafafa;
    text-align: center;
  }
  .file-label:hover { background: #f0f0f0; }
  .preview {
    display: none;
    margin-top: 10px;
    text-align: center;
  }
  .preview img {
    max-width: 100%;
    max-height: 280px;
    border-radius: 10px;
    border: 1px solid #ddd;
  }
</style>
</head>
<body>
<h1>Envoyer une photo</h1>

${error ? `<div class="err">${error}</div>` : ""}
${info ? `<div class="ok">${info}</div>` : ""}

<form method="post" action="/upload" enctype="multipart/form-data">
  <input name="prenom" placeholder="Prénom" required />

  <div class="pick-grid">
    <label for="photo_camera" class="file-label">
      📷 <strong>Prendre une photo</strong><br/>
      <span class="small">Caméra (mobile)</span>
    </label>

    <label for="photo_library" class="file-label">
      🖼️ <strong>Choisir une image</strong><br/>
      <span class="small">Galerie / fichiers</span>
    </label>
  </div>

  <input id="photo_camera" type="file" name="photo" accept="image/jpeg,image/png" capture="environment" hidden />
  <input id="photo_library" type="file" name="photo" accept="image/jpeg,image/png" hidden />

  <div id="file-name" class="small">Aucun fichier sélectionné</div>

  <div id="preview" class="preview">
    <img id="preview-img" />
  </div>

  <div class="small">JPG / PNG — max 10 MB — 3 photos / jour</div>

  <button type="submit">Envoyer</button>
</form>

<script>
  const cam = document.getElementById("photo_camera");
  const lib = document.getElementById("photo_library");
  const fileName = document.getElementById("file-name");
  const preview = document.getElementById("preview");
  const previewImg = document.getElementById("preview-img");

  function showPreview(file) {
    if (!file) return;
    fileName.textContent = file.name;
    const reader = new FileReader();
    reader.onload = e => {
      previewImg.src = e.target.result;
      preview.style.display = "block";
    };
    reader.readAsDataURL(file);
  }

  cam.addEventListener("change", () => {
    if (cam.files.length) {
      lib.value = "";
      showPreview(cam.files[0]);
    }
  });

  lib.addEventListener("change", () => {
    if (lib.files.length) {
      cam.value = "";
      showPreview(lib.files[0]);
    }
  });
</script>
</body>
</html>`;
}

app.get("/", (req, res) => {
  const remaining = Math.max(0, 3 - getDailyCount(req));
  res.type("html").send(renderPage({ info: `Il te reste ${remaining} envoi(s) aujourd’hui.` }));
});

app.post(
  "/upload",
  (req, res, next) => {
    if (getDailyCount(req) >= 3) {
      return res.status(429).type("html").send(renderPage({
        error: "Limite atteinte : 3 photos maximum aujourd’hui. Reviens demain 🙂"
      }));
    }
    next();
  },
  upload.single("photo"),
  async (req, res) => {
    try {
      const { prenom } = req.body;
      const file = req.file;
      if (!prenom || !file) {
        return res.status(400).type("html").send(renderPage({ error: "Prénom et image requis." }));
      }

      const folder = process.env.CLOUDINARY_FOLDER || "uploads";
      const publicId = `${safe(prenom)}_${Date.now()}`;

      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            public_id: publicId,
            resource_type: "image",
            fetch_format: "auto",
            quality: "auto",
          },
          (err, uploaded) => (err ? reject(err) : resolve(uploaded))
        );
        stream.end(file.buffer);
      });

      incrementDailyCount(req);
      const remaining = Math.max(0, 3 - getDailyCount(req));

      res.type("html").send(renderPage({
        info: `✅ Upload réussi ! Il te reste ${remaining} envoi(s) aujourd’hui.<br/>
        <a href="${result.secure_url}" target="_blank">Voir l’image</a>`
      }));
    } catch (err) {
      console.error(err);
      res.status(500).type("html").send(renderPage({ error: "Erreur lors de l’upload." }));
    }
  }
);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server listening on port", port));