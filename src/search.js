require('dotenv').config();
var axios = require('axios');

var API_URL = 'https://api-air-flightsearch-green.smiles.com.br/v1/airlines/search';

async function searchFlights(opts) {
  var from = opts.from, to = opts.to, date = opts.date, adults = opts.adults || 1;

  // Converte formato YYYYMMDD para YYYY-MM-DD se necessario
  var formattedDate = date;
  if (date && date.length === 8 && date.indexOf('-') === -1) {
    formattedDate = date.substring(0,4) + '-' + date.substring(4,6) + '-' + date.substring(6,8);
  }

  var params = {
    cabin: 'ECONOMIC',
    originAirportCode: from,
    destinationAirportCode: to,
    departureDate: formattedDate,
    adults: adults,
    children: 0,
    infants: 0,
    forceCongener: false,
    memberNumber: '154762941'
  };

  var headers = {
    'x-api-key': process.env.SMILES_API_KEY,
    'cookie': process.env.SMILES_COOKIE,
    'channel': 'WEB',
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'origin': 'https://www.smiles.com.br',
    'referer': 'https://www.smiles.com.br/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
  };

  var response = await axios.get(API_URL, { params: params, headers: headers, timeout: 15000 });
  return response.data;
}

module.exports = { searchFlights };
