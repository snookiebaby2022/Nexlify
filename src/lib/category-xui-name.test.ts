import assert from "node:assert/strict";
import test from "node:test";
import { formatXuiCategoryName, preferXuiCategoryName } from "./category-xui-name";

test("formatXuiCategoryName normalizes pipe spacing and region", () => {
  assert.equal(formatXuiCategoryName("UK| Entertainment"), "UK | Entertainment");
  assert.equal(formatXuiCategoryName("UK | Entertainment (HEVC)"), "UK | Entertainment (HEVC)");
  assert.equal(formatXuiCategoryName("us | fubo"), "US | fubo");
});

test("formatXuiCategoryName adds pipe from spaced region prefix", () => {
  assert.equal(formatXuiCategoryName("UK Entertainment"), "UK | Entertainment");
  assert.equal(formatXuiCategoryName("UK Channels +1"), "UK | Channels +1");
  assert.equal(formatXuiCategoryName("US Fubo"), "US | Fubo");
});

test("formatXuiCategoryName handles adult as XXX pipe", () => {
  assert.equal(formatXuiCategoryName("Adult Movies", { isAdult: true }), "XXX | Movies");
  assert.equal(formatXuiCategoryName("XXX"), "XXX |");
  assert.equal(formatXuiCategoryName("XXX |"), "XXX |");
});

test("formatXuiCategoryName infers UK sports brands", () => {
  assert.equal(formatXuiCategoryName("Sky Sports"), "UK | Sky Sports");
  assert.equal(formatXuiCategoryName("TNT Sports"), "UK | TNT Sports");
});

test("preferXuiCategoryName picks piped form", () => {
  assert.equal(preferXuiCategoryName("UK Entertainment", "UK | Entertainment"), "UK | Entertainment");
});
