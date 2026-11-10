/**
 * Query syntax parser (plan §7.1), pure and unit-testable.
 *
 *  tag1 tag2              AND
 *  ( tag1 ~ tag2 )        OR — spaces inside the parens matter
 *  -tag1                  NOT
 *  ta*1                   wildcard — starts ta ends 1
 *  night~                 fuzzy (trigram), typo tolerance
 *  rating:general         rating filter; -rating:explicit excludes
 *  score:>=10 width:>=1000 height:>1000 id:>1000
 *  user:name md5:abc* parent:1234
 *  sort:score sort:updated:desc
 *
 * Rules: max 8 tag terms, max 3 wildcards, one rating filter per query
 * (same-metatag combinations rejected with a clear error).
 */

export type TermKind = "plain" | "wildcard" | "fuzzy";

export interface TagTerm {
  kind: TermKind;
  value: string; // normalized lowercase (asterisk kept for wildcard)
}

export type NumericField = "score" | "width" | "height" | "id";
export interface NumericTerm {
  field: NumericField;
  op: ">=" | ">" | "<=" | "<" | "=";
  value: number;
}

export type SortField = "id" | "score" | "rating" | "width" | "height" | "created" | "updated";
export interface SortTerm {
  field: SortField;
  dir: "asc" | "desc";
}

export interface ParsedQuery {
  andTerms: TagTerm[];
  orGroups: TagTerm[][]; // each `( a ~ b )` group, AND-ed with the rest
  notTerms: TagTerm[];
  wildcardCount: number;
  ratings: { include: number[]; exclude: number[] };
  numerics: NumericTerm[];
  user?: string;
  md5Prefix?: string;
  parent?: number;
  sorts: SortTerm[];
}

export class QueryError extends Error {}

const RATING_NAMES: Record<string, number> = { general: 0, sensitive: 1, questionable: 2, explicit: 3 };
// Gelbooru-style shortcuts (safe / nsfw) map onto the Danbooru scheme.
const RATING_SHORTCUTS: Record<string, number[]> = {
  general: [0],
  sensitive: [1],
  questionable: [2],
  explicit: [3],
  safe: [0, 1],
  nsfw: [2, 3],
};

const SORT_FIELDS: SortField[] = ["id", "score", "rating", "width", "height", "created", "updated"];

function normalizeToken(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Split on whitespace but keep (…) groups as single tokens. */
function tokenize(input: string): string[] {
  const spaced = input.replace(/\(/g, " ( ").replace(/\)/g, " ) ");
  const raw = spaced.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === "(") {
      let depth = 1;
      let j = i + 1;
      let inner: string[] = [];
      while (j < raw.length && depth > 0) {
        if (raw[j] === "(") depth++;
        else if (raw[j] === ")") {
          depth--;
          if (depth === 0) break;
        }
        inner.push(raw[j]);
        j++;
      }
      if (depth !== 0) throw new QueryError("unbalanced ( ) in query");
      if (inner.length < 3 || !inner.includes("~")) {
        throw new QueryError("OR groups look like ( tag1 ~ tag2 )");
      }
      out.push(`(${inner.join(" ")})`);
      i = j + 1;
    } else {
      out.push(raw[i]);
      i++;
    }
  }
  return out;
}

function parseTagTerm(raw: string): TagTerm {
  const v = normalizeToken(raw);
  if (!v) throw new QueryError(`empty term near "${raw}"`);
  if (v.includes("*")) return { kind: "wildcard", value: v };
  if (v.endsWith("~")) return { kind: "fuzzy", value: v.slice(0, -1) };
  return { kind: "plain", value: v };
}

function parseNumeric(tok: string, field: NumericField): NumericTerm {
  const m = /^(>=|<=|>|<|=)?(-?\d+)$/.exec(tok);
  if (!m) throw new QueryError(`${field}: needs a number, got "${tok}"`);
  return { field, op: (m[1] || "=") as NumericTerm["op"], value: Number(m[2]) };
}

export function parseQuery(input: string): ParsedQuery {
  const q: ParsedQuery = {
    andTerms: [],
    orGroups: [],
    notTerms: [],
    wildcardCount: 0,
    ratings: { include: [], exclude: [] },
    numerics: [],
    sorts: [],
  };
  let ratingSeen = false;

  for (const tok of tokenize(input)) {
    const negated = tok.startsWith("-") && tok.length > 1;
    const body = negated ? tok.slice(1) : tok;

    if (body.startsWith("(")) {
      if (negated) throw new QueryError("-( … ) is not supported; negate single tags");
      const inner = body.slice(1, -1).split(/\s+~\s+|\s+/).filter(Boolean).filter((t) => t !== "~");
      const terms = inner.map(parseTagTerm);
      if (terms.length < 2) throw new QueryError("OR groups need at least two tags");
      q.orGroups.push(terms);
      continue;
    }

    const meta = /^([a-z][a-z0-9_]*)(?::(.*))?$/i.exec(body);
    const key = meta ? meta[1].toLowerCase() : "";
    const val = meta?.[2] ?? "";

    if (key === "rating" && val !== "") {
      if (ratingSeen) throw new QueryError("only one rating: filter per query");
      ratingSeen = true;
      const rs = RATING_SHORTCUTS[val.toLowerCase()];
      if (!rs) throw new QueryError(`unknown rating "${val}" (general|sensitive|questionable|explicit|safe|nsfw)`);
      if (negated) q.ratings.exclude.push(...rs);
      else q.ratings.include.push(...rs);
      continue;
    }
    if ((key === "score" || key === "width" || key === "height" || key === "id") && val !== "") {
      q.numerics.push(parseNumeric(val, key));
      continue;
    }
    if (key === "user" && val !== "") {
      if (q.user) throw new QueryError("only one user: filter per query");
      q.user = normalizeToken(val);
      continue;
    }
    if (key === "md5" && val !== "") {
      q.md5Prefix = normalizeToken(val).replace(/\*$/, "");
      continue;
    }
    if (key === "parent" && val !== "") {
      if (!/^\d+$/.test(val)) throw new QueryError(`parent: needs a number, got "${val}"`);
      q.parent = Number(val);
      continue;
    }
    if (key === "sort" && val !== "") {
      const [f, dir] = val.toLowerCase().split(":");
      if (!SORT_FIELDS.includes(f as SortField)) {
        throw new QueryError(`unknown sort field "${f}" (${SORT_FIELDS.join("|")})`);
      }
      if (q.sorts.length >= 2) throw new QueryError("at most two sort: terms");
      q.sorts.push({ field: f as SortField, dir: dir === "asc" ? "asc" : "desc" });
      continue;
    }

    const term = parseTagTerm(body);
    if (negated) {
      q.notTerms.push(term);
    } else {
      q.andTerms.push(term);
    }
  }

  const tagTermCount =
    q.andTerms.length + q.notTerms.length + q.orGroups.reduce((n, g) => n + g.length, 0);
  if (tagTermCount > 8) throw new QueryError(`too many tag terms (${tagTermCount}; max 8)`);
  q.wildcardCount = [...q.andTerms, ...q.notTerms, ...q.orGroups.flat()].filter(
    (t) => t.kind === "wildcard",
  ).length;
  if (q.wildcardCount > 3) throw new QueryError("at most 3 wildcards per query");

  return q;
}
