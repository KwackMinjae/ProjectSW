/* --------------------------------------------------
   기본 설정
-------------------------------------------------- */
const API_BASE = "http://127.0.0.1:8100";
const storage = window.localStorage;

/* 사진 미리보기를 위한 util */
function dataURLtoBlob(dataURL) {
  const arr = dataURL.split(",");
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

/* --------------------------------------------------
   Pro 버전 헤어스타일 목록 (hair_style 값)
-------------------------------------------------- */
const HAIR_STYLES = [
  { id: "BuzzCut", label: "버즈컷 (BuzzCut)" },
  { id: "UnderCut", label: "언더컷 (UnderCut)" },
  { id: "Pompadour", label: "폼파드 (Pompadour)" },
  { id: "SlickBack", label: "포마드컷" },
  { id: "CurlyShag", label: "히피펌" },
  { id: "WavyShag", label: "웨이브 쉐그 (WavyShag)" },
  { id: "FauxHawk", label: "포호크 (FauxHawk)" },
  { id: "Spiky", label: "스파이키 (Spiky)" },
  { id: "CombOver", label: "콤오버 (CombOver)" },
  { id: "HighTightFade", label: "하이 타이트 페이드" },
  { id: "ManBun", label: "맨번 (ManBun)" },
  { id: "Afro", label: "아프로 (Afro)" },
  { id: "LowFade", label: "로우 페이드 (LowFade)" },
  { id: "UndercutLongHair", label: "언더컷 롱헤어" },
  { id: "TwoBlockHaircut", label: "투블럭 (TwoBlock)" },
  { id: "TexturedFringe", label: "쉐도우펌" },
  { id: "BluntBowlCut", label: "머쉬룸 컷 (BluntBowl)" },
  { id: "LongWavyCurtainBangs", label: "롱 웨이브 커튼뱅" },
  { id: "MessyTousled", label: "헝클어진 스타일" },
  { id: "CornrowBraids", label: "콘로우 브레이드" },
  { id: "LongHairTiedUp", label: "롱 헤어 묶음" },
  { id: "Middle-parted", label: "가르마펌" },
  { id: "ShortPixieWithShavedSides", label: "픽시컷 (옆머리 쉐이브)" },
  { id: "ShortNeatBob", label: "깔끔 단발 (Bob)" },
  { id: "DoubleBun", label: "더블 번" },
  { id: "Updo", label: "업두 (Updo)" },
  { id: "Spiked", label: "스파이크 업" },
  { id: "bowlCut", label: "보울컷 (bowlCut)" },
  { id: "Chignon", label: "쉬뇽 (Chignon)" },
  { id: "PixieCut", label: "픽시 컷" },
  { id: "SlickedBack", label: "슬릭백 (SlickedBack)" },
  { id: "LongCurly", label: "롱 컬리" },
  { id: "CurlyBob", label: "컬리 보브" }
];

let selectedHairStyle = HAIR_STYLES[0].id; // 기본값
let currentGLB = null;

/* --------------------------------------------------
   DOM 요소
-------------------------------------------------- */
const uploadBtnFace = document.getElementById("uploadBtnFace");
const fileInputFace = document.getElementById("fileInputFace");
const previewFace = document.getElementById("previewFace");
const preview2d = document.getElementById("preview2d");
const fuse2dBtn = document.getElementById("fuse2dBtn");
const convertBtn = document.getElementById("convertBtn");
const preview3d = document.getElementById("preview3d");
const reset3dBtn = document.getElementById("reset3dBtn");

const hairDropdown = document.getElementById("hairDropdown");
const hairDropdownToggle = document.getElementById("hairDropdownToggle");
const hairDropdownMenu = document.getElementById("hairDropdownMenu");
const hairDropdownLabel = document.getElementById("hairDropdownLabel");
const currentStyleInfo = document.getElementById("currentStyleInfo");

/* 썸네일 / 네비게이션(옵션) */
const filmstrip = document.getElementById("filmstrip");
const navPrev = document.getElementById("navPrev");
const navNext = document.getElementById("navNext");
const hudIndex = document.getElementById("hudIndex");
const visionSpot = document.getElementById("visionSpot");

let glbHistory = [];
let glbIndex = -1;

/* --------------------------------------------------
   헤어스타일 드롭다운 초기화
-------------------------------------------------- */
function initHairDropdown() {
  HAIR_STYLES.forEach((style, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hair-option";
    btn.dataset.hairStyle = style.id;
    btn.textContent = style.label;

    if (idx === 0) btn.classList.add("active");

    btn.addEventListener("click", () => {
      selectedHairStyle = style.id;

      hairDropdownLabel.textContent = style.label;
      currentStyleInfo.textContent = `선택된 스타일: ${style.label} (${style.id})`;

      document.querySelectorAll(".hair-option").forEach((b) =>
        b.classList.remove("active")
      );
      btn.classList.add("active");

      hairDropdown.classList.remove("open");

      if (storage.getItem("imgFace")) {
        fuse2dBtn.disabled = false;
      }

      console.log("[선택된 헤어스타일]", selectedHairStyle);
    });

    hairDropdownMenu.appendChild(btn);
  });

  hairDropdownLabel.textContent = HAIR_STYLES[0].label;
  currentStyleInfo.textContent = `선택된 스타일: ${HAIR_STYLES[0].label} (${HAIR_STYLES[0].id})`;

  hairDropdownToggle.addEventListener("click", () => {
    hairDropdown.classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    if (!hairDropdown.contains(e.target)) {
      hairDropdown.classList.remove("open");
    }
  });
}

/* --------------------------------------------------
   얼굴 업로드
-------------------------------------------------- */
uploadBtnFace.addEventListener("click", () => fileInputFace.click());

fileInputFace.addEventListener("change", () => {
  const file = fileInputFace.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const dataURL = reader.result;
    storage.setItem("imgFace", dataURL);

    previewFace.style.backgroundImage = `url('${dataURL}')`;
    previewFace.classList.add("has-image");

    if (selectedHairStyle) {
      fuse2dBtn.disabled = false;
    }
  };
  reader.readAsDataURL(file);
});

