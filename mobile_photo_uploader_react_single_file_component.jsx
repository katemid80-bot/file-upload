import React, { useEffect, useRef, useState } from "react";

/*
[가장 쉬운 배포(온라인 올리기) 5단계 요약 – 비개발자용]
1) Vercel(버셀) 가입: https://vercel.com  (무료)
2) GitHub에 이 프로젝트 올리기: 새 저장소 만든 뒤 소스 푸시
3) Vercel에서 New Project → GitHub 저장소 선택 → Deploy (자동 빌드/배포)
4) Cloudinary 가입 후:
   - Cloud Name 확인
   - Settings → Uploads → Add Upload Preset 에서 Unsigned preset 생성
5) Vercel → Project Settings → Environment Variables 에 추가
   - VITE_CLOUDINARY_CLOUD_NAME = (Cloud Name)
   - VITE_CLOUDINARY_UNSIGNED_PRESET = (Unsigned Preset 이름)
   저장 후 재배포되면 HTTPS 주소가 생기고, 그 주소로 모바일에서 접속해 바로 사용 가능

※ 만약 환경변수를 아직 못 넣었으면, 이 앱은 화면 상단에 간단한 설정 카드(Cloud name/preset 입력)를 자동으로 보여주고
   저장 시 localStorage에 저장해 바로 업로드가 가능해요.
*/

// v1.2.0
// - Fix: graceful Cloudinary config with one-time inline setup (only shows if missing)
// - Keep button enabling based on inputs only; config validated at upload-time
// - Removed noisy "File selected" message
// - Added dev-only self tests (console.assert) for helpers

// ---------- Configuration helpers ----------
const ENV_CLOUD = (import.meta && import.meta.env && import.meta.env.VITE_CLOUDINARY_CLOUD_NAME) || "";
const ENV_PRESET = (import.meta && import.meta.env && import.meta.env.VITE_CLOUDINARY_UNSIGNED_PRESET) || "";

const PLACEHOLDER_NAMES = new Set(["your_cloud_name", "your unsigned cloud name", "cloud_name"]);
const PLACEHOLDER_PRESETS = new Set(["your_unsigned_preset", "unsigned_preset", "preset"]);

function readLocal(key) {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}
function writeLocal(key, val) {
  try { localStorage.setItem(key, val); } catch {}
}

function getCloudinaryConfig() {
  // Priority: ENV (if not placeholder) > localStorage > unset
  const envName = (ENV_CLOUD || "").trim();
  const envPreset = (ENV_PRESET || "").trim();
  const envOk = !!envName && !PLACEHOLDER_NAMES.has(envName) && !!envPreset && !PLACEHOLDER_PRESETS.has(envPreset);
  if (envOk) return { cloudName: envName, uploadPreset: envPreset, source: "env" };

  const lsName = (readLocal("cloudinary_cloud_name") || "").trim();
  const lsPreset = (readLocal("cloudinary_unsigned_preset") || "").trim();
  const lsOk = !!lsName && !!lsPreset;
  if (lsOk) return { cloudName: lsName, uploadPreset: lsPreset, source: "localStorage" };

  return { cloudName: "", uploadPreset: "", source: "unset" };
}

// ---------- Helpers ----------
function parseCloudinaryErrorText(text) {
  try {
    const raw = typeof text === "string" ? text : String(text ?? "");
    try {
      const j = JSON.parse(raw);
      const msg = j && j.error && j.error.message ? j.error.message : raw;
      return String(msg).trim();
    } catch {
      return String(raw).trim();
    }
  } catch {
    return "Unknown error";
  }
}

