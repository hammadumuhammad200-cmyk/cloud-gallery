const C = window.CLOUD_GALLERY_CONFIG;
const S = window.supabase.createClient(
  C.SUPABASE_URL,
  C.SUPABASE_PUBLISHABLE_KEY
);

const B = "photos";

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
  window.__toastTimer = setTimeout(() => {
    t.className = "";
  }, 3000);
}

/* =========================
   AUTH VIEW
========================= */

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

/* =========================
   LOGIN
========================= */

async function login(e) {
  e.preventDefault();

  const email = $("le").value.trim();
  const password = $("lp").value;

  if (!email || !password) {
    toast("Enter your email and password.");
    return;
  }

  const button = e.submitter;
  if (button) {
    button.disabled = true;
    button.textContent = "Signing in...";
  }

  const { data, error } = await S.auth.signInWithPassword({
    email,
    password
  });

  if (button) {
    button.disabled = false;
    button.textContent = "Sign in";
  }

  if (error) {
    toast(error.message);
    return;
  }

  if (!data || !data.user) {
    toast("Login failed. Please try again.");
    return;
  }

  toast("Welcome back.");
}

/* =========================
   SIGN UP
========================= */

async function signup(e) {
  e.preventDefault();

  const email = $("se").value.trim();
  const password = $("sp").value;

  if (!email || !password) {
    toast("Enter your email and password.");
    return;
  }

  if (password.length < 6) {
    toast("Password must be at least 6 characters.");
    return;
  }

  const button = e.submitter;

  if (button) {
    button.disabled = true;
    button.textContent = "Creating...";
  }

  const { data, error } = await S.auth.signUp({
    email,
    password
  });

  if (button) {
    button.disabled = false;
    button.textContent = "Create account";
  }

  if (error) {
    toast(error.message);
    return;
  }

  if (data?.session) {
    toast("Account created successfully.");
    return;
  }

  toast("Account created. Check your email to confirm your account.");
  loginView();
}

/* =========================
   PASSWORD RESET
========================= */

async function resetPassword(e) {
  e.preventDefault();

  const email = $("re").value.trim();

  if (!email) {
    toast("Enter your email.");
    return;
  }

  const button = e.submitter;

  if (button) {
    button.disabled = true;
    button.textContent = "Sending...";
  }

  const { error } = await S.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });

  if (button) {
    button.disabled = false;
    button.textContent = "Send reset link";
  }

  if (error) {
    toast(error.message);
    return;
  }

  toast("Password reset email sent.");
  loginView();
}

/* =========================
   LOGOUT
========================= */

async function logout() {
  const { error } = await S.auth.signOut();

  if (error) {
    toast(error.message);
    return;
  }

  user = null;
  photos = [];
  currentUserId = null;

  $("auth").classList.remove("hide");
  $("app").classList.add("hide");

  $("gallery").replaceChildren();
}

/* =========================
   SESSION
========================= */

async function session(sessionData) {
  const nextUser = sessionData?.user || null;

  /*
    Prevent duplicate session processing.
    Supabase can trigger getSession() and onAuthStateChange()
    close together.
  */

  if (!nextUser) {
    user = null;
    photos = [];
    currentUserId = null;

    $("auth").classList.remove("hide");
    $("app").classList.add("hide");

    $("gallery").replaceChildren();
    $("count").textContent = "0 Photos";

    return;
  }

  user = nextUser;

  $("auth").classList.add("hide");
  $("app").classList.remove("hide");
  $("email").textContent = user.email || "";

  /*
    Only load when the actual user changes.
  */
  if (currentUserId !== user.id) {
    currentUserId = user.id;
    await load();
  }
}

/* =========================
   LOAD PHOTOS
========================= */

