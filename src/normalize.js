function normalizeFlights(data, route) {
  var flights=[], list=data.requestedFlightSegmentList;
  var segs=(list&&list[0]&&list[0].flightList)||[];
  for(var i=0;i<segs.length;i++){
    var seg=segs[i],fL=seg.fareList||[],club=null,sm=null;
    for(var j=0;j<fL.length;j++){if(fL[j].type==="SMILES_CLUB")club=fL[j];if(fL[j].type==="SMILES")sm=fL[j];}
    var best=club||sm;if(!best||!best.miles)continue;
    var tax=parseFloat((best.g3&&best.g3.costTax)||"0")||0;
    flights.push({from:route.from,to:route.to,date:seg.departure&&seg.departure.date?seg.departure.date.split("T")[0]:route.date,airline:seg.airline?seg.airline.name:"N/A",stops:seg.stops||0,cabin:seg.cabin||"ECONOMIC",departureTime:seg.departure?seg.departure.date:"",arrivalTime:seg.arrival?seg.arrival.date:"",miles:best.miles,milesClub:club?club.miles:null,milesSmiles:sm?sm.miles:null,tax:tax,fareType:best.type,score:best.miles+tax*0.3});
  }
  return flights.sort(function(a,b){return a.miles-b.miles;});
}
function extractCalendar(d){return{calendar:d.calendarDayList||[],bestPricing:d.bestPricing||null};}
module.exports={normalizeFlights,extractCalendar};