import { render, screen } from "@testing-library/react";
import Scale from "../components/Scale";
import { parseLocal } from "../components/ChatWidget";
import { AppCtx, type Ctx } from "../App";
import { strings } from "../i18n";

const withApp = (ui: React.ReactElement) => render(<AppCtx.Provider value={{ t: strings.en } as unknown as Ctx}>{ui}</AppCtx.Provider>);

test("days of stock is a number with its meaning in words, never colour alone", () => {
  withApp(<Scale days={5.4} severity="red" />);
  expect(screen.getByText("5")).toBeInTheDocument();
  expect(screen.getByText("under a week left")).toBeInTheDocument();
});

test("zero days reads as stocked out, and 365 caps at 365+", () => {
  withApp(<Scale days={0} severity="red" />);
  expect(screen.getByText("stocked out")).toBeInTheDocument();
  withApp(<Scale days={365} severity="ok" />);
  expect(screen.getByText(/365\+/)).toBeInTheDocument();
});

test("chat parser handles hinglish and hindi", () => {
  expect(parseLocal("ORS ke 40 packet bache hain, zinc khatam")).toEqual([{ commodity_id: "ors", quantity: 40 }, { commodity_id: "zinc_20mg", quantity: 0 }]);
  expect(parseLocal("ओआरएस बीस और जिंक दस")).toEqual([{ commodity_id: "ors", quantity: 20 }, { commodity_id: "zinc_20mg", quantity: 10 }]);
});

test("the local parser knows every medicine in the facility's own list", () => {
  const names = { amlodipine_5: "Amlodipine 5 mg tablet", metformin_500: "Metformin 500 mg tablet", ifa_adult: "Iron folic acid tablet (adult)", ors: "ORS sachet (WHO low-osmolarity)" };
  expect(parseLocal("Amlodipine 5 mg tablet, khtm", names)).toEqual([{ commodity_id: "amlodipine_5", quantity: 0 }]);
  expect(parseLocal("amlodipine 5 mg 40 bache hain", names)).toEqual([{ commodity_id: "amlodipine_5", quantity: 40 }]);
  expect(parseLocal("metfor 120, ORS khatam", names)).toEqual([{ commodity_id: "metformin_500", quantity: 120 }, { commodity_id: "ors", quantity: 0 }]);
  expect(parseLocal("amlodipine", names)).toEqual([]);  // no quantity, not a count
});

test("a formula word matching several products asks which one instead of guessing", () => {
  const names = { ifa_adult: "Iron folic acid tablet (adult)", ifa_blue: "IFA blue (adolescent)", ifa_pink: "IFA pink (junior 6-10)", ifa_syrup: "IFA syrup (paediatric)",
    zinc_20mg: "Zinc 20 mg dispersible tablet", ad_01: "AD syringe 0.1 ml", ad_05: "AD syringe 0.5 ml", ns: "IV fluid normal saline 500 ml", rl: "IV fluid Ringer lactate 500 ml" };
  const ifa = parseLocal("IFA 30 bache hain", names)[0];
  expect(ifa.commodity_id).toBe(""); expect(ifa.options?.length).toBe(4); expect(ifa.quantity).toBe(30);
  expect(parseLocal("IFA syrup 12", names)).toEqual([{ commodity_id: "ifa_syrup", quantity: 12 }]);
  expect(parseLocal("zinc khatam", names)).toEqual([{ commodity_id: "zinc_20mg", quantity: 0 }]);  // only one zinc product: no question
  expect(parseLocal("AD syringe 0.5 ml 100", names)).toEqual([{ commodity_id: "ad_05", quantity: 100 }]);
  expect(parseLocal("normal saline 20", names)).toEqual([{ commodity_id: "ns", quantity: 20 }]);
  expect(parseLocal("IV fluid 20", names)[0].options?.sort()).toEqual(["ns", "rl"]);
});

test("'given' lines lower the stock instead of counting it", () => {
  const names = { ors: "ORS sachet (WHO low-osmolarity)", zinc_20mg: "Zinc 20 mg dispersible tablet" };
  expect(parseLocal("ORS 2 diye", names)).toEqual([{ commodity_id: "ors", quantity: 2, give: true }]);
  expect(parseLocal("zinc 20 mg 3 given", names)).toEqual([{ commodity_id: "zinc_20mg", quantity: 3, give: true }]);
  expect(parseLocal("ORS ke 40 packet bache hain", names)).toEqual([{ commodity_id: "ors", quantity: 40 }]);  // still a count
  expect(parseLocal("zinc khatam", names)).toEqual([{ commodity_id: "zinc_20mg", quantity: 0 }]);
});
