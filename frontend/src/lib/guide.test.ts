import { describe, expect, it } from "vitest";
import { GUIDE, matchGuide } from "./guide";
import { suggestQuestions } from "./suggest";
import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";

describe("product guide matching", () => {
  it.each([
    ["What can you do?", "capabilities"],
    ["How do I use the 3D workbench?", "workbench"],
    ["How do I save a project?", "account"],
    ["can I speak my question?", "voice"],
    ["Is this legally approved?", "limits"],
    ["मैं हिंदी में कैसे पूछूँ?", "language"],
    ["hy", "greeting"],
    ["Hello!", "greeting"],
    ["hi there", "greeting"],
    ["नमस्ते", "greeting"],
    ["how are you", "greeting"],
    ["thank you", "thanks"],
    ["धन्यवाद", "thanks"],
    ["प्रोजेक्ट कैसे सहेजूँ?", "account"],
    ["3D वर्कबेंच कैसे इस्तेमाल करूँ?", "workbench"],
    ["I want to build a home from scratch so what I do", "journey"],
    ["how do I build a house", "journey"],
    ["मुझे नया घर बनाना है, क्या करूँ?", "journey"],
  ])("%s -> %s", (q, id) => expect(matchGuide(q)?.id).toBe(id));

  it("leaves regulation questions to the rules backend", () => {
    for (const q of ["What front open space applies on a 9 m road?", "Can I build a three-storey house on my 30 × 40 ft plot?", "What is the permission fee for a house?", "सामने की खुली जगह कितनी चाहिए?", "what is the capital of France", "hello, what front open space applies on a 9 m road in my plot?", ""]) {
      expect(matchGuide(q)).toBeNull();
    }
  });
  it("has English and Hindi text for every topic and step, and never states a rule number or limit", () => {
    const dig = (o: unknown, path: string[]): unknown => path.reduce<unknown>((a, k) => (a as Record<string, unknown> | undefined)?.[k], o);
    for (const g of GUIDE) {
      for (const lang of [en, hi]) {
        expect(typeof dig(lang, ["guide", g.id, "title"])).toBe("string");
        expect(typeof dig(lang, ["guide", g.id, "body"])).toBe("string");
        for (let i = 1; i <= g.steps; i++) expect(typeof dig(lang, ["guide", g.id, `s${i}`])).toBe("string");
      }
    }
  });
});

describe("suggested questions follow the inputs", () => {
  const base = { plotAreaDerived: false };
  it("is empty with no inputs and grows as inputs are entered", () => {
    expect(suggestQuestions(base)).toEqual([]);
    expect(suggestQuestions({ ...base, roadW: 9 }).map((s) => s.key)).toEqual(["wb.sg.front"]);
    const keys = suggestQuestions({ ...base, roadW: 9, plotAreaSqm: 200, plotW: 10, plotD: 20, floors: 3, builtUpSqm: 150 }).map((s) => s.key);
    expect(keys).toEqual(["wb.sg.floors", "wb.sg.front", "wb.sg.far", "wb.sg.rear"]);
  });
  it("puts the user's own numbers into the question", () => {
    expect(suggestQuestions({ ...base, plotAreaSqm: 111.4836 })[0]).toEqual({ key: "wb.sg.far", params: { area: "111.5" } });
  });
});