async function load() {
  if (!user) return;

  /*
    Prevent two load() operations
    from running at the same time.
  */
  if (loadingPhotos) return;

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

    /*
      Extra protection against duplicate database rows
      appearing in the UI.
    */
    const unique = new Map();

    for (const photo of data || []) {
      if (!unique.has(photo.id)) {
        unique.set(photo.id, photo);
      }
    }

    photos = Array.from(unique.values());

    await render();
  } finally {
    loadingPhotos = false;
  }
}

/* =========================
   RENDER GALLERY
========================= */

async function render() {
  const myToken = ++renderToken;

  if (!user) return;

  const searchInput = $("search");
  const categoryInput = $("cat");

  const q = (searchInput?.value || "").toLowerCase().trim();
  const category = categoryInput?.value || "All";

  const list = photos.filter((p) => {
    const name = String(p.original_name || "").toLowerCase();

    const categoryMatch =
      category === "All" || p.category === category;

    const searchMatch =
      !q || name.includes(q);

    return categoryMatch && searchMatch;
  });

  $("count").textContent =
    photos.length +
    " " +
    (photos.length === 1 ? "Photo" : "Photos");

  $("empty").classList.toggle("hide", list.length > 0);

  /*
    Create everything first.
    We don't append individual cards directly to the live gallery
    while signed URLs are loading.
  */

  const fragment = document.createDocumentFragment();

  const cards = await Promise.all(
    list.map(async (p) => {
      const { data, error } = await S
        .storage
        .from(B)
        .createSignedUrl(p.storage_path, 3600);

      if (error || !data?.signedUrl) {
        return null;
      }

      const article = document.createElement("article");

      article.innerHTML = `
        <img src="${esc(data.signedUrl)}" alt="">
        <div>
          <strong>${esc(p.original_name)}</strong>
          <small>
            ${esc(p.category)} · ${bytes(p.size_bytes)}
          </small>
          <span>
            <button type="button">↗</button>
            <button type="button">↓</button>
            <button type="button">×</button>
          </span>
        </div>
      `;

      const image = article.querySelector("img");
      const buttons = article.querySelectorAll("span button");

      image.onclick = () =>
        openLight(data.signedUrl, p.original_name);

      buttons[0].onclick = () =>
        openLight(data.signedUrl, p.original_name);

      buttons[1].onclick = () =>
        download(data.signedUrl, p.original_name);

      buttons[2].onclick = () =>
        del(p);

      return article;
    })
  );

  /*
    If another render started while this one was working,
    ignore this old render.
  */

  if (myToken !== renderToken) return;

  for (const card of cards) {
    if (card) {
      fragment.appendChild(card);
    }
  }

  /*
    Replace the gallery only once.
    This prevents duplicate cards.
  */

  $("gallery").replaceChildren(fragment);
}

/* =========================
   UPLOAD
========================= */

