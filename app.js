const C = window.CLOUD_GALLERY_CONFIG;

const S = window.supabase.createClient(
  C.SUPABASE_URL,
  C.SUPABASE_PUBLISHABLE_KEY
);

const B = "photos";
const STORAGE_QUOTA = 5 * 1024 * 1024 * 1024; // 5 GB display quota

let user = null;
let photos = [];
let currentUserId = null;
let loadingPhotos = false;
let renderToken = 0;

const $ = (id) => document.getElementById(id);

function toast(message) {
  const t = $("toast");
  t.textContent = message;
  t.className = "show";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => { t.className = ""; }, 3000);
}

function loginView() {
  $("login").classList.remove("hide");
  $("signup").classList.add("hide");
  $("reset").classList.add("hide");
}

function signupView() {
  $("login").classList.add("hide");
  $("signup").classList.remove("hide");
  $("reset").classList.add("hide");
}

function resetView() {
  $("login").classList.add("hide");
  $("signup").classList.add("hide");
  $("reset").classList.remove("hide");
}

async function login(e) {
  e.preventDefault();
  const email = $("le").value.trim();
  const password = $("lp").value;
  if (!email || !password) return toast("Enter your email and password.");

  const button = e.submitter;
  if (button) { button.disabled = true; button.textContent = "Signing in..."; }

  const { data, error } = await S.auth.signInWithPassword({ email, password });

  if (button) { button.disabled = false; button.textContent = "Sign in"; }
  if (error) return toast(error.message);
  if (!data?.user) return toast("Login failed. Please try again.");
  toast("Welcome back.");
}

async function signup(e) {
  e.preventDefault();
  const email = $("se").value.trim();
  const password = $("sp").value;

  if (!email || !password) return toast("Enter your email and password.");
  if (password.length < 6) return toast("Password must be at least 6 characters.");

  const button = e.submitter;
  if (button) { button.disabled = true; button.textContent = "Creating..."; }

  const { data, error } = await S.auth.signUp({ email, password });

  if (button) { button.disabled = false; button.textContent = "Create account"; }
  if (error) return toast(error.message);

  if (data?.session) {
    toast("Account created successfully.");
    return;
  }

  toast("Account created. Check your email to confirm your account.");
  loginView();
}

async function resetPassword(e) {
  e.preventDefault();
  const email = $("re").value.trim();
  if (!email) return toast("Enter your email.");

  const button = e.submitter;
  if (button) { button.disabled = true; button.textContent = "Sending..."; }

  const { error } = await S.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });

  if (button) { button.disabled = false; button.textContent = "Send reset link"; }
  if (error) return toast(error.message);

  toast("Password reset email sent.");
  loginView();
}

async function logout() {
  const { error } = await S.auth.signOut();
  if (error) return toast(error.message);

  user = null;
  photos = [];
  currentUserId = null;

  $("auth").classList.remove("hide");
  $("app").classList.add("hide");
  $("gallery").replaceChildren();
  $("count").textContent = "0 Photos";
  updateStorageUsage();
}

async function session(sessionData) {
  const nextUser = sessionData?.user || null;

  if (!nextUser) {
    user = null;
    photos = [];
    currentUserId = null;

    $("auth").classList.remove("hide");
    $("app").classList.add("hide");
    $("gallery").replaceChildren();
    $("count").textContent = "0 Photos";
    updateStorageUsage();
    return;
  }

  user = nextUser;
  $("auth").classList.add("hide");
  $("app").classList.remove("hide");
  $("email").textContent = user.email || "";

  if (currentUserId !== user.id) {
    currentUserId = user.id;
    await load();
  }
}

async function load() {
  if (!user || loadingPhotos) return;
  loadingPhotos = true;

  try {
    const { data, error } = await S
      .from("photos")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast(error.message);
      return;
    }

    const unique = new Map();
    for (const photo of data || []) {
      if (!unique.has(photo.id)) unique.set(photo.id, photo);
    }

    photos = Array.from(unique.values());
    updateStorageUsage();
    await render();
  } finally {
    loadingPhotos = false;
  }
}

function updateStorageUsage() {
  const used = photos.reduce((total, photo) => {
    return total + (Number(photo.size_bytes) || 0);
  }, 0);

  const percent = Math.min((used / STORAGE_QUOTA) * 100, 100);
  const remaining = Math.max(STORAGE_QUOTA - used, 0);

  $("storageUsed").textContent = bytes(used);
  $("storagePercent").textContent = `${percent.toFixed(percent >= 10 ? 0 : 1)}%`;
  $("storageBar").style.width = `${percent}%`;
  $("storageRemaining").textContent = `${bytes(remaining)} remaining`;

  if (used >= STORAGE_QUOTA) {
    $("storageHint").textContent = "Storage quota reached";
  } else {
    $("storageHint").textContent = "Your uploaded photo storage";
  }
}

