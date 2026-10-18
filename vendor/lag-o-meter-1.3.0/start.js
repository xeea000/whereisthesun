// workspace/lag-o-meter/src/start.js
// Starts the shared bandwidth collector as early as possible. A game loads this first, as an async module script in
// its HTML head, so the resource timing buffer is raised and the observer is listening before anything else downloads.
// The meter imported later from the same folder gets the same collector. A key in the script address, as in
// start.js?key=my-game, sets the sessionStorage key for the session total.
import { getCollector } from "./collector.js";
let storageKey;
try {
  storageKey = new URL(import.meta.url).searchParams.get("key") || undefined;
} catch (err) {
  storageKey = undefined;
}
getCollector({ storageKey }).start();
