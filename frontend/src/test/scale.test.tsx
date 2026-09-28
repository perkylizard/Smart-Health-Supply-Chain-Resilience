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
