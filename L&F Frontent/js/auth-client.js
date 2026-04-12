(function () {
  function normalizeApiBase(value) {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }

    return text.replace(/\/+$/, "");
  }

  function resolveApiBase() {
    try {
      const url = new URL(window.location.href);
      const queryValue = normalizeApiBase(url.searchParams.get("apiBase"));
      if (queryValue) {
        localStorage.setItem("lf_api_base", queryValue);
        return queryValue;
      }

      const hostname = String(url.hostname || "").toLowerCase();
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        localStorage.removeItem("lf_api_base");
        return "http://localhost:5001/api";
      }
    } catch (error) {
      // Ignore URL parsing failures and continue to other sources.
    }

    const windowValue = normalizeApiBase(window.LF_API_BASE);
    if (windowValue) {
      return windowValue;
    }

    const metaTag = document.querySelector('meta[name="lf-api-base"]');
    const metaValue = normalizeApiBase(metaTag && metaTag.content);
    if (metaValue) {
      return metaValue;
    }

    const storedValue = normalizeApiBase(localStorage.getItem("lf_api_base"));
    if (storedValue) {
      return storedValue;
    }

    return "http://localhost:5001/api";
  }

  const API_BASE = resolveApiBase();

  function getToken() {
    return localStorage.getItem("lf_auth_token") || "";
  }

  function clearAuthSession() {
    [
      "lf_auth_token",
      "lf_auth_user",
      "lf_profile_photo",
      "lf_profile_image",
      "lf_user_dp",
      "lf_user_avatar",
      "lf_prefill_email"
    ].forEach(function (key) {
      localStorage.removeItem(key);
    });
  }

  function persistAuthSession(user, token) {
    if (token) {
      localStorage.setItem("lf_auth_token", token);
    }

    const profileImage = user && typeof user.profileImage === "string" ? user.profileImage.trim() : "";
    const storedUser = user ? Object.assign({}, user) : null;
    if (storedUser && profileImage && profileImage.startsWith("data:")) {
      storedUser.profileImage = "";
    }

    if (storedUser) {
      localStorage.setItem("lf_auth_user", JSON.stringify(storedUser));
    }

    if (profileImage && !profileImage.startsWith("data:")) {
      localStorage.setItem("lf_profile_photo", profileImage);
      localStorage.setItem("lf_profile_image", profileImage);
      localStorage.setItem("lf_user_dp", profileImage);
      localStorage.setItem("lf_user_avatar", profileImage);
      return;
    }

    localStorage.removeItem("lf_profile_photo");
    localStorage.removeItem("lf_profile_image");
    localStorage.removeItem("lf_user_dp");
    localStorage.removeItem("lf_user_avatar");
  }

  function getStoredUser() {
    const raw = localStorage.getItem("lf_auth_user");
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  async function authorizedFetch(path, options) {
    const token = getToken();
    const nextOptions = Object.assign({}, options || {});
    nextOptions.headers = Object.assign({}, options && options.headers ? options.headers : {});

    if (token) {
      nextOptions.headers.Authorization = "Bearer " + token;
    }

    return fetch(API_BASE + path, nextOptions);
  }

  async function bootstrapUserFromToken() {
    const token = getToken();
    if (!token) {
      return null;
    }

    try {
      const response = await authorizedFetch("/auth/me");
      const result = await response.json().catch(function () {
        return {};
      });

      if (!response.ok || !result.user) {
        clearAuthSession();
        return null;
      }

      persistAuthSession(result.user, token);
      return result.user;
    } catch (error) {
      return getStoredUser();
    }
  }

  window.LFAuth = {
    API_BASE: API_BASE,
    resolveApiBase: resolveApiBase,
    setApiBase: function (value) {
      const nextValue = normalizeApiBase(value);
      if (!nextValue) {
        localStorage.removeItem("lf_api_base");
        return;
      }
      localStorage.setItem("lf_api_base", nextValue);
    },
    clearApiBase: function () {
      localStorage.removeItem("lf_api_base");
    },
    getToken: getToken,
    getStoredUser: getStoredUser,
    persistAuthSession: persistAuthSession,
    clearAuthSession: clearAuthSession,
    authorizedFetch: authorizedFetch,
    bootstrapUserFromToken: bootstrapUserFromToken
  };
}());
