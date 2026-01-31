const WebSocket = require("ws");
const http = require("http");
const { createCanvas } = require("canvas");

// =====================================================
// ESTADO GLOBAL
// =====================================================
let lastFrame = null;       // último frame recibido (base64 JPEG de la web)
let lastRGBA  = null;       // ese mismo frame pero como buffer RGBA crudo
const captureClients = new Set();

// =====================================================
// DECODIFICAR JPEG → RGBA crudo
// Roblox necesita los bytes en formato RGBA para WritePixelsBuffer.
// Usamos la librería "canvas" (node-canvas) para decodificar el JPEG
// y extraer los pixels uno por uno.
// =====================================================
const IMG_WIDTH  = 320;  // ancho de la imagen que enviamos a Roblox
const IMG_HEIGHT = 180;  // alto  (16:9, resolución baja para que sea rápido)

async function decodeJpegToRGBA(base64Jpeg) {
  try {
    const canvas  = createCanvas(IMG_WIDTH, IMG_HEIGHT);
    const ctx     = canvas.getContext("2d");
    const imgBuf  = Buffer.from(base64Jpeg, "base64");
    // Crear una imagen a partir del buffer
    const { createImageFromBuffer } = require("canvas");
    // node-canvas no tiene createImageFromBuffer directamente, usamos otro enfoque
    // Guardamos en un buffer temporal y lo leemos con Image
    const { Image } = require("canvas");
    const img = new Image();
    img.src = imgBuf;
    // Dibujar la imagen redimensionada al canvas
    ctx.drawImage(img, 0, 0, IMG_WIDTH, IMG_HEIGHT);
    // Obtener los datos RGBA
    const imageData = ctx.getImageData(0, 0, IMG_WIDTH, IMG_HEIGHT);
    // imageData.data es un Uint8ClipArray con [R,G,B,A, R,G,B,A, ...]
    return Buffer.from(imageData.data);
  } catch(e) {
    console.error("Error decodificando JPEG a RGBA:", e.message);
    return null;
  }
}

// =====================================================
// SERVIDOR HTTP
// =====================================================
const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split("?")[0];

  // --------------------------------------------------
  // GET /frame  →  retorna los bytes RGBA crudos
  // Roblox hace polling aquí y descarga los pixels
  // --------------------------------------------------
  if (urlPath === "/frame" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",  // bytes crudos, no imagen
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "X-Image-Width": IMG_WIDTH.toString(),
      "X-Image-Height": IMG_HEIGHT.toString(),
    });

    if (lastRGBA) {
      res.end(lastRGBA);
    } else {
      // Si no hay frame aún, enviar un buffer negro (todos los pixels negros, alpha=255)
      const black = Buffer.alloc(IMG_WIDTH * IMG_HEIGHT * 4, 0);
      // Poner alpha a 255 en cada pixel
      for (let i = 3; i < black.length; i += 4) {
        black[i] = 255;
      }
      res.end(black);
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

        // Decodificar a RGBA para que Roblox pueda usarlo
        const rgba = await decodeJpegToRGBA(data.payload);
        if (rgba) {
          lastRGBA = rgba;
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
  console.log(`📷 GET /frame  → bytes RGBA (${IMG_WIDTH}x${IMG_HEIGHT})`);
  console.log(`📊 GET /status → info del servidor`);
});
