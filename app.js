// ---------- CONFIG ----------

const firebaseConfig = {
  apiKey: "AIzaSyAfqq2hQBG46s1oKPBIxy5aZa57hC-OUi4",
  authDomain: "growthsignal-14667.firebaseapp.com",
  projectId: "growthsignal-14667",
  storageBucket: "growthsignal-14667.firebasestorage.app",
  messagingSenderId: "502283580872",
  appId: "1:502283580872:web:c33c3baff959151e537cfd",
  measurementId: "G-N97Q8M6PY7",
};

// Backend API base URL
const API_BASE_URL = "http://localhost:4000/api";

// ---------- FIREBASE INIT ----------

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const fbAuth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// ---------- STATE ----------

const appState = {
  firebaseUser: null,
  role: null,
  platformToken: null,
};

// ---------- HELPERS ----------

function $(id) {
  return document.getElementById(id);
}

async function apiFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (appState.platformToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${appState.platformToken}`;
  }

  const res = await fetch(API_BASE_URL + path, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Request failed");
  }

  if (res.status === 204) return null;
  return res.json();
}

async function exchangeTokenWithBackend(firebaseToken) {
  const data = await apiFetch("/auth/exchange", {
    method: "POST",
    body: JSON.stringify({ firebaseToken }),
  });
  appState.platformToken = data.token;
  appState.role = data.role;
}

function redirectTo(path) {
  window.location.href = path;
}

function getCurrentPage() {
  const path = window.location.pathname;
  return path.split("/").pop() || "index.html";
}

// ---------- AUTH LISTENER (GLOBAL) ----------

function initGlobalAuthListener() {
  fbAuth.onAuthStateChanged(async (user) => {
    appState.firebaseUser = user;

    if (!user) {
      appState.platformToken = null;
      appState.role = null;
      handlePageGuardsUnauthed();
      return;
    }

    try {
      const token = await user.getIdToken();
      await exchangeTokenWithBackend(token);
      handlePageGuardsAuthed();
    } catch (err) {
      console.error("Token exchange error:", err);
    }
  });
}

// ---------- PAGE GUARDS ----------

function handlePageGuardsUnauthed() {
  const page = getCurrentPage();

  // Protected pages when not logged in → back to login
  const protectedPages = [
    "welcome.html",
    "user-dashboard.html",
    "business-dashboard.html",
    "admin-dashboard.html",
  ];

  if (protectedPages.includes(page)) {
    redirectTo("index.html");
  }
}

function handlePageGuardsAuthed() {
  const page = getCurrentPage();
  const role = appState.role;

  // On index.html: if already logged in → go to role dashboard
  if (page === "index.html") {
    redirectToDashboardForRole(role);
    return;
  }

  // On welcome.html: allowed for anyone logged in
  if (page === "welcome.html") {
    // handled by welcome page logic (business vs user/admin)
    return;
  }

  // Role-specific dashboard guards
  if (page === "user-dashboard.html" && role !== "user") {
    redirectToDashboardForRole(role);
  }

  if (page === "business-dashboard.html" && role !== "business") {
    redirectToDashboardForRole(role);
  }

  if (page === "admin-dashboard.html" && role !== "admin") {
    redirectToDashboardForRole(role);
  }
}

function redirectToDashboardForRole(role) {
  if (role === "business") {
    redirectTo("business-dashboard.html");
  } else if (role === "admin") {
    redirectTo("admin-dashboard.html");
  } else {
    redirectTo("user-dashboard.html");
  }
}

// ---------- INDEX PAGE: LOGIN / SIGNUP ----------

function initIndexPage() {
  const tabSignin = $("tab-signin");
  const tabSignup = $("tab-signup");
  const authForm = $("auth-form");
  const authEmail = $("auth-email");
  const authPassword = $("auth-password");
  const authRole = $("auth-role");
  const authError = $("auth-error");
  const googleBtn = $("google-btn");

  if (!authForm) return;

  let mode = "signin";

  tabSignin.addEventListener("click", () => {
    mode = "signin";
    tabSignin.classList.add("tab-active");
    tabSignup.classList.remove("tab-active");
  });

  tabSignup.addEventListener("click", () => {
    mode = "signup";
    tabSignup.classList.add("tab-active");
    tabSignin.classList.remove("tab-active");
  });

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.textContent = "";

    const email = authEmail.value.trim();
    const password = authPassword.value;
    const chosenRole = authRole.value;

    try {
      let userCredential;

      if (mode === "signup") {
        userCredential = await fbAuth.createUserWithEmailAndPassword(email, password);

        // Save role
        const idToken = await userCredential.user.getIdToken();
        await apiFetch("/users/role", {
          method: "POST",
          body: JSON.stringify({ role: chosenRole }),
          headers: { Authorization: `Bearer ${idToken}` },
        });

        // First-time signup → go to welcome
        redirectTo("welcome.html");
        return;
      } else {
        userCredential = await fbAuth.signInWithEmailAndPassword(email, password);

        const token = await userCredential.user.getIdToken();
        await exchangeTokenWithBackend(token);

        // Returning login → go to dashboard
        redirectToDashboardForRole(appState.role);
      }
    } catch (err) {
      console.error("Email auth error:", err);
      authError.textContent = err.message || "Authentication failed.";
    }
  });

  if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
      authError.textContent = "";
      try {
        const result = await fbAuth.signInWithPopup(googleProvider);
        const user = result.user;

        // On first login, backend will create default user doc if missing
        const token = await user.getIdToken();
        await exchangeTokenWithBackend(token);

        // Assume Google users are not strictly "first-time signup" in same way
        redirectToDashboardForRole(appState.role);
      } catch (err) {
        console.error("Google sign-in error:", err);
        authError.textContent = err.message || "Google sign-in failed.";
      }
    });
  }
}

// ---------- WELCOME PAGE ----------

function initWelcomePage() {
  const businessSection = $("welcome-business-section");
  const genericSection = $("welcome-generic-section");
  const businessForm = $("business-onboarding-form");
  const genericButton = $("welcome-generic-button");
  const errorEl = $("welcome-error");
  const successEl = $("welcome-success");

  if (!businessSection && !genericSection) return;

  const role = appState.role;

  if (role === "business") {
    if (businessSection) businessSection.classList.remove("hidden");
    if (genericSection) genericSection.classList.add("hidden");
  } else {
    if (genericSection) genericSection.classList.remove("hidden");
    if (businessSection) businessSection.classList.add("hidden");
  }

  if (genericButton) {
    genericButton.addEventListener("click", () => {
      redirectToDashboardForRole(role);
    });
  }

  if (businessForm) {
    businessForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.textContent = "";
      successEl.textContent = "";

      const name = $("business-name").value.trim();
      const description = $("business-description").value.trim();
      const category = $("business-category").value;
      const website = $("business-website").value.trim();
      const phone = $("business-phone").value.trim();
      const address = $("business-address").value.trim();
      const location = $("business-location").value.trim();
      const registration = $("business-registration").value.trim();

      if (!name || !description || !category) {
        errorEl.textContent = "Please fill all required fields.";
        return;
      }

      try {
        await apiFetch("/business/profile", {
          method: "POST",
          body: JSON.stringify({
            name,
            description,
            category,
            website,
            phone,
            address,
            location,
            registration,
          }),
        });

        successEl.textContent = "Business profile submitted.";
        setTimeout(() => {
          redirectTo("business-dashboard.html");
        }, 800);
      } catch (err) {
        console.error("Business onboarding error:", err);
        errorEl.textContent = "Failed to submit business profile.";
      }
    });
  }
}

// ---------- DASHBOARDS (SIMPLE WIRES) ----------

async function loadWalletBalance() {
  try {
    const data = await apiFetch("/wallet/me");
    const el = $("wallet-balance");
    if (el) el.textContent = data.balance ?? 0;
  } catch (err) {
    console.error("Wallet load error:", err);
    const el = $("wallet-balance");
    if (el) el.textContent = "?";
  }
}

async function loadUserCampaigns() {
  const list = $("user-campaign-list");
  if (!list) return;

  try {
    const campaigns = await apiFetch("/campaigns");
    list.innerHTML = "";

    campaigns.forEach((c) => {
      const div = document.createElement("div");
      div.className = "list-item";
      div.innerHTML = `
        <div class="list-item-header">
          <div>
            <div class="list-item-title">${c.title}</div>
            <div class="list-item-sub">
              ${c.success_metric} • Target: ${c.metric_target_value}
            </div>
          </div>
         
