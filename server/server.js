const http = require("http");
const { createCanvas, Image } = require("canvas");

// =====================================================
// ESTADO GLOBAL
// =====================================================
let lastFrame = null;
let lastPNG   = null;

// =====================================================
// CONFIGURACIÓN
// =====================================================
const IMG_WIDTH  = 1920;
const IMG_HEIGHT = 1080;

// =====================================================
// CONVERTIR JPEG → PNG
// =====================================================
async function convertJpegToPNG(base64Jpeg) {
  try {
    const canvas = createCanvas(IMG_WIDTH, IMG_HEIGHT);
    const ctx = canvas.getContext("2d");
    
    const img = new Image();
    const imgBuf = Buffer.from(base64Jpeg, "base64");
    img.src = imgBuf;
    
    ctx.drawImage(img, 0, 0, IMG_WIDTH, IMG_HEIGHT);
    
    return canvas.toBuffer("image/png");
  } catch(e) {
    console.error("Error convirtiendo JPEG a PNG:", e.message);
    return null;
  }
}

// =====================================================
// LEER BODY DE POST REQUEST
// =====================================================
function getBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', reject);
  });
}

// =====================================================
// SERVIDOR HTTP
// =====================================================
const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split("?")[0];

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // OPTIONS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // POST /upload - recibe frames desde la web
  if (urlPath === "/upload" && req.method === "POST") {
    try {
      const body = await getBody(req);
      const data = JSON.parse(body);
      
      if (data.type === "frame" && data.payload) {
        lastFrame = data.payload;
        
        const png = await convertJpegToPNG(data.payload);
        if (png) {
          lastPNG = png;
          console.log("✅ Frame recibido y convertido (" + png.length + " bytes)");
        }
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } else {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Invalid data" }));
      }
    } catch(e) {
      console.error("Error en /upload:", e.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // GET /frame.png - Roblox descarga la imagen
  if (urlPath === "/frame.png" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    });

    if (lastPNG) {
      res.end(lastPNG);
    } else {
      const canvas = createCanvas(IMG_WIDTH, IMG_HEIGHT);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, IMG_WIDTH, IMG_HEIGHT);
      
      ctx.fillStyle = "#00f0ff";
      ctx.font = "48px Arial";
      ctx.textAlign = "center";
      ctx.fillText("Esperando captura...", IMG_WIDTH / 2, IMG_HEIGHT / 2);
      
      res.end(canvas.toBuffer("image/png"));
    }
    return;
  }

  // GET /status
  if (urlPath === "/status" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "application/json",
    });
    res.end(JSON.stringify({
      status: "online",
      hasFrame: !!lastFrame,
      resolution: { width: IMG_WIDTH, height: IMG_HEIGHT },
      method: "HTTP POST (no WebSocket)",
    }));
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

// =====================================================
// INICIAR SERVIDOR
// =====================================================
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor HTTP iniciado en el puerto ${PORT}`);
  console.log(`📷 GET  /frame.png → imagen PNG (${IMG_WIDTH}x${IMG_HEIGHT})`);
  console.log(`📤 POST /upload    → recibir frames`);
  console.log(`📊 GET  /status    → info del servidor`);
  console.log(`✅ Sin WebSocket - 100% compatible con Render Free`);
});
