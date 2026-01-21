import "dotenv/config";
import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

const app = express();
app.set("trust proxy", 1);

cloudinary.config();
app.use(express.urlencoded({ extended: true }));

/* -----------------------------
   Limite 3 uploads / jour / IP
-------------------------------- */
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

/* -----------------------------
   Multer : JPG / PNG < 10 MB
-------------------------------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ["image/jpeg", "image/png"];
    if (!ok.includes(file.mimetype)) return cb(new Error("FORMAT_NOT_ALLOWED"));
    cb(null, true);
  },
});

/* -----------------------------
   Helpers
-------------------------------- */
const safe = (s) =>
  String(s || "")
    .trim()
    .replace(/[^\p{L}\p{N}\-_ ]/gu, "")
    .replace(/\s+/g, "_")
    .slice(0, 60);

/* -----------------------------
   Page formulaire
-------------------------------- */
function renderForm({ error = "" } = {}) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Envoyer une photo</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; max-width: 640px; margin: 40px auto; padding: 0 16px; }
  form { display: grid; gap: 14px; }
  input, button { padding: 12px; font-size: 16px; border: 1px solid #ccc; border-radius: 12px; }
  button { cursor: pointer; }
  .submit{ background-color: #ef5f60; color: white; border: none; border-radius: 10px;}
  .err { color: #b00020; background: #fff2f2; border: 1px solid #ffd0d0; padding: 12px; border-radius: 12px; margin-bottom: 10px;}
  .small { font-size: 13px; color: #555; }
  .pick-grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; }
  .header{display:block; width:100%; text-align:center;}
  .sub{color: #8f8f8fff}
  @media (max-width:520px){ .pick-grid{grid-template-columns:1fr;} }
  .file-label {
    padding: 14px;
    border: 1px dashed #ccc;
    border-radius: 12px;
    text-align: center;
    cursor: pointer;
    background: #fafafa;
  }
  .file-label:hover { background: #f0f0f0; }
  .preview { display:none; text-align:center; }
  .preview img { max-width:100%; max-height:280px; border-radius:12px; border:1px solid #ddd; }
</style>
</head>
<body>

<div class="header">
    <img src="https://cdn.prod.website-files.com/65a66d17d740f6ccfb7f289a/65a673f43ee0d57315632e33_logo-lacroixdeslandes.png" class="logo"/>
    <h2 >Jeu Concours 📸 Envoyez votre photo</h2>
</div>


${error ? `<div class="err">${error}</div>` : ""}

<form method="post" action="/upload" enctype="multipart/form-data">
  <input name="prenom" placeholder="Votre prénom*" required />

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

  <div id="file-name" class="small"></div>

  <div id="preview" class="preview">
    <img id="preview-img"/>
  </div>

  <div class="small">JPG / PNG — max 10 MB — 3 photos / jour</div>

  <button class="submit" type="submit">Envoyer</button>

  <p class="small sub">En soumettant votre photo, vous acceptez que celle-ci soit utilisée sur les réseaux sociaux, sur le site internet, ainsi que sur le flyer correspondant si vous êtes l'heureux gagnant.</p>
</form>

<script>
  const cam = document.getElementById("photo_camera");
  const lib = document.getElementById("photo_library");
  const fileName = document.getElementById("file-name");
  const preview = document.getElementById("preview");
  const img = document.getElementById("preview-img");

  function show(file) {
    fileName.textContent = file.name;
    const r = new FileReader();
    r.onload = e => { img.src = e.target.result; preview.style.display = "block"; };
    r.readAsDataURL(file);
  }

  cam.addEventListener("change", () => {
    if (cam.files.length) { lib.value=""; show(cam.files[0]); }
  });
  lib.addEventListener("change", () => {
    if (lib.files.length) { cam.value=""; show(lib.files[0]); }
  });
</script>

</body>
</html>`;
}

/* -----------------------------
   Page de remerciement
-------------------------------- */
function renderThankYou() {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Merci</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; max-width:640px; margin:0 auto; padding:60px 16px; text-align:center; }
  .box { border:1px solid #ddd; border-radius:20px; padding:40px 24px; }
  .emoji { font-size:56px; margin-bottom:12px; }
  h1 { margin-bottom:12px; }
  p { color:#444; }
</style>
</head>
<body>
  <div class="box">
    <div class="emoji">🙏</div>
    <h1>Merci pour votre participation !</h1>
    <p>Votre photo a bien été envoyée.</p>
    <p>Bonne chance et à très bientôt 🙂</p>
  </div>
</body>
</html>`;
}

/* -----------------------------
   Routes
-------------------------------- */
app.get("/", (req, res) => {
  res.type("html").send(renderForm());
});

app.post(
  "/upload",
  (req, res, next) => {
    if (getDailyCount(req) >= 3) {
      return res.status(429).type("html").send(
        renderForm({ error: "Limite atteinte : 3 photos maximum aujourd’hui. Reviens demain 🙂" })
      );
    }
    next();
  },
  upload.single("photo"),
  async (req, res) => {
    try {
      const { prenom } = req.body;
      const file = req.file;

      if (!prenom || !file) {
        return res.status(400).type("html").send(renderForm({ error: "Prénom et image requis." }));
      }

      const folder = process.env.CLOUDINARY_FOLDER || "uploads";
      const publicId = `${safe(prenom)}_${Date.now()}`;

      await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder, public_id: publicId, resource_type: "image", fetch_format: "auto", quality: "auto" },
          (err) => (err ? reject(err) : resolve())
        );
        stream.end(file.buffer);
      });

      incrementDailyCount(req);
      res.type("html").send(renderThankYou());
    } catch (err) {
      console.error(err);
      res.status(500).type("html").send(renderForm({ error: "Erreur lors de l’upload." }));
    }
  }
);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server listening on port", port));