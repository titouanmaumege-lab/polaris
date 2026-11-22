// Génère la banque de pictogrammes (Lucide, licence ISC) : nom -> [svg interne, mots-clés].
import fs from "fs";
const dir = "node_modules/lucide-static/";
const nodes = JSON.parse(fs.readFileSync(dir + "icon-nodes.json", "utf8"));
const tags = JSON.parse(fs.readFileSync(dir + "tags.json", "utf8"));
const out = {};
for (const [name, els] of Object.entries(nodes)) {
  const inner = els.map(([t, a]) => "<" + t + Object.entries(a).filter(([k]) => k !== "key").map(([k, v]) => " " + k + '="' + v + '"').join("") + "/>").join("");
  out[name] = [inner, (tags[name] || []).slice(0, 8).join(" ")];
}
fs.writeFileSync("src/components/timebox/pictos-data.json", JSON.stringify(out));
console.log(Object.keys(out).length, "icônes", fs.statSync("src/components/timebox/pictos-data.json").size, "octets");