/* --------------------------------------------------
   1. 2D 합성하기 (AILab Pro)
-------------------------------------------------- */
fuse2dBtn.addEventListener("click", async () => {
  const faceDataURL = storage.getItem("imgFace");

  if (!faceDataURL) {
    alert("먼저 얼굴 사진을 업로드해 주세요.");
    return;
  }

  fuse2dBtn.disabled = true;
  const originalText = fuse2dBtn.textContent;
  fuse2dBtn.textContent = "2D 합성 중...";

  try {
    const blob = dataURLtoBlob(faceDataURL);
    const formData = new FormData();
    formData.append("file", blob, "face.jpg");
    formData.append("hair_style", selectedHairStyle);

    const res = await fetch(`${API_BASE}/fusion/hair`, {
      method: "POST",
      body: formData
    });

    const data = await res.json();
    console.log("[2D 응답]:", data);

    if (!res.ok) throw new Error(data.detail || "2D 합성 실패");

    let fusedPath = data.fused_image_url;
    if (!fusedPath) throw new Error("백엔드에서 fused_image_url을 반환하지 않음");

    fusedPath = fusedPath.replace(/\\/g, "/");

    let fusedURL = fusedPath;
    if (!fusedURL.startsWith("http")) {
      if (!fusedURL.startsWith("/")) fusedURL = "/" + fusedURL;
      fusedURL = API_BASE + fusedURL;
    }
    console.log("[2D 최종URL]", fusedURL);

    const imgRes = await fetch(fusedURL);
    if (!imgRes.ok) {
      throw new Error(`합성 이미지 요청 실패: ${imgRes.status}`);
    }
    const fusedBlob = await imgRes.blob();

    const reader = new FileReader();
    reader.onload = () => {
      const fusedDataURL = reader.result;

      storage.setItem("img2d", fusedDataURL);

      preview2d.style.backgroundImage = `url('${fusedDataURL}')`;
      preview2d.classList.add("has-image");

      const lbl = preview2d.querySelector(".convert-label");
      if (lbl) lbl.remove();

      convertBtn.disabled = false;
    };
    reader.readAsDataURL(fusedBlob);
  } catch (err) {
    console.error(err);
    alert("2D 합성 중 오류가 발생했습니다. 콘솔을 확인해 주세요.");
  } finally {
    fuse2dBtn.disabled = false;
    fuse2dBtn.textContent = originalText;
  }
});

/* --------------------------------------------------
   2. 3D 변환 (Meshy)
-------------------------------------------------- */
convertBtn.addEventListener("click", async () => {
  const img2d = storage.getItem("img2d");
  if (!img2d) return alert("먼저 2D 합성을 완료해 주세요.");

  convertBtn.disabled = true;
  const original = convertBtn.textContent;
  convertBtn.textContent = "3D 변환 중...";

  try {
    const blob = dataURLtoBlob(img2d);

    const formData = new FormData();
    formData.append("file", blob, "fused.jpg");
    formData.append("hair_style", selectedHairStyle);

    const res = await fetch(`${API_BASE}/fusion/full`, {
      method: "POST",
      body: formData
    });

    const data = await res.json();
    console.log("[3D task 생성응답]:", data);

    if (!res.ok) throw new Error(data.detail || "3D 생성 실패");

    const taskId = data.task_id;
    await pollMeshy(taskId);
  } catch (err) {
    console.error(err);
    alert("3D 변환 중 오류가 발생했습니다.");
  } finally {
    convertBtn.disabled = false;
    convertBtn.textContent = original;
  }
});