async function upload(list) {
  if (!user) {
    toast("Please sign in first.");
    return;
  }

  list = [...list].filter((file) =>
    file.type.startsWith("image/")
  );

  if (!list.length) {
    toast("Choose image files only.");
    return;
  }

  $("progress").classList.remove("hide");

  let successful = 0;

  try {
    for (let i = 0; i < list.length; i++) {
      const file = list[i];

      const percentBefore = Math.round(
        (i / list.length) * 100
      );

      $("pt").textContent =
        "Uploading " + file.name;

      $("pp").textContent =
        percentBefore + "%";

      $("bar").style.width =
        percentBefore + "%";

      const safeName = file.name.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );

      const path =
        `${user.id}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } =
        await S.storage
          .from(B)
          .upload(path, file, {
            contentType: file.type,
            upsert: false
          });

      if (uploadError) {
        toast(
          "Upload failed: " +
          uploadError.message
        );
        continue;
      }

      const { error: dbError } =
        await S
          .from("photos")
          .insert({
            user_id: user.id,
            storage_path: path,
            original_name: file.name,
            mime_type: file.type,
            size_bytes: file.size,
            category: "Other"
          });

      if (dbError) {
        /*
          If database insert fails,
          remove the uploaded storage object.
        */

        await S.storage
          .from(B)
          .remove([path]);

        toast(
          "Database error: " +
          dbError.message
        );

        continue;
      }

      successful++;
    }

    $("bar").style.width = "100%";
    $("pp").textContent = "100%";

    await load();

    if (successful > 0) {
      toast(
        successful === 1
          ? "Photo uploaded successfully."
          : successful + " photos uploaded successfully."
      );
    }
  } finally {
    setTimeout(() => {
      $("progress").classList.add("hide");
    }, 500);
  }
}

/* =========================
   DELETE
========================= */

async function del(p) {
  if (!user) return;

  const confirmed = confirm(
    "Delete " + p.original_name + "?"
  );

  if (!confirmed) return;

  const { error: storageError } =
    await S.storage
      .from(B)
      .remove([p.storage_path]);

  if (storageError) {
    toast(storageError.message);
    return;
  }

  const { error: dbError } =
    await S
      .from("photos")
      .delete()
      .eq("id", p.id)
      .eq("user_id", user.id);

  if (dbError) {
    toast(dbError.message);
    return;
  }

  photos = photos.filter(
    (item) => item.id !== p.id
  );

  await render();

  toast("Photo deleted.");
}

/* =========================
   DOWNLOAD
========================= */

async function download(url, name) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Download failed.");
    }

    const blob = await response.blob();

    const objectUrl =
      URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = objectUrl;
    a.download = name;

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1000);
  } catch (error) {
    toast(error.message);
  }
}

/* =========================
   LIGHTBOX
========================= */

function openLight(url, name) {
  $("lightimg").src = url;
  $("lightname").textContent = name;
  $("light").classList.remove("hide");
}

function closeLight(e) {
  if (
    !e ||
    e.target.id === "light" ||
    e.target.tagName === "BUTTON"
  ) {
    $("light").classList.add("hide");
  }
}

/* =========================
   HELPERS
========================= */

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m])
  );
}

function bytes(n) {
  n = Number(n) || 0;

  const units = [
    "B",
    "KB",
    "MB",
    "GB"
  ];

  let i = 0;

  while (
    n >= 1024 &&
    i < units.length - 1
  ) {
    n /= 1024;
    i++;
  }

  return (
    n.toFixed(i ? 1 : 0) +
    " " +
    units[i]
  );
}

/* =========================
   FILE INPUT
========================= */

$("files").onchange = (e) => {
  upload(e.target.files);

  /*
    Allow selecting the same file again later.
  */
  e.target.value = "";
};

/* =========================
   DRAG & DROP
========================= */

const drop = $("drop");

["dragover", "dragenter"].forEach(
  (eventName) => {
    drop.addEventListener(
      eventName,
      (e) => {
        e.preventDefault();
        drop.classList.add("drag");
      }
    );
  }
);

["dragleave", "drop"].forEach(
  (eventName) => {
    drop.addEventListener(
      eventName,
      (e) => {
        e.preventDefault();
        drop.classList.remove("drag");
      }
    );
  }
);

drop.ondrop = (e) => {
  upload(e.dataTransfer.files);
};

/* =========================
   SUPABASE AUTH START
========================= */

/*
  Listen for authentication changes first.
*/

S.auth.onAuthStateChange(
  (_event, sessionData) => {
    /*
      Don't await directly inside Supabase's callback.
      Run it safely after the auth event.
    */

    Promise.resolve()
      .then(() => session(sessionData))
      .catch((error) => {
        console.error(error);
        toast("Authentication error.");
      });
  }
);

/*
  Then check the current session.
*/

S.auth
  .getSession()
  .then(({ data, error }) => {
    if (error) {
      toast(error.message);
      return;
    }

    return session(data.session);
  })
  .catch((error) => {
    console.error(error);
    toast("Unable to check your session.");
  });
