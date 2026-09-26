import { describe, expect, it } from "vitest";
import {
  learnMerchantRule,
  normalizeMerchant,
  parseQuickEntry,
  suggestCategory,
} from "../domain/categorization";
import { defaultCategories } from "../db";

describe("local categorization", () => {
  it("normalizes corporate labels, branch names, full-width and punctuation", () => {
    expect(normalizeMerchant("株式会社 ＡＭＡＺＯＮ")).toBe("amazon");
    expect(normalizeMerchant("スターバックス 新宿店")).toBe(
      normalizeMerchant("スターバックス"),
    );
    expect(normalizeMerchant("（株） セブン・イレブン")).toBe("セブンイレブン");
  });
  it.each([
    ["サイゼリヤ", "food-0"],
    ["セブン", "food-1"],
    ["スタバ", "food-3"],
    ["Amazon", "shopping-4"],
    ["JR", "transport-0"],
  ])("classifies %s with built-in keywords", (merchant, subcategoryId) => {
    expect(suggestCategory(merchant, [], defaultCategories)).toMatchObject({
      subcategoryId,
      confidence: "high",
      source: "keyword",
    });
  });
  it("user corrections override built-in suggestions on the next visit", () => {
    const rule = learnMerchantRule("サイゼリヤ", "social", "social-0")!;
    expect(
      suggestCategory("株式会社 サイゼリヤ", [rule], defaultCategories),
    ).toMatchObject({
      categoryId: "social",
      subcategoryId: "social-0",
      confidence: "high",
      source: "learned",
    });
    expect(
      learnMerchantRule("サイゼリヤ", "social", "social-0", rule)?.usageCount,
    ).toBe(2);
  });
  it("similarity suggests cautiously, unknown merchants remain unclassified", () => {
    const rule = learnMerchantRule("パティスリー青空", "food", "food-3")!;
    expect(
      suggestCategory("パティスリ青空", [rule], defaultCategories),
    ).toMatchObject({ confidence: "medium", source: "similar" });
    expect(suggestCategory("謎のお店", [], defaultCategories)).toMatchObject({
      categoryId: "uncategorized",
      confidence: "low",
    });
  });
  it("does not reuse archived or deleted categories", () => {
    const rule = learnMerchantRule("テスト", "food", "food-0")!;
    expect(
      suggestCategory(
        "テスト",
        [rule],
        defaultCategories.filter((category) => category.id !== "food"),
      ).confidence,
    ).toBe("low");
  });
  it.each([
    ["サイゼリヤ 1280", { merchant: "サイゼリヤ", amount: 1280 }],
    ["セブン ５６０", { merchant: "セブン", amount: 560 }],
    [
      "スタバ 680 クレカ",
      { merchant: "スタバ", amount: 680, paymentMethod: "creditCard" },
    ],
    ["Amazon ¥2,980", { merchant: "Amazon", amount: 2980 }],
  ])("parses quick entry %s", (input, expected) =>
    expect(parseQuickEntry(input)).toMatchObject(expected),
  );
  it("leaves failed amount parsing for normal input", () => {
    expect(parseQuickEntry("金額なし")).toEqual({
      merchant: "金額なし",
      paymentMethod: undefined,
    });
    expect(parseQuickEntry("テスト 0").amount).toBeUndefined();
  });
});
