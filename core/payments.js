"use strict";

const billing = require("./billing");
function waNotify(db, event, payload){try{require("./wa").notify(db,event,payload).catch(()=>{})}catch(_){}}
function mailNotify(db, event, payload){try{require("./mail-notify").notify(db,event,payload).catch(()=>{})}catch(_){}}

function takeStockInternal(db, userId, product, invoiceId) {
  let row = null;
  if (product.delivery_mode === "sequential") {
    row = db.sqlite.prepare(
      "SELECT * FROM product_inventory_items WHERE product_id=? AND status='available' ORDER BY order_index,id LIMIT 1"
    ).get(product.id);
  }
  const text = row ? row.content : (product.fixed_delivery || "");
  if (!text) return { ok: false, error: "No hay stock disponible." };
  const now = db.now();
  db.sqlite.prepare(
    "INSERT INTO delivery_allocations (user_id,product_id,invoice_id,inventory_item_id,delivered_content,delivered_at) VALUES (?,?,?,?,?,?)"
  ).run(userId, product.id, invoiceId, row ? row.id : null, text, now);
  if (row) {
    db.sqlite.prepare(
      "UPDATE product_inventory_items SET status='delivered', delivered_to_user_id=?, delivered_invoice_id=?, delivered_at=? WHERE id=?"
    ).run(userId, invoiceId, now, row.id);
  }
  return { ok: true, text };
}

function finalizeExternalPayment(db, invoiceId, { provider, providerRef = "", amount = null, currency = null, rawJson = null } = {}) {
  const inv = db.sqlite.prepare("SELECT * FROM invoices WHERE id=?").get(invoiceId);
  if (!inv) return { ok: false, error: "Factura no encontrada." };
  if (inv.status === "paid") return { ok: true, alreadyPaid: true, invoice: billing.fullInvoice(db, invoiceId) };
  if (inv.status !== "pending" && inv.status !== "suspended") return { ok: false, error: "Factura no disponible para pago." };

  if (amount != null && Math.abs(Number(amount) - Number(inv.total)) > 0.01) {
    console.warn("[payments] amount mismatch", { invoiceId, expected: inv.total, got: amount });
  }
  if (currency && String(currency).toUpperCase() !== String(inv.currency).toUpperCase()) {
    console.warn("[payments] currency mismatch", { invoiceId, expected: inv.currency, got: currency });
  }

  const item = db.sqlite.prepare(
    "SELECT * FROM invoice_items WHERE invoice_id=? AND item_type='product' LIMIT 1"
  ).get(invoiceId);
  const product = item ? db.sqlite.prepare("SELECT * FROM products WHERE id=?").get(item.reference_id) : null;
  if (!product) return { ok: false, error: "Producto no encontrado." };

  let stockError = null;
  const tx = db.sqlite.transaction(() => {
    const already = (billing.fullInvoice(db, invoiceId).allocations || []).length > 0;
    if (inv.type !== "renewal" && !already) {
      const r = takeStockInternal(db, inv.user_id, product, invoiceId);
      if (!r.ok) { stockError = r.error; throw new Error(r.error); }
    }
    db.sqlite.prepare(
      "INSERT INTO payments (invoice_id,user_id,provider,provider_ref,amount,currency,status,raw_json,created_at,confirmed_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
    ).run(invoiceId, inv.user_id, provider, String(providerRef || ""), Number(inv.total), inv.currency, "paid",
      rawJson ? JSON.stringify(rawJson).slice(0, 8000) : "{}", db.now(), db.now());
    try {
      db.sqlite.prepare(
        "UPDATE invoices SET status='paid', payment_method=?, paid_at=?, state_changed_at=? WHERE id=?"
      ).run(provider, db.now(), db.now(), invoiceId);
    } catch (_) {
      db.sqlite.prepare(
        "UPDATE invoices SET status='paid', payment_method=?, paid_at=? WHERE id=?"
      ).run(provider, db.now(), invoiceId);
    }
    billing.reactivateOrCreateService(db, inv, product, invoiceId, inv.user_id);
  });

  try { tx(); }
  catch (e) { return { ok: false, error: stockError || e.message }; }
  const final = billing.fullInvoice(db, invoiceId);
  try {
    const user = db.getUserById(inv.user_id);
    if (user) {
      waNotify(db, "invoice_paid", { user, invoice: final, product });
      mailNotify(db, "invoice_paid", { user, invoice: final, product });
    }
  } catch (_) {}
  return { ok: true, invoice: final };
}

