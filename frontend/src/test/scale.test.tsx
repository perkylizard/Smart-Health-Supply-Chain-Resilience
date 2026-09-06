import { render, screen } from "@testing-library/react";
import Scale from "../components/Scale";
import { parseLocal } from "../components/ChatWidget";

test("scale shows icon and number, never colour alone", () => {
  render(<Scale days={5.4} severity="red" />);
  expect(screen.getByText(/▲ 5 d/)).toBeInTheDocument();
});

test("scale caps at 365+", () => {
  render(<Scale days={365} severity="ok" />);
  expect(screen.getByText(/365\+/)).toBeInTheDocument();
});

test("chat parser handles hinglish and hindi", () => {
  expect(parseLocal("ORS ke 40 packet bache hain, zinc khatam")).toEqual([{ commodity_id: "ors", quantity: 40 }, { commodity_id: "zinc_20mg", quantity: 0 }]);
  expect(parseLocal("ओआरएस बीस और जिंक दस")).toEqual([{ commodity_id: "ors", quantity: 20 }, { commodity_id: "zinc_20mg", quantity: 10 }]);
});