async function render() {
  const myToken = ++renderToken;
  if (!user) return;

  const search = ($("search")?.value || "").toLowerCase().trim();
  const category = $("cat")?.value || "All";

  const list = photos.filter((photo) => {
    const name = String(photo.original_name || "").toLowerCase();
    const categoryMatch = category === "All" || photo.category === category;
    const searchMatch = !search || name.includes(search);
    return categoryMatch && searchMatch;
  });

  $("count").textContent = `${photos.length} ${photos.length === 1 ? "Photo" : "Photos"}`;
  $("empty").classList.toggle("hide", list.length > 0);

  const fragment = document.createDocumentFragment();

  const cards = await Promise.all(list.map(async (photo) => {
    const { data, error } = await S.storage
      .from(B)
      .createSignedUrl(photo.storage_path, 3600);

    if (error || !data?.signedUrl) return null;

    const article = document.createElement("article");
    article.innerHTML = `
      <img src="${esc(data.signedUrl)}" alt="${esc(photo.original_name)}">
      <div>
        <strong>${esc(photo.original_name)}</strong>
        <small>${esc(photo.category)} · ${bytes(photo.size_bytes)}</small>
        <span>
          <button type="button" title="Preview">↗</button>
          <button type="button" title="Download">↓</button>
          <button type="button" title="Delete">×</button>
        </span>
      </div>
    `;

    const image = article.querySelector("img");
    const buttons = article.querySelectorAll("span button");

    image.onclick = () => openLight(data.signedUrl, photo.original_name);
    buttons[0].onclick = () => openLight(data.signedUrl, photo.original_name);
    buttons[1].onclick = () => download(data.signedUrl, photo.original_name);
    buttons[2].onclick = () => del(photo);

    return article;
  }));

  if (myToken !== renderToken) return;

  for (const card of cards) {
    if (card) fragment.appendChild(card);
  }

  $("gallery").replaceChildren(fragment);
}

async function upload(list) {
  if (!user) return toast("Please sign in first.");

  list = [...list].filter((file) => file.type.startsWith("image/"));
  if (!list.length) return toast("Choose image files only.");

  const category = $("uploadCategory").value;
  const validCategories = ["Family", "Work", "Other"];
  if (!validCategories.includes(category)) return toast("Choose a valid category.");

  $("progress").classList.remove("hide");
  let successful = 0;

  try {
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const percentBefore = Math.round((i / list.length) * 100);

      $("pt").textContent = `Uploading ${file.name}`;
      $("pp").textContent = `${percentBefore}%`;
      $("bar").style.width = `${percentBefore}%`;

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await S.storage
        .from(B)
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        toast("Upload failed: " + uploadError.message);
        continue;
      }

      const { error: dbError } = await S.from("photos").insert({
        user_id: user.id,
        storage_path: path,
        original_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        category
      });

      if (dbError) {
        await S.storage.from(B).remove([path]);
        toast("Database error: " + dbError.message);
        continue;
      }

      successful++;
    }

    $("bar").style.width = "100%";
    $("pp").textContent = "100%";

    await load();

    if (successful > 0) {
      toast(successful === 1
        ? `1 photo uploaded to ${category}.`
        : `${successful} photos uploaded to ${category}.`);
    }
  } finally {
    setTimeout(() => $("progress").classList.add("hide"), 500);
  }
}

async function del(photo) {
  if (!user) return;
  if (!confirm(`Delete ${photo.original_name}?`)) return;

  const { error: storageError } = await S.storage.from(B).remove([photo.storage_path]);
  if (storageError) return toast(storageError.message);

  const { error: dbError } = await S.from("photos")
    .delete()
    .eq("id", photo.id)
    .eq("user_id", user.id);

  if (dbError) return toast(dbError.message);

  photos = photos.filter((item) => item.id !== photo.id);
  updateStorageUsage();
  await render();
  toast("Photo deleted.");
}

async function download(url, name) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Download failed.");

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = objectUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (error) {
    toast(error.message);
  }
}

function openLight(url, name) {
  $("lightimg").src = url;
  $("lightimg").alt = name;
  $("lightname").textContent = name;
  $("light").classList.remove("hide");
}

function closeLight(e) {
  if (!e || e.target.id === "light" || e.target.tagName === "BUTTON") {
    $("light").classList.add("hide");
  }
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#039;"
  }[m]));
}

function bytes(value) {
  let n = Number(value) || 0;
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;

  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }

  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}

$("files").onchange = (e) => {
  upload(e.target.files);
  e.target.value = "";
};

const drop = $("drop");

["dragover", "dragenter"].forEach((eventName) => {
  drop.addEventListener(eventName, (e) => {
    e.preventDefault();
    drop.classList.add("drag");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  drop.addEventListener(eventName, (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
  });
});

drop.ondrop = (e) => upload(e.dataTransfer.files);

S.auth.onAuthStateChange((_event, sessionData) => {
  Promise.resolve()
    .then(() => session(sessionData))
    .catch((error) => {
      console.error(error);
      toast("Authentication error.");
    });
});

S.auth.getSession()
  .then(({ data, error }) => {
    if (error) return toast(error.message);
    return session(data.session);
  })
  .catch((error) => {
    console.error(error);
    toast("Unable to check your session.");
  });
