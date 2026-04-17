/**
 * item-view-modal.js — Reusable item detail modal
 * Include this script on any page where you want in-place item viewing.
 * Usage: window.LFItemModal.open(itemId)
 */
(function () {
  'use strict';

  const API_BASE = (window.LFAuth && window.LFAuth.API_BASE) ||
    'https://findmystuff-backend-d16m.onrender.com/api';

  // ── INJECT STYLES ──────────────────────────────────────
  const STYLE = `
  #lf-item-modal-overlay {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(15,23,42,.55);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    padding: 1rem;
    opacity: 0; pointer-events: none;
    transition: opacity .22s ease;
  }
  #lf-item-modal-overlay.open {
    opacity: 1; pointer-events: all;
  }
  #lf-item-modal-box {
    background: #fff;
    border-radius: 18px;
    box-shadow: 0 20px 60px rgba(0,0,0,.18);
    width: 100%; max-width: 560px;
    max-height: 90vh;
    overflow-y: auto;
    transform: translateY(18px) scale(.97);
    transition: transform .22s ease;
    font-family: 'Inter', system-ui, sans-serif;
  }
  #lf-item-modal-overlay.open #lf-item-modal-box {
    transform: translateY(0) scale(1);
  }
  .lf-modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1.1rem 1.4rem .9rem;
    border-bottom: 1px solid #e2e8f0;
    position: sticky; top: 0; background: #fff; z-index: 1;
    border-radius: 18px 18px 0 0;
  }
  .lf-modal-title { font-size: 1rem; font-weight: 700; color: #0f172a; }
  .lf-modal-close {
    width: 32px; height: 32px; border-radius: 8px;
    border: 1.5px solid #e2e8f0; background: #f8fafc;
    color: #64748b; font-size: .9rem; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: .15s;
  }
  .lf-modal-close:hover { background: #fee2e2; color: #dc2626; border-color: #fecaca; }
  .lf-modal-body { padding: 1.25rem 1.4rem 1.5rem; }
  .lf-modal-img {
    width: 100%; max-height: 240px; object-fit: cover;
    border-radius: 12px; margin-bottom: 1.1rem;
    background: #f1f5f9;
  }
  .lf-modal-img-placeholder {
    width: 100%; height: 140px; border-radius: 12px;
    background: linear-gradient(135deg,#e0e7ff,#dbeafe);
    display: flex; align-items: center; justify-content: center;
    color: #93c5fd; font-size: 2.5rem; margin-bottom: 1.1rem;
  }
  .lf-modal-badges { display: flex; gap: .4rem; flex-wrap: wrap; margin-bottom: .85rem; }
  .lf-badge {
    display: inline-flex; align-items: center; gap: .25rem;
    padding: .2rem .65rem; border-radius: 20px;
    font-size: .72rem; font-weight: 700; letter-spacing: .02em;
  }
  .lf-badge-lost    { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
  .lf-badge-found   { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
  .lf-badge-active  { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
  .lf-badge-resolved{ background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
  .lf-badge-rejected{ background: #fef9c3; color: #b45309; border: 1px solid #fde68a; }
  .lf-badge-cat     { background: #faf5ff; color: #7c3aed; border: 1px solid #e9d5ff; }
  .lf-item-name {
    font-size: 1.2rem; font-weight: 800; color: #0f172a; margin-bottom: .6rem;
    line-height: 1.35;
  }
  .lf-info-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: .55rem; margin-bottom: .9rem;
  }
  .lf-info-field {
    background: #f8fafc; border-radius: 10px; padding: .55rem .75rem;
  }
  .lf-info-label {
    font-size: .7rem; font-weight: 700; color: #94a3b8; letter-spacing: .04em;
    text-transform: uppercase; margin-bottom: .18rem;
  }
  .lf-info-value { font-size: .85rem; font-weight: 600; color: #1e293b; }
  .lf-description {
    background: #f8fafc; border-radius: 10px; padding: .7rem .9rem;
    font-size: .85rem; color: #475569; line-height: 1.6; margin-bottom: .9rem;
  }
  .lf-description-label {
    font-size: .7rem; font-weight: 700; color: #94a3b8;
    text-transform: uppercase; letter-spacing: .04em; margin-bottom: .3rem;
  }
  .lf-modal-loader {
    padding: 3rem; text-align: center; color: #94a3b8;
    font-size: .9rem;
  }
  .lf-modal-loader i { font-size: 1.5rem; margin-bottom: .5rem; display: block; }
  .lf-modal-error {
    padding: 2rem; text-align: center; color: #dc2626; font-size: .9rem;
  }
  .lf-full-page-link {
    display: inline-flex; align-items: center; gap: .35rem;
    font-size: .82rem; font-weight: 600; color: #1d4ed8;
    text-decoration: none; margin-top: .25rem;
  }
  .lf-full-page-link:hover { text-decoration: underline; }
  @media (max-width: 480px) {
    #lf-item-modal-box { max-height: 95vh; }
    .lf-info-grid { grid-template-columns: 1fr; }
  }
  `;

  function injectStyles() {
    if (document.getElementById('lf-modal-style')) return;
    const el = document.createElement('style');
    el.id = 'lf-modal-style';
    el.textContent = STYLE;
    document.head.appendChild(el);
  }

  function injectHTML() {
    if (document.getElementById('lf-item-modal-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'lf-item-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'lf-modal-item-title');
    overlay.innerHTML = `
      <div id="lf-item-modal-box">
        <div class="lf-modal-header">
          <span class="lf-modal-title" id="lf-modal-item-title">Item Details</span>
          <button class="lf-modal-close" id="lf-modal-close-btn" aria-label="Close">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="lf-modal-body" id="lf-modal-content">
          <div class="lf-modal-loader">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading item details…
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Close handlers
    document.getElementById('lf-modal-close-btn').addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  function open(itemId) {
    injectStyles();
    injectHTML();

    const overlay = document.getElementById('lf-item-modal-overlay');
    const content = document.getElementById('lf-modal-content');
    const title   = document.getElementById('lf-modal-item-title');

    title.textContent = 'Item Details';
    content.innerHTML = `
      <div class="lf-modal-loader">
        <i class="fa-solid fa-spinner fa-spin"></i>
        Loading item details…
      </div>`;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    fetch(API_BASE + '/items/' + itemId)
      .then(function (r) { return r.json(); })
      .then(function (data) { render(data.item || data, content, title); })
      .catch(function () {
        content.innerHTML = `
          <div class="lf-modal-error">
            <i class="fa-solid fa-circle-exclamation" style="font-size:1.5rem;margin-bottom:.5rem;display:block;"></i>
            Could not load item details. Please try again.
          </div>`;
      });
  }

  function close() {
    const overlay = document.getElementById('lf-item-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  function fmt(v) {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function render(item, content, title) {
    if (!item) {
      content.innerHTML = `<div class="lf-modal-error">Item not found.</div>`;
      return;
    }

    title.textContent = item.itemName || 'Item Details';

    const typeBadge = item.type === 'lost'
      ? `<span class="lf-badge lf-badge-lost"><i class="fa-solid fa-magnifying-glass"></i> Lost</span>`
      : `<span class="lf-badge lf-badge-found"><i class="fa-solid fa-box-open"></i> Found</span>`;

    const stMap = { active: 'lf-badge-active', resolved: 'lf-badge-resolved', rejected: 'lf-badge-rejected' };
    const stClass = stMap[(item.status || '').toLowerCase()] || 'lf-badge-active';
    const statusBadge = `<span class="lf-badge ${stClass}">${item.status || 'active'}</span>`;
    const catBadge = item.category
      ? `<span class="lf-badge lf-badge-cat"><i class="fa-solid fa-tag"></i> ${item.category}</span>`
      : '';

    const imgHtml = item.image || item.imageThumb
      ? `<img class="lf-modal-img" src="${item.image || item.imageThumb}" alt="${item.itemName || 'Item'}" loading="lazy">`
      : `<div class="lf-modal-img-placeholder"><i class="fa-solid fa-${item.type === 'lost' ? 'magnifying-glass' : 'box-open'}"></i></div>`;

    const descHtml = item.description
      ? `<div class="lf-description">
          <div class="lf-description-label">Description</div>
          ${item.description}
        </div>` : '';

    const contact = item.contactPublic
      ? `<div class="lf-info-field">
          <div class="lf-info-label">Contact</div>
          <div class="lf-info-value">${item.phone || item.email || '—'}</div>
        </div>` : '';

    content.innerHTML = `
      ${imgHtml}
      <div class="lf-modal-badges">${typeBadge}${statusBadge}${catBadge}</div>
      <div class="lf-item-name">${item.itemName || '—'}</div>
      <div class="lf-info-grid">
        <div class="lf-info-field">
          <div class="lf-info-label"><i class="fa-solid fa-location-dot"></i> Location</div>
          <div class="lf-info-value">${item.location || '—'}</div>
        </div>
        <div class="lf-info-field">
          <div class="lf-info-label"><i class="fa-solid fa-calendar"></i> Date</div>
          <div class="lf-info-value">${fmt(item.date || item.createdAt)}</div>
        </div>
        <div class="lf-info-field">
          <div class="lf-info-label"><i class="fa-solid fa-user"></i> Reported By</div>
          <div class="lf-info-value">${item.reporterName || '—'}</div>
        </div>
        ${contact}
      </div>
      ${descHtml}
      <a href="search.html?itemId=${item._id}" class="lf-full-page-link" target="_blank">
        <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:.7rem;"></i>
        Open full details page
      </a>
    `;
  }

  // Expose globally
  window.LFItemModal = { open: open, close: close };
})();
