// NO ACCOUNT HOLDER IS NAMED IN THE CODE (the owner, 17 Oct 2026). Run first in `build`: fails the build on any file
// that names one.
//
// Two checks:
//   1. NO_HOLDER_NAMES (a build variable or secret, comma-separated: names, addresses, table names) -- never committed,
//      so this file names no one. Each is matched whole, ignoring case.
//   2. Always, without it: an account holder's settings table (plan_yyyymmdd_<12 hex>) that isn't one of the made-up
//      ones tests use, and a mobicycle mailbox whose name is not a role or a made-up holder.
//
//   node scripts/no-holder-names.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SKIP = new Set(["node_modules", ".git", "dist", ".wrangler", "build", "vendor", ".build", "DerivedData"]);
const TEXT = /\.(ts|mts|cts|tsx|js|mjs|cjs|jsx|json|jsonc|md|toml|sh|py|ya?ml|txt|sql|html)$/i;
const SELF = /no-holder-names\.mjs$/;

const named = (process.env.NO_HOLDER_NAMES || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NAMED = named.length ? new RegExp(`(?<![\\w])(?:${named.map(esc).join("|")})(?![\\w])`, "i") : null;

// A table name that is made up: its id mostly zeros, one letter over and over, 0123456789ab, or dated 2099.
const TABLE = /\b(max|personal|professional|organization)_(20\d{6})_([0-9a-f]{12})\b/g;
const madeUp = (date, id) => date.startsWith("2099") || (id.match(/0/g) || []).length >= 6 || new Set(id).size === 1 || id === "0123456789ab";
// A mailbox at mobicycle that is a role, or a made-up holder; anything else may be a person.
const ROLES = new Set(("avery blake someone nobody holder support billing hello admin sales legal partnerships ceo us x y a b me " +
  "max pro free off desk kept unkept staffing suppliers engineering consulting agent notify books resend noreply no-reply " +
  "mobicycle sign-in ops quiet info team security abuse postmaster test probe rule-test claude.test apple-alert " +
  "ana sam daniel priya tomas ada monirul unreadable").split(" "));
const MAILBOX = /\b([a-z0-9._%+-]+)@(?:resend\.)?mobicycle\.[a-z.]+/gi;

const found = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    if (!TEXT.test(name) || SELF.test(name) || st.size > 2000000) continue;
    const lines = readFileSync(p, "utf8").split("\n");
    lines.forEach((line, i) => {
      const at = `${relative(ROOT, p)}:${i + 1}`;
      if (NAMED && NAMED.test(line)) found.push(`${at}  names an account holder`);
      for (const m of line.matchAll(TABLE)) if (!madeUp(m[2], m[3])) found.push(`${at}  an account holder's table: ${m[0]}`);
      for (const m of line.matchAll(MAILBOX)) {
        const local = m[1].toLowerCase().replace(/^(?:\\n|n)(?=avery|blake)/, "");
        if (!ROLES.has(local) && !ROLES.has(local.split(/[.+]/)[0])) found.push(`${at}  a mailbox that may be a person's: ${m[0]}`);
      }
    });
  }
}
walk(ROOT);
if (found.length) {
  console.error(`no-holder-names: ${found.length} place(s) name an account holder -- take the holder from data, never the code:`);
  for (const f of found.slice(0, 50)) console.error("  " + f);
  process.exit(1);
}
console.log("no-holder-names: ok");