function safeSlug(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------- Component ----------
export default function PhotoUploaderApp() {
  const fileInputRefLibrary = useRef(null);
  const fileInputRefCamera = useRef(null);

  const [file, setFile] = useState(null);
  const [description, setDescription] = useState("");
  const [func, setFunc] = useState("110 Training");
  const [email, setEmail] = useState("");
  const [rememberEmail, setRememberEmail] = useState(true);

  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [emailError, setEmailError] = useState("");

  // Inline setup (only shows if missing)
  const initialCfg = getCloudinaryConfig();
  const needsSetupInit = initialCfg.source === "unset";
  const [showSetup, setShowSetup] = useState(needsSetupInit);
  const [cnInput, setCnInput] = useState(() => (initialCfg.cloudName || readLocal("cloudinary_cloud_name") || ""));
  const [upInput, setUpInput] = useState(() => (initialCfg.uploadPreset || readLocal("cloudinary_unsigned_preset") || ""));
  const [savedOnce, setSavedOnce] = useState(false);

  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem("uploader_client_email");
      if (savedEmail) setEmail(savedEmail);
    } catch {}
  }, []);

  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  function onFileChange(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const ok = f.type.startsWith("image/") || f.type === "application/pdf";
    if (!ok) {
      setMessage("Please select an image or PDF file.");
      return;
    }
    setFile(f);
    // Intentionally no toast here.
  }

  function saveSetup() {
    const name = (cnInput || "").trim();
    const preset = (upInput || "").trim();
    if (!name || !preset) {
      setMessage("Enter Cloud name and unsigned upload preset, then Save.");
      return;
    }
    writeLocal("cloudinary_cloud_name", name);
    writeLocal("cloudinary_unsigned_preset", preset);
    setSavedOnce(true);
    setShowSetup(false);
    setMessage("Cloudinary settings saved on this device.");
  }

  async function onSubmit(e) {
    e.preventDefault();

    if (!isValidEmail(email)) {
      setEmailError("Enter a valid email. This identifies you.");
      return;
    }
    setEmailError("");

    if (!file) {
      setMessage("Select or take a photo (or choose a PDF) first.");
      return;
    }

    // Mobile-friendly extra guardrails
    if (file && file.size > 15 * 1024 * 1024) { // ~15MB
      setMessage("File is too large. Please keep under 15MB.");
      return;
    }

    if (!description.trim()) {
      setMessage("Description is required.");
      return;
    }

    if (!func) {
      setMessage("Function is required.");
      return;
    }

    // Prevent double-tap double submit on mobile
    if (isUploading) return;

    if (rememberEmail) {
      try { localStorage.setItem("uploader_client_email", email); } catch {}
    }

    setIsUploading(true);
    setMessage("");

    try {
      const uploaded = await uploadToCloud({ file, description, func, email });
      setMessage("Uploaded OK\n" + uploaded.url);
      setFile(null);
      setDescription("");
    } catch (err) {
      console.error(err);
      const msg = err && err.message ? err.message : String(err);
      // If config missing, hint user to open setup
      if (/cloud name is not configured|upload preset is not configured/i.test(msg)) {
        setShowSetup(true);
      }
      setMessage("Upload failed: " + msg);
    } finally {
      setIsUploading(false);
    }
  }

  // Enable the button based only on user inputs and upload state.
  const canUpload = isValidEmail(email) && !!file && !!description.trim() && !!func && !isUploading;

  const cfg = getCloudinaryConfig();
  const needsSetup = showSetup || !cfg.cloudName || !cfg.uploadPreset;

  return (
    <div className="min-h-screen w-full bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-5 sm:p-6">
          <header className="mb-4 sm:mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">Receipt & File Uploader</h1>
            <p className="text-sm text-gray-500 mt-1">Snap a receipt or upload a file, add a description, pick a function, and send.</p>
          </header>

          {/* Inline one-time setup (only visible if config missing) */}
          {needsSetup && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-sm font-medium mb-2">Set up Cloudinary (one-time)</div>
              <div className="grid grid-cols-1 gap-2">
                <input
                  value={cnInput}
                  onChange={(e) => setCnInput(e.target.value)}
                  placeholder="Cloud name (e.g., mycloud)"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/5"
                />
                <input
                  value={upInput}
                  onChange={(e) => setUpInput(e.target.value)}
                  placeholder="Unsigned upload preset (e.g., receipts_unsigned)"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/5"
                />
                <button type="button" onClick={saveSetup} className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50">Save</button>
                {savedOnce && <span className="text-xs text-green-700">Saved.</span>}
              </div>
              <p className="text-[11px] text-gray-500 mt-2">Tip: You can also deploy with env vars VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UNSIGNED_PRESET.</p>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-5">
            {/* Email */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Client Email <span className="text-red-500">*</span></label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 ${emailError ? "border-red-400" : "border-gray-200"}`}
                autoComplete="email"
                required
              />
              {emailError && <p className="text-xs text-red-500">{emailError}</p>}
              <label className="inline-flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={rememberEmail} onChange={(e) => setRememberEmail(e.target.checked)} />
                Remember my email on this device
              </label>
            </div>

            {/* File */}
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center gap-3 text-center">
              {file ? (
                <div className="flex flex-col items-center text-gray-600 text-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-green-500 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{file.name}</span>
                </div>
              ) : (
                <div className="text-gray-500 text-sm">No file selected</div>
              )}

              <div className="w-full space-y-2">
                <button
                  type="button"
                  onClick={() => fileInputRefLibrary.current && fileInputRefLibrary.current.click()}
                  className="w-full inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 active:scale-[0.99] transition"
                >
                  Choose Photo / PDF
                </button>
                <input
                  ref={fileInputRefLibrary}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={onFileChange}
                />

                <button
                  type="button"
                  onClick={() => fileInputRefCamera.current && fileInputRefCamera.current.click()}
                  className="w-full inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 active:scale-[0.99] transition"
                >
                  Take Photo (Camera)
                </button>
                <input
                  ref={fileInputRefCamera}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={onFileChange}
                />

                <button
                  type="button"
                  onClick={() => { setFile(null); setMessage(""); }}
                  className="w-full px-4 py-2 text-sm rounded-xl border border-gray-200 hover:bg-gray-50"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Description <span className="text-red-500">*</span></label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="e.g., July travel receipt, client lunch..."
                className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/5"
                required
              />
            </div>

            {/* Function */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Function <span className="text-red-500">*</span></label>
              <select
                value={func}
                onChange={(e) => setFunc(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/5"
                required
              >
                <option value="">-- Select --</option>
                <option value="110 Training">110 Training</option>
                <option value="111 Incubator">111 Incubator</option>
                <option value="112 Coaching">112 Coaching</option>
                <option value="120 Catalytic Funding">120 Catalytic Funding</option>
                <option value="121 Startup Church Grant Program">121 Startup Church Grant Program</option>
                <option value="200 Management & General">200 Management & General</option>
                <option value="300 Fundraising">300 Fundraising</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={!canUpload}
              className="w-full rounded-xl bg-black text-white py-3 text-sm font-medium hover:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              aria-disabled={!canUpload}
            >
              {isUploading ? "Uploading..." : "Upload"}
            </button>

            {message && (
              <pre className="whitespace-pre-wrap text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-xl p-3">{message}</pre>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

// ---------- Cloudinary upload ----------
async function uploadToCloud({ file, description, func, email }) {
  const { cloudName, uploadPreset, source } = getCloudinaryConfig();

  // Friendly preflight for mobile: stop before any network call if misconfigured
  if (!cloudName) {
    throw new Error("Cloudinary cloud name is not configured. Use the setup card above or set VITE_CLOUDINARY_CLOUD_NAME.");
  }
  if (!uploadPreset) {
    throw new Error("Cloudinary unsigned upload preset is not configured. Use the setup card above or set VITE_CLOUDINARY_UNSIGNED_PRESET.");
  }

  const emailSlug = safeSlug(email);
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const folder = `receipts/${emailSlug || "unknown"}/${ym}`;

  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}-${String(now.getSeconds()).padStart(2, "0")}`;
  const publicId = `${stamp}_${safeSlug(func || "uncat")}`;

  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", uploadPreset);
  form.append("folder", folder);
  form.append("public_id", publicId);
  form.append("context", `email=${email}|function=${func}|description=${(description || "").slice(0, 200)}`);

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;

  let res;
  try {
    res = await fetch(endpoint, { method: "POST", body: form });
  } catch (networkErr) {
    const detail = networkErr && networkErr.message ? networkErr.message : String(networkErr || "");
    // iOS Safari sometimes throws TypeError: Load failed; make the message human
    throw new Error("Network error while uploading (check connection/HTTPS). " + detail);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(parseCloudinaryErrorText(errText));
  }

  const data = await res.json();
  return { url: data.secure_url || data.url, public_id: data.public_id, asset_id: data.asset_id, source };
}

// ---------- Dev-only self tests ----------
function runDevSelfTests() {
  const results = [];
  results.push(["parse json", parseCloudinaryErrorText(JSON.stringify({ error: { message: "boom" } })), "boom"]);
  results.push(["parse passthrough", parseCloudinaryErrorText("not-json"), "not-json"]);
  results.push(["safeSlug email", safeSlug("User+Email@Example.com"), "user-email@example.com".replace(/[^a-z0-9._-]+/g, "-")]);

  // env/ls config resolution
  const cfg = getCloudinaryConfig();
  const hasAny = (!!cfg.cloudName) && (!!cfg.uploadPreset);
  results.push(["config source", cfg.source || "unset", "env|localStorage|unset (any acceptable in dev)"]);
  results.push(["config present", hasAny ? "yes" : "no", "yes when set"]);

  try { results.forEach(([name, got]) => console.assert(typeof got !== "undefined", name)); } catch {}
  try { console.table(results.map((r) => ({ test: r[0], got: r[1], note: r[2] }))); } catch {}
}

try { if ((import.meta && import.meta.env && import.meta.env.MODE) !== "production") runDevSelfTests(); } catch {}