function productAcceptsProvider(product, provider) {
  if (!product) return false;
  if (provider === "credit") return product.accept_credit == null ? true : !!product.accept_credit;
  if (provider === "paypal") return product.accept_paypal == null ? true : !!product.accept_paypal;
  if (provider === "stripe") return product.accept_stripe == null ? true : !!product.accept_stripe;
  return false;
}

function providerEnabledGlobally(db, provider) {
  if (provider === "credit") return true;
  if (provider === "paypal_api") return db.getSetting("paypal_api_enabled", "0") === "1";
  if (provider === "paypal_ipn") return db.getSetting("paypal_ipn_enabled", "0") === "1";
  if (provider === "paypal") return providerEnabledGlobally(db, "paypal_api") || providerEnabledGlobally(db, "paypal_ipn");
  if (provider === "stripe") {
    return db.getSetting("stripe_enabled", "0") === "1"
      && !!db.getSetting("stripe_pk", "")
      && !!db.getSetting("stripe_sk", "");
  }
  return false;
}

function providerLabel(provider) {
  const map = {
    credits: "Crédito",
    credit: "Crédito",
    paypal: "PayPal",
    paypal_ipn: "PayPal (IPN)",
    stripe: "Stripe",
    "": "—",
  };
  return map[provider] || provider || "—";
}

function providerBadgeClass(provider) {
  if (provider === "paypal" || provider === "paypal_ipn") return "pp";
  if (provider === "stripe") return "stripe";
  if (provider === "credits" || provider === "credit") return "credit";
  return "muted";
}

function invoiceProduct(db, invoice) {
  const item = db.sqlite.prepare(
    "SELECT * FROM invoice_items WHERE invoice_id=? AND item_type='product' LIMIT 1"
  ).get(invoice.id);
  if (!item) return null;
  return db.sqlite.prepare("SELECT * FROM products WHERE id=?").get(item.reference_id) || null;
}

function findOrCreatePendingInvoice(db, userId, productId) {
  const billing = require("./billing");
  const p = db.sqlite.prepare("SELECT * FROM products WHERE id=? AND active=1").get(productId);
  if (!p) return { ok: false, error: "Producto no disponible." };
  if (p.delivery_mode === "sequential") {
    const c = db.sqlite.prepare("SELECT COUNT(*) c FROM product_inventory_items WHERE product_id=? AND status='available'").get(productId).c;
    if (c <= 0) return { ok: false, error: "Sin stock disponible." };
  }
  const existing = db.sqlite.prepare(`
    SELECT i.* FROM invoices i
    JOIN invoice_items it ON it.invoice_id=i.id AND it.item_type='product' AND it.reference_id=?
    WHERE i.user_id=? AND i.status='pending'
    ORDER BY i.id DESC LIMIT 1
  `).get(productId, userId);
  if (existing) return { ok: true, invoice: existing, product: p, reused: true };
  const inv = billing.makeInvoice(db, userId, p, "product");
  if (!inv) return { ok: false, error: "No se pudo generar la factura." };
  return { ok: true, invoice: inv, product: p, reused: false };
}

module.exports = { finalizeExternalPayment, productAcceptsProvider, providerEnabledGlobally, providerLabel, providerBadgeClass, invoiceProduct, findOrCreatePendingInvoice };
