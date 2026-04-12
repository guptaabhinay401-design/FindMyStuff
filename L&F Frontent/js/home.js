function formatHomeDate(dateValue) {
  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return "Date unavailable";
  }

  return parsedDate.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

async function loadRecentItems() {
  const container = document.getElementById("recentItems");
  if (!container || !window.LFStore) {
    return;
  }

  try {
    const items = await window.LFStore.fetchRecentLostItems(8);
    container.innerHTML = "";

    if (!Array.isArray(items) || items.length === 0) {
      container.innerHTML = '<div class="empty-state">No recent lost items found right now.</div>';
      return;
    }

    const fragment = document.createDocumentFragment();

    items.forEach(function (item) {
      const card = document.createElement("article");
      const preview = document.createElement("div");
      const title = document.createElement("h3");
      const meta = document.createElement("div");
      const location = document.createElement("span");
      const dateNode = document.createElement("span");

      card.className = "item-card";
      preview.className = "item-preview";
      meta.className = "item-meta";
      location.className = "item-location";

      if (item.image) {
        const image = document.createElement("img");
        image.className = "item-image";
        image.src = item.image;
        image.alt = (item.itemName || "Item") + " photo";
        image.loading = "lazy";
        image.addEventListener("error", function () {
          preview.innerHTML = '<span class="item-fallback">No Photo</span>';
        });
        preview.appendChild(image);
      } else {
        preview.innerHTML = '<span class="item-fallback">No Photo</span>';
      }

      title.textContent = item.itemName || "Unnamed item";
      location.textContent = item.location || "Unknown location";
      dateNode.textContent = formatHomeDate(item.date);

      meta.appendChild(location);
      meta.appendChild(dateNode);
      card.appendChild(preview);
      card.appendChild(title);
      card.appendChild(meta);
      fragment.appendChild(card);
    });

    container.appendChild(fragment);
  } catch (error) {
    console.error("Error loading items:", error);
    container.innerHTML = '<div class="error-state">Unable to load recent items. Please try again in a moment.</div>';
  }
}

document.addEventListener("DOMContentLoaded", loadRecentItems);