/* --------------------------------------------------
   Meshy 폴링 + 진행률 표시
-------------------------------------------------- */
async function pollMeshy(taskId) {
  let done = false;
  let fakeProgress = 0; // Meshy가 progress 안 줄 때를 위한 가짜 진행률

  // 진행률 바 DOM이 없으면 여기서 자동 생성
  let progressWrap = document.getElementById("progressWrap");
  if (!progressWrap && preview3d) {
    progressWrap = document.createElement("div");
    progressWrap.id = "progressWrap";
    progressWrap.className = "progress-wrap";
    progressWrap.innerHTML = `
      <div class="progress-bar">
        <div id="progressInner" class="progress-inner"></div>
      </div>
      <span id="progressLabel" class="progress-label">0%</span>
    `;

    // 3D 버튼 바로 아래에 삽입
    const btnRow = convertBtn.parentElement;
    if (btnRow && btnRow.parentElement) {
      btnRow.parentElement.insertBefore(progressWrap, btnRow.nextSibling);
    } else if (preview3d.parentElement) {
      preview3d.parentElement.appendChild(progressWrap);
    }
  }

  const progressBar = document.getElementById("progressInner");
  const progressLabel = document.getElementById("progressLabel");

  preview3d.innerHTML = "<p class='convert-label'>3D 모델 생성 중...</p>";

  while (!done) {
    const res = await fetch(`${API_BASE}/fusion/meshify/${taskId}`);
    const data = await res.json();
    console.log("[Meshy 상태]", data);

    // Meshy 원본 데이터 안의 progress 값 추출
    let rawProgress = 0;
    if (typeof data.progress === "number") {
      rawProgress = data.progress;
    } else if (data.task && typeof data.task.progress === "number") {
      rawProgress = data.task.progress;
    }

    let status = "";
    if (data.status) status = data.status;
    else if (data.task && data.task.status) status = data.task.status;
    status = (status || "").toLowerCase();

    // 보여줄 진행률 계산
    let displayProgress = rawProgress;

    // progress가 0이고 상태가 진행 중이면 가짜 진행률로라도 올려 줌
    if ((displayProgress === 0 || isNaN(displayProgress)) && status === "in_progress") {
      fakeProgress = Math.min(fakeProgress + 4, 90); // 2초마다 4%씩 → 대략 1분에 100% 근처
      displayProgress = fakeProgress;
    } else if (rawProgress > 0) {
      displayProgress = rawProgress;
      fakeProgress = rawProgress;
    }

    displayProgress = Math.max(0, Math.min(100, displayProgress));

    if (progressBar) {
      progressBar.style.width = `${displayProgress}%`;
    }
    if (progressLabel) {
      progressLabel.textContent = `${Math.round(displayProgress)}%`;
    }

    // 상태 체크
    if (status === "succeeded" && data.glb_url) {
      if (progressBar) progressBar.style.width = "100%";
      if (progressLabel) progressLabel.textContent = "100%";

      done = true;
      glbHistory.push(data.glb_url);
      glbIndex = glbHistory.length - 1;
      updateHud();
      renderFilmstrip();
      loadGLB(data.glb_url);
      break;
    }

    if (status === "failed") {
      alert("3D 모델 생성 실패");
      return;
    }

    await new Promise((r) => setTimeout(r, 2000));
  }
}

