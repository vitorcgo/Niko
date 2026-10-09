import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ORIGIN = "personagens-originais";
const DESTINATION = join("public", "personagens");
const STATES = ["ocioso", "ouvindo", "pensando", "escrevendo", "sucesso", "alerta", "erro", "dormindo"];

function prepare(svg) {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/viewBox="0 0 512 512"(\s+width="512"\s+height="512")?/, 'viewBox="66 78 380 380" width="380" height="380"');
}

let total = 0;
for (const agent of readdirSync(ORIGIN, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  const directory = join(ORIGIN, agent);
  const files = readdirSync(directory).filter((a) => a.toLowerCase().endsWith(".svg"));
  if (files.length === 0) {
    console.log(`${agent}: nenhum SVG ainda, mantendo o que existe em ${DESTINATION}`);
    continue;
  }
  const missing = STATES.filter((e) => !files.includes(`${e}.svg`));
  if (missing.length) console.log(`${agent}: faltam ${missing.join(", ")}`);
  const output = join(DESTINATION, agent);
  if (!existsSync(output)) mkdirSync(output, { recursive: true });
  for (const file of files) {
    const state = file.replace(/\.svg$/i, "");
    if (!STATES.includes(state)) {
      console.log(`${agent}: ignorado ${file} (nome fora dos 8 estados)`);
      continue;
    }
    writeFileSync(join(output, `${state}.svg`), prepare(readFileSync(join(directory, file), "utf8")), "utf8");
    total++;
  }
  console.log(`${agent}: ${files.length} arquivo(s) preparados`);
}
console.log(`Pronto. ${total} SVG(s) copiados para ${DESTINATION}.`);
