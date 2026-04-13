(function () {
  const API_BASE = window.LFAuth && window.LFAuth.API_BASE
    ? window.LFAuth.API_BASE
    : (localStorage.getItem("lf_api_base") || "https://findmystuff-backend-d16m.onrender.com/api");
  const API_ORIGIN = API_BASE.replace(/\/api\/?$/, "");
  const STORAGE_KEYS = {
    lost: "lf_lost_items",
    found: "lf_found_items"
  };

  function safeParse(value) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return [];
    }
  }

  function getLocalItems(type) {
    const raw = localStorage.getItem(STORAGE_KEYS[type] || "");
    const parsed = safeParse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  }

  function saveLocalItems(type, items) {
    localStorage.setItem(STORAGE_KEYS[type], JSON.stringify(items));
  }

  function stripHeavyLocalFields(item) {
    const nextItem = Object.assign({}, item);
    if (typeof nextItem.image === "string" && nextItem.image.startsWith("data:")) {
      nextItem.image = "";
    }
    return nextItem;
  }

  function compactLocalItems(type) {
    const items = getLocalItems(type);
    if (!items.length) {
      return;
    }

    const compacted = items.map(stripHeavyLocalFields);
    try {
      saveLocalItems(type, compacted);
    } catch (error) {
      localStorage.removeItem(STORAGE_KEYS[type]);
    }
  }

  function toIsoDate(dateValue, timeValue) {
    if (!dateValue) {
      return new Date().toISOString();
    }

    if (timeValue) {
      const combined = new Date(dateValue + "T" + timeValue);
      if (!Number.isNaN(combined.getTime())) {
        return combined.toISOString();
      }
    }

    const onlyDate = new Date(dateValue);
    if (!Number.isNaN(onlyDate.getTime())) {
      return onlyDate.toISOString();
    }

    return new Date().toISOString();
  }

  function resolveImageSrc(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }

    if (
      raw.startsWith("data:")
      || raw.startsWith("blob:")
      || raw.startsWith("http://")
      || raw.startsWith("https://")
    ) {
      return raw;
    }

    if (raw.startsWith("/")) {
      return API_ORIGIN + raw;
    }

    return API_ORIGIN + "/" + raw;
  }

  function normalizeItem(input, fallbackType) {
    const type = String(input.type || fallbackType || "lost").toLowerCase();
    const generatedId = type + "-" + Date.now() + "-" + Math.floor(Math.random() * 100000);

    return {
      id: input.id || input._id || generatedId,
      type: type,
      itemName: input.itemName || input.title || "Untitled item",
      category: input.category || "Other",
      description: input.description || "",
      location: input.location || input.locationLost || input.locationFound || "Unknown location",
      date: input.date || input.dateLost || input.dateFound || new Date().toISOString(),
      reporterName: input.reporterName || input.fullName || "",
      phone: input.phone || "",
      email: input.email || "",
      image: resolveImageSrc(
        input.imageThumb
        || input.thumbnail
        || input.thumb
        || input.previewImage
        || input.preview
        || input.image
        || input.imageUrl
        || input.photo
        || input.photoUrl
        || input.picture
        || input.itemImage
      ),
      fullImage: resolveImageSrc(
        input.image
        || input.imageUrl
        || input.photo
        || input.photoUrl
        || input.picture
        || input.itemImage
      ),
      contactPublic: Boolean(input.contactPublic),
      possession: typeof input.possession === "boolean" ? input.possession : null,
      createdAt: input.createdAt || new Date().toISOString()
    };
  }

  function saveToLocal(type, input) {
    const items = getLocalItems(type);
    const normalized = stripHeavyLocalFields(normalizeItem(input, type));
    items.unshift(normalized);
    saveLocalItems(type, items.map(stripHeavyLocalFields));
    return normalized;
  }

  function normalizeArrayResponse(raw, fallbackType) {
    if (Array.isArray(raw)) {
      return raw.map((item) => normalizeItem(item, fallbackType));
    }

    if (raw && Array.isArray(raw.items)) {
      return raw.items.map((item) => normalizeItem(item, fallbackType));
    }

    return [];
  }

  async function apiRequest(path, options) {
    const nextOptions = Object.assign({}, options || {});
    nextOptions.headers = Object.assign({}, options && options.headers ? options.headers : {});

    if (window.LFAuth && typeof window.LFAuth.getToken === "function") {
      const token = window.LFAuth.getToken();
      if (token) {
        nextOptions.headers.Authorization = "Bearer " + token;
      }
    }

    const response = await fetch(API_BASE + path, nextOptions);
    if (!response.ok) {
      let message = "API request failed for " + path;
      try {
        const errorBody = await response.json();
        message = errorBody.message || errorBody.error || message;
      } catch (error) {
        message = "API request failed for " + path;
      }
      throw new Error(message);
    }
    return response.json();
  }

  function dedupeById(items) {
    const map = new Map();
    items.forEach((item) => {
      const key = item.id || item.itemName + "|" + item.location + "|" + item.date;
      if (!map.has(key)) {
        map.set(key, item);
        return;
      }

      const existing = map.get(key);
      const existingScore = (existing.image ? 1 : 0) + (existing.description ? 1 : 0);
      const incomingScore = (item.image ? 1 : 0) + (item.description ? 1 : 0);

      if (incomingScore > existingScore) {
        map.set(key, item);
      }
    });
    return Array.from(map.values());
  }

  function sortByDateDesc(items) {
    return items.slice().sort((a, b) => {
      const aTime = new Date(a.date).getTime();
      const bTime = new Date(b.date).getTime();
      return bTime - aTime;
    });
  }

  async function fetchTypeFromApi(type) {
    const endpoints = type === "lost"
      ? ["/lost-items", "/lost-items/recent"]
      : ["/found-items"];

    for (let i = 0; i < endpoints.length; i += 1) {
      const path = endpoints[i];
      try {
        const data = await apiRequest(path);
        const normalized = normalizeArrayResponse(data, type);
        if (normalized.length > 0 || path.endsWith("/recent")) {
          return normalized;
        }
      } catch (error) {
        continue;
      }
    }
    return [];
  }

  async function fetchItemsByType(type) {
    const apiItems = await fetchTypeFromApi(type);
    const localItems = getLocalItems(type).map((item) => normalizeItem(item, type));
    const merged = dedupeById(apiItems.concat(localItems));
    return sortByDateDesc(merged);
  }

  async function createLostItem(payload) {
    if (!window.LFAuth || !window.LFAuth.getToken || !window.LFAuth.getToken()) {
      throw new Error("Please login before reporting an item");
    }

    const body = {
      itemName: payload.itemName,
      category: payload.category,
      description: payload.description,
      location: payload.location,
      date: toIsoDate(payload.dateLost, payload.timeLost),
      reporterName: payload.reporterName,
      phone: payload.phone,
      email: payload.email,
      contactPublic: payload.contactPublic,
      image: payload.image || "",
      imageThumb: payload.imageThumb || ""
    };

    const apiResult = await apiRequest("/lost-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const normalized = normalizeItem(apiResult, "lost");
    if (!normalized.image && body.image) {
      normalized.image = body.image;
    }
    return normalized;
  }

  async function createFoundItem(payload) {
    if (!window.LFAuth || !window.LFAuth.getToken || !window.LFAuth.getToken()) {
      throw new Error("Please login before reporting an item");
    }

    const body = {
      itemName: payload.itemName,
      category: payload.category,
      description: payload.description,
      location: payload.location,
      date: toIsoDate(payload.dateFound),
      reporterName: payload.reporterName,
      phone: payload.phone,
      email: payload.email,
      possession: payload.possession,
      image: payload.image || "",
      imageThumb: payload.imageThumb || ""
    };

    const apiResult = await apiRequest("/found-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const normalized = normalizeItem(apiResult, "found");
    if (!normalized.image && body.image) {
      normalized.image = body.image;
    }
    return normalized;
  }

  function matchesDate(itemDate, selectedDate) {
    if (!selectedDate) {
      return true;
    }
    const parsed = new Date(itemDate);
    if (Number.isNaN(parsed.getTime())) {
      return false;
    }
    const itemDay = parsed.toISOString().slice(0, 10);
    return itemDay === selectedDate;
  }

  async function searchItems(filters) {
    const selectedType = String(filters.type || "").toLowerCase();
    const keyword = String(filters.keyword || "").trim().toLowerCase();
    const category = String(filters.category || "").trim().toLowerCase();
    const location = String(filters.location || "").trim().toLowerCase();
    const selectedDate = String(filters.date || "");

    let sources = [];
    if (selectedType === "lost") {
      sources = await fetchItemsByType("lost");
    } else if (selectedType === "found") {
      sources = await fetchItemsByType("found");
    } else {
      const all = await Promise.all([
        fetchItemsByType("lost"),
        fetchItemsByType("found")
      ]);
      sources = all[0].concat(all[1]);
    }

    const filtered = sources.filter((item) => {
      const name = String(item.itemName || "").toLowerCase();
      const description = String(item.description || "").toLowerCase();
      const itemCategory = String(item.category || "").toLowerCase();
      const itemLocation = String(item.location || "").toLowerCase();

      const keywordMatch = !keyword
        || name.includes(keyword)
        || description.includes(keyword)
        || itemCategory.includes(keyword);

      const categoryMatch = !category || itemCategory.includes(category);
      const locationMatch = !location || itemLocation.includes(location);
      const dateMatch = matchesDate(item.date, selectedDate);

      return keywordMatch && categoryMatch && locationMatch && dateMatch;
    });

    return sortByDateDesc(filtered);
  }

  async function fetchRecentLostItems(limit) {
    const max = typeof limit === "number" ? limit : 10;

    try {
      const data = await apiRequest("/lost-items/recent?limit=" + encodeURIComponent(String(max)));
      return normalizeArrayResponse(data, "lost").slice(0, max);
    } catch (error) {
      const items = await fetchItemsByType("lost");
      return items.slice(0, max);
    }
  }

  compactLocalItems("lost");
  compactLocalItems("found");

  window.LFStore = {
    createLostItem: createLostItem,
    createFoundItem: createFoundItem,
    fetchRecentLostItems: fetchRecentLostItems,
    searchItems: searchItems,
    fetchLostItems: function () { return fetchItemsByType("lost"); },
    fetchFoundItems: function () { return fetchItemsByType("found"); }
  };
}());
