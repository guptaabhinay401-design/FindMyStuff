(function () {
  'use strict';

  // ── API base resolution ──────────────────────────────────────────────────
  function normalizeApiBase(value) {
    const text = String(value || "").trim();
    return text ? text.replace(/\/+$/, "") : "";
  }

  function resolveApiBase() {
    try {
      const url = new URL(window.location.href);
      const queryValue = normalizeApiBase(url.searchParams.get("apiBase"));
      if (queryValue) { localStorage.setItem("lf_api_base", queryValue); return queryValue; }

      const hostname = String(url.hostname || "").toLowerCase();
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        localStorage.removeItem("lf_api_base");
        return "http://localhost:5001/api";
      }
    } catch (_) {}

    const win = normalizeApiBase(window.LF_API_BASE);
    if (win) return win;

    const meta = document.querySelector('meta[name="lf-api-base"]');
    const metaVal = normalizeApiBase(meta && meta.content);
    if (metaVal) return metaVal;

    const stored = normalizeApiBase(localStorage.getItem("lf_api_base"));
    if (stored) return stored;

    return "https://findmystuff-backend-d16m.onrender.com/api";
  }

  const API_BASE = resolveApiBase();
  const TOKEN_KEY    = "lf_auth_token";
  const USER_KEY     = "lf_auth_user";
  const USER_TS_KEY  = "lf_auth_user_ts";   // timestamp of last server sync
  const FRESH_TTL_MS = 5 * 60 * 1000;       // 5 minutes — treat cached user as fresh

  // ── Helpers ──────────────────────────────────────────────────────────────
  function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }

  function clearAuthSession() {
    [TOKEN_KEY, USER_KEY, USER_TS_KEY,
     "lf_profile_photo","lf_profile_image","lf_user_dp","lf_user_avatar","lf_prefill_email"]
      .forEach(function (k) { localStorage.removeItem(k); });
  }

  function getStoredUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch (_) { return null; }
  }

  function getUserAge() {
    const ts = parseInt(localStorage.getItem(USER_TS_KEY) || "0", 10);
    return ts ? Date.now() - ts : Infinity;
  }

  function persistAuthSession(user, token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);

    const profileImage = user && typeof user.profileImage === "string" ? user.profileImage.trim() : "";
    const stored = user ? Object.assign({}, user) : null;

    // Keep base64 images in the user object (needed for avatar display)
    // Only clear the separate shortcut keys for base64 (they're too large)
    if (stored) {
      try {
        localStorage.setItem(USER_KEY, JSON.stringify(stored));
        localStorage.setItem(USER_TS_KEY, String(Date.now()));
      } catch (err) {
        console.warn("Storage quota exceeded. Trying to save without profile image.");
        if (stored.profileImage) {
          stored.profileImage = "";
          try {
            localStorage.setItem(USER_KEY, JSON.stringify(stored));
            localStorage.setItem(USER_TS_KEY, String(Date.now()));
          } catch (e) {
            console.error("Failed to save session:", e);
          }
        }
      }
    }

    if (profileImage && !profileImage.startsWith("data:")) {
      // URL-based image: store in shortcut keys for quick access
      ["lf_profile_photo","lf_profile_image","lf_user_dp","lf_user_avatar"]
        .forEach(function (k) { localStorage.setItem(k, profileImage); });
    } else if (!profileImage) {
      // No image at all: clear shortcut keys
      ["lf_profile_photo","lf_profile_image","lf_user_dp","lf_user_avatar"]
        .forEach(function (k) { localStorage.removeItem(k); });
    }
    // base64 case: shortcut keys left as-is; real data lives in lf_auth_user
  }

  function authorizedFetch(path, options) {
    const token = getToken();
    const opts  = Object.assign({}, options || {});
    opts.headers = Object.assign({}, opts.headers || {});
    if (token) opts.headers.Authorization = "Bearer " + token;
    return fetch(API_BASE + path, opts);
  }

  // ── bootstrapUserFromToken ───────────────────────────────────────────────
  // Strategy: stale-while-revalidate
  //   1. If localStorage has a FRESH user (< 5 min old) → return immediately (instant)
  //   2. If localStorage has a STALE user → return it immediately, refresh in background
  //   3. If no stored user → fetch from server and wait
  async function bootstrapUserFromToken() {
    const token = getToken();
    if (!token) return null;

    const storedUser = getStoredUser();
    const age = getUserAge();

    // ── Case 1: Fresh enough — return immediately, no network call ──────────
    if (storedUser && age < FRESH_TTL_MS) {
      // Still revalidate silently in the background every 5 minutes to pick
      // up block/role changes, but don't make the caller wait for it
      if (age > FRESH_TTL_MS / 2) {
        _revalidateInBackground();
      }
      return storedUser;
    }

    // ── Case 2: Stale but have data — return it now, refresh asynchronously ─
    if (storedUser) {
      _revalidateInBackground();
      return storedUser;
    }

    // ── Case 3: No local data — must fetch synchronously ─────────────────────
    return await _fetchFromServer();
  }

  async function _fetchFromServer() {
    try {
      const response = await authorizedFetch("/auth/me");
      const result   = await response.json().catch(function () { return {}; });

      if (response.status === 403 && result.isBlocked) {
        const s = getStoredUser() || {};
        s.isBlocked = true;
        s.blockedAt = result.blockedAt || s.blockedAt || null;
        try {
          localStorage.setItem(USER_KEY, JSON.stringify(s));
          localStorage.setItem(USER_TS_KEY, String(Date.now()));
        } catch (e) {}
        return s;
      }

      if (!response.ok || !result.user) {
        clearAuthSession();
        return null;
      }

      persistAuthSession(result.user, getToken());
      return result.user;
    } catch (_) {
      // Network error — return whatever we have locally
      return getStoredUser();
    }
  }

  function _revalidateInBackground() {
    _fetchFromServer().catch(function () {});
  }

  // ── getProfilePhoto helper ───────────────────────────────────────────────
  // Reads profile photo from localStorage in priority order:
  // 1. lf_profile_photo (URL-based shortcut)
  // 2. lf_auth_user.profileImage (could be URL or base64)
  function getProfilePhoto() {
    const directKeys = ["lf_profile_photo","lf_profile_image","lf_user_dp","lf_user_avatar"];
    for (let i = 0; i < directKeys.length; i++) {
      const v = (localStorage.getItem(directKeys[i]) || "").trim();
      if (v) return v;
    }
    const u = getStoredUser();
    if (!u) return "";
    const candidates = [u.profileImage, u.image, u.photo, u.avatar, u.dp];
    for (let j = 0; j < candidates.length; j++) {
      if (typeof candidates[j] === "string" && candidates[j].trim()) return candidates[j].trim();
    }
    return "";
  }

  // Expose
  window.LFAuth = {
    API_BASE            : API_BASE,
    resolveApiBase      : resolveApiBase,
    setApiBase          : function (v) {
      const n = normalizeApiBase(v);
      if (n) localStorage.setItem("lf_api_base", n); else localStorage.removeItem("lf_api_base");
    },
    clearApiBase        : function () { localStorage.removeItem("lf_api_base"); },
    getToken            : getToken,
    getStoredUser       : getStoredUser,
    getProfilePhoto     : getProfilePhoto,
    persistAuthSession  : persistAuthSession,
    clearAuthSession    : clearAuthSession,
    authorizedFetch     : authorizedFetch,
    bootstrapUserFromToken: bootstrapUserFromToken
  };
}());
