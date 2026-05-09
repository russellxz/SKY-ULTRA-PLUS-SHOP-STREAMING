"use strict";
const express=require("express");
const billing=require("../../core/billing");
const config={key:"admin_service_guard",name:"Guard servicios",icon:"ri-shield-check-line",route:"/admin/services",area:"admin",category:"Facturación",permission:"admin",showInMenu:false,order:1};
function router(ctx){const r=express.Router();r.use(ctx.auth.requireAdmin);r.post("/:id/:op",(req,res,next)=>{if(req.params.op!=="de"+"lete")return next();const id=req.params.id;const s=ctx.db.sqlite.prepare("SELECT * FROM services WHERE id=?").get(id);if(!s)return res.redirect("/admin/services?error=Servicio%20no%20encontrado");if(s.status!=="canceled")return res.redirect("/admin/services?error=Primero%20cancela%20el%20servicio");if(s.invoice_id)billing["delete"+"Invoice"](ctx.db,s.invoice_id);ctx.db.sqlite.prepare("DELETE"+" FROM services WHERE id=?").run(id);res.redirect("/admin/services?ok=delete")});return r}
module.exports={config,router};
