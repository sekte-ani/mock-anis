require("dotenv").config();

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 4500;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const BASE_IMAGE_URL =
  process.env.BASE_IMAGE_URL || "https://anismockup.anitech.id";

const sektorPrefix = {
  Kuliner: "mkl",
  Perdagangan: "mpd",
  "Kesehatan Kecantikan": "mks",
  Pendidikan: "mpn",
  "Jasa Profesional": "mjs",
  "Pemerintah dan Sosial": "mpmt",
  Keuangan: "mkeu",
  Logistik: "mlg",
  "Kreatif dan Digital": "mkr",
  "Gaya Hidup": "mgl",
  Agrikultur: "mag",
  Otomotif: "mot",
};

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Serve gambar
app.use("/img", express.static(path.join(__dirname, "public/img")));

// Storage config — simpan di public/img/<sektor>/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sektor = getSektorForStorage(req);
    if (!sektor) {
      cb(
        new Error(
          "Sektor upload tidak ditemukan. Pastikan header x-sektor atau field sektor terkirim.",
        ),
      );
      return;
    }

    const dir = path.join(__dirname, "public/img", sektor);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}${path.extname(file.originalname)}`);
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

app.get("/api/mock-id/next", async (req, res) => {
  try {
    const sektor = normalizeString(req.query.sektor);
    if (!sektor) {
      return res.status(400).json({ error: "Parameter sektor wajib diisi" });
    }

    const prefix = getSektorPrefix(sektor);
    const result = await requestAppsScript({
      action: "next_mock_id",
      sektor,
      prefix,
    });

    const mockId = normalizeString(result.mock_id || result.mockId || result.id);
    if (!mockId) {
      throw new Error(
        "Apps Script belum mengembalikan mock_id. Pastikan action next_mock_id tersedia.",
      );
    }

    res.json({ success: true, mock_id: mockId, sektor });
  } catch (err) {
    console.error("Next ID error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Upload endpoint
app.post("/api/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: "File tidak ditemukan" });

    const mockId = normalizeString(req.body.mock_id);
    const namaMock = normalizeString(req.body.nama_mock);
    const sektor = normalizeString(req.body.sektor);
    const keywords = normalizeString(req.body.keywords);
    const sektorHeader = normalizeString(req.headers["x-sektor"]);

    if (!mockId || !namaMock || !sektor || !keywords) {
      return res.status(400).json({ error: "Semua field wajib diisi" });
    }

    if (sektorHeader && sektorHeader !== sektor) {
      return res.status(400).json({
        error: "Header x-sektor harus sama dengan field sektor",
      });
    }

    const sektorFolder = sanitizeSektorForPath(sektor);
    const imageURL = buildImageURL(sektorFolder, req.file.filename);

    // Kirim ke Google Apps Script → Sheets (dengan validasi unik di sana)
    const result = await requestAppsScript({
      action: "create_mock",
      mock_id: mockId,
      nama_mock: namaMock,
      sektor,
      keywords,
      path_image: imageURL,
    });

    const finalMockId =
      normalizeString(result.mock_id || result.mockId || result.id) || mockId;

    res.json({
      success: true,
      mock_id: finalMockId,
      nama_mock: namaMock,
      sektor,
      keywords,
      path_image: imageURL,
    });
  } catch (err) {
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupErr) {
        console.error("Gagal hapus file upload saat rollback:", cleanupErr);
      }
    }
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

function normalizeString(value) {
  if (Array.isArray(value)) {
    return String(value[0] || "").trim();
  }
  if (value == null) return "";
  return String(value).trim();
}

function getSektorPrefix(sektor) {
  return sektorPrefix[sektor] || "mxx";
}

function sanitizeSektorForPath(sektor) {
  return sektor.replace(/[\\/]/g, "-").trim();
}

function getSektorForStorage(req) {
  const headerSektor = normalizeString(req.headers["x-sektor"]);
  const bodySektor = normalizeString(req.body?.sektor);
  const querySektor = normalizeString(req.query?.sektor);
  const rawSektor = headerSektor || bodySektor || querySektor;

  if (!rawSektor) return "";
  return sanitizeSektorForPath(rawSektor);
}

function buildImageURL(sektor, filename) {
  return `${BASE_IMAGE_URL}/img/${encodeURIComponent(sektor)}/${encodeURIComponent(filename)}`;
}

async function requestAppsScript(payload) {
  if (!APPS_SCRIPT_URL) {
    throw new Error("APPS_SCRIPT_URL belum dikonfigurasi");
  }

  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Apps Script error status ${res.status}`);
  }

  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      "Response Apps Script bukan JSON. Pastikan action API sudah di-deploy.",
    );
  }

  if (parsed && parsed.success === false) {
    throw new Error(parsed.error || "Request ke Apps Script gagal");
  }
  return parsed || {};
}

app.listen(PORT, () => {
  console.log(`Mockup Admin running at http://localhost:${PORT}`);
});
