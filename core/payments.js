"use strict";

const billing = require("./billing");

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
  if (inv.status !== "pending") return { ok: false, error: "Factura no disponible para pago." };

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
    db.sqlite.prepare(
      "UPDATE invoices SET status='paid', payment_method=?, paid_at=? WHERE id=?"
    ).run(provider, db.now(), invoiceId);
    if (inv.type !== "renewal") {
      db.sqlite.prepare(
        "INSERT INTO services (user_id,product_id,invoice_id,status,next_invoice_at,created_at) VALUES (?,?,?,?,?,?)"
      ).run(inv.user_id, product.id, invoiceId, "active", billing.nextDue(product, db.now()), db.now());
    }
  });

  try { tx(); }
  catch (e) { return { ok: false, error: stockError || e.message }; }
  return { ok: true, invoice: billing.fullInvoice(db, invoiceId) };
}

function productAcceptsProvider(product, provider) {
  if (!product) return false;
  if (provider === "credit") return product.accept_credit == null ? true : !!product.accept_credit;
  if (provider === "paypal") return product.accept_paypal == null ? true : !!product.accept_paypal;
  if (provider === "stripe") return product.accept_stripe == null ? true : !!product.accept_stripe;
  return false;
}

function invoiceProduct(db, invoice) {
  const item = db.sqlite.prepare(
    "SELECT * FROM invoice_items WHERE invoice_id=? AND item_type='product' LIMIT 1"
  ).get(invoice.id);
  if (!item) return null;
  return db.sqlite.prepare("SELECT * FROM products WHERE id=?").get(item.reference_id) || null;
}

module.exports = { finalizeExternalPayment, productAcceptsProvider, invoiceProduct };
