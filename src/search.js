require("dotenv").config();
const axios = require("axios");
const API_URL = "https://api-air-flightsearch-green.smiles.com.br/v1/airlines/search";
async function searchFlights({ from, to, date, adults = 1 }) {
  const params = { adults, children: 0, infants: 0, tripType: 1, originAirportCode: from, destinationAirportCode: to, departureDate: date, forceCongener: false, r: "smiles" };
  const headers = { "x-api-key": process.env.SMILES_API_KEY, "cookie": process.env.SMILES_COOKIE, "channel": "Web", "region": "BRASIL", "accept": "application/json", "accept-language": "pt-BR,pt;q=0.9", "origin": "https://www.smiles.com.br", "referer": "https://www.smiles.com.br/", "user-agent": "Mozilla/5.0" };
  const response = await axios.get(API_URL, { params, headers, timeout: 15000 });
  return response.data;
}
module.exports = { searchFlights };