"use strict";
const express=require("express");
const config={key:"admin_billing",name:"Billing",icon:"ri-bill-line",route:"/admin/billing",area:"admin",category:"Facturación",permission:"admin",order:99,showInMenu:false};
function router(ctx){const r=express.Router();r.use(ctx.auth.requireAdmin);r.get("/",(req,res)=>res.redirect("/admin/invoices"));return r}
module.exports={config,router};
