import knownMakes from "./makes.json";

// A make line is printed as "MAKE-MPN". Makes may themselves contain hyphens
// ("AERO-ELECTRIC CONNECTOR, INC.") and so may MPNs ("M83513/05-07"), so we
// lean on one property that holds across the catalogue: MPNs contain a digit,
// make names almost never do. Names that do (e.g. "3M") go in makes.json.
export function splitMake(raw: string): { make: string; mpn: string } {
  const line = raw.trim();

  for (const name of knownMakes as string[]) {
    if (line.length > name.length + 1 && line.toUpperCase().startsWith(name.toUpperCase() + "-")) {
      return { make: line.slice(0, name.length), mpn: line.slice(name.length + 1).trim() };
    }
  }

  const hyphens: number[] = [];
  for (let i = 0; i < line.length; i++) if (line[i] === "-") hyphens.push(i);
  if (hyphens.length === 0) return { make: line, mpn: "" };

  // 1. First hyphen whose next token (up to a space or hyphen) has a digit,
  //    or is a lone designator letter followed by such a token ("-J MS27…-1").
  for (const i of hyphens) {
    const after = line.slice(i + 1);
    const token = /^[^\s-]*/.exec(after)![0];
    if (/\d/.test(token) || /^[A-Z]\s+[^\s-]*\d/.test(after)) return cut(line, i);
  }
  // 2. First hyphen where anything after it has a digit ("CORPN.-J MS27472…").
  for (const i of hyphens) {
    if (/\d/.test(line.slice(i + 1))) return cut(line, i);
  }
  // 3. No digits anywhere: split at the last hyphen and let the row be flagged
  //    by the caller if the MPN looks wrong.
  return cut(line, hyphens[hyphens.length - 1]);
}

// A single letter between the hyphen and the part number is a maker
// designator, not part of the MPN: "MATRIX SCIENCE CORPN.-J MS27472T10B35P"
// is Matrix Science (Japan) making MS27472T10B35P. Keep the letter on the make
// so the source is still visible; the MPN is the bare part number.
const DESIGNATOR_RE = /^([A-Z])\s+(\S*\d\S*)$/;

function cut(line: string, i: number) {
  const make = line.slice(0, i).trim();
  const rest = line.slice(i + 1).trim();
  const d = DESIGNATOR_RE.exec(rest);
  if (d) return { make: `${make}-${d[1]}`, mpn: d[2] };
  return { make, mpn: rest };
}
