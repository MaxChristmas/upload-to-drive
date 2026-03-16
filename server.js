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
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
    max-width: 480px;
    margin: 0 auto;
    padding: 28px 20px 40px;
    background: #f5f5f5;
    min-height: 100vh;
  }
  .card {
    background: #fff;
    border-radius: 20px;
    padding: 28px 20px;
  }
  .header { text-align: center; margin-bottom: 24px; }
  .header img { max-width: 160px; height: auto; margin-bottom: 12px; }
  .header h2 { font-size: 20px; font-weight: 700; margin: 0; color: #1a1a1a; line-height: 1.3; }
  .header p { font-size: 14px; color: #777; margin: 6px 0 0; }

  form { display: grid; gap: 12px; }

  .input-wrap { position: relative; }
  input[type=text], input[type=tel] {
    width: 100%;
    padding: 14px;
    font-size: 16px;
    border: 1.5px solid #e0e0e0;
    border-radius: 14px;
    background: #fafafa;
    color: #1a1a1a;
    outline: none;
    transition: border-color .2s, box-shadow .2s;
    -webkit-appearance: none;
  }
  input[type=text]:focus, input[type=tel]:focus {
    border-color: #ef5f60;
    box-shadow: 0 0 0 3px rgba(239,95,96,0.12);
    background: #fff;
  }

  .section-label { font-size: 13px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 2px; }

  .pick-grid { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
  .file-label {
    padding: 20px 12px;
    border: 2px solid #e8e8e8;
    border-radius: 16px;
    text-align: center;
    cursor: pointer;
    background: #fafafa;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: border-color .15s, background .15s, transform .1s;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }
  .file-label .icon { font-size: 28px; line-height: 1; }
  .file-label strong { font-size: 13px; color: #1a1a1a; display: block; }
  .file-label span { font-size: 12px; color: #999; }
  .file-label:active { background: #ffeaea; border-color: #ef5f60; transform: scale(0.97); }
  .file-label.selected { background: #fff5f5; border-color: #ef5f60; }

  .preview { display:none; text-align:center; border-radius: 16px; overflow: hidden; border: 1.5px solid #e8e8e8; }
  .preview img { max-width:100%; max-height:260px; display:block; width:100%; object-fit:cover; }
  .preview-name { padding: 8px 12px; font-size: 13px; color: #666; background: #fafafa; }

  .hint { font-size: 12px; color: #aaa; text-align: center; }

  button.submit {
    background: #ef5f60;
    color: white;
    border: none;
    border-radius: 14px;
    padding: 16px;
    font-size: 17px;
    font-weight: 600;
    width: 100%;
    cursor: pointer;
    min-height: 54px;
    letter-spacing: .01em;
    transition: background .15s, transform .1s, box-shadow .15s;
    -webkit-tap-highlight-color: transparent;
    box-shadow: 0 4px 14px rgba(239,95,96,0.35);
  }
  button.submit:active { background: #d94f50; transform: scale(0.98); box-shadow: none; }

  .err {
    color: #b00020;
    background: #fff2f2;
    border: 1.5px solid #ffd0d0;
    padding: 14px;
    border-radius: 14px;
    font-size: 14px;
  }

  details {
    font-size: 12px;
    color: #aaa;
    border-top: 1px solid #f0f0f0;
    padding-top: 12px;
    margin-top: 4px;
  }
  details summary { cursor: pointer; color: #bbb; list-style: none; display: flex; align-items: center; gap: 6px; }
  details summary::before { content: "▸"; font-size: 10px; }
  details[open] summary::before { content: "▾"; }
  details p { margin: 10px 0 0; line-height: 1.6; color: #999; }
  details a { color: #ef5f60; }
</style>
</head>
<body>
<div class="card">

  <div class="header">
    <img src="https://cdn.prod.website-files.com/65a66d17d740f6ccfb7f289a/65a673f43ee0d57315632e33_logo-lacroixdeslandes.png" alt="La Croix des Landes"/>
    <h2>Jeu Concours 📸<br/>Envoyez votre photo</h2>
    <p>Participez et tentez de gagner !</p>
  </div>

  ${error ? `<div class="err">${error}</div>` : ""}

  <form method="post" action="/upload" enctype="multipart/form-data">

    <div class="input-wrap">
      <input type="text" name="prenom" placeholder="Votre prénom" required />
    </div>

    <div class="input-wrap">
      <input type="tel" name="telephone" placeholder="Votre numéro de téléphone" pattern="[\d\s.\-()+ ]{7,20}" title="Numéro de téléphone invalide" required />
    </div>

    <div class="section-label">Votre photo</div>

    <div class="pick-grid">
      <label for="photo_camera" class="file-label" id="label_camera">
        <span class="icon">📷</span>
        <strong>Prendre une photo</strong>
        <span>Caméra</span>
      </label>
      <label for="photo_library" class="file-label" id="label_library">
        <span class="icon">🖼️</span>
        <strong>Choisir une image</strong>
        <span>Galerie</span>
      </label>
    </div>

    <input id="photo_camera" type="file" name="photo" accept="image/jpeg,image/png" capture="environment" hidden />
    <input id="photo_library" type="file" name="photo" accept="image/jpeg,image/png" hidden />

    <div id="preview" class="preview">
      <img id="preview-img"/>
      <div id="file-name" class="preview-name"></div>
    </div>

    <div class="hint">JPG / PNG — max 10 MB — 3 participations / jour</div>

    <button class="submit" type="submit">Envoyer ma photo</button>

    <details>
      <summary>Informations RGPD</summary>
      <p>
        En soumettant votre photo, vous acceptez que celle-ci soit utilisée sur les réseaux sociaux, sur le site internet, ainsi que sur le flyer correspondant si vous êtes l'heureux gagnant.<br/><br/>
        Vos données personnelles (prénom et numéro de téléphone) sont utilisées uniquement pour vous contacter en cas de victoire. Elles sont intégrées dans le nom du fichier photo stocké sur nos serveurs.<br/><br/>
        Les photos non sélectionnées pour publication sont automatiquement supprimées de nos serveurs au bout d'un an.<br/><br/>
        Conformément au RGPD, vous disposez d'un droit d'accès, de rectification et de suppression de vos données en nous contactant directement via <a href="mailto:lacroixdeslandes@orange.fr">lacroixdeslandes@orange.fr</a>.
      </p>
    </details>

  </form>

</div>

<script>
  const cam = document.getElementById("photo_camera");
  const lib = document.getElementById("photo_library");
  const fileName = document.getElementById("file-name");
  const preview = document.getElementById("preview");
  const img = document.getElementById("preview-img");
  const labelCam = document.getElementById("label_camera");
  const labelLib = document.getElementById("label_library");

  function show(file, activeLabel, inactiveLabel) {
    fileName.textContent = file.name;
    const r = new FileReader();
    r.onload = e => { img.src = e.target.result; preview.style.display = "block"; };
    r.readAsDataURL(file);
    activeLabel.classList.add("selected");
    inactiveLabel.classList.remove("selected");
  }

  cam.addEventListener("change", () => {
    if (cam.files.length) { lib.value=""; show(cam.files[0], labelCam, labelLib); }
  });
  lib.addEventListener("change", () => {
    if (lib.files.length) { cam.value=""; show(lib.files[0], labelLib, labelCam); }
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
    <p>Pour améliorer vos chances de gagner, laissez-nous un petit commentaire sur Google. Ça nous aide beaucoup !!</p>
    <a href="https://www.google.com/search?sca_esv=96fddc6d6b8acd12&sxsrf=ANbL-n5Px1ogIIGuP_uIyD03Fv9mBmMG8A:1769163617951&si=AL3DRZEsmMGCryMMFSHJ3StBhOdZ2-6yYkXd_doETEE1OR-qObNRdYnoyOg6be55H8RrqwKC1qxDNBW-5Pi-NWDtx68lALVTGpzBLfh0lQXyP3_hQfU8hZLW3BhGEJyY7CcjN4-mhz3YU9Mb8SY1SHV5a704b2OZ6Q%3D%3D&q=La+croix+des+landes+Avis&sa=X&ved=2ahUKEwjFn_2HuKGSAxWMcKQEHa3XKc8Q0bkNegQIIhAH&biw=2304&bih=1144&dpr=1&aic=0">
      ⭐⭐⭐⭐⭐<br/> <span style="color:#555; font-size: 30px;">4,7/5</span><br/> <span style="color:#555; font-size: 20px;">sur 60 avis Google</span></a>
    <p style="font-size:20px;">Mille mercis.</p>
    <p>Toute l'équipe de La Croix Des Landes.</p>
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
      const { prenom, telephone } = req.body;
      const file = req.file;

      const phoneDigits = telephone.replace(/[\s.\-()]/g, "");
      if (!prenom || !telephone || !file) {
        return res.status(400).type("html").send(renderForm({ error: "Prénom, téléphone et image requis." }));
      }
      if (!/^(\+?\d{7,15})$/.test(phoneDigits)) {
        return res.status(400).type("html").send(renderForm({ error: "Numéro de téléphone invalide." }));
      }

      const folder = process.env.CLOUDINARY_FOLDER || "uploads";
      const publicId = `${safe(prenom)}_${safe(telephone)}_${Date.now()}`;

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