const videoElement = document.getElementById("webcam");
const canvasElement = document.getElementById("overlay");
const canvasCtx = canvasElement.getContext("2d");

let earringImg = null, necklaceImg = null, braceletImg = null, ringImg = null;
let currentType = "";
let smoothedFaceLandmarks = null, smoothedHandLandmarks = null;
let camera;
let userMobile = null;

// ✅ Your Google Script Web App
const SHEET_API_URL =
  "https://script.google.com/macros/s/AKfycbw12g28dxHCra56ydaf-NJiLiDfbuSo049e0BvRhk6UPvE4xoLIocQrVaNtuSiMhBkMkQ/exec";

// ================== SHEET LOGGING ==================
async function logActivity(itemName) {
  if (!userMobile) return;
  try {
    const res = await fetch(SHEET_API_URL, {
      method: "POST",
      body: JSON.stringify({ mobile: userMobile, item: itemName }),
      headers: { "Content-Type": "application/json" },
    });
    const text = await res.text();
    console.log("Google Sheet log:", text);
    if (!res.ok || text.includes("Error")) {
      alert("❌ Failed to log activity.");
    }
  } catch (err) {
    console.error("Logging error:", err);
    alert("❌ Error connecting to Google Script.");
  }
}

function startApp() {
  const input = document.getElementById("mobile-input").value.trim();
  if (!input) {
    alert("Please enter your mobile number.");
    return;
  }
  userMobile = input;
  document.getElementById("phone-gate").style.display = "none";
  document.getElementById("app-content").style.display = "block";
  logActivity("App Opened");
  startCamera("user");
}

// ================== JEWELRY ==================
async function changeJewelry(type, src) {
  const img = new Image();
  img.src = src;
  await img.decode().catch(() => null);
  earringImg = necklaceImg = braceletImg = ringImg = null;
  if (type.includes("earrings")) earringImg = img;
  else if (type.includes("necklaces")) necklaceImg = img;
  else if (type.includes("bracelet")) braceletImg = img;
  else if (type.includes("ring")) ringImg = img;
  logActivity(`Tried: ${type}`);
}

function toggleCategory(category) {
  document.getElementById("jewelry-options").style.display = "none";
  document.getElementById("subcategory-buttons").style.display = "none";
  currentType = category;
  if (["bracelet", "ring"].includes(category)) {
    document.getElementById("jewelry-options").style.display = "flex";
    startCamera("environment");
  } else {
    document.getElementById("subcategory-buttons").style.display = "flex";
    startCamera("user");
  }
}

function selectJewelryType(mainType, subType) {
  currentType = `${subType}_${mainType}`;
  document.getElementById("subcategory-buttons").style.display = "none";
  document.getElementById("jewelry-options").style.display = "flex";
  changeJewelry(
    currentType,
    "https://dummyimage.com/200x200/ffb800/000000.png&text=Jewelry"
  );
}

// ================== MEDIAPIPE ==================
const faceMesh = new FaceMesh({
  locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`,
});
faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6,
});

const hands = new Hands({
  locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
});
hands.setOptions({
  maxNumHands: 2,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6,
});

hands.onResults((r) => (smoothedHandLandmarks = r.multiHandLandmarks || null));

faceMesh.onResults((r) => {
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  if (r.multiFaceLandmarks?.length) {
    smoothedFaceLandmarks = r.multiFaceLandmarks[0];
  } else smoothedFaceLandmarks = null;
  drawJewelry(smoothedFaceLandmarks, smoothedHandLandmarks, canvasCtx);
});

async function startCamera(facingMode) {
  if (camera) camera.stop();
  camera = new Camera(videoElement, {
    onFrame: async () => {
      await faceMesh.send({ image: videoElement });
      await hands.send({ image: videoElement });
    },
    width: 1280,
    height: 720,
    facingMode,
  });
  camera.start();
}

videoElement.addEventListener("loadedmetadata", () => {
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;
});

// ================== DRAW ==================
function drawJewelry(faceLandmarks, handLandmarks, ctx) {
  if (earringImg && faceLandmarks) {
    const l = faceLandmarks[132];
    const r = faceLandmarks[361];
    ctx.drawImage(
      earringImg,
      l.x * canvasElement.width - 20,
      l.y * canvasElement.height,
      40,
      40
    );
    ctx.drawImage(
      earringImg,
      r.x * canvasElement.width - 20,
      r.y * canvasElement.height,
      40,
      40
    );
  }
}

// ================== SNAPSHOT ==================
document.getElementById("snapshot-btn").addEventListener("click", () => {
  const snapshotCanvas = document.createElement("canvas");
  snapshotCanvas.width = videoElement.videoWidth;
  snapshotCanvas.height = videoElement.videoHeight;
  const ctx = snapshotCanvas.getContext("2d");
  ctx.drawImage(videoElement, 0, 0);
  ctx.drawImage(canvasElement, 0, 0);
  document.getElementById("snapshot-preview").src =
    snapshotCanvas.toDataURL("image/png");
  document.getElementById("snapshot-modal").style.display = "block";
});

function closeSnapshot() {
  document.getElementById("snapshot-modal").style.display = "none";
}
function downloadSnapshot() {
  const link = document.createElement("a");
  link.download = "snapshot.png";
  link.href = document.getElementById("snapshot-preview").src;
  link.click();
}

// Info Modal
function toggleInfoModal() {
  const modal = document.getElementById("info-modal");
  modal.open ? modal.close() : modal.showModal();
}
