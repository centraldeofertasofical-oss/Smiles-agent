require("dotenv").config();
function getDestinations() {
  var raw = process.env.DESTINATIONS || "GYN-GIG,GYN-CGH,GYN-NAT,GYN-MCZ,GYN-FOR";
  return raw.split(",").map(function(pair) {
    var p = pair.trim().split("-");
    return { from: p[0], to: p[1], id: pair.trim(), label: p[0] + " -> " + p[1] };
  });
}
module.exports = { getDestinations };
