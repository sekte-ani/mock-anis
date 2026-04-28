require("dotenv").config();

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 4500;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Serve gambar
app.use("/img", express.static(path.join(__dirname, "public/img")));

// Storage config — simpan di public/img/<sektor>/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sektor = req.body.sektor || "general";
    const fs = require("fs");
    const dir = path.join(__dirname, "public/img", sektor);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const mockId = req.body.mock_id || Date.now().toString();
    const ext = path.extname(file.originalname);
    cb(null, `${mockId}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Format tidak didukung. Gunakan JPG, PNG, atau WebP."));
  },
});

// Upload endpoint
app.post("/api/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: "File tidak ditemukan" });

    const { mock_id, nama_mock, sektor, keywords } = req.body;
    const imageURL = `https://anismockup.anitech.id/img/${sektor}/${req.file.filename}`;

    // Kirim ke Google Apps Script → Sheets
    await sendToSheets({
      mock_id,
      nama_mock,
      sektor,
      keywords,
      path_image: imageURL,
    });

    res.json({
      success: true,
      mock_id,
      nama_mock,
      sektor,
      keywords,
      path_image: imageURL,
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Kirim data ke Google Apps Script
function sendToSheets(data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);

    // Follow redirect dari Apps Script
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    function makeRequest(url) {
      const urlObj = new URL(url);
      const lib =
        urlObj.protocol === "https:" ? require("https") : require("http");

      const req = lib.request(urlObj, options, (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          // Follow redirect
          makeRequest(res.headers.location);
          return;
        }
        let responseData = "";
        res.on("data", (chunk) => (responseData += chunk));
        res.on("end", () => resolve(responseData));
      });

      req.on("error", reject);
      req.write(body);
      req.end();
    }

    makeRequest(APPS_SCRIPT_URL);
  });
}

app.listen(PORT, () => {
  console.log(`Mockup Admin running at http://localhost:${PORT}`);
});