/* --------------------------------------------------
   3D GLB 로딩 (Three.js) + 자동 회전
-------------------------------------------------- */
function loadGLB(url) {
  preview3d.innerHTML = "";
  preview3d.classList.add("has-image");

  if (!window.THREE) {
    preview3d.innerHTML =
      "<p style='color:red'>Three.js가 로드되지 않았습니다.</p>";
    return;
  }

  const width  = preview3d.clientWidth  || 600;
  const height = preview3d.clientHeight || 340;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);

  // 카메라: 약간 위에서, 조금 더 가까이
  camera.position.set(0, 1.4, 2.7);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  preview3d.appendChild(renderer.domElement);

  // ==== 조명: 전체적으로 더 밝게 ====
  // 앞에서 쏘는 메인 라이트 (조금 더 강하게)
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
  keyLight.position.set(3, 6, 5);
  scene.add(keyLight);

  // 뒤/옆에서 채워주는 라이트
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.45);
  rimLight.position.set(-3, 3, -4);
  scene.add(rimLight);

  // 전체 밝기 올라가도록 AmbientLight도 세게
  const amb = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(amb);
  // ================================

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;

  // 자동 회전 플래그
  let isUserInteracting = false;
  let autoRotateSpeed = 0.4;

  renderer.domElement.addEventListener("mousedown", () => {
    isUserInteracting = true;
  });
  renderer.domElement.addEventListener("mouseup", () => {
    isUserInteracting = false;
  });
  renderer.domElement.addEventListener("mouseleave", () => {
    isUserInteracting = false;
  });

  const loader = new THREE.GLTFLoader();
  loader.load(
    `${API_BASE}/fusion/mesh-view?glb_url=${encodeURIComponent(url)}`,
    (glb) => {
      currentGLB = glb.scene;

      // ───────────── 모델 크기 / 위치 보정 ─────────────
      const box = new THREE.Box3().setFromObject(glb.scene);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      // 중심을 (0,0,0) 근처로 이동
      glb.scene.position.sub(center);

      // 프리뷰 안에서 모델을 조금 "위로" 올리기
      glb.scene.position.y += 0.55;   // 숫자 키우면 더 위로 올라감

      // 최대 길이를 기준으로 적당한 높이로 스케일링
      const maxDim = Math.max(size.x, size.y, size.z);
      const desiredHeight = 2.4;
      const scale = desiredHeight / maxDim;
      glb.scene.scale.setScalar(scale);

      scene.add(glb.scene);

      // 카메라가 위쪽(얼굴 쪽)을 더 보도록 타깃도 위로
      controls.target.set(0, 1.0, 0);
      controls.update();
    },
    undefined,
    (err) => console.error(err)
  );

  function animate() {
    requestAnimationFrame(animate);

    if (currentGLB && !isUserInteracting) {
      currentGLB.rotation.y += autoRotateSpeed * 0.01;
    }

    controls.update();
    renderer.render(scene, camera);
  }

  animate();
}


/* --------------------------------------------------
   썸네일 / 네비게이션
-------------------------------------------------- */
function renderFilmstrip() {
  if (!filmstrip) return;
  filmstrip.innerHTML = "";

  glbHistory.forEach((url, idx) => {
    const item = document.createElement("div");
    item.className = "thumb" + (idx === glbIndex ? " active" : "");
    const img = document.createElement("img");
    img.src = storage.getItem("img2d") || "";
    item.appendChild(img);

    const badge = document.createElement("span");
    badge.className = "idx";
    badge.textContent = idx + 1;
    item.appendChild(badge);

    item.addEventListener("click", () => {
      glbIndex = idx;
      updateHud();
      loadGLB(glbHistory[glbIndex]);
      renderFilmstrip();
    });

    filmstrip.appendChild(item);
  });
}

function updateHud() {
  if (!hudIndex) return;
  if (glbHistory.length === 0) {
    hudIndex.textContent = "0 / 0";
  } else {
    hudIndex.textContent = `${glbIndex + 1} / ${glbHistory.length}`;
  }
}

if (navPrev && navNext) {
  navPrev.addEventListener("click", () => {
    if (glbHistory.length === 0) return;
    glbIndex = (glbIndex - 1 + glbHistory.length) % glbHistory.length;
    updateHud();
    loadGLB(glbHistory[glbIndex]);
    renderFilmstrip();
  });

  navNext.addEventListener("click", () => {
    if (glbHistory.length === 0) return;
    glbIndex = (glbIndex + 1) % glbHistory.length;
    updateHud();
    loadGLB(glbHistory[glbIndex]);
    renderFilmstrip();
  });
}

/* 마우스 움직임에 따라 라이트 스폿 */
if (preview3d && visionSpot) {
  preview3d.addEventListener("mousemove", (e) => {
    const rect = preview3d.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    visionSpot.style.left = `${x}px`;
    visionSpot.style.top = `${y}px`;
    visionSpot.style.opacity = "1";
  });
  preview3d.addEventListener("mouseleave", () => {
    visionSpot.style.opacity = "0";
  });
}

/* 초기화 버튼 */
if (reset3dBtn) {
  reset3dBtn.addEventListener("click", () => {
    preview3d.innerHTML =
      "<span class='convert-label'>2D 합성 후 3D 변환을 실행하세요</span>";
    preview3d.classList.remove("has-image");
    glbHistory = [];
    glbIndex = -1;
    updateHud();
    if (filmstrip) filmstrip.innerHTML = "";
  });
}

/* --------------------------------------------------
   시작시 헤어 드롭다운 세팅
-------------------------------------------------- */
initHairDropdown();
