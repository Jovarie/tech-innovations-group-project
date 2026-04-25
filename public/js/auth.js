// Tiny client-side auth helper. Stores the JWT in localStorage and
// provides a fetch wrapper that attaches the Authorisation header.

const TOKEN_KEY = "ar.token";
const USER_KEY = "ar.user";

const Auth = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },
  getUser() {
    const raw = localStorage.getItem(USER_KEY);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  isLoggedIn() {
    return !!this.getToken();
  },
  setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = "/";
  },
  requireAuth(redirect = "/login.html") {
    if (!this.isLoggedIn()) {
      const next = encodeURIComponent(window.location.pathname);
      window.location.href = `${redirect}?next=${next}`;
      return false;
    }
    return true;
  },
  async fetch(url, opts = {}) {
    const token = this.getToken();
    const headers = Object.assign(
      { "Content-Type": "application/json" },
      opts.headers || {},
      token ? { Authorization: `Bearer ${token}` } : {},
    );
    const res = await fetch(url, Object.assign({}, opts, { headers }));
    if (res.status === 401) {
      this.logout();
      throw new Error("Session expired");
    }
    return res;
  },
};

// Render a small "Logged in as X / Logout" widget into any [data-user-widget]
function renderUserWidget() {
  document.querySelectorAll("[data-user-widget]").forEach((el) => {
    const user = Auth.getUser();
    el.innerHTML = "";
    if (user) {
      const span = document.createElement("span");
      span.textContent = user.username;
      span.style.color = "var(--hud-color)";
      span.style.marginRight = "12px";
      const btn = document.createElement("button");
      btn.textContent = "Logout";
      btn.onclick = () => Auth.logout();
      el.appendChild(span);
      el.appendChild(btn);
    } else {
      const a = document.createElement("a");
      a.href = "/login.html";
      a.textContent = "Login";
      el.appendChild(a);
    }
  });
}

document.addEventListener("DOMContentLoaded", renderUserWidget);
