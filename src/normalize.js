function normalizeFlights(data, route) {
  const flights = [];
  const seen = new Set();
  const segments = data?.requestedFlightSegmentList?.[0]?.flightList || [];

  for (const seg of segments) {
    const fareList = Array.isArray(seg?.fareList) ? seg.fareList : [];

    let club = null;
    let smiles = null;

    for (const fare of fareList) {
      if (fare?.type === "SMILES_CLUB") club = fare;
      if (fare?.type === "SMILES") smiles = fare;
    }

    const best = club || smiles;
    if (!best?.miles) continue;

    const departureTime = seg?.departure?.date || "";
    const arrivalTime = seg?.arrival?.date || "";
    const airline = seg?.airline?.name || "N/A";
    const tax = parseFloat(best?.g3?.costTax ?? "0") || 0;

    const key = [
      route?.from || "",
      route?.to || "",
      departureTime,
      arrivalTime,
      airline,
      best.miles
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);

    flights.push({
      from: route?.from || "",
      to: route?.to || "",
      date: departureTime ? departureTime.split("T")[0] : route?.date || "",
      airline,
      stops: seg?.stops ?? 0,
      cabin: seg?.cabin || "ECONOMIC",
      departureTime,
      arrivalTime,
      miles: best.miles,
      milesClub: club?.miles ?? null,
      milesSmiles: smiles?.miles ?? null,
      tax,
      fareType: best.type || null,
      score: best.miles + tax * 0.3,
    });
  }

  return flights.sort((a, b) => a.miles - b.miles);
}

function extractCalendar(data) {
  const calendar = [];
  let bestPricing = null;

  try {
    const calendarList =
      data?.flightRecommendationList ||
      data?.calendar ||
      data?.requestedFlightSegmentList?.[0]?.calendarFlightList ||
      [];

    for (const entry of calendarList) {
      const date = entry?.departureDate || entry?.date || null;
      const miles = entry?.bestFare?.miles || entry?.miles || null;
      const tax = parseFloat(entry?.bestFare?.costTax ?? entry?.tax ?? "0") || 0;

      if (!date || !miles) continue;

      calendar.push({ date, miles, tax });

      if (!bestPricing || miles < bestPricing.miles) {
        bestPricing = { date, miles, tax };
      }
    }
  } catch (_) {}

  return { calendar, bestPricing };
}

module.exports = { normalizeFlights, extractCalendar };
