const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');

const infoModal = document.getElementById('info-modal');
const subcategoryButtons = document.getElementById('subcategory-buttons');
const jewelryOptions = document.getElementById('jewelry-options');

let earringImg = null, necklaceImg = null, braceletImg = null, ringImg = null;
let currentType = '';
let smoothedFaceLandmarks = null;
let smoothedHandLandmarks = null;
let camera;
let userMobile = null;

// Smoothed points
let smoothedHandPoints = {};
let smoothedFacePoints = {};

// ================== CONFIG ==================
const API_KEY = "AIzaSyA1JCqs3gl6TMVz1cwPIsTD2sefDPRr8OY"; 
const SHEET_API_URL = "https://script.google.com/macros/s/AKfycby7wPVQtyWQpM7-kUJ9kL9W6rrzKjm-XHviv3TPBjb42Rz082p0Kqc8GiVRr7uo8iqJvA/exec";

const driveFolders = {
  gold_earrings: "16wvDBpxaMgObqTQBxpM0PH1OAZbcNXcj",
  gold_necklaces: "1csT7TYA8lMbyuuIYAk2cMVYK9lRIT5Gz",
  diamond_earrings: "1K7Vv-FBFhtq6r-UsZGG3f3CpWZ0d49Ys",
  diamond_necklaces: "1csT7TYA8lMbyuuIYAk2cMVYK9lRIT5Gz",
  bracelet: "1N0xOM5Vih_6hEirRSyMkswxVqmWzD2yH",
  ring: "1NT1iOKj8FSJgwGVF41ngPqsh7UAX6Ykw",
};

// ================== GOOGLE DRIVE FETCH ==================
async function fetchDriveImages(folderId) {
  const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&key=${API_KEY}&fields=files(id,name,mimeType)`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.files) return [];
  return data.files.filter(f => f.mimeType.includes("image/"))
    .map(f => ({
      id: f.id,
      name: f.name,
      src: `https://drive.google.com/thumbnail?id=${f.id}&sz=w1000`
    }));
}

// ================== SHEET LOGGING ==================
async function logActivity(itemName) {
  if (!userMobile) return;
  try {
    const res = await fetch(SHEET_API_URL, {
      method: "POST",
      body: JSON.stringify({ mobile: userMobile, item: itemName }),
      headers: { "Content-Type": "application/json" }
    });
    console.log("Log response:", await res.text());
  } catch (err) {
    console.error("Error logging activity:", err);
  }
}

function startApp() {
  const input = document.getElementById('mobile-input').value.trim();
  if (!input) {
    alert("Please enter your mobile number.");
    return;
  }
  userMobile = input;
  document.getElementById('phone-gate').style.display = 'none';
  document.getElementById('app-content').style.display = 'block';
  logActivity("App Opened");
  startCamera('user');
}

// ================== IMAGE HANDLING ==================
async function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function changeJewelry(type, src) {
  const img = await loadImage(src);
  if (!img) return;
  earringImg = necklaceImg = braceletImg = ringImg = null;
  if (type.includes('earrings')) earringImg = img;
  else if (type.includes('necklaces')) necklaceImg = img;
  else if (type.includes('bracelet')) braceletImg = img;
  else if (type.includes('ring')) ringImg = img;
}

// ================== CATEGORY ==================
function toggleCategory(category) {
  jewelryOptions.style.display = 'none';
  subcategoryButtons.style.display = 'none';
  currentType = category;
  const isAccessory = ['bracelet', 'ring'].includes(category);
  if (isAccessory) {
    insertJewelryOptions(category, 'jewelry-options');
    jewelryOptions.style.display = 'flex';
    startCamera('environment');
  } else {
    subcategoryButtons.style.display = 'flex';
    startCamera('user');
  }
}

function selectJewelryType(mainType, subType) {
  currentType = `${subType}_${mainType}`;
  subcategoryButtons.style.display = 'none';
  jewelryOptions.style.display = 'flex';
  insertJewelryOptions(currentType, 'jewelry-options');
}

async function insertJewelryOptions(type, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (!driveFolders[type]) return;
  const images = await fetchDriveImages(driveFolders[type]);
  images.forEach((file, i) => {
    const btn = document.createElement('button');
    const img = document.createElement('img');
    img.src = file.src;
    img.alt = `${type} ${i + 1}`;
    btn.appendChild(img);
    btn.onclick = () => {
      changeJewelry(type, file.src);
      logActivity(`${type} - ${file.name}`);
    };
    container.appendChild(btn);
  });
}

// ================== MEDIAPIPE ==================
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });

const hands = new Hands({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });

hands.onResults((r) => smoothedHandLandmarks = r.multiHandLandmarks?.length ? r.multiHandLandmarks : null);

faceMesh.onResults((r) => {
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  if (r.multiFaceLandmarks?.length) {
    const newLandmarks = r.multiFaceLandmarks[0];
    if (!smoothedFaceLandmarks) smoothedFaceLandmarks = newLandmarks;
    else {
      const alpha = 0.2;
      smoothedFaceLandmarks = smoothedFaceLandmarks.map((p, i) => ({
        x: p.x * (1 - alpha) + newLandmarks[i].x * alpha,
        y: p.y * (1 - alpha) + newLandmarks[i].y * alpha,
        z: p.z * (1 - alpha) + newLandmarks[i].z * alpha,
      }));
    }
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
    width: 1280, height: 720, facingMode
  });
  camera.start();
}

videoElement.addEventListener('loadedmetadata', () => {
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;
});

function smoothPoint(prev, cur, alpha = 0.4) {
  if (!prev) return cur;
  return { x: prev.x * (1 - alpha) + cur.x * alpha, y: prev.y * (1 - alpha) + cur.y * alpha };
}

// ================== DRAW ==================
function drawJewelry(faceLandmarks, handLandmarks, ctx) {
  const eScale = 0.078, nScale = 0.252, bScale = 0.28, rScale = 0.1;
  if (faceLandmarks) {
    const L = faceLandmarks[132], R = faceLandmarks[361], N = faceLandmarks[152];
    let left = { x: L.x * canvasElement.width - 6, y: L.y * canvasElement.height - 16 };
    let right = { x: R.x * canvasElement.width + 6, y: R.y * canvasElement.height - 16 };
    let neck = { x: N.x * canvasElement.width - 8, y: N.y * canvasElement.height + 10 };
    smoothedFacePoints.leftEar = smoothPoint(smoothedFacePoints.leftEar, left);
    smoothedFacePoints.rightEar = smoothPoint(smoothedFacePoints.rightEar, right);
    smoothedFacePoints.neck = smoothPoint(smoothedFacePoints.neck, neck);
    if (earringImg) {
      const w = earringImg.width * eScale, h = earringImg.height * eScale;
      ctx.drawImage(earringImg, smoothedFacePoints.leftEar.x - w/2, smoothedFacePoints.leftEar.y, w, h);
      ctx.drawImage(earringImg, smoothedFacePoints.rightEar.x - w/2, smoothedFacePoints.rightEar.y, w, h);
    }
    if (necklaceImg) {
      const w = necklaceImg.width * nScale, h = necklaceImg.height * nScale;
      ctx.drawImage(necklaceImg, smoothedFacePoints.neck.x - w/2, smoothedFacePoints.neck.y, w, h);
    }
  }
  if (handLandmarks) {
    handLandmarks.forEach((hand, idx) => {
      const wrist = { x: hand[0].x * canvasElement.width, y: hand[0].y * canvasElement.height };
      const finger = { x: hand[9].x * canvasElement.width, y: hand[9].y * canvasElement.height };
      const angle = Math.atan2(finger.y - wrist.y, finger.x - wrist.x);
      if (braceletImg) {
        const w = braceletImg.width * bScale, h = braceletImg.height * bScale;
        const key = `bracelet_${idx}`;
        smoothedHandPoints[key] = smoothPoint(smoothedHandPoints[key], wrist);
        ctx.save();
        ctx.translate(smoothedHandPoints[key].x, smoothedHandPoints[key].y);
        ctx.rotate(angle + Math.PI/2);
        ctx.drawImage(braceletImg, -w/2, -h/2, w, h);
        ctx.restore();
      }
      if (ringImg) {
        const base = { x: hand[13].x * canvasElement.width, y: hand[13].y * canvasElement.height };
        const knuckle = { x: hand[14].x * canvasElement.width, y: hand[14].y * canvasElement.height };
        let cur = { x: (base.x + knuckle.x)/2, y: (base.y + knuckle.y)/2 };
        const key = `ring_${idx}`;
        smoothedHandPoints[key] = smoothPoint(smoothedHandPoints[key], cur);
        const w = ringImg.width * rScale, h = ringImg.height * rScale;
        ctx.drawImage(ringImg, smoothedHandPoints[key].x - w/2, smoothedHandPoints[key].y - h/2, w, h);
      }
    });
  }
}

// Info modal
function toggleInfoModal() { infoModal.open ? infoModal.close() : infoModal.showModal(); }
