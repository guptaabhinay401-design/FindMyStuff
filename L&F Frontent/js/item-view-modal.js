/**
 * item-view-modal.js — Premium item detail modal v2
 * Usage: window.LFItemModal.open(itemId)
 */
(function () {
  'use strict';

  function getApiBase() {
    return (window.LFAuth && window.LFAuth.API_BASE) ||
      'https://findmystuff-backend-d16m.onrender.com/api';
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     STYLES
  ═══════════════════════════════════════════════════════════════════════════ */
  const STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

  #lf-modal-overlay {
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(7, 15, 30, 0.6);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: 1rem;
    opacity: 0; pointer-events: none;
    transition: opacity .25s ease;
  }
  #lf-modal-overlay.lf-open {
    opacity: 1; pointer-events: all;
  }

  #lf-modal-box {
    background: #ffffff;
    border-radius: 20px;
    box-shadow: 0 32px 80px rgba(0,0,0,.22), 0 8px 24px rgba(0,0,0,.1);
    border: 1px solid #e2e8f0;
    width: 100%; max-width: 580px;
    max-height: 92vh;
    overflow-y: auto;
    overflow-x: hidden;
    transform: scale(.95) translateY(16px);
    transition: transform .28s cubic-bezier(.34,1.2,.64,1);
    font-family: 'Inter', system-ui, sans-serif;
    scrollbar-width: thin;
    scrollbar-color: #e2e8f0 transparent;
  }
  #lf-modal-box::-webkit-scrollbar { width: 5px; }
  #lf-modal-box::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }

  #lf-modal-overlay.lf-open #lf-modal-box {
    transform: scale(1) translateY(0);
  }

  /* Header */
  .lfm-header {
    display: flex; align-items: center; justify-content: space-between;
    gap: .75rem;
    padding: 1rem 1.25rem .85rem;
    border-bottom: 1.5px solid #f1f5f9;
    position: sticky; top: 0;
    background: rgba(255,255,255,.96);
    backdrop-filter: blur(12px);
    z-index: 2;
    border-radius: 20px 20px 0 0;
  }
  .lfm-header-left { display: flex; align-items: center; gap: .6rem; min-width: 0; }
  .lfm-logo { color: #1d4ed8; font-size: .95rem; flex-shrink: 0; }
  .lfm-title {
    font-size: .95rem; font-weight: 700; color: #0f172a;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    max-width: 320px;
  }
  .lfm-close {
    width: 32px; height: 32px; border-radius: 50%;
    border: 1.5px solid #e2e8f0; background: #f8fafc;
    color: #64748b; font-size: .82rem; cursor: pointer; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: background .15s, color .15s, border-color .15s, transform .15s;
  }
  .lfm-close:hover { background: #fef2f2; color: #dc2626; border-color: #fecaca; transform: scale(1.1); }

  /* Image zone */
  .lfm-img-zone {
    width: 100%; height: 260px;
    background: linear-gradient(135deg, #e0e7ff 0%, #dbeafe 100%);
    display: flex; align-items: center; justify-content: center;
    overflow: hidden; position: relative;
    flex-shrink: 0;
  }
  .lfm-img-zone img {
    width: 100%; height: 100%;
    object-fit: contain;
    transition: transform .3s ease;
    cursor: zoom-in;
  }
  .lfm-img-zone img:hover { transform: scale(1.06); }
  .lfm-img-placeholder {
    display: flex; flex-direction: column; align-items: center; gap: .6rem;
    color: #93c5fd;
  }
  .lfm-img-placeholder i { font-size: 3rem; }
  .lfm-img-placeholder span { font-size: .72rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #a5b4fc; }

  /* Type strip (colored top edge) */
  .lfm-type-strip {
    height: 3px; width: 100%;
    background: linear-gradient(90deg, #1d4ed8, #3b82f6);
  }
  .lfm-type-strip.found { background: linear-gradient(90deg, #16a34a, #22c55e); }

  /* Body */
  .lfm-body { padding: 1.25rem 1.4rem 1.5rem; }

  /* Badges */
  .lfm-badges { display: flex; gap: .4rem; flex-wrap: wrap; margin-bottom: .9rem; }
  .lfm-badge {
    display: inline-flex; align-items: center; gap: .28rem;
    padding: .22rem .7rem; border-radius: 20px;
    font-size: .7rem; font-weight: 800; letter-spacing: .03em; text-transform: uppercase;
  }
  .lfm-badge-lost    { background: #fef2f2; color: #dc2626; border: 1.5px solid #fecaca; }
  .lfm-badge-found   { background: #f0fdf4; color: #16a34a; border: 1.5px solid #bbf7d0; }
  .lfm-badge-active  { background: #eff6ff; color: #1d4ed8; border: 1.5px solid #bfdbfe; }
  .lfm-badge-resolved{ background: #f0fdf4; color: #16a34a; border: 1.5px solid #bbf7d0; }
  .lfm-badge-rejected{ background: #fef9c3; color: #b45309; border: 1.5px solid #fde68a; }
  .lfm-badge-cat     { background: #faf5ff; color: #7c3aed; border: 1.5px solid #e9d5ff; }

  /* Item name */
  .lfm-name {
    font-size: 1.25rem; font-weight: 800; color: #0f172a;
    line-height: 1.3; margin-bottom: .9rem; letter-spacing: -.01em;
  }

  /* Info grid */
  .lfm-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; margin-bottom: .9rem;
  }
  .lfm-field {
    background: #f8fafc;
    border: 1.5px solid #f1f5f9;
    border-radius: 12px;
    padding: .65rem .85rem;
    transition: border-color .15s;
  }
  .lfm-field:hover { border-color: #bfdbfe; }
  .lfm-field-label {
    font-size: .65rem; font-weight: 700; color: #94a3b8;
    letter-spacing: .05em; text-transform: uppercase;
    margin-bottom: .22rem; display: flex; align-items: center; gap: .3rem;
  }
  .lfm-field-label i { color: #1d4ed8; font-size: .6rem; }
  .lfm-field-value { font-size: .88rem; font-weight: 600; color: #1e293b; }

  /* Full-width field */
  .lfm-field-full { grid-column: 1 / -1; }

  /* Description */
  .lfm-desc {
    background: #f8fafc; border-radius: 12px;
    border: 1.5px solid #f1f5f9;
    padding: .85rem 1rem; margin-bottom: 1rem;
  }
  .lfm-desc-label {
    font-size: .65rem; font-weight: 700; color: #94a3b8;
    text-transform: uppercase; letter-spacing: .05em;
    margin-bottom: .4rem; display: flex; align-items: center; gap: .3rem;
  }
  .lfm-desc-label i { color: #1d4ed8; font-size: .6rem; }
  .lfm-desc-text {
    font-size: .875rem; color: #475569; line-height: 1.65;
  }

  /* Divider */
  .lfm-divider { height: 1.5px; background: #f1f5f9; margin: .9rem 0; border: 0; }

  /* Contact banner */
  .lfm-contact-banner {
    background: linear-gradient(135deg, #eff6ff, #f0fdf4);
    border: 1.5px solid #bfdbfe;
    border-radius: 12px;
    padding: .75rem 1rem;
    margin-bottom: 1rem;
    display: flex; align-items: center; gap: .75rem;
  }
  .lfm-contact-icon {
    width: 36px; height: 36px; border-radius: 10px;
    background: linear-gradient(135deg, #dbeafe, #bbf7d0);
    display: flex; align-items: center; justify-content: center;
    color: #1d4ed8; font-size: .9rem; flex-shrink: 0;
  }
  .lfm-contact-label { font-size: .68rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .04em; }
  .lfm-contact-value { font-size: .88rem; font-weight: 700; color: #0f172a; }

  /* CTA buttons */
  .lfm-cta-row {
    display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; margin-top: .5rem;
  }
  .lfm-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: .4rem;
    padding: .72rem 1rem; border-radius: 12px; cursor: pointer;
    font-family: 'Inter', system-ui, sans-serif;
    font-size: .875rem; font-weight: 700; border: none;
    text-decoration: none; transition: transform .15s, box-shadow .15s;
  }
  .lfm-btn:hover { transform: translateY(-1px); }
  .lfm-btn-primary {
    background: linear-gradient(135deg, #1d4ed8, #2563eb);
    color: #fff;
    box-shadow: 0 4px 14px rgba(29,78,216,.35);
  }
  .lfm-btn-primary:hover { box-shadow: 0 6px 20px rgba(29,78,216,.45); }
  .lfm-btn-success {
    background: linear-gradient(135deg, #16a34a, #22c55e);
    color: #fff;
    box-shadow: 0 4px 14px rgba(22,163,74,.32);
  }
  .lfm-btn-success:hover { box-shadow: 0 6px 20px rgba(22,163,74,.42); }
  .lfm-btn-ghost {
    background: #f8fafc; border: 1.5px solid #e2e8f0; color: #475569;
    box-shadow: none;
  }
  .lfm-btn-ghost:hover { background: #f1f5f9; color: #0f172a; }

  /* Loader / Error */
  .lfm-loader {
    padding: 3.5rem 2rem; text-align: center; color: #94a3b8; font-family: 'Inter', sans-serif;
  }
  .lfm-loader i { font-size: 1.8rem; margin-bottom: .6rem; display: block; color: #bfdbfe; }
  .lfm-loader span { font-size: .875rem; }
  .lfm-error {
    padding: 2.5rem; text-align: center; color: #dc2626; font-family: 'Inter', sans-serif;
  }
  .lfm-error i { font-size: 2rem; margin-bottom: .5rem; display: block; }
  .lfm-error span { font-size: .875rem; font-weight: 600; }

  /* Lightbox */
  #lf-lightbox {
    position: fixed; inset: 0; z-index: 999999;
    background: rgba(0,0,0,.92);
    display: flex; align-items: center; justify-content: center;
    padding: 1rem;
    opacity: 0; pointer-events: none;
    transition: opacity .2s ease;
  }
  #lf-lightbox.lf-lb-open { opacity: 1; pointer-events: all; }
  #lf-lightbox img {
    max-width: 100%; max-height: 90vh;
    object-fit: contain; border-radius: 12px;
    box-shadow: 0 0 60px rgba(0,0,0,.5);
    transform: scale(.96);
    transition: transform .22s ease;
  }
  #lf-lightbox.lf-lb-open img { transform: scale(1); }
  #lf-lightbox-close {
    position: absolute; top: 1rem; right: 1rem;
    width: 40px; height: 40px; border-radius: 50%;
    background: rgba(255,255,255,.15); border: 1.5px solid rgba(255,255,255,.25);
    color: #fff; font-size: 1rem; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background .15s;
  }
  #lf-lightbox-close:hover { background: rgba(255,255,255,.28); }

  /* Responsive */
  @media (max-width: 480px) {
    #lf-modal-box { max-height: 96vh; max-width: 100%; border-radius: 16px 16px 0 0; }
    #lf-modal-overlay { align-items: flex-end; padding: 0; }
    .lfm-grid { grid-template-columns: 1fr; }
    .lfm-cta-row { grid-template-columns: 1fr; }
    .lfm-img-zone { height: 200px; }
    .lfm-title { max-width: 200px; }
  }
  `;

  /* ═══════════════════════════════════════════════════════════════════════════
     LIGHTBOX
  ═══════════════════════════════════════════════════════════════════════════ */
  function openLightbox(src, alt) {
    let lb = document.getElementById('lf-lightbox');
    if (!lb) {
      lb = document.createElement('div');
      lb.id = 'lf-lightbox';
      lb.innerHTML = `<button id="lf-lightbox-close" aria-label="Close lightbox"><i class="fa-solid fa-xmark"></i></button><img alt="" />`;
      document.body.appendChild(lb);
      document.getElementById('lf-lightbox-close').addEventListener('click', closeLightbox);
      lb.addEventListener('click', function(e) { if (e.target === lb) closeLightbox(); });
    }
    lb.querySelector('img').src = src;
    lb.querySelector('img').alt = alt || '';
    lb.classList.add('lf-lb-open');
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    const lb = document.getElementById('lf-lightbox');
    if (lb) lb.classList.remove('lf-lb-open');
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     INJECT
  ═══════════════════════════════════════════════════════════════════════════ */
  function injectStyles() {
    if (document.getElementById('lf-modal-style-v2')) return;
    const el = document.createElement('style');
    el.id = 'lf-modal-style-v2';
    el.textContent = STYLE;
    document.head.appendChild(el);
  }

  function injectHTML() {
    if (document.getElementById('lf-modal-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'lf-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'lf-modal-title');
    overlay.innerHTML = `
      <div id="lf-modal-box">
        <div class="lfm-header">
          <div class="lfm-header-left">
            <i class="fa-solid fa-magnifying-glass lfm-logo"></i>
            <span class="lfm-title" id="lf-modal-title">Item Details</span>
          </div>
          <button class="lfm-close" id="lf-modal-close-btn" aria-label="Close">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div id="lf-modal-content">
          <div class="lfm-loader">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>Loading item details…</span>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById('lf-modal-close-btn').addEventListener('click', close);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') close(); });
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     OPEN / CLOSE
  ═══════════════════════════════════════════════════════════════════════════ */
  function open(itemId) {
    injectStyles();
    injectHTML();

    const overlay = document.getElementById('lf-modal-overlay');
    const content = document.getElementById('lf-modal-content');
    const titleEl = document.getElementById('lf-modal-title');

    titleEl.textContent = 'Item Details';
    content.innerHTML = `<div class="lfm-loader"><i class="fa-solid fa-spinner fa-spin"></i><span>Loading…</span></div>`;
    overlay.classList.add('lf-open');
    document.body.style.overflow = 'hidden';

    const API_BASE = getApiBase();
    fetch(API_BASE + '/items/' + itemId)
      .then(function(r) { return r.json(); })
      .then(function(data) { render(data.item || data, content, titleEl); })
      .catch(function() {
        content.innerHTML = `<div class="lfm-error">
          <i class="fa-solid fa-circle-exclamation"></i>
          <span>Could not load item details. Please try again.</span>
        </div>`;
      });
  }

  function close() {
    const overlay = document.getElementById('lf-modal-overlay');
    if (overlay) overlay.classList.remove('lf-open');
    closeLightbox();
    document.body.style.overflow = '';
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     HELPERS
  ═══════════════════════════════════════════════════════════════════════════ */
  function fmt(v) {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d.toLocaleDateString(undefined, { day:'2-digit', month:'short', year:'numeric' });
  }
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════════════ */
  function render(item, content, titleEl) {
    if (!item) {
      content.innerHTML = `<div class="lfm-error"><i class="fa-solid fa-circle-exclamation"></i><span>Item not found.</span></div>`;
      return;
    }

    const name = esc(item.itemName) || 'Unnamed Item';
    titleEl.textContent = item.itemName || 'Item Details';

    const isLost  = (item.type || '').toLowerCase() !== 'found';
    const imgSrc  = item.image || item.imageThumb || '';

    /* ── Type strip ── */
    const strip = `<div class="lfm-type-strip ${isLost ? '' : 'found'}"></div>`;

    /* ── Image zone ── */
    let imgZone;
    if (imgSrc) {
      imgZone = `
        <div class="lfm-img-zone" id="lfm-imgzone-wrap">
          <img src="${esc(imgSrc)}" alt="${name}" loading="lazy" id="lfm-modal-photo">
        </div>`;
    } else {
      imgZone = `
        <div class="lfm-img-zone">
          <div class="lfm-img-placeholder">
            <i class="fa-solid fa-${isLost ? 'magnifying-glass' : 'box-open'}"></i>
            <span>No Photo</span>
          </div>
        </div>`;
    }

    /* ── Badges ── */
    const typeBadge = isLost
      ? `<span class="lfm-badge lfm-badge-lost"><i class="fa-solid fa-magnifying-glass"></i> Lost</span>`
      : `<span class="lfm-badge lfm-badge-found"><i class="fa-solid fa-box-open"></i> Found</span>`;

    const stMap = { active:'lfm-badge-active', resolved:'lfm-badge-resolved', rejected:'lfm-badge-rejected' };
    const stClass = stMap[(item.status||'').toLowerCase()] || 'lfm-badge-active';
    const statusBadge = `<span class="lfm-badge ${stClass}">${esc(item.status||'Active')}</span>`;

    const catBadge = item.category
      ? `<span class="lfm-badge lfm-badge-cat"><i class="fa-solid fa-tag"></i> ${esc(item.category)}</span>`
      : '';

    /* ── Info grid ── */
    const locationField = `
      <div class="lfm-field">
        <div class="lfm-field-label"><i class="fa-solid fa-location-dot"></i> Location</div>
        <div class="lfm-field-value">${esc(item.location) || '—'}</div>
      </div>`;

    const dateField = `
      <div class="lfm-field">
        <div class="lfm-field-label"><i class="fa-solid fa-calendar-days"></i> ${isLost ? 'Date Lost' : 'Date Found'}</div>
        <div class="lfm-field-value">${fmt(item.date || item.createdAt)}</div>
      </div>`;

    const timeField = item.timeLost ? `
      <div class="lfm-field">
        <div class="lfm-field-label"><i class="fa-solid fa-clock"></i> Time</div>
        <div class="lfm-field-value">${esc(item.timeLost)}</div>
      </div>` : '';

    const reporterField = `
      <div class="lfm-field">
        <div class="lfm-field-label"><i class="fa-solid fa-user"></i> Reported By</div>
        <div class="lfm-field-value">${esc(item.reporterName) || '—'}</div>
      </div>`;

    const possessionField = item.possession ? `
      <div class="lfm-field">
        <div class="lfm-field-label"><i class="fa-solid fa-hands-holding"></i> Item With</div>
        <div class="lfm-field-value">${esc(item.possession)}</div>
      </div>` : '';

    /* ── Contact ── */
    const contactHtml = item.contactPublic && (item.phone || item.email) ? `
      <div class="lfm-contact-banner">
        <div class="lfm-contact-icon"><i class="fa-solid fa-address-book"></i></div>
        <div>
          <div class="lfm-contact-label">Contact Info</div>
          <div class="lfm-contact-value">${esc(item.phone || item.email)}</div>
        </div>
      </div>` : '';

    /* ── Description ── */
    const descHtml = item.description ? `
      <div class="lfm-desc">
        <div class="lfm-desc-label"><i class="fa-solid fa-align-left"></i> Description</div>
        <div class="lfm-desc-text">${esc(item.description)}</div>
      </div>` : '';

    /* ── CTA Buttons ── */
    const isLoggedIn = Boolean(localStorage.getItem('lf_auth_token'));
    let primaryBtn, secondaryBtn;

    if (isLost) {
      primaryBtn = isLoggedIn
        ? `<a href="search.html?itemId=${esc(item._id)}&action=claim" class="lfm-btn lfm-btn-success">
             <i class="fa-solid fa-handshake"></i> I Found This
           </a>`
        : `<a href="login.html" class="lfm-btn lfm-btn-primary">
             <i class="fa-solid fa-right-to-bracket"></i> Login to Claim
           </a>`;
    } else {
      primaryBtn = isLoggedIn
        ? `<a href="search.html?itemId=${esc(item._id)}&action=claim" class="lfm-btn lfm-btn-primary">
             <i class="fa-solid fa-hand-holding"></i> This is Mine
           </a>`
        : `<a href="login.html" class="lfm-btn lfm-btn-primary">
             <i class="fa-solid fa-right-to-bracket"></i> Login to Claim
           </a>`;
    }

    secondaryBtn = `<a href="search.html?itemId=${esc(item._id)}" class="lfm-btn lfm-btn-ghost">
      <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:.72rem;"></i> Full Details
    </a>`;

    /* ── Assemble ── */
    content.innerHTML = `
      ${strip}
      ${imgZone}
      <div class="lfm-body">
        <div class="lfm-badges">${typeBadge}${statusBadge}${catBadge}</div>
        <div class="lfm-name">${name}</div>
        <div class="lfm-grid">
          ${locationField}
          ${dateField}
          ${timeField}
          ${reporterField}
          ${possessionField}
        </div>
        ${descHtml}
        ${contactHtml}
        <hr class="lfm-divider">
        <div class="lfm-cta-row">
          ${primaryBtn}
          ${secondaryBtn}
        </div>
      </div>`;

    /* ── Lightbox click ── */
    if (imgSrc) {
      const photoEl = document.getElementById('lfm-modal-photo');
      if (photoEl) {
        photoEl.addEventListener('click', function() {
          openLightbox(imgSrc, item.itemName||'Item photo');
        });
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     EXPOSE
  ═══════════════════════════════════════════════════════════════════════════ */
  window.LFItemModal = { open: open, close: close };
})();
