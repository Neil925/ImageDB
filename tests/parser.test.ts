import { describe, it, expect } from "vitest";
import { parseQuery, QueryError } from "@/lib/query-parser";

/**
 * Plan §7.1 acceptance: "the §7 syntax table passes as an automated test suite".
 * These are parser-level; end-to-end behavior is in search.test.ts.
 */
describe("query syntax table (plan §7.1)", () => {
  it("tag1 tag2 → two AND terms", () => {
    const q = parseQuery("tag1 tag2");
    expect(q.andTerms).toHaveLength(2);
    expect(q.andTerms[0].value).toBe("tag1");
    expect(q.orGroups).toHaveLength(0);
  });

  it("( tag1 ~ tag2 ) → one OR group of two", () => {
    const q = parseQuery("( tag1 ~ tag2 )");
    expect(q.orGroups).toHaveLength(1);
    expect(q.orGroups[0].map((t) => t.value)).toEqual(["tag1", "tag2"]);
  });

  it("-tag1 → NOT term", () => {
    const q = parseQuery("-tag1");
    expect(q.notTerms.map((t) => t.value)).toEqual(["tag1"]);
  });

  it("ta*1 → wildcard term", () => {
    const q = parseQuery("ta*1");
    expect(q.andTerms[0].kind).toBe("wildcard");
    expect(q.wildcardCount).toBe(1);
  });

  it("night~ → fuzzy term", () => {
    const q = parseQuery("night~");
    expect(q.andTerms[0].kind).toBe("fuzzy");
    expect(q.andTerms[0].value).toBe("night");
  });

  it("rating:general and -rating:explicit", () => {
    expect(parseQuery("rating:general").ratings.include).toEqual([0]);
    expect(parseQuery("-rating:explicit").ratings.exclude).toEqual([3]);
    expect(parseQuery("rating:safe").ratings.include).toEqual([0, 1]);
    expect(parseQuery("rating:nsfw").ratings.include).toEqual([2, 3]);
  });

  it("score:>=10 width:>=1000 height:>1000 id:>1000", () => {
    const q = parseQuery("score:>=10 width:>=1000 height:>1000 id:>1000");
    expect(q.numerics).toEqual([
      { field: "score", op: ">=", value: 10 },
      { field: "width", op: ">=", value: 1000 },
      { field: "height", op: ">", value: 1000 },
      { field: "id", op: ">", value: 1000 },
    ]);
  });

  it("user:bob md5:abc* parent:1234", () => {
    const q = parseQuery("user:bob md5:abc* parent:1234");
    expect(q.user).toBe("bob");
    expect(q.md5Prefix).toBe("abc");
    expect(q.parent).toBe(1234);
  });

  it("sort:score sort:updated:desc", () => {
    const q = parseQuery("sort:score");
    expect(q.sorts).toEqual([{ field: "score", dir: "desc" }]);
    expect(parseQuery("sort:updated:desc").sorts[0].field).toBe("updated");
  });

  it("mixed realistic query", () => {
    const q = parseQuery("blonde_hair blue_eyes -comic ( solo ~ group ) rating:general sort:score");
    expect(q.andTerms.map((t) => t.value)).toEqual(["blonde_hair", "blue_eyes"]);
    expect(q.notTerms.map((t) => t.value)).toEqual(["comic"]);
    expect(q.orGroups[0].map((t) => t.value)).toEqual(["solo", "group"]);
    expect(q.ratings.include).toEqual([0]);
    expect(q.sorts[0].field).toBe("score");
  });
});

describe("syntax rules are enforced with clear errors", () => {
  it("max 8 tag terms", () => {
    expect(() => parseQuery(Array.from({ length: 9 }, (_, i) => `t${i}`).join(" "))).toThrow(QueryError);
  });

  it("max 3 wildcards", () => {
    expect(() => parseQuery("a* b* c* d*")).toThrow(/at most 3 wildcards/);
  });

  it("one rating filter", () => {
    expect(() => parseQuery("rating:safe rating:explicit")).toThrow(/only one rating/);
  });

  it("unknown rating rejected, not ignored", () => {
    expect(() => parseQuery("rating:maybe")).toThrow(/unknown rating/);
  });

  it("unbalanced parens rejected", () => {
    expect(() => parseQuery("( a ~ b")).toThrow(/unbalanced/);
  });

  it("unknown sort field rejected", () => {
    expect(() => parseQuery("sort:vibes")).toThrow(/unknown sort field/);
  });
});
