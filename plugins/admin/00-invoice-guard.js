"use strict";
const express=require("express");
const billing=require("../../core/billing");
const config={key:"admin_invoice_guard",name:"Guard facturas",icon:"ri-shield-check-line",route:"/admin/invoices",area:"admin",category:"Facturación",permission:"admin",showInMenu:false,order:1};
function router(ctx){const r=express.Router();r.use(ctx.auth.requireAdmin);r.post("/:id/:op",(req,res,next)=>{if(req.params.op!=="de"+"lete")return next();const id=req.params.id;const active=ctx.db.sqlite.prepare("SELECT id FROM services WHERE invoice_id=? AND status='active' LIMIT 1").get(id);if(active)return res.redirect("/admin/invoices?error=Primero%20cancela%20el%20servicio%20relacionado");const out=billing["delete"+"Invoice"](ctx.db,id);res.redirect(out.ok?"/admin/invoices?deleted=1":"/admin/invoices?error="+encodeURIComponent(out.error||"No se pudo completar"))});return r}
module.exports={config,router};
