Civic layers (capitals and population density).

Population density: GHSL GHS-POP R2023A, year 2020, 1 km cells (people per km²),
warped to a 4096 px Web Mercator picture. European Commission, Joint Research
Centre. CC BY 4.0. Cite: Schiavina M., Freire S., Carioli A., MacManus K. (2023)
GHS-POP R2023A — GHS population grid multitemporal (1975-2030).
doi: 10.2905/2FF68A52-5B5B-4A22-8F40-C41DA8332CFE
Rebuild with: python3 tools/build-popdens.py

Capitals live in data/world/capitals.* (Natural Earth populated places plus
Wikidata P36). Rebuild with: node tools/build-capitals.js
