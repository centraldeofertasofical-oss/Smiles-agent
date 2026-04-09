require("dotenv").config();
var express=require("express"),srch=require("./search"),norm=require("./normalize"),dests=require("./destinations");
var app=express();app.use(express.json());
var PORT=process.env.PORT||3000;
app.get("/health",function(req,res){res.json({status:"ok",agent:"smiles-agent-v2",destinations:dests.getDestinations().map(function(d){return d.id;}),time:new Date().toISOString()});});
app.get("/search-all",async function(req,res){
  var d=dests.getDestinations(),r=[],e=[],td=req.query.date||nextDate(30);
  for(var i=0;i<d.length;i++){try{var raw=await srch.searchFlights({from:d[i].from,to:d[i].to,date:td}),fl=norm.normalizeFlights(raw,Object.assign({},d[i],{date:td})),cal=norm.extractCalendar(raw);r.push({route:d[i].id,label:d[i].label,date:td,total:fl.length,bestOffer:fl[0]||null,top3:fl.slice(0,3),bestPricing:cal.bestPricing,calendar:cal.calendar.slice(0,7)});await sleep(1500);}catch(err){e.push({route:d[i].id,error:err.message});}}
  res.json({searchedAt:new Date().toISOString(),date:td,total:r.length,errors:e.length,results:r,errorDetails:e});});
app.post("/search",async function(req,res){var f=req.body.from,t=req.body.to,date=req.body.date;if(!f||!t)return res.status(400).json({error:"from e to obrigatorios"});var td=date||nextDate(30);try{var raw=await srch.searchFlights({from:f,to;t,date:td}),fl=norm.normalizeFlights(raw,{from:f,to:t,date:td}),cal=norm.extractCalendar(raw);res.json({route:f+"-"+t,date:td,total:fl.length,bestOffer:fl[0]||null,top3:fl.slice(0,3),bestPricing:cal.bestPricing,calendar:cal.calendar.slice(0,7)});}catch(err){res.status(500).json({error:err.message});}});
app.get("/status",function(req,res){res.json({status:"ok",destinations:dests.getDestinations(),updatedAt:new Date().toISOString()});});
function nextDate(n){var d=new Date();d.setDate(d.getDate()+n);return d.toISOString().split("T")[0].replace(/-/g,"");}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
app.listen(PORT,function(){console.log("Smiles Agent v2 porta "+PORT);console.log("Destinos: "+dests.getDestinations().map(function(d){return d.id;}).join(", "));});
module.exports=app;