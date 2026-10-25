#!/bin/sh
# workspace/whereisthesun/tools/fetch-wikidata-astro.sh
# SUNNY build step (opt91): saves Wikidata (CC0) astronomy sites with coordinates to
# tools/wikidata-astro.json. Classes: radio telescope, radio interferometer, neutrino
# detector, gravitational-wave detector, cosmic-ray observatory, plus named sites by QID.
# Run by hand, then: node tools/build-astro-extra.js
cd "$(dirname "$0")"
Q='SELECT ?i ?iLabel ?c ?cl ?opLabel ?art WHERE {
 { VALUES ?cl { wd:Q184356 wd:Q583152 wd:Q2302080 wd:Q349772 wd:Q3348407 } ?i wdt:P31 ?cl . }
 UNION { VALUES ?i { wd:Q44547 wd:Q7391872 wd:Q12027631 wd:Q1799482 wd:Q893513 wd:Q174540 wd:Q1043942 wd:Q5250343 wd:Q51792451 wd:Q121094988 wd:Q1238107 wd:Q363047 wd:Q7696800 wd:Q41804148 wd:Q1569514 wd:Q647227 wd:Q725364 wd:Q794886 } }
 ?i wdt:P625 ?c .
 OPTIONAL { ?i wdt:P137 ?op } OPTIONAL { ?art schema:about ?i; schema:isPartOf <https://en.wikipedia.org/> }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }'
curl -s -G https://query.wikidata.org/sparql -H 'User-Agent: SunnyBuild/1.0 (github.com/xeea000/whereisthesun)' -H 'Accept: application/sparql-results+json' --data-urlencode "query=$Q" > wikidata-astro.json
