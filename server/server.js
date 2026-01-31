const WebSocket = require("ws");
const http = require("http");
const { createCanvas } = require("canvas");

// =====================================================
// ESTADO GLOBAL
// =====================================================
let lastFrame = null;       // último frame recibido (base64 JPEG de la web)
let lastPNG   = null;       // ese mismo frame pero como PNG buffer
const captureClients = new Set();

// =====================================================
// DECODIFICAR JPEG → PNG
// Roblox 2021 necesita imágenes PNG, no bytes RGBA crudos
// =====================================================
const IMG_WIDTH  = 1920;  // mismo tamaño que tu ImageLabel
const IMG_HEIGHT = 1080;

async function convertJpegToPNG(base64Jpeg) {
  try {
    const canvas = createCanvas(IMG_WIDTH, IMG_HEIGHT);
    const ctx = canvas.getContext("2d");
    
    // Cargar la imagen JPEG
    const { Image } = require("canvas");
    const img = new Image();
    
    // Convertir base64 a buffer
    const imgBuf = Buffer.from(base64Jpeg, "base64");
    img.src = imgBuf;
    
    // Dibujar en el canvas
    ctx.drawImage(img, 0, 0, IMG_WIDTH, IMG_HEIGHT);
    
    // Convertir a PNG buffer
    return canvas.toBuffer("image/png");
  } catch(e) {
    console.error("Error convirtiendo JPEG a PNG:", e.message);
    return null;
  }
}

// =====================================================
// SERVIDOR HTTP
// =====================================================
const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split("?")[0];

  // --------------------------------------------------
  // GET /frame.png  →  retorna imagen PNG
  // Roblox carga esto directamente en el ImageLabel
  // --------------------------------------------------
  if (urlPath === "/frame.png" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    });

    if (lastPNG) {
      res.end(lastPNG);
    } else {
      // Si no hay frame, crear una imagen negra
      const canvas = createCanvas(IMG_WIDTH, IMG_HEIGHT);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, IMG_WIDTH, IMG_HEIGHT);
      
      // Texto de "esperando..."
      ctx.fillStyle = "#00f0ff";
      ctx.font = "48px Arial";
      ctx.textAlign = "center";
      ctx.fillText("Esperando captura...", IMG_WIDTH / 2, IMG_HEIGHT / 2);
      
      res.end(canvas.toBuffer("image/png"));
    }
    return;
  }

  // --------------------------------------------------
  // GET /status  →  info del servidor
  // --------------------------------------------------
  if (urlPath === "/status" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({
      status: "online",
      hasFrame: !!lastFrame,
      captureConnected: captureClients.size > 0,
      resolution: { width: IMG_WIDTH, height: IMG_HEIGHT },
    }));
    return;
  }

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    });
    res.end();
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

// =====================================================
// WEBSOCKET — recibe frames de la web capturadora
// =====================================================
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("✅ Cliente WebSocket conectado");
  captureClients.add(ws);

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "frame") {
        lastFrame = data.payload;  // guardar el base64 JPEG

        // Convertir a PNG para Roblox
        const png = await convertJpegToPNG(data.payload);
        if (png) {
          lastPNG = png;
          console.log("✅ Frame convertido a PNG (" + png.length + " bytes)");
        }
      }
    } catch (e) {
      console.error("Error parsing WebSocket message:", e.message);
    }
  });

  ws.on("close", () => {
    console.log("❌ Cliente desconectado");
    captureClients.delete(ws);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
    captureClients.delete(ws);
  });
});

// =====================================================
// INICIAR
// =====================================================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Servidor iniciado en el puerto ${PORT}`);
  console.log(`📷 GET /frame.png → imagen PNG (${IMG_WIDTH}x${IMG_HEIGHT})`);
  console.log(`📊 GET /status   → info del servidor`);
});
